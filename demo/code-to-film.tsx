// "You already know this." Start from the most familiar thing on the web — a div with a border —
// and add ONE CSS property at a time (border-radius → rotate → box-shadow → gradient), each line
// appearing in the source AND visibly transforming the square live. Then it comes alive, the
// <Video> bursts in, and it compounds into a full film: the point being that the polished video
// is the same DOM + CSS you were just reading. Every visual is real DOM; the footage is the one
// <Video>, kept bottom-layer so the in-browser export composites it (and the lib de-overlays it).
import { AbsoluteFill, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from '../src';

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const STR = '#98c379';

// the source builds up line by line; each line maps to a property that transforms the square
const LINES: { f: number; t: string }[] = [
  { f: 6, t: '<div style={{' },
  { f: 20, t: '  width: 200, height: 200,' },
  { f: 26, t: "  border: '3px solid #ff5e8a'," },
  { f: 44, t: '  borderRadius: 32,' },
  { f: 62, t: "  transform: 'rotate(-12deg)'," },
  { f: 80, t: "  boxShadow: '0 30px 80px #ff5e8a66'," },
  { f: 98, t: "  background: 'linear-gradient(135deg," },
  { f: 102, t: "    #ff5e8a, #ffb24a)'," },
  { f: 116, t: '}} />' },
];

function CodeLine({ text }: { text: string }): JSX.Element {
  return (
    <div style={{ fontFamily: MONO, fontSize: 17, lineHeight: 1.6, color: '#9aa4b2', whiteSpace: 'pre' }}>{highlightStrings(text)}</div>
  );
}

function highlightStrings(text: string): JSX.Element[] {
  return text.split(/('[^']*')/g).map((p, i) => (
    <span key={`${p}-${i}`} style={p.startsWith("'") ? { color: STR } : undefined}>
      {p}
    </span>
  ));
}

export function CodeToFilm(): JSX.Element {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const last = durationInFrames - 1;
  const ph = frame / fps;
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const key = (pts: number[], vals: number[]): number => interpolate(frame, pts, vals, clamp);
  const seg = (a: number, b: number, from = 0, to = 1): number => interpolate(frame, [a, b], [from, to], clamp);

  // ── the hero square, built one property at a time ──
  const sqScale = Math.max(0, spring({ frame: frame - 18, fps, config: { damping: 14, stiffness: 120 } }));
  const borderA = seg(22, 32); // border draws on
  const br = key([44, 60], [2, 32]); // corners round
  const rot = key([62, 80], [0, -12]) + key([150, last], [0, -8]); // tilts, then drifts in the film
  const shadow = seg(80, 96); // shadow blooms
  const bgFade = seg(98, 120); // gradient fills in
  // build done ~f120 → it comes alive (grows) → drifts to a corner as the film takes over
  const sqX = key([120, 158], [900, 196]);
  const sqY = key([120, 158], [360, 168]);
  const sqGrow = key([120, 140, 158], [1, 1.18, 0.62]);
  const sqOpacity = key([150, 170], [1, 0.9]);

  const codeOp = seg(8, 18) * seg(126, 146, 1, 0); // panel fades once the square is built
  const codeX = key([126, 150], [0, -70]);

  // ── the film ── footage bursts in as the base layer; trimBefore offsets the source so its ~2s
  // on screen stays inside the 4s clip (the comp is longer than the clip).
  const vIn = Math.max(0, spring({ frame: frame - 150, fps, config: { damping: 16, stiffness: 85 } }));
  const vScale = vIn * key([196, last], [1, 1.12]);
  const gradeHue = key([165, last], [330, 268]);
  const titleIn = seg(180, 198);

  return (
    <AbsoluteFill style={{ fontFamily: SANS, overflow: 'hidden' }}>
      {/* FOOTAGE — bottom layer */}
      <AbsoluteFill style={{ transform: `scale(${vScale})`, overflow: 'hidden' }}>
        <Video src={staticFile('demo-clip.mp4')} trimBefore={-150} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* color grade over the footage */}
      <AbsoluteFill
        style={{
          opacity: seg(160, 200) * 0.34,
          background: `linear-gradient(120deg, hsla(${gradeHue},85%,55%,0.6) 0%, transparent 55%, hsla(${gradeHue - 70},85%,52%,0.5) 100%)`,
        }}
      />

      {/* extra glows that pile in as it "gets complicated" */}
      <div
        style={{
          position: 'absolute',
          left: 1080 + Math.sin(ph * 0.6) * 40,
          top: 150,
          width: 460,
          height: 460,
          transform: 'translate(-50%,-50%)',
          opacity: seg(150, 185) * 0.75,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 38% 32%, hsla(38,100%,68%,0.9), transparent 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 160 + Math.cos(ph * 0.5) * 36,
          top: 600,
          width: 520,
          height: 520,
          transform: 'translate(-50%,-50%)',
          opacity: seg(158, 192) * 0.7,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, hsla(262,95%,66%,0.9), transparent 68%)',
        }}
      />

      {/* THE HERO SQUARE — a div with a border, then +radius +rotate +shadow +gradient */}
      <div
        style={{
          position: 'absolute',
          left: sqX,
          top: sqY,
          width: 200,
          height: 200,
          marginLeft: -100,
          marginTop: -100,
          transform: `rotate(${rot}deg) scale(${sqScale * sqGrow})`,
          borderRadius: br,
          border: `3px solid rgba(255,94,138,${borderA})`,
          boxShadow: `0 30px 80px rgba(255,94,138,${shadow * 0.45})`,
          opacity: sqOpacity,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: br,
            background: 'linear-gradient(135deg,#ff5e8a,#ffb24a)',
            opacity: bgFade,
          }}
        />
      </div>

      {/* THE SOURCE — builds up line by line on the left, mirroring the square */}
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 196,
          transform: `translateX(${codeX}px)`,
          opacity: codeOp,
          background: 'rgba(9,10,17,0.8)',
          borderRadius: 14,
          padding: '22px 26px',
          border: '1px solid #24242f',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
        }}
      >
        {LINES.map((ln) => {
          const o = seg(ln.f, ln.f + 8);
          const fresh = frame >= ln.f && frame < ln.f + 20;
          return (
            <div
              key={ln.t}
              style={{
                opacity: o,
                transform: `translateX(${interpolate(o, [0, 1], [10, 0])}px)`,
                background: fresh ? 'rgba(255,94,138,0.14)' : 'transparent',
                borderRadius: 5,
                margin: '0 -6px',
                padding: '0 6px',
              }}
            >
              <CodeLine text={ln.t} />
            </div>
          );
        })}
      </div>

      {/* header that frames the moment */}
      <div style={{ position: 'absolute', top: 96, left: 0, width: '100%', textAlign: 'center' }}>
        <div style={{ opacity: seg(2, 14) * seg(126, 142, 1, 0), fontFamily: MONO, fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>
          {'// you already know this one'}
        </div>
      </div>

      {/* THE PUNCHLINE */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 92, opacity: titleIn }}>
        <div style={{ transform: `translateY(${interpolate(titleIn, [0, 1], [26, 0])}px)`, textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 15, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, marginBottom: 12 }}>
            {'// border, radius, rotate, shadow, gradient…'}
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 850,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: '#fff',
              textShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}
          >
            You already know CSS.
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 850,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              background: 'linear-gradient(90deg,#ff5e8a,#ffa14a)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            It&rsquo;s also a full video.
          </div>
        </div>
      </AbsoluteFill>

      {/* frame HUD — ticks identically in the preview AND the exported mp4 */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          right: 28,
          fontFamily: MONO,
          fontSize: 16,
          color: 'rgba(255,255,255,0.9)',
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 9,
          padding: '6px 12px',
          letterSpacing: 1,
        }}
      >
        frame {String(Math.floor(frame)).padStart(3, '0')} / {last}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 4,
          width: `${(frame / last) * 100}%`,
          background: 'linear-gradient(90deg,#ff5e8a,#a64bf4,#2bd2ff)',
        }}
      />
    </AbsoluteFill>
  );
}
