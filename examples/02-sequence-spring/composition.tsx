// Tier 2 — two timed Sequences, each with a spring pop-in.
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

function Card({ label, color }: { label: string; color: string }): JSX.Element {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
          opacity: s,
          background: color,
          color: '#fff',
          padding: '40px 80px',
          borderRadius: 24,
          fontSize: 80,
          fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
}

export function Cards(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0e1116' }}>
      <Sequence durationInFrames={45}>
        <Card label="one" color="#ff2e63" />
      </Sequence>
      <Sequence from={45} durationInFrames={45}>
        <Card label="two" color="#5b8cff" />
      </Sequence>
    </AbsoluteFill>
  );
}
