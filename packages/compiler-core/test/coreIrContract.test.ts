import { describe, expect, it } from 'vitest';
import {
  GEORDI_BASELINE_FEATURES,
  GEORDI_NUMERIC_PROFILE,
  validateGeordiIr,
} from '@flyingrobots/geordi-core';
import type { GeordiIr } from '@flyingrobots/geordi-core';
import { compile } from '../src/compile/compile';
import { parseJsonValue, stringifyCanonicalJson } from '../src/ports/json';

describe('compiler-core to geordi-core IR contract', () => {
  it('emits geordi-ir/1 that validates under the core-owned contract', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene',
      astVersion: '1',
      scene: {
        id: 'scene:core-contract',
        width: 320,
        height: 200,
        units: 'px',
      },
      nodes: [
        {
          id: 'node:bg',
          kind: 'Rect',
          props: {
            x: 0,
            y: 0,
            width: 320,
            height: 200,
            fill: '#101010',
          },
          visible: true,
        },
      ],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const result = await compile({
      format: 'canonical-ast-json',
      source,
      options: {
        target: 'geordi-ir',
        emit: {
          irJson: true,
          tsTypes: false,
        },
        canonicalize: true,
      },
    });

    expect(result.ok).toBe(true);
    const artifact = result.artifacts['scene.geordi.json'];
    expect(artifact).toBeDefined();

    const ir = parseJsonValue(String(artifact.content));
    expect(validateGeordiIr(ir)).toEqual({ ok: true, issues: [] });
    expect((ir as GeordiIr).numericProfile).toBe(GEORDI_NUMERIC_PROFILE);
    expect((ir as GeordiIr).requires).toEqual(GEORDI_BASELINE_FEATURES);
  });
});
