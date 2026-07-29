import { createHash } from 'node:crypto';
import {
  canonicalJsonPort,
  type JsonObject,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  PROFUNCTOR_BUILD_MANIFEST_VERSION,
  PROFUNCTOR_PAGE_SOURCE_MAP_VERSION,
  PROFUNCTOR_PAGE_VERSION,
  ProfunctorPageTargetError,
  type ParsedPageNode,
  type ParsedPageSlot,
  type ParsedProfunctorPage,
  type ParsedSourceMapEntry,
  type ProfunctorPageArtifactInput,
  type ProfunctorPageDiagnosticCode,
  type ProfunctorPageInput,
} from './contracts.js';

const SUPPORTED_BLOCK_DEFINITIONS = new Set([
  'block:page',
  'block:project-documentation',
  'block:project-facts',
  'block:project-hero',
  'block:project-related',
]);

export function parseProfunctorPageArtifacts(
  input: ProfunctorPageInput,
): ParsedProfunctorPage {
  const page = parseArtifact(input.page, PROFUNCTOR_PAGE_VERSION);
  const sourceMap = parseArtifact(
    input.sourceMap,
    PROFUNCTOR_PAGE_SOURCE_MAP_VERSION,
  );
  const buildManifest = parseArtifact(
    input.buildManifest,
    PROFUNCTOR_BUILD_MANIFEST_VERSION,
  );

  const pageId = requireString(page, 'pageId', '$page.pageId');
  const route = requireString(page, 'route', '$page.route');
  const compositionRef = requireString(
    page,
    'compositionRef',
    '$page.compositionRef',
  );
  const entityRef = requireString(page, 'entityRef', '$page.entityRef');
  const rootNodeId = requireString(page, 'rootNodeId', '$page.rootNodeId');
  const readingOrder = requireStringArray(
    property(page, 'readingOrder'),
    '$page.readingOrder',
  );
  const dependencyDigests = requireStringArray(
    property(page, 'dependencyDigests'),
    '$page.dependencyDigests',
  );
  const tokenRefs = requireStringArray(
    property(page, 'tokenRefs'),
    '$page.tokenRefs',
  );
  const landmarks = requireObjectArray(
    property(page, 'landmarks'),
    '$page.landmarks',
  );
  const outline = requireObjectArray(
    property(page, 'outline'),
    '$page.outline',
  );
  const nodes = parsePageNodes(property(page, 'nodes'));
  const sourceMapEntries = parseSourceMapEntries(property(sourceMap, 'entries'));
  const buildManifestClaims = requireStringArray(
    property(buildManifest, 'claims'),
    '$buildManifest.claims',
  );

  validatePageGraph({
    landmarks,
    nodes,
    outline,
    readingOrder,
    rootNodeId,
    tokenRefs,
  });
  validateSourceMap(pageId, nodes, sourceMap, sourceMapEntries);

  const pageHash = hashSource(input.page.source);
  validateBuildManifest({
    buildManifest,
    dependencyDigests,
    entityRef,
    pageHash,
    pageId,
    route,
  });

  return {
    buildManifest,
    buildManifestClaims,
    buildManifestHash: hashSource(input.buildManifest.source),
    compositionRef,
    dependencyDigests,
    entityRef,
    landmarks,
    nodes,
    outline,
    page,
    pageHash,
    pageId,
    readingOrder,
    rootNodeId,
    route,
    sourceMap,
    sourceMapEntries,
    sourceMapHash: hashSource(input.sourceMap.source),
    tokenRefs,
  };
}

function parseArtifact(
  artifact: ProfunctorPageArtifactInput,
  expectedVersion:
    | typeof PROFUNCTOR_PAGE_VERSION
    | typeof PROFUNCTOR_PAGE_SOURCE_MAP_VERSION
    | typeof PROFUNCTOR_BUILD_MANIFEST_VERSION,
): JsonObject {
  let parsed: JsonValue;
  try {
    parsed = canonicalJsonPort.parse(artifact.source);
  } catch {
    fail(
      'GEORDI_PAGE_INPUT_JSON_INVALID',
      artifact.filename,
      'Artifact must be valid canonical JSON.',
    );
  }

  const object = requireObject(parsed, artifact.filename);
  const version = requireString(
    object,
    'artifactVersion',
    `${artifact.filename}.artifactVersion`,
  );
  if (version !== expectedVersion) {
    fail(
      'GEORDI_PAGE_INPUT_VERSION_UNSUPPORTED',
      `${artifact.filename}.artifactVersion`,
      `Expected ${expectedVersion}.`,
    );
  }
  return object;
}

function parsePageNodes(value: JsonValue | undefined): readonly ParsedPageNode[] {
  const items = requireArray(value, '$page.nodes');
  if (items.length === 0) {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      '$page.nodes',
      'Page must contain at least one node.',
    );
  }

  return items.map((item, index) => {
    const path = `$page.nodes[${index}]`;
    const node = requireObject(item, path);
    const blockDefinitionId = requireString(
      node,
      'blockDefinitionId',
      `${path}.blockDefinitionId`,
    );
    if (!SUPPORTED_BLOCK_DEFINITIONS.has(blockDefinitionId)) {
      fail(
        'GEORDI_PAGE_BLOCK_UNSUPPORTED',
        `${path}.blockDefinitionId`,
        `No structural geometry is declared for ${blockDefinitionId}.`,
      );
    }

    const hidden = requireBoolean(node, 'hidden', `${path}.hidden`);
    const pageNodeId = requireString(node, 'pageNodeId', `${path}.pageNodeId`);
    const props = requireObject(property(node, 'props'), `${path}.props`);
    const requiredCapabilities = requireStringArray(
      property(node, 'requiredCapabilities'),
      `${path}.requiredCapabilities`,
    );
    const slots = parseSlots(property(node, 'slots'), `${path}.slots`);
    const sourceBindings = requireStringRecord(
      property(node, 'sourceBindings') ?? {},
      `${path}.sourceBindings`,
    );
    const templateNodeId = requireString(
      node,
      'templateNodeId',
      `${path}.templateNodeId`,
    );
    const tokens = requireStringRecord(
      property(node, 'tokens'),
      `${path}.tokens`,
    );

    return {
      blockDefinitionId,
      hidden,
      pageNodeId,
      props,
      requiredCapabilities,
      slots,
      sourceBindings,
      templateNodeId,
      tokens,
    };
  });
}

function parseSlots(
  value: JsonValue | undefined,
  path: string,
): readonly ParsedPageSlot[] {
  return requireArray(value, path).map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const slot = requireObject(item, itemPath);
    return {
      childPageNodeIds: requireStringArray(
        property(slot, 'childPageNodeIds'),
        `${itemPath}.childPageNodeIds`,
      ),
      name: requireString(slot, 'name', `${itemPath}.name`),
    };
  });
}

function parseSourceMapEntries(
  value: JsonValue | undefined,
): readonly ParsedSourceMapEntry[] {
  return requireArray(value, '$sourceMap.entries').map((item, index) => {
    const path = `$sourceMap.entries[${index}]`;
    const entry = requireObject(item, path);
    const residualValue = property(entry, 'residual');
    let residual: JsonObject | null;
    if (residualValue === null) {
      residual = null;
    } else {
      residual = requireObject(residualValue, `${path}.residual`);
    }

    return {
      pageNodeId: requireString(
        entry,
        'pageNodeId',
        `${path}.pageNodeId`,
      ),
      residual,
      source: requireObject(property(entry, 'source'), `${path}.source`),
      sourceOccurrenceId: requireString(
        entry,
        'sourceOccurrenceId',
        `${path}.sourceOccurrenceId`,
      ),
      templateNodeId: requireString(
        entry,
        'templateNodeId',
        `${path}.templateNodeId`,
      ),
    };
  });
}

interface PageGraphInput {
  readonly landmarks: readonly JsonObject[];
  readonly nodes: readonly ParsedPageNode[];
  readonly outline: readonly JsonObject[];
  readonly readingOrder: readonly string[];
  readonly rootNodeId: string;
  readonly tokenRefs: readonly string[];
}

function validatePageGraph(input: PageGraphInput): void {
  const nodesById = uniqueNodeMap(input.nodes);
  const templateIds = new Set<string>();
  for (const [index, node] of input.nodes.entries()) {
    if (templateIds.has(node.templateNodeId)) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `$page.nodes[${index}].templateNodeId`,
        `Duplicate template node ${node.templateNodeId}.`,
      );
    }
    templateIds.add(node.templateNodeId);
  }

  if (!nodesById.has(input.rootNodeId)) {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      '$page.rootNodeId',
      'Root node does not exist.',
    );
  }

  validateExactNodeOrder(input.nodes, input.readingOrder);
  validateSlots(input.nodes, nodesById, input.rootNodeId);
  validateNodeReferences(input.landmarks, '$page.landmarks', nodesById);
  validateNodeReferences(input.outline, '$page.outline', nodesById);
  validateTokens(input.nodes, input.tokenRefs);
}

function uniqueNodeMap(
  nodes: readonly ParsedPageNode[],
): ReadonlyMap<string, ParsedPageNode> {
  const nodesById = new Map<string, ParsedPageNode>();
  for (const [index, node] of nodes.entries()) {
    if (nodesById.has(node.pageNodeId)) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `$page.nodes[${index}].pageNodeId`,
        `Duplicate page node ${node.pageNodeId}.`,
      );
    }
    nodesById.set(node.pageNodeId, node);
  }
  return nodesById;
}

function validateExactNodeOrder(
  nodes: readonly ParsedPageNode[],
  readingOrder: readonly string[],
): void {
  if (readingOrder.length !== nodes.length) {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      '$page.readingOrder',
      'Reading order must contain every page node exactly once.',
    );
  }

  const seen = new Set<string>();
  for (const [index, id] of readingOrder.entries()) {
    if (seen.has(id) || nodes[index]?.pageNodeId !== id) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `$page.readingOrder[${index}]`,
        'Reading order must match canonical node order without duplicates.',
      );
    }
    seen.add(id);
  }
}

function validateSlots(
  nodes: readonly ParsedPageNode[],
  nodesById: ReadonlyMap<string, ParsedPageNode>,
  rootNodeId: string,
): void {
  const parentByChild = new Map<string, string>();
  for (const [nodeIndex, node] of nodes.entries()) {
    const slotNames = new Set<string>();
    for (const [slotIndex, slot] of node.slots.entries()) {
      const path = `$page.nodes[${nodeIndex}].slots[${slotIndex}]`;
      if (slotNames.has(slot.name)) {
        fail(
          'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
          `${path}.name`,
          `Duplicate slot ${slot.name}.`,
        );
      }
      slotNames.add(slot.name);

      for (const [childIndex, childId] of slot.childPageNodeIds.entries()) {
        if (!nodesById.has(childId) || childId === rootNodeId) {
          fail(
            'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
            `${path}.childPageNodeIds[${childIndex}]`,
            'Slot child must name an existing non-root page node.',
          );
        }
        if (parentByChild.has(childId)) {
          fail(
            'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
            `${path}.childPageNodeIds[${childIndex}]`,
            `Page node ${childId} has multiple parents.`,
          );
        }
        parentByChild.set(childId, node.pageNodeId);
      }
    }
  }

  for (const node of nodes) {
    if (node.pageNodeId !== rootNodeId && !parentByChild.has(node.pageNodeId)) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        '$page.nodes',
        `Page node ${node.pageNodeId} is not reachable from a slot.`,
      );
    }
  }
}

function validateNodeReferences(
  references: readonly JsonObject[],
  path: string,
  nodesById: ReadonlyMap<string, ParsedPageNode>,
): void {
  for (const [index, reference] of references.entries()) {
    const pageNodeId = requireString(
      reference,
      'pageNodeId',
      `${path}[${index}].pageNodeId`,
    );
    if (!nodesById.has(pageNodeId)) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `${path}[${index}].pageNodeId`,
        `Referenced page node ${pageNodeId} does not exist.`,
      );
    }
  }
}

function validateTokens(
  nodes: readonly ParsedPageNode[],
  tokenRefs: readonly string[],
): void {
  assertUniqueStrings(tokenRefs, '$page.tokenRefs');
  const declared = new Set(tokenRefs);
  const used = new Set<string>();
  for (const [nodeIndex, node] of nodes.entries()) {
    for (const [role, token] of Object.entries(node.tokens)) {
      if (!declared.has(token)) {
        fail(
          'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
          `$page.nodes[${nodeIndex}].tokens.${role}`,
          `Token ${token} is not declared by the page.`,
        );
      }
      used.add(token);
    }
  }
  for (const [index, token] of tokenRefs.entries()) {
    if (!used.has(token)) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `$page.tokenRefs[${index}]`,
        `Declared token ${token} is not bound to a page node.`,
      );
    }
  }
}

function validateSourceMap(
  pageId: string,
  nodes: readonly ParsedPageNode[],
  sourceMap: JsonObject,
  entries: readonly ParsedSourceMapEntry[],
): void {
  if (requireString(sourceMap, 'pageId', '$sourceMap.pageId') !== pageId) {
    fail(
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
      '$sourceMap.pageId',
      'Source-map page identity does not match the page artifact.',
    );
  }

  const nodesById = new Map(nodes.map((node) => [node.pageNodeId, node]));
  const entryKeys = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const node = nodesById.get(entry.pageNodeId);
    if (node?.templateNodeId !== entry.templateNodeId) {
      fail(
        'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
        `$sourceMap.entries[${index}]`,
        'Source-map entry does not resolve to its page and template node.',
      );
    }
    const key = `${entry.pageNodeId}\u0000${entry.sourceOccurrenceId}`;
    if (entryKeys.has(key)) {
      fail(
        'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
        `$sourceMap.entries[${index}]`,
        'Source-map page and occurrence identity is duplicated.',
      );
    }
    entryKeys.add(key);
  }

  const consumedEntries = new Set<string>();
  for (const [nodeIndex, node] of nodes.entries()) {
    for (const [binding, sourceOccurrenceId] of Object.entries(
      node.sourceBindings,
    )) {
      const matches = entries.filter(
        (entry) =>
          entry.pageNodeId === node.pageNodeId &&
          entry.sourceOccurrenceId === sourceOccurrenceId,
      );
      if (matches.length !== 1) {
        fail(
          'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
          `$page.nodes[${nodeIndex}].sourceBindings.${binding}`,
          'Source binding must resolve to exactly one source-map entry.',
        );
      }
      consumedEntries.add(`${node.pageNodeId}\u0000${sourceOccurrenceId}`);
    }
  }

  for (const [index, entry] of entries.entries()) {
    const key = `${entry.pageNodeId}\u0000${entry.sourceOccurrenceId}`;
    if (!consumedEntries.has(key)) {
      fail(
        'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
        `$sourceMap.entries[${index}]`,
        'Source-map entry is not owned by a page-node source binding.',
      );
    }
  }
}

interface BuildManifestValidationInput {
  readonly buildManifest: JsonObject;
  readonly dependencyDigests: readonly string[];
  readonly entityRef: string;
  readonly pageHash: string;
  readonly pageId: string;
  readonly route: string;
}

function validateBuildManifest(input: BuildManifestValidationInput): void {
  if (
    requireString(input.buildManifest, 'pageId', '$buildManifest.pageId') !==
    input.pageId
  ) {
    fail(
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
      '$buildManifest.pageId',
      'Build-manifest page identity does not match the page artifact.',
    );
  }

  const routes = requireStringArray(
    property(input.buildManifest, 'routes'),
    '$buildManifest.routes',
  );
  if (routes.length !== 1 || routes[0] !== input.route) {
    fail(
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
      '$buildManifest.routes',
      'Build-manifest route does not match the page artifact.',
    );
  }

  const dependencies = requireStringArray(
    property(input.buildManifest, 'dependencies'),
    '$buildManifest.dependencies',
  );
  if (!equalStrings(dependencies, input.dependencyDigests)) {
    fail(
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
      '$buildManifest.dependencies',
      'Build-manifest dependencies do not match the page artifact.',
    );
  }

  const entity = requireObject(
    property(input.buildManifest, 'entity'),
    '$buildManifest.entity',
  );
  if (
    requireString(entity, 'entityId', '$buildManifest.entity.entityId') !==
    input.entityRef
  ) {
    fail(
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
      '$buildManifest.entity.entityId',
      'Build-manifest entity does not match the page artifact.',
    );
  }

  const artifactDigest = requireString(
    input.buildManifest,
    'artifactDigest',
    '$buildManifest.artifactDigest',
  );
  if (artifactDigest !== input.pageHash) {
    fail(
      'GEORDI_PAGE_INPUT_DIGEST_MISMATCH',
      '$buildManifest.artifactDigest',
      'Build-manifest page digest does not match the exact page bytes.',
    );
  }
}

function requireObject(
  value: JsonValue | undefined,
  path: string,
): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      path,
      'Expected an object.',
    );
  }
  return value as JsonObject;
}

function requireArray(
  value: JsonValue | undefined,
  path: string,
): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      path,
      'Expected an array.',
    );
  }
  return value as readonly JsonValue[];
}

function requireObjectArray(
  value: JsonValue | undefined,
  path: string,
): readonly JsonObject[] {
  return requireArray(value, path).map((item, index) =>
    requireObject(item, `${path}[${index}]`),
  );
}

function requireString(
  object: JsonObject,
  key: string,
  path: string,
): string {
  const value = property(object, key);
  if (typeof value !== 'string' || value.length === 0) {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      path,
      'Expected a non-empty string.',
    );
  }
  return value;
}

function requireBoolean(
  object: JsonObject,
  key: string,
  path: string,
): boolean {
  const value = property(object, key);
  if (typeof value !== 'boolean') {
    fail(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      path,
      'Expected a boolean.',
    );
  }
  return value;
}

function requireStringArray(
  value: JsonValue | undefined,
  path: string,
): readonly string[] {
  return requireArray(value, path).map((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `${path}[${index}]`,
        'Expected a non-empty string.',
      );
    }
    return item;
  });
}

function requireStringRecord(
  value: JsonValue | undefined,
  path: string,
): Readonly<Record<string, string>> {
  const object = requireObject(value, path);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(object)) {
    if (typeof item !== 'string' || item.length === 0) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `${path}.${key}`,
        'Expected a non-empty string value.',
      );
    }
    result[key] = item;
  }
  return result;
}

function assertUniqueStrings(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      fail(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `${path}[${index}]`,
        `Duplicate value ${value}.`,
      );
    }
    seen.add(value);
  }
}

function equalStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => right[index] === value)
  );
}

function property(object: JsonObject, key: string): JsonValue | undefined {
  return object[key];
}

function hashSource(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function fail(
  code: ProfunctorPageDiagnosticCode,
  path: string,
  detail: string,
): never {
  throw new ProfunctorPageTargetError(code, path, detail);
}
