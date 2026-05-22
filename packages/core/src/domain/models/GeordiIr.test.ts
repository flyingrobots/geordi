import { describe, expect, it } from 'vitest';
import {
  GEORDI_IR_VERSION,
  isGeordiIrV1,
  validateGeordiIrV1,
} from './GeordiIr';

const VALID_IR = {
  irVersion: GEORDI_IR_VERSION,
  scene: {
    id: 'scene:test',
    width: 320,
    height: 200,
    units: 'px',
  },
  nodes: [
    {
      id: 'node:bg',
      kind: 'Rect',
      zIndex: 0,
      visible: true,
      props: {
        x: 0,
        y: 0,
        width: 320,
        height: 200,
      },
    },
  ],
  bindings: [],
  animations: [],
};

describe('Geordi IR v1 contract', () => {
  it('accepts a valid geordi-ir/1 document', () => {
    const result = validateGeordiIrV1(VALID_IR);

    expect(result).toEqual({ ok: true, issues: [] });
    expect(isGeordiIrV1(VALID_IR)).toBe(true);
  });

  it('rejects the wrong IR version', () => {
    const result = validateGeordiIrV1({
      ...VALID_IR,
      irVersion: 'geordi-ir/2',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('$.irVersion');
  });

  it('rejects non-finite scene dimensions and node z-index', () => {
    const result = validateGeordiIrV1({
      ...VALID_IR,
      scene: {
        id: 'scene:test',
        width: Number.NaN,
        height: Number.POSITIVE_INFINITY,
      },
      nodes: [
        {
          id: 'node:bg',
          kind: 'Rect',
          zIndex: Number.NEGATIVE_INFINITY,
          props: {},
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.scene.width',
      '$.scene.height',
      '$.nodes[0].zIndex',
    ]);
  });

  it('rejects nodes without object props', () => {
    const result = validateGeordiIrV1({
      ...VALID_IR,
      nodes: [
        {
          id: 'node:bg',
          kind: 'Rect',
          props: null,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('$.nodes[0].props');
  });
});
