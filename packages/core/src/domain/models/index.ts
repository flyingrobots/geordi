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
  PreparedGeordiNode,
} from './GeordiNode.js';

export { isRectNode, isTextNode, isGroupNode, isImageNode } from './GeordiNode.js';

export type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
  GeordiVersion,
  Units,
  Origin,
  GeordiMeta,
  GeordiCanvas,
  GeordiTokens,
  HitRegion,
  GeordiInteraction,
  PreparedGeordiScene,
  GeordiScene,
} from './GeordiScene.js';

export { isPreparedGeordiScene, isGeordiScene } from './GeordiScene.js';

export {
  GEORDI_IR_VERSION,
  GEORDI_IR_ARTIFACT_KEY,
  GEORDI_IR_RECEIPT_KEY,
  GEORDI_IR_HASH_ALGORITHM,
  isGeordiIrV1,
  validateGeordiIrV1,
} from './GeordiIr.js';

export type {
  GeordiIrSceneV1,
  GeordiIrNodeV1,
  GeordiIrBindingV1,
  GeordiIrKeyframeV1,
  GeordiIrAnimationV1,
  GeordiIrV1,
  GeordiIrValidationIssue,
  GeordiIrValidationResult,
} from './GeordiIr.js';
