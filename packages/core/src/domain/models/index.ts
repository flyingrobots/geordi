/**
 * Domain Models
 *
 * Pure domain types with no external dependencies.
 */

export type {
  Bounds,
  Color,
  HexColor,
  NodeType,
  FillType,
  LayoutType,
  FlexDirection,
  SolidFill,
  TokenRefFill,
  Fill,
  PaintStyle,
  FlexLayoutStyle,
  AbsoluteLayoutStyle,
  LayoutStyle,
  TextStyle,
  NodeStyle,
  InvalidationTrigger,
  GeordiNodeBase,
  RectNode,
  TextNode,
  GroupNode,
  ImageNode,
  GeordiNode,
} from './GeordiNode.js';

export { isRectNode, isTextNode, isGroupNode, isImageNode } from './GeordiNode.js';

export type {
  GeordiVersion,
  Units,
  Origin,
  GeordiMeta,
  GeordiCanvas,
  GeordiTokens,
  HitRegion,
  GeordiInteraction,
  GeordiScene,
} from './GeordiScene.js';

export { isGeordiScene } from './GeordiScene.js';
