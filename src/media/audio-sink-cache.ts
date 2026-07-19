// The audio-side twin of video-sink-cache.ts: one mediabunny AudioBufferSink per src,
// shared and refcounted alongside the src's Input. AudioBufferSink hands back real
// Web Audio `AudioBuffer`s, ready to schedule on an AudioBufferSourceNode directly.
import { AudioBufferSink } from 'mediabunny';
import { acquireInput, releaseInput } from './shared-input';

export type AudioSinkResult = { type: 'success'; sink: AudioBufferSink } | { type: 'no-audio-track' } | { type: 'cannot-decode' };

interface SinkEntry {
  promise: Promise<AudioSinkResult>;
  refCount: number;
}

const sinks = new Map<string, SinkEntry>();

const resolve = async (src: string): Promise<AudioSinkResult> => {
  const input = acquireInput(src);
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!audioTrack) return { type: 'no-audio-track' };
  if (!(await audioTrack.canDecode())) return { type: 'cannot-decode' };
  return { type: 'success', sink: new AudioBufferSink(audioTrack) };
};

/** Cached and refcounted by src. Pair every call with releaseAudioSink once. */
export function acquireAudioSink(src: string): Promise<AudioSinkResult> {
  const existing = sinks.get(src);
  if (existing) {
    existing.refCount++;
    return existing.promise;
  }

  const promise = resolve(src);
  sinks.set(src, { promise, refCount: 1 });
  return promise;
}

export function releaseAudioSink(src: string): void {
  const entry = sinks.get(src);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    sinks.delete(src);
    releaseInput(src);
  }
}
