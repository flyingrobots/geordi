/**
 * The pinned canonical `bijou-surface` shader of `bijou-surface-gpu/1`: the one
 * trust anchor both presenters verify against.
 *
 * A {@link ShaderSourcePort} is a loader, never a source of trust, so neither
 * presenter believes a digest or a binding map that the port supplies. The
 * WebGPU presenter refuses any WGSL whose SHA-256 is not
 * `assembledWgslSha256`, and any manifest whose `bijou-surface` entry does not
 * declare exactly the layout below. The WebGL2 presenter takes its pinned
 * `assembledWgslSha256` and uniform layout from here too.
 *
 * Every value is a copy of `packages/bijou-gpu/shaders/bijou-shaders.manifest.json`.
 * `node scripts/generate-bijou-gpu-shader-sources.mjs --check` and the unit
 * tests fail when a value differs from the manifest, so regenerating the
 * shaders fails until this file is updated with them. This module holds digests
 * and numbers only, no shader text, so a core presenter can import it.
 */
export const BIJOU_SURFACE_SHADER_PIN = {
  assembledWgslSha256: '241e1392c446866b331e9992046ef599cc3fd5c83c01bb4f3674f26979a06c53',
  group: 0,
  uniformBinding: 0,
  cellsBinding: 1,
  atlasBinding: 2,
  uniformByteSize: 64,
  uniformOffsets: {
    canvasPx: 0,
    cellPx: 8,
    gridCells: 16,
    atlasCols: 24,
    defaultFg: 32,
    defaultBg: 48,
    flags: 60,
  },
  cellsTextureFormat: 'rgba32uint',
  atlasTextureFormat: 'rgba8uint',
} as const;
