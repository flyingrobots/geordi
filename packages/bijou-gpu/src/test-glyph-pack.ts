import {
  createGlyphSlotMap,
  type AtlasBitmap,
  type AtlasGlyphKind,
  type GlyphSlotEntry,
  type GlyphSlotMap,
} from './atlas.js';
import { sha256Hex } from './sha256.js';

/**
 * The bundled deterministic test glyph pack.
 *
 * It is not a font: every glyph is an explicit, hand-authored 8x16 bitmap, so
 * no host font, rasteriser, or fallback can influence a conformance frame. It
 * covers the `RE-510` width-1 glyphs (`A`, decomposed `e` + combining acute,
 * and private-use `U+F000`) in regular and bold, plus one premultiplied colour
 * glyph. `fixtures/bijou-gpu/test-glyph-pack.json` pins the same bytes for
 * hosts that cannot run TypeScript.
 */
export const TEST_GLYPH_PACK_VERSION = 'geordi-bijou-gpu-test-glyph-pack/1';
export const TEST_GLYPH_PACK_CELL_PX_W = 8;
export const TEST_GLYPH_PACK_CELL_PX_H = 16;
export const TEST_GLYPH_PACK_ATLAS_COLS = 4;
export const TEST_GLYPH_PACK_ATLAS_ROWS = 2;

export const TEST_GLYPH_DECOMPOSED_E_ACUTE = 'e\u0301';
export const TEST_GLYPH_PRIVATE_USE = '\uf000';
export const TEST_GLYPH_COLOR_HEART = '\u2665';

type Texel = readonly [number, number, number, number];

/** Art legend: coverage for monochrome glyphs, premultiplied RGBA for colour. */
const MONO_LEGEND: Readonly<Record<string, Texel>> = {
  '.': [0, 0, 0, 0],
  '-': [255, 255, 255, 64],
  '+': [255, 255, 255, 128],
  '#': [255, 255, 255, 255],
};
const COLOR_LEGEND: Readonly<Record<string, Texel>> = {
  '.': [0, 0, 0, 0],
  r: [112, 16, 32, 128],
  R: [224, 32, 64, 255],
};

const ART_A = [
  '........',
  '........',
  '........',
  '..+##+..',
  '..#..#..',
  '..#..#..',
  '.#....#.',
  '.#....#.',
  '.######.',
  '.#....#.',
  '.#....#.',
  '.#....#.',
  '........',
  '........',
  '........',
  '........',
] as const;

const ART_E_ACUTE = [
  '........',
  '........',
  '....##..',
  '...##...',
  '........',
  '........',
  '..####..',
  '.#....#.',
  '.######.',
  '.#......',
  '.#....+.',
  '..####..',
  '........',
  '........',
  '........',
  '........',
] as const;

const ART_PRIVATE_USE = [
  '........',
  '########',
  '#......#',
  '#.####.#',
  '#.#..#.#',
  '#.#..#.#',
  '#.####.#',
  '#......#',
  '#.+--+.#',
  '#......#',
  '########',
  '........',
  '........',
  '........',
  '........',
  '........',
] as const;

const ART_HEART = [
  '........',
  '........',
  '........',
  '.rR..Rr.',
  '.RRRRRR.',
  '.RRRRRR.',
  '.RRRRRR.',
  '..RRRR..',
  '..rRRr..',
  '...RR...',
  '...rr...',
  '........',
  '........',
  '........',
  '........',
  '........',
] as const;

/** Synthetic bold: each row OR-ed with itself shifted one pixel right. */
function embolden(art: readonly string[]): string[] {
  const rank = '.-+#';
  return art.map((row) =>
    Array.from(row)
      .map((character, index) => {
        const previous = index > 0 ? row.charAt(index - 1) : '.';
        return rank.indexOf(previous) > rank.indexOf(character) ? previous : character;
      })
      .join(''),
  );
}

interface TestGlyph {
  readonly grapheme: string;
  readonly bold: boolean;
  readonly kind: AtlasGlyphKind;
  readonly art: readonly string[];
}

const TEST_GLYPHS: readonly TestGlyph[] = [
  { grapheme: 'A', bold: false, kind: 'mono', art: ART_A },
  { grapheme: 'A', bold: true, kind: 'mono', art: embolden(ART_A) },
  { grapheme: TEST_GLYPH_DECOMPOSED_E_ACUTE, bold: false, kind: 'mono', art: ART_E_ACUTE },
  { grapheme: TEST_GLYPH_DECOMPOSED_E_ACUTE, bold: true, kind: 'mono', art: embolden(ART_E_ACUTE) },
  { grapheme: TEST_GLYPH_PRIVATE_USE, bold: false, kind: 'mono', art: ART_PRIVATE_USE },
  { grapheme: TEST_GLYPH_PRIVATE_USE, bold: true, kind: 'mono', art: embolden(ART_PRIVATE_USE) },
  { grapheme: TEST_GLYPH_COLOR_HEART, bold: false, kind: 'color', art: ART_HEART },
  { grapheme: TEST_GLYPH_COLOR_HEART, bold: true, kind: 'color', art: ART_HEART },
];

export interface TestGlyphPack {
  readonly packVersion: typeof TEST_GLYPH_PACK_VERSION;
  readonly atlasBitmap: AtlasBitmap;
  readonly slotMap: GlyphSlotMap;
  /** SHA-256 of the atlas RGBA bytes. */
  readonly atlasRgbaSha256: string;
  /** Receipt `fontIdentity` for frames rendered with this pack. */
  readonly fontIdentity: string;
  readonly atlasStats: {
    readonly usedSlots: number;
    readonly capacity: number;
    readonly monoCount: number;
    readonly colorEmojiCount: number;
  };
}

/** Build the bundled deterministic test glyph pack. */
export function createTestGlyphPack(): TestGlyphPack {
  const cellPxW = TEST_GLYPH_PACK_CELL_PX_W;
  const cellPxH = TEST_GLYPH_PACK_CELL_PX_H;
  const atlasCols = TEST_GLYPH_PACK_ATLAS_COLS;
  const atlasRows = TEST_GLYPH_PACK_ATLAS_ROWS;
  const atlasWidthPx = atlasCols * cellPxW;
  const rgba = new Uint8Array(atlasWidthPx * atlasRows * cellPxH * 4);
  const entries: GlyphSlotEntry[] = [];

  TEST_GLYPHS.forEach((glyph, slot) => {
    const legend = glyph.kind === 'color' ? COLOR_LEGEND : MONO_LEGEND;
    const originX = (slot % atlasCols) * cellPxW;
    const originY = Math.floor(slot / atlasCols) * cellPxH;
    for (let ly = 0; ly < cellPxH; ly += 1) {
      const row = glyph.art[ly] ?? '';
      for (let lx = 0; lx < cellPxW; lx += 1) {
        const texel = legend[row.charAt(lx)] ?? [0, 0, 0, 0];
        rgba.set(texel, ((originY + ly) * atlasWidthPx + originX + lx) * 4);
      }
    }
    entries.push({ grapheme: glyph.grapheme, bold: glyph.bold, slot, kind: glyph.kind });
  });

  const atlasRgbaSha256 = sha256Hex(rgba);
  const colorEmojiCount = entries.filter((entry) => entry.kind === 'color').length;
  return {
    packVersion: TEST_GLYPH_PACK_VERSION,
    atlasBitmap: { cellPxW, cellPxH, atlasCols, atlasRows, rgba },
    slotMap: createGlyphSlotMap(entries),
    atlasRgbaSha256,
    fontIdentity: `${TEST_GLYPH_PACK_VERSION} sha256:${atlasRgbaSha256}`,
    atlasStats: {
      usedSlots: entries.length,
      capacity: atlasCols * atlasRows,
      monoCount: entries.length - colorEmojiCount,
      colorEmojiCount,
    },
  };
}
