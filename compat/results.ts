// remover compatibility — RESULTS layer.
//
// For each drop-in example, render the SAME composition file on real Remotion AND
// on remover, then pixel-diff a frame. Answers "does remover produce the same
// video Remotion would?" — and doubly-proves drop-in (one file, two renderers).
// Writes the rendered frames + a diff image to compat/out/ for inspection.
//
//   npm run compat:results            (hermetic, spins up its own temporary Vite server)
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// node-safe id list (importing the registry would pull in `remotion`, unresolved here).
const EXAMPLES = ['01-title', '02-sequence-spring', '03-video', '04-transitions', '05-audio-viz', '06-edge-cases'];
const FRAME = 45;
const W = 1080;
const H = 1920;
const OUTDIR = join(process.cwd(), 'compat', 'out');

const sh = (cmd: string, args: string[]): void => {
  execFileSync(cmd, args, { stdio: 'ignore' });
};

// Flatten onto black so transparent compositions compare on their (opaque) video basis.
function readPng(path: string): PNG {
  const png = PNG.sync.read(readFileSync(path));
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    d[i] = Math.round(d[i]! * a);
    d[i + 1] = Math.round(d[i + 1]! * a);
    d[i + 2] = Math.round(d[i + 2]! * a);
    d[i + 3] = 255;
  }
  return png;
}

async function waitForServer(url: string, timeoutMs = 25000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore connection errors during startup
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function main(): Promise<void> {
  mkdirSync(OUTDIR, { recursive: true });
  console.log(`\n  remover · results parity vs real Remotion  (frame ${FRAME}, same composition file)`);
  console.log('  ' + '─'.repeat(64));

  const customUrl = process.env.RENDER_URL;
  const port = '5188';
  const localUrl = `http://127.0.0.1:${port}`;
  let serverProcess: any = null;

  if (!customUrl) {
    console.log(`  [setup] Spawning hermetic Vite dev server on port ${port}…`);
    // Use npm run dev and enable shell: true for robust binary resolution on macOS
    serverProcess = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
      stdio: 'ignore',
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' },
    });
    // Ensure render/render.ts connects to our newly spawned server
    process.env.RENDER_URL = localUrl;
    try {
      await waitForServer(localUrl);
      console.log(`  [setup] Vite dev server is live at ${localUrl}`);
      console.log('  ' + '─'.repeat(64));
    } catch (e) {
      console.error(`  [error] Failed to start local Vite server: ${(e as Error).message}`);
      if (serverProcess) {
        try {
          serverProcess.kill();
        } catch {
          // ignore
        }
      }
      process.exit(1);
    }
  } else {
    console.log(`  [setup] Using existing RENDER_URL: ${customUrl}`);
    console.log('  ' + '─'.repeat(64));
  }

  for (const id of EXAMPLES) {
    try {
      // remover: render the example, extract the frame.
      const mp4 = join(OUTDIR, `${id}-remover.mp4`);
      execFileSync('npx', ['tsx', 'render/render.ts', '1', id, mp4], {
        stdio: 'ignore',
        env: { ...process.env }, // inherit process.env (including RENDER_URL)
      });
      const removerPng = join(OUTDIR, `${id}-remover.png`);
      sh('ffmpeg', ['-y', '-i', mp4, '-vf', `select='eq(n\\,${FRAME})'`, '-frames:v', '1', removerPng]);

      // real Remotion: still at the same frame.
      const remotionPng = join(OUTDIR, `${id}-remotion.png`);
      sh('npx', ['remotion', 'still', 'remotion/index.ts', id, remotionPng, `--frame=${FRAME}`]);

      // diff
      const a = readPng(removerPng);
      const b = readPng(remotionPng);
      const diff = new PNG({ width: W, height: H });
      const differing = pixelmatch(a.data, b.data, diff.data, W, H, { threshold: 0.1 });
      writeFileSync(join(OUTDIR, `${id}-diff.png`), PNG.sync.write(diff));
      const total = W * H;
      const matchPct = (100 * (1 - differing / total)).toFixed(3);
      console.log(`  ${id.padEnd(22)} ${String(differing).padStart(8)} / ${total} px differ  →  ${matchPct}% match`);
    } catch (e) {
      console.log(`  ${id.padEnd(22)} render failed: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  if (serverProcess) {
    console.log('  ' + '─'.repeat(64));
    console.log(`  [cleanup] Stopping temporary Vite server…`);
    try {
      // With shell: true, on macOS the child process is the shell process itself.
      // Killing it might not kill the spawned npm child. To be clean, on macOS we
      // can kill the process group or let the process exit cleanly. Since this is a
      // short-lived CLI command, the shell process kill is usually sufficient.
      serverProcess.kill();
    } catch {
      // ignore
    }
  }

  console.log('  ' + '─'.repeat(64));
  console.log(`  frames + diffs written to compat/out/\n`);
}

main().catch((e) => {
  console.error('Fatal error in results checker:', e);
  process.exit(1);
});
