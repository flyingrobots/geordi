import type { JsonObject, JsonPrimitive, JsonValue } from './json.js';
import type { SourceLocation } from './source.js';

export interface CanonicalSceneAst extends JsonObject {
  kind: 'Scene';
  astVersion: '1';
  scene: Scene;
  nodes: Node[];
  bindings?: Binding[];
  animations?: Animation[];
  metadata?: AstMetadata;
}

export interface Scene extends JsonObject {
  id: string;
  name?: string;
  width: number;
  height: number;
  units?: 'px';
  background?: string;
}

export type NodeKind = 'Rect' | 'Text' | 'Image' | 'Group' | 'Line' | 'Ellipse' | 'Path';

export type SourceRef = SourceLocation;

export interface ShadowProps extends JsonObject {
  x?: number;
  y?: number;
  blur?: number;
  color?: string;
}

export interface StyleProps extends JsonObject {
  shadow?: ShadowProps;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface CommonGeometry extends JsonObject {
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number; // 0..1
}

export type Primitive = JsonPrimitive;
export type PropValue = JsonValue;

export interface NodeBase extends JsonObject {
  id: string;
  kind: string;
  parentId?: string;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  props: JsonObject;
  style?: StyleProps;
  sourceRef?: SourceRef;
}

export interface RectProps extends CommonGeometry {
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
}

export interface TextProps extends CommonGeometry {
  content: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | 'normal' | 'bold';
  lineHeight?: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
}

export interface ImageProps extends CommonGeometry {
  src: string;
  fit?: 'cover' | 'contain' | 'fill';
  alt?: string;
}

export type GroupProps = CommonGeometry;

export interface LineProps extends CommonGeometry {
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface EllipseProps extends CommonGeometry {
  rx: number;
  ry: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface PathProps extends CommonGeometry {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export type Node = NodeBase;

export interface Binding extends JsonObject {
  id: string;
  targetNodeId: string;
  targetProp: string;
  expression: string;
  when?: string;
}

export interface Animation extends JsonObject {
  id: string;
  targetNodeId: string;
  property: string;
  keyframes: { t: number; value: Primitive }[];
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  loop?: boolean;
}

export interface AstMetadata extends JsonObject {
  sourceFormat: 'graphql-sdl' | 'canonical-ast-json';
  sourceHash?: string;
  tags?: string[];
}
