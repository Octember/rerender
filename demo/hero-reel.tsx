// The flagship composition for the in-browser export showcase. Written with only CSS the
// foreignObject capture can reproduce (gradients, transforms, opacity, text) — deliberately
// NO backdrop-filter — so the exported mp4 is pixel-identical to the live preview. The frame
// counter HUD is the proof anchor: it ticks in lockstep in the preview AND the exported file.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from '../src';

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const WORDS = ['real', 'DOM', '→', 'mp4'];
const CHIPS = ['WebCodecs', 'mediabunny', 'foreignObject'];

function Orb({ x, y, size, hue }: { x: number; y: number; size: number; hue: number }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, hsla(${hue},92%,68%,0.85), hsla(${hue},92%,55%,0) 70%)`,
      }}
    />
  );
}

export function HeroReel(): JSX.Element {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const last = durationInFrames - 1;
  const t = frame / last;

  const angle = interpolate(frame, [0, last], [125, 185]);
  const hueA = interpolate(frame, [0, last], [268, 322]);
  const hueB = interpolate(frame, [0, last], [212, 268]);
  const ph = frame / fps;

  const pop = (delay: number): number => spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 120 } });
  const subO = interpolate(frame, [18, 32], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, hsl(${hueA},48%,8%), hsl(${hueB},58%,13%))`,
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      <Orb x={width * 0.8 + Math.sin(ph * 0.6) * 60} y={height * 0.28 + Math.cos(ph * 0.5) * 44} size={380} hue={332} />
      <Orb x={width * 0.16 + Math.sin(ph * 0.5 + 2) * 70} y={height * 0.74 + Math.cos(ph * 0.45 + 1) * 40} size={440} hue={264} />
      <Orb x={width * 0.56 + Math.sin(ph * 0.7 + 4) * 50} y={height * 0.12 + Math.cos(ph * 0.6 + 3) * 30} size={260} hue={200} />

      {/* the proof anchor */}
      <div
        style={{
          position: 'absolute',
          top: 28,
          right: 32,
          fontFamily: MONO,
          fontSize: 18,
          color: 'rgba(255,255,255,0.88)',
          background: 'rgba(0,0,0,0.34)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 10,
          padding: '8px 14px',
          letterSpacing: 1,
        }}
      >
        frame {String(frame).padStart(3, '0')} / {last}
      </div>

      <AbsoluteFill style={{ alignItems: 'flex-start', justifyContent: 'center', padding: '0 86px' }}>
        <div style={{ display: 'flex', gap: 26, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {WORDS.map((w, i) => {
            const s = pop(i * 6);
            return (
              <span
                key={w}
                style={{
                  display: 'inline-block',
                  transform: `translateY(${interpolate(s, [0, 1], [64, 0])}px) scale(${interpolate(s, [0, 1], [0.8, 1])})`,
                  opacity: interpolate(s, [0, 1], [0, 1]),
                  fontSize: w === '→' ? 80 : 108,
                  fontWeight: 850,
                  lineHeight: 1,
                  color: w === 'mp4' ? '#ff6f9d' : '#fff',
                  textShadow: w === 'mp4' ? '0 10px 60px rgba(255,94,138,0.6)' : 'none',
                }}
              >
                {w}
              </span>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 27,
            color: 'rgba(255,255,255,0.66)',
            opacity: subO,
            transform: `translateY(${interpolate(subO, [0, 1], [18, 0])}px)`,
          }}
        >
          encoded in your browser — no server, no ffmpeg
        </div>

        <div style={{ marginTop: 34, display: 'flex', gap: 12 }}>
          {CHIPS.map((c, i) => {
            const o = interpolate(frame, [34 + i * 5, 46 + i * 5], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <span
                key={c}
                style={{
                  opacity: o,
                  transform: `translateY(${interpolate(o, [0, 1], [14, 0])}px)`,
                  fontFamily: MONO,
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.82)',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: 999,
                  padding: '7px 16px',
                }}
              >
                {c}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 6,
          width: `${t * 100}%`,
          background: 'linear-gradient(90deg,#ff5e8a,#ffa14a)',
        }}
      />
    </AbsoluteFill>
  );
}
