import { BIJOU_PROCEDURAL_GLYPHS_TEXT } from './generated/bijou-procedural-glyphs.generated.js';
import { BijouGpuValidationError } from './errors.js';
import { decodeProceduralGlyphTableText, type ProceduralGlyphTable } from './procedural-table.js';

/**
 * The bundled adapter of the procedural glyph table of `bijou-surface-gpu/1`:
 * the exact text of `fixtures/bijou-gpu/procedural-glyphs.json`, embedded by
 * `scripts/generate-bijou-gpu-shader-sources.mjs`. Runs anywhere: it reads no
 * file. Exported from `@flyingrobots/geordi-bijou-gpu/procedural-glyphs`, and
 * wired by default into `createCanvas2DSurfacePresenter()`. Node and native
 * tooling can read the same bytes from
 * `@flyingrobots/geordi-bijou-gpu/procedural-glyphs.json`.
 */
export const BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT: string = BIJOU_PROCEDURAL_GLYPHS_TEXT;

let bundled: ProceduralGlyphTable | undefined;

/**
 * The bundled table, decoded once. The text is checked against
 * `PROCEDURAL_GLYPH_TABLE_SHA256` the first time it is decoded.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE`
 *   when the embedded text is not the pinned table.
 */
export function loadBundledProceduralGlyphTable(): ProceduralGlyphTable {
  bundled ??= decodeProceduralGlyphTableText(BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT);
  return bundled;
}

/**
 * Refuse a supplied table that is not the pinned one. A decoded table carries
 * no digest, so this compares its packed words with the bundled table, which
 * was decoded from text at the pinned digest.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE` at
 *   `path`, naming the first word that differs.
 */
export function verifyProceduralGlyphTable(table: ProceduralGlyphTable, path = 'options.proceduralTable'): void {
  const pinned = loadBundledProceduralGlyphTable();
  for (const section of ['boxGlyphs', 'blockGlyphs'] as const) {
    const actual = table[section];
    const expected = pinned[section];
    if (actual.length !== expected.length) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE',
        `${path}.${section}`,
        `expected ${String(expected.length)} words, received ${String(actual.length)}; the table is not the pinned procedural glyph table`,
      );
    }
    const index = expected.findIndex((word, at) => actual[at] !== word);
    if (index >= 0) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE',
        `${path}.${section}[${String(index)}]`,
        `word ${String(actual[index])} differs from the pinned ${String(expected[index])}; the table is not the pinned procedural glyph table`,
      );
    }
  }
}
