import { describe, expect, it } from 'vitest';
import { parseInputToCanonicalAst } from '../src/compile/parseInput';
import { GeordiErrorCode, ParseError } from '../src/errors';
import { stringifyCanonicalJson } from '../src/ports/json';
import type { CompilerInput, Diagnostic, JsonValue } from '../src/types';

function makeJsonInput(obj: JsonValue, filename = 'test.json'): CompilerInput {
  return {
    format: 'canonical-ast-json',
    source: stringifyCanonicalJson(obj),
    filename,
  };
}

const VALID_AST = {
  kind: 'Scene',
  astVersion: '1',
  scene: {
    id: 'scene:test',
    width: 800,
    height: 600,
    units: 'px',
  },
  nodes: [],
  metadata: { sourceFormat: 'canonical-ast-json' },
};

describe('parseInputToCanonicalAst (table-driven)', () => {
  it('valid canonical JSON succeeds', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseInputToCanonicalAst(makeJsonInput(VALID_AST), diagnostics);

    expect(result).toBeDefined();
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result?.kind).toBe('Scene');
    expect(result?.scene.width).toBe(800);
  });

  it('empty input → GEORDI_E_INPUT_EMPTY', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseInputToCanonicalAst(
      { format: 'canonical-ast-json', source: '   ', filename: 'empty.json' },
      diagnostics,
    );

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_INPUT_EMPTY);
  });

  it('invalid JSON → GEORDI_E_INPUT_INVALID_JSON', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseInputToCanonicalAst(
      { format: 'canonical-ast-json', source: '{not valid json', filename: 'bad.json' },
      diagnostics,
    );

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_INPUT_INVALID_JSON);
    // Must NOT use internal invariant for user-facing parse errors
    expect(codes).not.toContain(GeordiErrorCode.E_INTERNAL_INVARIANT);
  });

  it('missing kind: Scene → GEORDI_E_SCENE_MISSING', async () => {
    const diagnostics: Diagnostic[] = [];
    const input = { ...VALID_AST, kind: 'NotScene' };
    const result = await parseInputToCanonicalAst(makeJsonInput(input), diagnostics);

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_SCENE_MISSING);
  });

  it('wrong astVersion → GEORDI_E_VERSION_UNSUPPORTED', async () => {
    const diagnostics: Diagnostic[] = [];
    const input = { ...VALID_AST, astVersion: '2' };
    const result = await parseInputToCanonicalAst(makeJsonInput(input), diagnostics);

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_VERSION_UNSUPPORTED);
  });

  it('missing scene object → GEORDI_E_SCENE_MISSING', async () => {
    const diagnostics: Diagnostic[] = [];
    const { scene: _scene, ...withoutScene } = VALID_AST;
    const result = await parseInputToCanonicalAst(makeJsonInput(withoutScene), diagnostics);

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_SCENE_MISSING);
  });

  it('non-numeric width/height → GEORDI_E_SCENE_DIMENSIONS_INVALID', async () => {
    const diagnostics: Diagnostic[] = [];
    const input = {
      ...VALID_AST,
      scene: { ...VALID_AST.scene, width: 'wide', height: 'tall' },
    };
    const result = await parseInputToCanonicalAst(makeJsonInput(input), diagnostics);

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_SCENE_DIMENSIONS_INVALID);
  });

  it('missing nodes array → GEORDI_E_INTERNAL_INVARIANT', async () => {
    const diagnostics: Diagnostic[] = [];
    const { nodes: _nodes, ...withoutNodes } = VALID_AST;
    const result = await parseInputToCanonicalAst(makeJsonInput(withoutNodes), diagnostics);

    expect(result).toBeUndefined();
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_INTERNAL_INVARIANT);
  });

  it('graphql-sdl with no adapter → GEORDI_E_INTERNAL_INVARIANT with hint', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseInputToCanonicalAst(
      {
        format: 'graphql-sdl',
        source: 'type Foo @geordi_scene(v: "1", width: 100, height: 100) { }',
        filename: 'schema.graphql',
      },
      diagnostics,
    );

    expect(result).toBeUndefined();
    const errorDiags = diagnostics.filter((d) => d.severity === 'error');
    expect(errorDiags.length).toBeGreaterThan(0);
    const codes = errorDiags.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_INTERNAL_INVARIANT);

    // Should have a hint pointing to schema-graphql
    const withHint = errorDiags.find((d) => d.hint);
    expect(withHint).toBeDefined();
    expect(withHint?.hint).toContain('schema-graphql');
  });

  it('graphql-sdl preserves typed diagnostics thrown by adapter', async () => {
    const diagnostics: Diagnostic[] = [];
    const result = await parseInputToCanonicalAst(
      {
        format: 'graphql-sdl',
        source: 'type Broken {',
        filename: 'broken.graphql',
      },
      diagnostics,
      {
        graphqlToCanonicalAst: () => {
          throw new ParseError(GeordiErrorCode.E_INPUT_INVALID_SDL, 'adapter typed parse error', {
            location: { file: 'broken.graphql', line: 1, column: 13 },
          });
        },
      },
    );

    expect(result).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(GeordiErrorCode.E_INPUT_INVALID_SDL);
    expect(diagnostics[0].location).toEqual({ file: 'broken.graphql', line: 1, column: 13 });
    expect(diagnostics.map((d) => d.code)).not.toContain(GeordiErrorCode.E_INTERNAL_INVARIANT);
  });
});
