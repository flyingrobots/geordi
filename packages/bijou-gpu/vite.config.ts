import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./harness', import.meta.url)),
  resolve: {
    alias: {
      '@flyingrobots/geordi-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
