import type {
  CanonicalSceneAst,
  CompileOptions,
  CompileResult,
  CompilerInput,
  Diagnostic,
  ArtifactMap,
} from '../types/index.js';

import {
  GeordiErrorCode,
  InternalCompilerError,
  normalizeCompilerErrorCause,
  type ThrownValue,
} from '../errors/index.js';

import { parseInputToCanonicalAst, type ParseInputDeps } from './parseInput.js';
import { HASH_ALGORITHM } from '../canonical/hashing.js';
import { normalizeCanonicalAst } from '../canonical/normalizeAst.js';
import { validateCanonicalAst, VALIDATION_RULE_IDS } from './validateAst.js';
import { emitGeordiIrArtifact, emitReceiptArtifact, IR_ARTIFACT_KEY, IR_RECEIPT_KEY, IR_VERSION } from './emitIr.js';
import { emitTypesArtifact } from './emitTypes.js';

const DEFAULT_OPTIONS: CompileOptions = {
  target: 'geordi-ir-v1',
  emit: {
    irJson: true,
    tsTypes: true,
    jsonSchema: false,
    binaryPack: false,
  },
  strict: true,
  failOnWarnings: false,
  canonicalize: true,
};

const COMPILER_VERSION = '0.1.0-dev';

export async function compile(input: CompilerInput, deps?: ParseInputDeps): Promise<CompileResult> {
  const options = mergeOptions(DEFAULT_OPTIONS, input.options);
  const diagnostics: Diagnostic[] = [];
  const artifacts: ArtifactMap = {};

  try {
    // Phase 1: Parse → Canonical AST
    const parsedAst = await parseInputToCanonicalAst(input, diagnostics, deps);
    const canonicalAst = options.canonicalize && parsedAst ? normalizeCanonicalAst(parsedAst) : parsedAst;

    // Phase 2: Semantic validation
    diagnostics.push(...validateCanonicalAst(canonicalAst, options));

    // Hard stop on errors
    const hasErrors = diagnostics.some((d) => d.severity === 'error');
    if (hasErrors) {
      return finalize(false, canonicalAst, artifacts, diagnostics, input.format);
    }

    // Phase 3: Emit artifacts
    // Reject unsupported features before any artifacts are written
    if (options.emit.jsonSchema) {
      diagnostics.push({
        code: GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED,
        severity: 'error',
        message: 'emit.jsonSchema is not yet implemented. Remove jsonSchema: true from emit options.',
        details: { feature: 'jsonSchema' },
      });
      return finalize(false, canonicalAst, artifacts, diagnostics, input.format);
    }
    if (options.emit.binaryPack) {
      diagnostics.push({
        code: GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED,
        severity: 'error',
        message: 'emit.binaryPack is not yet implemented. Remove binaryPack: true from emit options.',
        details: { feature: 'binaryPack' },
      });
      return finalize(false, canonicalAst, artifacts, diagnostics, input.format);
    }
    if (options.emit.irJson && canonicalAst) {
      const irArtifact = emitGeordiIrArtifact(canonicalAst);
      artifacts[IR_ARTIFACT_KEY] = irArtifact;

      artifacts[IR_RECEIPT_KEY] = emitReceiptArtifact(input, irArtifact.content as string, VALIDATION_RULE_IDS);
    }
    if (options.emit.tsTypes && canonicalAst) {
      artifacts['types.ts'] = emitTypesArtifact(canonicalAst);
    }

    if (options.failOnWarnings && diagnostics.some((d) => d.severity === 'warning')) {
      return finalize(false, canonicalAst, artifacts, diagnostics, input.format);
    }

    return finalize(true, canonicalAst, artifacts, diagnostics, input.format);
  } catch (cause) {
    const err = new InternalCompilerError('Unhandled compiler failure', {
      cause: normalizeCompilerErrorCause(cause as ThrownValue),
      details: { format: input.format, filename: input.filename },
    });

    diagnostics.push(err.toDiagnostic());
    return finalize(false, undefined, artifacts, diagnostics, input.format);
  }
}

function finalize(
  ok: boolean,
  ast: CanonicalSceneAst | undefined,
  artifacts: ArtifactMap,
  diagnostics: Diagnostic[],
  inputFormat: CompilerInput['format'],
): CompileResult {
  return {
    ok,
    ast,
    artifacts,
    diagnostics,
    metadata: {
      compilerVersion: COMPILER_VERSION,
      irVersion: IR_ARTIFACT_KEY in artifacts ? IR_VERSION : undefined,
      inputFormat,
      hashAlgorithm: HASH_ALGORITHM,
    },
  };
}

function mergeOptions(base: CompileOptions, partial?: CompileOptions): CompileOptions {
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    emit: {
      ...base.emit,
      ...partial.emit,
    },
  };
}
