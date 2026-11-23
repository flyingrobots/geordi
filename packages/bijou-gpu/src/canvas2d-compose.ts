import {
  GLYPH_KIND_ATLAS_COLOR,
  GLYPH_KIND_ATLAS_MONO,
  GLYPH_KIND_BLOCK,
  GLYPH_KIND_BOX,
  GLYPH_KIND_BRAILLE,
  type AtlasBitmap,
} from './atlas.js';
import { BijouGpuValidationError } from './errors.js';
import { divRoundEven, lerpU8 } from './numeric.js';
import { FLAG_BG_SET, FLAG_DIM, FLAG_FG_SET, FLAG_INVERSE, OPACITY_MASK } from './packed-cells.js';
import { blockPixelQuarters, boxPixelLit, braillePixelLit, decorationPixelLit } from './procedural.js';
import type { ProceduralGlyphTable } from './procedural-table.js';

/**
 * The pure-integer pixel compositor of the Canvas 2D presenter.
 *
 * It evaluates the `bijou-surface-gpu/1` sRGB-direct blend law (design record
 * section 5) and the procedural glyph geometry (section 7) for one prepared
 * cell, writing exact `u8` channels into a tight top-left row-major RGBA8
 * frame. There is no floating-point arithmetic and no host API: the presenter
 * blits the frame to the canvas with `putImageData`, which copies opaque bytes
 * unchanged, so the canvas holds exactly what this module computed.
 *
 * It is written independently of the CPU reference oracle's inner loop,
 * shares its numeric and procedural helpers, and must agree with it
 * bit-for-bit.
 */

/** A tight top-left row-major RGBA8 frame the compositor writes into. */
export interface Canvas2DFrame {
  /** Frame width in physical pixels. */
  readonly width: number;
  /** Frame height in physical pixels. */
  readonly height: number;
  /** `width * height * 4` bytes. */
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** An sRGB colour as three bytes. */
export type Canvas2DRgb = readonly [number, number, number];

/** Integer theme defaults (`uDefaultFg`, `uDefaultBg`). */
export interface Canvas2DTheme {
  readonly defaultFg: Canvas2DRgb;
  readonly defaultBg: Canvas2DRgb;
}

/**
 * Fill the physical pixel rectangle `[x, x + width) x [y, y + height)` of a
 * frame with one opaque colour. The presenter uses it for the letterboxed
 * remainder outside the grid, which is solid `uDefaultBg`.
 */
export function fillCanvas2DRect(
  frame: Canvas2DFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  rgb: Canvas2DRgb,
): void {
  const data = frame.data;
  for (let py = y; py < y + height; py += 1) {
    let offset = (py * frame.width + x) * 4;
    for (let px = 0; px < width; px += 1) {
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
      offset += 4;
    }
  }
}

/**
 * Composite prepared cell `cell` of `words` (four `u32` lanes per cell) at grid
 * position `(col, row)` into `frame`, using the `rgba8uint` `atlas` and the
 * procedural glyph `table`. Cell metrics are the atlas's.
 *
 * Every pixel of the cell is written from the cell's own words and the theme
 * defaults; nothing already in the frame is read, so repainting a
 * partial-opacity cell never accumulates alpha.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_INVALID_ATLAS` when an atlas
 *   glyph's slot is outside the atlas, as the oracle refuses it.
 */
export function composeCanvas2DCell(
  frame: Canvas2DFrame,
  words: Uint32Array,
  cell: number,
  col: number,
  row: number,
  atlas: AtlasBitmap,
  table: ProceduralGlyphTable,
  theme: Canvas2DTheme,
): void {
  const W = atlas.cellPxW;
  const H = atlas.cellPxH;
  const word0 = words[cell * 4] ?? 0;
  const word1 = words[cell * 4 + 1] ?? 0;
  const word2 = words[cell * 4 + 2] ?? 0;
  const payload = word0 & 0xffff;
  const kind = (word0 >>> 16) & 0xf;
  const flags = word1 >>> 24;
  const alphaByte = word2 >>> 24;

  // Section 5 channel resolution, steps 1 to 6.
  let fgR = theme.defaultFg[0];
  let fgG = theme.defaultFg[1];
  let fgB = theme.defaultFg[2];
  if ((alphaByte & FLAG_FG_SET) !== 0) {
    fgR = word1 & 0xff;
    fgG = (word1 >>> 8) & 0xff;
    fgB = (word1 >>> 16) & 0xff;
  }
  let bgR = theme.defaultBg[0];
  let bgG = theme.defaultBg[1];
  let bgB = theme.defaultBg[2];
  if ((alphaByte & FLAG_BG_SET) !== 0) {
    bgR = word2 & 0xff;
    bgG = (word2 >>> 8) & 0xff;
    bgB = (word2 >>> 16) & 0xff;
  }
  if ((flags & FLAG_INVERSE) !== 0) {
    [fgR, bgR] = [bgR, fgR];
    [fgG, bgG] = [bgG, fgG];
    [fgB, bgB] = [bgB, fgB];
  }
  if ((flags & FLAG_DIM) !== 0) {
    fgR = lerpU8(bgR, fgR, 1, 2);
    fgG = lerpU8(bgG, fgG, 1, 2);
    fgB = lerpU8(bgB, fgB, 1, 2);
  }
  const op = alphaByte & OPACITY_MASK;
  const baseR = lerpU8(theme.defaultBg[0], bgR, op, 63);
  const baseG = lerpU8(theme.defaultBg[1], bgG, op, 63);
  const baseB = lerpU8(theme.defaultBg[2], bgB, op, 63);
  const solidR = lerpU8(baseR, fgR, op, 63);
  const solidG = lerpU8(baseG, fgG, op, 63);
  const solidB = lerpU8(baseB, fgB, op, 63);

  const atlasRgba = atlas.rgba;
  const atlasWidthPx = atlas.atlasCols * W;
  let atlasOriginX = 0;
  let atlasOriginY = 0;
  if (kind === GLYPH_KIND_ATLAS_MONO || kind === GLYPH_KIND_ATLAS_COLOR) {
    const capacity = atlas.atlasCols * atlas.atlasRows;
    if (payload >= capacity) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_ATLAS',
        `cells[${String(cell)}]`,
        `atlas slot ${String(payload)} exceeds capacity ${String(capacity)}`,
      );
    }
    atlasOriginX = (payload % atlas.atlasCols) * W;
    atlasOriginY = Math.floor(payload / atlas.atlasCols) * H;
  }
  const boxEntry = kind === GLYPH_KIND_BOX ? (table.boxGlyphs[payload] ?? 0) : 0;
  const blockEntry = kind === GLYPH_KIND_BLOCK ? (table.blockGlyphs[payload] ?? 0) : 0;

  const data = frame.data;
  const originX = col * W;
  const originY = row * H;
  for (let ly = 0; ly < H; ly += 1) {
    let offset = ((originY + ly) * frame.width + originX) * 4;
    let texel = ((atlasOriginY + ly) * atlasWidthPx + atlasOriginX) * 4;
    for (let lx = 0; lx < W; lx += 1) {
      // Section 5 step 7: glyph compositing over the resolved background.
      let r = baseR;
      let g = baseG;
      let b = baseB;
      if (kind === GLYPH_KIND_ATLAS_MONO) {
        const coverage = atlasRgba[texel + 3] ?? 0;
        if (coverage !== 0) {
          const num = coverage * op;
          r = lerpU8(baseR, fgR, num, 16065);
          g = lerpU8(baseG, fgG, num, 16065);
          b = lerpU8(baseB, fgB, num, 16065);
        }
      } else if (kind === GLYPH_KIND_ATLAS_COLOR) {
        const keep = 16065 - (atlasRgba[texel + 3] ?? 0) * op;
        const scale = op * 255;
        r = Math.min(255, divRoundEven((atlasRgba[texel] ?? 0) * scale + baseR * keep, 16065));
        g = Math.min(255, divRoundEven((atlasRgba[texel + 1] ?? 0) * scale + baseG * keep, 16065));
        b = Math.min(255, divRoundEven((atlasRgba[texel + 2] ?? 0) * scale + baseB * keep, 16065));
      } else if (kind === GLYPH_KIND_BRAILLE) {
        if (braillePixelLit(payload & 0xff, lx, ly, W, H)) {
          r = solidR;
          g = solidG;
          b = solidB;
        }
      } else if (kind === GLYPH_KIND_BLOCK) {
        const quarters = blockPixelQuarters(blockEntry, lx, ly, W, H);
        if (quarters === 4) {
          r = solidR;
          g = solidG;
          b = solidB;
        } else if (quarters !== 0) {
          const num = quarters * op;
          r = lerpU8(baseR, fgR, num, 252);
          g = lerpU8(baseG, fgG, num, 252);
          b = lerpU8(baseB, fgB, num, 252);
        }
      } else if (kind === GLYPH_KIND_BOX) {
        if (boxPixelLit(boxEntry, lx, ly, W, H)) {
          r = solidR;
          g = solidG;
          b = solidB;
        }
      }
      // Step 8: decorations over the glyph.
      if (decorationPixelLit(flags, lx, ly, W, H)) {
        r = lerpU8(r, fgR, op, 63);
        g = lerpU8(g, fgG, op, 63);
        b = lerpU8(b, fgB, op, 63);
      }
      // Step 9: opaque output.
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
      offset += 4;
      texel += 4;
    }
  }
}
