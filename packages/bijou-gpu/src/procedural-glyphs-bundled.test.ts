import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { nodeSha256, readFixtureText } from '../test/support.js';
import {
  BijouGpuValidationError,
  decodeProceduralGlyphTableText,
  PROCEDURAL_GLYPH_TABLE_SHA256,
} from './index.js';
import {
  BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT,
  loadBundledProceduralGlyphTable,
  verifyProceduralGlyphTable,
} from './procedural-glyphs-bundled.js';

const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url));

describe('bundled procedural glyph table', () => {
  it('embeds the fixture byte for byte, at the digest the ABI pins', () => {
    expect(nodeSha256(BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT)).toBe(PROCEDURAL_GLYPH_TABLE_SHA256);
    expect(BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT).toBe(readFixtureText('procedural-glyphs.json'));
  });

  it('ships a published JSON copy equal to the fixture', () => {
    const copy = readFileSync(join(PACKAGE_DIR, 'procedural', 'procedural-glyphs.json'), 'utf8');
    expect(copy).toBe(readFixtureText('procedural-glyphs.json'));
  });

  it('loads to 128 box and 32 block words, once', () => {
    const table = loadBundledProceduralGlyphTable();
    expect(table.boxGlyphs).toHaveLength(128);
    expect(table.blockGlyphs).toHaveLength(32);
    expect(loadBundledProceduralGlyphTable()).toBe(table);
  });

  it('decodes text only at the pinned digest', () => {
    expect(decodeProceduralGlyphTableText(BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT).boxGlyphs).toEqual(
      loadBundledProceduralGlyphTable().boxGlyphs,
    );
    expect(() => decodeProceduralGlyphTableText(`${BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT} `)).toThrow(
      BijouGpuValidationError,
    );
    expect(() => decodeProceduralGlyphTableText(BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT.replaceAll('\n', '\r\n'))).toThrow(
      /GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE at \$: .*SHA-256/u,
    );
  });

  it('verifies a supplied table against the pin and refuses an altered one', () => {
    const bundled = loadBundledProceduralGlyphTable();
    expect(() => {
      verifyProceduralGlyphTable(bundled);
    }).not.toThrow();
    const box = Uint32Array.from(bundled.boxGlyphs);
    box[0] ^= 1;
    expect(() => {
      verifyProceduralGlyphTable({ ...bundled, boxGlyphs: box });
    }).toThrow(/GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE at options\.proceduralTable\.boxGlyphs\[0\]/u);
  });
});
