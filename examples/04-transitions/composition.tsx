// Tier 4 — a transition between scenes. Uses Series (core remotion, not yet in
// remover) + @remotion/transitions (ecosystem). The compat tool should flag both.
import { AbsoluteFill, Series } from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';

function Scene({ color }: { color: string }): JSX.Element {
  return <AbsoluteFill style={{ background: color }} />;
}

export function Transitions(): JSX.Element {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={40}>
        <Scene color="#ff2e63" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide()} timing={springTiming({ config: { damping: 200 } })} />
      <TransitionSeries.Sequence durationInFrames={40}>
        <Scene color="#5b8cff" />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
}
