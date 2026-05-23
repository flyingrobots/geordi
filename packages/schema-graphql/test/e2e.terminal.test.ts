import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compile, GeordiErrorCode, parseJsonValue } from '@flyingrobots/geordi-compiler-core';
import { graphqlToCanonicalAst } from '../src/index';
import type { CompilerInput, CompileResult, GeordiIr, ParseInputDeps } from '@flyingrobots/geordi-compiler-core';

const TERMINAL_SDL = `
type Terminal @geordi_scene(v: "1", width: 800, height: 600) {
  bg: String @geordi_node(kind: Rect, x: 0, y: 0, width: 800, height: 600, props: "{\\"fill\\":\\"#1a1a1a\\"}")
  header: String @geordi_node(kind: Rect, x: 0, y: 0, width: 800, height: 40, props: "{\\"fill\\":\\"#2a2a2a\\"}")
  title: String @geordi_node(kind: Text, x: 20, y: 10, props: "{\\"content\\":\\"Terminal v0.3\\",\\"color\\":\\"#00ff00\\"}")
}
`;

// Whitespace variant: same semantics, different formatting
const TERMINAL_SDL_WHITESPACE = `

  type   Terminal   @geordi_scene( v:  "1" ,  width:  800 ,  height:  600  )  {
    bg :   String   @geordi_node(  kind:  Rect ,  x:  0 ,  y:  0  ,  width:  800  ,  height:  600  ,  props:  "{\\"fill\\":\\"#1a1a1a\\"}"  )
    header   :  String  @geordi_node(  kind:  Rect  ,  x:  0,  y:  0  ,  width:  800  ,  height:  40  ,  props:  "{\\"fill\\":\\"#2a2a2a\\"}"  )
    title  :  String  @geordi_node(  kind:  Text  ,  x:  20  ,  y:  10  ,  props:  "{\\"content\\":\\"Terminal v0.3\\",\\"color\\":\\"#00ff00\\"}"  )
  }

`;

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const DEPS: ParseInputDeps = { graphqlToCanonicalAst };

function makeInput(sdl: string, filename = 'terminal.graphql'): CompilerInput {
  return {
    format: 'graphql-sdl',
    source: sdl,
    filename,
    options: {
      target: 'geordi-ir',
      emit: { irJson: true, tsTypes: true },
      strict: true,
      failOnWarnings: false,
      canonicalize: true,
    },
  };
}

function irContent(result: CompileResult): string {
  const artifact = result.artifacts['scene.geordi.json'];
  return String(artifact.content);
}

function sourceMapContent(result: CompileResult): string {
  const artifact = result.artifacts['scene.geordi.map.json'];
  return String(artifact.content);
}

function parseIr(result: CompileResult): GeordiIr {
  return parseJsonValue(irContent(result)) as GeordiIr;
}

describe('e2e: Terminal SDL fixture', () => {
  it('compiles without errors', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('IR nodes match expected kinds', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);

    expect(result.ok).toBe(true);
    const ir = parseIr(result);

    expect(ir.irVersion).toBe('geordi-ir/1');
    expect(ir.nodes).toHaveLength(3);

    const kinds = ir.nodes.map((n) => n.kind);
    expect(kinds).toContain('Rect');
    expect(kinds).toContain('Text');
  });

  it('IR nodes have correct props', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);

    const ir = parseIr(result);

    const bgNode = ir.nodes.find((n) => n.props.fill === '#1a1a1a');
    expect(bgNode).toBeDefined();
    expect(bgNode?.kind).toBe('Rect');

    const titleNode = ir.nodes.find((n) => n.props.content === 'Terminal v0.3');
    expect(titleNode).toBeDefined();
    expect(titleNode?.kind).toBe('Text');
    expect(titleNode?.props.color).toBe('#00ff00');
  });

  it('compiles to identical IR bytes on two consecutive runs (determinism)', async () => {
    const r1 = await compile(makeInput(TERMINAL_SDL, 'run1.graphql'), DEPS);
    const r2 = await compile(makeInput(TERMINAL_SDL, 'run1.graphql'), DEPS);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const ir1 = irContent(r1);
    const ir2 = irContent(r2);

    expect(ir1).toBe(ir2);
  });

  it('whitespace variant produces identical IR hash', async () => {
    const r1 = await compile(makeInput(TERMINAL_SDL, 'canonical.graphql'), DEPS);
    const r2 = await compile(makeInput(TERMINAL_SDL_WHITESPACE, 'canonical.graphql'), DEPS);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const ir1 = irContent(r1);
    const ir2 = irContent(r2);

    expect(sha256(ir1)).toBe(sha256(ir2));
  });

  it('IR has scene with correct dimensions', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);

    const ir = parseIr(result);
    expect(ir.scene.width).toBe(800);
    expect(ir.scene.height).toBe(600);
    expect(ir.scene.units).toBe('px');
  });

  it('emits a source map from IR node ids to SDL field locations', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);
    expect(result.ok).toBe(true);

    const sourceMap = parseJsonValue(sourceMapContent(result)) as {
      readonly nodes?: readonly {
        readonly id?: string;
        readonly source?: {
          readonly file?: string;
          readonly line?: number;
          readonly column?: number;
        };
      }[];
    };
    const ir = parseIr(result);
    const titleNode = ir.nodes.find((node) => node.props.content === 'Terminal v0.3');
    const titleMapping = sourceMap.nodes?.find((node) => node.id === titleNode?.id);

    expect(titleMapping?.source).toMatchObject({
      file: 'terminal.graphql',
      line: 5,
      column: 3,
    });
  });

  it('metadata contains hashAlgorithm', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);
    expect(result.metadata.hashAlgorithm).toBe('sha256');
  });

  it('nodes are sorted by zIndex in the IR output', async () => {
    const result = await compile(makeInput(TERMINAL_SDL), DEPS);

    const ir = parseIr(result);
    const zIndices = ir.nodes.map((n) => n.zIndex ?? 0);
    expect(zIndices).toEqual([...zIndices].sort((a: number, b: number) => a - b));
  });

  it('surfaces invalid SDL as GEORDI_E_INPUT_INVALID_SDL', async () => {
    const result = await compile(makeInput('type Broken {', 'broken.graphql'), DEPS);

    expect(result.ok).toBe(false);
    const invalidSdl = result.diagnostics.find(
      (d) => d.code === GeordiErrorCode.E_INPUT_INVALID_SDL,
    );
    expect(invalidSdl).toBeDefined();
    expect(invalidSdl?.location?.file).toBe('broken.graphql');
    expect(invalidSdl?.location?.line).toBeGreaterThanOrEqual(1);
    expect(invalidSdl?.location?.column).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.map((d) => d.code)).not.toContain(
      GeordiErrorCode.E_INTERNAL_INVARIANT,
    );
  });

  it('surfaces missing scene as GEORDI_E_SCENE_MISSING without internal wrapping', async () => {
    const result = await compile(makeInput('type Query { _: String }', 'missing-scene.graphql'), DEPS);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual([GeordiErrorCode.E_SCENE_MISSING]);
  });

  it('fails on invalid directive argument literal types', async () => {
    const result = await compile(
      makeInput(
        `
        type S @geordi_scene(v: "1", width: 100, height: 100) {
          n: String @geordi_node(kind: Rect, x: "left")
        }
      `,
        'bad-directive.graphql',
      ),
      DEPS,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
    );
  });

  it('fails loudly when known directives are declared but not lowered', async () => {
    const result = await compile(
      makeInput(
        `
        type S @geordi_scene(v: "1", width: 100, height: 100) {
          n: String
            @geordi_node(kind: Rect)
            @geordi_bind(targetProp: "props.fill", expr: "theme.primary")
        }
      `,
        'unsupported-directive.graphql',
      ),
      DEPS,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED,
    );
    expect(result.diagnostics.map((d) => d.code)).not.toContain(GeordiErrorCode.W_UNUSED_FIELD);
  });
});
