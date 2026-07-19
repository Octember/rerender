// One AudioContext + master GainNode for the whole page — mirrors @remotion/media's
// SharedAudioContextForMediaPlayer. Every scheduled clip's audio routes through this same
// context, so their clocks never drift relative to each other.
export interface SharedAudioContext {
  audioContext: AudioContext;
  masterGain: GainNode;
}

let shared: SharedAudioContext | null = null;

export function getSharedAudioContext(): SharedAudioContext {
  if (!shared) {
    const audioContext = new AudioContext();
    const masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    shared = { audioContext, masterGain };
  }

  // Autoplay policy suspends a freshly-created context until a user gesture; resume() is a
  // no-op once already running, so calling it redundantly on every playback start is safe.
  void shared.audioContext.resume().catch(() => undefined);
  return shared;
}
