import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BIJOU_SHADER_ARTIFACT_FILES, type BijouShaderArtifactFile, type ShaderSourcePort } from './shader-source.js';

/**
 * The file adapter of the shader source port, for Node and native tooling.
 *
 * Exported from `@flyingrobots/geordi-bijou-gpu/shader-source/node`, never
 * from the browser entry point.
 */

export interface FileShaderSourceOptions {
  /**
   * The directory that holds the artifacts. Defaults to the `shaders/`
   * directory of this package, which the package publishes.
   */
  readonly directory?: string | URL;
}

/** `shaders/` next to `dist/` in the published package, and next to `src/` in the repository. */
const PACKAGE_SHADER_DIR = new URL('../shaders/', import.meta.url);

/**
 * A port that reads each artifact from disk as UTF-8 when asked, and yields
 * `undefined` for a file that does not exist. It does not cache and does not
 * check digests; the presenter does.
 */
export function createFileShaderSource(options: FileShaderSourceOptions = {}): ShaderSourcePort {
  const given = options.directory ?? PACKAGE_SHADER_DIR;
  const directory = typeof given === 'string' ? given : fileURLToPath(given);
  const root = directory.endsWith('/') || directory.endsWith('\\') ? directory : `${directory}/`;
  const known = new Set<string>(BIJOU_SHADER_ARTIFACT_FILES);
  return {
    description: `file:${root}`,
    readText(file: BijouShaderArtifactFile) {
      if (!known.has(file)) {
        return undefined;
      }
      const path = `${root}${file}`;
      return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    },
  };
}
