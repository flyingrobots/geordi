import { BijouGpuValidationError } from './errors.js';

export const MIN_CELL_PX = 1;
export const MAX_CELL_PX = 256;

/** `glyph_kind` values of the prepared `rgba32uint` cell record. */
export const GLYPH_KIND_EMPTY = 0;
export const GLYPH_KIND_ATLAS_MONO = 1;
export const GLYPH_KIND_ATLAS_COLOR = 2;
export const GLYPH_KIND_BRAILLE = 3;
export const GLYPH_KIND_BLOCK = 4;
export const GLYPH_KIND_BOX = 5;

export type AtlasGlyphKind = 'mono' | 'color';

/**
 * An explicit `rgba8uint` glyph atlas: `atlasCols * cellPxW` by
 * `atlasRows * cellPxH` texels in tight top-left row-major RGBA8 order.
 * Monochrome slots carry coverage in alpha; colour slots carry premultiplied
 * sRGB RGBA.
 */
export interface AtlasBitmap {
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly atlasCols: number;
  readonly atlasRows: number;
  readonly rgba: Uint8Array;
}

export interface GlyphSlotEntry {
  readonly grapheme: string;
  readonly bold: boolean;
  readonly slot: number;
  readonly kind: AtlasGlyphKind;
}

export interface GlyphSlotRef {
  readonly slot: number;
  readonly kind: AtlasGlyphKind;
}

/** Atlas slot lookup keyed by `(grapheme, bold)`, as the ABI keys atlas glyphs. */
export interface GlyphSlotMap {
  readonly entries: readonly GlyphSlotEntry[];
  lookup(grapheme: string, bold: boolean): GlyphSlotRef | undefined;
}

function slotKey(grapheme: string, bold: boolean): string {
  return `${bold ? 'b' : 'r'}:${grapheme}`;
}

/** Build a {@link GlyphSlotMap}; duplicate keys and invalid slots are refused. */
export function createGlyphSlotMap(entries: readonly GlyphSlotEntry[]): GlyphSlotMap {
  const bySlotKey = new Map<string, GlyphSlotRef>();
  entries.forEach((entry, index) => {
    const path = `slotMap.entries[${String(index)}]`;
    if (!Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 0xffff) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_ATLAS',
        `${path}.slot`,
        'expected an atlas slot index in 0..65535',
      );
    }
    const key = slotKey(entry.grapheme, entry.bold);
    if (bySlotKey.has(key)) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_ATLAS',
        path,
        'duplicate (grapheme, bold) key',
      );
    }
    bySlotKey.set(key, { slot: entry.slot, kind: entry.kind });
  });
  const frozen = entries.map((entry) => ({ ...entry }));
  return {
    entries: frozen,
    lookup: (grapheme, bold) => bySlotKey.get(slotKey(grapheme, bold)),
  };
}

/** Validate physical cell metrics into `[1..256] x [1..256]`. */
export function assertCellMetrics(cellPxW: number, cellPxH: number, path: string): void {
  for (const [label, value] of [
    ['cellPxW', cellPxW],
    ['cellPxH', cellPxH],
  ] as const) {
    if (!Number.isInteger(value) || value < MIN_CELL_PX || value > MAX_CELL_PX) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_CELL_METRICS',
        `${path}.${label}`,
        `expected an integer in ${String(MIN_CELL_PX)}..${String(MAX_CELL_PX)}, received ${String(value)}`,
      );
    }
  }
}

/** Validate an atlas bitmap's metrics, grid, and byte length. */
export function assertAtlasBitmap(atlas: AtlasBitmap): void {
  assertCellMetrics(atlas.cellPxW, atlas.cellPxH, 'atlasBitmap');
  for (const [label, value] of [
    ['atlasCols', atlas.atlasCols],
    ['atlasRows', atlas.atlasRows],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 0x10000) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_ATLAS',
        `atlasBitmap.${label}`,
        'expected a positive integer',
      );
    }
  }
  const expected = atlas.atlasCols * atlas.cellPxW * atlas.atlasRows * atlas.cellPxH * 4;
  if (atlas.rgba.length !== expected) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      'atlasBitmap.rgba',
      `expected ${String(expected)} bytes, received ${String(atlas.rgba.length)}`,
    );
  }
}
