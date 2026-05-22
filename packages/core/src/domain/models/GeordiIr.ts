import type { JsonObject, JsonValue } from './GeordiScene.js';

export const GEORDI_IR_VERSION = 'geordi-ir/1' as const;
export const GEORDI_IR_ARTIFACT_KEY = 'scene.geordi.json' as const;
export const GEORDI_IR_RECEIPT_KEY = 'scene.geordi.json.receipt' as const;
export const GEORDI_IR_HASH_ALGORITHM = 'sha256' as const;

export interface GeordiIrSceneV1 extends JsonObject {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly units?: 'px';
  readonly background?: string;
}

export interface GeordiIrNodeV1 extends JsonObject {
  readonly id: string;
  readonly kind: string;
  readonly parentId?: string;
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly props: JsonObject;
  readonly style?: JsonObject;
}

export interface GeordiIrBindingV1 extends JsonObject {
  readonly id: string;
  readonly targetNodeId: string;
  readonly targetProp: string;
  readonly expression: string;
  readonly when?: string;
}

export interface GeordiIrKeyframeV1 extends JsonObject {
  readonly t: number;
  readonly value: JsonValue;
}

export interface GeordiIrAnimationV1 extends JsonObject {
  readonly id: string;
  readonly targetNodeId: string;
  readonly property: string;
  readonly keyframes: readonly GeordiIrKeyframeV1[];
  readonly easing?: string;
  readonly loop?: boolean;
}

export interface GeordiIrV1 extends JsonObject {
  readonly irVersion: typeof GEORDI_IR_VERSION;
  readonly scene: GeordiIrSceneV1;
  readonly nodes: readonly GeordiIrNodeV1[];
  readonly bindings?: readonly GeordiIrBindingV1[];
  readonly animations?: readonly GeordiIrAnimationV1[];
}

export interface GeordiIrValidationIssue extends JsonObject {
  readonly path: string;
  readonly message: string;
}

export interface GeordiIrValidationResult {
  readonly ok: boolean;
  readonly issues: readonly GeordiIrValidationIssue[];
}

export function isGeordiIrV1(value: JsonValue | undefined): value is GeordiIrV1 {
  return validateGeordiIrV1(value).ok;
}

export function validateGeordiIrV1(value: JsonValue | undefined): GeordiIrValidationResult {
  const issues: GeordiIrValidationIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, '$', 'IR must be an object');
    return { ok: false, issues };
  }

  if (property(value, 'irVersion') !== GEORDI_IR_VERSION) {
    pushIssue(issues, '$.irVersion', `IR version must be "${GEORDI_IR_VERSION}"`);
  }

  validateScene(property(value, 'scene'), issues);
  validateNodes(property(value, 'nodes'), issues);
  validateBindings(property(value, 'bindings'), issues);
  validateAnimations(property(value, 'animations'), issues);

  return { ok: issues.length === 0, issues };
}

function validateScene(value: JsonValue | undefined, issues: GeordiIrValidationIssue[]): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, '$.scene', 'IR scene must be an object');
    return;
  }

  requireString(value, 'id', '$.scene.id', issues);
  requirePositiveFiniteNumber(value, 'width', '$.scene.width', issues);
  requirePositiveFiniteNumber(value, 'height', '$.scene.height', issues);
  optionalLiteral(value, 'units', 'px', '$.scene.units', issues);
  optionalString(value, 'background', '$.scene.background', issues);
}

function validateNodes(value: JsonValue | undefined, issues: GeordiIrValidationIssue[]): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, '$.nodes', 'IR nodes must be an array');
    return;
  }

  for (let i = 0; i < value.length; i++) {
    const path = `$.nodes[${i}]`;
    const node = value[i];
    if (!isJsonObject(node)) {
      pushIssue(issues, path, 'IR node must be an object');
      continue;
    }

    requireString(node, 'id', `${path}.id`, issues);
    requireString(node, 'kind', `${path}.kind`, issues);
    optionalString(node, 'parentId', `${path}.parentId`, issues);
    optionalFiniteNumber(node, 'zIndex', `${path}.zIndex`, issues);
    optionalBoolean(node, 'visible', `${path}.visible`, issues);
    optionalBoolean(node, 'locked', `${path}.locked`, issues);

    if (!isJsonObject(property(node, 'props'))) {
      pushIssue(issues, `${path}.props`, 'IR node props must be an object');
    }

    const style = property(node, 'style');
    if (style !== undefined && !isJsonObject(style)) {
      pushIssue(issues, `${path}.style`, 'IR node style must be an object');
    }
  }
}

function validateBindings(value: JsonValue | undefined, issues: GeordiIrValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isJsonArray(value)) {
    pushIssue(issues, '$.bindings', 'IR bindings must be an array when present');
    return;
  }

  for (let i = 0; i < value.length; i++) {
    const path = `$.bindings[${i}]`;
    const binding = value[i];
    if (!isJsonObject(binding)) {
      pushIssue(issues, path, 'IR binding must be an object');
      continue;
    }

    requireString(binding, 'id', `${path}.id`, issues);
    requireString(binding, 'targetNodeId', `${path}.targetNodeId`, issues);
    requireString(binding, 'targetProp', `${path}.targetProp`, issues);
    requireString(binding, 'expression', `${path}.expression`, issues);
    optionalString(binding, 'when', `${path}.when`, issues);
  }
}

function validateAnimations(value: JsonValue | undefined, issues: GeordiIrValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isJsonArray(value)) {
    pushIssue(issues, '$.animations', 'IR animations must be an array when present');
    return;
  }

  for (let i = 0; i < value.length; i++) {
    const path = `$.animations[${i}]`;
    const animation = value[i];
    if (!isJsonObject(animation)) {
      pushIssue(issues, path, 'IR animation must be an object');
      continue;
    }

    requireString(animation, 'id', `${path}.id`, issues);
    requireString(animation, 'targetNodeId', `${path}.targetNodeId`, issues);
    requireString(animation, 'property', `${path}.property`, issues);
    optionalString(animation, 'easing', `${path}.easing`, issues);
    optionalBoolean(animation, 'loop', `${path}.loop`, issues);
    validateKeyframes(property(animation, 'keyframes'), `${path}.keyframes`, issues);
  }
}

function validateKeyframes(
  value: JsonValue | undefined,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'IR animation keyframes must be an array');
    return;
  }

  for (let i = 0; i < value.length; i++) {
    const keyframePath = `${path}[${i}]`;
    const keyframe = value[i];
    if (!isJsonObject(keyframe)) {
      pushIssue(issues, keyframePath, 'IR animation keyframe must be an object');
      continue;
    }

    requireFiniteNumber(keyframe, 't', `${keyframePath}.t`, issues);
    if (property(keyframe, 'value') === undefined) {
      pushIssue(issues, `${keyframePath}.value`, 'IR animation keyframe value is required');
    }
  }
}

function requireString(
  object: JsonObject,
  key: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (typeof object[key] !== 'string') {
    pushIssue(issues, path, 'Value must be a string');
  }
}

function optionalString(
  object: JsonObject,
  key: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (object[key] !== undefined && typeof object[key] !== 'string') {
    pushIssue(issues, path, 'Value must be a string when present');
  }
}

function requireFiniteNumber(
  object: JsonObject,
  key: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (!isFiniteNumber(object[key])) {
    pushIssue(issues, path, 'Value must be a finite number');
  }
}

function requirePositiveFiniteNumber(
  object: JsonObject,
  key: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  const value = property(object, key);
  if (!isFiniteNumber(value) || value <= 0) {
    pushIssue(issues, path, 'Value must be a positive finite number');
  }
}

function optionalFiniteNumber(
  object: JsonObject,
  key: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (object[key] !== undefined && !isFiniteNumber(object[key])) {
    pushIssue(issues, path, 'Value must be a finite number when present');
  }
}

function optionalBoolean(
  object: JsonObject,
  key: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (object[key] !== undefined && typeof object[key] !== 'boolean') {
    pushIssue(issues, path, 'Value must be a boolean when present');
  }
}

function optionalLiteral(
  object: JsonObject,
  key: string,
  expected: string,
  path: string,
  issues: GeordiIrValidationIssue[],
): void {
  if (object[key] !== undefined && object[key] !== expected) {
    pushIssue(issues, path, `Value must be "${expected}" when present`);
  }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isFiniteNumber(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function property(object: JsonObject, key: string): JsonValue | undefined {
  return object[key];
}

function pushIssue(
  issues: GeordiIrValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}
