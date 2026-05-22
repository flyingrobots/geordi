import { describe, expect, it } from 'vitest';
import { GeordiErrorCode } from '@flyingrobots/geordi-compiler-core';
import type { Diagnostic } from '@flyingrobots/geordi-compiler-core';
import { parseGraphql } from '../src/parse/parseGraphql';
import { extractScene } from '../src/parse/extractScene';

function parse(sdl: string) {
  return parseGraphql(sdl, 'test.graphql');
}

describe('extractScene (table-driven)', () => {
  it('valid @geordi_scene type is extracted correctly', () => {
    const doc = parse(`
      type Terminal @geordi_scene(v: "1", width: 800, height: 600) {
        _: String
      }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(diag.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(scene).toBeDefined();
    expect(scene?.typeName).toBe('Terminal');
    expect(scene?.v).toBe('1');
    expect(scene?.width).toBe(800);
    expect(scene?.height).toBe(600);
  });

  it('extracts optional name and background', () => {
    const doc = parse(`
      type UI @geordi_scene(v: "1", width: 1920, height: 1080, name: "Main UI", background: "#ffffff") {
        _: String
      }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag);

    expect(scene?.name).toBe('Main UI');
    expect(scene?.background).toBe('#ffffff');
  });

  it('no @geordi_scene type → GEORDI_E_SCENE_MISSING', () => {
    const doc = parse(`
      type Query { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_SCENE_MISSING);
  });

  it('multiple @geordi_scene types → GEORDI_E_SCENE_MULTIPLE', () => {
    const doc = parse(`
      type SceneA @geordi_scene(v: "1", width: 100, height: 100) { _: String }
      type SceneB @geordi_scene(v: "1", width: 200, height: 200) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_SCENE_MULTIPLE);
  });

  it('wrong version → GEORDI_E_VERSION_UNSUPPORTED', () => {
    const doc = parse(`
      type Scene @geordi_scene(v: "2", width: 800, height: 600) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_VERSION_UNSUPPORTED);
  });

  it('missing v argument → GEORDI_E_DIRECTIVE_ARG_MISSING', () => {
    // Note: graphql-js parse will fail without required args in SDL schema validation,
    // but the parser allows raw document parsing without schema validation
    // We test that extractScene validates the arg itself
    const doc = parse(`
      type Scene @geordi_scene(width: 800, height: 600) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_DIRECTIVE_ARG_MISSING);
  });

  it('missing width argument → GEORDI_E_DIRECTIVE_ARG_MISSING', () => {
    const doc = parse(`
      type Scene @geordi_scene(v: "1", height: 600) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_DIRECTIVE_ARG_MISSING);
  });

  it('missing height argument → GEORDI_E_DIRECTIVE_ARG_MISSING', () => {
    const doc = parse(`
      type Scene @geordi_scene(v: "1", width: 800) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_DIRECTIVE_ARG_MISSING);
  });

  it('wrong required argument type → GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE', () => {
    const doc = parse(`
      type Scene @geordi_scene(v: 1, width: "800", height: 600) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'test.graphql');

    expect(scene).toBeUndefined();
    const errors = diag.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toContain(GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE);
    expect(errors.map((d) => d.code)).not.toContain(GeordiErrorCode.E_DIRECTIVE_ARG_MISSING);
  });

  it('has sourceRef with correct file', () => {
    const doc = parse(`
      type Terminal @geordi_scene(v: "1", width: 800, height: 600) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag, 'my-scene.graphql');

    expect(scene?.sourceRef.file).toBe('my-scene.graphql');
    expect(scene?.sourceRef.line).toBeGreaterThanOrEqual(1);
    expect(scene?.sourceRef.column).toBeGreaterThanOrEqual(1);
  });

  it('sourceRef fallback when no filename provided', () => {
    const doc = parse(`
      type Terminal @geordi_scene(v: "1", width: 800, height: 600) { _: String }
    `);
    const diag: Diagnostic[] = [];
    const scene = extractScene(doc, diag);

    expect(scene?.sourceRef.file).toBeTruthy();
    expect(scene?.sourceRef.line).toBeGreaterThanOrEqual(1);
  });
});
