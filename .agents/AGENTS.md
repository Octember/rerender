# remover — Agent Guidelines & Repository Rules

These guidelines are designed for AI agents working in this repository to prevent common development pitfalls and align with the project's architecture.

---

## 1. Avoid Dev Server Port Conflicts

> [!IMPORTANT]
> **Port 5175 Conflict**: The primary user directory `/Users/noah/dev/remover` may have an active Vite dev server running on port 5175 with `--strictPort`. 

If you run a local dev server in this worktree:
* Do **NOT** assume port 5175 is free. Always check first (e.g., `lsof -i :5175`).
* If starting a new server, bind it to a different port (e.g., `5177`):
  ```bash
  npm run dev -- --port 5177
  ```
* Set the environment variable `RENDER_URL` to match your custom port when executing renders:
  ```bash
  RENDER_URL=http://127.0.0.1:5177 npx tsx render/render.ts 1 01-title out.mp4
  ```

---

## 2. Core Architectural Principles

When modifying or debugging the renderer, preserve these non-negotiable architectural wins:

1. **Deterministic Frame-Stepping**: `remover` does **NOT** capture real-time video playback. It uses deterministic frame-stepping (`window.__setFrame`) and `page.screenshot` to guarantee frame-perfect parity, matching Remotion's core capture technique.
2. **0-rAF Settle**: Do not reintroduce multiple `requestAnimationFrame` settle delays on the fast path. Use React’s `flushSync` inside `render/stage.tsx` to commit state synchronously.
3. **No Server FFmpeg**: Keep encoding browser-bound using headless Chrome's WebCodecs and `mediabunny`. All stitching of parallel video slices must be done in Node.js via low-level packet copying (no re-encoding, fast copy).
4. **Isolated Parallel Browsers**: To scale rendering, fan out slices across isolated browser processes (using separate `puppeteer` launches), not multiple pages/tabs in a single browser. This avoids CDP command serialization bottlenecks.

---

## 3. Code Style & Dependencies

* Maintain strict TypeScript types.
* Keep the workspace fully zero-dependency on external video encoders (FFmpeg on the server is prohibited for encoding; keep it restricted to audio muxing and quick file inspects).
