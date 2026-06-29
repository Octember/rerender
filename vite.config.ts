import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { removerAliases } from './render/aliases';

// drop-in: `import … from 'remotion'` / '@remotion/*' resolves to remover (shared
// with the renderer's in-process bundle, so dev + render resolve identically).
export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: { alias: removerAliases, dedupe: ['react', 'react-dom'] },
  server: { open: false },
});
