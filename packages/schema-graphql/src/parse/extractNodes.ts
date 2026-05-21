import {
  type DirectiveNode,
} from 'graphql';
import { ParseError, GeordiErrorCode } from '@flyingrobots/geordi-compiler-core';
import type { Diagnostic, NodeKind, SourceRef } from '@flyingrobots/geordi-compiler-core';
import { isGeordiNodeKind } from '../directives/v1';
import type { ExtractedScene } from './extractScene';
import { nodeSourceRef } from './sourceRef';

export interface ExtractedNode {
  fieldName: string;
  kind: NodeKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  zIndex?: number;
  visible?: boolean;
  parent?: string;
  id?: string;
  props?: Record<string, unknown>;
  sourceRef: SourceRef;
  fieldOrder: number;
}

function getDirectiveArgValue(
  directive: DirectiveNode,
  argName: string,
): string | number | boolean | undefined {
  const arg = directive.arguments?.find((a) => a.name.value === argName);
  if (!arg) return undefined;
  switch (arg.value.kind) {
    case 'StringValue':
      return arg.value.value;
    case 'IntValue':
      return parseInt(arg.value.value, 10);
    case 'FloatValue':
      return parseFloat(arg.value.value);
    case 'BooleanValue':
      return arg.value.value;
    case 'EnumValue':
      return arg.value.value;
    default:
      return undefined;
  }
}

const KNOWN_GEORDI_DIRS = new Set(['geordi_scene', 'geordi_node', 'geordi_bind', 'geordi_style']);

/**
 * Extracts all @geordi_node field definitions from the scene type.
 * - `GEORDI_W_UNUSED_FIELD` only for unknown directives with `geordi_` prefix
 * - Silently ignores non-`geordi_` directives (GraphQL ecosystem compatibility)
 */
export function extractNodes(
  scene: ExtractedScene,
  diagnostics: Diagnostic[],
  filename?: string,
): ExtractedNode[] {
  const nodes: ExtractedNode[] = [];
  const fields = scene.typeNode.fields ?? [];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const sourceRef = nodeSourceRef(field, filename);

    // Check for unknown geordi_* directives (warn only for geordi_ prefixed)
    if (field.directives) {
      for (const dir of field.directives) {
        if (dir.name.value.startsWith('geordi_') && !KNOWN_GEORDI_DIRS.has(dir.name.value)) {
          diagnostics.push({
            code: GeordiErrorCode.W_UNUSED_FIELD,
            severity: 'warning',
            message: `Unknown Geordi directive @${dir.name.value} on field "${field.name.value}" — ignoring`,
            location: nodeSourceRef(dir, filename),
          });
        }
      }
    }

    const nodeDir = field.directives?.find((d) => d.name.value === 'geordi_node');
    if (!nodeDir) continue;

    // Extract kind (required enum arg)
    const kindRaw = getDirectiveArgValue(nodeDir, 'kind');
    if (!isGeordiNodeKind(kindRaw)) {
      diagnostics.push(
        new ParseError(
          GeordiErrorCode.E_NODE_KIND_INVALID,
          `Invalid or missing node kind "${String(kindRaw ?? '')}" on field "${field.name.value}". Valid kinds: Rect, Text, Image, Group, Line, Ellipse, Path`,
          { location: sourceRef },
        ).toDiagnostic(),
      );
      continue;
    }

    const kind = kindRaw as NodeKind;

    // Extract geometry
    const x = (getDirectiveArgValue(nodeDir, 'x') as number | undefined) ?? 0;
    const y = (getDirectiveArgValue(nodeDir, 'y') as number | undefined) ?? 0;
    const width = getDirectiveArgValue(nodeDir, 'width') as number | undefined;
    const height = getDirectiveArgValue(nodeDir, 'height') as number | undefined;
    const zIndex = getDirectiveArgValue(nodeDir, 'zIndex') as number | undefined;
    const visible = getDirectiveArgValue(nodeDir, 'visible') as boolean | undefined;
    const parent = getDirectiveArgValue(nodeDir, 'parent') as string | undefined;
    const id = getDirectiveArgValue(nodeDir, 'id') as string | undefined;

    // Parse props JSON arg if present
    let props: Record<string, unknown> | undefined;
    const propsRaw = getDirectiveArgValue(nodeDir, 'props') as string | undefined;
    if (propsRaw) {
      try {
        const parsed = JSON.parse(propsRaw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          props = parsed as Record<string, unknown>;
        } else {
          diagnostics.push({
            code: GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
            severity: 'warning',
            message: `Field "${field.name.value}" props argument must be a JSON object — ignoring`,
            location: sourceRef,
          });
        }
      } catch {
        diagnostics.push({
          code: GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
          severity: 'warning',
          message: `Field "${field.name.value}" has an invalid props JSON value — ignoring props argument`,
          location: sourceRef,
        });
      }
    }

    nodes.push({
      fieldName: field.name.value,
      kind,
      x,
      y,
      width,
      height,
      zIndex,
      visible,
      parent,
      id,
      props,
      sourceRef,
      fieldOrder: i,
    });
  }

  return nodes;
}
