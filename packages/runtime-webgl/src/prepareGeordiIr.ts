import { validateGeordiIr } from '@flyingrobots/geordi-core';
import type {
  Bounds,
  GeordiIrNode,
  GeordiIr,
  GeordiIrValidationIssue,
  JsonObject,
  JsonValue,
  NodeStyle,
  PaintStyle,
  PreparedGeordiNode,
  PreparedGeordiScene,
  SolidFill,
  TextStyle,
} from '@flyingrobots/geordi-core';
import { assertSupportedRuntimeProfile } from './profile.js';

export class GeordiRuntimeInvalidIrError extends Error {
  public readonly issues: readonly GeordiIrValidationIssue[];

  constructor(issues: readonly GeordiIrValidationIssue[]) {
    super('Invalid Geordi IR');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class GeordiRuntimeUnsupportedNodeKindError extends Error {
  public readonly nodeKind: string;

  constructor(nodeKind: string) {
    super(`Unsupported runtime node kind: ${nodeKind}`);
    this.name = new.target.name;
    this.nodeKind = nodeKind;
  }
}

export class GeordiRuntimeInvalidNodePropsError extends Error {
  public readonly nodeId: string;
  public readonly prop: string;
  public readonly expected: string;

  constructor(nodeId: string, prop: string, expected: string) {
    super('Invalid runtime node props');
    this.name = new.target.name;
    this.nodeId = nodeId;
    this.prop = prop;
    this.expected = expected;
  }
}

export function prepareGeordiIr(ir: GeordiIr): PreparedGeordiScene {
  assertSupportedRuntimeProfile(ir);

  const result = validateGeordiIr(ir);
  if (!result.ok) {
    throw new GeordiRuntimeInvalidIrError(result.issues);
  }

  return {
    version: '0.1.0',
    meta: {
      generator: 'geordi-runtime-webgl',
      source: ir.scene.id,
      hash: ir.irVersion,
    },
    canvas: {
      width: ir.scene.width,
      height: ir.scene.height,
      units: ir.scene.units ?? 'px',
      origin: 'top-left',
    },
    nodes: ir.nodes.map((node) => prepareNode(node, childIdsFor(ir, node.id))),
    tokens: {},
  };
}

function prepareNode(node: GeordiIrNode, children: readonly string[]): PreparedGeordiNode {
  switch (node.kind) {
    case 'Rect':
      return {
        id: node.id,
        type: 'rect',
        bounds: boundsFromNode(node, true),
        style: styleFromNode(node),
        static: true,
      };

    case 'Text':
      return {
        id: node.id,
        type: 'text',
        bounds: boundsFromNode(node, false),
        style: textNodeStyleFromNode(node),
        static: true,
        content: requiredStringProp(node, 'content'),
      };

    case 'Group':
      return {
        id: node.id,
        type: 'group',
        bounds: boundsFromNode(node, false),
        style: styleFromNode(node),
        static: true,
        children,
      };

    case 'Image':
      return {
        id: node.id,
        type: 'image',
        bounds: boundsFromNode(node, false),
        style: styleFromNode(node),
        static: true,
        src: requiredStringProp(node, 'src'),
      };

    default:
      throw new GeordiRuntimeUnsupportedNodeKindError(node.kind);
  }
}

function childIdsFor(ir: GeordiIr, parentId: string): string[] {
  return ir.nodes
    .filter((node) => node.parentId === parentId)
    .map((node) => node.id);
}

function boundsFromNode(node: GeordiIrNode, requireSize: boolean): Bounds {
  return [
    optionalNumberProp(node, 'x') ?? 0,
    optionalNumberProp(node, 'y') ?? 0,
    requireSize ? requiredNumberProp(node, 'width') : optionalNumberProp(node, 'width') ?? 0,
    requireSize ? requiredNumberProp(node, 'height') : optionalNumberProp(node, 'height') ?? 0,
  ];
}

function styleFromNode(node: GeordiIrNode): NodeStyle {
  const paint = paintStyleFromNode(node);
  return paint ? { paint } : {};
}

function textNodeStyleFromNode(node: GeordiIrNode): NodeStyle {
  const paint = paintStyleFromNode(node);
  const text = textStyleFromNode(node);
  return paint ? { paint, text } : { text };
}

function paintStyleFromNode(node: GeordiIrNode): PaintStyle | undefined {
  const fill = solidFillFromString(optionalStringProp(node, 'fill'));
  const stroke = solidFillFromString(optionalStringProp(node, 'stroke'));
  const strokeWidth = optionalNumberProp(node, 'strokeWidth');
  const opacity = optionalNumberProp(node, 'opacity');
  const cornerRadius = optionalNumberProp(node, 'cornerRadius');

  if (
    fill === undefined &&
    stroke === undefined &&
    strokeWidth === undefined &&
    opacity === undefined &&
    cornerRadius === undefined
  ) {
    return undefined;
  }

  return {
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(cornerRadius !== undefined ? { cornerRadius } : {}),
  };
}

function textStyleFromNode(node: GeordiIrNode): TextStyle {
  const lineHeight = optionalNumberProp(node, 'lineHeight');
  const align = textAlignFromProp(node);

  return {
    font: optionalStringProp(node, 'fontFamily') ?? 'sans-serif',
    size: optionalNumberProp(node, 'fontSize') ?? 16,
    weight: fontWeightFromProp(node),
    color: optionalStringProp(node, 'color') ?? '#000000',
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(align !== undefined ? { align } : {}),
  };
}

function solidFillFromString(value: string | undefined): SolidFill | undefined {
  return value === undefined ? undefined : { type: 'solid', color: value };
}

function fontWeightFromProp(node: GeordiIrNode): number {
  const value = propValue(node.props, 'fontWeight');
  if (value === undefined || value === 'normal') {
    return 400;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value === 'bold') {
    return 700;
  }

  throw new GeordiRuntimeInvalidNodePropsError(
    node.id,
    'fontWeight',
    'finite number, "normal", or "bold"',
  );
}

function textAlignFromProp(node: GeordiIrNode): 'left' | 'center' | 'right' | undefined {
  const value = propValue(node.props, 'align');
  if (value === undefined) {
    return undefined;
  }

  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }

  throw new GeordiRuntimeInvalidNodePropsError(
    node.id,
    'align',
    '"left", "center", or "right"',
  );
}

function requiredNumberProp(node: GeordiIrNode, key: string): number {
  const value = propValue(node.props, key);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  throw new GeordiRuntimeInvalidNodePropsError(node.id, key, 'finite number');
}

function optionalNumberProp(node: GeordiIrNode, key: string): number | undefined {
  const value = propValue(node.props, key);
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  throw new GeordiRuntimeInvalidNodePropsError(node.id, key, 'finite number');
}

function requiredStringProp(node: GeordiIrNode, key: string): string {
  const value = propValue(node.props, key);
  if (typeof value === 'string') {
    return value;
  }

  throw new GeordiRuntimeInvalidNodePropsError(node.id, key, 'string');
}

function optionalStringProp(node: GeordiIrNode, key: string): string | undefined {
  const value = propValue(node.props, key);
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new GeordiRuntimeInvalidNodePropsError(node.id, key, 'string');
}

function propValue(props: JsonObject, key: string): JsonValue | undefined {
  return props[key];
}
