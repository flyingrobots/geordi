import {
  GLYPH_KIND_ATLAS_COLOR,
  GLYPH_KIND_ATLAS_MONO,
  GLYPH_KIND_BLOCK,
  GLYPH_KIND_BOX,
  GLYPH_KIND_BRAILLE,
  GLYPH_KIND_EMPTY,
  type GlyphSlotMap,
  type GlyphSlotRef,
} from './atlas.js';
import { BijouGpuValidationError } from './errors.js';
import {
  CELL_STRIDE,
  FLAG_BOLD,
  FLAG_EMPTY,
  graphemeClusterWidth,
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
import type { GpuPackedSurface, GpuPresentContext } from './presenter.js';
import {
  BLOCK_ELEMENTS_COUNT,
  BLOCK_ELEMENTS_START,
  BOX_DRAWING_COUNT,
  BOX_DRAWING_START,
  BRAILLE_COUNT,
  BRAILLE_START,
} from './procedural-table.js';

/**
 * Dirty-union cell packer for the `bijou-surface-gpu/1` ABI.
 *
 * It lowers a `(current, target)` pair of Bijou `PackedSurface` buffers into a
 * retained CPU staging buffer of prepared `rgba32uint` cell records and
 * reports which rows changed. It performs no upload and touches no host API:
 * a presenter owns the texture, this module owns the words.
 *
 * The lowering here is written independently of `prepareReferenceCells()`,
 * the whole-grid reference lowering, and must agree with it word-for-word.
 */

/**
 * Resolve the atlas slot of one grapheme. `flags` is the cell's whole
 * `OFF_FLAGS` byte; the ABI keys atlas glyphs by `(grapheme, bold)`, so a
 * resolver normally reads `FLAG_BOLD` from it. Returning `undefined` refuses
 * the cell with `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT`.
 *
 * It is never called for an empty cell or for a Braille, Block Element, or
 * Box-Drawing code point: those lower to procedural kinds without an atlas.
 */
export type ResolveGlyphSlot = (grapheme: string, flags: number) => GlyphSlotRef | undefined;

/** Adapt a {@link GlyphSlotMap} to a {@link ResolveGlyphSlot}. */
export function resolveSlotFromSlotMap(slotMap: GlyphSlotMap): ResolveGlyphSlot {
  return (grapheme, flags) => slotMap.lookup(grapheme, (flags & FLAG_BOLD) !== 0);
}

/** Per-pack input: the presenter context plus the injected atlas. */
export interface SurfaceDamageOptions extends GpuPresentContext {
  readonly resolveSlot: ResolveGlyphSlot;
  /**
   * The atlas generation, read before and after each pass. When it differs
   * from the generation of the previous pack, or advances while a pass runs
   * (an overflow reset re-slots every glyph), the whole grid is lowered again.
   * Without it the caller must pass `forceFullRefresh` after an atlas reset.
   */
  readonly atlasGeneration?: () => number;
}

/** An inclusive run of rows whose staged words changed. */
export interface DirtyRowSpan {
  readonly minRow: number;
  readonly maxRow: number;
}

/** Why a pack rebuilt the whole grid. */
export type FullRefreshReason =
  | 'first-frame'
  | 'dimension-change'
  | 'recovery'
  | 'atlas-generation'
  | 'forced';

/**
 * Packer state retained between frames. Create it with
 * {@link createSurfaceDamageState}; one state serves one presented grid.
 */
export interface SurfaceDamageState {
  /**
   * The complete staging buffer of the last packed frame: four `u32` lanes per
   * cell, row-major, `widthCells * heightCells * 4` words. Empty before the
   * first pack. A full refresh replaces this array; an incremental pack writes
   * into it.
   */
  readonly staging: Uint32Array;
  readonly widthCells: number;
  readonly heightCells: number;
  /**
   * Non-null when the next pack will rebuild the whole grid regardless of
   * dirty words: a pack threw part-way, or a coalesced frame changed the grid
   * dimensions. While it is `'recovery'`, `staging` may mix cells of two
   * frames and must not be uploaded.
   */
  readonly pendingFullRefresh: FullRefreshReason | null;
}

export interface SurfaceDamageResult {
  /** The retained staging buffer, as {@link SurfaceDamageState.staging}. */
  readonly staging: Uint32Array;
  readonly widthCells: number;
  readonly heightCells: number;
  /** True when every row must be uploaded, whether or not its words changed. */
  readonly fullRefresh: boolean;
  readonly fullRefreshReason: FullRefreshReason | null;
  /**
   * Rows to upload, as ascending, disjoint, non-adjacent inclusive spans. On an
   * incremental pack these are exactly the rows holding a cell whose words
   * changed. On a full refresh it is the one span covering the grid, or no
   * span when the grid has no cells.
   */
  readonly dirtyRowSpans: readonly DirtyRowSpan[];
  /** Cells written: changed cells on an incremental pack, every cell on a full refresh. */
  readonly changedCellCount: number;
}

class DamageState implements SurfaceDamageState {
  public staging = new Uint32Array(0);
  public widthCells = 0;
  public heightCells = 0;
  public pendingFullRefresh: FullRefreshReason | null = null;
  public presented = false;
  /** Dirty words OR-ed over frames that were coalesced and never packed. */
  public accumulated: Uint32Array | null = null;
  public atlasGeneration: number | undefined = undefined;
}

/** A state that has packed nothing; its first pack is a full refresh. */
export function createSurfaceDamageState(): SurfaceDamageState {
  return new DamageState();
}

function fail(path: string, detail: string): never {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_SURFACE', path, detail);
}

function ownState(state: SurfaceDamageState): DamageState {
  if (!(state instanceof DamageState)) {
    return fail('state', 'expected a state made by createSurfaceDamageState()');
  }
  return state;
}

/** Validate a surface's shape and return its cell count. */
function assertSurface(surface: GpuPackedSurface, label: string): number {
  for (const [field, value] of [
    ['width', surface.width],
    ['height', surface.height],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      fail(`${label}.${field}`, 'expected a non-negative integer cell count');
    }
  }
  const cellCount = surface.width * surface.height;
  if (surface.buffer.length !== cellCount * CELL_STRIDE) {
    fail(
      `${label}.buffer`,
      `expected ${String(cellCount * CELL_STRIDE)} bytes, received ${String(surface.buffer.length)}`,
    );
  }
  const wordCount = dirtyWordCount(cellCount);
  if (surface.renderDirtyWords.length < wordCount) {
    fail(
      `${label}.renderDirtyWords`,
      `expected at least ${String(wordCount)} words, received ${String(surface.renderDirtyWords.length)}`,
    );
  }
  return cellCount;
}

function dirtyWordCount(cellCount: number): number {
  return Math.ceil(cellCount / 32);
}

function sameGrid(a: GpuPackedSurface, widthCells: number, heightCells: number): boolean {
  return a.width === widthCells && a.height === heightCells;
}

/**
 * Record the damage of a frame that will not be presented.
 *
 * When several application updates land between two presents, call this for
 * every `(current, target)` pair except the last, and
 * {@link packSurfaceDamage} for the last. Each call ORs
 * `current.renderDirtyWords | target.renderDirtyWords` into the state, so a
 * cell touched only in a skipped frame is still repacked.
 */
export function accumulateSurfaceDamage(
  state: SurfaceDamageState,
  current: GpuPackedSurface,
  target: GpuPackedSurface,
): void {
  const own = ownState(state);
  assertSurface(current, 'current');
  const cellCount = assertSurface(target, 'target');
  if (!own.presented || own.pendingFullRefresh !== null) {
    // The next pack rebuilds the whole grid; there is nothing to narrow.
    return;
  }
  if (
    !sameGrid(target, own.widthCells, own.heightCells) ||
    !sameGrid(current, own.widthCells, own.heightCells)
  ) {
    // Bits of the old grid address different cells in the new one. The full
    // refresh this schedules discards the accumulator without reading it.
    own.pendingFullRefresh = 'dimension-change';
    return;
  }
  const wordCount = dirtyWordCount(cellCount);
  const accumulated = (own.accumulated ??= new Uint32Array(wordCount));
  for (let word = 0; word < wordCount; word += 1) {
    accumulated[word] =
      ((accumulated[word] ?? 0) |
        (current.renderDirtyWords[word] ?? 0) |
        (target.renderDirtyWords[word] ?? 0)) >>>
      0;
  }
}

/**
 * Lower the damage between `current` (the surface last presented) and
 * `target` (the surface to present) into the retained staging buffer.
 *
 * Candidate cells are the union `current.renderDirtyWords |
 * target.renderDirtyWords`, plus anything recorded by
 * {@link accumulateSurfaceDamage}. A candidate is skipped when `current` and
 * `target` hold the same ten bytes and, for a side-table cell, the same
 * grapheme string; every other candidate is lowered and written when its
 * words differ from the staged ones.
 *
 * The whole grid is rebuilt instead on the first pack, when the grid
 * dimensions change, after a pack that threw, when the atlas generation
 * changes, and when `options.forceFullRefresh` is set. Presenters set that
 * flag for the triggers only they can see: a cell metric or device pixel
 * ratio change, a theme default change, and a context or device restoration.
 *
 * `current` must be the surface the previous pack or accumulation received as
 * `target`. Synchronous: no reference to either surface is kept.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` for a
 *   width-2 grapheme, `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` when the resolver has
 *   no slot, `GEORDI_E_BIJOU_INVALID_ATLAS` for a slot outside `0..65535` or an
 *   atlas generation that will not settle, and `GEORDI_E_BIJOU_INVALID_SURFACE`
 *   for a malformed surface. After any throw the next pack is a full refresh.
 */
export function packSurfaceDamage(
  state: SurfaceDamageState,
  current: GpuPackedSurface,
  target: GpuPackedSurface,
  options: SurfaceDamageOptions,
): SurfaceDamageResult {
  const own = ownState(state);
  let completed = false;
  try {
    const result = pack(own, current, target, options);
    completed = true;
    return result;
  } finally {
    if (!completed) {
      own.pendingFullRefresh = 'recovery';
    }
  }
}

function pack(
  own: DamageState,
  current: GpuPackedSurface,
  target: GpuPackedSurface,
  options: SurfaceDamageOptions,
): SurfaceDamageResult {
  const cellCount = assertSurface(target, 'target');
  const generation = options.atlasGeneration?.();

  let reason = fullRefreshReason(own, current, target, generation, options);
  if (reason === null) {
    assertSurface(current, 'current');
    const incremental = packIncremental(own, current, target, cellCount, options);
    if (options.atlasGeneration?.() === generation) {
      own.accumulated = null;
      return incremental;
    }
    // The atlas reset while cells were being resolved: slots staged before the
    // reset are stale, so the incremental result is discarded.
    reason = 'atlas-generation';
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = options.atlasGeneration?.();
    const words = new Uint32Array(cellCount * 4);
    for (let cell = 0; cell < cellCount; cell += 1) {
      lowerCell(target, cell, options.resolveSlot, words, cell * 4);
    }
    if (options.atlasGeneration?.() !== before) {
      continue;
    }
    own.staging = words;
    own.widthCells = target.width;
    own.heightCells = target.height;
    own.presented = true;
    own.pendingFullRefresh = null;
    own.accumulated = null;
    own.atlasGeneration = before;
    return {
      staging: words,
      widthCells: target.width,
      heightCells: target.height,
      fullRefresh: true,
      fullRefreshReason: reason,
      dirtyRowSpans: cellCount === 0 ? [] : [{ minRow: 0, maxRow: target.height - 1 }],
      changedCellCount: cellCount,
    };
  }
  throw new BijouGpuValidationError(
    'GEORDI_E_BIJOU_INVALID_ATLAS',
    'atlasGeneration',
    'the atlas generation advanced during two consecutive whole-grid passes; the frame does not fit one atlas generation',
  );
}

function fullRefreshReason(
  own: DamageState,
  current: GpuPackedSurface,
  target: GpuPackedSurface,
  generation: number | undefined,
  options: SurfaceDamageOptions,
): FullRefreshReason | null {
  if (!own.presented) {
    return 'first-frame';
  }
  if (
    !sameGrid(target, own.widthCells, own.heightCells) ||
    !sameGrid(current, own.widthCells, own.heightCells)
  ) {
    return 'dimension-change';
  }
  if (own.pendingFullRefresh !== null) {
    return own.pendingFullRefresh;
  }
  if (generation !== own.atlasGeneration) {
    return 'atlas-generation';
  }
  return options.forceFullRefresh === true ? 'forced' : null;
}

function packIncremental(
  own: DamageState,
  current: GpuPackedSurface,
  target: GpuPackedSurface,
  cellCount: number,
  options: SurfaceDamageOptions,
): SurfaceDamageResult {
  const { staging, accumulated } = own;
  const width = target.width;
  const wordCount = dirtyWordCount(cellCount);
  const tailBits = cellCount & 31;
  const lowered = new Uint32Array(4);
  const spans: DirtyRowSpan[] = [];
  let spanMin = -1;
  let spanMax = -1;
  let changedCellCount = 0;

  for (let word = 0; word < wordCount; word += 1) {
    const skipped = accumulated?.[word] ?? 0;
    let bits =
      ((current.renderDirtyWords[word] ?? 0) | (target.renderDirtyWords[word] ?? 0) | skipped) >>>
      0;
    if (word === wordCount - 1 && tailBits !== 0) {
      // Bits past the last cell address nothing.
      bits = (bits & ((1 << tailBits) - 1)) >>> 0;
    }
    while (bits !== 0) {
      const lowest = bits & -bits;
      bits = (bits & (bits - 1)) >>> 0;
      const cell = word * 32 + (31 - Math.clz32(lowest));
      // A cell touched in a skipped frame may differ from the staged words even
      // when `current` and `target` agree, so only cells outside the
      // accumulator take the comparison shortcut.
      if ((skipped & lowest) === 0 && cellsSemanticallyEqual(current, target, cell)) {
        continue;
      }
      lowerCell(target, cell, options.resolveSlot, lowered, 0);
      const base = cell * 4;
      if (
        staging[base] === lowered[0] &&
        staging[base + 1] === lowered[1] &&
        staging[base + 2] === lowered[2] &&
        staging[base + 3] === lowered[3]
      ) {
        continue;
      }
      staging.set(lowered, base);
      changedCellCount += 1;
      // Cells arrive in ascending order, so rows never decrease.
      const row = Math.floor(cell / width);
      if (row > spanMax + 1 || spanMin < 0) {
        if (spanMin >= 0) {
          spans.push({ minRow: spanMin, maxRow: spanMax });
        }
        spanMin = row;
      }
      spanMax = row;
    }
  }
  if (spanMin >= 0) {
    spans.push({ minRow: spanMin, maxRow: spanMax });
  }
  return {
    staging,
    widthCells: own.widthCells,
    heightCells: own.heightCells,
    fullRefresh: false,
    fullRefreshReason: null,
    dirtyRowSpans: spans,
    changedCellCount,
  };
}

/**
 * Bijou's semantic cell equality (`packedCellsSemanticallyEqual` in
 * `core/render/differ-cell.ts`): equal bytes, and for a side-table cell the
 * same grapheme string behind the index.
 */
function cellsSemanticallyEqual(
  current: GpuPackedSurface,
  target: GpuPackedSurface,
  cell: number,
): boolean {
  const offset = cell * CELL_STRIDE;
  const a = current.buffer;
  const b = target.buffer;
  for (let index = 0; index < CELL_STRIDE; index += 1) {
    if (a[offset + index] !== b[offset + index]) {
      return false;
    }
  }
  const code = (b[offset] ?? 0) | ((b[offset + 1] ?? 0) << 8);
  if (code < SIDE_TABLE_THRESHOLD) {
    return true;
  }
  const index = code - SIDE_TABLE_THRESHOLD;
  return current.sideTable[index] === target.sideTable[index];
}

/** Lower one target cell into four words at `out[at..at + 3]`. */
function lowerCell(
  target: GpuPackedSurface,
  cell: number,
  resolveSlot: ResolveGlyphSlot,
  out: Uint32Array,
  at: number,
): void {
  const bytes = target.buffer;
  const offset = cell * CELL_STRIDE;
  const code = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
  const flags = bytes[offset + OFF_FLAGS] ?? 0;
  out[at] = lowerGlyph(target, cell, code, flags, resolveSlot);
  out[at + 1] =
    ((bytes[offset + OFF_FG_R] ?? 0) |
      ((bytes[offset + OFF_FG_G] ?? 0) << 8) |
      ((bytes[offset + OFF_FG_B] ?? 0) << 16) |
      (flags << 24)) >>>
    0;
  out[at + 2] =
    ((bytes[offset + OFF_BG_R] ?? 0) |
      ((bytes[offset + OFF_BG_G] ?? 0) << 8) |
      ((bytes[offset + OFF_BG_B] ?? 0) << 16) |
      ((bytes[offset + OFF_ALPHA] ?? 0) << 24)) >>>
    0;
  out[at + 3] = 0;
}

function lowerGlyph(
  target: GpuPackedSurface,
  cell: number,
  code: number,
  flags: number,
  resolveSlot: ResolveGlyphSlot,
): number {
  // Live CHAR_EMPTY, ASCII space, and FLAG_EMPTY all lower to the empty glyph.
  if (code === 0 || code === 0x20 || (flags & FLAG_EMPTY) !== 0) {
    return GLYPH_KIND_EMPTY << 16;
  }
  let grapheme: string;
  if (code >= SIDE_TABLE_THRESHOLD) {
    const entry = target.sideTable.at(code - SIDE_TABLE_THRESHOLD);
    if (entry === undefined) {
      return fail(
        `target.cells[${String(cell)}]`,
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

  // Width-1 policy: the ABI defines no wide-cell layout, so a width-2 grapheme
  // is refused instead of being squeezed into one cell.
  if (graphemeClusterWidth(grapheme) === 2) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
      `target.cells[${String(cell)}]`,
      `width-2 grapheme ${describeCodePoints(grapheme)} is not representable in bijou-surface-gpu/1`,
    );
  }

  const ref = resolveSlot(grapheme, flags);
  if (ref === undefined) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_MISSING_GLYPH_SLOT',
      `target.cells[${String(cell)}]`,
      `no atlas slot for ${(flags & FLAG_BOLD) !== 0 ? 'bold ' : ''}grapheme ${describeCodePoints(grapheme)}`,
    );
  }
  if (!Number.isInteger(ref.slot) || ref.slot < 0 || ref.slot > 0xffff) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      `target.cells[${String(cell)}]`,
      `resolver returned slot ${String(ref.slot)} for grapheme ${describeCodePoints(grapheme)}; expected an integer in 0..65535`,
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
