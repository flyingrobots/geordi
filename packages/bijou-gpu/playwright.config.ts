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
    // Lets Chrome expose a WebGPU adapter on hosts without a GPU (SwiftShader),
    // so the WebGPU presenter probes can run there as software-probed evidence.
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-unsafe-swiftshader',
        // Headless Chrome on Linux destroys a SwiftShader WebGPU device on the
        // first draw into a canvas unless ANGLE also runs on SwiftShader Vulkan.
        ...(process.platform === 'linux'
          ? ['--use-angle=swiftshader', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan']
          : []),
      ],
    },
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
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
