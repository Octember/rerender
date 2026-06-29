// `remover render|still` — 1-1 with `remotion render|still`. Bundles an arbitrary
// project in-process, selects the composition, and renders it.
//
//   remover render <entry> <comp-id> [output] [flags]
//   remover still  <entry> <comp-id> [output] [--frame N]
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { bundle } from './renderer/bundle';
import { getCompositions, selectComposition } from './renderer/select-composition';
import { renderMedia } from './renderer/render-media';
import { renderStill } from './renderer/render-still';

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key.startsWith('no-')) { flags[key.slice(3)] = false; continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

const num = (v: string | boolean | undefined): number | undefined => (typeof v === 'string' ? Number(v) : undefined);
const str = (v: string | boolean | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== 'render' && cmd !== 'still' && cmd !== 'studio') {
    console.error('usage: remover render|still|studio <entry> [comp-id] [output] [flags]');
    process.exit(1);
  }
  const { positional, flags } = parseArgs(rest);
  const [entry, compId, outputPos] = positional;
  if (!entry) { console.error('error: missing entry point (e.g. src/index.ts)'); process.exit(1); }

  if (cmd === 'studio') {
    const { studioServer } = await import('./renderer/studio');
    const s = await studioServer(resolve(entry), { port: num(flags.port) });
    console.log(`\n  remover studio  →  ${s.url}\n  Ctrl-C to stop.\n`);
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    const { spawn } = await import('node:child_process');
    spawn(opener, [s.url], { stdio: 'ignore', detached: true }).unref();
    await new Promise(() => undefined); // keep the server alive
    return;
  }

  let inputProps: Record<string, unknown> = {};
  const propsFlag = str(flags.props);
  if (propsFlag) inputProps = JSON.parse(propsFlag.endsWith('.json') ? readFileSync(propsFlag, 'utf8') : propsFlag);

  const b = await bundle(resolve(entry), { port: num(flags.port) });
  try {
    if (!compId) {
      const comps = await getCompositions({ serveUrl: b.serveUrl, inputProps });
      console.log('compositions:', comps.map((c) => c.id).join(', ') || '(none)');
      return;
    }
    let composition = await selectComposition({ serveUrl: b.serveUrl, id: compId, inputProps });
    composition = {
      ...composition,
      width: num(flags.width) ?? composition.width,
      height: num(flags.height) ?? composition.height,
      fps: num(flags.fps) ?? composition.fps,
      durationInFrames: num(flags.duration) ?? composition.durationInFrames,
    };

    const ext = cmd === 'still' ? 'png' : 'mp4';
    const output = str(flags.output) ?? outputPos ?? `out/${composition.id}.${ext}`;
    mkdirSync(dirname(resolve(output)), { recursive: true });

    if (cmd === 'still') {
      const frame = num(flags.frame);
      await renderStill({ composition, serveUrl: b.serveUrl, output, frame, inputProps, scale: num(flags.scale), imageFormat: str(flags['image-format']) as 'png' | 'jpeg' | undefined, jpegQuality: num(flags['jpeg-quality']) });
      console.log(`✓ still: ${composition.id} @ frame ${frame ?? composition.durationInFrames - 1} → ${output}`);
      return;
    }

    let frameRange: number | [number, number] | undefined;
    const framesFlag = str(flags.frames);
    if (framesFlag) {
      const parts = framesFlag.split('-').map(Number);
      frameRange = parts.length === 2 ? [parts[0]!, parts[1]!] : parts[0]!;
    }

    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl: b.serveUrl,
      outputLocation: output,
      inputProps,
      crf: num(flags.crf),
      scale: num(flags.scale),
      concurrency: num(flags.concurrency),
      imageFormat: str(flags['image-format']) as 'png' | 'jpeg' | undefined,
      jpegQuality: num(flags['jpeg-quality']),
      muted: flags.muted === true,
      pixelFormat: str(flags['pixel-format']),
      frameRange,
      onProgress: ({ progress }) => process.stdout.write(`\r  rendering… ${Math.round(progress * 100)}%`),
    });
    process.stdout.write('\n');
    console.log(`✓ render: ${composition.id} (${composition.durationInFrames}f @ ${composition.fps}fps, ${composition.width}x${composition.height}) → ${output}  [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  } finally {
    await b.close();
  }
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
