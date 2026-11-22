import {
  GLYPH_KIND_ATLAS_COLOR,
  GLYPH_KIND_ATLAS_MONO,
  GLYPH_KIND_BLOCK,
  GLYPH_KIND_BOX,
  GLYPH_KIND_BRAILLE,
  GLYPH_KIND_EMPTY,
  type GlyphSlotMap,
} from './atlas.js';
import { BijouGpuValidationError } from './errors.js';
import {
  CELL_STRIDE,
  FLAG_BOLD,
  FLAG_EMPTY,
  OFF_ALPHA,
  OFF_BG_B,
  OFF_BG_G,
  OFF_BG_R,
  OFF_FG_B,
  OFF_FG_G,
  OFF_FG_R,
  OFF_FLAGS,
  SIDE_TABLE_THRESHOLD,
} from './packed-cells.js';
import {
  BLOCK_ELEMENTS_COUNT,
  BLOCK_ELEMENTS_START,
  BOX_DRAWING_COUNT,
  BOX_DRAWING_START,
  BRAILLE_COUNT,
  BRAILLE_START,
} from './procedural-table.js';

/**
 * A width-1 packed cell grid: `bijou-packed-cell-u8x10-le/1` bytes in
 * row-major order plus the grapheme side table. Both a parsed
 * `packed-bijou-cells/1` receipt and a live Bijou `PackedSurface` (through
 * {@link referenceSurfaceFromPackedSurface}) satisfy it.
 */
export interface ReferenceSurface {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly bytes: ArrayLike<number>;
  readonly sideTable: readonly string[];
}

/** Adapt a live Bijou `PackedSurface` shape to a {@link ReferenceSurface}. */
export function referenceSurfaceFromPackedSurface(surface: {
  readonly width: number;
  readonly height: number;
  readonly buffer: Uint8Array;
  readonly sideTable: readonly string[];
}): ReferenceSurface {
  return {
    widthCells: surface.width,
    heightCells: surface.height,
    bytes: surface.buffer,
    sideTable: surface.sideTable,
  };
}

/** Validate a surface's dimensions and byte length. */
export function assertReferenceSurface(surface: ReferenceSurface): void {
  for (const [label, value] of [
    ['widthCells', surface.widthCells],
    ['heightCells', surface.heightCells],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_SURFACE',
        `surface.${label}`,
        'expected a non-negative integer cell count',
      );
    }
  }
  const expected = surface.widthCells * surface.heightCells * CELL_STRIDE;
  if (surface.bytes.length !== expected) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_SURFACE',
      'surface.bytes',
      `expected ${String(expected)} bytes, received ${String(surface.bytes.length)}`,
    );
  }
}

/**
 * Reference lowering of every packed cell into the prepared `rgba32uint`
 * record (`[word0, word1, word2, word3]` per cell, row-major).
 *
 * This is the oracle's whole-grid lowering. It carries no dirty tracking; the
 * dirty-union packer is a separate component that must agree with it
 * word-for-word.
 */
export function prepareReferenceCells(surface: ReferenceSurface, slotMap: GlyphSlotMap): Uint32Array {
  assertReferenceSurface(surface);
  const cellCount = surface.widthCells * surface.heightCells;
  const words = new Uint32Array(cellCount * 4);
  for (let cell = 0; cell < cellCount; cell += 1) {
    const offset = cell * CELL_STRIDE;
    const byteAt = (index: number): number => {
      const value = surface.bytes[offset + index] ?? 0;
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new BijouGpuValidationError(
          'GEORDI_E_BIJOU_INVALID_SURFACE',
          `surface.bytes[${String(offset + index)}]`,
          'expected an unsigned byte',
        );
      }
      return value;
    };
    const code = byteAt(0) | (byteAt(1) << 8);
    const flags = byteAt(OFF_FLAGS);
    const alpha = byteAt(OFF_ALPHA);
    const word0 = lowerGlyph(surface, slotMap, cell, code, flags);
    words[cell * 4] = word0;
    words[cell * 4 + 1] =
      (byteAt(OFF_FG_R) | (byteAt(OFF_FG_G) << 8) | (byteAt(OFF_FG_B) << 16) | (flags << 24)) >>> 0;
    words[cell * 4 + 2] =
      (byteAt(OFF_BG_R) | (byteAt(OFF_BG_G) << 8) | (byteAt(OFF_BG_B) << 16) | (alpha << 24)) >>> 0;
    words[cell * 4 + 3] = 0;
  }
  return words;
}

function lowerGlyph(
  surface: ReferenceSurface,
  slotMap: GlyphSlotMap,
  cell: number,
  code: number,
  flags: number,
): number {
  const path = `surface.cells[${String(cell)}]`;
  // Live CHAR_EMPTY, FLAG_EMPTY, and ASCII space all lower to the empty glyph.
  if (code === 0 || code === 0x20 || (flags & FLAG_EMPTY) !== 0) {
    return GLYPH_KIND_EMPTY << 16;
  }
  let grapheme: string;
  if (code >= SIDE_TABLE_THRESHOLD) {
    const entry = surface.sideTable.at(code - SIDE_TABLE_THRESHOLD);
    if (entry === undefined) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_SURFACE',
        path,
        `side-table index ${String(code - SIDE_TABLE_THRESHOLD)} does not exist`,
      );
    }
    grapheme = entry;
  } else {
    grapheme = String.fromCharCode(code);
  }

  if (grapheme.length === 1) {
    const cp = grapheme.charCodeAt(0);
    if (cp >= BRAILLE_START && cp < BRAILLE_START + BRAILLE_COUNT) {
      return (GLYPH_KIND_BRAILLE << 16) | (cp - BRAILLE_START);
    }
    if (cp >= BLOCK_ELEMENTS_START && cp < BLOCK_ELEMENTS_START + BLOCK_ELEMENTS_COUNT) {
      return (GLYPH_KIND_BLOCK << 16) | (cp - BLOCK_ELEMENTS_START);
    }
    if (cp >= BOX_DRAWING_START && cp < BOX_DRAWING_START + BOX_DRAWING_COUNT) {
      return (GLYPH_KIND_BOX << 16) | (cp - BOX_DRAWING_START);
    }
  }

  const bold = (flags & FLAG_BOLD) !== 0;
  const ref = slotMap.lookup(grapheme, bold);
  if (ref === undefined) {
    // No host font fallback: a glyph without a declared slot is a refusal.
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_MISSING_GLYPH_SLOT',
      path,
      `no atlas slot for ${bold ? 'bold ' : ''}grapheme ${describeCodePoints(grapheme)}`,
    );
  }
  const kind = ref.kind === 'color' ? GLYPH_KIND_ATLAS_COLOR : GLYPH_KIND_ATLAS_MONO;
  return ((kind << 16) | ref.slot) >>> 0;
}

function describeCodePoints(grapheme: string): string {
  return Array.from(grapheme)
    .map((character) => {
      const cp = character.codePointAt(0) ?? 0;
      return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join(' ');
}

/** Serialise prepared words as the canonical little-endian byte stream. */
export function preparedBufferBytes(words: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => {
    view.setUint32(index * 4, word, true);
  });
  return bytes;
}
