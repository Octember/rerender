// Render page: renders ONE example (chosen by ?comp=) at native resolution, played
// from `from`→`to` in real time. Playwright records this; window.__renderDone
// signals the slice is finished.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigContext, FrameContext, PlayingContext } from '../src/core/frame';
import { byId, examples } from '../examples/registry';

const p = new URLSearchParams(location.search);
const entry = byId(p.get('comp') ?? '') ?? examples[examples.length - 1]!;
const config = {
  width: Number(p.get('w')) || entry.width,
  height: Number(p.get('h')) || entry.height,
  fps: Number(p.get('fps')) || entry.fps,
  durationInFrames: Number(p.get('dur')) || entry.durationInFrames,
};
const from = Number(p.get('from')) || 0;
const to = Number(p.get('to')) || config.durationInFrames;

declare global {
  interface Window {
    __renderDone?: boolean;
  }
}

const Composition = entry.component;

function RenderStage(): JSX.Element {
  const [frame, setFrame] = useState(from);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (): void => {
      const elapsed = (performance.now() - t0) / 1000;
      const f = from + Math.floor(elapsed * config.fps);
      if (f >= to) {
        setFrame(to - 1);
        window.__renderDone = true;
        return;
      }
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ width: config.width, height: config.height, position: 'relative', overflow: 'hidden' }}>
      <ConfigContext.Provider value={config}>
        <PlayingContext.Provider value={true}>
          <FrameContext.Provider value={frame}>
            <Composition />
          </FrameContext.Provider>
        </PlayingContext.Provider>
      </ConfigContext.Provider>
    </div>
  );
}

const root = document.getElementById('stage');
if (!root) throw new Error('no #stage');
createRoot(root).render(<RenderStage />);
