import type { Artifact } from '../types/artifacts.js';

/** An artifact whose content is known to be UTF-8 text, so no caller needs to cast it. */
export interface TextArtifact extends Artifact {
  content: string;
  encoding: 'utf8';
}
