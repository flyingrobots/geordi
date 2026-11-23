import type { ShaderSourcePort } from './shader-source.js';
import { WEBGL2_BUNDLED_SHADER_SOURCE } from './shader-source-webgl2.js';
import {
  createWebGL2SurfacePresenterCore,
  type WebGL2SurfacePresenter,
  type WebGL2SurfacePresenterCoreOptions,
} from './webgl2-presenter.js';

/**
 * The composition root of the WebGL2 presenter: the core with the bundled
 * shader source wired in.
 */

export interface WebGL2SurfacePresenterOptions extends Omit<WebGL2SurfacePresenterCoreOptions, 'shaderSource'> {
  /**
   * Where the generated GLSL comes from. Defaults to the bundled adapter,
   * `WEBGL2_BUNDLED_SHADER_SOURCE`, so a host never supplies the package's
   * own shaders. Any other port is checked against the same manifest pin.
   */
  readonly shaderSource?: ShaderSourcePort;
}

/**
 * Create a WebGL2 presenter on `options.canvas`, with the bundled generated
 * GLSL unless `options.shaderSource` names another port.
 *
 * Throws what `createWebGL2SurfacePresenterCore()` throws.
 */
export function createWebGL2SurfacePresenter(options: WebGL2SurfacePresenterOptions): WebGL2SurfacePresenter {
  return createWebGL2SurfacePresenterCore({
    ...options,
    shaderSource: options.shaderSource ?? WEBGL2_BUNDLED_SHADER_SOURCE,
  });
}
