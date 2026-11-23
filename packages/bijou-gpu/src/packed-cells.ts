import type { JsonValue } from '@flyingrobots/geordi-core';

import { BijouGpuValidationError } from './errors.js';
import { arrayAt, objectAt, type DecodeFail } from './json-decode.js';
import { isSha256Hex, utf8Bytes } from './sha256.js';

/**
 * Geordi-side strict validator for Bijou's canonical `packed-bijou-cells/1`
 * receipt (`bijou-packed-cell-u8x10-le/1` cells, width-1 glyph policy).
 *
 * Bijou owns this contract. This module mirrors Bijou's validator at
 * `flyingrobots/bijou@906666f9` (`packages/bijou/src/core/packed-bijou-cells-*.ts`)
 * so Geordi endpoints can refuse non-canonical input with Geordi error codes;
 * it must never accept anything Bijou rejects or define new cell semantics.
 */
export const PACKED_BIJOU_CELLS_VERSION = 'packed-bijou-cells/1';
export const PACKED_BIJOU_CELL_FORMAT = 'bijou-packed-cell-u8x10-le/1';
export const PACKED_BIJOU_GLYPH_POLICY = 'unicode-grapheme-side-table/1';
export const PACKED_BIJOU_SCENE_VERSION = 'ui-scene-ir/1';

export const CELL_STRIDE = 10;
export const OFF_CHAR = 0;
export const OFF_FG_R = 2;
export const OFF_FG_G = 3;
export const OFF_FG_B = 4;
export const OFF_BG_R = 5;
export const OFF_BG_G = 6;
export const OFF_BG_B = 7;
export const OFF_FLAGS = 8;
export const OFF_ALPHA = 9;

export const FLAG_BOLD = 0x01;
export const FLAG_DIM = 0x02;
export const FLAG_STRIKETHROUGH = 0x04;
export const FLAG_INVERSE = 0x08;
export const UNDERLINE_SHIFT = 4;
export const UNDERLINE_MASK = 0x30;
export const UNDERLINE_NONE = 0x00;
export const UNDERLINE_SOLID = 0x10;
export const UNDERLINE_CURLY = 0x20;
export const UNDERLINE_DOTDASH = 0x30;
export const FLAG_DASHED = 0x40;
export const FLAG_EMPTY = 0x80;

export const OPACITY_MASK = 0x3f;
export const FLAG_FG_SET = 0x40;
export const FLAG_BG_SET = 0x80;

export const SIDE_TABLE_THRESHOLD = 0xf000;
export const MAX_PACKED_BIJOU_CELLS = 100_000;
export const MAX_PACKED_BIJOU_DIMENSION = 9_999;
export const MAX_PACKED_BIJOU_GLYPH_CODE_UNITS = 256;
export const MAX_PACKED_BIJOU_GLYPH_UTF8_BYTES = 32;
export const MAX_PACKED_BIJOU_SIDE_TABLE_ENTRIES = 0x1000;

export interface PackedBijouCellsScene {
  readonly sceneVersion: typeof PACKED_BIJOU_SCENE_VERSION;
  readonly sceneHash: string;
  readonly nodeIds: readonly string[];
  readonly cellNodeIds: readonly string[];
}

export interface PackedBijouCellsFocus {
  readonly focusedNodeId: string | null;
  readonly focusableNodeIds: readonly string[];
}

export interface PackedBijouCellsChroma {
  readonly colorSpace: 'srgb';
  readonly channelEncoding: 'uint8';
  readonly alphaEncoding: 'uint6';
  readonly terminalDefaultEncoding: 'presence-bits';
}

export interface PackedBijouCellsReceipt {
  readonly receiptVersion: typeof PACKED_BIJOU_CELLS_VERSION;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly cellFormatId: typeof PACKED_BIJOU_CELL_FORMAT;
  readonly glyphPolicyId: typeof PACKED_BIJOU_GLYPH_POLICY;
  readonly bytes: readonly number[];
  readonly sideTable: readonly string[];
  readonly scene: PackedBijouCellsScene;
  readonly focus: PackedBijouCellsFocus;
  readonly chroma: PackedBijouCellsChroma;
}

const RECEIPT_FIELDS = [
  'receiptVersion',
  'widthCells',
  'heightCells',
  'cellFormatId',
  'glyphPolicyId',
  'bytes',
  'sideTable',
  'scene',
  'focus',
  'chroma',
] as const;
const SCENE_FIELDS = ['sceneVersion', 'sceneHash', 'nodeIds', 'cellNodeIds'] as const;
const FOCUS_FIELDS = ['focusedNodeId', 'focusableNodeIds'] as const;
const CHROMA_FIELDS = [
  'colorSpace',
  'channelEncoding',
  'alphaEncoding',
  'terminalDefaultEncoding',
] as const;
const CHROMA_LITERALS: PackedBijouCellsChroma = {
  colorSpace: 'srgb',
  channelEncoding: 'uint8',
  alphaEncoding: 'uint6',
  terminalDefaultEncoding: 'presence-bits',
};

const fail: DecodeFail = (path, detail) => {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_PACKED_CELLS', path, detail);
};

function failWide(path: string, glyph: string): never {
  throw new BijouGpuValidationError(
    'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
    path,
    `width-2 grapheme ${describeGlyph(glyph)} is not representable in bijou-surface-gpu/1`,
  );
}

function describeGlyph(glyph: string): string {
  return Array.from(glyph)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join(' ');
}

let cachedSegmenter: Intl.Segmenter | undefined;

/** Split a string into extended grapheme clusters. */
export function segmentGraphemes(value: string): string[] {
  // ban-nondeterminism: allow(host-locale) the locale is pinned to en; grapheme boundaries still come from the host's Unicode tables, so two hosts with different ICU versions can disagree on newly assigned sequences (docs/nondeterminism-rules.md)
  cachedSegmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' });
  return Array.from(cachedSegmenter.segment(value), (part) => part.segment);
}

/** Bijou's East Asian Wide / emoji table (`core/text/grapheme.part01.ts`). */
export function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x2e80 && cp <= 0x2fdf) ||
    (cp >= 0x3000 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0x20000 && cp <= 0x3ffff) ||
    (cp >= 0x1f300 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa00 && cp <= 0x1fa6f) ||
    (cp >= 0x1fa70 && cp <= 0x1faff) ||
    (cp >= 0x1f600 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f1e0 && cp <= 0x1f1ff) ||
    (cp >= 0x1f000 && cp <= 0x1f02f)
  );
}

/** Terminal column width (1 or 2) of one grapheme cluster, per Bijou. */
export function graphemeClusterWidth(grapheme: string): number {
  let hasEmojiPresentation = false;
  for (const character of grapheme) {
    const cp = character.codePointAt(0);
    if (cp === undefined) {
      continue;
    }
    if (cp === 0xfe0f) {
      hasEmojiPresentation = true;
      continue;
    }
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0e) || (cp >= 0xe0100 && cp <= 0xe01ef)) {
      continue;
    }
    if (isWideCodePoint(cp)) {
      return 2;
    }
  }
  return hasEmojiPresentation ? 2 : 1;
}

function hasTerminalControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const cp = character.codePointAt(0) ?? 0;
    return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
  });
}

function hasUnsafeFormat(value: string): boolean {
  return Array.from(value).some((character) => {
    const cp = character.codePointAt(0) ?? 0;
    if (cp === 0x200c || cp === 0x200d) {
      return false;
    }
    if (cp >= 0xe0020 && cp <= 0xe007f) {
      return false;
    }
    return /^\p{Cf}$/u.test(character);
  });
}

function hasVisibleBase(value: string): boolean {
  return Array.from(value).some(
    (character) => !/^[\p{M}\p{Cf}\p{Default_Ignorable_Code_Point}]$/u.test(character),
  );
}

function hasLoneSurrogate(value: string): boolean {
  return Array.from(value).some((character) => {
    const cp = character.codePointAt(0) ?? 0;
    return cp >= 0xd800 && cp <= 0xdfff;
  });
}

/**
 * The glyph-safety half of Bijou's `isSafeUnitGlyph`: every check except the
 * single-grapheme and width-1 tests, which {@link isSafeUnitGlyph} adds.
 *
 * Bijou additionally requires `sanitizePlainTerminalText(value) === value`.
 * For a string with no terminal control characters that function only
 * rewrites Bijou's internal placeholder run (`U+E000 <digits> U+E001`), which
 * is at least three graphemes and so already fails the single-grapheme test.
 *
 * A lone UTF-16 surrogate is refused here as well. Bijou refuses surrogates
 * only for direct cell codes; a prepared GPU glyph key must be well-formed
 * Unicode, so this validator is deliberately stricter for side-table text.
 */
function isTerminalSafeGlyphText(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_PACKED_BIJOU_GLYPH_CODE_UNITS &&
    !hasLoneSurrogate(value) &&
    utf8Bytes(value).length <= MAX_PACKED_BIJOU_GLYPH_UTF8_BYTES &&
    !hasTerminalControl(value) &&
    !hasUnsafeFormat(value) &&
    hasVisibleBase(value)
  );
}

/** Bijou's width-1 canonical glyph policy for one cell. */
export function isSafeUnitGlyph(value: string): boolean {
  return (
    isTerminalSafeGlyphText(value) &&
    segmentGraphemes(value).length === 1 &&
    graphemeClusterWidth(value) === 1
  );
}

/** A terminal-safe single grapheme that occupies two columns. */
export function isWideUnitGlyph(value: string): boolean {
  return (
    isTerminalSafeGlyphText(value) &&
    segmentGraphemes(value).length === 1 &&
    graphemeClusterWidth(value) === 2
  );
}

function isDirectlyEncodableGlyph(value: string): boolean {
  return value.length === 1 && value.charCodeAt(0) < SIDE_TABLE_THRESHOLD;
}

/**
 * Strictly parse a `packed-bijou-cells/1` receipt.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` when
 *   a cell or side-table entry holds a width-2 grapheme, and
 *   `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` for every other violation.
 */
export function parsePackedBijouCellsReceipt(input: JsonValue): PackedBijouCellsReceipt {
  const record = objectAt(input, '$', RECEIPT_FIELDS, fail);
  if (record.receiptVersion !== PACKED_BIJOU_CELLS_VERSION) {
    fail('$.receiptVersion', `expected "${PACKED_BIJOU_CELLS_VERSION}"`);
  }
  if (record.cellFormatId !== PACKED_BIJOU_CELL_FORMAT) {
    fail('$.cellFormatId', `expected "${PACKED_BIJOU_CELL_FORMAT}"`);
  }
  if (record.glyphPolicyId !== PACKED_BIJOU_GLYPH_POLICY) {
    fail('$.glyphPolicyId', `expected "${PACKED_BIJOU_GLYPH_POLICY}"`);
  }
  const widthCells = dimensionAt(record.widthCells, '$.widthCells');
  const heightCells = dimensionAt(record.heightCells, '$.heightCells');
  const cellCount = widthCells * heightCells;
  if (cellCount > MAX_PACKED_BIJOU_CELLS) {
    fail('$', `cell count exceeds ${String(MAX_PACKED_BIJOU_CELLS)}`);
  }

  const bytes = bytesAt(record.bytes, cellCount * CELL_STRIDE);
  const sideTable = sideTableAt(record.sideTable, bytes);
  validateColorsAndModifiers(bytes);
  const scene = sceneAt(record.scene, cellCount);
  const focus = focusAt(record.focus, new Set(scene.nodeIds));
  chromaAt(record.chroma);

  return {
    receiptVersion: PACKED_BIJOU_CELLS_VERSION,
    widthCells,
    heightCells,
    cellFormatId: PACKED_BIJOU_CELL_FORMAT,
    glyphPolicyId: PACKED_BIJOU_GLYPH_POLICY,
    bytes,
    sideTable,
    scene,
    focus,
    chroma: CHROMA_LITERALS,
  };
}

function dimensionAt(value: JsonValue | undefined, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_PACKED_BIJOU_DIMENSION
  ) {
    return fail(path, `expected an integer in 1..${String(MAX_PACKED_BIJOU_DIMENSION)}`);
  }
  return value;
}

function bytesAt(value: JsonValue | undefined, expectedLength: number): number[] {
  const raw = arrayAt(value, '$.bytes', fail);
  if (raw.length !== expectedLength) {
    fail(
      '$.bytes',
      `expected ${String(expectedLength)} bytes, received ${String(raw.length)}`,
    );
  }
  return raw.map((item, index) => {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      Object.is(item, -0) ||
      item < 0 ||
      item > 255
    ) {
      return fail(`$.bytes[${String(index)}]`, 'expected canonical unsigned byte 0..255');
    }
    return item;
  });
}

function sideTableAt(value: JsonValue | undefined, bytes: readonly number[]): string[] {
  const raw = arrayAt(value, '$.sideTable', fail);
  if (raw.length > MAX_PACKED_BIJOU_SIDE_TABLE_ENTRIES) {
    fail('$.sideTable', `exceeds ${String(MAX_PACKED_BIJOU_SIDE_TABLE_ENTRIES)} entries`);
  }
  const seen = new Set<string>();
  const sideTable = raw.map((item, index) => {
    const path = `$.sideTable[${String(index)}]`;
    if (typeof item !== 'string') {
      return fail(path, 'expected one terminal-safe grapheme of width 1');
    }
    if (isWideUnitGlyph(item)) {
      return failWide(path, item);
    }
    if (!isSafeUnitGlyph(item) || isDirectlyEncodableGlyph(item)) {
      return fail(path, 'expected one terminal-safe grapheme of width 1');
    }
    if (seen.has(item)) {
      return fail(path, 'duplicate glyph');
    }
    seen.add(item);
    return item;
  });

  const referenced = new Set<number>();
  for (let offset = 0; offset < bytes.length; offset += CELL_STRIDE) {
    const code = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
    const path = `$.bytes[${String(offset)}]`;
    if (code >= SIDE_TABLE_THRESHOLD) {
      const index = code - SIDE_TABLE_THRESHOLD;
      if (index >= sideTable.length) {
        fail(path, `side-table index ${String(index)} does not exist`);
      }
      referenced.add(index);
    } else if (code >= 0xd800 && code <= 0xdfff) {
      fail(path, 'direct glyph cannot be a UTF-16 surrogate');
    } else {
      const glyph = String.fromCharCode(code);
      if (isWideUnitGlyph(glyph)) {
        failWide(path, glyph);
      }
      if (!isSafeUnitGlyph(glyph)) {
        fail(path, 'direct glyph must be terminal safe and width 1');
      }
    }
  }
  sideTable.forEach((_glyph, index) => {
    if (!referenced.has(index)) {
      fail(`$.sideTable[${String(index)}]`, 'glyph is not referenced by any cell');
    }
  });
  return sideTable;
}

function validateColorsAndModifiers(bytes: readonly number[]): void {
  for (let offset = 0; offset < bytes.length; offset += CELL_STRIDE) {
    const alpha = bytes[offset + OFF_ALPHA] ?? 0;
    const absent: readonly (readonly [number, readonly number[]])[] = [
      [FLAG_FG_SET, [OFF_FG_R, OFF_FG_G, OFF_FG_B]],
      [FLAG_BG_SET, [OFF_BG_R, OFF_BG_G, OFF_BG_B]],
    ];
    for (const [presence, channels] of absent) {
      if ((alpha & presence) !== 0) {
        continue;
      }
      for (const channel of channels) {
        if ((bytes[offset + channel] ?? 0) !== 0) {
          fail(
            `$.bytes[${String(offset + channel)}]`,
            'terminal-default color channels must be zero',
          );
        }
      }
    }
    const flags = bytes[offset + OFF_FLAGS] ?? 0;
    if ((flags & FLAG_DASHED) !== 0 && (flags & UNDERLINE_MASK) !== UNDERLINE_DOTDASH) {
      fail(
        `$.bytes[${String(offset + OFF_FLAGS)}]`,
        'dashed flag requires dotted/dashed underline bits',
      );
    }
  }
}

function canonicalIdAt(value: JsonValue | undefined, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    hasTerminalControl(value)
  ) {
    return fail(path, 'expected a canonical non-empty id');
  }
  return value;
}

function uniqueIdsAt(value: JsonValue | undefined, path: string): string[] {
  const seen = new Set<string>();
  return arrayAt(value, path, fail).map((item, index) => {
    const itemPath = `${path}[${String(index)}]`;
    const id = canonicalIdAt(item, itemPath);
    if (seen.has(id)) {
      fail(itemPath, 'duplicate id');
    }
    seen.add(id);
    return id;
  });
}

function sceneAt(input: JsonValue | undefined, cellCount: number): PackedBijouCellsScene {
  const record = objectAt(input, '$.scene', SCENE_FIELDS, fail);
  if (record.sceneVersion !== PACKED_BIJOU_SCENE_VERSION) {
    fail('$.scene.sceneVersion', `expected "${PACKED_BIJOU_SCENE_VERSION}"`);
  }
  const sceneHash = record.sceneHash;
  if (typeof sceneHash !== 'string' || !isSha256Hex(sceneHash)) {
    return fail('$.scene.sceneHash', 'expected a lowercase SHA-256 digest');
  }
  const nodeIds = uniqueIdsAt(record.nodeIds, '$.scene.nodeIds');
  if (nodeIds.length === 0) {
    fail('$.scene.nodeIds', 'cannot be empty');
  }
  const known = new Set(nodeIds);
  const owners = arrayAt(record.cellNodeIds, '$.scene.cellNodeIds', fail);
  if (owners.length !== cellCount) {
    fail('$.scene.cellNodeIds', `expected ${String(cellCount)} cell owners`);
  }
  const cellNodeIds = owners.map((item, index) => {
    const path = `$.scene.cellNodeIds[${String(index)}]`;
    const id = canonicalIdAt(item, path);
    if (!known.has(id)) {
      fail(path, 'owner is not a declared node');
    }
    return id;
  });
  return { sceneVersion: PACKED_BIJOU_SCENE_VERSION, sceneHash, nodeIds, cellNodeIds };
}

function focusAt(input: JsonValue | undefined, nodeIds: ReadonlySet<string>): PackedBijouCellsFocus {
  // `focusedNodeId` is legitimately null, so presence is checked by key here.
  const record = objectAt(input, '$.focus', FOCUS_FIELDS, fail);
  const focusableNodeIds = uniqueIdsAt(record.focusableNodeIds, '$.focus.focusableNodeIds');
  focusableNodeIds.forEach((id, index) => {
    if (!nodeIds.has(id)) {
      fail(
        `$.focus.focusableNodeIds[${String(index)}]`,
        'focusable id is not a declared scene node',
      );
    }
  });
  const focusedNodeId =
    record.focusedNodeId === null
      ? null
      : canonicalIdAt(record.focusedNodeId, '$.focus.focusedNodeId');
  if (focusedNodeId !== null && !focusableNodeIds.includes(focusedNodeId)) {
    fail('$.focus.focusedNodeId', 'focused id is not in focusableNodeIds');
  }
  return { focusedNodeId, focusableNodeIds };
}

function chromaAt(input: JsonValue | undefined): void {
  const record = objectAt(input, '$.chroma', CHROMA_FIELDS, fail);
  for (const field of CHROMA_FIELDS) {
    if (record[field] !== CHROMA_LITERALS[field]) {
      fail(`$.chroma.${field}`, `expected "${CHROMA_LITERALS[field]}"`);
    }
  }
}
