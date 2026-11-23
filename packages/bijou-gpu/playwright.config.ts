import { defineConfig, devices } from '@playwright/test';

// Several worktrees may run this harness at once; each can pick its own port.
const port = process.env.GEORDI_BIJOU_GPU_HARNESS_PORT ?? '4174';
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  use: {
    baseURL: origin,
    channel: 'chrome',
    viewport: {
      height: 900,
      width: 1280,
    },
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    reuseExistingServer: true,
    timeout: 120_000,
    url: origin,
  },
  projects: [
    {
      name: 'chrome',
      testIgnore: '**/webgpu-presenter.e2e.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      // The WebGPU presenter probes get their own browser flags, so they cannot
      // change how the other harnesses' WebGL2 and 2D canvases behave.
      name: 'chrome-webgpu',
      testMatch: '**/webgpu-presenter.e2e.ts',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Let Chrome expose a SwiftShader adapter on a host without a GPU.
            '--enable-unsafe-webgpu',
            '--enable-unsafe-swiftshader',
            // Without these, headless Chrome on Linux destroys a SwiftShader
            // WebGPU device on the first draw into a canvas. With them,
            // Playwright's Chromium 149 draws; Chrome 158 (the hosted runner)
            // exposes no adapter, so the positive probes skip there as
            // capability-refused. They also disable WebGL2, which is why they
            // are confined to this project.
            ...(process.platform === 'linux'
              ? ['--use-angle=swiftshader', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']
              : []),
          ],
        },
      },
    },
  ],
});
