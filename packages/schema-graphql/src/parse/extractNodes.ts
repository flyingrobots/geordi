import { ParseError, GeordiErrorCode, parseJsonValue } from '@flyingrobots/geordi-compiler-core';
import type { Diagnostic, JsonObject, JsonValue, NodeKind, SourceRef } from '@flyingrobots/geordi-compiler-core';
import { isGeordiNodeKind } from '../directives/geordiDirectives.js';
import {
  readOptionalBooleanArg,
  readOptionalFloatArg,
  readOptionalIntArg,
  readOptionalStringArg,
  readRequiredEnumArg,
  type DirectiveArgReaderContext,
} from './directiveArgs.js';
import type { ExtractedScene } from './extractScene.js';
import { nodeSourceRef } from './sourceRef.js';

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
  props?: JsonObject;
  sourceRef: SourceRef;
  fieldOrder: number;
}

const KNOWN_GEORDI_DIRS = new Set(['geordi_scene', 'geordi_node', 'geordi_bind', 'geordi_style']);
const UNLOWERED_GEORDI_DIRS = new Set(['geordi_bind', 'geordi_style']);

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

    // Check Geordi directives before lowering the node payload.
    if (field.directives) {
      for (const dir of field.directives) {
        if (UNLOWERED_GEORDI_DIRS.has(dir.name.value)) {
          pushUnloweredDirectiveError(
            diagnostics,
            field.name.value,
            dir.name.value,
            nodeSourceRef(dir, filename),
          );
          continue;
        }

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

    const argContext: DirectiveArgReaderContext = {
      directive: nodeDir,
      directiveName: 'geordi_node',
      diagnostics,
      filename,
      owner: `field "${field.name.value}"`,
    };

    // Extract kind (required enum arg)
    const kindRaw = readRequiredEnumArg(argContext, 'kind');
    if (kindRaw === undefined) {
      continue;
    }

    if (!isGeordiNodeKind(kindRaw)) {
      diagnostics.push(
        new ParseError(
          GeordiErrorCode.E_NODE_KIND_INVALID,
          `Invalid node kind "${kindRaw}" on field "${field.name.value}". Valid kinds: Rect, Text, Image, Group, Line, Ellipse, Path`,
          { location: sourceRef },
        ).toDiagnostic(),
      );
      continue;
    }

    const kind = kindRaw;

    // Extract geometry
    const x = readOptionalFloatArg(argContext, 'x') ?? 0;
    const y = readOptionalFloatArg(argContext, 'y') ?? 0;
    const width = readOptionalFloatArg(argContext, 'width');
    const height = readOptionalFloatArg(argContext, 'height');
    const zIndex = readOptionalIntArg(argContext, 'zIndex');
    const visible = readOptionalBooleanArg(argContext, 'visible');
    const parent = readOptionalStringArg(argContext, 'parent');
    const id = readOptionalStringArg(argContext, 'id');

    // Parse props JSON arg if present
    let props: JsonObject | undefined;
    const propsRaw = readOptionalStringArg(argContext, 'props');
    if (propsRaw !== undefined) {
      try {
        const parsed = parseJsonValue(propsRaw);
        if (isJsonObject(parsed)) {
          props = parsed;
        } else {
          pushPropsInvalidType(diagnostics, field.name.value, sourceRef);
        }
      } catch {
        pushPropsInvalidType(diagnostics, field.name.value, sourceRef);
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

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushPropsInvalidType(
  diagnostics: Diagnostic[],
  fieldName: string,
  sourceRef: SourceRef,
): void {
  diagnostics.push(
    new ParseError(
      GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
      `Field "${fieldName}" @geordi_node argument props must be a JSON object string`,
      {
        location: sourceRef,
        details: {
          directive: 'geordi_node',
          argument: 'props',
          expected: 'json-object-string',
        },
      },
    ).toDiagnostic(),
  );
}

function pushUnloweredDirectiveError(
  diagnostics: Diagnostic[],
  fieldName: string,
  directiveName: string,
  sourceRef: SourceRef,
): void {
  diagnostics.push(
    new ParseError(
      GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED,
      `@${directiveName} on field "${fieldName}" is declared but is not lowered into canonical AST yet`,
      {
        location: sourceRef,
        details: {
          directive: directiveName,
          field: fieldName,
          phase: 'schema-graphql',
        },
      },
    ).toDiagnostic(),
  );
}
