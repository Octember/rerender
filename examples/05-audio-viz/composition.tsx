// Tier 5 — an audio waveform visualizer. Uses @remotion/media-utils (ecosystem,
// not implemented). The compat tool should flag the package + its exports.
import { AbsoluteFill, Audio, useCurrentFrame, staticFile } from 'remotion';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';

export function AudioViz(): JSX.Element {
  const frame = useCurrentFrame();
  const audioData = useAudioData(staticFile('music.mp3'));
  const bars = audioData ? visualizeAudio({ audioData, frame, fps: 30, numberOfSamples: 32 }) : [];
  return (
    <AbsoluteFill style={{ background: '#0e1116', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 80 }}>
      <Audio src={staticFile('music.mp3')} />
      {bars.map((v: number, i: number) => (
        <div key={i} style={{ flex: 1, height: `${Math.max(2, v * 800)}px`, background: '#ff2e63', borderRadius: 4 }} />
      ))}
    </AbsoluteFill>
  );
}
