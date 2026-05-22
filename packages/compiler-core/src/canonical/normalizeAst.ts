import type { CanonicalSceneAst, Node } from '../types/ast.js';
import { normalizeJsonValue } from '../ports/json.js';
import { cmpStr } from '../util/identifiers.js';

export function normalizeCanonicalAst(ast: CanonicalSceneAst): CanonicalSceneAst {
  return {
    kind: 'Scene',
    astVersion: '1',
    scene: normalizeJsonValue(ast.scene) as CanonicalSceneAst['scene'],
    nodes: [...ast.nodes].map(normalizeNode).sort(compareNodes),
    bindings: [...(ast.bindings ?? [])].sort((a, b) => cmpStr(a.id, b.id)),
    animations: [...(ast.animations ?? [])].sort((a, b) => cmpStr(a.id, b.id)),
    metadata: ast.metadata ? (normalizeJsonValue(ast.metadata) as CanonicalSceneAst['metadata']) : undefined,
  };
}

function normalizeNode(node: Node): Node {
  return normalizeJsonValue(node) as Node;
}

function compareNodes(a: Node, b: Node): number {
  const zDiff = normalizeZIndex(a.zIndex) - normalizeZIndex(b.zIndex);
  if (zDiff !== 0) {
    return zDiff;
  }

  const kindCmp = cmpStr(a.kind, b.kind);
  if (kindCmp !== 0) {
    return kindCmp;
  }

  return cmpStr(a.id, b.id);
}

function normalizeZIndex(value: number | undefined): number {
  return value === undefined ? 0 : Number.isFinite(value) ? value : 0;
}
