import { BIJOU_SHADERS_MANIFEST_TEXT } from './generated/bijou-shaders-manifest.generated.js';
import { BIJOU_SURFACE_WGSL } from './generated/bijou-surface-wgsl.generated.js';
import { createInMemoryShaderSource, type ShaderSourcePort } from './shader-source.js';

/**
 * The bundled WebGPU adapter of the shader source port: the assembled
 * `bijou-surface.wgsl` and the shader manifest, embedded by
 * `scripts/generate-bijou-gpu-shader-sources.mjs`. Runs anywhere: it reads no
 * file. Exported from `@flyingrobots/geordi-bijou-gpu/shader-source/webgpu`.
 */
export const WEBGPU_BUNDLED_SHADER_SOURCE: ShaderSourcePort = /* @__PURE__ */ createInMemoryShaderSource(
  {
    'bijou-shaders.manifest.json': BIJOU_SHADERS_MANIFEST_TEXT,
    'bijou-surface.wgsl': BIJOU_SURFACE_WGSL,
  },
  'bundled:webgpu',
);
