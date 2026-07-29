import { createHash } from 'node:crypto';
import {
  canonicalJsonPort,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  validateGeordiIr,
  type JsonObject,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  PROFUNCTOR_PAGE_TARGET_IR_PATH,
  PROFUNCTOR_PAGE_TARGET_MAP_PATH,
  PROFUNCTOR_PAGE_TARGET_MAP_VERSION,
  PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH,
  PROFUNCTOR_PAGE_TARGET_PROFILE,
  PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH,
  PROFUNCTOR_PAGE_TARGET_RECEIPT_VERSION,
  ProfunctorPageTargetError,
  type ParsedPageNode,
  type ParsedProfunctorPage,
  type ProfunctorPageInput,
  type ProfunctorPageTargetArtifact,
  type ProfunctorPageTargetResult,
} from './contracts.js';
import { parseProfunctorPageArtifacts } from './parse.js';
import {
  PROFUNCTOR_PAGE_CANVAS,
  PROFUNCTOR_PAGE_FEATURES,
  PROFUNCTOR_PAGE_TARGET_CLAIMS,
  PROFUNCTOR_PAGE_TARGET_NONCLAIMS,
  PROFUNCTOR_PAGE_TOKEN_VALUES,
  profunctorPageBlockGeometry,
  type ProfunctorPageBlockGeometry,
  type ProfunctorPageTokenReference,
} from './profile.js';
import {
  renderProfunctorPageStructuralPreview,
  type PreviewNode,
} from './preview.js';

const HASH_ALGORITHM = 'sha256' as const;
const HASH_PREFIX = 'sha256:' as const;
const COMPARATOR_VERSION = 'geordi-profunctor-page-comparator/1' as const;

interface TargetAction extends JsonObject {
  readonly activationResidual: 'native-link-activation-unsupported';
  readonly href: string;
  readonly id: string;
  readonly label: string;
  readonly role: 'documentation' | 'feature' | 'related-project' | 'source';
}

interface TargetNode {
  readonly actions: readonly TargetAction[];
  readonly geometry: ProfunctorPageBlockGeometry;
  readonly pageNode: ParsedPageNode;
  readonly renderNodeId: string;
  readonly tokenReference: ProfunctorPageTokenReference;
  readonly tokenValue: string;
}

export function lowerProfunctorPageArtifacts(
  input: ProfunctorPageInput,
): ProfunctorPageTargetResult {
  const parsed = parseProfunctorPageArtifacts(input);
  const root = parsed.nodes.find(
    (node) => node.pageNodeId === parsed.rootNodeId,
  );
  if (!root) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      '$page.rootNodeId',
      'Validated root node is unavailable.',
    );
  }

  const targetNodes = parsed.nodes
    .filter((node) => !node.hidden)
    .map((node) => targetNode(node, root));
  const ir = buildIr(parsed, targetNodes);
  validateProfunctorPageTargetIr(ir);

  const map = buildTargetMap(parsed, targetNodes);
  const preview = renderProfunctorPageStructuralPreview(
    parsed.pageId,
    parsed.route,
    parsed.rootNodeId,
    targetNodes.map((node) => previewNode(node)),
  );
  const irArtifact = jsonArtifact(PROFUNCTOR_PAGE_TARGET_IR_PATH, ir);
  const mapArtifact = jsonArtifact(PROFUNCTOR_PAGE_TARGET_MAP_PATH, map);
  const previewArtifact = svgArtifact(preview);
  const receipt = buildReceipt(
    parsed,
    targetNodes,
    irArtifact,
    mapArtifact,
    previewArtifact,
  );

  return {
    artifacts: {
      ir: irArtifact,
      map: mapArtifact,
      preview: previewArtifact,
      receipt: jsonArtifact(PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH, receipt),
    },
    pageId: parsed.pageId,
    targetProfile: PROFUNCTOR_PAGE_TARGET_PROFILE,
  };
}

export function validateProfunctorPageTargetIr(ir: JsonObject): void {
  const irValidation = validateGeordiIr(ir);
  if (!irValidation.ok) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_OUTPUT_INVALID',
      irValidation.issues[0]?.path ?? '$ir',
      irValidation.issues[0]?.message ?? 'Emitted Geordi IR is invalid.',
    );
  }
}

function targetNode(
  node: ParsedPageNode,
  root: ParsedPageNode,
): TargetNode {
  const geometry = geometryFor(node);
  const tokenReference = root.tokens[geometry.fillTokenRole];
  if (!isTargetTokenReference(tokenReference)) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      `$page.nodes.${node.pageNodeId}.tokens.${geometry.fillTokenRole}`,
      `Target profile requires token role ${geometry.fillTokenRole}.`,
    );
  }

  return {
    actions: actionsFor(node),
    geometry,
    pageNode: node,
    renderNodeId: renderNodeId(node.pageNodeId),
    tokenReference,
    tokenValue: PROFUNCTOR_PAGE_TOKEN_VALUES[tokenReference],
  };
}

function geometryFor(node: ParsedPageNode): ProfunctorPageBlockGeometry {
  const geometry = profunctorPageBlockGeometry(node.blockDefinitionId);
  if (!geometry) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_BLOCK_UNSUPPORTED',
      `$page.nodes.${node.pageNodeId}.blockDefinitionId`,
      `No geometry exists for ${node.blockDefinitionId}.`,
    );
  }
  return geometry;
}

function buildIr(
  parsed: ParsedProfunctorPage,
  nodes: readonly TargetNode[],
): JsonObject {
  return {
    animations: [],
    bindings: [],
    irVersion: GEORDI_IR_VERSION,
    nodes: nodes.map((node) => ({
      id: node.renderNodeId,
      kind: 'Rect',
      props: {
        actionCount: node.actions.length,
        fill: node.tokenValue,
        height: node.geometry.height,
        pageNodeId: node.pageNode.pageNodeId,
        sourceTokenRef: node.tokenReference,
        templateNodeId: node.pageNode.templateNodeId,
        width: node.geometry.width,
        x: node.geometry.x,
        y: node.geometry.y,
      },
    })),
    numericProfile: GEORDI_NUMERIC_PROFILE,
    requires: [...PROFUNCTOR_PAGE_FEATURES],
    scene: {
      height: PROFUNCTOR_PAGE_CANVAS.height,
      id: `geordi-target:${parsed.pageId}`,
      units: 'px',
      width: PROFUNCTOR_PAGE_CANVAS.width,
    },
  };
}

function buildTargetMap(
  parsed: ParsedProfunctorPage,
  nodes: readonly TargetNode[],
): JsonObject {
  const targetByPageNode = new Map(
    nodes.map((node) => [node.pageNode.pageNodeId, node]),
  );

  return {
    entries: parsed.nodes.map((pageNode) => {
      const target = targetByPageNode.get(pageNode.pageNodeId);
      if (!target) {
        return {
          actions: [],
          blockDefinitionId: pageNode.blockDefinitionId,
          hidden: true,
          inputCapabilities: [...pageNode.requiredCapabilities],
          pageNodeId: pageNode.pageNodeId,
          renderNodeId: null,
          residuals: [
            {
              capability: 'visibility',
              code: 'hidden-page-node',
              reason: 'The source page marks this node hidden.',
            },
          ],
          sources: sourcesFor(parsed, pageNode),
          templateNodeId: pageNode.templateNodeId,
          tokenBindings: tokenBindingsFor(pageNode),
        };
      }

      return {
        actions: [...target.actions],
        blockDefinitionId: pageNode.blockDefinitionId,
        hidden: false,
        inputCapabilities: [...pageNode.requiredCapabilities],
        pageNodeId: pageNode.pageNodeId,
        renderNodeId: target.renderNodeId,
        residuals: residualsFor(pageNode),
        sources: sourcesFor(parsed, pageNode),
        structuralPaint: {
          role: target.geometry.fillTokenRole,
          tokenReference: target.tokenReference,
          value: target.tokenValue,
        },
        templateNodeId: pageNode.templateNodeId,
        tokenBindings: tokenBindingsFor(pageNode),
      };
    }),
    inputCapabilities: [...parsed.capabilityRequirements],
    irVersion: GEORDI_IR_VERSION,
    pageId: parsed.pageId,
    residuals: capabilityResiduals(parsed.capabilityRequirements),
    route: parsed.route,
    targetProfile: PROFUNCTOR_PAGE_TARGET_PROFILE,
    tokenTable: parsed.tokenRefs.map((reference) => ({
      reference,
      value: tokenValue(reference),
    })),
    version: PROFUNCTOR_PAGE_TARGET_MAP_VERSION,
  };
}

function buildReceipt(
  parsed: ParsedProfunctorPage,
  nodes: readonly TargetNode[],
  ir: ProfunctorPageTargetArtifact,
  map: ProfunctorPageTargetArtifact,
  preview: ProfunctorPageTargetArtifact,
): JsonObject {
  return {
    comparatorVersion: COMPARATOR_VERSION,
    compositionRef: parsed.compositionRef,
    entityRef: parsed.entityRef,
    hashAlgorithm: HASH_ALGORITHM,
    inputHashes: {
      buildManifest: parsed.buildManifestHash,
      page: parsed.pageHash,
      sourceMap: parsed.sourceMapHash,
    },
    inputCapabilities: [...parsed.capabilityRequirements],
    inputNodeCount: parsed.nodes.length,
    irVersion: GEORDI_IR_VERSION,
    numericProfile: GEORDI_NUMERIC_PROFILE,
    outputHashes: {
      ir: hashSource(ir.content),
      map: hashSource(map.content),
      preview: hashSource(preview.content),
    },
    outputRenderNodeCount: nodes.length,
    pageId: parsed.pageId,
    route: parsed.route,
    targetClaims: [...PROFUNCTOR_PAGE_TARGET_CLAIMS],
    targetNonclaims: [...PROFUNCTOR_PAGE_TARGET_NONCLAIMS],
    targetProfile: PROFUNCTOR_PAGE_TARGET_PROFILE,
    upstreamClaims: [...parsed.buildManifestClaims],
    upstreamClaimsInherited: false,
    version: PROFUNCTOR_PAGE_TARGET_RECEIPT_VERSION,
  };
}

function sourcesFor(
  parsed: ParsedProfunctorPage,
  node: ParsedPageNode,
): readonly JsonObject[] {
  return parsed.sourceMapEntries
    .filter((entry) => entry.pageNodeId === node.pageNodeId)
    .map((entry) => ({
      source: entry.source,
      sourceOccurrenceId: entry.sourceOccurrenceId,
      upstreamResidual: entry.residual,
    }));
}

function tokenBindingsFor(node: ParsedPageNode): readonly JsonObject[] {
  return Object.entries(node.tokens).map(([role, reference]) => ({
    reference,
    role,
    targetValue: tokenValue(reference),
  }));
}

function residualsFor(node: ParsedPageNode): readonly JsonObject[] {
  return [
    {
      capability: 'general-text',
      code: 'general-text-unsupported',
      reason: 'The structural target emits no Geordi Text nodes.',
    },
    ...capabilityResiduals(node.requiredCapabilities),
  ];
}

function capabilityResiduals(
  capabilities: readonly string[],
): readonly JsonObject[] {
  return capabilities.map((capability) => ({
    capability,
    code: `${capability}-unsupported`,
    reason: `The structural target does not claim ${capability}.`,
  }));
}

function actionsFor(node: ParsedPageNode): readonly TargetAction[] {
  const actions: TargetAction[] = [];
  pushUrlAction(
    actions,
    node.pageNodeId,
    node.props,
    'documentationUrl',
    'documentation',
    'Documentation',
  );
  pushUrlAction(
    actions,
    node.pageNodeId,
    node.props,
    'sourceUrl',
    'source',
    'Source',
  );

  const featureLabel = optionalActionString(
    node.props,
    'featureLabel',
    `$page.nodes.${node.pageNodeId}.props.featureLabel`,
  );
  const featureUrl = optionalActionString(
    node.props,
    'featureUrl',
    `$page.nodes.${node.pageNodeId}.props.featureUrl`,
  );
  if ((featureLabel === undefined) !== (featureUrl === undefined)) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      `$page.nodes.${node.pageNodeId}.props`,
      'Feature label and URL must be present together.',
    );
  }
  if (featureLabel && featureUrl) {
    actions.push(action(node.pageNodeId, 'feature', featureLabel, featureUrl));
  }

  const relatedProjects = node.props.relatedProjects;
  if (relatedProjects !== undefined && relatedProjects !== null) {
    if (!Array.isArray(relatedProjects)) {
      throw new ProfunctorPageTargetError(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `$page.nodes.${node.pageNodeId}.props.relatedProjects`,
        'Related projects must be an array.',
      );
    }
    const items = relatedProjects as readonly JsonValue[];
    for (const [index, item] of items.entries()) {
      if (!isJsonObject(item)) {
        throw new ProfunctorPageTargetError(
          'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
          `$page.nodes.${node.pageNodeId}.props.relatedProjects[${index}]`,
          'Related project must be an object.',
        );
      }
      const path = `$page.nodes.${node.pageNodeId}.props.relatedProjects[${index}]`;
      const label = requiredActionString(item, 'displayTitle', path);
      const href = requiredActionString(item, 'route', path);
      actions.push(action(node.pageNodeId, 'related-project', label, href));
    }
  }
  assertUniqueActions(node, actions);
  return actions;
}

function pushUrlAction(
  actions: TargetAction[],
  pageNodeId: string,
  props: JsonObject,
  key: string,
  role: TargetAction['role'],
  label: string,
): void {
  const href = optionalActionString(
    props,
    key,
    `$page.nodes.${pageNodeId}.props.${key}`,
  );
  if (href) {
    actions.push(action(pageNodeId, role, label, href));
  }
}

function assertUniqueActions(
  node: ParsedPageNode,
  actions: readonly TargetAction[],
): void {
  const seen = new Set<string>();
  for (const [index, targetAction] of actions.entries()) {
    if (seen.has(targetAction.id)) {
      throw new ProfunctorPageTargetError(
        'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
        `$page.nodes.${node.pageNodeId}.actions[${index}]`,
        `Duplicate target action ${targetAction.id}.`,
      );
    }
    seen.add(targetAction.id);
  }
}

function action(
  pageNodeId: string,
  role: TargetAction['role'],
  label: string,
  href: string,
): TargetAction {
  return {
    activationResidual: 'native-link-activation-unsupported',
    href,
    id: `action:${pageNodeId}:${role}:${href}`,
    label,
    role,
  };
}

function previewNode(node: TargetNode): PreviewNode {
  return {
    actionCount: node.actions.length,
    fill: node.tokenValue,
    geometry: node.geometry,
    pageNode: node.pageNode,
    renderNodeId: node.renderNodeId,
    tokenReference: node.tokenReference,
  };
}

function renderNodeId(pageNodeId: string): string {
  return `geordi-node:${pageNodeId}`;
}

function tokenValue(reference: string): string {
  if (!isTargetTokenReference(reference)) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      '$page.tokenRefs',
      `Target profile has no value for ${reference}.`,
    );
  }
  return PROFUNCTOR_PAGE_TOKEN_VALUES[reference];
}

function isTargetTokenReference(
  value: string | undefined,
): value is ProfunctorPageTokenReference {
  return (
    value !== undefined &&
    Object.hasOwn(PROFUNCTOR_PAGE_TOKEN_VALUES, value)
  );
}

function optionalActionString(
  object: JsonObject,
  key: string,
  path: string,
): string | undefined {
  const value = object[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      path,
      'Action value must be a non-empty string or null.',
    );
  }
  return value;
}

function requiredActionString(
  object: JsonObject,
  key: string,
  path: string,
): string {
  const value = optionalActionString(object, key, `${path}.${key}`);
  if (!value) {
    throw new ProfunctorPageTargetError(
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      `${path}.${key}`,
      'Related project action value is required.',
    );
  }
  return value;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonArtifact(
  path: string,
  value: JsonObject,
): ProfunctorPageTargetArtifact {
  return {
    content: `${canonicalJsonPort.stringify(value, { space: 2 })}\n`,
    encoding: 'utf8',
    mediaType: 'application/json',
    path,
  };
}

function svgArtifact(content: string): ProfunctorPageTargetArtifact {
  return {
    content,
    encoding: 'utf8',
    mediaType: 'image/svg+xml',
    path: PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH,
  };
}

function hashSource(source: string): string {
  return `${HASH_PREFIX}${createHash(HASH_ALGORITHM).update(source).digest('hex')}`;
}
