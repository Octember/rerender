// Tier 1 — a title card that fades in and out. The simplest possible composition.
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export function Title(): JSX.Element {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, 70, 90], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ background: '#0e1116', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ color: '#fff', fontSize: 96, fontFamily: 'system-ui, sans-serif', opacity }}>Hello, remover</h1>
    </AbsoluteFill>
  );
}
