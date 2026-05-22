import type { JsonObject, JsonValue } from './json.js';

// Keep IR explicit and separate from canonical AST.
export interface GeordiIrSceneV1 extends JsonObject {
  id: string;
  width: number;
  height: number;
  units?: 'px';
  background?: string;
}

export interface GeordiIrNodeV1 extends JsonObject {
  id: string;
  kind: string;
  parentId?: string;
  zIndex?: number;
  visible?: boolean;
  props: JsonObject;
  style?: JsonObject;
}

export interface GeordiIrBindingV1 extends JsonObject {
  id: string;
  targetNodeId: string;
  targetProp: string;
  expression: string;
  when?: string;
}

export interface GeordiIrKeyframeV1 extends JsonObject {
  t: number;
  value: JsonValue;
}

export interface GeordiIrAnimationV1 extends JsonObject {
  id: string;
  targetNodeId: string;
  property: string;
  keyframes: GeordiIrKeyframeV1[];
  easing?: string;
  loop?: boolean;
}

export interface GeordiIrV1 extends JsonObject {
  irVersion: 'geordi-ir/1';
  scene: GeordiIrSceneV1;
  nodes: GeordiIrNodeV1[];
  bindings?: GeordiIrBindingV1[];
  animations?: GeordiIrAnimationV1[];
}
