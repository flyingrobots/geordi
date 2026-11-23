import { CELL_STRIDE, type GpuPackedSurface, type ReferenceSurface } from '../src/index.js';

/**
 * Build a mutable {@link GpuPackedSurface} from a reference surface (a parsed
 * `packed-bijou-cells/1` receipt). It imports no Node module, so the browser
 * harness and the unit tests share it.
 *
 * `dirty: 'all'` sets every render-dirty bit, as a first paint does.
 * `dirty: 'none'` sets none; mark cells with {@link markCellDirty}.
 */
export function packedSurfaceFromReference(
  surface: ReferenceSurface,
  dirty: 'all' | 'none' = 'all',
): GpuPackedSurface & { buffer: Uint8Array; renderDirtyWords: Uint32Array; sideTable: string[] } {
  const cellCount = surface.widthCells * surface.heightCells;
  const renderDirtyWords = new Uint32Array(Math.ceil(cellCount / 32));
  if (dirty === 'all') {
    for (let cell = 0; cell < cellCount; cell += 1) {
      markCellDirty(renderDirtyWords, cell);
    }
  }
  return {
    width: surface.widthCells,
    height: surface.heightCells,
    buffer: Uint8Array.from(surface.bytes),
    sideTable: [...surface.sideTable],
    renderDirtyWords,
  };
}

export function markCellDirty(words: Uint32Array, cell: number): void {
  const word = cell >>> 5;
  words[word] = ((words[word] ?? 0) | (1 << (cell & 31))) >>> 0;
}

/** Mark every cell whose ten bytes differ between `from` and `to` as dirty in `to`. */
export function markChangedCells(from: GpuPackedSurface, to: GpuPackedSurface & { renderDirtyWords: Uint32Array }): void {
  const cellCount = to.width * to.height;
  for (let cell = 0; cell < cellCount; cell += 1) {
    for (let byte = 0; byte < CELL_STRIDE; byte += 1) {
      if (from.buffer[cell * CELL_STRIDE + byte] !== to.buffer[cell * CELL_STRIDE + byte]) {
        markCellDirty(to.renderDirtyWords, cell);
        break;
      }
    }
  }
}
