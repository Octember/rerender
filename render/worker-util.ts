// Shared helpers for the browser-side workers (encode-worker, mux-worker).

/** Base64-encode an ArrayBuffer in chunks, so a multi-MB mp4 can cross the CDP bridge
 *  back to Node as one string without blowing the call-stack on String.fromCharCode. */
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
