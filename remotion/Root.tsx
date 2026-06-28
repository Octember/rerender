// Real-Remotion entry — registers the SAME example compositions so we can render
// them on actual Remotion and diff against remover's output (the parity test).
// The examples import `from 'remotion'`; here that resolves to real Remotion.
import { Composition } from 'remotion';
import { examples } from '../examples/registry';

export function RemotionRoot(): JSX.Element {
  return (
    <>
      {examples.map((e) => (
        <Composition
          key={e.id}
          id={e.id}
          component={e.component}
          durationInFrames={e.durationInFrames}
          fps={e.fps}
          width={e.width}
          height={e.height}
        />
      ))}
    </>
  );
}
