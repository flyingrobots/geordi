import { describe, expect, it } from 'vitest';
import { GeordiErrorCode } from '@flyingrobots/geordi-compiler-core';
import type { Diagnostic } from '@flyingrobots/geordi-compiler-core';
import { parseGraphql } from '../src/parse/parseGraphql';
import { extractScene } from '../src/parse/extractScene';
import { extractNodes } from '../src/parse/extractNodes';

function parseAndExtract(sdl: string, diag: Diagnostic[] = []) {
  const doc = parseGraphql(sdl, 'test.graphql');
  const scene = extractScene(doc, diag, 'test.graphql');
  if (!scene) return { scene: undefined, nodes: [] };
  const nodes = extractNodes(scene, diag, 'test.graphql');
  return { scene, nodes };
}

describe('extractNodes (table-driven)', () => {
  it('extracts @geordi_node fields with geometry', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type Terminal @geordi_scene(v: "1", width: 800, height: 600) {
        bg: String @geordi_node(kind: Rect, x: 0, y: 0, width: 800, height: 600)
      }
    `,
      diag,
    );

    expect(diag.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(nodes).toHaveLength(1);
    const bg = nodes[0];
    expect(bg.fieldName).toBe('bg');
    expect(bg.kind).toBe('Rect');
    expect(bg.x).toBe(0);
    expect(bg.y).toBe(0);
    expect(bg.width).toBe(800);
    expect(bg.height).toBe(600);
  });

  it('extracts all valid node kinds', () => {
    for (const kind of ['Rect', 'Text', 'Image', 'Group', 'Line', 'Ellipse', 'Path']) {
      const diag: Diagnostic[] = [];
      const { nodes } = parseAndExtract(
        `type S @geordi_scene(v: "1", width: 100, height: 100) {
          n: String @geordi_node(kind: ${kind}, x: 0, y: 0)
        }`,
        diag,
      );
      expect(diag.filter((d) => d.severity === 'error')).toHaveLength(0);
      expect(nodes[0].kind).toBe(kind);
    }
  });

  it('invalid kind → GEORDI_E_NODE_KIND_INVALID and field is skipped', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: InvalidKind, x: 0, y: 0)
      }
    `,
      diag,
    );

    expect(nodes).toHaveLength(0);
    expect(diag.map((d) => d.code)).toContain(GeordiErrorCode.E_NODE_KIND_INVALID);
  });

  it('fields without @geordi_node are ignored', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        withNode: String @geordi_node(kind: Rect, x: 0, y: 0)
        withoutNode: String
      }
    `,
      diag,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].fieldName).toBe('withNode');
  });

  it('non-geordi_ directives are silently ignored (no warning)', () => {
    const diag: Diagnostic[] = [];
    parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, x: 0, y: 0) @deprecated(reason: "old")
      }
    `,
      diag,
    );

    // @deprecated is not geordi_, so no warning
    const warnings = diag.filter((d) => d.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('unknown geordi_* directive emits GEORDI_W_UNUSED_FIELD warning', () => {
    const diag: Diagnostic[] = [];
    parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, x: 0, y: 0) @geordi_unknown_future_directive
      }
    `,
      diag,
    );

    const warnings = diag.filter((d) => d.severity === 'warning');
    expect(warnings.map((w) => w.code)).toContain(GeordiErrorCode.W_UNUSED_FIELD);
  });

  it('known unlowered directives emit GEORDI_E_FEATURE_NOT_IMPLEMENTED errors', () => {
    const diag: Diagnostic[] = [];
    parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String
          @geordi_node(kind: Rect, x: 0, y: 0)
          @geordi_bind(targetProp: "props.fill", expr: "theme.primary")
          @geordi_style(shadow: "{\\"blur\\":4}")
      }
    `,
      diag,
    );

    const errors = diag.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toEqual([
      GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED,
      GeordiErrorCode.E_FEATURE_NOT_IMPLEMENTED,
    ]);
    expect(errors.map((d) => d.details?.directive)).toEqual(['geordi_bind', 'geordi_style']);
    expect(diag.map((d) => d.code)).not.toContain(GeordiErrorCode.W_UNUSED_FIELD);
  });

  it('parses props JSON arg into object', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, x: 0, y: 0, props: "{\\"fill\\":\\"#ff0000\\"}")
      }
    `,
      diag,
    );

    expect(diag.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(nodes[0].props).toEqual({ fill: '#ff0000' });
  });

  it('wrong node argument type → GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE', () => {
    const diag: Diagnostic[] = [];
    parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, x: "left", visible: "yes")
      }
    `,
      diag,
    );

    const errors = diag.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toEqual([
      GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
      GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
    ]);
    expect(errors.map((d) => d.message).join('\n')).toContain('x');
    expect(errors.map((d) => d.message).join('\n')).toContain('visible');
  });

  it('non-finite numeric node argument → GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE', () => {
    const diag: Diagnostic[] = [];
    parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, x: 1e999)
      }
    `,
      diag,
    );

    const errors = diag.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toContain(GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE);
    expect(errors.map((d) => d.details?.actual)).toContain('non-finite number');
  });

  it('invalid props JSON → GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE error', () => {
    const diag: Diagnostic[] = [];
    parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, props: "[1,2,3]")
      }
    `,
      diag,
    );

    const errors = diag.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code)).toContain(GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE);
  });

  it('preserves field order as fieldOrder property', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        first: String @geordi_node(kind: Rect, x: 0, y: 0)
        second: String @geordi_node(kind: Text, x: 10, y: 10)
        third: String @geordi_node(kind: Rect, x: 20, y: 20)
      }
    `,
      diag,
    );

    expect(nodes.map((n) => n.fieldName)).toEqual(['first', 'second', 'third']);
    expect(nodes.map((n) => n.fieldOrder)).toEqual([0, 1, 2]);
  });

  it('extracts optional zIndex, visible, parent, id args', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect, x: 0, y: 0, zIndex: 5, visible: false, parent: "group1", id: "custom-id")
      }
    `,
      diag,
    );

    expect(nodes[0].zIndex).toBe(5);
    expect(nodes[0].visible).toBe(false);
    expect(nodes[0].parent).toBe('group1');
    expect(nodes[0].id).toBe('custom-id');
  });

  it('x and y default to 0 when not provided', () => {
    const diag: Diagnostic[] = [];
    const { nodes } = parseAndExtract(
      `
      type S @geordi_scene(v: "1", width: 100, height: 100) {
        n: String @geordi_node(kind: Rect)
      }
    `,
      diag,
    );

    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });
});
