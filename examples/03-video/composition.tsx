// Tier 3 — a real video with a Ken Burns push and a backdrop-filter caption
// (arbitrary CSS). This is the kind of short-form composition remover targets.
import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile } from 'remotion';

export function VideoCard(): JSX.Element {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames - 1], [1, 1.12]);
  const pop = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Video src={staticFile('demo-clip.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 180 }}>
        <div
          style={{
            transform: `translateY(${interpolate(pop, [0, 1], [44, 0])}px)`,
            opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' }),
            padding: '18px 34px',
            borderRadius: 22,
            color: '#fff',
            fontSize: 64,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
            background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          real DOM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
