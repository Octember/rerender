// renderMedia — match @remotion/renderer. Frame-step capture across N parallel
// browsers, then ffmpeg-encode. POC scope: h264 mp4 (video). Audio is a fast-follow.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromeExecutable } from '../../render/browser';
import { captureFrames, type CaptureOptions } from './capture';
import type { VideoConfig } from './types';

export interface RenderMediaOptions {
  composition: VideoConfig;
  serveUrl: string;
  outputLocation: string;
  inputProps?: Record<string, unknown>;
  codec?: 'h264';
  crf?: number;
  scale?: number;
  concurrency?: number;
  imageFormat?: 'png' | 'jpeg';
  jpegQuality?: number;
  muted?: boolean;
  pixelFormat?: string;
  frameRange?: number | [number, number];
  onProgress?: (p: { renderedFrames: number; progress: number }) => void;
}

export async function renderMedia(
  opts: RenderMediaOptions,
): Promise<{ buffer: null; slowestFrames: never[]; contentType: string }> {
  const { composition: c, serveUrl, outputLocation } = opts;
  const exe = await chromeExecutable();
  const crf = opts.crf ?? 18;
  const [from, to] = Array.isArray(opts.frameRange)
    ? opts.frameRange
    : typeof opts.frameRange === 'number'
      ? [opts.frameRange, opts.frameRange]
      : [0, c.durationInFrames - 1];
  const totalFrames = to - from + 1;
  const concurrency = opts.concurrency ?? Math.max(1, Math.floor(cpus().length / 2));
  const props = encodeURIComponent(JSON.stringify(opts.inputProps ?? {}));
  const stepUrl = `${serveUrl}/?step=1&comp=${encodeURIComponent(c.id)}&props=${props}`;
  const captureOpts: CaptureOptions = { scale: opts.scale, imageFormat: opts.imageFormat ?? 'png', jpegQuality: opts.jpegQuality };
  const ext = (opts.imageFormat ?? 'png') === 'jpeg' ? 'jpg' : 'png';

  const dir = mkdtempSync(join(tmpdir(), 'remover-render-'));
  try {
    const per = Math.ceil(totalFrames / concurrency);
    const ranges = Array.from({ length: concurrency }, (_, i) => [from + i * per, Math.min(from + (i + 1) * per, to + 1)] as const).filter(([a, b]) => a < b);
    await Promise.all(ranges.map(([a, b]) => captureFrames(exe, stepUrl, a, b, dir, c, captureOpts)));
    opts.onProgress?.({ renderedFrames: totalFrames, progress: 0.9 });

    execFileSync(
      'ffmpeg',
      ['-y', '-framerate', String(c.fps), '-start_number', String(from), '-i', join(dir, `f-%05d.${ext}`),
        '-c:v', 'libx264', '-pix_fmt', opts.pixelFormat ?? 'yuv420p', '-crf', String(crf), '-r', String(c.fps), '-movflags', '+faststart', outputLocation],
      { stdio: 'ignore' },
    );
    opts.onProgress?.({ renderedFrames: totalFrames, progress: 1 });
    return { buffer: null, slowestFrames: [], contentType: 'video/mp4' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
