import { describe, expect, it } from 'vitest';

import {
  assertPixelProbes,
  BijouGpuValidationError,
  createGlyphSlotMap,
  createTestGlyphPack,
  FLAG_BG_SET,
  FLAG_BOLD,
  FLAG_DASHED,
  FLAG_DIM,
  FLAG_EMPTY,
  FLAG_FG_SET,
  FLAG_INVERSE,
  FLAG_STRIKETHROUGH,
  PixelProbeMismatchError,
  preparedBufferBytes,
  prepareReferenceCells,
  readPixel,
  referenceSurfaceFromPackedSurface,
  renderReferenceRgba,
  samplePixelProbes,
  sha256Hex,
  SIDE_TABLE_THRESHOLD,
  TEST_GLYPH_COLOR_HEART,
  TEST_GLYPH_DECOMPOSED_E_ACUTE,
  TEST_GLYPH_PRIVATE_USE,
  UNDERLINE_CURLY,
  UNDERLINE_DOTDASH,
  UNDERLINE_SOLID,
  type AtlasBitmap,
  type ReferenceSurface,
} from './index.js';
import {
  cellMask,
  cellPixel,
  loadProceduralTable,
  nodeSha256,
  renderSuite,
  suiteFrame,
} from '../test/support.js';

type Rgb = readonly [number, number, number];

const DEFAULT_FG: Rgb = [230, 237, 243];
const DEFAULT_BG: Rgb = [13, 17, 23];
const WARM: Rgb = [255, 128, 64];
const NAVY: Rgb = [16, 32, 48];

const rendered = renderSuite();
const { suite, paint, erase, pack, table } = rendered;
const at = (cellId: string, lx: number, ly: number): Rgb => cellPixel(suite, paint, cellId, lx, ly);

interface CellSpec {
  readonly code: number;
  readonly fg?: Rgb;
  readonly bg?: Rgb;
  readonly flags?: number;
  readonly opacity?: number;
}

function packCell(spec: CellSpec): number[] {
  const fg = spec.fg ?? [0, 0, 0];
  const bg = spec.bg ?? [0, 0, 0];
  const alpha =
    (spec.opacity ?? 63) |
    (spec.fg === undefined ? 0 : FLAG_FG_SET) |
    (spec.bg === undefined ? 0 : FLAG_BG_SET);
  return [spec.code & 0xff, spec.code >>> 8, ...fg, ...bg, spec.flags ?? 0, alpha];
}

function surfaceOf(
  widthCells: number,
  cells: readonly CellSpec[],
  sideTable: readonly string[] = [],
): ReferenceSurface {
  return {
    widthCells,
    heightCells: cells.length / widthCells,
    bytes: cells.flatMap(packCell),
    sideTable,
  };
}

/** An atlas with no glyphs, for procedural-only surfaces at any cell size. */
function blankAtlas(cellPxW: number, cellPxH: number): AtlasBitmap {
  return { cellPxW, cellPxH, atlasCols: 1, atlasRows: 1, rgba: new Uint8Array(cellPxW * cellPxH * 4) };
}

const NO_SLOTS = createGlyphSlotMap([]);

function hex32(word: number | undefined): string {
  return `0x${(word ?? 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

describe('reference lowering to the prepared rgba32uint cell record', () => {
  const slotMap = createGlyphSlotMap([
    { grapheme: 'A', bold: true, slot: 7, kind: 'mono' },
    { grapheme: TEST_GLYPH_COLOR_HEART, bold: false, slot: 42, kind: 'color' },
  ]);
  const vectors = surfaceOf(6, [
    { code: 0x20, flags: FLAG_EMPTY },
    { code: 0x41, fg: [0xff, 0x80, 0x40], bg: [0x10, 0x20, 0x30], flags: FLAG_BOLD | UNDERLINE_SOLID },
    { code: 0x2665, bg: [0, 0, 0] },
    { code: 0x28ff, fg: [0x00, 0xff, 0xaa], flags: FLAG_DIM | FLAG_INVERSE, opacity: 32 },
    { code: 0x2580, fg: [0xff, 0xff, 0xff], bg: [0x22, 0x33, 0x44], flags: UNDERLINE_CURLY },
    {
      code: 0x256d,
      fg: [0xaa, 0x55, 0xcc],
      flags: FLAG_STRIKETHROUGH | UNDERLINE_DOTDASH | FLAG_DASHED,
    },
  ]);

  it('agrees byte-for-byte with the ABI canonical hex vectors V0 through V5', () => {
    const words = prepareReferenceCells(vectors, slotMap);
    const rows = Array.from({ length: 6 }, (_unused, cell) =>
      [0, 1, 2, 3].map((lane) => hex32(words[cell * 4 + lane])),
    );
    expect(rows).toEqual([
      ['0x00000000', '0x80000000', '0x3F000000', '0x00000000'],
      ['0x00010007', '0x114080FF', '0xFF302010', '0x00000000'],
      ['0x0002002A', '0x00000000', '0xBF000000', '0x00000000'],
      ['0x000300FF', '0x0AAAFF00', '0x60000000', '0x00000000'],
      ['0x00040000', '0x20FFFFFF', '0xFF443322', '0x00000000'],
      ['0x0005006D', '0x74CC55AA', '0x7F000000', '0x00000000'],
    ]);
  });

  it('serialises V1 to the canonical little-endian 16 bytes', () => {
    const bytes = preparedBufferBytes(prepareReferenceCells(vectors, slotMap)).subarray(16, 32);
    expect(Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')).toBe(
      '07 00 01 00 FF 80 40 11 10 20 30 FF 00 00 00 00',
    );
  });

  it('lowers live CHAR_EMPTY, FLAG_EMPTY, and ASCII space to the empty glyph kind', () => {
    const words = prepareReferenceCells(
      surfaceOf(3, [{ code: 0 }, { code: 0x41, flags: FLAG_EMPTY }, { code: 0x20 }]),
      NO_SLOTS,
    );
    expect([words[0], words[4], words[8]]).toEqual([0, 0, 0]);
  });

  it('refuses a glyph with no declared atlas slot instead of falling back to a host font', () => {
    expect(() => prepareReferenceCells(surfaceOf(1, [{ code: 0x42 }]), NO_SLOTS)).toThrow(
      /GEORDI_E_BIJOU_MISSING_GLYPH_SLOT/u,
    );
    // Bold is part of the atlas key: a regular-only slot does not satisfy a bold cell.
    const regularOnly = createGlyphSlotMap([{ grapheme: 'A', bold: false, slot: 0, kind: 'mono' }]);
    expect(() =>
      prepareReferenceCells(surfaceOf(1, [{ code: 0x41, flags: FLAG_BOLD }]), regularOnly),
    ).toThrow(/no atlas slot for bold grapheme U\+0041/u);
  });
});

describe('renderReferenceRgba golden frames', () => {
  it('reproduces the suite golden digests for the paint and erase frames', () => {
    const paintGolden = suiteFrame(suite, 'paint');
    const eraseGolden = suiteFrame(suite, 'erase');
    expect(paint.preparedBufferSha256).toBe(paintGolden.preparedBufferSha256);
    expect(paint.frameRgbaSha256).toBe(paintGolden.frameRgbaSha256);
    expect(erase.preparedBufferSha256).toBe(eraseGolden.preparedBufferSha256);
    expect(erase.frameRgbaSha256).toBe(eraseGolden.frameRgbaSha256);
    expect(paint.frameRgbaSha256).not.toBe(erase.frameRgbaSha256);
  });

  it('emits a tight top-left row-major opaque RGBA8 buffer with a lowercase 64-hex SHA-256', () => {
    for (const frame of [paint, erase]) {
      expect(frame.canvasPxW).toBe(suite.canvasPxW);
      expect(frame.canvasPxH).toBe(suite.canvasPxH);
      expect(frame.rgba).toBeInstanceOf(Uint8Array);
      expect(frame.rgba).toHaveLength(frame.canvasPxW * frame.canvasPxH * 4);
      expect(frame.frameRgbaSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(frame.frameRgbaSha256).toBe(nodeSha256(frame.rgba));
      expect(frame.preparedBufferSha256).toBe(nodeSha256(preparedBufferBytes(frame.preparedCells)));
      for (let offset = 3; offset < frame.rgba.length; offset += 4) {
        if (frame.rgba[offset] !== 255) {
          expect.fail(`alpha at byte ${String(offset)} is not 255`);
        }
      }
    }
    // offset = (py * canvasPxW + px) * 4: the first glyph pixel of cell (0, 0).
    const offset = (3 * paint.canvasPxW + 3) * 4;
    expect(Array.from(paint.rgba.subarray(offset, offset + 4))).toEqual([...WARM, 255]);
  });

  it('fills the letterboxed remainder outside the grid with solid uDefaultBg', () => {
    const gridPxW = paint.widthCells * paint.cellPxW;
    const gridPxH = paint.heightCells * paint.cellPxH;
    expect(paint.canvasPxW).toBeGreaterThan(gridPxW);
    expect(paint.canvasPxH).toBeGreaterThan(gridPxH);
    for (let py = 0; py < paint.canvasPxH; py += 1) {
      for (let px = 0; px < paint.canvasPxW; px += 1) {
        if (px >= gridPxW || py >= gridPxH) {
          expect(readPixel(paint, px, py), `(${String(px)}, ${String(py)})`).toEqual([...DEFAULT_BG, 255]);
        }
      }
    }
  });
});

describe('renderReferenceRgba exact pixel probes (paint frame)', () => {
  it('RE-510 glyphs: A, decomposed e + acute, U+F000, and the empty cell', () => {
    expect(at('glyph-ascii-a', 3, 3)).toEqual(WARM);
    expect(at('glyph-ascii-a', 0, 0)).toEqual(NAVY);
    // Coverage 128 at full opacity: lerpU8(bg, fg, 128 * 63, 16065).
    expect(at('glyph-ascii-a', 2, 3)).toEqual([136, 80, 56]);
    expect(at('glyph-decomposed-e-acute', 4, 2)).toEqual(DEFAULT_FG);
    expect(at('glyph-decomposed-e-acute', 0, 0)).toEqual([32, 48, 64]);
    expect(at('glyph-private-use-f000', 0, 1)).toEqual([64, 192, 255]);
    expect(at('glyph-private-use-f000', 0, 0)).toEqual(DEFAULT_BG);
    // Coverage 64 over the default background.
    expect(at('glyph-private-use-f000', 3, 8)).toEqual([26, 61, 81]);
    expect(cellMask(suite, paint, 'glyph-empty', DEFAULT_BG)).not.toContain('#');
  });

  it('fg/bg RGB and default presence bits', () => {
    expect(at('color-fg-only', 3, 3)).toEqual([0, 255, 0]);
    expect(at('color-fg-only', 0, 0)).toEqual(DEFAULT_BG);
    expect(cellMask(suite, paint, 'color-bg-only', [128, 0, 0])).not.toContain('#');
    expect(at('color-defaults', 3, 3)).toEqual(DEFAULT_FG);
    expect(at('color-defaults', 0, 0)).toEqual(DEFAULT_BG);
  });

  it('premultiplied colour glyph ignores fg and composites over the cell background', () => {
    expect(at('glyph-color-heart', 2, 4)).toEqual([224, 32, 64]);
    // Premultiplied (112, 16, 32, 128) over bg (0, 0, 64).
    expect(at('glyph-color-heart', 1, 3)).toEqual([112, 16, 64]);
    expect(at('glyph-color-heart', 0, 0)).toEqual([0, 0, 64]);
  });

  it('bold selects the bold atlas slot', () => {
    expect(at('modifier-bold', 6, 3)).toEqual([136, 80, 56]);
    expect(at('glyph-ascii-a', 6, 3)).toEqual(NAVY);
    expect(at('modifier-bold-e-acute', 6, 2)).toEqual(WARM);
    expect(at('glyph-decomposed-e-acute', 6, 2)).toEqual([32, 48, 64]);
  });

  it('dim attenuates fg halfway toward bg with ties to even', () => {
    // (16 + 255) / 2 = 135.5 rounds to the even 136.
    expect(at('modifier-dim', 3, 3)).toEqual([136, 80, 56]);
    expect(at('modifier-dim', 0, 0)).toEqual(NAVY);
  });

  it('inverse swaps resolved fg and bg, including terminal defaults', () => {
    expect(at('modifier-inverse', 3, 3)).toEqual(NAVY);
    expect(at('modifier-inverse', 0, 0)).toEqual(WARM);
    expect(at('modifier-inverse-defaults', 3, 3)).toEqual(DEFAULT_BG);
    expect(at('modifier-inverse-defaults', 0, 0)).toEqual(DEFAULT_FG);
    // Inverse is applied before dim.
    expect(at('modifier-dim-inverse', 3, 3)).toEqual([136, 80, 56]);
    expect(at('modifier-dim-inverse', 0, 0)).toEqual(WARM);
  });

  it('strikethrough lights exactly its integer row, with or without a glyph', () => {
    for (const id of ['modifier-strikethrough', 'strikethrough-on-space']) {
      expect(at(id, 0, 6), id).toEqual(NAVY);
      expect(at(id, 0, 7), id).toEqual(WARM);
      expect(at(id, 7, 7), id).toEqual(WARM);
      expect(at(id, 0, 8), id).toEqual(NAVY);
    }
  });

  it('all four underline styles', () => {
    const underlineRow = (id: string): string =>
      Array.from({ length: 8 }, (_unused, lx) =>
        at(id, lx, 14).every((channel, index) => channel === WARM[index]) ? '#' : '.',
      ).join('');
    expect(underlineRow('underline-solid')).toBe('########');
    expect(underlineRow('underline-on-space')).toBe('########');
    expect(underlineRow('underline-curly')).toBe('########');
    expect(underlineRow('underline-dotted')).toBe('#.#.#.#.');
    expect(underlineRow('underline-dashed')).toBe('###.###.');
    for (const id of ['underline-solid', 'underline-curly', 'underline-dotted', 'underline-dashed']) {
      expect(at(id, 0, 13), id).toEqual(NAVY);
      expect(at(id, 0, 15), id).toEqual(NAVY);
    }
  });

  it('partial opacity blends the cell over the canvas backdrop in sRGB-direct space', () => {
    // baseBg = lerpU8(defaultBg, bg, 32, 63).
    expect(at('opacity-partial', 0, 0)).toEqual([15, 25, 36]);
    // out = lerpU8(baseBg, fg, 255 * 32, 16065).
    expect(at('opacity-partial', 3, 3)).toEqual([137, 77, 50]);
    expect(cellMask(suite, paint, 'opacity-zero', DEFAULT_BG)).not.toContain('#');
    expect(cellMask(suite, paint, 'opacity-partial-full-block', [132, 133, 135])).not.toContain('#');
  });

  it('box drawing: light, heavy, double, junctions, arcs, diagonals, and dashes', () => {
    const mask = (id: string): string => cellMask(suite, paint, id, NAVY);
    const rows = (id: string): string[] => mask(id).split('/');
    expect(rows('box-light-horizontal')[7]).toBe('########');
    expect(rows('box-light-horizontal')[6]).toBe('........');
    expect(rows('box-light-vertical').every((row) => row === '...#....')).toBe(true);
    expect(rows('box-light-down-right').slice(6, 9)).toEqual(['........', '...#####', '...#....']);
    expect(rows('box-light-cross').slice(6, 9)).toEqual(['...#....', '########', '...#....']);
    expect(rows('box-heavy-horizontal').slice(6, 10)).toEqual([
      '........',
      '########',
      '########',
      '........',
    ]);
    expect(rows('box-heavy-cross').slice(6, 10)).toEqual([
      '...##...',
      '########',
      '########',
      '...##...',
    ]);
    expect(rows('box-double-horizontal').slice(5, 10)).toEqual([
      '........',
      '########',
      '........',
      '########',
      '........',
    ]);
    expect(rows('box-double-cross').slice(5, 10)).toEqual([
      '..#.#...',
      '###.####',
      '........',
      '###.####',
      '..#.#...',
    ]);
    expect(mask('box-arc-down-right')).toBe(
      '......../......../......../......../......../......../......../.....###/....##../....#.../....#.../...##.../...#..../...#..../...#..../...#....',
    );
    expect(mask('box-arc-down-left')).toBe(
      '......../......../......../......../......../......../......../##....../.##...../..#...../..##..../...#..../...#..../...#..../...#..../...#....',
    );
    expect(mask('box-arc-up-left')).toBe(
      '...#..../...#..../...#..../...#..../..##..../..#...../.##...../##....../......../......../......../......../......../......../......../........',
    );
    expect(mask('box-arc-up-right')).toBe(
      '...#..../...#..../...#..../...#..../...##.../....#.../....##../.....###/......../......../......../......../......../......../......../........',
    );
    expect(rows('box-diagonal-slash')[0]).toBe('.......#');
    expect(rows('box-diagonal-slash')[15]).toBe('#.......');
    expect(rows('box-diagonal-backslash')[0]).toBe('#.......');
    expect(rows('box-diagonal-backslash')[15]).toBe('.......#');
    expect(rows('box-diagonal-cross')[0]).toBe('#......#');
    expect(rows('box-diagonal-cross')[7]).toBe('...##...');
    expect(rows('box-dash-triple-horizontal')[7]).toBe('##.#..#.');
    expect(rows('box-dash-quadruple-vertical').map((row) => row.charAt(3)).join('')).toBe(
      '##..##..##..##..',
    );
    expect(rows('box-mixed-single-double-cross').slice(5, 10)).toEqual([
      '...#....',
      '########',
      '...#....',
      '########',
      '...#....',
    ]);
    expect(rows('box-mixed-light-heavy-tee').slice(6, 10)).toEqual([
      '...#....',
      '...#####',
      '...#####',
      '...#....',
    ]);
    // Every lit box pixel is a solid hit: exactly fg at full opacity.
    expect(at('box-light-horizontal', 0, 7)).toEqual(WARM);
  });

  it('block elements: rects, quadrants, and quarter-coverage shades', () => {
    const rows = (id: string): string[] => cellMask(suite, paint, id, NAVY).split('/');
    expect(rows('block-upper-half').map((row) => row.charAt(0)).join('')).toBe('########........');
    expect(cellMask(suite, paint, 'block-full', WARM)).not.toContain('#');
    expect(rows('block-left-half').every((row) => row === '####....')).toBe(true);
    expect(rows('block-lower-eighth').map((row) => row.charAt(0)).join('')).toBe('..............##');
    expect(rows('block-quadrant-diagonal')[0]).toBe('####....');
    expect(rows('block-quadrant-diagonal')[15]).toBe('....####');
    expect(rows('block-quadrant-lower-right')[7]).toBe('........');
    expect(rows('block-quadrant-lower-right')[8]).toBe('....####');
    // lerpU8(bg, fg, q * 63, 252) for q = 1 and q = 3, uniform across the cell.
    expect(cellMask(suite, paint, 'block-shade-light', [76, 56, 52])).not.toContain('#');
    expect(cellMask(suite, paint, 'block-shade-dark', [195, 104, 60])).not.toContain('#');
  });

  it('braille dots', () => {
    const mask = (id: string): string[] => cellMask(suite, paint, id, NAVY).split('/');
    const dotRows = ['........', '.##..##.', '.##..##.', '........'];
    expect(mask('braille-all-dots')).toEqual([...dotRows, ...dotRows, ...dotRows, ...dotRows]);
    const blank = ['........', '........', '........', '........'];
    const left = ['........', '.##.....', '.##.....', '........'];
    const right = ['........', '.....##.', '.....##.', '........'];
    expect(mask('braille-dot-1')).toEqual([...left, ...blank, ...blank, ...blank]);
    expect(mask('braille-dot-7')).toEqual([...blank, ...blank, ...blank, ...left]);
    // U+2895 sets dots (0,0), (1,1), (0,2), (1,3).
    expect(mask('braille-checker')).toEqual([...left, ...right, ...left, ...right]);
    expect(at('braille-all-dots', 1, 1)).toEqual(WARM);
  });

  it('assertPixelProbes passes exact probes and reports every mismatch', () => {
    const probes = samplePixelProbes(paint, [
      [3, 3],
      [0, 0],
      [66, 116],
    ]);
    expect(probes[0]).toEqual({ px: 3, py: 3, rgba: [...WARM, 255] });
    expect(() => {
      assertPixelProbes(paint, probes);
    }).not.toThrow();

    let caught: PixelProbeMismatchError | undefined;
    try {
      assertPixelProbes(paint, [
        { px: 3, py: 3, rgba: [254, 128, 64, 255] },
        { px: 0, py: 0, rgba: [16, 32, 48, 255] },
      ]);
    } catch (error) {
      if (error instanceof PixelProbeMismatchError) {
        caught = error;
      }
    }
    expect(caught?.code).toBe('GEORDI_E_BIJOU_PIXEL_PROBE_MISMATCH');
    expect(caught?.mismatches).toEqual([
      { px: 3, py: 3, expected: [254, 128, 64, 255], actual: [255, 128, 64, 255] },
    ]);
    expect(() => readPixel(paint, paint.canvasPxW, 0)).toThrow(BijouGpuValidationError);
  });
});

describe('known failure modes', () => {
  it('does not gamma-convert: a 50% shade of white over black is 128, not linear-light 188', () => {
    const pixel = at('block-shade-medium', 0, 0);
    expect(pixel).toEqual([128, 128, 128]);
    // A linear-light blend re-encoded to sRGB would land near 188 (double
    // conversion); a decode-only blend would land near 55.
    expect(pixel[0]).not.toBe(188);
    expect(pixel[0]).not.toBe(187);
    expect(pixel[0]).not.toBe(55);
    expect(cellMask(suite, paint, 'block-shade-medium', [128, 128, 128])).not.toContain('#');
  });

  it('erase leaves no residual fg or bg from the paint frame in any erased cell', () => {
    for (const cell of suite.cells) {
      if (cell.id === suite.retainedCellId) {
        continue;
      }
      expect(cellMask(suite, erase, cell.id, DEFAULT_BG), cell.id).not.toContain('#');
    }
  });

  it('erase keeps the retained cell pixel-identical to the paint frame', () => {
    const cell = suite.retainedCellId;
    for (let ly = 0; ly < suite.cellPxH; ly += 1) {
      for (let lx = 0; lx < suite.cellPxW; lx += 1) {
        expect(cellPixel(suite, erase, cell, lx, ly)).toEqual(cellPixel(suite, paint, cell, lx, ly));
      }
    }
    expect(cellMask(suite, erase, cell, NAVY)).toContain('#');
  });

  it('paint -> erase changes every painted cell that had visible content', () => {
    const changed = suite.cells.filter(
      (cell) =>
        cell.id !== suite.retainedCellId &&
        cellMask(suite, paint, cell.id, DEFAULT_BG) !== cellMask(suite, erase, cell.id, DEFAULT_BG),
    );
    const invisible = ['glyph-empty', 'opacity-zero'];
    expect(changed.map((cell) => cell.id).sort()).toEqual(
      suite.cells
        .map((cell) => cell.id)
        .filter((id) => id !== suite.retainedCellId && !invisible.includes(id))
        .sort(),
    );
  });
});

describe('edges', () => {
  it('handles a 0x0 grid safely, with and without a canvas', () => {
    const empty: ReferenceSurface = { widthCells: 0, heightCells: 0, bytes: [], sideTable: [] };
    const none = renderReferenceRgba(empty, pack.atlasBitmap, pack.slotMap, table);
    expect(none.rgba).toHaveLength(0);
    expect(none.canvasPxW).toBe(0);
    expect(none.canvasPxH).toBe(0);
    expect(none.frameRgbaSha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(none.preparedCells).toHaveLength(0);

    const letterboxed = renderReferenceRgba(empty, pack.atlasBitmap, pack.slotMap, table, {
      canvasPxW: 5,
      canvasPxH: 3,
    });
    expect(letterboxed.rgba).toHaveLength(5 * 3 * 4);
    expect(samplePixelProbes(letterboxed, [[0, 0], [4, 2]]).map((p) => p.rgba)).toEqual([
      [...DEFAULT_BG, 255],
      [...DEFAULT_BG, 255],
    ]);
  });

  it('handles a zero-width or zero-height grid safely', () => {
    for (const [widthCells, heightCells] of [
      [0, 4],
      [4, 0],
    ] as const) {
      const frame = renderReferenceRgba(
        { widthCells, heightCells, bytes: [], sideTable: [] },
        pack.atlasBitmap,
        pack.slotMap,
        table,
      );
      expect(frame.rgba).toHaveLength(frame.canvasPxW * frame.canvasPxH * 4);
      expect(frame.preparedCells).toHaveLength(0);
    }
  });

  it('accepts the four-argument call and a live PackedSurface shape', () => {
    const buffer = Uint8Array.from(packCell({ code: 0x41, fg: WARM, bg: NAVY }));
    const frame = renderReferenceRgba(
      referenceSurfaceFromPackedSurface({ width: 1, height: 1, buffer, sideTable: [] }),
      pack.atlasBitmap,
      pack.slotMap,
      table,
    );
    expect([frame.canvasPxW, frame.canvasPxH]).toEqual([8, 16]);
    expect(readPixel(frame, 3, 3)).toEqual([...WARM, 255]);
  });

  it('rejects invalid cell metrics, canvases, colours, byte lengths, and atlas slots', () => {
    const one = surfaceOf(1, [{ code: 0x20 }]);
    const render = (
      surface: ReferenceSurface,
      atlas: AtlasBitmap,
      options?: Parameters<typeof renderReferenceRgba>[4],
    ): (() => void) => {
      return () => {
        renderReferenceRgba(surface, atlas, NO_SLOTS, table, options);
      };
    };
    for (const [w, h] of [
      [0, 16],
      [8, 0],
      [257, 16],
      [8, 257],
      [1.5, 16],
    ] as const) {
      expect(render(one, { ...blankAtlas(8, 16), cellPxW: w, cellPxH: h })).toThrow(
        /GEORDI_E_BIJOU_INVALID_CELL_METRICS/u,
      );
    }
    expect(render(one, { ...blankAtlas(8, 16), rgba: new Uint8Array(3) })).toThrow(
      /GEORDI_E_BIJOU_INVALID_ATLAS/u,
    );
    expect(render(one, blankAtlas(8, 16), { canvasPxW: 7 })).toThrow(/GEORDI_E_BIJOU_INVALID_SURFACE/u);
    expect(render(one, blankAtlas(8, 16), { defaultBg: '#0d1117' })).toThrow(
      /GEORDI_E_BIJOU_INVALID_SURFACE/u,
    );
    expect(
      render({ widthCells: 1, heightCells: 1, bytes: [1, 2, 3], sideTable: [] }, blankAtlas(8, 16)),
    ).toThrow(/GEORDI_E_BIJOU_INVALID_SURFACE/u);
    expect(
      render(surfaceOf(1, [{ code: SIDE_TABLE_THRESHOLD }]), blankAtlas(8, 16)),
    ).toThrow(/side-table index 0 does not exist/u);
    const outOfRange = createGlyphSlotMap([{ grapheme: 'A', bold: false, slot: 9, kind: 'mono' }]);
    expect(() =>
      renderReferenceRgba(surfaceOf(1, [{ code: 0x41 }]), blankAtlas(8, 16), outOfRange, table),
    ).toThrow(/atlas slot 9 exceeds capacity 1/u);
  });

  it('renders the Option E4 regression sizes through the full rasteriser', () => {
    const arcs = surfaceOf(
      4,
      [0x256d, 0x256e, 0x256f, 0x2570].map((code) => ({ code, fg: WARM, bg: NAVY })),
    );
    const masks = (W: number, H: number): string[] => {
      const frame = renderReferenceRgba(arcs, blankAtlas(W, H), NO_SLOTS, table);
      return [0, 1, 2, 3].map((col) => {
        const rows: string[] = [];
        for (let ly = 0; ly < H; ly += 1) {
          let line = '';
          for (let lx = 0; lx < W; lx += 1) {
            const [r, g, b] = readPixel(frame, col * W + lx, ly);
            line += r === WARM[0] && g === WARM[1] && b === WARM[2] ? '#' : '.';
          }
          rows.push(line);
        }
        return rows.join('/');
      });
    };
    expect(masks(2, 2)).toEqual(['##/#.', '#./#.', '#./..', '##/..']);
    expect(masks(2, 14)).toEqual([
      '../../../../../../##/#./#./#./#./#./#./#.',
      '../../../../../../#./#./#./#./#./#./#./#.',
      '#./#./#./#./#./#./#./../../../../../../..',
      '#./#./#./#./#./#./##/../../../../../../..',
    ]);
    expect(masks(28, 2)).toEqual([
      '.............###############/............###............#',
      '##############............../#...........###.............',
      '#...........###............./##############..............',
      '............###............#/.............###############',
    ]);
    expect(masks(15, 2)).toEqual([
      '......#########/......##......#',
      '########......./#.....##.......',
      '#.....##......./########.......',
      '......##......#/......#########',
    ]);
  });

  it('blends decorations and colour glyphs through opacity, not straight to fg', () => {
    const frame = renderReferenceRgba(
      surfaceOf(2, [
        { code: 0x20, fg: WARM, bg: NAVY, flags: UNDERLINE_SOLID | FLAG_STRIKETHROUGH, opacity: 32 },
        { code: 0x2665, fg: WARM, bg: NAVY, flags: UNDERLINE_SOLID, opacity: 32 },
      ]),
      pack.atlasBitmap,
      pack.slotMap,
      table,
    );
    // baseBg = lerpU8(defaultBg, bg, 32, 63); decoration = lerpU8(baseBg, fg, 32, 63).
    expect(readPixel(frame, 0, 0)).toEqual([15, 25, 36, 255]);
    expect(readPixel(frame, 0, 14)).toEqual([137, 77, 50, 255]);
    expect(readPixel(frame, 0, 7)).toEqual([137, 77, 50, 255]);
    // Opaque premultiplied (224, 32, 64, 255) at opacity 32 over baseBg:
    // divRoundEven(c * 32 * 255 + baseBg * (16065 - 255 * 32), 16065), never tinted by fg.
    expect(readPixel(frame, 8 + 2, 4)).toEqual([121, 29, 50, 255]);
    // A decoration over a colour glyph cell still blends toward fg.
    expect(readPixel(frame, 8, 14)).toEqual([137, 77, 50, 255]);
  });

  it('renders the curly underline wave and decorations at 16x32 and at the 256x256 metric bound', () => {
    const curly = surfaceOf(1, [{ code: 0x20, fg: WARM, bg: NAVY, flags: UNDERLINE_CURLY }]);
    const frame = renderReferenceRgba(curly, blankAtlas(16, 32), NO_SLOTS, table);
    const top = (lx: number): number => {
      for (let ly = 0; ly < 32; ly += 1) {
        if (readPixel(frame, lx, ly)[0] === WARM[0]) {
          return ly;
        }
      }
      return -1;
    };
    expect(Array.from({ length: 8 }, (_unused, lx) => top(lx))).toEqual([28, 29, 29, 28, 28, 27, 27, 28]);

    const big = renderReferenceRgba(
      surfaceOf(1, [{ code: 0x2573, fg: WARM, bg: NAVY }]),
      blankAtlas(256, 256),
      NO_SLOTS,
      table,
    );
    expect(big.rgba).toHaveLength(256 * 256 * 4);
    expect(readPixel(big, 0, 0)).toEqual([...WARM, 255]);
    expect(readPixel(big, 128, 0)).toEqual([...NAVY, 255]);
  });
});

describe('fuzz and stress', () => {
  function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSurface(seed: number): ReferenceSurface {
    const random = mulberry32(seed);
    const pick = (n: number): number => Math.floor(random() * n);
    const sideTable = [TEST_GLYPH_DECOMPOSED_E_ACUTE, TEST_GLYPH_PRIVATE_USE];
    const underlines = [0, UNDERLINE_SOLID, UNDERLINE_CURLY, UNDERLINE_DOTDASH, UNDERLINE_DOTDASH | FLAG_DASHED];
    const cells: CellSpec[] = [];
    for (let index = 0; index < 16 * 8; index += 1) {
      const family = pick(8);
      const code =
        family === 0
          ? 0x41
          : family === 1
            ? SIDE_TABLE_THRESHOLD + pick(2)
            : family === 2
              ? 0x2665
              : family === 3
                ? 0x20
                : family === 4
                  ? 0x2500 + pick(128)
                  : family === 5
                    ? 0x2580 + pick(32)
                    : family === 6
                      ? 0x2800 + pick(256)
                      : 0x2500 + pick(128);
      const rgb = (): Rgb => [pick(256), pick(256), pick(256)];
      const flags =
        (pick(2) * FLAG_BOLD) |
        (pick(2) * FLAG_DIM) |
        (pick(2) * FLAG_STRIKETHROUGH) |
        (pick(2) * FLAG_INVERSE) |
        (underlines[pick(underlines.length)] ?? 0);
      cells.push({
        code,
        ...(pick(4) === 0 ? {} : { fg: rgb() }),
        ...(pick(4) === 0 ? {} : { bg: rgb() }),
        flags,
        opacity: pick(4) === 0 ? pick(64) : 63,
      });
    }
    return surfaceOf(16, cells, sideTable);
  }

  it('renders random 16x8 width-1 fixtures to identical SHA-256 digests across repeated runs', () => {
    const digests = new Set<string>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const surface = randomSurface(seed);
      const first = renderReferenceRgba(surface, pack.atlasBitmap, pack.slotMap, table);
      // A freshly rebuilt surface, glyph pack, and table must not change a single byte.
      const again = renderReferenceRgba(
        randomSurface(seed),
        createTestGlyphPack().atlasBitmap,
        createTestGlyphPack().slotMap,
        loadProceduralTable(),
      );
      const third = renderReferenceRgba(surface, pack.atlasBitmap, pack.slotMap, table);
      expect(again.frameRgbaSha256, `seed ${String(seed)}`).toBe(first.frameRgbaSha256);
      expect(third.frameRgbaSha256, `seed ${String(seed)}`).toBe(first.frameRgbaSha256);
      expect(again.preparedBufferSha256).toBe(first.preparedBufferSha256);
      expect(first.frameRgbaSha256).toBe(sha256Hex(first.rgba));
      expect(first.rgba).toHaveLength(16 * 8 * 8 * 16 * 4);
      digests.add(first.frameRgbaSha256);
    }
    expect(digests.size).toBe(24);
  });
});
