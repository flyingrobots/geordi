import { describe, expect, it } from 'vitest';
import { parseJsonValue } from '@flyingrobots/geordi-compiler-core';
import type { GeordiIr } from '@flyingrobots/geordi-compiler-core';
import { GeordiGenerationFailedError, GeordiGeneratorPlugin } from './index';

const MINIMAL_SDL = `
type Scene @geordi_scene(v: "1", width: 320, height: 200) {
  bg: String @geordi_node(kind: Rect, width: 320, height: 200, props: "{\\"fill\\":\\"#101010\\"}")
}
`;

interface CapturedLogs {
  readonly info: string[];
  readonly warn: string[];
  readonly error: string[];
}

function makeLogs(): CapturedLogs {
  return {
    info: [],
    warn: [],
    error: [],
  };
}

function makeContext(logs: CapturedLogs) {
  return {
    logger: {
      info: (msg: string) => logs.info.push(msg),
      warn: (msg: string) => logs.warn.push(msg),
      error: (msg: string) => logs.error.push(msg),
    },
  };
}

function stringArtifact(
  output: Record<string, string | Uint8Array>,
  path: string,
): string {
  const content = output[path];
  expect(content).toBeTypeOf('string');
  return typeof content === 'string' ? content : '';
}

describe('wesley-generator public API', () => {
  it('exports GeordiGeneratorPlugin', () => {
    expect(GeordiGeneratorPlugin).toBeTypeOf('function');
  });

  it('plans and generates Geordi artifacts from minimal SDL', async () => {
    const plugin = new GeordiGeneratorPlugin();
    const logs = makeLogs();
    const context = makeContext(logs);

    const plan = plugin.plan({ sdl: MINIMAL_SDL }, context);
    expect(plan.artifacts.map((artifact) => artifact.path)).toEqual([
      'scene.geordi.json',
      'types.ts',
    ]);
    expect(plan.metadata).toEqual({
      inputFormat: 'graphql-sdl',
      sdl: MINIMAL_SDL,
    });

    const output = await plugin.generate(plan, context);
    expect(Object.keys(output).sort()).toEqual([
      'scene.geordi.json',
      'scene.geordi.json.receipt',
      'types.ts',
    ]);

    const ir = parseJsonValue(stringArtifact(output, 'scene.geordi.json')) as GeordiIr;
    expect(ir.irVersion).toBe('geordi-ir/1');
    expect(ir.scene.width).toBe(320);
    expect(ir.scene.height).toBe(200);
    expect(ir.nodes).toHaveLength(1);

    const types = stringArtifact(output, 'types.ts');
    expect(types).toContain('export interface SceneRoot');
    expect(logs.error).toHaveLength(0);
  });

  it('throws a custom failure error and logs diagnostics when compilation fails', async () => {
    const plugin = new GeordiGeneratorPlugin();
    const logs = makeLogs();
    const context = makeContext(logs);
    const plan = plugin.plan({ sdl: 'type Broken {' }, context);
    const generation = plugin.generate(plan, context);

    await expect(generation).rejects.toBeInstanceOf(GeordiGenerationFailedError);
    await expect(generation).rejects.toMatchObject({
      errorCount: 1,
      name: 'GeordiGenerationFailedError',
    });
    expect(logs.error.join('\n')).toContain('GEORDI_E_INPUT_INVALID_SDL');
  });
});
