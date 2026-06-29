/// <reference types="vite/client" />
// Studio render page — renders a composition from a real Remotion project under
// templates/<name>/, selected by ?template=. The dynamic import runs registerRoot;
// the hidden <Root/> registers its <Composition>s; <Stage> renders the chosen one.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage } from './stage';
import { getComposition, getCompositions, getRoot, type CompositionMeta } from '../src/core/registry';

const p = new URLSearchParams(location.search);
const template = p.get('template') ?? 'helloworld';
const compId = p.get('comp') ?? '';
const stepMode = p.has('step');

const loaders = import.meta.glob('../templates/*/src/index.{ts,tsx}');

function Studio(): JSX.Element {
  const Root = getRoot();
  const [meta, setMeta] = useState<CompositionMeta | undefined>(undefined);
  // the hidden <Root/> registers compositions during this first render; read back after.
  useEffect(() => setMeta(getComposition(compId) ?? getCompositions()[0]), []);
  return (
    <>
      <div style={{ display: 'none' }}>{Root ? <Root /> : null}</div>
      {meta ? (
        <Stage
          Component={meta.component}
          props={meta.defaultProps}
          config={{ width: meta.width, height: meta.height, fps: meta.fps, durationInFrames: meta.durationInFrames }}
          from={0}
          to={meta.durationInFrames}
          stepMode={stepMode}
        />
      ) : null}
    </>
  );
}

async function boot(): Promise<void> {
  const key = Object.keys(loaders).find((k) => k.includes(`/templates/${template}/src/index`));
  if (!key) throw new Error(`template not found: ${template}`);
  await loaders[key]!(); // executes registerRoot(RemotionRoot)
  const root = document.getElementById('stage');
  if (!root) throw new Error('no #stage');
  createRoot(root).render(<Studio />);
}

void boot();
