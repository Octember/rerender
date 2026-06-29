// Browser-side audio mix + mux. Bundled to an IIFE by esbuild (see src/renderer/audio.ts)
// and served to the mux browser. An OfflineAudioContext sums the asset audio (each
// scheduled at its timeline position through a gain node); mediabunny packet-copies the
// silent video and AAC-encodes the mix into one mp4. window.__mux() returns base64.
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import {
  AudioBufferSource,
  BufferSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  getFirstEncodableAudioCodec,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import type { MuxPosition, VideoCodec } from '../src/renderer/types';
import { toBase64 } from './worker-util';

// Polyfill AAC encoding (a self-contained WASM build of FFmpeg's AAC encoder) so we get AAC
// even where WebCodecs lacks it — notably chrome-headless-shell on AWS Lambda, which has no
// licensed AAC encoder and would otherwise fall back to Opus. Registered once on load.
registerAacEncoder();

declare global {
  interface Window {
    __mux?: (positions: MuxPosition[], fps: number, codec: VideoCodec, sampleRate: number, durationSec: number) => Promise<string>;
    __ready?: boolean;
  }
}

async function mux(positions: MuxPosition[], fps: number, codec: VideoCodec, sampleRate: number, durationSec: number): Promise<string> {
  // 1. Sum every asset's audio into one buffer at its timeline position.
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(durationSec * sampleRate)), sampleRate);
  for (const p of positions) {
    const data = await (await fetch(`/__asset/${p.assetIndex}`)).arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(data);
    } catch {
      continue; // asset with no decodable audio track (e.g. a silent video)
    }
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = p.playbackRate;
    const gain = ctx.createGain();
    // per-frame volume envelope (fades): schedule each frame's volume at its timeline time.
    const start = p.startInVideo / fps;
    for (let i = 0; i < p.volumes.length; i++) gain.gain.setValueAtTime(p.volumes[i]!, start + i / fps);
    node.connect(gain).connect(ctx.destination);
    // play `duration` composition-frames of source; at playbackRate that's duration·rate
    // source-frames, so the clip exactly fills its timeline window.
    node.start(start, p.trimLeft / fps, (p.duration * p.playbackRate) / fps);
  }
  const mixed = await ctx.startRendering();

  // 2. Copy the silent video's encoded packets + AAC-encode the mix into one mp4.
  const input = new Input({ formats: [MP4], source: new BufferSource(await (await fetch('/__silent')).arrayBuffer()) });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('mux: silent video has no video track');
  const videoSink = new EncodedPacketSink(videoTrack);

  const format = new Mp4OutputFormat();
  const out = new Output({ format, target: new BufferTarget() });
  const videoSource = new EncodedVideoPacketSource(codec);
  out.addVideoTrack(videoSource, { frameRate: fps });
  // Prefer AAC (what mp4 consumers expect); registerAacEncoder() above makes it always
  // encodable, but keep the fallback to any other mp4-compatible+encodable codec for safety.
  const audioBitrate = 128_000;
  const containerCodecs = format.getSupportedAudioCodecs();
  const order = containerCodecs.includes('aac')
    ? (['aac', ...containerCodecs.filter((c) => c !== 'aac')] as typeof containerCodecs)
    : containerCodecs;
  const audioCodec = await getFirstEncodableAudioCodec(order, { numberOfChannels: 2, sampleRate, bitrate: audioBitrate });
  if (!audioCodec) throw new Error('mux: no encodable mp4 audio codec available in this browser');
  const audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: audioBitrate });
  out.addAudioTrack(audioSource);
  await out.start();

  const decoderConfig = await videoTrack.getDecoderConfig();
  let first = true;
  for await (const packet of videoSink.packets()) {
    await videoSource.add(packet, first ? { decoderConfig: decoderConfig ?? undefined } : undefined);
    first = false;
  }
  videoSource.close();
  await audioSource.add(mixed);
  audioSource.close();
  await out.finalize();
  return toBase64((out.target as BufferTarget).buffer!);
}

window.__mux = mux;
window.__ready = true;
