// One mediabunny `Input` per src, shared and refcounted — mirrors @remotion/media's
// get-shared-input.ts. A <Video> and a separate <Audio> pointing at the same file (or the
// same <Video> re-mounted across a jump cut) share one container parse and one warm byte
// cache instead of each demuxing the file from scratch.
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';

interface InputEntry {
  input: Input;
  refCount: number;
  /** computeDuration() examines every track and is worth paying for at most once per
   *  Input, not once per <Video>/<Audio> instance that wants it (loop needs it). */
  durationSeconds: Promise<number> | null;
}

const inputs = new Map<string, InputEntry>();

export function acquireInput(src: string): Input {
  const existing = inputs.get(src);
  if (existing) {
    existing.refCount++;
    return existing.input;
  }

  const input = new Input({ source: new UrlSource(src), formats: ALL_FORMATS });
  inputs.set(src, { input, refCount: 1, durationSeconds: null });
  return input;
}

export function releaseInput(src: string): void {
  const entry = inputs.get(src);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    inputs.delete(src);
    entry.input.dispose();
  }
}

export function getSharedDurationSeconds(src: string): Promise<number> | null {
  const entry = inputs.get(src);
  if (!entry) return null;
  entry.durationSeconds ??= entry.input.computeDuration();
  return entry.durationSeconds;
}
