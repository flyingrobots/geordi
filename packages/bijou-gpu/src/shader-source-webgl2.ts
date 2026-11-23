import { BIJOU_SHADERS_MANIFEST_TEXT } from './generated/bijou-shaders-manifest.generated.js';
import { BIJOU_SURFACE_FRAG_GLSL, BIJOU_SURFACE_VERT_GLSL } from './generated/bijou-surface-glsl.generated.js';
import { createInMemoryShaderSource, type ShaderSourcePort } from './shader-source.js';

/**
 * The bundled WebGL2 adapter of the shader source port: the two generated
 * GLSL ES 3.00 stages of `bijou-surface` and the shader manifest, embedded by
 * `scripts/generate-bijou-gpu-shader-sources.mjs`. Runs anywhere: it reads no
 * file. Exported from `@flyingrobots/geordi-bijou-gpu/shader-source/webgl2`,
 * and wired by default into `createWebGL2SurfacePresenter()`.
 */
export const WEBGL2_BUNDLED_SHADER_SOURCE: ShaderSourcePort = /* @__PURE__ */ createInMemoryShaderSource(
  {
    'bijou-shaders.manifest.json': BIJOU_SHADERS_MANIFEST_TEXT,
    'bijou-surface.vert.glsl': BIJOU_SURFACE_VERT_GLSL,
    'bijou-surface.frag.glsl': BIJOU_SURFACE_FRAG_GLSL,
  },
  'bundled:webgl2',
);
