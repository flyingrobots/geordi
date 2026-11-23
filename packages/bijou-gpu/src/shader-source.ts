import { RendererFaultError, type GpuBackend } from './errors.js';

/**
 * The shader source port of `bijou-surface-gpu/1`.
 *
 * A presenter core needs the exact text of the generated shader artifacts in
 * `packages/bijou-gpu/shaders/`. It asks a {@link ShaderSourcePort} for them
 * and checks every byte against the manifest pin itself, so a port is a
 * loader, never a source of trust. The package ships three adapters:
 *
 * - `@flyingrobots/geordi-bijou-gpu/shader-source/webgl2`: the two generated
 *   GLSL ES 3.00 stages and the manifest, embedded in a generated module.
 * - `@flyingrobots/geordi-bijou-gpu/shader-source/webgpu`: the assembled WGSL
 *   and the manifest, embedded in a generated module.
 * - `@flyingrobots/geordi-bijou-gpu/shader-source/node`: every artifact read
 *   from the `shaders/` directory shipped in the package. Node only.
 *
 * This module imports no file system API and no bundler-specific syntax.
 */

export const BIJOU_SHADER_MANIFEST_FILE = 'bijou-shaders.manifest.json';

/**
 * Every file the shader generator writes into `packages/bijou-gpu/shaders/`
 * and the package publishes: the manifest and the eight generated artifacts.
 * Authored and vendored inputs are not artifacts and are not published.
 */
export const BIJOU_SHADER_ARTIFACT_FILES = [
  BIJOU_SHADER_MANIFEST_FILE,
  'bijou-surface.wgsl',
  'bijou-surface.vert.glsl',
  'bijou-surface.frag.glsl',
  'bijou-kernel-conformance.wgsl',
  'bijou-kernel-conformance.vert.glsl',
  'bijou-kernel-conformance.transport-canary.frag.glsl',
  'bijou-kernel-conformance.div-round-even.frag.glsl',
  'bijou-kernel-conformance.ellipse-classify.frag.glsl',
] as const;

export type BijouShaderArtifactFile = (typeof BIJOU_SHADER_ARTIFACT_FILES)[number];

export interface ShaderSourcePort {
  /** Where the text comes from, for error messages: `bundled:webgl2`, `file:<dir>`, `in-memory`. */
  readonly description: string;
  /**
   * The exact text of one artifact, or `undefined` when this source does not
   * carry it. A port never edits text: the presenter refuses any byte that is
   * not the manifest pin.
   */
  readText(file: BijouShaderArtifactFile): string | undefined;
}

/**
 * The text of `file` from `port`.
 *
 * @throws RendererFaultError for `backend` when the port does not carry the file.
 */
export function requireShaderText(port: ShaderSourcePort, file: BijouShaderArtifactFile, backend: GpuBackend): string {
  const text = port.readText(file);
  if (text === undefined) {
    throw new RendererFaultError(backend, `shader source ${port.description} has no ${file}`);
  }
  return text;
}

/**
 * A port over texts the host already holds, for example from its own bundler.
 * The presenter still checks each text against the manifest pin.
 */
export function createInMemoryShaderSource(
  texts: Partial<Readonly<Record<BijouShaderArtifactFile, string>>>,
  description = 'in-memory',
): ShaderSourcePort {
  const copy = new Map<BijouShaderArtifactFile, string>();
  for (const file of BIJOU_SHADER_ARTIFACT_FILES) {
    const text = texts[file];
    if (text !== undefined) {
      copy.set(file, text);
    }
  }
  return {
    description,
    readText(file) {
      return copy.get(file);
    },
  };
}
