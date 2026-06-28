// The frame clock + composition config, as React context — Remotion-compatible.
// Because compositions render to real DOM, useCurrentFrame() just drives a normal
// React re-render and the browser paints. That's the whole renderer.
import { createContext, useContext, type ReactNode } from 'react';
import { AbsoluteFill } from './primitives';

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export const FrameContext = createContext<number>(0);
export const ConfigContext = createContext<VideoConfig>({
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 1,
});
/** True while the player is playing (vs scrubbing) — lets <Video>/<Audio> play
 *  natively instead of seeking every frame. */
export const PlayingContext = createContext<boolean>(false);

export const useCurrentFrame = (): number => useContext(FrameContext);
export const useVideoConfig = (): VideoConfig => useContext(ConfigContext);
export const useIsPlaying = (): boolean => useContext(PlayingContext);

export function Sequence({
  from = 0,
  durationInFrames = Number.POSITIVE_INFINITY,
  layout = 'absolute-fill',
  children,
}: {
  from?: number;
  durationInFrames?: number;
  layout?: 'absolute-fill' | 'none';
  children: ReactNode;
}): ReactNode {
  const parent = useCurrentFrame();
  const local = parent - from;
  if (local < 0 || local >= durationInFrames) return null;
  const content =
    layout === 'absolute-fill' ? <AbsoluteFill>{children}</AbsoluteFill> : children;
  return <FrameContext.Provider value={local}>{content}</FrameContext.Provider>;
}
