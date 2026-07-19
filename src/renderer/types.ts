/** WebCodecs/mediabunny video codec ids used by the in-browser encoder. */
export type VideoCodec = 'avc' | 'hevc' | 'vp9' | 'av1';

/** One audio asset's placement on the timeline, passed to the in-browser mux worker. */
export interface MuxPosition {
  /** index into the unique source-file list — spans that reuse a source share one entry. */
  srcIndex: number;
  startInVideo: number; // composition frame the asset starts at
  duration: number; // frame count
  trimLeft: number; // source-media frame at start
  /** per-frame volume over the span (length === duration) — a fade envelope. */
  volumes: number[];
  playbackRate: number;
}

// CompositionConfig — matches @remotion/renderer's resolved composition shape.
export interface CompositionConfig {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  defaultProps: Record<string, unknown>;
  props: Record<string, unknown>;
}
