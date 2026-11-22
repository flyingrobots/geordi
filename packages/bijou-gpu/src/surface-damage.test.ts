import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  accumulateSurfaceDamage,
  BijouGpuValidationError,
  CELL_STRIDE,
  createGlyphSlotMap,
  createSurfaceDamageState,
  FLAG_BG_SET,
  FLAG_BOLD,
  FLAG_DASHED,
  FLAG_DIM,
  FLAG_EMPTY,
  FLAG_FG_SET,
  FLAG_INVERSE,
  FLAG_STRIKETHROUGH,
  packSurfaceDamage,
  prepareReferenceCells,
  preparedBufferBytes,
  referenceSurfaceFromPackedSurface,
  resolveSlotFromSlotMap,
  sha256Hex,
  SIDE_TABLE_THRESHOLD,
  TEST_GLYPH_COLOR_HEART,
  UNDERLINE_CURLY,
  UNDERLINE_DOTDASH,
  UNDERLINE_SOLID,
  type DirtyRowSpan,
  type GlyphSlotMap,
  type GlyphSlotRef,
  type GpuPackedSurface,
  type PackedBijouCellsReceipt,
  type ResolveGlyphSlot,
  type SurfaceDamageResult,
  type SurfaceDamageState,
} from './index.js';
import { arr, int, obj, readFixtureJson, renderSuite, suiteFrame } from '../test/support.js';

type Rgb = readonly [number, number, number];

interface CellSpec {
  /** One grapheme. Longer strings and code units from `U+F000` go through the side table. */
  readonly glyph?: string;
  /** A raw cell code, for cases a grapheme cannot express (live `CHAR_EMPTY`, a bad index). */
  readonly code?: number;
  readonly fg?: Rgb;
  readonly bg?: Rgb;
  readonly flags?: number;
  readonly opacity?: number;
}

/** Bijou's live empty cell (`EMPTY_PACKED` in `core/render/differ-cell.ts`). */
const LIVE_EMPTY = [0x20, 0, 0, 0, 0, 0, 0, 0, FLAG_EMPTY, 63] as const;
/** The canonical empty cell of the checked-in receipts: `FLAG_EMPTY` at opacity 0. */
const RECEIPT_EMPTY = [0x20, 0, 0, 0, 0, 0, 0, 0, FLAG_EMPTY, 0] as const;

/**
 * A model of how Bijou drives a live `PackedSurface`: clearing resets every
 * cell and every render-dirty bit, and painting a cell sets its bit.
 */
class LiveSurface implements GpuPackedSurface {
  public readonly buffer: Uint8Array;
  public readonly renderDirtyWords: Uint32Array;
  public sideTable: string[] = [];

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    this.buffer = new Uint8Array(width * height * CELL_STRIDE);
    this.renderDirtyWords = new Uint32Array(Math.ceil((width * height) / 32));
    this.clear();
  }

  clear(): void {
    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      this.buffer.set(LIVE_EMPTY, cell * CELL_STRIDE);
    }
    this.renderDirtyWords.fill(0);
    this.sideTable = [];
  }

  paint(col: number, row: number, spec: CellSpec): this {
    const cell = row * this.width + col;
    const fg = spec.fg ?? [0, 0, 0];
    const bg = spec.bg ?? [0, 0, 0];
    const alpha =
      (spec.opacity ?? 63) |
      (spec.fg === undefined ? 0 : FLAG_FG_SET) |
      (spec.bg === undefined ? 0 : FLAG_BG_SET);
    const code = spec.code ?? this.codeFor(spec.glyph ?? ' ');
    this.buffer.set(
      [code & 0xff, code >>> 8, ...fg, ...bg, spec.flags ?? 0, alpha],
      cell * CELL_STRIDE,
    );
    this.markDirty(cell);
    return this;
  }

  markDirty(cell: number): void {
    const word = cell >>> 5;
    this.renderDirtyWords[word] = ((this.renderDirtyWords[word] ?? 0) | (1 << (cell & 31))) >>> 0;
  }

  isDirty(cell: number): boolean {
    return (((this.renderDirtyWords[cell >>> 5] ?? 0) >>> (cell & 31)) & 1) === 1;
  }

  private codeFor(glyph: string): number {
    if (glyph.length === 1 && glyph.charCodeAt(0) < SIDE_TABLE_THRESHOLD) {
      return glyph.charCodeAt(0);
    }
    let index = this.sideTable.indexOf(glyph);
    if (index < 0) {
      index = this.sideTable.push(glyph) - 1;
    }
    return SIDE_TABLE_THRESHOLD + index;
  }
}

/** A live surface carrying a checked-in receipt, with a bit on every non-empty cell. */
function liveFromReceipt(receipt: PackedBijouCellsReceipt): LiveSurface {
  const surface = new LiveSurface(receipt.widthCells, receipt.heightCells);
  surface.buffer.set(receipt.bytes);
  surface.sideTable = [...receipt.sideTable];
  for (let cell = 0; cell < receipt.widthCells * receipt.heightCells; cell += 1) {
    const bytes = receipt.bytes.slice(cell * CELL_STRIDE, (cell + 1) * CELL_STRIDE);
    if (bytes.some((byte, index) => byte !== RECEIPT_EMPTY[index])) {
      surface.markDirty(cell);
    }
  }
  return surface;
}

function hex32(word: number | undefined): string {
  return `0x${(word ?? 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function cellWords(words: Uint32Array, cell: number): string[] {
  return [0, 1, 2, 3].map((lane) => hex32(words[cell * 4 + lane]));
}

/** The brute-force full-grid packer: the kit's whole-grid reference lowering. */
function bruteForce(surface: GpuPackedSurface, slotMap: GlyphSlotMap): Uint32Array {
  return prepareReferenceCells(referenceSurfaceFromPackedSurface(surface), slotMap);
}

function firstWordMismatch(actual: Uint32Array, expected: Uint32Array): string | null {
  if (actual.length !== expected.length) {
    return `length ${String(actual.length)} != ${String(expected.length)}`;
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return `word ${String(index)} (cell ${String(index >>> 2)}): ${hex32(actual[index])} != ${hex32(expected[index])}`;
    }
  }
  return null;
}

/** Maximal runs of rows whose words differ between two same-sized buffers. */
function changedRowSpans(
  before: Uint32Array,
  after: Uint32Array,
  width: number,
  height: number,
): DirtyRowSpan[] {
  const spans: DirtyRowSpan[] = [];
  for (let row = 0; row < height; row += 1) {
    let changed = false;
    for (let index = row * width * 4; index < (row + 1) * width * 4; index += 1) {
      if (before[index] !== after[index]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      continue;
    }
    const last = spans.at(-1);
    if (last?.maxRow === row - 1) {
      spans[spans.length - 1] = { minRow: last.minRow, maxRow: row };
    } else {
      spans.push({ minRow: row, maxRow: row });
    }
  }
  return spans;
}

function caught(run: () => void): BijouGpuValidationError | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof BijouGpuValidationError) {
      return error;
    }
    throw error;
  }
  return undefined;
}

const E_ACUTE = 'é';
const O_DIAERESIS = 'ö';

/** A slot for every plain glyph the hand-written cases paint. */
const SLOTS = createGlyphSlotMap(
  ['A', 'B', 'C', 'x', 'y', E_ACUTE, O_DIAERESIS, ''].flatMap((grapheme, index) => [
    { grapheme, bold: false, slot: index * 2, kind: 'mono' as const },
    { grapheme, bold: true, slot: index * 2 + 1, kind: 'mono' as const },
  ]),
);
const resolveSlot = resolveSlotFromSlotMap(SLOTS);

/** Present `target` over `current` on a fresh state, so the next pack is incremental. */
function presented(current: GpuPackedSurface, target: GpuPackedSurface): SurfaceDamageState {
  const state = createSurfaceDamageState();
  packSurfaceDamage(state, current, target, { resolveSlot });
  return state;
}

function pack(
  state: SurfaceDamageState,
  current: GpuPackedSurface,
  target: GpuPackedSurface,
): SurfaceDamageResult {
  return packSurfaceDamage(state, current, target, { resolveSlot });
}

describe('packSurfaceDamage on the checked-in width-1 fixture', () => {
  const { suite, pack: glyphPack, paintReceipt, eraseReceipt } = renderSuite();
  const fixtureResolver = resolveSlotFromSlotMap(glyphPack.slotMap);
  const allRows = [{ minRow: 0, maxRow: 6 }];

  it('packs the paint frame to the suite prepared-buffer digest on the first frame', () => {
    const paint = liveFromReceipt(paintReceipt);
    const state = createSurfaceDamageState();
    const result = packSurfaceDamage(state, new LiveSurface(8, 7), paint, {
      resolveSlot: fixtureResolver,
    });

    expect(firstWordMismatch(result.staging, bruteForce(paint, glyphPack.slotMap))).toBeNull();
    expect(sha256Hex(preparedBufferBytes(result.staging))).toBe(
      suiteFrame(suite, 'paint').preparedBufferSha256,
    );
    expect(result.staging).toHaveLength(8 * 7 * 4);
    expect(result.fullRefresh).toBe(true);
    expect(result.fullRefreshReason).toBe('first-frame');
    expect(result.dirtyRowSpans).toEqual(allRows);
    expect(result.changedCellCount).toBe(56);
  });

  it('packs the paint -> erase pair to the exact erase words although the erased cells have clear target dirty bits', () => {
    const paint = liveFromReceipt(paintReceipt);
    const erase = liveFromReceipt(eraseReceipt);
    const state = createSurfaceDamageState();
    packSurfaceDamage(state, new LiveSurface(8, 7), paint, { resolveSlot: fixtureResolver });

    // The retained cell is the only painted cell of the erase frame: every
    // erased cell is dirty in `current` alone.
    expect(Array.from(erase.renderDirtyWords)).toEqual([1, 0]);
    expect(paint.isDirty(1) && !erase.isDirty(1)).toBe(true);

    const result = packSurfaceDamage(state, paint, erase, { resolveSlot: fixtureResolver });

    expect(result.fullRefresh).toBe(false);
    expect(result.fullRefreshReason).toBeNull();
    // Retained `A` (slot 0 of the test glyph pack, fg #FF8040, bg #102030).
    expect(cellWords(result.staging, 0)).toEqual([
      '0x00010000',
      '0x004080FF',
      '0xFF302010',
      '0x00000000',
    ]);
    // Every other cell is the receipt's canonical empty cell (FLAG_EMPTY, opacity 0).
    for (let cell = 1; cell < 56; cell += 1) {
      expect(cellWords(result.staging, cell)).toEqual([
        '0x00000000',
        '0x80000000',
        '0x00000000',
        '0x00000000',
      ]);
    }
    expect(sha256Hex(preparedBufferBytes(result.staging))).toBe(
      suiteFrame(suite, 'erase').preparedBufferSha256,
    );
    // 56 cells less the retained cell and the cell that was already empty.
    expect(result.changedCellCount).toBe(54);
    expect(result.dirtyRowSpans).toEqual(allRows);

    // Presenting the erase frame again changes nothing.
    const again = packSurfaceDamage(state, erase, erase, { resolveSlot: fixtureResolver });
    expect(again.dirtyRowSpans).toEqual([]);
    expect(again.changedCellCount).toBe(0);
  });

  it('agrees word-for-word with the ABI canonical hex vectors V0 through V5', () => {
    const vectors = new LiveSurface(6, 1)
      .paint(0, 0, { glyph: ' ', flags: FLAG_EMPTY })
      .paint(1, 0, {
        glyph: 'A',
        fg: [0xff, 0x80, 0x40],
        bg: [0x10, 0x20, 0x30],
        flags: FLAG_BOLD | UNDERLINE_SOLID,
      })
      .paint(2, 0, { glyph: TEST_GLYPH_COLOR_HEART, bg: [0, 0, 0] })
      .paint(3, 0, {
        glyph: '⣿',
        fg: [0x00, 0xff, 0xaa],
        flags: FLAG_DIM | FLAG_INVERSE,
        opacity: 32,
      })
      .paint(4, 0, {
        glyph: '▀',
        fg: [0xff, 0xff, 0xff],
        bg: [0x22, 0x33, 0x44],
        flags: UNDERLINE_CURLY,
      })
      .paint(5, 0, {
        glyph: '╭',
        fg: [0xaa, 0x55, 0xcc],
        flags: FLAG_STRIKETHROUGH | UNDERLINE_DOTDASH | FLAG_DASHED,
      });
    const vectorSlots = resolveSlotFromSlotMap(
      createGlyphSlotMap([
        { grapheme: 'A', bold: true, slot: 7, kind: 'mono' },
        { grapheme: TEST_GLYPH_COLOR_HEART, bold: false, slot: 42, kind: 'color' },
      ]),
    );
    const { staging } = packSurfaceDamage(
      createSurfaceDamageState(),
      new LiveSurface(6, 1),
      vectors,
      { resolveSlot: vectorSlots },
    );

    expect(Array.from({ length: 6 }, (_unused, cell) => cellWords(staging, cell))).toEqual([
      ['0x00000000', '0x80000000', '0x3F000000', '0x00000000'],
      ['0x00010007', '0x114080FF', '0xFF302010', '0x00000000'],
      ['0x0002002A', '0x00000000', '0xBF000000', '0x00000000'],
      ['0x000300FF', '0x0AAAFF00', '0x60000000', '0x00000000'],
      ['0x00040000', '0x20FFFFFF', '0xFF443322', '0x00000000'],
      ['0x0005006D', '0x74CC55AA', '0x7F000000', '0x00000000'],
    ]);
    expect(
      Array.from(preparedBufferBytes(staging).subarray(16, 32), (byte) =>
        byte.toString(16).toUpperCase().padStart(2, '0'),
      ).join(' '),
    ).toBe('07 00 01 00 FF 80 40 11 10 20 30 FF 00 00 00 00');
  });
});

describe('packSurfaceDamage union damage and erasure', () => {
  it('erases every painted cell when an empty target follows a non-empty front buffer', () => {
    const front = new LiveSurface(5, 3)
      .paint(0, 0, { glyph: 'A' })
      .paint(4, 1, { glyph: 'B', bg: [1, 2, 3] })
      .paint(2, 2, { glyph: '█' });
    const state = presented(new LiveSurface(5, 3), front);
    const empty = new LiveSurface(5, 3);
    expect(Array.from(empty.renderDirtyWords)).toEqual([0]);

    const result = pack(state, front, empty);

    expect(firstWordMismatch(result.staging, bruteForce(empty, SLOTS))).toBeNull();
    expect(result.changedCellCount).toBe(3);
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 2 }]);
    for (const cell of [0, 9, 12]) {
      expect(cellWords(result.staging, cell)).toEqual([
        '0x00000000',
        '0x80000000',
        '0x3F000000',
        '0x00000000',
      ]);
    }
  });

  it('skips dirty cells whose bytes and side-table graphemes are both unchanged', () => {
    const front = new LiveSurface(4, 2).paint(1, 0, { glyph: 'A' }).paint(2, 1, { glyph: E_ACUTE });
    const state = presented(new LiveSurface(4, 2), front);
    const back = new LiveSurface(4, 2).paint(1, 0, { glyph: 'A' }).paint(2, 1, { glyph: E_ACUTE });
    let lookups = 0;

    const result = packSurfaceDamage(state, front, back, {
      resolveSlot: (grapheme, flags) => {
        lookups += 1;
        return resolveSlot(grapheme, flags);
      },
    });

    expect(result.dirtyRowSpans).toEqual([]);
    expect(result.changedCellCount).toBe(0);
    expect(lookups).toBe(0);
  });

  it('reports disjoint minimal row spans and leaves untouched rows out', () => {
    const front = new LiveSurface(3, 8);
    const state = presented(new LiveSurface(3, 8), front);
    const back = new LiveSurface(3, 8)
      .paint(0, 1, { glyph: 'A' })
      .paint(2, 2, { glyph: 'B' })
      .paint(1, 5, { glyph: 'C' })
      .paint(1, 7, { glyph: ' ', flags: FLAG_EMPTY });

    const result = pack(state, front, back);

    // Row 7 was painted with the cell it already held, so it is not damage.
    expect(result.dirtyRowSpans).toEqual([
      { minRow: 1, maxRow: 2 },
      { minRow: 5, maxRow: 5 },
    ]);
    expect(result.changedCellCount).toBe(3);
  });

  it('does not report a row whose repainted cells lower to the words already staged', () => {
    // Live CHAR_EMPTY and ASCII space differ as bytes but are the same prepared record.
    const front = new LiveSurface(2, 2).paint(0, 0, { code: 0 });
    const state = presented(new LiveSurface(2, 2), front);
    const back = new LiveSurface(2, 2).paint(0, 0, { glyph: ' ' });

    expect(pack(state, front, back).dirtyRowSpans).toEqual([]);
  });

  it('ignores dirty bits past the last cell of a grid whose cell count is not a multiple of 32', () => {
    // 17 x 13 = 221 cells: the last word holds 29 real bits and 3 that address no cell.
    const front = new LiveSurface(17, 13);
    const state = presented(new LiveSurface(17, 13), front);
    const back = new LiveSurface(17, 13).paint(16, 12, { glyph: 'A' }).paint(0, 0, { glyph: 'B' });
    back.renderDirtyWords.fill(0xffffffff);
    front.renderDirtyWords.fill(0xffffffff);

    const result = pack(state, front, back);

    expect(firstWordMismatch(result.staging, bruteForce(back, SLOTS))).toBeNull();
    expect(result.staging).toHaveLength(221 * 4);
    expect(result.changedCellCount).toBe(2);
    expect(result.dirtyRowSpans).toEqual([
      { minRow: 0, maxRow: 0 },
      { minRow: 12, maxRow: 12 },
    ]);

    // Stray bits that arrive through a coalesced frame bypass the comparison
    // shortcut, so they must be masked rather than merely compare equal.
    accumulateSurfaceDamage(state, front, back);
    const next = new LiveSurface(17, 13).paint(16, 12, { glyph: 'A' }).paint(0, 0, { glyph: 'B' });
    next.renderDirtyWords.fill(0xffffffff);
    const coalesced = pack(state, back, next);
    expect(coalesced.dirtyRowSpans).toEqual([]);
    expect(coalesced.changedCellCount).toBe(0);
  });
});

describe('packSurfaceDamage semantic side-table comparison', () => {
  it('detects a changed side-table grapheme behind identical side-table index bytes', () => {
    const front = new LiveSurface(3, 2).paint(1, 1, { glyph: E_ACUTE, fg: [9, 9, 9] });
    const state = presented(new LiveSurface(3, 2), front);
    const back = new LiveSurface(3, 2).paint(1, 1, { glyph: O_DIAERESIS, fg: [9, 9, 9] });

    // Same ten bytes, same index 0, different string behind it.
    expect(Array.from(back.buffer)).toEqual(Array.from(front.buffer));
    expect([front.sideTable, back.sideTable]).toEqual([[E_ACUTE], [O_DIAERESIS]]);

    const result = pack(state, front, back);

    expect(result.changedCellCount).toBe(1);
    expect(result.dirtyRowSpans).toEqual([{ minRow: 1, maxRow: 1 }]);
    expect(firstWordMismatch(result.staging, bruteForce(back, SLOTS))).toBeNull();
    expect(result.staging[4 * 4]).toBe((1 << 16) | (SLOTS.lookup(O_DIAERESIS, false)?.slot ?? -1));
  });

  it('treats a moved side-table index that names the same grapheme as a change of bytes only', () => {
    const front = new LiveSurface(2, 1).paint(0, 0, { glyph: E_ACUTE }).paint(1, 0, { glyph: O_DIAERESIS });
    const state = presented(new LiveSurface(2, 1), front);
    // The same two graphemes, registered in the other order.
    const back = new LiveSurface(2, 1);
    back.sideTable = [O_DIAERESIS, E_ACUTE];
    back.paint(0, 0, { glyph: E_ACUTE }).paint(1, 0, { glyph: O_DIAERESIS });
    expect(Array.from(back.buffer)).not.toEqual(Array.from(front.buffer));

    const result = pack(state, front, back);

    // The prepared record names an atlas slot, not an index, so nothing is re-uploaded.
    expect(result.dirtyRowSpans).toEqual([]);
    expect(firstWordMismatch(result.staging, bruteForce(back, SLOTS))).toBeNull();
  });
});

describe('packSurfaceDamage full invalidation and the retained staging buffer', () => {
  /** A resolver whose slots depend on a mutable atlas generation. */
  function generationalAtlas(): { generation: number; resolve: ResolveGlyphSlot; lookups: number } {
    const atlas = {
      generation: 1,
      lookups: 0,
      resolve: (grapheme: string): GlyphSlotRef => {
        atlas.lookups += 1;
        return { slot: atlas.generation * 100 + grapheme.charCodeAt(0), kind: 'mono' };
      },
    };
    return atlas;
  }

  it('rebuilds the whole grid when forceFullRefresh follows an atlas generation increment', () => {
    const atlas = generationalAtlas();
    const front = new LiveSurface(4, 3).paint(0, 0, { glyph: 'A' }).paint(3, 2, { glyph: 'B' });
    const state = createSurfaceDamageState();
    packSurfaceDamage(state, new LiveSurface(4, 3), front, { resolveSlot: atlas.resolve });
    expect(state.staging[0]).toBe((1 << 16) | (100 + 0x41));

    atlas.generation = 2;
    // The app repainted the same frame: no cell differs, so no incremental damage exists.
    const back = new LiveSurface(4, 3).paint(0, 0, { glyph: 'A' }).paint(3, 2, { glyph: 'B' });
    const result = packSurfaceDamage(state, front, back, {
      resolveSlot: atlas.resolve,
      forceFullRefresh: true,
    });

    expect(result.fullRefresh).toBe(true);
    expect(result.fullRefreshReason).toBe('forced');
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 2 }]);
    expect(result.changedCellCount).toBe(12);
    expect(result.staging[0]).toBe((1 << 16) | (200 + 0x41));
    expect(result.staging[11 * 4]).toBe((1 << 16) | (200 + 0x42));
  });

  it('forces the full refresh itself when the injected atlas generation has advanced', () => {
    const atlas = generationalAtlas();
    const options = { resolveSlot: atlas.resolve, atlasGeneration: () => atlas.generation };
    const front = new LiveSurface(2, 2).paint(0, 0, { glyph: 'A' });
    const state = createSurfaceDamageState();
    packSurfaceDamage(state, new LiveSurface(2, 2), front, options);
    const steady = packSurfaceDamage(state, front, front, options);
    expect(steady.fullRefresh).toBe(false);

    atlas.generation = 5;
    const result = packSurfaceDamage(state, front, front, options);

    expect(result.fullRefreshReason).toBe('atlas-generation');
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 1 }]);
    expect(result.staging[0]).toBe((1 << 16) | (500 + 0x41));
  });

  it('repacks the whole grid when the atlas generation advances during a pack, and refuses a frame that never settles', () => {
    const atlas = generationalAtlas();
    const front = new LiveSurface(3, 1).paint(0, 0, { glyph: 'A' });
    const state = createSurfaceDamageState();
    const steadyOptions = { resolveSlot: atlas.resolve, atlasGeneration: () => atlas.generation };
    packSurfaceDamage(state, new LiveSurface(3, 1), front, steadyOptions);

    // Resolving `C` overflows the atlas once: it resets and re-slots every glyph.
    let overflowed = false;
    const back = new LiveSurface(3, 1).paint(0, 0, { glyph: 'A' }).paint(2, 0, { glyph: 'C' });
    const result = packSurfaceDamage(state, front, back, {
      atlasGeneration: () => atlas.generation,
      resolveSlot: (grapheme, flags) => {
        if (grapheme === 'C' && !overflowed) {
          overflowed = true;
          atlas.generation += 1;
        }
        return atlas.resolve(grapheme, flags);
      },
    });

    expect(result.fullRefreshReason).toBe('atlas-generation');
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 0 }]);
    // `A` was unchanged between the surfaces, but its slot moved with the reset.
    expect(result.staging[0]).toBe((1 << 16) | (200 + 0x41));
    expect(result.staging[2 * 4]).toBe((1 << 16) | (200 + 0x43));

    // An atlas that resets on every lookup can never hold the frame.
    const error = caught(() =>
      packSurfaceDamage(state, back, back, {
        forceFullRefresh: true,
        atlasGeneration: () => atlas.generation,
        resolveSlot: (grapheme, flags) => {
          atlas.generation += 1;
          return atlas.resolve(grapheme, flags);
        },
      }),
    );
    expect(error?.code).toBe('GEORDI_E_BIJOU_INVALID_ATLAS');
    expect(error?.path).toBe('atlasGeneration');
  });

  it('retains a complete staging buffer that can be re-uploaded without a new frame', () => {
    const front = new LiveSurface(6, 4).paint(1, 1, { glyph: 'A' }).paint(5, 3, { glyph: 'B' });
    const state = presented(new LiveSurface(6, 4), front);
    const back = new LiveSurface(6, 4).paint(1, 1, { glyph: 'A' }).paint(0, 2, { glyph: 'C' });
    const incremental = pack(state, front, back);
    expect(incremental.dirtyRowSpans).toEqual([{ minRow: 2, maxRow: 3 }]);

    // After a partial update the retained buffer is still the whole grid, ready
    // for a context or device restoration to upload as is.
    expect(state.staging).toBe(incremental.staging);
    expect(state.staging).toHaveLength(6 * 4 * 4);
    expect([state.widthCells, state.heightCells]).toEqual([6, 4]);
    expect(firstWordMismatch(state.staging, bruteForce(back, SLOTS))).toBeNull();

    const before = Uint32Array.from(state.staging);
    const restored = packSurfaceDamage(state, back, back, { resolveSlot, forceFullRefresh: true });
    expect(restored.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 3 }]);
    expect(firstWordMismatch(restored.staging, before)).toBeNull();
  });

  it('has an empty staging buffer before the first frame and treats that frame as a full refresh', () => {
    const state = createSurfaceDamageState();
    expect(state.staging).toHaveLength(0);
    expect([state.widthCells, state.heightCells]).toEqual([0, 0]);

    // No dirty bit is set anywhere, and the grid is still uploaded whole.
    const blank = new LiveSurface(2, 3);
    const result = packSurfaceDamage(state, blank, blank, { resolveSlot });
    expect(result.fullRefreshReason).toBe('first-frame');
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 2 }]);
  });

  it('packs a grid with no cells to an empty buffer and no row spans', () => {
    for (const [width, height] of [
      [0, 0],
      [0, 4],
      [4, 0],
    ] as const) {
      const empty = new LiveSurface(width, height);
      const result = packSurfaceDamage(createSurfaceDamageState(), empty, empty, { resolveSlot });
      expect(result.staging).toHaveLength(0);
      expect(result.dirtyRowSpans).toEqual([]);
      expect(result.fullRefresh).toBe(true);
    }
  });
});

describe('packSurfaceDamage coalesced frames', () => {
  /**
   * Frame 0 is presented with `x` at (1, 1). Frame 1 erases it and paints `y`
   * at (2, 3) but is never presented. Frame 2 repaints `y` only.
   */
  function threeFrames(): { f0: LiveSurface; f1: LiveSurface; f2: LiveSurface } {
    return {
      f0: new LiveSurface(4, 5).paint(1, 1, { glyph: 'x' }),
      f1: new LiveSurface(4, 5).paint(2, 3, { glyph: 'y' }),
      f2: new LiveSurface(4, 5).paint(2, 3, { glyph: 'y' }),
    };
  }

  it('coalesces two partial updates into one present by OR-accumulating their dirty words', () => {
    const { f0, f1, f2 } = threeFrames();
    const state = presented(new LiveSurface(4, 5), f0);

    accumulateSurfaceDamage(state, f0, f1);
    const result = pack(state, f1, f2);

    expect(firstWordMismatch(result.staging, bruteForce(f2, SLOTS))).toBeNull();
    // The erased `x` is dirty in neither surface of the presented pair.
    expect(f1.isDirty(5) || f2.isDirty(5)).toBe(false);
    expect(cellWords(result.staging, 5)).toEqual([
      '0x00000000',
      '0x80000000',
      '0x3F000000',
      '0x00000000',
    ]);
    expect(result.dirtyRowSpans).toEqual([
      { minRow: 1, maxRow: 1 },
      { minRow: 3, maxRow: 3 },
    ]);
    expect(result.changedCellCount).toBe(2);
  });

  it('leaves a ghost cell when a skipped frame is not accumulated, which is why accumulation exists', () => {
    const { f0, f1, f2 } = threeFrames();
    const state = presented(new LiveSurface(4, 5), f0);

    const result = pack(state, f1, f2);

    expect(firstWordMismatch(result.staging, bruteForce(f2, SLOTS))).toMatch(/cell 5\b/u);
  });

  it('repacks a cell that changed in a skipped frame even though current and target now agree', () => {
    const f0 = new LiveSurface(3, 2).paint(0, 1, { glyph: 'x' });
    const f1 = new LiveSurface(3, 2).paint(0, 1, { glyph: 'y' });
    const f2 = new LiveSurface(3, 2).paint(0, 1, { glyph: 'y' });
    const state = presented(new LiveSurface(3, 2), f0);

    accumulateSurfaceDamage(state, f0, f1);
    const result = pack(state, f1, f2);

    expect(firstWordMismatch(result.staging, bruteForce(f2, SLOTS))).toBeNull();
    expect(result.dirtyRowSpans).toEqual([{ minRow: 1, maxRow: 1 }]);
  });

  it('accumulates across more than one skipped frame and clears the accumulator once presented', () => {
    const f0 = new LiveSurface(4, 4).paint(0, 0, { glyph: 'x' });
    const f1 = new LiveSurface(4, 4).paint(1, 1, { glyph: 'x' });
    const f2 = new LiveSurface(4, 4).paint(2, 2, { glyph: 'x' });
    const f3 = new LiveSurface(4, 4).paint(2, 2, { glyph: 'x' }).paint(3, 3, { glyph: 'x' });
    const state = presented(new LiveSurface(4, 4), f0);

    accumulateSurfaceDamage(state, f0, f1);
    accumulateSurfaceDamage(state, f1, f2);
    const result = pack(state, f2, f3);
    expect(firstWordMismatch(result.staging, bruteForce(f3, SLOTS))).toBeNull();
    // Row 1 was painted and erased again without ever being staged, so only the
    // erased row 0 and the painted rows 2 and 3 are uploaded.
    expect(result.dirtyRowSpans).toEqual([
      { minRow: 0, maxRow: 0 },
      { minRow: 2, maxRow: 3 },
    ]);
    expect(result.changedCellCount).toBe(3);

    // Nothing from the skipped frames survives into the next present: the glyph
    // at (2, 2) sits on an accumulated bit and is not lowered again.
    let lookups = 0;
    const steady = packSurfaceDamage(state, f3, f3, {
      resolveSlot: (grapheme, flags) => {
        lookups += 1;
        return resolveSlot(grapheme, flags);
      },
    });
    expect(steady.dirtyRowSpans).toEqual([]);
    expect(lookups).toBe(0);
  });

  it('accumulating before the first frame still yields a first-frame full refresh', () => {
    const state = createSurfaceDamageState();
    const f0 = new LiveSurface(2, 2).paint(0, 0, { glyph: 'x' });
    const f1 = new LiveSurface(2, 2).paint(1, 1, { glyph: 'y' });

    accumulateSurfaceDamage(state, new LiveSurface(2, 2), f0);
    const result = pack(state, f0, f1);

    expect(result.fullRefreshReason).toBe('first-frame');
    expect(firstWordMismatch(result.staging, bruteForce(f1, SLOTS))).toBeNull();
  });
});

describe('packSurfaceDamage dimension changes', () => {
  it('rebuilds and reallocates the staging buffer when the grid dimensions change', () => {
    const small = new LiveSurface(4, 4).paint(3, 3, { glyph: 'A' });
    const state = presented(new LiveSurface(4, 4), small);
    const large = new LiveSurface(7, 3).paint(6, 2, { glyph: 'B' });

    const result = pack(state, small, large);

    expect(result.fullRefreshReason).toBe('dimension-change');
    expect(result.staging).toHaveLength(7 * 3 * 4);
    expect([result.widthCells, result.heightCells]).toEqual([7, 3]);
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 2 }]);
    expect(firstWordMismatch(result.staging, bruteForce(large, SLOTS))).toBeNull();
  });

  it('treats a transposed grid with the same cell count as a dimension change', () => {
    const wide = new LiveSurface(8, 2).paint(7, 1, { glyph: 'A' });
    const state = presented(new LiveSurface(8, 2), wide);
    const tall = new LiveSurface(2, 8).paint(1, 7, { glyph: 'A' });

    const result = pack(state, new LiveSurface(2, 8), tall);

    expect(result.fullRefreshReason).toBe('dimension-change');
    expect(result.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 7 }]);
  });

  it('does not leak accumulated dirty bits across a dimension resize', () => {
    // 4 x 4 and 2 x 8 share one dirty word, so a leaked bit would address a real cell.
    const f0 = new LiveSurface(4, 4).paint(1, 1, { glyph: 'x' });
    const f1 = new LiveSurface(4, 4).paint(3, 3, { glyph: 'y' });
    const state = presented(new LiveSurface(4, 4), f0);
    accumulateSurfaceDamage(state, f0, f1);

    // Cells 5 and 15 are the two bits the 4 x 4 frames accumulated.
    const steadyFrame = (): LiveSurface =>
      new LiveSurface(2, 8).paint(1, 2, { glyph: 'A' }).paint(1, 7, { glyph: 'B' });
    const resized = steadyFrame();
    accumulateSurfaceDamage(state, new LiveSurface(2, 8), resized);
    const next = steadyFrame();
    const result = pack(state, resized, next);
    expect(result.fullRefreshReason).toBe('dimension-change');
    expect(firstWordMismatch(result.staging, bruteForce(next, SLOTS))).toBeNull();

    // A steady frame after the resize inspects no cell: no bit from the old grid remains.
    let lookups = 0;
    const steadyTarget = steadyFrame();
    steadyTarget.renderDirtyWords.fill(0);
    next.renderDirtyWords.fill(0);
    const steady = packSurfaceDamage(state, next, steadyTarget, {
      resolveSlot: (grapheme, flags) => {
        lookups += 1;
        return resolveSlot(grapheme, flags);
      },
    });
    expect(steady.fullRefresh).toBe(false);
    expect(steady.dirtyRowSpans).toEqual([]);
    expect(lookups).toBe(0);
  });

  it('forces a full refresh when a skipped frame resized the grid and a later one restored it', () => {
    const f0 = new LiveSurface(4, 4).paint(1, 1, { glyph: 'x' });
    const state = presented(new LiveSurface(4, 4), f0);

    // The grid becomes 2 x 8 for one frame that is never presented, then 4 x 4 again.
    accumulateSurfaceDamage(state, new LiveSurface(2, 8), new LiveSurface(2, 8));
    expect(state.pendingFullRefresh).toBe('dimension-change');
    const restored = new LiveSurface(4, 4).paint(3, 3, { glyph: 'y' });
    const result = pack(state, new LiveSurface(4, 4), restored);

    // Neither surface carries a bit for the `x` that is still staged.
    expect(result.fullRefreshReason).toBe('dimension-change');
    expect(firstWordMismatch(result.staging, bruteForce(restored, SLOTS))).toBeNull();
    expect(state.pendingFullRefresh).toBeNull();
  });

  it('forces a full refresh when current and target disagree on dimensions', () => {
    const front = new LiveSurface(3, 3).paint(0, 0, { glyph: 'A' });
    const state = presented(new LiveSurface(3, 3), front);

    const result = pack(state, new LiveSurface(5, 5), front);

    expect(result.fullRefreshReason).toBe('dimension-change');
  });
});

describe('packSurfaceDamage width-1 policy and refusals', () => {
  function packOne(spec: CellSpec, sideTable: string[] = []): BijouGpuValidationError | undefined {
    const target = new LiveSurface(2, 1);
    target.sideTable = sideTable;
    target.paint(1, 0, spec);
    return caught(() =>
      packSurfaceDamage(createSurfaceDamageState(), new LiveSurface(2, 1), target, {
        resolveSlot: () => ({ slot: 0, kind: 'mono' }),
      }),
    );
  }

  it('refuses a width-2 grapheme, encoded directly or through the side table', () => {
    const direct = packOne({ glyph: '漢' });
    expect(direct?.code).toBe('GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH');
    expect(direct?.path).toBe('target.cells[1]');
    expect(direct?.detail).toContain('U+6F22');

    const emoji = packOne({ glyph: '\u{1f600}' });
    expect(emoji?.code).toBe('GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH');

    // A narrow base widened by an emoji presentation selector.
    const widened = packOne({ glyph: '❤️' });
    expect(widened?.code).toBe('GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH');
  });

  it('refuses the bytes of the checked-in negative width-2 fixture', () => {
    const fixture = obj(readFixtureJson('negative-width2.packed-bijou-cells.json'), 'fixture');
    const target = new LiveSurface(int(fixture.widthCells, 'widthCells'), int(fixture.heightCells, 'heightCells'));
    target.buffer.set(arr(fixture.bytes, 'bytes').map((byte) => int(byte, 'byte')));
    target.renderDirtyWords.fill(0xffffffff);

    const error = caught(() =>
      packSurfaceDamage(createSurfaceDamageState(), target, target, { resolveSlot }),
    );

    expect(error?.code).toBe('GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH');
    expect(error?.path).toBe('target.cells[0]');
  });

  it('never asks the resolver for procedural or empty cells', () => {
    const target = new LiveSurface(7, 1)
      .paint(0, 0, { glyph: '─' })
      .paint(1, 0, { glyph: '╿' })
      .paint(2, 0, { glyph: '▀' })
      .paint(3, 0, { glyph: '▟' })
      .paint(4, 0, { glyph: '⠀' })
      .paint(5, 0, { glyph: '⣿' })
      .paint(6, 0, { glyph: 'A', flags: FLAG_EMPTY });
    const asked: string[] = [];

    const { staging } = packSurfaceDamage(createSurfaceDamageState(), new LiveSurface(7, 1), target, {
      resolveSlot: (grapheme) => {
        asked.push(grapheme);
        return undefined;
      },
    });

    expect(asked).toEqual([]);
    expect(Array.from({ length: 7 }, (_unused, cell) => hex32(staging[cell * 4]))).toEqual([
      '0x00050000',
      '0x0005007F',
      '0x00040000',
      '0x0004001F',
      '0x00030000',
      '0x000300FF',
      '0x00000000',
    ]);
  });

  it('passes the grapheme and the whole flags byte to the resolver', () => {
    const asked: (readonly [string, number])[] = [];
    const target = new LiveSurface(2, 1)
      .paint(0, 0, { glyph: 'A', flags: FLAG_BOLD | UNDERLINE_SOLID })
      .paint(1, 0, { glyph: E_ACUTE, flags: FLAG_DIM });

    packSurfaceDamage(createSurfaceDamageState(), new LiveSurface(2, 1), target, {
      resolveSlot: (grapheme, flags) => {
        asked.push([grapheme, flags]);
        return { slot: 3, kind: 'mono' };
      },
    });

    expect(asked).toEqual([
      ['A', FLAG_BOLD | UNDERLINE_SOLID],
      [E_ACUTE, FLAG_DIM],
    ]);
  });

  it('refuses a glyph the resolver has no slot for, a slot outside 0..65535, and a missing side-table entry', () => {
    const missing = caught(() =>
      packSurfaceDamage(
        createSurfaceDamageState(),
        new LiveSurface(1, 1),
        new LiveSurface(1, 1).paint(0, 0, { glyph: 'Z', flags: FLAG_BOLD }),
        { resolveSlot },
      ),
    );
    expect(missing?.code).toBe('GEORDI_E_BIJOU_MISSING_GLYPH_SLOT');
    expect(missing?.detail).toBe('no atlas slot for bold grapheme U+005A');

    for (const slot of [-1, 0x10000, 1.5, Number.NaN]) {
      const error = caught(() =>
        packSurfaceDamage(
          createSurfaceDamageState(),
          new LiveSurface(1, 1),
          new LiveSurface(1, 1).paint(0, 0, { glyph: 'A' }),
          { resolveSlot: () => ({ slot, kind: 'mono' }) },
        ),
      );
      expect(error?.code).toBe('GEORDI_E_BIJOU_INVALID_ATLAS');
    }

    const dangling = packOne({ code: SIDE_TABLE_THRESHOLD + 3 }, ['á']);
    expect(dangling?.code).toBe('GEORDI_E_BIJOU_INVALID_SURFACE');
    expect(dangling?.detail).toBe('side-table index 3 does not exist');
  });

  it('refuses surfaces whose buffer or dirty words do not cover the grid', () => {
    const good = new LiveSurface(4, 4);
    const shortBuffer: GpuPackedSurface = { ...surfaceFields(good), buffer: new Uint8Array(159) };
    const shortDirty: GpuPackedSurface = { ...surfaceFields(good), renderDirtyWords: new Uint32Array(0) };
    const fractional: GpuPackedSurface = { ...surfaceFields(good), width: 1.5 };

    for (const bad of [shortBuffer, shortDirty, fractional]) {
      const error = caught(() =>
        packSurfaceDamage(createSurfaceDamageState(), good, bad, { resolveSlot }),
      );
      expect(error?.code).toBe('GEORDI_E_BIJOU_INVALID_SURFACE');
    }

    // `current` is read on an incremental pack, so it is checked there too.
    const state = presented(good, good);
    const error = caught(() => packSurfaceDamage(state, shortDirty, good, { resolveSlot }));
    expect(error?.code).toBe('GEORDI_E_BIJOU_INVALID_SURFACE');
    expect(error?.path).toBe('current.renderDirtyWords');
    expect(
      caught(() => {
        accumulateSurfaceDamage(state, good, shortDirty);
      })?.path,
    ).toBe('target.renderDirtyWords');
  });

  it('recovers from a refused frame with a full refresh of the next one', () => {
    const front = new LiveSurface(3, 3).paint(0, 0, { glyph: 'A' });
    const state = presented(new LiveSurface(3, 3), front);
    const bad = new LiveSurface(3, 3).paint(1, 1, { glyph: 'B' }).paint(2, 2, { glyph: '漢' });

    expect(caught(() => pack(state, front, bad))?.code).toBe(
      'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
    );

    // The refused frame half-wrote the buffer. The next frame carries no dirty
    // bit for those cells, and is rebuilt whole all the same.
    const good = new LiveSurface(3, 3).paint(0, 0, { glyph: 'A' });
    const result = pack(state, new LiveSurface(3, 3), good);
    expect(result.fullRefreshReason).toBe('recovery');
    expect(firstWordMismatch(result.staging, bruteForce(good, SLOTS))).toBeNull();
  });
});

function surfaceFields(surface: GpuPackedSurface): GpuPackedSurface {
  return {
    width: surface.width,
    height: surface.height,
    buffer: surface.buffer,
    sideTable: surface.sideTable,
    renderDirtyWords: surface.renderDirtyWords,
  };
}

describe('packSurfaceDamage module purity', () => {
  it('names no browser global and imports only sibling kit modules', () => {
    const source = readFileSync(fileURLToPath(new URL('./surface-damage.ts', import.meta.url)), 'utf8');

    expect(source).not.toMatch(
      /\b(?:window|document|OffscreenCanvas|navigator|globalThis|self|requestAnimationFrame|HTMLCanvasElement|WebGL2RenderingContext|GPUDevice)\b/u,
    );
    const imports = Array.from(source.matchAll(/from '([^']+)'/gu), (match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((specifier) => /^\.\/[a-z-]+\.js$/u.test(specifier))).toBe(true);
  });
});

/** mulberry32: a small deterministic PRNG, so every fuzz failure reproduces. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('packSurfaceDamage fuzz against the brute-force full-grid packer', () => {
  const GLYPHS = [
    'A',
    'B',
    'z',
    '#',
    ' ',
    'é',
    '─',
    '╭',
    '╳',
    '▀',
    '▒',
    '▟',
    '⠀',
    '⣿',
    '♥',
    E_ACUTE,
    O_DIAERESIS,
    'ñ',
    '',
    '',
  ] as const;
  // Prime dimensions, single rows either side of the 32-cell word boundary, and one cell.
  const DIMENSIONS = [
    [17, 13],
    [81, 25],
    [13, 17],
    [7, 5],
    [31, 1],
    [32, 1],
    [33, 1],
    [1, 37],
    [1, 1],
  ] as const;

  it('produces staging bytes identical to the brute-force packer over 1,000 randomized paint/erase/resize frame pairs', () => {
    const random = mulberry32(0x171);
    const below = (bound: number): number => Math.floor(random() * bound);
    const pick = <T>(items: readonly T[]): T => items[below(items.length)];

    const atlas = { generation: 1 };
    const slotFor = (grapheme: string, bold: boolean): GlyphSlotRef => {
      let hash = atlas.generation * 0x9e37 + (bold ? 0x8000 : 0);
      for (const character of grapheme) {
        hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0;
      }
      return { slot: hash & 0xffff, kind: grapheme === '♥' ? 'color' : 'mono' };
    };
    const oracleSlots: GlyphSlotMap = { entries: [], lookup: slotFor };
    const options = {
      resolveSlot: (grapheme: string, flags: number) => slotFor(grapheme, (flags & FLAG_BOLD) !== 0),
      atlasGeneration: () => atlas.generation,
    };

    const randomSpec = (): CellSpec => ({
      ...(random() < 0.04 ? { code: 0 } : { glyph: pick(GLYPHS) }),
      ...(random() < 0.5 ? { fg: [below(256), below(256), below(256)] as const } : {}),
      ...(random() < 0.5 ? { bg: [below(256), below(256), below(256)] as const } : {}),
      flags: random() < 0.6 ? 0 : below(256) & ~(random() < 0.9 ? FLAG_EMPTY : 0),
      opacity: random() < 0.7 ? 63 : below(64),
    });

    let width: number = DIMENSIONS[0][0];
    let height: number = DIMENSIONS[0][1];
    let front = new LiveSurface(width, height);
    let back = new LiveSurface(width, height);
    const state = createSurfaceDamageState();
    const seen = { packs: 0, coalesced: 0, resizes: 0, incremental: 0, erasures: 0, forced: 0, resets: 0 };

    for (let frame = 0; frame < 1000; frame += 1) {
      if (random() < 0.06) {
        const [nextWidth, nextHeight] = pick(DIMENSIONS);
        const bothBuffers = random() < 0.5;
        // Picking the current size again is not a resize: replacing the front
        // buffer then would hand the packer a `current` it never presented.
        if (nextWidth !== width || nextHeight !== height) {
          [width, height] = [nextWidth, nextHeight];
          back = new LiveSurface(width, height);
          // The runtime reallocates both buffers on some resizes and one on others.
          if (bothBuffers) {
            front = new LiveSurface(width, height);
          }
          seen.resizes += 1;
        }
      }
      back.clear();
      // Seed the side table in a random order, so an index names different graphemes per frame.
      back.sideTable = [E_ACUTE, O_DIAERESIS, 'ñ', '', '']
        .map((glyph) => ({ glyph, key: random() }))
        .sort((a, b) => a.key - b.key)
        .map((entry) => entry.glyph)
        .slice(0, below(6));

      const cellCount = width * height;
      const sameShape = front.width === width && front.height === height;
      // Repaint most of what the front buffer holds, so erasures are a minority.
      const keep = random();
      if (sameShape) {
        for (let cell = 0; cell < cellCount; cell += 1) {
          if (front.isDirty(cell) && random() < keep) {
            const code = (front.buffer[cell * CELL_STRIDE] ?? 0) | ((front.buffer[cell * CELL_STRIDE + 1] ?? 0) << 8);
            const glyph =
              code >= SIDE_TABLE_THRESHOLD ? front.sideTable[code - SIDE_TABLE_THRESHOLD] : undefined;
            const col = cell % width;
            const row = Math.floor(cell / width);
            back.paint(col, row, glyph === undefined ? { code } : { glyph });
            // Copy the style bytes verbatim so the cell is semantically unchanged.
            back.buffer.set(
              front.buffer.subarray(cell * CELL_STRIDE + 2, (cell + 1) * CELL_STRIDE),
              cell * CELL_STRIDE + 2,
            );
          } else if (front.isDirty(cell)) {
            seen.erasures += 1;
          }
        }
      }
      const paints = below(Math.max(2, Math.ceil(cellCount / 6)));
      for (let n = 0; n < paints; n += 1) {
        back.paint(below(width), below(height), randomSpec());
      }

      if (random() < 0.04) {
        atlas.generation += 1;
        seen.resets += 1;
      }

      if (random() < 0.25) {
        accumulateSurfaceDamage(state, front, back);
        seen.coalesced += 1;
      } else {
        const force = random() < 0.04;
        const before =
          state.widthCells === width && state.heightCells === height
            ? Uint32Array.from(state.staging)
            : null;
        const result = packSurfaceDamage(state, front, back, { ...options, forceFullRefresh: force });
        const label = `frame ${String(frame)} (${String(width)}x${String(height)})`;

        expect(firstWordMismatch(result.staging, bruteForce(back, oracleSlots)), label).toBeNull();
        expect(
          Array.from(preparedBufferBytes(result.staging)),
          label,
        ).toEqual(Array.from(preparedBufferBytes(bruteForce(back, oracleSlots))));
        if (result.fullRefresh) {
          expect(result.dirtyRowSpans, label).toEqual(
            cellCount === 0 ? [] : [{ minRow: 0, maxRow: height - 1 }],
          );
        } else {
          expect(before, label).not.toBeNull();
          expect(result.dirtyRowSpans, label).toEqual(
            changedRowSpans(before ?? new Uint32Array(0), result.staging, width, height),
          );
          seen.incremental += 1;
        }
        seen.packs += 1;
        seen.forced += force ? 1 : 0;
      }

      [front, back] = [back, front];
      if (back.width !== width || back.height !== height) {
        back = new LiveSurface(width, height);
      }
    }

    // The run must have exercised every behaviour it claims to cover.
    expect(seen.packs).toBeGreaterThan(600);
    expect(seen.incremental).toBeGreaterThan(400);
    expect(seen.coalesced).toBeGreaterThan(150);
    expect(seen.resizes).toBeGreaterThan(20);
    expect(seen.erasures).toBeGreaterThan(1000);
    expect(seen.forced).toBeGreaterThan(5);
    expect(seen.resets).toBeGreaterThan(10);
  });
});
