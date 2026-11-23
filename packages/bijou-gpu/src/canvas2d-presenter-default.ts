import {
  createCanvas2DSurfacePresenterCore,
  type Canvas2DSurfacePresenter,
  type Canvas2DSurfacePresenterCoreOptions,
} from './canvas2d-presenter.js';
import { loadBundledProceduralGlyphTable, verifyProceduralGlyphTable } from './procedural-glyphs-bundled.js';
import type { ProceduralGlyphTable } from './procedural-table.js';

/**
 * The composition root of the Canvas 2D presenter: the core with the bundled
 * procedural glyph table wired in.
 */

export interface Canvas2DSurfacePresenterOptions extends Omit<Canvas2DSurfacePresenterCoreOptions, 'proceduralTable'> {
  /**
   * The procedural glyph table. Defaults to the bundled table, so a host never
   * supplies the package's own table. A supplied table is checked against the
   * pinned table (`PROCEDURAL_GLYPH_TABLE_SHA256`) before anything is drawn.
   */
  readonly proceduralTable?: ProceduralGlyphTable;
}

/**
 * Create a Canvas 2D presenter on `options.canvas`, with the bundled
 * procedural glyph table unless `options.proceduralTable` names another.
 * A synchronous `GpuSurfacePresenterFactory<Canvas2DSurfacePresenterOptions>`.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE`
 *   for a supplied table that is not the pinned one.
 *
 * Otherwise throws what `createCanvas2DSurfacePresenterCore()` throws.
 */
export function createCanvas2DSurfacePresenter(options: Canvas2DSurfacePresenterOptions): Canvas2DSurfacePresenter {
  let proceduralTable = options.proceduralTable;
  if (proceduralTable === undefined) {
    proceduralTable = loadBundledProceduralGlyphTable();
  } else {
    verifyProceduralGlyphTable(proceduralTable);
  }
  return createCanvas2DSurfacePresenterCore({ ...options, proceduralTable });
}
