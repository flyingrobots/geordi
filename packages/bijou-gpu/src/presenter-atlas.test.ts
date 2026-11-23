import { describe, expect, it } from 'vitest';

import { createStaticAtlasSource, createTestGlyphPack, GLYPH_ATLAS_FIRST_GENERATION } from './index.js';

describe('createStaticAtlasSource', () => {
  it('serves a fixed bitmap and slot map with one generation, no dirty rects, and receipt assets counted from the slot map', () => {
    const pack = createTestGlyphPack();
    const source = createStaticAtlasSource({
      bitmap: pack.atlasBitmap,
      slotMap: pack.slotMap,
      fontIdentity: pack.fontIdentity,
    });
    expect(source.bitmap).toBe(pack.atlasBitmap);
    expect(source.atlasGeneration()).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(source.takeDirtyRects()).toEqual([]);
    expect(source.consumeFullRefresh()).toBe(false);
    expect(source.resolveSlot('A', 0x01)).toEqual(pack.slotMap.lookup('A', true));
    expect(source.resolveSlot('A', 0x00)).toEqual(pack.slotMap.lookup('A', false));
    expect(source.getReceiptAssets()).toEqual({
      atlasGeneration: GLYPH_ATLAS_FIRST_GENERATION,
      atlasStats: pack.atlasStats,
      fontIdentity: pack.fontIdentity,
      cellPx: { width: pack.atlasBitmap.cellPxW, height: pack.atlasBitmap.cellPxH },
    });
  });

  it('refuses an empty font identity and a malformed bitmap', () => {
    const pack = createTestGlyphPack();
    expect(() =>
      createStaticAtlasSource({ bitmap: pack.atlasBitmap, slotMap: pack.slotMap, fontIdentity: '' }),
    ).toThrow(/GEORDI_E_BIJOU_INVALID_ATLAS/u);
    expect(() =>
      createStaticAtlasSource({
        bitmap: { ...pack.atlasBitmap, rgba: new Uint8Array(4) },
        slotMap: pack.slotMap,
        fontIdentity: pack.fontIdentity,
      }),
    ).toThrow(/GEORDI_E_BIJOU_INVALID_ATLAS/u);
  });
});
