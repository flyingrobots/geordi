import type { JsonValue } from '@flyingrobots/geordi-core';

import { BijouGpuValidationError } from './errors.js';
import {
  arrayAt,
  booleanAt,
  integerAt,
  isJsonObject,
  literalAt,
  stringAt,
  type DecodeFail,
} from './json-decode.js';

export const PROCEDURAL_GLYPH_TABLE_SCHEMA = 'bijou-procedural-glyphs/1';
export const BIJOU_SURFACE_GPU_ABI = 'bijou-surface-gpu/1';

/**
 * SHA-256 of `fixtures/bijou-gpu/procedural-glyphs.json`, as frozen by the
 * `bijou-surface-gpu/1` ABI.
 */
export const PROCEDURAL_GLYPH_TABLE_SHA256 =
  '7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46';

export const BOX_DRAWING_START = 0x2500;
export const BOX_DRAWING_COUNT = 128;
export const BLOCK_ELEMENTS_START = 0x2580;
export const BLOCK_ELEMENTS_COUNT = 32;
export const BRAILLE_START = 0x2800;
export const BRAILLE_COUNT = 256;

export const BLOCK_KIND_RECT = 0;
export const BLOCK_KIND_SHADE = 1;
export const BLOCK_KIND_QUADRANT = 2;

/**
 * The procedural glyph table in the form the shader consumes it: one packed
 * `u32` per Box-Drawing entry (`BOX_GLYPHS`) and per Block Element entry
 * (`BLOCK_GLYPHS`). Braille needs no table bytes.
 */
export interface ProceduralGlyphTable {
  readonly schemaVersion: typeof PROCEDURAL_GLYPH_TABLE_SCHEMA;
  readonly boxGlyphs: Uint32Array;
  readonly blockGlyphs: Uint32Array;
}

const fail: DecodeFail = (path, detail) => {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE', path, detail);
};

const BRAILLE_DOT_BITS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
];

/**
 * Decode and strictly validate `fixtures/bijou-gpu/procedural-glyphs.json`.
 *
 * Every entry's `packedU32` is recomputed from its descriptive fields, so a
 * table whose packed words drift from its documented semantics is rejected.
 */
export function decodeProceduralGlyphTable(input: JsonValue): ProceduralGlyphTable {
  if (!isJsonObject(input)) {
    return fail('$', 'expected an object');
  }
  literalAt(input.schemaVersion, PROCEDURAL_GLYPH_TABLE_SCHEMA, '$.schemaVersion', fail);
  literalAt(input.gpuAbiVersion, BIJOU_SURFACE_GPU_ABI, '$.gpuAbiVersion', fail);

  const boxGlyphs = decodeSection(
    input.boxDrawing,
    '$.boxDrawing',
    BOX_DRAWING_START,
    BOX_DRAWING_COUNT,
    packBoxEntry,
  );
  const blockGlyphs = decodeSection(
    input.blockElements,
    '$.blockElements',
    BLOCK_ELEMENTS_START,
    BLOCK_ELEMENTS_COUNT,
    packBlockEntry,
  );
  validateBraille(input.braille);

  return { schemaVersion: PROCEDURAL_GLYPH_TABLE_SCHEMA, boxGlyphs, blockGlyphs };
}

function decodeSection(
  input: JsonValue | undefined,
  path: string,
  startCodePoint: number,
  count: number,
  pack: (entry: JsonValue, path: string) => number,
): Uint32Array {
  if (!isJsonObject(input)) {
    return fail(path, 'expected an object');
  }
  if (input.startCodePoint !== startCodePoint) {
    fail(`${path}.startCodePoint`, `expected ${String(startCodePoint)}`);
  }
  if (input.count !== count) {
    fail(`${path}.count`, `expected ${String(count)}`);
  }
  const entries = arrayAt(input.entries, `${path}.entries`, fail);
  if (entries.length !== count) {
    fail(`${path}.entries`, `expected ${String(count)} entries`);
  }
  const packed = new Uint32Array(count);
  entries.forEach((entry, index) => {
    const entryPath = `${path}.entries[${String(index)}]`;
    if (!isJsonObject(entry)) {
      fail(entryPath, 'expected an object');
      return;
    }
    if (entry.codePoint !== startCodePoint + index) {
      fail(`${entryPath}.codePoint`, `expected ${String(startCodePoint + index)}`);
    }
    const declared = integerAt(entry.packedU32, `${entryPath}.packedU32`, 0, 0xffffffff, fail);
    if (declared !== pack(entry, entryPath)) {
      fail(`${entryPath}.packedU32`, 'packed word does not match the entry fields');
    }
    packed[index] = declared;
  });
  return packed;
}

function packBoxEntry(entry: JsonValue, path: string): number {
  if (!isJsonObject(entry)) {
    return fail(path, 'expected an object');
  }
  const left = integerAt(entry.left, `${path}.left`, 0, 3, fail);
  const right = integerAt(entry.right, `${path}.right`, 0, 3, fail);
  const up = integerAt(entry.up, `${path}.up`, 0, 3, fail);
  const down = integerAt(entry.down, `${path}.down`, 0, 3, fail);
  const dash = integerAt(entry.dash, `${path}.dash`, 0, 4, fail);
  if (dash === 1) {
    fail(`${path}.dash`, 'expected 0, 2, 3, or 4');
  }
  const rounded = booleanAt(entry.rounded, `${path}.rounded`, fail);
  const diagSlash = booleanAt(entry.diagSlash, `${path}.diagSlash`, fail);
  const diagBackslash = booleanAt(entry.diagBackslash, `${path}.diagBackslash`, fail);
  return (
    left |
    (right << 2) |
    (up << 4) |
    (down << 6) |
    (dash << 8) |
    ((rounded ? 1 : 0) << 11) |
    ((diagSlash ? 1 : 0) << 12) |
    ((diagBackslash ? 1 : 0) << 13)
  );
}

function packBlockEntry(entry: JsonValue, path: string): number {
  if (!isJsonObject(entry)) {
    return fail(path, 'expected an object');
  }
  const kind = stringAt(entry.kind, `${path}.kind`, fail);
  if (kind === 'rect') {
    const rect = arrayAt(entry.rectEighths, `${path}.rectEighths`, fail);
    if (rect.length !== 4) {
      fail(`${path}.rectEighths`, 'expected [x0, y0, x1, y1]');
    }
    const [x0, y0, x1, y1] = rect.map((value, index) =>
      integerAt(value, `${path}.rectEighths[${String(index)}]`, 0, 8, fail),
    ) as [number, number, number, number];
    return (
      x0 | (y0 << 4) | (x1 << 8) | (y1 << 12) | (BLOCK_KIND_RECT << 16)
    );
  }
  if (kind === 'shade') {
    const quarter = integerAt(entry.shadeQuarter, `${path}.shadeQuarter`, 1, 3, fail);
    return quarter | (BLOCK_KIND_SHADE << 16);
  }
  if (kind === 'quadrant') {
    const mask = integerAt(entry.quadrantMask, `${path}.quadrantMask`, 1, 15, fail);
    return mask | (BLOCK_KIND_QUADRANT << 16);
  }
  return fail(`${path}.kind`, 'expected "rect", "shade", or "quadrant"');
}

function validateBraille(input: JsonValue | undefined): void {
  const path = '$.braille';
  if (!isJsonObject(input)) {
    fail(path, 'expected an object');
    return;
  }
  if (input.startCodePoint !== BRAILLE_START) {
    fail(`${path}.startCodePoint`, `expected ${String(BRAILLE_START)}`);
  }
  if (input.count !== BRAILLE_COUNT) {
    fail(`${path}.count`, `expected ${String(BRAILLE_COUNT)}`);
  }
  if (input.gridCols !== 2 || input.gridRows !== 4) {
    fail(path, 'expected a 2x4 dot grid');
  }
  const dotBits = arrayAt(input.dotBits, `${path}.dotBits`, fail);
  if (dotBits.length !== BRAILLE_DOT_BITS.length) {
    fail(`${path}.dotBits`, 'expected 8 dot bits');
  }
  dotBits.forEach((dot, bit) => {
    const dotPath = `${path}.dotBits[${String(bit)}]`;
    const expected = BRAILLE_DOT_BITS.at(bit);
    if (
      !isJsonObject(dot) ||
      expected === undefined ||
      dot.bit !== bit ||
      dot.col !== expected[0] ||
      dot.row !== expected[1]
    ) {
      fail(dotPath, 'dot bit mapping does not match bijou-surface-gpu/1');
    }
  });
}
