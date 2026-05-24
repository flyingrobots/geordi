import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@flyingrobots/geordi-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@flyingrobots/geordi-gpvue': fileURLToPath(
        new URL('../../packages/gpvue/src/index.ts', import.meta.url),
      ),
      '@flyingrobots/geordi-render-fixture': fileURLToPath(
        new URL('../../packages/render-fixture/src/index.ts', import.meta.url),
      ),
      '@flyingrobots/geordi-runtime-webgl': fileURLToPath(
        new URL('../../packages/runtime-webgl/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
  },
});
