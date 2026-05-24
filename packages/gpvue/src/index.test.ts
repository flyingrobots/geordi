import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJsonPort, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';
import {
  compileGpvueSource,
  GpvueDuplicateNodeIdError,
  GpvueUnsupportedConstructError,
} from './index.js';

const FIXTURE_ROOT = new URL('../../../fixtures/render-everywhere/hello-panel/', import.meta.url);
const SOURCE_URL = new URL('source.gpvue', FIXTURE_ROOT);
const SCENE_URL = new URL('scene.geordi.json', FIXTURE_ROOT);
const RECEIPT_URL = new URL('scene.geordi.json.receipt', FIXTURE_ROOT);

function readFixture(path: URL): string {
  return readFileSync(path, 'utf8');
}

function compileFixture() {
  return compileGpvueSource({
    filename: 'source.gpvue',
    source: readFixture(SOURCE_URL),
  });
}

class GpvueTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

function jsonObject(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value;
  }

  throw new GpvueTestError(`${label} must be a JSON object`);
}

function jsonObjectArray(value: JsonValue | undefined, label: string): readonly JsonObject[] {
  if (Array.isArray(value) && value.every(isJsonObjectValue)) {
    return value;
  }

  throw new GpvueTestError(`${label} must be a JSON object array`);
}

function numberValue(value: JsonValue | undefined, label: string): number {
  if (typeof value === 'number') {
    return value;
  }

  throw new GpvueTestError(`${label} must be a number`);
}

function sourceMapNodes(sourceMapContent: string): readonly JsonObject[] {
  const sourceMap = jsonObject(canonicalJsonPort.parse(sourceMapContent), 'source map');

  expect(sourceMap.version).toBe('geordi-source-map/1');
  expect(sourceMap.sourceFormat).toBe('gpvue');

  return jsonObjectArray(sourceMap.nodes, 'source map nodes');
}

function unsupportedConstructFor(source: string): string {
  try {
    compileGpvueSource({
      filename: 'bad.gpvue',
      source,
    });
  } catch (error) {
    if (error instanceof GpvueUnsupportedConstructError) {
      return error.construct;
    }
  }

  throw new GpvueTestError('Expected GpvueUnsupportedConstructError');
}

function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('compileGpvueSource', () => {
  it('emits the checked-in rectangle-only Geordi IR artifact', () => {
    const result = compileFixture();

    expect(result.artifactHash).toBe(
      'sha256:30623d6141ba69c382c14c09eca9adedd40cb02644ff4ee9621de101da6b0082',
    );
    expect(result.artifacts.ir.path).toBe('scene.geordi.json');
    expect(result.artifacts.ir.content).toBe(readFixture(SCENE_URL));
  });

  it('emits the checked-in receipt for the compiled artifact hash', () => {
    const result = compileFixture();

    expect(result.artifacts.receipt.path).toBe('scene.geordi.json.receipt');
    expect(result.artifacts.receipt.content).toBe(readFixture(RECEIPT_URL));
  });

  it('emits a GPVue source map for every rectangle node', () => {
    const result = compileFixture();
    const nodes = sourceMapNodes(result.artifacts.sourceMap.content);
    const offsets = nodes.map((node) =>
      numberValue(jsonObject(node.source, 'node source').offset, 'node source offset'),
    );

    expect(result.artifacts.sourceMap.path).toBe('scene.geordi.map.json');
    expect(nodes.map((node) => node.id)).toEqual([
      'background',
      'panel',
      'accent-bar',
      'title-bar',
      'content-line-primary',
      'content-line-secondary',
      'button',
      'status-indicator',
    ]);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(nodes[0]).toEqual({
      id: 'background',
      source: {
        column: 5,
        endColumn: 85,
        endLine: 3,
        endOffset: 173,
        file: 'source.gpvue',
        line: 3,
        offset: 93,
      },
    });
    expect(nodes[7]).toMatchObject({
      id: 'status-indicator',
      source: {
        column: 5,
        file: 'source.gpvue',
        line: 10,
      },
    });
  });

  it('rejects unsupported CSS and text before emitting artifacts', () => {
    expect(() =>
      compileGpvueSource({
        filename: 'bad.gpvue',
        source:
          '<template><GeordiScene id="x" :width="1" :height="1"><Text /></GeordiScene></template>',
      }),
    ).toThrow(GpvueUnsupportedConstructError);

    expect(() =>
      compileGpvueSource({
        filename: 'bad.gpvue',
        source: '<template><style>.x { color: red; }</style></template>',
      }),
    ).toThrow(GpvueUnsupportedConstructError);
  });

  it('rejects dynamic constructs and duplicate node ids', () => {
    expect(() =>
      compileGpvueSource({
        filename: 'bad.gpvue',
        source:
          '<template><GeordiScene id="x" :width="1" :height="1"><Rect id="a" :x="0" :y="0" :width="1" :height="1" fill="#000000" v-if="ok" /></GeordiScene></template>',
      }),
    ).toThrow(GpvueUnsupportedConstructError);

    expect(() =>
      compileGpvueSource({
        filename: 'bad.gpvue',
        source:
          '<template><GeordiScene id="x" :width="1" :height="1"><Rect id="a" :x="0" :y="0" :width="1" :height="1" fill="#000000" /><Rect id="a" :x="0" :y="0" :width="1" :height="1" fill="#000000" /></GeordiScene></template>',
      }),
    ).toThrow(GpvueDuplicateNodeIdError);
  });

  it('reports unsupported scene tags with explicit construct names', () => {
    expect(
      unsupportedConstructFor(
        '<template><GeordiScene id="x" :width="1" :height="1"><Group /></GeordiScene></template>',
      ),
    ).toBe('tag:Group');
    expect(
      unsupportedConstructFor(
        '<template><GeordiScene id="x" :width="1" :height="1"><Layout /></GeordiScene></template>',
      ),
    ).toBe('tag:Layout');
    expect(
      unsupportedConstructFor(
        '<template><GeordiScene id="x" :width="1" :height="1"><Rect id="a" :x="0" :y="0" :width="1" :height="1" fill="#000000"></Rect></GeordiScene></template>',
      ),
    ).toBe('tag:Rect.nonSelfClosing');
  });
});
