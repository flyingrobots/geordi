import type { ShaderSourcePort } from './shader-source.js';
import { WEBGPU_BUNDLED_SHADER_SOURCE } from './shader-source-webgpu.js';
import {
  createWebGPUSurfacePresenterCore,
  type WebGpuPresenterCanvas,
  type WebGpuSurfacePresenter,
  type WebGpuSurfacePresenterCoreOptions,
} from './webgpu-presenter.js';

/**
 * The composition root of the WebGPU presenter: the core with the bundled
 * shader source wired in.
 */

export interface WebGpuSurfacePresenterOptions extends Omit<WebGpuSurfacePresenterCoreOptions, 'shaderSource'> {
  /**
   * Where `bijou-surface.wgsl` and the manifest come from. Defaults to the
   * bundled adapter, `WEBGPU_BUNDLED_SHADER_SOURCE`, so a host never supplies
   * the package's own shader. Any other port is checked the same way.
   */
  readonly shaderSource?: ShaderSourcePort;
}

/**
 * Create a WebGPU presenter on `canvas`, with the bundled `bijou-surface.wgsl`
 * unless `options.shaderSource` names another port.
 *
 * Rejects with what `createWebGPUSurfacePresenterCore()` rejects with.
 */
export function createWebGPUSurfacePresenter(
  canvas: WebGpuPresenterCanvas,
  options: WebGpuSurfacePresenterOptions,
): Promise<WebGpuSurfacePresenter> {
  return createWebGPUSurfacePresenterCore(canvas, {
    ...options,
    shaderSource: options.shaderSource ?? WEBGPU_BUNDLED_SHADER_SOURCE,
  });
}
