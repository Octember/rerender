import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: {
      // drop-in: `import … from 'remotion'` resolves to remover.
      remotion: fileURLToPath(new URL('./src/remotion.ts', import.meta.url)),
    },
  },
  server: { open: false },
});
