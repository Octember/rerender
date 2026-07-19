// One mediabunny CanvasSink per src, shared (and refcounted, alongside the src's Input)
// across every <Video> mounted on it — mirrors @remotion/media's get-sink.ts. CanvasSink
// owns keyframe/GOP bookkeeping and the VideoDecoder internally; getCanvas(timestamp) is
// genuine random access, so there's no GOP-grouping or frame-cache layer to build on top.
import { CanvasSink } from 'mediabunny';
import { acquireInput, releaseInput } from './shared-input';

export type VideoSinkResult = { type: 'success'; sink: CanvasSink } | { type: 'no-video-track' } | { type: 'cannot-decode' };

interface SinkEntry {
  promise: Promise<VideoSinkResult>;
  refCount: number;
}

const sinks = new Map<string, SinkEntry>();

const resolve = async (src: string): Promise<VideoSinkResult> => {
  const input = acquireInput(src);
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) return { type: 'no-video-track' };
  if (!(await videoTrack.canDecode())) return { type: 'cannot-decode' };
  return { type: 'success', sink: new CanvasSink(videoTrack, { poolSize: 3 }) };
};

/** Cached and refcounted by src; every caller shares the same sink (and decode). Pair every
 *  call with releaseVideoSink once, even if the returned promise rejects or resolves to a
 *  non-success variant — acquireInput was still made and needs releasing either way. */
export function acquireVideoSink(src: string): Promise<VideoSinkResult> {
  const existing = sinks.get(src);
  if (existing) {
    existing.refCount++;
    return existing.promise;
  }

  const promise = resolve(src);
  sinks.set(src, { promise, refCount: 1 });
  return promise;
}

export function releaseVideoSink(src: string): void {
  const entry = sinks.get(src);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    sinks.delete(src);
    releaseInput(src);
  }
}
