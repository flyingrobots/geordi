import type { JsonObject } from '@flyingrobots/geordi-core';

export const PROFUNCTOR_PAGE_VERSION = 'profunctor-page/0' as const;
export const PROFUNCTOR_PAGE_SOURCE_MAP_VERSION = 'profunctor-page-source-map/0' as const;
export const PROFUNCTOR_BUILD_MANIFEST_VERSION = 'profunctor-build-manifest/0' as const;
export const PROFUNCTOR_PAGE_TARGET_PROFILE = 'geordi-profunctor-page-structural/1' as const;
export const PROFUNCTOR_PAGE_TARGET_MAP_VERSION =
  'geordi-profunctor-page-map/1' as const;
export const PROFUNCTOR_PAGE_TARGET_RECEIPT_VERSION =
  'geordi-profunctor-page-receipt/1' as const;
export const PROFUNCTOR_PAGE_TARGET_IR_PATH = 'scene.geordi.json' as const;
export const PROFUNCTOR_PAGE_TARGET_MAP_PATH = 'scene.geordi.map.json' as const;
export const PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH = 'scene.geordi.preview.svg' as const;
export const PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH =
  'scene.geordi.json.receipt' as const;

export type ProfunctorPageDiagnosticCode =
  | 'GEORDI_PAGE_INPUT_JSON_INVALID'
  | 'GEORDI_PAGE_INPUT_VERSION_UNSUPPORTED'
  | 'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH'
  | 'GEORDI_PAGE_INPUT_DIGEST_MISMATCH'
  | 'GEORDI_PAGE_INPUT_REFERENCE_INVALID'
  | 'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS'
  | 'GEORDI_PAGE_BLOCK_UNSUPPORTED'
  | 'GEORDI_PAGE_OUTPUT_INVALID';

export interface ProfunctorPageArtifactInput {
  readonly filename: string;
  readonly source: string;
}

export interface ProfunctorPageInput {
  readonly buildManifest: ProfunctorPageArtifactInput;
  readonly page: ProfunctorPageArtifactInput;
  readonly sourceMap: ProfunctorPageArtifactInput;
}

export interface ParsedPageSlot {
  readonly childPageNodeIds: readonly string[];
  readonly name: string;
}

export interface ParsedPageNode {
  readonly blockDefinitionId: string;
  readonly hidden: boolean;
  readonly pageNodeId: string;
  readonly props: JsonObject;
  readonly requiredCapabilities: readonly string[];
  readonly slots: readonly ParsedPageSlot[];
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly templateNodeId: string;
  readonly tokens: Readonly<Record<string, string>>;
}

export interface ParsedSourceMapEntry {
  readonly pageNodeId: string;
  readonly residual: JsonObject | null;
  readonly source: JsonObject;
  readonly sourceOccurrenceId: string;
  readonly templateNodeId: string;
}

export interface ParsedProfunctorPage {
  readonly buildManifest: JsonObject;
  readonly buildManifestClaims: readonly string[];
  readonly buildManifestHash: string;
  readonly capabilityRequirements: readonly string[];
  readonly compositionRef: string;
  readonly dependencyDigests: readonly string[];
  readonly entityRef: string;
  readonly landmarks: readonly JsonObject[];
  readonly nodes: readonly ParsedPageNode[];
  readonly outline: readonly JsonObject[];
  readonly page: JsonObject;
  readonly pageHash: string;
  readonly pageId: string;
  readonly readingOrder: readonly string[];
  readonly rootNodeId: string;
  readonly route: string;
  readonly sourceMap: JsonObject;
  readonly sourceMapEntries: readonly ParsedSourceMapEntry[];
  readonly sourceMapHash: string;
  readonly tokenRefs: readonly string[];
}

export interface ProfunctorPageTargetArtifact {
  readonly content: string;
  readonly encoding: 'utf8';
  readonly mediaType: 'application/json' | 'image/svg+xml';
  readonly path: string;
}

export interface ProfunctorPageTargetArtifacts {
  readonly ir: ProfunctorPageTargetArtifact;
  readonly map: ProfunctorPageTargetArtifact;
  readonly preview: ProfunctorPageTargetArtifact;
  readonly receipt: ProfunctorPageTargetArtifact;
}

export interface ProfunctorPageTargetResult {
  readonly artifacts: ProfunctorPageTargetArtifacts;
  readonly pageId: string;
  readonly targetProfile: typeof PROFUNCTOR_PAGE_TARGET_PROFILE;
}

export class ProfunctorPageTargetError extends Error {
  public readonly code: ProfunctorPageDiagnosticCode;
  public readonly detail: string;
  public readonly path: string;

  constructor(
    code: ProfunctorPageDiagnosticCode,
    path: string,
    detail: string,
    cause?: Error,
  ) {
    super('Profunctor Page target validation failed', { cause });
    this.name = new.target.name;
    this.code = code;
    this.path = path;
    this.detail = detail;
  }
}
