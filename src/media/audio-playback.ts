// Schedules decoded audio onto the shared AudioContext — the real playback mechanism,
// replacing any native <audio>/<video> element. A clip's sound is real Web Audio
// AudioBufferSourceNodes, scheduled ahead of the play head via mediabunny's AudioBufferSink,
// on the same context every other clip uses.
//
// Known simplification vs. @remotion/media's audioIteratorManager: volume is sampled once
// per decoded chunk (~10-20ms of audio) rather than automated continuously, and there's no
// nonce/anchor system for canceling a stale reschedule mid-flight — restarting playback
// (see use-scheduled-audio.ts) simply stops every currently-scheduled node first.
import type { AudioBufferSink } from 'mediabunny';
import { getSharedAudioContext } from './audio-context';

export interface AudioPlaybackHandle {
  stop(): void;
}

export interface StartAudioPlaybackOptions {
  sink: AudioBufferSink;
  /** media time (seconds) to start playback from. */
  startSeconds: number;
  /** media time (seconds) at which this clip's audible span ends. */
  endSeconds: number;
  /** media time (seconds) to wrap back to when looping. */
  loopStartSeconds: number;
  loop: boolean;
  playbackRate: number;
  /** sampled once per scheduled chunk, given that chunk's media timestamp. */
  getVolume: (mediaSeconds: number) => number;
}

/** How far ahead of the play head we allow scheduling to run before pausing the decode
 *  loop — long clips shouldn't have their entire runtime decoded and queued instantly. */
const LOOKAHEAD_SECONDS = 1;

export function startAudioPlayback({
  sink,
  startSeconds,
  endSeconds,
  loopStartSeconds,
  loop,
  playbackRate,
  getVolume,
}: StartAudioPlaybackOptions): AudioPlaybackHandle {
  const { audioContext, masterGain } = getSharedAudioContext();
  let stopped = false;
  const activeNodes = new Set<AudioBufferSourceNode>();

  const run = async (): Promise<void> => {
    let mediaCursor = startSeconds;
    let contextCursor = audioContext.currentTime;

    while (!stopped) {
      const passStart = mediaCursor;

      for await (const wrapped of sink.buffers(mediaCursor, endSeconds)) {
        if (stopped) return;

        const node = audioContext.createBufferSource();
        node.buffer = wrapped.buffer;
        node.playbackRate.value = playbackRate;
        const gain = audioContext.createGain();
        gain.gain.value = getVolume(wrapped.timestamp);
        node.connect(gain).connect(masterGain);

        const when = contextCursor + (wrapped.timestamp - passStart) / playbackRate;
        node.start(Math.max(when, audioContext.currentTime));
        activeNodes.add(node);
        node.addEventListener('ended', () => activeNodes.delete(node));

        const scheduledAheadBy = when - audioContext.currentTime;
        if (scheduledAheadBy > LOOKAHEAD_SECONDS) {
          await new Promise((resolve) => setTimeout(resolve, (scheduledAheadBy - LOOKAHEAD_SECONDS) * 1000));
          if (stopped) return;
        }
      }

      if (!loop) break;
      contextCursor += (endSeconds - passStart) / playbackRate;
      mediaCursor = loopStartSeconds;
    }
  };

  run().catch(() => {
    // Playback was stopped mid-decode, or the sink's Input was disposed from under it —
    // either way there's nothing left to schedule.
  });

  return {
    stop() {
      stopped = true;
      for (const node of activeNodes) {
        try {
          node.stop();
        } catch {
          // already ended
        }
      }
      activeNodes.clear();
    },
  };
}
