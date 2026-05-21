// Keep IR explicit and separate from canonical AST.
export interface GeordiIrV1 {
  irVersion: 'geordi-ir/1';
  scene: {
    id: string;
    width: number;
    height: number;
    background?: string;
  };
  nodes: Array<{
    id: string;
    kind: string;
    parentId?: string;
    zIndex?: number;
    visible?: boolean;
    props: Record<string, unknown>;
    style?: Record<string, unknown>;
  }>;
  bindings?: Array<{
    id: string;
    targetNodeId: string;
    targetProp: string;
    expression: string;
    when?: string;
  }>;
  animations?: Array<{
    id: string;
    targetNodeId: string;
    property: string;
    keyframes: Array<{ t: number; value: unknown }>;
    easing?: string;
    loop?: boolean;
  }>;
}
