import type { ArtifactMap, CanonicalSceneAst, CompilerInput } from '../types/index.js';
import { stringifyCanonicalJson } from '../ports/json.js';
import { InternalCompilerError } from '../errors/index.js';
import { hashString } from '../canonical/hashing.js';
import {
  COMPARATOR_VERSION,
  emitGeordiIrArtifact,
  emitSourceMapArtifact,
  FEATURE_REQUIREMENTS,
  IR_ARTIFACT_KEY,
  IR_HASH_ALG,
  IR_RECEIPT_KEY,
  IR_VERSION,
  NUMERIC_PROFILE,
  SOURCE_MAP_ARTIFACT_KEY,
} from './emitIr.js';
import { emitTypesArtifact } from './emitTypes.js';
import type { TextArtifact } from './textArtifact.js';

/**
 * Builds the compiler's artifact map. The IR and source map artifacts are held here, so the
 * receipt is computed from exactly the bytes that are emitted and IR content never crosses a
 * function boundary as an untyped string.
 *
 * Artifacts appear in the map in the order they were built.
 */
export class ArtifactBuilder {
  private readonly artifacts: ArtifactMap = {};
  private ir: TextArtifact | undefined;
  private sourceMap: TextArtifact | undefined;

  constructor(private readonly input: CompilerInput) {}

  buildIr(ast: CanonicalSceneAst): this {
    this.ir = emitGeordiIrArtifact(ast);
    this.artifacts[IR_ARTIFACT_KEY] = this.ir;
    return this;
  }

  buildSourceMap(ast: CanonicalSceneAst): this {
    this.sourceMap = emitSourceMapArtifact(ast);
    this.artifacts[SOURCE_MAP_ARTIFACT_KEY] = this.sourceMap;
    return this;
  }

  /** Requires `buildIr` and `buildSourceMap` to have run: the receipt hashes both. */
  buildReceipt(ruleIds: readonly string[]): this {
    if (this.ir === undefined) {
      throw new InternalCompilerError('ArtifactBuilder.buildReceipt requires buildIr to run first');
    }
    if (this.sourceMap === undefined) {
      throw new InternalCompilerError('ArtifactBuilder.buildReceipt requires buildSourceMap to run first');
    }

    const content = stringifyCanonicalJson(
      {
        comparatorVersion: COMPARATOR_VERSION,
        featureRequirements: [...FEATURE_REQUIREMENTS],
        featureRequirementsHash: hashString(FEATURE_REQUIREMENTS.join('\n')),
        featureRequirementsHashAlg: IR_HASH_ALG,
        inputHash: hashString(this.input.source),
        irHash: hashString(this.ir.content),
        irHashAlg: IR_HASH_ALG,
        irVersion: IR_VERSION,
        numericProfile: NUMERIC_PROFILE,
        rulesetFingerprint: hashString([...ruleIds].sort().join('\n')),
        sourceMapHash: hashString(this.sourceMap.content),
        sourceMapHashAlg: IR_HASH_ALG,
      },
      { space: 2 },
    );

    this.artifacts[IR_RECEIPT_KEY] = {
      path: IR_RECEIPT_KEY,
      content,
      mediaType: 'application/json',
      encoding: 'utf8',
    };
    return this;
  }

  buildTypes(ast: CanonicalSceneAst): this {
    this.artifacts['types.ts'] = emitTypesArtifact(ast);
    return this;
  }

  toArtifactMap(): ArtifactMap {
    return { ...this.artifacts };
  }
}
