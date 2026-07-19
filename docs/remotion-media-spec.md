# How `@remotion/media` actually works

Reference notes for building `rerender/media`, a drop-in for `@remotion/media`'s `<Video>`/`<Audio>`.
Sourced directly from `remotion-dev/remotion`'s `packages/media/src` on GitHub (not the prose docs,
which describe behavior but not mechanism) — every claim below links to the real file. Pulled
2026-07-18 from the `main` branch.

The one-line version: **one `MediaPlayer` class per `<Video>`/`<Audio>` tag, backed by a shared
`mediabunny.Input`, drives both picture (canvas) and sound (Web Audio) from a single decode. There
is no hidden `<video>`/`<audio>` element anywhere in the real implementation.**

## Top-level split: preview vs. render are different code paths

[`video.tsx`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/video/video.tsx)
branches immediately on `useRemotionEnvironment().isRendering`:

- **preview** → [`VideoForPreview`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/video/video-for-preview.tsx) (canvas + Web Audio, live/interactive)
- **render** → [`VideoForRendering`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/video/video-for-rendering.tsx) (one frame+audio extraction per rendered frame, no Web Audio)

`<Audio>` mirrors this exact split (`audio-for-preview.tsx` / `audio-for-rendering.tsx`), and both
tags funnel into the same `MediaPlayer`, just constructed with a different `tagType`.

## 1. Demuxing: one shared `mediabunny.Input` per src

[`get-shared-input.ts`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/get-shared-input.ts):

```ts
import {ALL_FORMATS, Input, UrlSource} from 'mediabunny';
const input = new Input({ source: new UrlSource(src, ...), formats: ALL_FORMATS });
```

The `Input` is **reference-counted and cached per `(src, credentials, requestInit)`** —
`acquireSharedInput`/`releaseSharedInput`. A `<Video src="a.mp4">` and a separate
`<Audio src="a.mp4">` share the *same* `Input`: one container parse, one warm byte cache, no
matter how many tags reference the file or how many times it's re-mounted (e.g. a jump cut).
`MediaPlayer.initialize()` reads `input.getFormat()`, `input.getPrimaryVideoTrack()`,
`input.getAudioTracks()` off it.

## 2. Picture (preview): `mediabunny.CanvasSink`

[`video-iterator-manager.ts`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/video-iterator-manager.ts):

```ts
import {CanvasSink} from 'mediabunny';
const canvasSink = new CanvasSink(videoTrack, { poolSize: 3, fit: 'contain', alpha: true });
```

`CanvasSink` is a *high-level* Mediabunny sink: it owns keyframe/GOP bookkeeping and the
`VideoDecoder` internally, and yields `WrappedCanvas` objects that are directly `drawImage`-able
(a `CanvasImageSource`). No manual `EncodedVideoChunk` feeding, no manual GOP grouping — Mediabunny
does that.

For **render** (not live preview), a lower-level sink is used instead —
[`mediabunny.VideoSampleSink`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/video-extraction/keyframe-manager.ts)
— because render needs sample-exact stepping frame-by-frame rather than the small time-shift
tolerance preview allows.

> Note for this repo: `mediabunny` is already a direct dependency
> ([package.json](../package.json)), and `rerender/extract`'s
> [extractor.ts](../src/extract/extractor.ts) hand-rolls the same tier of thing `CanvasSink`
> already does (manual `VideoDecoder`, manual GOP grouping, manual `EncodedVideoChunk` feeding).
> That extractor predates this doc and has its own reasons (see
> [frame-extraction.md](frame-extraction.md) — it measurably outperforms Remotion's own
> `@remotion/webcodecs` extractor). Worth knowing it's reimplementing a primitive already sitting
> in `node_modules`, not a gap that needs filling from scratch.

## 3. Sound (preview): Web Audio, scheduled — never a media element

This is the part worth internalizing precisely, since it's the one this repo's first attempt at
`rerender/media` got wrong (see below).

- [`audio-manager.ts`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/audio-extraction/audio-manager.ts)
  uses `mediabunny.AudioSampleSink` to decode PCM chunks from the *same shared `Input`* the video
  track (if any) is also being read from.
- Each chunk becomes a real Web Audio `AudioBufferSourceNode`, scheduled onto **one `AudioContext`
  + `GainNode` shared by the entire Player** —
  [`SharedAudioContextForMediaPlayer`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/shared-audio-context-for-media-player.ts),
  provided once at the Player root, not per-tag.
- Scheduling is anchored to a shared `audioSyncAnchor` timestamp so every tag's audio lands
  frame-locked to the same composition clock —
  [`media-player.ts`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/media-player.ts)'s
  `scheduleAudioNode`/`getTargetTime` do this math (compensating for `playbackRate`,
  `globalPlaybackRate`, loop wraparound, sequence offset).
- Critically: **`<Video>` gets an `audioIteratorManager` too**, whenever the file has an audio
  track and a shared context exists — this is *not* gated on `tagType === 'video'` (only the
  canvas/video-iterator side is gated that way). So a plain `<Video>` produces its own sound from
  the same `MediaPlayer`/`Input` that's drawing its frames. No second element, no second fetch,
  ever, for either tag.

### What this repo's first attempt got wrong

The first pass at `rerender/media`'s `<Video>` mounted a visually-hidden native `<video>` element
purely to get audio playback + reuse `useRenderAsset`'s registration call — i.e. it decoded the
*same file* twice (WebCodecs frame extraction for picture, a whole second native-element decode
for sound), including during render, where nothing ever plays that hidden element back at all.
That's the concrete thing real `@remotion/media` avoids: one shared `Input`, one decode, feeding
both a `CanvasSink` (picture) and Web Audio scheduling (sound).

## 4. Render path: frame + audio extracted together, per frame

[`VideoForRendering`](https://github.com/remotion-dev/remotion/blob/main/packages/media/src/video/video-for-rendering.tsx)
doesn't touch Web Audio at all. Per rendered frame it makes one call,
`extractFrameViaBroadcastChannel({ includeVideo, includeAudio, ... })`, and gets back
`{ frame: imageBitmap, audio, durationInSeconds }` in one shot — same decode, both outputs. Then:

1. draws `imageBitmap` to the canvas (gated by `delayRender`/`continueRender`, same pattern this
   repo already uses for `<Img>` and the render `Stage`'s `settle()`),
2. registers the render asset as `{ type: 'inline-audio', audio: audio.data, timestamp, duration }`
   — the *actual decoded PCM samples* for that frame, not offset/volume metadata to be re-decoded
   by a later mixing pass.

That last point is a real design fork from how this repo's renderer already works —
[`src/renderer/audio.ts`](../src/renderer/audio.ts)'s `muxAudio` re-decodes each asset's audio
track independently *after* capture, from `{offset, playbackRate, volume}` metadata registered via
[`registerRenderAsset`](../src/core/assets.ts). That convention is this repo's own, predates this
doc, and applies uniformly to the existing native `<Video>`/`<Audio>` — reusing it for
`rerender/media` is consistent with the codebase, just worth knowing it diverges from upstream's
per-frame-inline-PCM approach. `extractFrameViaBroadcastChannel`'s name also hints that Remotion's
browser renderer shares one decode of a file *across parallel render tabs* via a `BroadcastChannel`
— broader than this repo's per-tab `FrameStore` caching, which only shares within one page.

## 5. Error handling is a tagged result, not a single catch-all

`MediaPlayer.initialize()` resolves to one of:

```
success | unknown-container-format | cannot-decode | cannot-decode-prores
| network-error | no-tracks | disposed
```

Each maps to a specific message and fallback decision. `cannot-decode-prores` is special-cased to
**never** fall back — a native `<video>`/`<OffthreadVideo>` can't decode ProRes either, so falling
back would just fail differently — it rethrows through `onError` instead of setting the
fallback-to-native-video flag. Every other failure mode goes through
`disallowFallbackToOffthreadVideo` / the user's `onError` return value
(`'fallback' | 'fail'`) before deciding.

## Summary table

| concern | mechanism | key file |
| --- | --- | --- |
| demux, shared across tags/re-mounts | `mediabunny.Input` + `UrlSource`, refcounted per src | `get-shared-input.ts` |
| picture, preview | `mediabunny.CanvasSink` → `WrappedCanvas` → `drawImage` | `video-iterator-manager.ts` |
| picture, render | `mediabunny.VideoSampleSink`, sample-exact | `video-extraction/keyframe-manager.ts` |
| sound, preview | `mediabunny.AudioSampleSink` → `AudioBufferSourceNode` scheduled on one shared `AudioContext`/`GainNode` | `audio-extraction/audio-manager.ts`, `audio-iterator-manager.ts` |
| sound, render | decoded inline alongside the frame, one call returns both | `video-for-rendering.tsx` → `extractFrameViaBroadcastChannel` |
| sync (preview) | shared `audioSyncAnchor` timestamp anchors AudioContext clock to composition clock | `media-player.ts` (`getTargetTime`, `scheduleAudioNode`) |
| fallback | tagged init result, `cannot-decode-prores` never falls back | `media-player.ts` (`MediaPlayerInitResult`) |
