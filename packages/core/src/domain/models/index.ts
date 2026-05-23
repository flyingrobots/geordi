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
  GEORDI_BASELINE_FEATURES,
  GEORDI_CORE_PROFILE,
  GEORDI_KNOWN_FEATURES,
  GEORDI_STRICT_TEXT_FEATURES,
  isGeordiFeatureRequirement,
} from './GeordiFeatureProfile.js';

export type { GeordiFeatureRequirement } from './GeordiFeatureProfile.js';

export {
  GEORDI_IR_VERSION,
  GEORDI_IR_ARTIFACT_KEY,
  GEORDI_IR_RECEIPT_KEY,
  GEORDI_IR_HASH_ALGORITHM,
  isGeordiIr,
  validateGeordiIr,
} from './GeordiIr.js';

export type {
  GeordiIrScene,
  GeordiIrNode,
  GeordiIrBinding,
  GeordiIrKeyframe,
  GeordiIrAnimation,
  GeordiIr,
  GeordiIrValidationIssue,
  GeordiIrValidationResult,
} from './GeordiIr.js';

export {
  GEORDI_NUMERIC_PROFILE,
  GeordiInvalidGraphicsNumberError,
  isFiniteGraphicsNumber,
  requireFiniteGraphicsNumber,
} from './GeordiNumericProfile.js';

export type { GeordiNumericProfile } from './GeordiNumericProfile.js';
