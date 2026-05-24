import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJsonPort, type JsonObject } from '@flyingrobots/geordi-core';
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
    const sourceMap = canonicalJsonPort.parse(result.artifacts.sourceMap.content) as JsonObject;
    const nodes = sourceMap.nodes;

    expect(result.artifacts.sourceMap.path).toBe('scene.geordi.map.json');
    expect(sourceMap.version).toBe('geordi-source-map/1');
    expect(sourceMap.sourceFormat).toBe('gpvue');
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes).toHaveLength(8);
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
});
