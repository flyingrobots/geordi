import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ArtifactBuilder } from '../src/compile/artifactBuilder';
import { VALIDATION_RULE_IDS } from '../src/compile/validateAst';
import { parseJsonValue } from '../src/ports/json';
import type { CanonicalSceneAst, CompilerInput, JsonObject } from '../src/types';

const ast: CanonicalSceneAst = {
  kind: 'Scene',
  astVersion: '1',
  scene: { id: 'scene:builder', width: 100, height: 50 },
  nodes: [
    {
      id: 'node:a',
      kind: 'Rect',
      props: { x: 0, y: 0, width: 5, height: 5, fill: '#000' },
      zIndex: 1,
      visible: true,
      sourceRef: { file: 'f.json', line: 1, column: 1 },
    },
  ],
  metadata: { sourceFormat: 'canonical-ast-json' },
};

const input: CompilerInput = {
  format: 'canonical-ast-json',
  source: '{"builder":"source"}',
  filename: 'f.json',
};

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

describe('ArtifactBuilder', () => {
  it('computes the receipt from the IR and source map it holds', () => {
    const map = new ArtifactBuilder(input)
      .buildIr(ast)
      .buildSourceMap(ast)
      .buildReceipt(VALIDATION_RULE_IDS)
      .toArtifactMap();

    const receipt = parseJsonValue(String(map['scene.geordi.json.receipt'].content)) as JsonObject;
    expect(receipt.irHash).toBe(sha256(String(map['scene.geordi.json'].content)));
    expect(receipt.sourceMapHash).toBe(sha256(String(map['scene.geordi.map.json'].content)));
    expect(receipt.inputHash).toBe(sha256(input.source));
  });

  it('emits artifacts in build order', () => {
    const map = new ArtifactBuilder(input)
      .buildIr(ast)
      .buildSourceMap(ast)
      .buildReceipt(VALIDATION_RULE_IDS)
      .buildTypes(ast)
      .toArtifactMap();
    expect(Object.keys(map)).toEqual([
      'scene.geordi.json',
      'scene.geordi.map.json',
      'scene.geordi.json.receipt',
      'types.ts',
    ]);
  });

  it('refuses a receipt before the IR and source map exist', () => {
    expect(() => new ArtifactBuilder(input).buildReceipt(VALIDATION_RULE_IDS)).toThrow(/buildIr/);
    expect(() => new ArtifactBuilder(input).buildIr(ast).buildReceipt(VALIDATION_RULE_IDS)).toThrow(
      /buildSourceMap/,
    );
  });

  it('supports type-only emission without a receipt', () => {
    const map = new ArtifactBuilder(input).buildTypes(ast).toArtifactMap();
    expect(Object.keys(map)).toEqual(['types.ts']);
  });
});

describe('raw string boundary guard (flyingrobots/geordi#3)', () => {
  const compileSource = readFileSync(new URL('../src/compile/compile.ts', import.meta.url), 'utf8');
  const emitIrSource = readFileSync(new URL('../src/compile/emitIr.ts', import.meta.url), 'utf8');

  it('compile.ts passes no artifact content through a string cast', () => {
    expect(compileSource).not.toMatch(/\.content\s+as\s+string/);
  });

  it('emitIr.ts exports no receipt function that takes IR content as a raw string', () => {
    expect(emitIrSource).not.toMatch(/export function emitReceiptArtifact/);
    expect(emitIrSource).not.toMatch(/irContent\s*:\s*string/);
  });
});
