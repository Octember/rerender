// Client-side export demo — the same composition plays in the Player AND exports to mp4
// entirely in the browser (no server, no ffmpeg) via src/client/export.
import { useState } from 'react';
import { AbsoluteFill, Player, interpolate, useCurrentFrame, useVideoConfig } from '../src';
import { exportToMp4 } from '../src/client/export';

const W = 1280;
const H = 720;
const FPS = 30;
const DURATION = 60;

function ExportComp(): JSX.Element {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const last = durationInFrames - 1;
  const x = interpolate(frame, [0, last], [-160, width + 160]);
  const scale = interpolate(frame, [0, last / 2, last], [0.6, 1.25, 0.6]);
  const titleY = interpolate(frame, [0, 14], [44, 0], { extrapolateRight: 'clamp' });
  const titleO = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  const prog = frame / last;
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg,#0b0b14,#1a1030)', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 64,
          fontSize: 72,
          fontWeight: 800,
          opacity: titleO,
          transform: `translateY(${titleY}px)`,
        }}
      >
        no server.
      </div>
      <div style={{ position: 'absolute', left: 66, top: 156, fontSize: 26, color: '#9a9ab0', opacity: titleO }}>
        rendered entirely in your browser
      </div>
      <div
        style={{
          position: 'absolute',
          top: height / 2,
          left: x,
          width: 160,
          height: 160,
          marginTop: -80,
          marginLeft: -80,
          borderRadius: '50%',
          transform: `scale(${scale})`,
          background: 'radial-gradient(circle at 35% 30%, #ff7aa2, #b3194d)',
          boxShadow: '0 24px 70px rgba(255,94,138,.45)',
        }}
      />
      <div style={{ position: 'absolute', left: 64, bottom: 76, fontSize: 18, color: '#6a6a80' }}>
        frame {frame} / {last}
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: `${prog * 100}%`, background: '#ff5e8a' }} />
    </AbsoluteFill>
  );
}

export function ExportDemo(): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [pct, setPct] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState('');

  async function run(): Promise<void> {
    setStatus('running');
    setPct(0);
    setUrl(null);
    try {
      const t0 = performance.now();
      const blob = await exportToMp4({
        Component: ExportComp,
        config: { width: W, height: H, fps: FPS, durationInFrames: DURATION },
        onProgress: (done, total) => setPct(Math.round((done / total) * 100)),
      });
      setUrl(URL.createObjectURL(blob));
      setMeta(`${DURATION} frames · ${((performance.now() - t0) / 1000).toFixed(1)}s · ${(blob.size / 1024).toFixed(0)} KB`);
      setStatus('done');
    } catch (e) {
      setMeta(String(e instanceof Error ? e.message : e));
      setStatus('error');
    }
  }

  return (
    <div style={{ marginTop: 40, borderTop: '1px solid #26262e', paddingTop: 28 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Client-side export · no server, no ffmpeg</div>
      <div style={{ color: '#8a8a93', fontSize: 13, marginBottom: 16, maxWidth: 520 }}>
        The Player preview below <i>is</i> the renderer. The button frame-steps the same composition, captures each frame from the live DOM
        (<code>foreignObject</code>), and encodes mp4 with WebCodecs + mediabunny — entirely in this tab.
      </div>
      <Player composition={ExportComp} width={W} height={H} fps={FPS} durationInFrames={DURATION} displayHeight={300} />
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          style={{
            background: '#ff5e8a',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: status === 'running' ? 'default' : 'pointer',
            opacity: status === 'running' ? 0.6 : 1,
          }}
        >
          {status === 'running' ? `Exporting… ${pct}%` : 'Export MP4 (in-browser)'}
        </button>
        {status === 'done' && <span style={{ color: '#7fdca0', fontSize: 13 }}>✓ {meta}</span>}
        {status === 'error' && <span style={{ color: '#ff6b6b', fontSize: 13 }}>✗ {meta}</span>}
      </div>
      {url && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: '#8a8a93', fontSize: 12, marginBottom: 6 }}>
            exported file (decoded by the browser — proof it's a real mp4):
          </div>
          <video src={url} controls style={{ width: 533, borderRadius: 8, background: '#000' }} />
          <div style={{ marginTop: 8 }}>
            <a href={url} download="remover-client-export.mp4" style={{ color: '#ff8fb0', fontSize: 13 }}>
              download remover-client-export.mp4
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
