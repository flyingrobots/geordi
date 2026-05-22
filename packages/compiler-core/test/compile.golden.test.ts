import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GEORDI_NUMERIC_PROFILE } from '@flyingrobots/geordi-core';
import { compile } from '../src/compile/compile';
import { GeordiErrorCode } from '../src/errors';
import { parseJsonValue, stringifyCanonicalJson } from '../src/ports/json';
import type { GeordiIrV1, JsonObject } from '../src/types';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

describe('compile() golden path', () => {
  it('valid canonical AST JSON fixture compiles and emits core artifacts', async () => {
    const validCanonicalAst = {
      kind: 'Scene',
      astVersion: '1',
      scene: {
        id: 'scene:terminal',
        width: 800,
        height: 600,
        units: 'px',
        background: '#1a1a1a',
      },
      nodes: [
        {
          id: 'node:header',
          kind: 'Rect',
          props: { x: 0, y: 0, width: 800, height: 40, fill: '#2a2a2a' },
          zIndex: 1,
          visible: true,
        },
        {
          id: 'node:title',
          kind: 'Text',
          props: { x: 20, y: 10, content: 'Terminal v0.3', color: '#00ff00', fontSize: 14 },
          zIndex: 2,
          visible: true,
        },
      ],
      metadata: { sourceFormat: 'canonical-ast-json' },
    };

    const result = await compile({
      format: 'canonical-ast-json',
      source: stringifyCanonicalJson(validCanonicalAst),
      filename: 'fixtures/valid.scene.json',
      options: {
        target: 'geordi-ir-v1',
        emit: { irJson: true, tsTypes: true, jsonSchema: false, binaryPack: false },
        strict: true,
        failOnWarnings: false,
        canonicalize: true,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.artifacts['scene.geordi.json']).toBeDefined();
    expect(result.artifacts['types.ts']).toBeDefined();

    const ir = parseJsonValue(String(result.artifacts['scene.geordi.json'].content)) as GeordiIrV1;
    expect(ir.irVersion).toBe('geordi-ir/1');
    expect(ir.numericProfile).toBe(GEORDI_NUMERIC_PROFILE);
    expect(ir.scene.id).toBe('scene:terminal');
    expect(Array.isArray(ir.nodes)).toBe(true);
    expect(ir.nodes.length).toBe(2);
  });

  it('scene.geordi.json.receipt is present and contains irHash', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene',
      astVersion: '1',
      scene: { id: 'scene:receipt-test', width: 400, height: 300 },
      nodes: [
        { id: 'n1', kind: 'Rect', props: { x: 0, y: 0, width: 400, height: 300, fill: '#000' }, zIndex: 1 },
      ],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const result = await compile({
      format: 'canonical-ast-json',
      source,
      options: { target: 'geordi-ir-v1', emit: { irJson: true, tsTypes: false } },
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts['scene.geordi.json.receipt']).toBeDefined();

    const receipt = parseJsonValue(String(result.artifacts['scene.geordi.json.receipt'].content)) as JsonObject;
    expect(receipt.comparatorVersion).toBe('1');
    expect(receipt.irVersion).toBe('geordi-ir/1');
    expect(receipt.numericProfile).toBe(GEORDI_NUMERIC_PROFILE);
    expect(receipt.inputHash).toBe(sha256(source));
    expect(typeof receipt.rulesetFingerprint).toBe('string');

    // irHash must match sha256 of the emitted IR
    const irContent = String(result.artifacts['scene.geordi.json'].content);
    expect(receipt.irHash).toBe(sha256(irContent));
    expect(receipt.irHashAlg).toBe('sha256');
  });

  it('inputHash in receipt matches sha256(input.source)', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene', astVersion: '1',
      scene: { id: 'scene:hash-check', width: 100, height: 100 },
      nodes: [{ id: 'r1', kind: 'Rect', props: { width: 10, height: 10 }, zIndex: 1 }],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const result = await compile({
      format: 'canonical-ast-json',
      source,
      options: { target: 'geordi-ir-v1', emit: { irJson: true, tsTypes: false } },
    });

    expect(result.ok).toBe(true);
    const receipt = parseJsonValue(String(result.artifacts['scene.geordi.json.receipt'].content)) as JsonObject;
    expect(receipt.inputHash).toBe(sha256(source));
  });

  it('two compilations of the same input → byte-identical receipts', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene', astVersion: '1',
      scene: { id: 'scene:idempotent', width: 200, height: 200 },
      nodes: [{ id: 'n1', kind: 'Group', props: { x: 0, y: 0 }, zIndex: 1 }],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const input = {
      format: 'canonical-ast-json' as const,
      source,
      options: { target: 'geordi-ir-v1' as const, emit: { irJson: true, tsTypes: false } },
    };

    const r1 = await compile(input);
    const r2 = await compile(input);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const rec1 = String(r1.artifacts['scene.geordi.json.receipt'].content);
    const rec2 = String(r2.artifacts['scene.geordi.json.receipt'].content);
    expect(rec1).toBe(rec2);
    expect(sha256(rec1)).toBe(sha256(rec2));
  });

  it('emit.jsonSchema: true → E_FEATURE_NOT_IMPLEMENTED error', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene', astVersion: '1',
      scene: { id: 'scene:schema-test', width: 100, height: 100 },
      nodes: [],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const result = await compile({
      format: 'canonical-ast-json',
      source,
      options: { target: 'geordi-ir-v1', emit: { jsonSchema: true } },
    });

    expect(result.ok).toBe(false);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED);
    expect(Object.keys(result.artifacts)).toHaveLength(0);
  });

  it('emit.binaryPack: true fails before writing partial artifacts', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene', astVersion: '1',
      scene: { id: 'scene:binary-pack-test', width: 100, height: 100 },
      nodes: [],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const result = await compile({
      format: 'canonical-ast-json',
      source,
      options: {
        target: 'geordi-ir-v1',
        emit: { irJson: true, tsTypes: true, binaryPack: true },
      },
    });

    expect(result.ok).toBe(false);
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain(GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED);
    expect(Object.keys(result.artifacts)).toHaveLength(0);
  });

  it('invalid fixture (empty input) fails with deterministic error code', async () => {
    const result = await compile({
      format: 'canonical-ast-json',
      source: '   ',
      filename: 'fixtures/invalid.empty.json',
      options: {
        target: 'geordi-ir-v1',
        emit: { irJson: true, tsTypes: true },
        strict: true,
        failOnWarnings: false,
        canonicalize: true,
      },
    });

    expect(result.ok).toBe(false);

    const errorCodes = result.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => d.code);

    expect(errorCodes).toContain(GeordiErrorCode.E_INPUT_EMPTY);
  });
});
