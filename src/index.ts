// remover — public API (the drop-in Remotion surface).
export {
  useCurrentFrame,
  useVideoConfig,
  useIsPlaying,
  Sequence,
  FrameContext,
  ConfigContext,
  PlayingContext,
} from './core/frame';
export type { VideoConfig } from './core/frame';

export { interpolate, Easing } from './core/interpolate';
export type { InterpolateOptions, Extrapolate } from './core/interpolate';

export { AbsoluteFill, Img, Video, Audio } from './core/primitives';

export { Player } from './core/player';
export type { PlayerProps } from './core/player';
