// Fully client-side export — the renderer with NO server. The composition mounts to real
// DOM, we frame-step it (flushSync, like the headless StepStage), capture each frame by
// serializing the live DOM into an SVG <foreignObject> and rasterizing it to a canvas
// (the in-browser stand-in for a CDP screenshot), then encode with WebCodecs + mux with
// mediabunny — both already browser-native. Result: an mp4 Blob produced entirely in the
// user's tab. Works for inline-styled compositions (the Remotion/remover convention);
// <video> frames and backdrop-filter are not captured by foreignObject (see exportToMp4).
import { type ComponentType, type ReactElement, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } from 'mediabunny';
import { ConfigContext, FrameContext, PlayingContext, TimelineContext, type VideoConfig } from '../core/frame';
import type { VideoCodec } from '../renderer/types';

export interface ClientExportOptions {
  Component: ComponentType<Record<string, unknown>>;
  props?: Record<string, unknown>;
  config: VideoConfig;
  codec?: VideoCodec;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const loadImage = (url: string, w: number, h: number): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image(w, h);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('foreignObject rasterization failed'));
    img.src = url;
  });

/** Serialize the live (inline-styled) DOM subtree into an SVG foreignObject and paint it
 *  onto the canvas — the client-side equivalent of one CDP screenshot. */
async function paintFrame(stage: HTMLElement, ctx: CanvasRenderingContext2D, w: number, h: number): Promise<void> {
  const inner = new XMLSerializer().serializeToString(stage);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"><style>*{box-sizing:border-box}</style>${inner}</div>` +
    `</foreignObject></svg>`;
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

/** Render `Component` to an mp4 Blob entirely in the browser — no server, no ffmpeg. */
export async function exportToMp4(opts: ClientExportOptions): Promise<Blob> {
  const { Component, props = {}, config, codec = 'avc', onProgress, signal } = opts;
  const { width, height, fps, durationInFrames } = config;

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  // Harness mirrors the headless StepStage: a frame we drive synchronously via flushSync.
  let drive!: (f: number) => void;
  function Harness(): ReactElement {
    const [frame, setFrame] = useState(0);
    drive = setFrame;
    return (
      <div style={{ width, height, position: 'relative', overflow: 'hidden' }}>
        <ConfigContext.Provider value={config}>
          <PlayingContext.Provider value={false}>
            <TimelineContext.Provider value={frame}>
              <FrameContext.Provider value={frame}>
                <Component {...props} />
              </FrameContext.Provider>
            </TimelineContext.Provider>
          </PlayingContext.Provider>
        </ConfigContext.Provider>
      </div>
    );
  }
  flushSync(() => root.render(<Harness />));
  const stage = host.firstElementChild as HTMLElement;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
  out.addVideoTrack(source, { frameRate: fps });
  await out.start();

  try {
    await document.fonts.ready;
    for (let f = 0; f < durationInFrames; f++) {
      if (signal?.aborted) throw new Error('export aborted');
      flushSync(() => drive(f));
      await paintFrame(stage, ctx, width, height);
      await source.add(f / fps, 1 / fps, f === 0 ? { keyFrame: true } : undefined);
      onProgress?.(f + 1, durationInFrames);
    }
    await out.finalize();
    return new Blob([(out.target as BufferTarget).buffer!], { type: 'video/mp4' });
  } finally {
    root.unmount();
    host.remove();
  }
}
