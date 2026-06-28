// A composition in the Remotion API — but it's real DOM, so arbitrary CSS
// (backdrop-filter, etc.) just works. This same DOM is what the recorder records.
import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig, interpolate, Easing } from '../src';

export function Demo(): JSX.Element {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const end = durationInFrames - 1;

  const scale = interpolate(frame, [0, end], [1, 1.12]); // Ken Burns
  const capY = interpolate(frame, [0, 14], [40, 0], { extrapolateRight: 'clamp', easing: Easing.cubicOut });
  const opacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Video src="/demo-clip.mp4" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 180 }}>
        <div
          style={{
            transform: `translateY(${capY}px)`,
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
