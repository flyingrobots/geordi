import type { JsonValue } from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';

import {
  BijouGpuValidationError,
  CELL_STRIDE,
  FLAG_BG_SET,
  FLAG_BOLD,
  FLAG_DASHED,
  FLAG_DIM,
  FLAG_EMPTY,
  FLAG_FG_SET,
  FLAG_INVERSE,
  FLAG_STRIKETHROUGH,
  graphemeClusterWidth,
  isSafeUnitGlyph,
  OPACITY_MASK,
  parsePackedBijouCellsReceipt,
  SIDE_TABLE_THRESHOLD,
  UNDERLINE_CURLY,
  UNDERLINE_DOTDASH,
  UNDERLINE_SOLID,
} from './index.js';
import {
  loadSuite,
  mutableClone,
  nodeSha256,
  readFixtureBytes,
  readFixtureJson,
  suiteCell,
  suiteFrame,
  type SuiteCell,
} from '../test/support.js';

const MODIFIER_FLAGS: Readonly<Record<string, number>> = {
  bold: FLAG_BOLD,
  dim: FLAG_DIM,
  strikethrough: FLAG_STRIKETHROUGH,
  inverse: FLAG_INVERSE,
  underline: UNDERLINE_SOLID,
  'curly-underline': UNDERLINE_CURLY,
  'dotted-underline': UNDERLINE_DOTDASH,
  'dashed-underline': UNDERLINE_DOTDASH | FLAG_DASHED,
};

function hexChannels(hex: string | null): readonly number[] {
  if (hex === null) {
    return [0, 0, 0];
  }
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

function expectedBytes(cell: SuiteCell, sideTable: readonly string[]): number[] {
  const direct = cell.grapheme.length === 1 && cell.grapheme.charCodeAt(0) < SIDE_TABLE_THRESHOLD;
  const code = direct
    ? cell.grapheme.charCodeAt(0)
    : SIDE_TABLE_THRESHOLD + sideTable.indexOf(cell.grapheme);
  const flags =
    cell.modifiers.reduce((acc, modifier) => acc | (MODIFIER_FLAGS[modifier] ?? 0), 0) |
    (cell.empty ? FLAG_EMPTY : 0);
  const alpha =
    (cell.opacity & OPACITY_MASK) |
    (cell.fg === null ? 0 : FLAG_FG_SET) |
    (cell.bg === null ? 0 : FLAG_BG_SET);
  return [code & 0xff, code >>> 8, ...hexChannels(cell.fg), ...hexChannels(cell.bg), flags, alpha];
}

function expectRejected(input: JsonValue, code: string, path: string): void {
  let caught: BijouGpuValidationError | undefined;
  try {
    parsePackedBijouCellsReceipt(input);
  } catch (error) {
    if (error instanceof BijouGpuValidationError) {
      caught = error;
    } else {
      throw error;
    }
  }
  expect(caught?.code).toBe(code);
  expect(caught?.path).toBe(path);
}

/** The byte-identical Bijou `tests/fixtures/RE-036/packed-bijou-cells.v1.json` receipt. */
const BIJOU_RE_036_RECEIPT: JsonValue = {
  receiptVersion: 'packed-bijou-cells/1',
  widthCells: 2,
  heightCells: 2,
  cellFormatId: 'bijou-packed-cell-u8x10-le/1',
  glyphPolicyId: 'unicode-grapheme-side-table/1',
  bytes: [
    65, 0, 255, 64, 32, 0, 0, 0, 1, 127, 0, 240, 0, 0, 0, 10, 20, 200, 16, 191, 1, 240, 0, 200, 80,
    1, 2, 3, 112, 255, 32, 0, 0, 0, 0, 0, 0, 0, 128, 0,
  ],
  sideTable: ['e\u0301', '\uf000'],
  scene: {
    sceneVersion: 'ui-scene-ir/1',
    sceneHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    nodeIds: ['scene.root', 'scene.title', 'scene.status'],
    cellNodeIds: ['scene.title', 'scene.title', 'scene.status', 'scene.root'],
  },
  focus: { focusedNodeId: 'scene.status', focusableNodeIds: ['scene.title', 'scene.status'] },
  chroma: {
    colorSpace: 'srgb',
    channelEncoding: 'uint8',
    alphaEncoding: 'uint6',
    terminalDefaultEncoding: 'presence-bits',
  },
};

describe('width-1 packed-bijou-cells/1 conformance fixtures', () => {
  const suite = loadSuite();
  const paintJson = readFixtureJson(suiteFrame(suite, 'paint').path);
  const eraseJson = readFixtureJson(suiteFrame(suite, 'erase').path);

  it('validates the checked-in paint and erase frames strictly under the width-1 glyph policy', () => {
    const paint = parsePackedBijouCellsReceipt(paintJson);
    const erase = parsePackedBijouCellsReceipt(eraseJson);
    expect(paint.widthCells * paint.heightCells).toBe(suite.cells.length);
    expect(erase.widthCells).toBe(paint.widthCells);
    expect(erase.heightCells).toBe(paint.heightCells);
    for (const receipt of [paint, erase]) {
      for (const glyph of receipt.sideTable) {
        expect(isSafeUnitGlyph(glyph), glyph).toBe(true);
        expect(graphemeClusterWidth(glyph)).toBe(1);
      }
    }
  });

  it('pins each frame file to the inputReceiptSha256 recorded in the suite manifest', () => {
    for (const frame of suite.frames) {
      expect(nodeSha256(readFixtureBytes(frame.path)), frame.id).toBe(frame.inputReceiptSha256);
    }
  });

  it('encodes every labelled cell exactly as the suite manifest declares it', () => {
    const paint = parsePackedBijouCellsReceipt(paintJson);
    for (const cell of suite.cells) {
      const offset = (cell.row * paint.widthCells + cell.col) * CELL_STRIDE;
      expect(paint.bytes.slice(offset, offset + CELL_STRIDE), cell.id).toEqual(
        expectedBytes(cell, paint.sideTable),
      );
    }
  });

  it('carries the RE-510 glyphs: A, decomposed e + combining acute, U+F000, and an empty cell', () => {
    const paint = parsePackedBijouCellsReceipt(paintJson);
    expect(suiteCell(suite, 'glyph-ascii-a').grapheme).toBe('A');
    const acute = suiteCell(suite, 'glyph-decomposed-e-acute').grapheme;
    expect(Array.from(acute, (c) => c.codePointAt(0))).toEqual([0x65, 0x301]);
    expect(suiteCell(suite, 'glyph-private-use-f000').grapheme).toBe('\uf000');
    expect(paint.sideTable).toEqual(['e\u0301', '\uf000']);
    const empty = suiteCell(suite, 'glyph-empty');
    expect(empty.grapheme).toBe(' ');
    expect(empty.empty).toBe(true);
  });

  it('covers every modifier, underline style, presence bit, partial opacity, and procedural family', () => {
    const modifiers = new Set(suite.cells.flatMap((cell) => cell.modifiers));
    expect([...modifiers].sort()).toEqual(Object.keys(MODIFIER_FLAGS).sort());
    expect(suite.cells.some((cell) => cell.fg !== null && cell.bg === null)).toBe(true);
    expect(suite.cells.some((cell) => cell.fg === null && cell.bg !== null)).toBe(true);
    expect(suite.cells.some((cell) => cell.fg === null && cell.bg === null && !cell.empty)).toBe(true);
    expect(suite.cells.some((cell) => cell.opacity > 0 && cell.opacity < 63)).toBe(true);
    const inRange = (start: number, end: number): boolean =>
      suite.cells.some((cell) => {
        const cp = cell.grapheme.codePointAt(0) ?? 0;
        return cp >= start && cp <= end;
      });
    expect(inRange(0x2500, 0x257f)).toBe(true);
    expect(inRange(0x2580, 0x259f)).toBe(true);
    expect(inRange(0x2800, 0x28ff)).toBe(true);
  });

  it('erase frame clears every cell except the retained one and drops the side table', () => {
    const paint = parsePackedBijouCellsReceipt(paintJson);
    const erase = parsePackedBijouCellsReceipt(eraseJson);
    expect(erase.sideTable).toEqual([]);
    const canonicalEmpty = [0x20, 0, 0, 0, 0, 0, 0, 0, FLAG_EMPTY, 0];
    for (const cell of suite.cells) {
      const offset = (cell.row * erase.widthCells + cell.col) * CELL_STRIDE;
      const erased = erase.bytes.slice(offset, offset + CELL_STRIDE);
      if (cell.id === suite.retainedCellId) {
        expect(erased, cell.id).toEqual(paint.bytes.slice(offset, offset + CELL_STRIDE));
      } else {
        expect(erased, cell.id).toEqual(canonicalEmpty);
      }
    }
  });

  it('accepts the byte-identical Bijou RE-036 canonical receipt', () => {
    const receipt = parsePackedBijouCellsReceipt(BIJOU_RE_036_RECEIPT);
    expect(receipt.sideTable).toEqual(['e\u0301', '\uf000']);
    expect(receipt.bytes).toHaveLength(4 * CELL_STRIDE);
  });
});

describe('width-2 graphemes are refused loudly', () => {
  const suite = loadSuite();

  it('rejects the checked-in negative width-2 fixture with GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH', () => {
    expect(suite.negativeErrorCode).toBe('GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH');
    expectRejected(
      readFixtureJson(suite.negativePath),
      'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
      '$.bytes[0]',
    );
    expect(() => parsePackedBijouCellsReceipt(readFixtureJson(suite.negativePath))).toThrow(
      /width-2 grapheme U\+6F22/u,
    );
  });

  it('rejects a width-2 emoji side-table grapheme with a typed validation error', () => {
    const receipt = mutableClone(BIJOU_RE_036_RECEIPT);
    receipt.sideTable = ['e\u0301', '\u{1f600}'];
    expectRejected(receipt, 'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH', '$.sideTable[1]');
  });

  it('rejects an emoji-presentation sequence that widens a narrow base', () => {
    const receipt = mutableClone(BIJOU_RE_036_RECEIPT);
    receipt.sideTable = ['e\u0301', '\u2702\ufe0f'];
    expectRejected(receipt, 'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH', '$.sideTable[1]');
  });
});

describe('malformed packed-bijou-cells/1 receipts', () => {
  const edit = (apply: (receipt: Record<string, JsonValue>) => void): JsonValue => {
    const receipt = mutableClone(BIJOU_RE_036_RECEIPT);
    apply(receipt);
    return receipt;
  };
  const withBytes = (apply: (bytes: number[]) => void): JsonValue =>
    edit((receipt) => {
      const bytes = [...(receipt.bytes as readonly number[])];
      apply(bytes);
      receipt.bytes = bytes;
    });
  const invalid = 'GEORDI_E_BIJOU_INVALID_PACKED_CELLS';

  it.each([
    ['an unknown field', edit((r) => (r.extra = 1)), '$.extra'],
    ['a missing field', edit((r) => delete r.chroma), '$.chroma'],
    ['a wrong receipt version', edit((r) => (r.receiptVersion = 'packed-bijou-cells/2')), '$.receiptVersion'],
    ['a wrong cell format', edit((r) => (r.cellFormatId = 'other/1')), '$.cellFormatId'],
    ['a zero width', edit((r) => (r.widthCells = 0)), '$.widthCells'],
    ['a zero height', edit((r) => (r.heightCells = 0)), '$.heightCells'],
    ['a fractional width', edit((r) => (r.widthCells = 1.5)), '$.widthCells'],
    ['a byte length mismatch', withBytes((b) => b.pop()), '$.bytes'],
    ['a byte above 255', withBytes((b) => (b[2] = 256)), '$.bytes[2]'],
    ['nonzero channels under a clear fg presence bit', withBytes((b) => (b[32] = 9)), '$.bytes[32]'],
    ['a dashed flag without dotted/dashed underline bits', withBytes((b) => (b[8] = FLAG_DASHED)), '$.bytes[8]'],
    ['a control character glyph', withBytes((b) => (b[0] = 7)), '$.bytes[0]'],
    ['a direct UTF-16 surrogate', withBytes((b) => ((b[0] = 0), (b[1] = 0xd8))), '$.bytes[0]'],
    ['a dangling side-table index', withBytes((b) => (b[10] = 9)), '$.bytes[10]'],
    ['an unreferenced side-table glyph', edit((r) => (r.sideTable = ['e\u0301', '\uf000', '\uf001'])), '$.sideTable[2]'],
    ['a duplicate side-table glyph', edit((r) => (r.sideTable = ['e\u0301', 'e\u0301'])), '$.sideTable[1]'],
    ['a directly encodable side-table glyph', edit((r) => (r.sideTable = ['e\u0301', 'B'])), '$.sideTable[1]'],
    ['a two-grapheme side-table entry', edit((r) => (r.sideTable = ['e\u0301', 'ab'])), '$.sideTable[1]'],
    ['a lone combining mark', edit((r) => (r.sideTable = ['\u0301\u0300', '\uf000'])), '$.sideTable[0]'],
  ])('rejects %s', (_label, receipt, path) => {
    expectRejected(receipt, invalid, path);
  });

  it('rejects metadata that does not describe the grid', () => {
    const scene = (apply: (scene: Record<string, JsonValue>) => void): JsonValue =>
      edit((r) => {
        const next = mutableClone(r.scene ?? null);
        apply(next);
        r.scene = next;
      });
    expectRejected(
      scene((s) => (s.cellNodeIds = ['scene.root'])),
      invalid,
      '$.scene.cellNodeIds',
    );
    expectRejected(
      scene((s) => (s.sceneHash = 'AAAA')),
      invalid,
      '$.scene.sceneHash',
    );
    expectRejected(
      edit((r) => (r.focus = { focusedNodeId: 'scene.root', focusableNodeIds: [] })),
      invalid,
      '$.focus.focusedNodeId',
    );
    expectRejected(
      edit((r) => {
        const chroma = mutableClone(r.chroma ?? null);
        chroma.colorSpace = 'display-p3';
        r.chroma = chroma;
      }),
      invalid,
      '$.chroma.colorSpace',
    );
  });

  it('rejects sparse arrays instead of accepting a missing element', () => {
    // A hole cannot come from JSON text, but a caller can hand one in directly.
    const holedBytes = edit((r) => {
      const source = r.bytes as readonly number[];
      const bytes = new Array<number>(source.length);
      source.forEach((value, index) => {
        if (index !== 3) {
          bytes[index] = value;
        }
      });
      r.bytes = bytes;
    });
    expectRejected(holedBytes, invalid, '$.bytes[3]');

    const holedSideTable = edit((r) => {
      const sideTable = new Array<string>(2);
      sideTable[0] = 'e\u0301';
      r.sideTable = sideTable;
    });
    expectRejected(holedSideTable, invalid, '$.sideTable[1]');

    const holedOwners = edit((r) => {
      const scene = mutableClone(r.scene ?? null);
      const owners = new Array<string>(4);
      owners[0] = 'scene.root';
      owners[1] = 'scene.root';
      owners[3] = 'scene.root';
      scene.cellNodeIds = owners;
      r.scene = scene;
    });
    expectRejected(holedOwners, invalid, '$.scene.cellNodeIds[2]');
  });

  it('rejects non-object input', () => {
    expectRejected([], invalid, '$');
    expectRejected(null, invalid, '$');
  });
});
