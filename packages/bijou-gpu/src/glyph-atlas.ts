import {
  assertCellMetrics,
  createGlyphSlotMap,
  GLYPH_KIND_ATLAS_COLOR,
  GLYPH_KIND_ATLAS_MONO,
  type AtlasBitmap,
  type AtlasGlyphKind,
  type GlyphSlotEntry,
  type GlyphSlotMap,
  type GlyphSlotRef,
} from './atlas.js';
import { BijouGpuValidationError } from './errors.js';
import { divRoundEven } from './numeric.js';
import { FLAG_BOLD, isSafeUnitGlyph, isWideUnitGlyph } from './packed-cells.js';
import type { EndpointReceiptAtlasStats } from './receipt.js';

/**
 * The dynamic glyph atlas of `bijou-surface-gpu/1`.
 *
 * This module is the pure core: a slot table, a sequential slot allocator, a
 * dirty sub-rect tracker, and a `generation` counter. It never touches a host
 * API. Glyph pixels come from an injected {@link GlyphRasterizer}; the browser
 * rasterizer and the font and DPR listeners live in `glyph-atlas-browser.ts`.
 */

/** A slot index must fit the 16-bit `glyph_payload` of the prepared cell. */
export const GLYPH_ATLAS_MAX_SLOTS = 0x10000;

/** `generation` of a newly created atlas. It only ever increases. */
export const GLYPH_ATLAS_FIRST_GENERATION = 1;

/**
 * Colour-emoji threshold, in 8-bit channel units.
 *
 * A raster is a colour glyph when its alpha-weighted mean red, green, and blue
 * differ by more than this many code values (see {@link classifyGlyphPixels}).
 */
export const COLOR_GLYPH_DIVERGENCE_THRESHOLD = 16;

/** Integer physical cell metrics and the identity of the font behind them. */
export interface GlyphAtlasMetrics {
  /** Physical cell width in pixels, an integer in `1..256`. */
  readonly cellPxW: number;
  /** Physical cell height in pixels, an integer in `1..256`. */
  readonly cellPxH: number;
  /** Receipt `fontIdentity`. Opaque to the atlas; must not be empty. */
  readonly fontIdentity: string;
}

/** Host-boundary cell size: a CSS box and a device pixel ratio. */
export interface CellCssMetrics {
  readonly cellCssW: number;
  readonly cellCssH: number;
  readonly dpr: number;
}

/** One glyph the atlas asks its rasterizer to draw. */
export interface GlyphRasterRequest {
  readonly grapheme: string;
  readonly bold: boolean;
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly fontIdentity: string;
}

/**
 * Draws one glyph into one cell.
 *
 * `rasterize` returns exactly `cellPxW * cellPxH * 4` bytes of tight top-left
 * row-major RGBA8 with straight (non-premultiplied) alpha, the layout a 2D
 * canvas reads back. Monochrome text must be drawn in opaque white ink on a
 * transparent or black ground; a colour glyph keeps its own colours.
 */
export interface GlyphRasterizer {
  rasterize(request: GlyphRasterRequest): ArrayLike<number>;
}

/** An atlas slot together with the generation it belongs to. */
export interface GlyphAtlasSlotRef extends GlyphSlotRef {
  readonly generation: number;
}

/** A rectangle of atlas texels, in physical pixels from the top-left. */
export interface GlyphAtlasDirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type GlyphAtlasInvalidationReason =
  | 'overflow'
  | 'metrics-change'
  | 'dpr-change'
  | 'font-ready'
  | 'manual';

export interface GlyphAtlasInvalidation {
  /** The generation this invalidation produced. */
  readonly generation: number;
  readonly reason: GlyphAtlasInvalidationReason;
}

export interface GlyphAtlasStats {
  readonly generation: number;
  readonly usedSlots: number;
  readonly capacity: number;
  readonly monoCount: number;
  readonly colorEmojiCount: number;
  readonly atlasCols: number;
  readonly atlasRows: number;
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly fontIdentity: string;
}

/** The atlas-owned fields of a `geordi-bijou-gpu-receipt/1`, by receipt name. */
export interface GlyphAtlasReceiptAssets {
  readonly atlasGeneration: number;
  readonly atlasStats: EndpointReceiptAtlasStats;
  readonly fontIdentity: string;
  readonly cellPx: { readonly width: number; readonly height: number };
}

export interface GlyphAtlasOptions {
  readonly rasterizer: GlyphRasterizer;
  /** Slots per atlas row. */
  readonly atlasCols: number;
  /** Atlas rows. `atlasCols * atlasRows` is the capacity, at most 65536. */
  readonly atlasRows: number;
  readonly metrics: GlyphAtlasMetrics;
  /**
   * Strict canonical mode (the default): refuse any text that Bijou's width-1
   * glyph policy refuses. When `false`, any non-empty string is rasterized
   * into one cell and clipped to it; that is not a wide-cell layout.
   */
  readonly strictCanonical?: boolean;
}

export interface GlyphAtlas {
  /** Increases by one on every reset. A slot is valid in one generation only. */
  readonly generation: number;
  readonly metrics: GlyphAtlasMetrics;
  /**
   * The live `rgba8uint` atlas. Its `rgba` array is written in place as glyphs
   * arrive and is replaced when the cell metrics change, so read it again
   * after every reset.
   */
  readonly bitmap: AtlasBitmap;
  /** Texel regions written since the last {@link GlyphAtlas.takeDirtyRects}. */
  readonly dirtyRects: readonly GlyphAtlasDirtyRect[];
  /** A reset happened that the caller has not yet consumed. */
  readonly needsFullRefresh: boolean;
  /** The most recent reset, or `null` when there has been none. */
  readonly lastInvalidation: GlyphAtlasInvalidation | null;
  /**
   * Slot for `(grapheme, bold)`, rasterizing it on first use. Returns `null`
   * for the empty string, which has no glyph. May reset the atlas when it is
   * full; compare {@link GlyphAtlas.generation} or call
   * {@link GlyphAtlas.consumeFullRefresh} afterwards.
   */
  resolve(grapheme: string, bold: boolean): GlyphAtlasSlotRef | null;
  /**
   * {@link GlyphAtlas.resolve} keyed by a packed `OFF_FLAGS` byte: only
   * `FLAG_BOLD` selects the slot. Safe to pass detached as a callback.
   */
  readonly resolveSlot: (grapheme: string, flags: number) => GlyphAtlasSlotRef | null;
  /** Whether `ref` was issued in the current generation. */
  isCurrent(ref: GlyphAtlasSlotRef): boolean;
  /** Return the dirty regions and clear them. */
  takeDirtyRects(): GlyphAtlasDirtyRect[];
  /**
   * Return whether a reset is pending and clear the flag. A `true` result is
   * the packer's `forceFullRefresh`.
   */
  consumeFullRefresh(): boolean;
  /**
   * Drop every slot and start a new generation, optionally with new metrics.
   * The reason defaults to `metrics-change` when metrics are given and to
   * `manual` otherwise.
   */
  invalidate(metrics?: Partial<GlyphAtlasMetrics>, reason?: GlyphAtlasInvalidationReason): void;
  getStats(): GlyphAtlasStats;
  getReceiptAssets(): GlyphAtlasReceiptAssets;
  /** A snapshot of the current generation's slots. */
  toSlotMap(): GlyphSlotMap;
}

function invalid(path: string, detail: string): never {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_ATLAS', path, detail);
}

/**
 * Convert a CSS cell size to integer physical pixels: `Math.round(css * dpr)`
 * per axis, validated into `1..256`. This is float ingress at the host
 * boundary; non-finite and non-positive inputs are refused.
 */
export function snapCellMetrics(input: CellCssMetrics): { cellPxW: number; cellPxH: number } {
  for (const [label, value] of [
    ['cellCssW', input.cellCssW],
    ['cellCssH', input.cellCssH],
    ['dpr', input.dpr],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_CELL_METRICS',
        `cellMetrics.${label}`,
        `expected a finite positive number, received ${String(value)}`,
      );
    }
  }
  const cellPxW = Math.round(input.cellCssW * input.dpr);
  const cellPxH = Math.round(input.cellCssH * input.dpr);
  assertCellMetrics(cellPxW, cellPxH, 'cellMetrics');
  return { cellPxW, cellPxH };
}

/**
 * Decide whether a straight-alpha RGBA8 raster is a colour glyph.
 *
 * Each channel is summed weighted by alpha: `sumC = Σ alpha * C`. The raster is
 * `color` when `max(sumR, sumG, sumB) - min(sumR, sumG, sumB)` exceeds
 * `COLOR_GLYPH_DIVERGENCE_THRESHOLD * Σ alpha`, that is, when the
 * alpha-weighted mean channels differ by more than the threshold. Otherwise it
 * is `mono`.
 *
 * Weighting by alpha ignores transparent pixels. Comparing channel totals
 * rather than single pixels keeps subpixel-antialiased text monochrome: its
 * fringes are strongly coloured pixel by pixel, but white ink deposits the same
 * total coverage in every channel. All arithmetic is exact integer arithmetic.
 *
 * A colour glyph whose channel totals happen to balance (a pure gray emoji) is
 * classified `mono`.
 */
export function classifyGlyphPixels(rgba: ArrayLike<number>): AtlasGlyphKind {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3] ?? 0;
    sumR += alpha * (rgba[offset] ?? 0);
    sumG += alpha * (rgba[offset + 1] ?? 0);
    sumB += alpha * (rgba[offset + 2] ?? 0);
    sumA += alpha;
  }
  const divergence = Math.max(sumR, sumG, sumB) - Math.min(sumR, sumG, sumB);
  return divergence > COLOR_GLYPH_DIVERGENCE_THRESHOLD * sumA ? 'color' : 'mono';
}

/**
 * `word0` of the prepared cell for an atlas glyph: `glyph_kind` `1`
 * (monochrome) or `2` (colour emoji) in bits 16..19 and the slot in bits 0..15.
 */
export function encodeAtlasGlyphWord0(ref: GlyphSlotRef): number {
  if (!Number.isInteger(ref.slot) || ref.slot < 0 || ref.slot >= GLYPH_ATLAS_MAX_SLOTS) {
    invalid('glyphAtlas.slot', `expected an atlas slot index in 0..65535, received ${String(ref.slot)}`);
  }
  const kind = ref.kind === 'color' ? GLYPH_KIND_ATLAS_COLOR : GLYPH_KIND_ATLAS_MONO;
  return ((kind << 16) | ref.slot) >>> 0;
}

function assertMetrics(metrics: GlyphAtlasMetrics): void {
  assertCellMetrics(metrics.cellPxW, metrics.cellPxH, 'glyphAtlas.metrics');
  if (metrics.fontIdentity.length === 0) {
    invalid('glyphAtlas.metrics.fontIdentity', 'expected a non-empty font identity');
  }
}

function assertGridDimension(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > GLYPH_ATLAS_MAX_SLOTS) {
    invalid(`glyphAtlas.${label}`, `expected a positive integer, received ${String(value)}`);
  }
}

function describeGrapheme(grapheme: string): string {
  return Array.from(grapheme)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join(' ');
}

function assertCanonicalGrapheme(grapheme: string): void {
  const path = 'glyphAtlas.resolve.grapheme';
  if (isSafeUnitGlyph(grapheme)) {
    return;
  }
  if (isWideUnitGlyph(grapheme)) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
      path,
      `width-2 grapheme ${describeGrapheme(grapheme)} is not representable in bijou-surface-gpu/1`,
    );
  }
  throw new BijouGpuValidationError(
    'GEORDI_E_BIJOU_INVALID_PACKED_CELLS',
    path,
    `${describeGrapheme(grapheme)} is not one terminal-safe width-1 grapheme`,
  );
}

function slotKey(grapheme: string, bold: boolean): string {
  return `${bold ? 'b' : 'r'}:${grapheme}`;
}

interface SlotRecord extends GlyphSlotEntry {
  readonly ref: GlyphAtlasSlotRef;
}

/** Create an empty {@link GlyphAtlas}. */
export function createGlyphAtlas(options: GlyphAtlasOptions): GlyphAtlas {
  const { rasterizer, atlasCols, atlasRows } = options;
  const strictCanonical = options.strictCanonical ?? true;
  assertGridDimension(atlasCols, 'atlasCols');
  assertGridDimension(atlasRows, 'atlasRows');
  const capacity = atlasCols * atlasRows;
  if (capacity > GLYPH_ATLAS_MAX_SLOTS) {
    invalid(
      'glyphAtlas.capacity',
      `${String(capacity)} slots exceed the ${String(GLYPH_ATLAS_MAX_SLOTS)} a 16-bit glyph payload can address`,
    );
  }
  assertMetrics(options.metrics);

  let metrics: GlyphAtlasMetrics = { ...options.metrics };
  let generation = GLYPH_ATLAS_FIRST_GENERATION;
  let rgba = allocate(metrics);
  let bitmap = bitmapOf();
  const slots = new Map<string, SlotRecord>();
  let colorEmojiCount = 0;
  let pendingRects: GlyphAtlasDirtyRect[] = [];
  let wholeAtlasDirty = false;
  let needsFullRefresh = false;
  let lastInvalidation: GlyphAtlasInvalidation | null = null;

  function allocate(next: GlyphAtlasMetrics): Uint8Array {
    return new Uint8Array(atlasCols * next.cellPxW * atlasRows * next.cellPxH * 4);
  }

  function bitmapOf(): AtlasBitmap {
    return { cellPxW: metrics.cellPxW, cellPxH: metrics.cellPxH, atlasCols, atlasRows, rgba };
  }

  function wholeRect(): GlyphAtlasDirtyRect {
    return { x: 0, y: 0, width: atlasCols * metrics.cellPxW, height: atlasRows * metrics.cellPxH };
  }

  /** Reset-and-mark-all-dirty: O(1) in slots, and no slot can alias a stale one. */
  function reset(reason: GlyphAtlasInvalidationReason, next: GlyphAtlasMetrics): void {
    if (next.cellPxW === metrics.cellPxW && next.cellPxH === metrics.cellPxH) {
      rgba.fill(0);
    } else {
      rgba = allocate(next);
    }
    metrics = next;
    bitmap = bitmapOf();
    generation += 1;
    slots.clear();
    colorEmojiCount = 0;
    pendingRects = [];
    wholeAtlasDirty = true;
    needsFullRefresh = true;
    lastInvalidation = { generation, reason };
  }

  function markDirty(slot: number): void {
    if (wholeAtlasDirty) {
      return;
    }
    const x = (slot % atlasCols) * metrics.cellPxW;
    const y = Math.floor(slot / atlasCols) * metrics.cellPxH;
    const previous = pendingRects.at(-1);
    if (previous?.y === y && previous.x + previous.width === x) {
      pendingRects[pendingRects.length - 1] = { ...previous, width: previous.width + metrics.cellPxW };
      return;
    }
    pendingRects.push({ x, y, width: metrics.cellPxW, height: metrics.cellPxH });
  }

  /** Rasterize and validate before any state changes, so a failure costs nothing. */
  function rasterize(grapheme: string, bold: boolean): ArrayLike<number> {
    const { cellPxW, cellPxH, fontIdentity } = metrics;
    const pixels = rasterizer.rasterize({ grapheme, bold, cellPxW, cellPxH, fontIdentity });
    const expected = cellPxW * cellPxH * 4;
    if (pixels.length !== expected) {
      invalid(
        'glyphAtlas.rasterizer.rgba',
        `expected ${String(expected)} bytes, received ${String(pixels.length)}`,
      );
    }
    for (let index = 0; index < expected; index += 1) {
      const value = pixels[index];
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        invalid(`glyphAtlas.rasterizer.rgba[${String(index)}]`, 'expected an unsigned byte');
      }
    }
    return pixels;
  }

  function writeSlot(slot: number, kind: AtlasGlyphKind, pixels: ArrayLike<number>): void {
    const { cellPxW, cellPxH } = metrics;
    const atlasWidthPx = atlasCols * cellPxW;
    const originX = (slot % atlasCols) * cellPxW;
    const originY = Math.floor(slot / atlasCols) * cellPxH;
    for (let ly = 0; ly < cellPxH; ly += 1) {
      for (let lx = 0; lx < cellPxW; lx += 1) {
        const source = (ly * cellPxW + lx) * 4;
        const target = ((originY + ly) * atlasWidthPx + originX + lx) * 4;
        const r = pixels[source] ?? 0;
        const g = pixels[source + 1] ?? 0;
        const b = pixels[source + 2] ?? 0;
        const a = pixels[source + 3] ?? 0;
        if (kind === 'color') {
          // Premultiplied sRGB, rounded ties-to-even.
          rgba[target] = divRoundEven(r * a, 255);
          rgba[target + 1] = divRoundEven(g * a, 255);
          rgba[target + 2] = divRoundEven(b * a, 255);
          rgba[target + 3] = a;
        } else {
          // Coverage is alpha scaled by the mean ink channel: plain alpha for
          // grayscale antialiasing, mean subpixel coverage for LCD rasters.
          rgba[target] = 255;
          rgba[target + 1] = 255;
          rgba[target + 2] = 255;
          rgba[target + 3] = divRoundEven(a * (r + g + b), 765);
        }
      }
    }
  }

  function resolve(grapheme: string, bold: boolean): GlyphAtlasSlotRef | null {
    if (grapheme.length === 0) {
      return null;
    }
    const key = slotKey(grapheme, bold);
    const known = slots.get(key);
    if (known !== undefined) {
      return known.ref;
    }
    if (strictCanonical) {
      assertCanonicalGrapheme(grapheme);
    }
    const pixels = rasterize(grapheme, bold);
    const kind = classifyGlyphPixels(pixels);
    if (slots.size === capacity) {
      reset('overflow', metrics);
    }
    const slot = slots.size;
    writeSlot(slot, kind, pixels);
    markDirty(slot);
    const ref: GlyphAtlasSlotRef = Object.freeze({ slot, kind, generation });
    slots.set(key, { grapheme, bold, slot, kind, ref });
    if (kind === 'color') {
      colorEmojiCount += 1;
    }
    return ref;
  }

  function invalidate(
    update?: Partial<GlyphAtlasMetrics>,
    reason?: GlyphAtlasInvalidationReason,
  ): void {
    const next: GlyphAtlasMetrics = {
      cellPxW: update?.cellPxW ?? metrics.cellPxW,
      cellPxH: update?.cellPxH ?? metrics.cellPxH,
      fontIdentity: update?.fontIdentity ?? metrics.fontIdentity,
    };
    assertMetrics(next);
    reset(reason ?? (update === undefined ? 'manual' : 'metrics-change'), next);
  }

  return {
    get generation() {
      return generation;
    },
    get metrics() {
      return metrics;
    },
    get bitmap() {
      return bitmap;
    },
    get dirtyRects() {
      return wholeAtlasDirty ? [wholeRect()] : [...pendingRects];
    },
    get needsFullRefresh() {
      return needsFullRefresh;
    },
    get lastInvalidation() {
      return lastInvalidation;
    },
    resolve,
    resolveSlot: (grapheme, flags) => resolve(grapheme, (flags & FLAG_BOLD) !== 0),
    isCurrent: (ref) => ref.generation === generation,
    takeDirtyRects() {
      const rects = wholeAtlasDirty ? [wholeRect()] : pendingRects;
      pendingRects = [];
      wholeAtlasDirty = false;
      return rects;
    },
    consumeFullRefresh() {
      const pending = needsFullRefresh;
      needsFullRefresh = false;
      return pending;
    },
    invalidate,
    getStats: () =>
      Object.freeze({
        generation,
        usedSlots: slots.size,
        capacity,
        monoCount: slots.size - colorEmojiCount,
        colorEmojiCount,
        atlasCols,
        atlasRows,
        cellPxW: metrics.cellPxW,
        cellPxH: metrics.cellPxH,
        fontIdentity: metrics.fontIdentity,
      }),
    getReceiptAssets: () => ({
      atlasGeneration: generation,
      atlasStats: {
        usedSlots: slots.size,
        capacity,
        monoCount: slots.size - colorEmojiCount,
        colorEmojiCount,
      },
      fontIdentity: metrics.fontIdentity,
      cellPx: { width: metrics.cellPxW, height: metrics.cellPxH },
    }),
    toSlotMap: () =>
      createGlyphSlotMap(
        Array.from(slots.values(), ({ grapheme, bold, slot, kind }) => ({ grapheme, bold, slot, kind })),
      ),
  };
}
