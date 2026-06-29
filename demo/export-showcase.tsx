// The in-browser export showcase. A composition plays live in the <Player>; one click
// frame-steps it, captures each frame from the real DOM, and encodes an mp4 — entirely in
// this tab (WebCodecs + mediabunny, no server, no ffmpeg). The exported file is then shown
// side-by-side with the live preview: same frame counter ticking in both, one a React tree,
// one a decoded .mp4. Network requests during the export are measured live — and it's 0.
import { type ComponentType, type CSSProperties, useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '../src';
import { exportToMp4 } from '../src/client/export';
import { HeroReel } from './hero-reel';

const W = 1280;
const H = 720;
const FPS = 30;
const DUR = 90;
const ACCENT = '#ff5e8a';
const DISPLAY_W = 468;
const DISPLAY_H = (DISPLAY_W * H) / W;

const card: CSSProperties = { background: '#0f0f15', border: '1px solid #23232c', borderRadius: 14, overflow: 'hidden' };
const cardLabel: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: 1.5,
  color: '#8a8a99',
  padding: '10px 14px',
  borderBottom: '1px solid #1d1d25',
  display: 'flex',
  justifyContent: 'space-between',
};

function Badge({ icon, children }: { icon: string; children: React.ReactNode }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: '#16161d',
        border: '1px solid #26262e',
        borderRadius: 999,
        padding: '7px 14px',
        fontSize: 13,
        color: '#cfcfd8',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {children}
    </span>
  );
}

export function ExportShowcase(): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [pct, setPct] = useState(0);
  const [frameNo, setFrameNo] = useState(0);
  const [strip, setStrip] = useState<string[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ secs: string; size: string; reqs: number } | null>(null);
  const [err, setErr] = useState('');
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<PlayerRef>(null);

  // autoplay the live preview (drives it through the imperative PlayerRef) + revoke old URLs
  useEffect(() => {
    player.current?.play();
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  async function run(): Promise<void> {
    setStatus('running');
    setPct(0);
    setFrameNo(0);
    setStrip([]);
    setUrl(null);
    setErr('');
    const thumbs: string[] = [];
    const reqBefore = performance.getEntriesByType('resource').length;
    const t0 = performance.now();
    try {
      const blob = await exportToMp4({
        Component: HeroReel as ComponentType<Record<string, unknown>>,
        config: { width: W, height: H, fps: FPS, durationInFrames: DUR },
        onProgress: (done) => {
          setPct(Math.round((done / DUR) * 100));
          setFrameNo(done);
        },
        onFrame: (canvas, f) => {
          const lc = liveCanvas.current;
          const lctx = lc?.getContext('2d');
          if (lc && lctx) lctx.drawImage(canvas, 0, 0, lc.width, lc.height);
          if (f % 9 === 0) {
            const tc = document.createElement('canvas');
            tc.width = 104;
            tc.height = 58;
            tc.getContext('2d')?.drawImage(canvas, 0, 0, 104, 58);
            thumbs.push(tc.toDataURL('image/jpeg', 0.6));
            setStrip([...thumbs]);
          }
        },
      });
      const reqs = performance.getEntriesByType('resource').length - reqBefore;
      setUrl(URL.createObjectURL(blob));
      setMeta({ secs: ((performance.now() - t0) / 1000).toFixed(1), size: (blob.size / 1024).toFixed(0), reqs });
      setStatus('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  return (
    <div>
      {/* the split: live composition ↔ the exported file */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ ...card, width: DISPLAY_W }}>
          <div style={cardLabel}>
            <span>● LIVE · REACT COMPOSITION</span>
            <span style={{ color: ACCENT }}>useCurrentFrame()</span>
          </div>
          <Player
            ref={player}
            composition={HeroReel}
            width={W}
            height={H}
            fps={FPS}
            durationInFrames={DUR}
            displayHeight={DISPLAY_H}
            controls={false}
            style={{ display: 'block' }}
          />
        </div>

        <div style={{ ...card, width: DISPLAY_W }}>
          <div style={cardLabel}>
            <span style={{ color: status === 'done' ? '#7fdca0' : '#8a8a99' }}>
              {status === 'done' ? '▸ THE .MP4 · DECODED BY YOUR BROWSER' : 'OUTPUT · .MP4'}
            </span>
            <span>{status === 'running' ? `${pct}%` : status === 'done' ? `${meta?.size} KB` : ''}</span>
          </div>
          <div
            style={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              background: '#000',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {status === 'idle' && (
              <div style={{ color: '#55555f', fontSize: 14, textAlign: 'center', padding: 20, lineHeight: 1.6 }}>
                hit <b style={{ color: ACCENT }}>Export</b> →<br />
                the .mp4 is built right here, in this tab
              </div>
            )}
            {status === 'running' && (
              <>
                <canvas ref={liveCanvas} width={DISPLAY_W} height={DISPLAY_H} style={{ width: '100%', height: '100%', display: 'block' }} />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingBottom: 16,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 40%)',
                  }}
                >
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#fff', marginBottom: 8 }}>
                    capturing frame {frameNo} / {DUR}
                  </div>
                  <div style={{ width: '82%', height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${ACCENT},#ffa14a)` }} />
                  </div>
                </div>
              </>
            )}
            {status === 'done' && url && (
              // biome-ignore lint/a11y/useMediaCaption: a generated demo clip, no captions
              <video
                src={url}
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
            {status === 'error' && <div style={{ color: '#ff6b6b', fontSize: 13, padding: 20 }}>✗ {err}</div>}
          </div>
        </div>
      </div>

      {/* export button + live stats */}
      <div style={{ marginTop: 22, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          style={{
            background: status === 'running' ? '#3a2230' : `linear-gradient(135deg, ${ACCENT}, #ff8a4a)`,
            color: '#fff',
            border: 0,
            borderRadius: 12,
            padding: '15px 30px',
            fontSize: 17,
            fontWeight: 700,
            cursor: status === 'running' ? 'default' : 'pointer',
            boxShadow: status === 'running' ? 'none' : '0 10px 36px rgba(255,94,138,0.4)',
          }}
        >
          {status === 'running' ? `Exporting… ${pct}%` : status === 'done' ? '↻ Export again' : '⬇ Export this to MP4 — in your browser'}
        </button>
        {status === 'done' && meta && (
          <>
            <Badge icon="⏱">{meta.secs}s</Badge>
            <Badge icon="🎞">{DUR} frames</Badge>
            <Badge icon="🛜">{meta.reqs} network requests</Badge>
            <Badge icon="✈️">100% offline</Badge>
            {url && (
              <a href={url} download="remover-export.mp4" style={{ color: '#ff9ab8', fontSize: 14, fontWeight: 600 }}>
                download .mp4 ↗
              </a>
            )}
          </>
        )}
      </div>

      {/* filmstrip of captured frames */}
      {strip.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#6a6a76', letterSpacing: 1, marginBottom: 8 }}>
            FRAMES CAPTURED FROM THE LIVE DOM →
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {strip.map((src, i) => (
              // biome-ignore lint/a11y/useAltText: decorative filmstrip thumbnail
              // biome-ignore lint/suspicious/noArrayIndexKey: frames are append-only and ordered
              <img
                key={i}
                src={src}
                width={104}
                height={58}
                style={{ borderRadius: 5, border: '1px solid #26262e', opacity: 0, animation: `fadein .3s ease ${i * 0.02}s forwards` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* the contrast */}
      <div style={{ marginTop: 30, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280, ...card, padding: 18 }}>
          <div style={{ fontSize: 13, color: '#6a6a76', marginBottom: 6 }}>Remotion exports like this:</div>
          <div style={{ fontSize: 15, color: '#cfcfd8', lineHeight: 1.5 }}>
            spin up AWS Lambda · bundle a per-platform ffmpeg binary · render off in the cloud
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 280, background: '#1a1320', border: `1px solid ${ACCENT}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, color: ACCENT, marginBottom: 6 }}>remover just did it:</div>
          <div style={{ fontSize: 15, color: '#fff', lineHeight: 1.5 }}>
            ↑ all of that — in the browser tab you're reading this in. No server. No ffmpeg.
          </div>
        </div>
      </div>
    </div>
  );
}
