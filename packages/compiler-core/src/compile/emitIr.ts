import type { CanonicalSceneAst } from '../types/ast.js';
import type { CompilerInput } from '../types/compiler.js';
import type { Artifact } from '../types/artifacts.js';
import {
  GEORDI_IR_ARTIFACT_KEY,
  GEORDI_IR_HASH_ALGORITHM,
  GEORDI_IR_RECEIPT_KEY,
  GEORDI_IR_VERSION,
} from '@flyingrobots/geordi-core';
import { stringifyCanonicalJson } from '../ports/json.js';
import { hashString } from '../canonical/hashing.js';
import { cmpStr } from '../util/identifiers.js';

export const COMPARATOR_VERSION = '1' as const;
export const IR_VERSION = GEORDI_IR_VERSION;
export const IR_ARTIFACT_KEY = GEORDI_IR_ARTIFACT_KEY;
export const IR_RECEIPT_KEY = GEORDI_IR_RECEIPT_KEY;

/**
 * Phase 1: Topological sort by parentId DAG.
 * Phase 2: Tie-breaking at each step by (zIndex ASC, kind ASC, id ASC).
 *
 * Nodes without parentId are roots and enter the ready queue first.
 * sourceRef and __typename are stripped.
 */
export function emitGeordiIrArtifact(ast: CanonicalSceneAst): Artifact {
  const sorted = topoSort(ast);

  const content = stringifyCanonicalJson(
    {
      irVersion: IR_VERSION,
      scene: ast.scene,
      nodes: sorted,
      bindings: ast.bindings ?? [],
      animations: ast.animations ?? [],
    },
    { space: 2 },
  );

  return {
    path: IR_ARTIFACT_KEY,
    content,
    mediaType: 'application/json',
    encoding: 'utf8',
  };
}

export const IR_HASH_ALG = GEORDI_IR_HASH_ALGORITHM;

export function emitReceiptArtifact(
  input: CompilerInput,
  irContent: string,
  ruleIds: readonly string[],
): Artifact {
  const inputHash = hashString(input.source);
  const irHash = hashString(irContent);
  const rulesetFingerprint = hashString([...ruleIds].sort().join('\n'));

  const content = stringifyCanonicalJson(
    {
      comparatorVersion: COMPARATOR_VERSION,
      inputHash,
      irHash,
      irHashAlg: IR_HASH_ALG,
      irVersion: IR_VERSION,
      rulesetFingerprint,
    },
    { space: 2 },
  );

  return {
    path: IR_RECEIPT_KEY,
    content,
    mediaType: 'application/json',
    encoding: 'utf8',
  };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function normalizeZIndex(z: number | undefined): number {
  return z === undefined ? 0 : Number.isFinite(z) ? z : 0;
}

type SanitizedNode = Omit<CanonicalSceneAst['nodes'][number], 'sourceRef' | '__typename'>;

function sanitize(node: CanonicalSceneAst['nodes'][number]): SanitizedNode {
  const clean: SanitizedNode = {
    id: node.id,
    kind: node.kind,
    parentId: node.parentId,
    zIndex: node.zIndex,
    visible: node.visible,
    locked: node.locked,
    props: node.props,
    style: node.style,
  };

  return clean;
}

function topoSort(ast: CanonicalSceneAst): SanitizedNode[] {
  const nodes = ast.nodes;
  if (nodes.length === 0) return [];

  // Build adjacency: parent → [children]
  const children = new Map<string, CanonicalSceneAst['nodes'][number][]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    if (!children.has(node.id)) children.set(node.id, []);
    if (!inDegree.has(node.id)) inDegree.set(node.id, 0);
  }

  for (const node of nodes) {
    if (node.parentId !== undefined) {
      const parentChildren = children.get(node.parentId);
      if (!parentChildren) {
        continue;
      }

      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      parentChildren.push(node);
    }
  }

  // Initial ready queue: root nodes (in-degree 0), sorted by tie-breaker
  const ready: CanonicalSceneAst['nodes'][number][] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
      ready.push(node);
    }
  }
  sortReady(ready);

  const result: SanitizedNode[] = [];

  // Use an index pointer instead of shift() to avoid O(n) array reindexing per dequeue.
  // Newly-ready children are collected per iteration, sorted once, then merged into the
  // unprocessed tail — keeping the queue sorted without a full re-sort each insertion.
  let qi = 0;
  while (qi < ready.length) {
    const node = ready[qi++];
    result.push(sanitize(node));

    const newlyReady: CanonicalSceneAst['nodes'][number][] = [];
    for (const child of children.get(node.id) ?? []) {
      const newDeg = (inDegree.get(child.id) ?? 0) - 1;
      inDegree.set(child.id, newDeg);
      if (newDeg === 0) {
        newlyReady.push(child);
      }
    }

    if (newlyReady.length > 0) {
      sortReady(newlyReady);
      // Merge the sorted tail with sorted new arrivals, then replace the tail.
      const tail = ready.splice(qi);
      tail.push(...newlyReady);
      sortReady(tail);
      for (const n of tail) ready.push(n);
    }
  }

  // Any nodes with remaining in-degree > 0 are in cycles — append sorted by tie-breaker
  const remaining: CanonicalSceneAst['nodes'][number][] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) > 0) {
      remaining.push(node);
    }
  }
  sortReady(remaining);
  for (const node of remaining) {
    result.push(sanitize(node));
  }

  return result;
}

function sortReady(arr: CanonicalSceneAst['nodes'][number][]): void {
  arr.sort((a, b) => {
    const zDiff = normalizeZIndex(a.zIndex) - normalizeZIndex(b.zIndex);
    if (zDiff !== 0) return zDiff;
    const kindCmp = cmpStr(a.kind, b.kind);
    if (kindCmp !== 0) return kindCmp;
    return cmpStr(a.id, b.id);
  });
}
