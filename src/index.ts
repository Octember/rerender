// remover — public API (the drop-in Remotion surface).
export {
  useCurrentFrame,
  useVideoConfig,
  useIsPlaying,
  Sequence,
  Series,
  FrameContext,
  ConfigContext,
  PlayingContext,
} from './core/frame';
export type { VideoConfig } from './core/frame';

export { interpolate, Easing } from './core/interpolate';
export type { InterpolateOptions, Extrapolate } from './core/interpolate';

export { spring } from './core/spring';
export type { SpringConfig } from './core/spring';

export { staticFile, random } from './core/util';

export { AbsoluteFill, Img, Video, Audio } from './core/primitives';

export { Player } from './core/player';
export type { PlayerProps } from './core/player';
