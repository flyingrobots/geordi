import type { CanonicalSceneAst } from './ast.js';
import type { ArtifactMap } from './artifacts.js';
import type { Diagnostic } from './diagnostics.js';

export type InputFormat = 'graphql-sdl' | 'canonical-ast-json';

export interface CompileOptions {
  target: 'geordi-ir';
  emit: {
    irJson?: boolean;
    tsTypes?: boolean;
    jsonSchema?: boolean;
    binaryPack?: boolean;
  };
  strict?: boolean;
  failOnWarnings?: boolean;
  canonicalize?: boolean;
}

export interface CompilerInput {
  format: InputFormat;
  source: string;
  filename?: string;
  options?: CompileOptions;
}

export interface CompileMetadata {
  compilerVersion: string;
  irVersion?: string;
  inputFormat: InputFormat;
  hashAlgorithm?: 'sha256';
}

export interface CompileResult {
  ok: boolean;
  ast?: CanonicalSceneAst;
  artifacts: ArtifactMap;
  diagnostics: Diagnostic[];
  metadata: CompileMetadata;
}
