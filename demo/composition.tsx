// A composition written exactly like a Remotion one — `from 'remotion'`, arbitrary
// CSS — but it runs on remover (the import is aliased). This is the drop-in proof.
import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile } from 'remotion';

export function Demo(): JSX.Element {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const end = durationInFrames - 1;

  const scale = interpolate(frame, [0, end], [1, 1.12]); // Ken Burns
  const pop = spring({ frame, fps, config: { damping: 12 } }); // spring pop-in
  const capY = interpolate(pop, [0, 1], [44, 0]);
  const capScale = interpolate(pop, [0, 1], [0.9, 1]);
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Video src={staticFile('demo-clip.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 180 }}>
        <div
          style={{
            transform: `translateY(${capY}px) scale(${capScale})`,
            opacity,
            padding: '18px 34px',
            borderRadius: 22,
            color: '#fff',
            fontSize: 64,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
            background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          real DOM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
