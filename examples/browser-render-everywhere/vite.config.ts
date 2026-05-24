import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@flyingrobots/geordi-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@flyingrobots/geordi-render-fixture': fileURLToPath(
        new URL('../../packages/render-fixture/src/index.ts', import.meta.url),
      ),
      '@flyingrobots/geordi-runtime-webgl': fileURLToPath(
        new URL('../../packages/runtime-webgl/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
