import type {
  WebGpuAdapter,
  WebGpuCanvasContext,
  WebGpuCommandEncoder,
  WebGpuDevice,
  WebGpuGpu,
  WebGpuPresenterCanvas,
  WebGpuQueue,
  WebGpuTexture,
} from '../src/index.js';

/**
 * Compile-time check, run by the harness typecheck with DOM typings: the real
 * WebGPU and canvas types satisfy the presenter's structural WebGPU slice
 * without a cast. It has no runtime content.
 */
export type WebGpuDomCompatibility = [
  Assignable<GPU, WebGpuGpu>,
  Assignable<GPUAdapter, WebGpuAdapter>,
  Assignable<GPUDevice, WebGpuDevice>,
  Assignable<GPUQueue, WebGpuQueue>,
  Assignable<GPUCommandEncoder, WebGpuCommandEncoder>,
  Assignable<GPUTexture, WebGpuTexture>,
  Assignable<GPUCanvasContext, WebGpuCanvasContext>,
  Assignable<HTMLCanvasElement, WebGpuPresenterCanvas>,
  Assignable<OffscreenCanvas, WebGpuPresenterCanvas>,
];

type Assignable<Source extends Target, Target> = [Source, Target];
