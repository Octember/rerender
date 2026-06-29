// Shared, dependency-light contract between the @remotion/lambda-client drop-in
// (cloud/lambda-client.ts, runs in the caller's server) and the Lambda worker
// (cloud/handler.ts). NO chrome/vite/mediabunny imports here — the client side must stay
// light. Holds the render-progress shape Bevyl reads, the S3 key conventions, the Lambda
// event types, and the webhook signing both ends agree on.
import { createHmac } from 'node:crypto';

/** S3 key conventions — Remotion's `renders/<id>/…` layout, which Bevyl reconstructs
 *  client-side (`https://<bucket>.s3.<region>.amazonaws.com/renders/<id>/out.mp4`). */
export const outputKey = (renderId: string, ext = 'mp4'): string => `renders/${renderId}/out.${ext}`;
export const progressKey = (renderId: string): string => `renders/${renderId}/progress.json`;

export const s3PublicUrl = (bucket: string, region: string, key: string): string => `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

export interface RenderCosts {
  accruedSoFar: number;
  displayCost: string;
  currency: string;
  estimatedCost: number;
  disclaimer: string;
}

/** The render-progress object stored at progressKey() and returned by getRenderProgress() —
 *  a field-for-field structural match for what Bevyl reads off @remotion/lambda-client. */
export interface RenderProgress {
  renderId: string;
  bucketName: string;
  overallProgress: number; // 0..1
  done: boolean;
  fatalErrorEncountered: boolean;
  errors: { message: string; stack?: string }[];
  framesRendered: number;
  bytesUploaded: number;
  timeToFinish: number | null; // ms remaining, null until measurable
  estimatedBillingDurationInMilliseconds: number | null;
  costs: RenderCosts;
  outBucket: string | null;
  outKey: string | null;
  outputFile: string | null;
}

// AWS Lambda's GB-second price (us-east-1, x86) + per-request price. Used to fill the
// `costs` Bevyl records for COGS — an estimate from billed duration, not an invoice.
const GB_SECOND_USD = 0.0000166667;
const REQUEST_USD = 0.0000002;

export function estimateCosts(billedMs: number, memoryMb: number, invocations = 1): RenderCosts {
  const gbSeconds = (memoryMb / 1024) * (billedMs / 1000);
  const accruedSoFar = gbSeconds * GB_SECOND_USD + invocations * REQUEST_USD;
  const rounded = Math.round(accruedSoFar * 1e6) / 1e6;
  return {
    accruedSoFar: rounded,
    estimatedCost: rounded,
    displayCost: `$${rounded.toFixed(6)}`,
    currency: 'USD',
    disclaimer: 'Estimated from AWS Lambda GB-second pricing; not an invoiced amount.',
  };
}

/** Time remaining, projected linearly from progress so far. */
export const timeToFinish = (elapsedMs: number, overallProgress: number): number | null =>
  overallProgress > 0 && overallProgress < 1
    ? Math.round((elapsedMs * (1 - overallProgress)) / overallProgress)
    : overallProgress >= 1
      ? 0
      : null;

// ── Lambda event types — one function, three modes (discriminated on `type`) ──

export interface LaunchEvent {
  type: 'launch';
  renderId: string;
  bucket: string;
  composition: string; // composition id; the worker resolves it against the baked project
  inputProps?: Record<string, unknown>;
  codec?: string;
  muted?: boolean;
  scale?: number;
  imageFormat?: 'png' | 'jpeg';
  jpegQuality?: number;
  memorySize: number;
  region: string;
  webhook?: WebhookConfig | null;
}

export interface StillEvent {
  type: 'still';
  renderId: string;
  bucket: string;
  composition: string;
  frame: number;
  outName: string; // exact S3 key for the still
  inputProps?: Record<string, unknown>;
  imageFormat?: 'png' | 'jpeg';
  jpegQuality?: number;
  scale?: number;
  region: string;
}

export interface WebhookConfig {
  url: string;
  secret: string | null;
  customData?: Record<string, unknown> | null;
}

// ── Webhook signing — both ends are ours, so we just need to be self-consistent.
// Mirrors Remotion's scheme: HMAC-SHA512 hex of the raw JSON body, sent as a header. ──

export const WEBHOOK_SIGNATURE_HEADER = 'x-remotion-signature';

export function signWebhookBody(body: string, secret: string | null): string {
  if (!secret) return 'NO_SECRET_PROVIDED';
  return `sha512=${createHmac('sha512', secret).update(body).digest('hex')}`;
}

export interface WebhookPayload {
  type: 'success' | 'error' | 'timeout';
  renderId: string;
  expectedBucketOwner: string | null;
  bucketName: string;
  customData: Record<string, unknown> | null;
  outputUrl: string | null;
  lambdaErrors: { message: string; stack?: string }[];
  outputFile: string | null;
  timeToFinish: number | null;
  costs: RenderCosts | null;
  errors: { message: string; stack?: string }[];
}
