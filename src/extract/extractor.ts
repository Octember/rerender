// Frame extraction: requested seconds → GOP byte ranges → VideoDecoder → VideoFrames.
// One decoder pass per GOP; samples are fed in decode (= file) order and matched to
// requested timestamps by presentation time. Never mutates the caller's timestamp array;
// out-of-range timestamps clamp; every requested timestamp gets exactly one frame callback.

import { parseSampleTable, type SampleTable } from './mp4-sample-table';
import { createUrlSource, type RangeSource } from './source';

export interface FrameExtractorOptions {
  src: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Max GOP fetches in flight per extract() call. */
  maxParallelFetches?: number;
}

export type OnFrame = (frame: VideoFrame, requestedSeconds: number) => void;

export interface FrameExtractor {
  readonly sampleTable: SampleTable;
  /**
   * Decodes the frame nearest each requested timestamp and delivers it via `onFrame`.
   * Frames arrive as they decode (not in request order); the receiver owns each frame
   * and must `close()` it. Resolves when every requested timestamp has been delivered.
   */
  extract(timestampsInSeconds: readonly number[], onFrame: OnFrame): Promise<void>;
  /** Aborts in-flight work. The extractor is unusable afterwards. */
  dispose(): void;
}

const MICROSECONDS = 1_000_000;

/** Index of the last element <= target in a sorted ascending array-like, or 0. */
function lastAtOrBefore(sorted: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

interface GopJob {
  gopIndex: number;
  /** requested seconds grouped into this GOP, each resolved to a sample's presentation µs */
  targets: { requestedSeconds: number; presentationMicros: number }[];
}

export async function createFrameExtractor(options: FrameExtractorOptions): Promise<FrameExtractor> {
  const abort = new AbortController();
  const source: RangeSource = createUrlSource(options.src, options.fetchFn);
  const table = parseSampleTable(await source.readThroughMoov(abort.signal));
  const { presentationTicks, byteOffsets, byteSizes, keySampleIndices, timescale } = table;
  const maxParallel = options.maxParallelFetches ?? 4;

  // Presentation ticks of each GOP's keyframe — ascending, used to route a timestamp to its GOP.
  const gopStartTicks = new Float64Array(keySampleIndices.length);
  for (let i = 0; i < keySampleIndices.length; i++) gopStartTicks[i] = presentationTicks[keySampleIndices[i]!]!;
  const lastTicks = presentationTicks[table.sampleCount - 1]!;

  const toMicros = (ticks: number) => Math.round((ticks / timescale) * MICROSECONDS);

  const nearestSampleInGop = (gopIndex: number, targetTicks: number): number => {
    const first = keySampleIndices[gopIndex]!;
    const end = gopIndex + 1 < keySampleIndices.length ? keySampleIndices[gopIndex + 1]! : table.sampleCount;
    let best = first;
    for (let i = first; i < end; i++) {
      if (Math.abs(presentationTicks[i]! - targetTicks) < Math.abs(presentationTicks[best]! - targetTicks)) best = i;
    }
    return best;
  };

  const decodeGop = async (job: GopJob, onFrame: OnFrame): Promise<void> => {
    const first = keySampleIndices[job.gopIndex]!;
    const end = job.gopIndex + 1 < keySampleIndices.length ? keySampleIndices[job.gopIndex + 1]! : table.sampleCount;
    const rangeStart = byteOffsets[first]!;
    const rangeEnd = byteOffsets[end - 1]! + byteSizes[end - 1]!;
    const bytes = await source.read(rangeStart, rangeEnd, abort.signal);

    // presentation µs → requested seconds still waiting on that frame
    const wanted = new Map<number, number[]>();
    for (const target of job.targets) {
      const list = wanted.get(target.presentationMicros) ?? [];
      list.push(target.requestedSeconds);
      wanted.set(target.presentationMicros, list);
    }

    let removeAbortListener: () => void = () => undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const decoder = new VideoDecoder({
          output: (frame) => {
            const requesters = wanted.get(frame.timestamp);
            if (!requesters) {
              frame.close();
              return;
            }
            wanted.delete(frame.timestamp);
            for (let i = 0; i < requesters.length; i++) {
              // Last requester gets the frame itself; earlier ones get clones. Receiver closes all.
              onFrame(i === requesters.length - 1 ? frame : frame.clone(), requesters[i]!);
            }
            if (wanted.size === 0) resolve();
          },
          error: reject,
        });
        const onAbort = () => reject(new Error('frame extractor disposed'));
        abort.signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => abort.signal.removeEventListener('abort', onAbort);
        decoder.configure({ codec: table.codec, description: table.description });
        for (let i = first; i < end; i++) {
          decoder.decode(
            new EncodedVideoChunk({
              type: i === first ? 'key' : 'delta',
              timestamp: toMicros(presentationTicks[i]!),
              data: bytes.subarray(byteOffsets[i]! - rangeStart, byteOffsets[i]! - rangeStart + byteSizes[i]!),
            }),
          );
        }
        decoder
          .flush()
          .then(() => {
            if (wanted.size > 0) reject(new Error(`decoder flushed with ${wanted.size} requested timestamps undelivered`));
          }, reject)
          .finally(() => {
            try {
              decoder.close();
            } catch {
              // already closed by an error path
            }
          });
      });
    } finally {
      removeAbortListener();
    }
  };

  const extract: FrameExtractor['extract'] = async (timestampsInSeconds, onFrame) => {
    if (abort.signal.aborted) throw new Error('frame extractor disposed');
    const byGop = new Map<number, GopJob>();
    for (const seconds of timestampsInSeconds) {
      const targetTicks = Math.min(Math.max(seconds * timescale, gopStartTicks[0]!), lastTicks);
      const gopIndex = lastAtOrBefore(gopStartTicks, targetTicks);
      const sample = nearestSampleInGop(gopIndex, targetTicks);
      const job = byGop.get(gopIndex) ?? { gopIndex, targets: [] };
      job.targets.push({ requestedSeconds: seconds, presentationMicros: toMicros(presentationTicks[sample]!) });
      byGop.set(gopIndex, job);
    }

    // Bounded parallelism without a scheduler dependency: N workers draining a shared queue.
    const queue = Array.from(byGop.values());
    const workers = Array.from({ length: Math.min(maxParallel, queue.length) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await decodeGop(job, onFrame);
    });
    await Promise.all(workers);
  };

  return {
    sampleTable: table,
    extract,
    dispose: () => abort.abort(),
  };
}
