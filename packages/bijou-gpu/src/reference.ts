import {
  assertAtlasBitmap,
  GLYPH_KIND_ATLAS_COLOR,
  GLYPH_KIND_ATLAS_MONO,
  GLYPH_KIND_BLOCK,
  GLYPH_KIND_BOX,
  GLYPH_KIND_BRAILLE,
  type AtlasBitmap,
  type GlyphSlotMap,
} from './atlas.js';
import {
  BijouGpuValidationError,
  PixelProbeMismatchError,
  type PixelProbeMismatch,
} from './errors.js';
import { divRoundEven, lerpU8 } from './numeric.js';
import { FLAG_BG_SET, FLAG_DIM, FLAG_FG_SET, FLAG_INVERSE, OPACITY_MASK } from './packed-cells.js';
import { prepareReferenceCells, preparedBufferBytes, type ReferenceSurface } from './prepare.js';
import { blockPixelQuarters, boxPixelLit, braillePixelLit, decorationPixelLit } from './procedural.js';
import type { ProceduralGlyphTable } from './procedural-table.js';
import { sha256Hex } from './sha256.js';

/** Theme defaults used when {@link ReferenceRenderOptions} omits them. */
export const REFERENCE_DEFAULT_FG = '#E6EDF3';
export const REFERENCE_DEFAULT_BG = '#0D1117';

export interface ReferenceRenderOptions {
  /** Physical canvas width; defaults to `widthCells * cellPxW` (no remainder). */
  readonly canvasPxW?: number;
  /** Physical canvas height; defaults to `heightCells * cellPxH` (no remainder). */
  readonly canvasPxH?: number;
  /** `uDefaultFg` as `#RRGGBB` uppercase hex; defaults to {@link REFERENCE_DEFAULT_FG}. */
  readonly defaultFg?: string;
  /** `uDefaultBg` as `#RRGGBB` uppercase hex; defaults to {@link REFERENCE_DEFAULT_BG}. */
  readonly defaultBg?: string;
}

/** One reference frame: canonical RGBA8 bytes plus every digest a receipt binds. */
export interface ReferenceFrame {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
  /** Prepared `rgba32uint` cell words (`widthCells * heightCells * 4`). */
  readonly preparedCells: Uint32Array;
  /** SHA-256 of the little-endian prepared buffer bytes. */
  readonly preparedBufferSha256: string;
  /** Tight top-left row-major RGBA8, exactly `canvasPxW * canvasPxH * 4` bytes. */
  readonly rgba: Uint8Array;
  /** Lowercase 64-hex SHA-256 of {@link ReferenceFrame.rgba}. */
  readonly frameRgbaSha256: string;
}

type Rgb = readonly [number, number, number];

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/u;

/** Parse a canonical 7-character uppercase `#RRGGBB` colour. */
export function parseHexColor(value: string, path: string): Rgb {
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_SURFACE',
      path,
      'expected a canonical uppercase #RRGGBB colour',
    );
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function canvasDimension(value: number | undefined, minimum: number, path: string): number {
  const resolved = value ?? minimum;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > 0xffff) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_SURFACE',
      path,
      `expected an integer physical dimension of at least ${String(minimum)}`,
    );
  }
  return resolved;
}

function lerpRgb(a: Rgb, b: Rgb, num: number, den: number): Rgb {
  return [lerpU8(a[0], b[0], num, den), lerpU8(a[1], b[1], num, den), lerpU8(a[2], b[2], num, den)];
}

/**
 * The pure-integer CPU reference rasteriser for `bijou-surface-gpu/1`.
 *
 * It lowers `surface` to prepared `rgba32uint` cells through `slotMap`, then
 * evaluates every physical pixel with the ABI's sRGB-direct integer blend law
 * (no gamma conversion anywhere), the explicit `rgba8uint` `atlasBitmap`, and
 * the procedural glyph `proceduralTable`. The result is the canonical tight
 * top-left row-major RGBA8 frame and its SHA-256, which every presenter must
 * reproduce bit-for-bit.
 */
export function renderReferenceRgba(
  surface: ReferenceSurface,
  atlasBitmap: AtlasBitmap,
  slotMap: GlyphSlotMap,
  proceduralTable: ProceduralGlyphTable,
  options: ReferenceRenderOptions = {},
): ReferenceFrame {
  assertAtlasBitmap(atlasBitmap);
  const preparedCells = prepareReferenceCells(surface, slotMap);
  const { widthCells, heightCells } = surface;
  const { cellPxW, cellPxH, atlasCols, atlasRows } = atlasBitmap;
  const canvasPxW = canvasDimension(options.canvasPxW, widthCells * cellPxW, 'options.canvasPxW');
  const canvasPxH = canvasDimension(options.canvasPxH, heightCells * cellPxH, 'options.canvasPxH');
  const defaultFgHex = options.defaultFg ?? REFERENCE_DEFAULT_FG;
  const defaultBgHex = options.defaultBg ?? REFERENCE_DEFAULT_BG;
  const defaultFg = parseHexColor(defaultFgHex, 'options.defaultFg');
  const defaultBg = parseHexColor(defaultBgHex, 'options.defaultBg');

  const rgba = new Uint8Array(canvasPxW * canvasPxH * 4);
  // Letterboxed remainder pixels outside the grid emit solid uDefaultBg.
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = defaultBg[0];
    rgba[offset + 1] = defaultBg[1];
    rgba[offset + 2] = defaultBg[2];
    rgba[offset + 3] = 255;
  }

  const atlasWidthPx = atlasCols * cellPxW;
  const slotCapacity = atlasCols * atlasRows;

  for (let row = 0; row < heightCells; row += 1) {
    for (let col = 0; col < widthCells; col += 1) {
      const cell = row * widthCells + col;
      const word0 = preparedCells[cell * 4] ?? 0;
      const word1 = preparedCells[cell * 4 + 1] ?? 0;
      const word2 = preparedCells[cell * 4 + 2] ?? 0;
      const payload = word0 & 0xffff;
      const kind = (word0 >>> 16) & 0xf;
      const flags = word1 >>> 24;
      const alphaByte = word2 >>> 24;

      let fg: Rgb =
        (alphaByte & FLAG_FG_SET) !== 0
          ? [word1 & 0xff, (word1 >>> 8) & 0xff, (word1 >>> 16) & 0xff]
          : defaultFg;
      let bg: Rgb =
        (alphaByte & FLAG_BG_SET) !== 0
          ? [word2 & 0xff, (word2 >>> 8) & 0xff, (word2 >>> 16) & 0xff]
          : defaultBg;
      if ((flags & FLAG_INVERSE) !== 0) {
        [fg, bg] = [bg, fg];
      }
      if ((flags & FLAG_DIM) !== 0) {
        fg = lerpRgb(bg, fg, 1, 2);
      }
      const op = alphaByte & OPACITY_MASK;
      const baseBg = lerpRgb(defaultBg, bg, op, 63);
      const solid = lerpRgb(baseBg, fg, op, 63);

      let atlasOriginX = 0;
      let atlasOriginY = 0;
      if (kind === GLYPH_KIND_ATLAS_MONO || kind === GLYPH_KIND_ATLAS_COLOR) {
        if (payload >= slotCapacity) {
          throw new BijouGpuValidationError(
            'GEORDI_E_BIJOU_INVALID_ATLAS',
            `surface.cells[${String(cell)}]`,
            `atlas slot ${String(payload)} exceeds capacity ${String(slotCapacity)}`,
          );
        }
        atlasOriginX = (payload % atlasCols) * cellPxW;
        atlasOriginY = Math.floor(payload / atlasCols) * cellPxH;
      }
      const boxEntry = kind === GLYPH_KIND_BOX ? (proceduralTable.boxGlyphs[payload] ?? 0) : 0;
      const blockEntry = kind === GLYPH_KIND_BLOCK ? (proceduralTable.blockGlyphs[payload] ?? 0) : 0;

      for (let ly = 0; ly < cellPxH; ly += 1) {
        for (let lx = 0; lx < cellPxW; lx += 1) {
          let out: Rgb = baseBg;
          if (kind === GLYPH_KIND_ATLAS_MONO) {
            const texel = ((atlasOriginY + ly) * atlasWidthPx + atlasOriginX + lx) * 4;
            const coverage = atlasBitmap.rgba[texel + 3] ?? 0;
            if (coverage !== 0) {
              out = lerpRgb(baseBg, fg, coverage * op, 16065);
            }
          } else if (kind === GLYPH_KIND_ATLAS_COLOR) {
            const texel = ((atlasOriginY + ly) * atlasWidthPx + atlasOriginX + lx) * 4;
            const emojiA = atlasBitmap.rgba[texel + 3] ?? 0;
            const keep = 16065 - emojiA * op;
            const channel = (index: 0 | 1 | 2): number =>
              Math.min(
                255,
                divRoundEven(
                  (atlasBitmap.rgba[texel + index] ?? 0) * op * 255 + baseBg[index] * keep,
                  16065,
                ),
              );
            out = [channel(0), channel(1), channel(2)];
          } else if (kind === GLYPH_KIND_BRAILLE) {
            if (braillePixelLit(payload & 0xff, lx, ly, cellPxW, cellPxH)) {
              out = solid;
            }
          } else if (kind === GLYPH_KIND_BLOCK) {
            const quarters = blockPixelQuarters(blockEntry, lx, ly, cellPxW, cellPxH);
            if (quarters === 4) {
              out = solid;
            } else if (quarters !== 0) {
              out = lerpRgb(baseBg, fg, quarters * op, 252);
            }
          } else if (kind === GLYPH_KIND_BOX) {
            if (boxPixelLit(boxEntry, lx, ly, cellPxW, cellPxH)) {
              out = solid;
            }
          }
          if (decorationPixelLit(flags, lx, ly, cellPxW, cellPxH)) {
            out = lerpRgb(out, fg, op, 63);
          }
          const offset = ((row * cellPxH + ly) * canvasPxW + col * cellPxW + lx) * 4;
          rgba[offset] = out[0];
          rgba[offset + 1] = out[1];
          rgba[offset + 2] = out[2];
          rgba[offset + 3] = 255;
        }
      }
    }
  }

  return {
    widthCells,
    heightCells,
    cellPxW,
    cellPxH,
    canvasPxW,
    canvasPxH,
    defaultFg: defaultFgHex,
    defaultBg: defaultBgHex,
    preparedCells,
    preparedBufferSha256: sha256Hex(preparedBufferBytes(preparedCells)),
    rgba,
    frameRgbaSha256: sha256Hex(rgba),
  };
}

export interface PixelProbe {
  readonly px: number;
  readonly py: number;
  readonly rgba: readonly [number, number, number, number];
}

/** Read one RGBA8 pixel from a canonical tight top-left row-major frame. */
export function readPixel(
  frame: Pick<ReferenceFrame, 'rgba' | 'canvasPxW' | 'canvasPxH'>,
  px: number,
  py: number,
): readonly [number, number, number, number] {
  if (
    !Number.isInteger(px) ||
    !Number.isInteger(py) ||
    px < 0 ||
    py < 0 ||
    px >= frame.canvasPxW ||
    py >= frame.canvasPxH
  ) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_SURFACE',
      'probe',
      `pixel (${String(px)}, ${String(py)}) is outside the ${String(frame.canvasPxW)}x${String(frame.canvasPxH)} canvas`,
    );
  }
  const offset = (py * frame.canvasPxW + px) * 4;
  return [
    frame.rgba[offset] ?? 0,
    frame.rgba[offset + 1] ?? 0,
    frame.rgba[offset + 2] ?? 0,
    frame.rgba[offset + 3] ?? 0,
  ];
}

/** Compare probes against a frame exactly (zero LSB tolerance, sRGB-direct). */
export function findPixelProbeMismatches(
  frame: Pick<ReferenceFrame, 'rgba' | 'canvasPxW' | 'canvasPxH'>,
  probes: readonly PixelProbe[],
): PixelProbeMismatch[] {
  const mismatches: PixelProbeMismatch[] = [];
  for (const probe of probes) {
    const actual = readPixel(frame, probe.px, probe.py);
    if (actual.some((channel, index) => channel !== probe.rgba[index])) {
      mismatches.push({ px: probe.px, py: probe.py, expected: probe.rgba, actual });
    }
  }
  return mismatches;
}

/**
 * Pixel-probe assertion helper: every probe must match the frame exactly in
 * sRGB-direct space.
 *
 * @throws PixelProbeMismatchError listing every mismatching probe.
 */
export function assertPixelProbes(
  frame: Pick<ReferenceFrame, 'rgba' | 'canvasPxW' | 'canvasPxH'>,
  probes: readonly PixelProbe[],
): void {
  const mismatches = findPixelProbeMismatches(frame, probes);
  if (mismatches.length > 0) {
    throw new PixelProbeMismatchError(mismatches);
  }
}

/** Sample every listed pixel of a frame into receipt-ready probes. */
export function samplePixelProbes(
  frame: Pick<ReferenceFrame, 'rgba' | 'canvasPxW' | 'canvasPxH'>,
  points: readonly (readonly [number, number])[],
): PixelProbe[] {
  return points.map(([px, py]) => ({ px, py, rgba: readPixel(frame, px, py) }));
}
