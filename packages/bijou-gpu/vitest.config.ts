import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@flyingrobots/geordi-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The oracle, packer and presenter tests rasterize and hash whole frames. They take a few
    // seconds alone and exceeded the 5 s default when the machine was loaded. A test here is
    // bounded by its assertions, not by wall-clock time.
    testTimeout: 30_000,
  },
});
