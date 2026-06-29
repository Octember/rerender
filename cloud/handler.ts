// AWS Lambda worker — renders ONE frame-range segment and uploads it to S3. The project
// is baked into the container image at REMOVER_ENTRY; each invocation bundles it,
// renders [lo,hi] silent (audio is mixed once on the coordinator), and writes the
// keyframe-started segment to s3://bucket/key. This is the per-VM unit, fanned out by
// the orchestrator (cloud/aws.ts → orchestrate.ts).
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { bundle } from '../src/renderer/bundle';
import { renderMedia } from '../src/renderer/render-media';
import type { CompositionConfig } from '../src/renderer/types';

const ENTRY = process.env.REMOVER_ENTRY ?? '/var/task/project/src/index.ts';
const s3 = new S3Client({});

// Cold-start: seed Vite's dep-optimizer cache from the image-baked copy so the first
// render doesn't pay the ~4s optimize. The Lambda fs is read-only except /tmp.
const BAKED_VITE_CACHE = '/var/task/.vite-cache-baked';
if (existsSync(BAKED_VITE_CACHE) && !existsSync('/tmp/.vite-cache')) {
  try {
    cpSync(BAKED_VITE_CACHE, '/tmp/.vite-cache', { recursive: true });
  } catch {
    /* best-effort — worst case Vite re-optimizes */
  }
}

export interface SegmentEvent {
  /** the composition, resolved once by the orchestrator (which bundles + selects to plan
   *  slices) — so the worker skips a redundant selectComposition + its chrome launch. */
  composition: CompositionConfig;
  props?: Record<string, unknown>;
  frameRange: [number, number]; // inclusive [lo, hi]
  bucket: string;
  key: string;
}

export async function handler(event: SegmentEvent): Promise<{ bucket: string; key: string; frames: number }> {
  // Opt-in per-phase timing (REMOVER_PHASE_TIMING=1) — diagnose cold-start cost in
  // CloudWatch without logging on every production invocation. Coarse phases only.
  const timing = !!process.env.REMOVER_PHASE_TIMING;
  const start = Date.now();
  const mark = (label: string): void => {
    if (timing) console.log(`[phase] ${label} +${Date.now() - start}ms`);
  };
  const b = await bundle(ENTRY);
  mark('bundle');
  try {
    const out = `/tmp/seg-${event.frameRange[0]}-${event.frameRange[1]}.mp4`;
    await renderMedia({
      composition: event.composition,
      serveUrl: b.serveUrl,
      outputLocation: out,
      inputProps: event.props ?? {},
      frameRange: event.frameRange,
      muted: true, // coordinator mixes audio across the whole timeline
    });
    mark('renderMedia');
    await s3.send(new PutObjectCommand({ Bucket: event.bucket, Key: event.key, Body: readFileSync(out), ContentType: 'video/mp4' }));
    mark('s3');
    return { bucket: event.bucket, key: event.key, frames: event.frameRange[1] - event.frameRange[0] + 1 };
  } finally {
    await b.close();
  }
}
