import { describe, expect, it } from 'vitest';

import {
  createTestGlyphPack,
  TEST_GLYPH_COLOR_HEART,
  TEST_GLYPH_DECOMPOSED_E_ACUTE,
  TEST_GLYPH_PRIVATE_USE,
  TEST_GLYPH_PACK_VERSION,
} from './index.js';
import { arr, int, loadSuite, nodeSha256, obj, readFixtureBytes, readFixtureJson, str } from '../test/support.js';

describe('bundled deterministic test glyph pack', () => {
  const pack = createTestGlyphPack();

  it('is byte-identical to the checked-in fixtures/bijou-gpu/test-glyph-pack.json', () => {
    const fixture = obj(readFixtureJson('test-glyph-pack.json'), 'glyph pack');
    expect(str(fixture.packVersion, 'packVersion')).toBe(TEST_GLYPH_PACK_VERSION);
    const cellPx = obj(fixture.cellPx, 'cellPx');
    expect([int(cellPx.width, 'width'), int(cellPx.height, 'height')]).toEqual([
      pack.atlasBitmap.cellPxW,
      pack.atlasBitmap.cellPxH,
    ]);
    expect(int(fixture.atlasCols, 'atlasCols')).toBe(pack.atlasBitmap.atlasCols);
    expect(int(fixture.atlasRows, 'atlasRows')).toBe(pack.atlasBitmap.atlasRows);
    const hex = arr(fixture.atlasRgbaHexRows, 'rows')
      .map((row) => str(row, 'row'))
      .join('');
    const bytes = Uint8Array.from(hex.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
    expect(Array.from(bytes)).toEqual(Array.from(pack.atlasBitmap.rgba));
    expect(str(fixture.atlasRgbaSha256, 'sha')).toBe(nodeSha256(pack.atlasBitmap.rgba));
    expect(str(fixture.fontIdentity, 'fontIdentity')).toBe(pack.fontIdentity);
    expect(
      arr(fixture.slots, 'slots').map((item) => {
        const slot = obj(item, 'slot');
        return {
          grapheme: str(slot.grapheme, 'grapheme'),
          bold: slot.bold === true,
          slot: int(slot.slot, 'slot'),
          kind: str(slot.kind, 'kind'),
        };
      }),
    ).toEqual(pack.slotMap.entries);
  });

  it('is pinned by the suite manifest digest', () => {
    const suite = obj(readFixtureJson('width1-conformance-suite.json'), 'suite');
    const glyphPack = obj(suite.glyphPack, 'glyphPack');
    expect(nodeSha256(readFixtureBytes(str(glyphPack.path, 'path')))).toBe(
      str(glyphPack.sha256, 'sha256'),
    );
  });

  it('builds identical bytes on every call and identifies itself by atlas digest', () => {
    const again = createTestGlyphPack();
    expect(again.atlasRgbaSha256).toBe(pack.atlasRgbaSha256);
    expect(pack.atlasRgbaSha256).toBe(nodeSha256(pack.atlasBitmap.rgba));
    expect(pack.fontIdentity).toBe(`${TEST_GLYPH_PACK_VERSION} sha256:${pack.atlasRgbaSha256}`);
    expect(pack.atlasStats).toEqual({ usedSlots: 8, capacity: 8, monoCount: 6, colorEmojiCount: 2 });
    expect(pack.atlasBitmap.rgba).toHaveLength(32 * 32 * 4);
  });

  it('covers every atlas glyph the width-1 suite needs, in regular and bold', () => {
    for (const grapheme of ['A', TEST_GLYPH_DECOMPOSED_E_ACUTE, TEST_GLYPH_PRIVATE_USE]) {
      expect(pack.slotMap.lookup(grapheme, false)?.kind, grapheme).toBe('mono');
      expect(pack.slotMap.lookup(grapheme, true)?.kind, grapheme).toBe('mono');
      expect(pack.slotMap.lookup(grapheme, true)?.slot).not.toBe(
        pack.slotMap.lookup(grapheme, false)?.slot,
      );
    }
    expect(pack.slotMap.lookup(TEST_GLYPH_COLOR_HEART, false)?.kind).toBe('color');
    expect(pack.slotMap.lookup('B', false)).toBeUndefined();

    const proceduralOrEmpty = (grapheme: string): boolean => {
      const cp = grapheme.codePointAt(0) ?? 0;
      return grapheme === ' ' || (cp >= 0x2500 && cp <= 0x259f) || (cp >= 0x2800 && cp <= 0x28ff);
    };
    for (const cell of loadSuite().cells) {
      if (!proceduralOrEmpty(cell.grapheme)) {
        expect(
          pack.slotMap.lookup(cell.grapheme, cell.modifiers.includes('bold')),
          cell.id,
        ).toBeDefined();
      }
    }
  });

  it('carries full, partial, and zero coverage and premultiplied colour texels', () => {
    const alphas = new Set<number>();
    for (let offset = 3; offset < pack.atlasBitmap.rgba.length; offset += 4) {
      alphas.add(pack.atlasBitmap.rgba[offset] ?? 0);
    }
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 64, 128, 255]);
    for (let offset = 0; offset < pack.atlasBitmap.rgba.length; offset += 4) {
      const alpha = pack.atlasBitmap.rgba[offset + 3] ?? 0;
      const slot = Math.floor(offset / 4 / 32 / 16) * 4 + Math.floor(((offset / 4) % 32) / 8);
      if (slot >= 6) {
        for (const channel of [0, 1, 2]) {
          expect(pack.atlasBitmap.rgba[offset + channel] ?? 0).toBeLessThanOrEqual(alpha);
        }
      }
    }
  });
});
