# remover

> **Drop-in, MIT-licensed Remotion alternative.** Same React API — but powered by synchronous DOM commits, parallel headless browser capture, and in-browser WebCodecs encoding. 

## What it is

You write video compositions in the **exact Remotion API** — `useCurrentFrame`, `useVideoConfig`, `interpolate`, `<Sequence>`, `<AbsoluteFill>`, and arbitrary DOM/CSS. Existing Remotion projects drop in. The difference is entirely underneath.

## The core idea: Capture the real preview

Remotion renders by screenshotting a headless browser frame-by-frame, then stitching with FFmpeg fanned across Lambda.

`remover` keeps the core deterministic frame-stepping model (seeking via `window.__setFrame(f)` and capturing with CDP `page.screenshot()`) because it is the only way to ensure frame-accurate, mathematical determinism. However, it replaces the surrounding architecture with a lightweight, cloud-native, and serverless-friendly pipeline:

1. **True Engine Parity**: Your compositions render inside a real, standard browser. If it works in standard CSS/layout, it renders identically in the export. No Skia, WASM, or custom canvas re-implementations.
2. **0-rAF Synchronous Commits**: Traditional renderers pause for multiple `requestAnimationFrame` (rAF) cycles to let the browser paint. `remover` uses React's `flushSync` to force synchronous state commits directly to the DOM, slashing frame-stepping overhead.
3. **No Server-Side FFmpeg**: Instead of spawning heavy FFmpeg binaries on the server (a major packaging and cold-start pain point on AWS Lambda), `remover` streams screenshots to a headless Chrome worker running a WebCodecs script, generating MP4 segments in-browser using **mediabunny** (a zero-dependency, in-browser MP4 multiplexer).

## How it scales: Parallel Slice -> Encode -> Concat

To parallelize and scale rendering speed, `remover` slices your timeline across isolated browser processes:

```
[User Composition] 
        |
        v  (Timeline sliced into N ranges)
┌─────────────────┬─────────────────┐
|                 |                 |
v [Slice 0]       v [Slice 1]       v [Slice N]
Browser Capture   Browser Capture   Browser Capture
  (CDP Pipe 0)      (CDP Pipe 1)      (CDP Pipe N)
        |                 |                 |
        v                 v                 v
WebCodecs Encode  WebCodecs Encode  WebCodecs Encode
  (mediabunny)      (mediabunny)      (mediabunny)
        |                 |                 |
        v                 v                 v
   segment0.mp4      segment1.mp4      segmentN.mp4
        \                 |                 /
         \                |                /
          v               v               v
       [Node.js Pure Packet-Copy Concatenation]  (<15ms, no re-encode)
                          |
                          v
                     [final.mp4]
```

1. **Multi-Browser Concurrency**: Running separate, isolated browser processes (rather than separate tabs in one browser) provides independent, parallel CDP pipes. This avoids CDP command serialization bottlenecks and yields a $2\times$ rendering speedup.
2. **Instant Concat**: The finished MP4 segments are concatenated in Node.js via pure binary packet copying (shifting packet timestamps, no re-encoding). This takes **fewer than 15 milliseconds** and requires no external binaries.

## Why "remover"

It removes your need for Remotion's dual-licensing, heavy server-side FFmpeg dependencies, and slow frame-settle loops. (And it's *re-mover* — moving again.)

## The honest tradeoffs

* **Screenshot Bottleneck**: While WebCodecs encoding and segment concatenation are virtually instant, `page.screenshot` remains the primary physical bottleneck of any browser-driven renderer.
* **Seam Accuracy**: Slices must start and stop on exact frames and remain keyframe-aligned so the final packet-level concat never drops or doubles a frame at a segment boundary.
* **Browser-Bound**: Rendering runs in real browsers — which is why arbitrary CSS works for free, but it requires standard browser environments to execute.

## Status

A highly polished, advanced technical prototype built as an intense **1-day hack**. The core architecture is proven end-to-end. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT
