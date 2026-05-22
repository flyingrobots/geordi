import type {
  Bounds,
  GeordiIrNodeV1,
  GeordiIrV1,
  GeordiNode,
  GeordiScene,
  JsonObject,
  NodeStyle,
  PaintStyle,
  SolidFill,
  TextStyle,
} from '@flyingrobots/geordi-core';

export class GeordiRuntimeUnsupportedNodeKindError extends Error {
  public readonly nodeKind: string;

  constructor(nodeKind: string) {
    super(`Unsupported runtime node kind: ${nodeKind}`);
    this.name = new.target.name;
    this.nodeKind = nodeKind;
  }
}

export function prepareGeordiIr(ir: GeordiIrV1): GeordiScene {
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

function prepareNode(node: GeordiIrNodeV1, children: readonly string[]): GeordiNode {
  switch (node.kind) {
    case 'Rect':
      return {
        id: node.id,
        type: 'rect',
        bounds: boundsFromProps(node.props),
        style: styleFromProps(node.props),
        static: true,
      };

    case 'Text':
      return {
        id: node.id,
        type: 'text',
        bounds: boundsFromProps(node.props),
        style: textNodeStyleFromProps(node.props),
        static: true,
        content: stringProp(node.props, 'content', ''),
      };

    case 'Group':
      return {
        id: node.id,
        type: 'group',
        bounds: boundsFromProps(node.props),
        style: styleFromProps(node.props),
        static: true,
        children,
      };

    case 'Image':
      return {
        id: node.id,
        type: 'image',
        bounds: boundsFromProps(node.props),
        style: styleFromProps(node.props),
        static: true,
        src: stringProp(node.props, 'src', ''),
      };

    default:
      throw new GeordiRuntimeUnsupportedNodeKindError(node.kind);
  }
}

function childIdsFor(ir: GeordiIrV1, parentId: string): string[] {
  return ir.nodes
    .filter((node) => node.parentId === parentId)
    .map((node) => node.id);
}

function boundsFromProps(props: JsonObject): Bounds {
  return [
    numberProp(props, 'x', 0),
    numberProp(props, 'y', 0),
    numberProp(props, 'width', 0),
    numberProp(props, 'height', 0),
  ];
}

function styleFromProps(props: JsonObject): NodeStyle {
  const paint = paintStyleFromProps(props);
  return paint ? { paint } : {};
}

function textNodeStyleFromProps(props: JsonObject): NodeStyle {
  const paint = paintStyleFromProps(props);
  const text = textStyleFromProps(props);
  return paint ? { paint, text } : { text };
}

function paintStyleFromProps(props: JsonObject): PaintStyle | undefined {
  const fill = solidFillFromString(optionalStringProp(props, 'fill'));
  const stroke = solidFillFromString(optionalStringProp(props, 'stroke'));
  const strokeWidth = optionalNumberProp(props, 'strokeWidth');
  const opacity = optionalNumberProp(props, 'opacity');
  const cornerRadius = optionalNumberProp(props, 'cornerRadius');

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

function textStyleFromProps(props: JsonObject): TextStyle {
  const lineHeight = optionalNumberProp(props, 'lineHeight');
  const align = textAlignFromProp(props);

  return {
    font: stringProp(props, 'fontFamily', 'sans-serif'),
    size: numberProp(props, 'fontSize', 16),
    weight: fontWeightFromProp(props),
    color: stringProp(props, 'color', '#000000'),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(align !== undefined ? { align } : {}),
  };
}

function solidFillFromString(value: string | undefined): SolidFill | undefined {
  return value === undefined ? undefined : { type: 'solid', color: value };
}

function fontWeightFromProp(props: JsonObject): number {
  const value = propValue(props, 'fontWeight');
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value === 'bold') {
    return 700;
  }

  return 400;
}

function textAlignFromProp(props: JsonObject): 'left' | 'center' | 'right' | undefined {
  const value = propValue(props, 'align');
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }

  return undefined;
}

function numberProp(props: JsonObject, key: string, fallback: number): number {
  return optionalNumberProp(props, key) ?? fallback;
}

function optionalNumberProp(props: JsonObject, key: string): number | undefined {
  const value = propValue(props, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringProp(props: JsonObject, key: string, fallback: string): string {
  return optionalStringProp(props, key) ?? fallback;
}

function optionalStringProp(props: JsonObject, key: string): string | undefined {
  const value = propValue(props, key);
  return typeof value === 'string' ? value : undefined;
}

function propValue(props: JsonObject, key: string) {
  return props[key];
}
