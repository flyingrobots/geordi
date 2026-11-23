import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseJsonValue } from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';

import {
  BijouGpuValidationError,
  CELL_STRIDE,
  classifyGlyphPixels,
  COLOR_GLYPH_DIVERGENCE_THRESHOLD,
  createGlyphAtlas,
  createSurfaceDamageState,
  encodeAtlasGlyphWord0,
  FLAG_BOLD,
  FLAG_DIM,
  GLYPH_ATLAS_FIRST_GENERATION,
  packSurfaceDamage,
  prepareReferenceCells,
  referenceSurfaceFromPackedSurface,
  renderReferenceRgba,
  serializeEndpointReceipt,
  snapCellMetrics,
  TEST_GLYPH_COLOR_HEART,
  UNDERLINE_SOLID,
  validateEndpointReceipt,
  type EndpointReceipt,
  type GlyphAtlas,
  type GlyphAtlasMetrics,
  type GlyphAtlasSlotRef,
  type GlyphRasterizer,
  type GlyphRasterRequest,
  type GpuPackedSurface,
  type ResolveGlyphSlot,
  type SurfaceDamageOptions,
} from './index.js';
import { renderSuite, suiteFrame } from '../test/support.js';

const METRICS: GlyphAtlasMetrics = { cellPxW: 4, cellPxH: 6, fontIdentity: 'fake-font 6px' };

function keyOf(grapheme: string, bold: boolean): string {
  return `${bold ? 'b' : 'r'}:${grapheme}`;
}

function seedOf(text: string): number {
  let seed = 7;
  for (const character of text) {
    seed = (seed * 31 + (character.codePointAt(0) ?? 0)) % 9973;
  }
  return seed;
}

/** Deterministic non-zero coverage for one pixel of a fake monochrome glyph. */
function fakeCoverage(request: GlyphRasterRequest, pixel: number, salt: number): number {
  const seed = seedOf(`${keyOf(request.grapheme, request.bold)}|${request.fontIdentity}`);
  return ((seed + salt + pixel * 37) % 255) + 1;
}

interface FakeRasterizer extends GlyphRasterizer {
  readonly calls: GlyphRasterRequest[];
  /** Changes every later raster, as a web font replacing a fallback would. */
  salt: number;
}

const COLOR_GRAPHEMES = new Set([TEST_GLYPH_COLOR_HEART]);

/**
 * A pixel-buffer rasterizer with no host font behind it: white ink with a
 * coverage pattern derived from the request, or a flat straight-alpha colour
 * for the graphemes named as colour glyphs.
 */
function fakeRasterizer(): FakeRasterizer {
  const calls: GlyphRasterRequest[] = [];
  const rasterizer: FakeRasterizer = {
    calls,
    salt: 0,
    rasterize(request) {
      calls.push(request);
      const pixels = request.cellPxW * request.cellPxH;
      const rgba = new Uint8ClampedArray(pixels * 4);
      for (let pixel = 0; pixel < pixels; pixel += 1) {
        if (COLOR_GRAPHEMES.has(request.grapheme)) {
          rgba.set([224, 32, 64, pixel % 2 === 0 ? 255 : 128], pixel * 4);
        } else {
          rgba.set([255, 255, 255, fakeCoverage(request, pixel, rasterizer.salt)], pixel * 4);
        }
      }
      return rgba;
    },
  };
  return rasterizer;
}

function atlasOf(
  rasterizer: GlyphRasterizer,
  atlasCols = 4,
  atlasRows = 2,
  metrics: GlyphAtlasMetrics = METRICS,
): GlyphAtlas {
  return createGlyphAtlas({ rasterizer, atlasCols, atlasRows, metrics });
}

function must(ref: GlyphAtlasSlotRef | undefined): GlyphAtlasSlotRef {
  expect(ref).toBeDefined();
  return ref!;
}

/** The atlas texels of one slot, read at the ABI atlas origin for that slot. */
function slotTexels(atlas: GlyphAtlas, slot: number): number[] {
  const { cellPxW, cellPxH, atlasCols, rgba } = atlas.bitmap;
  const originX = (slot % atlasCols) * cellPxW;
  const originY = Math.floor(slot / atlasCols) * cellPxH;
  const widthPx = atlasCols * cellPxW;
  const texels: number[] = [];
  for (let ly = 0; ly < cellPxH; ly += 1) {
    for (let lx = 0; lx < cellPxW; lx += 1) {
      const offset = ((originY + ly) * widthPx + originX + lx) * 4;
      texels.push(...rgba.subarray(offset, offset + 4));
    }
  }
  return texels;
}

function expectedMonoTexels(request: GlyphRasterRequest, salt = 0): number[] {
  const texels: number[] = [];
  for (let pixel = 0; pixel < request.cellPxW * request.cellPxH; pixel += 1) {
    texels.push(255, 255, 255, fakeCoverage(request, pixel, salt));
  }
  return texels;
}

function requestFor(grapheme: string, bold: boolean, metrics: GlyphAtlasMetrics = METRICS): GlyphRasterRequest {
  return { grapheme, bold, ...metrics };
}

function expectCode(run: () => void, code: string, path?: string): void {
  let caught: BijouGpuValidationError | undefined;
  try {
    run();
  } catch (error) {
    if (error instanceof BijouGpuValidationError) {
      caught = error;
    } else {
      throw error;
    }
  }
  expect(caught?.code).toBe(code);
  if (path !== undefined) {
    expect(caught?.path).toBe(path);
  }
}

/** `count` distinct width-1 graphemes: Latin Extended and Cyrillic letters. */
function distinctGraphemes(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCodePoint(0x100 + index));
}

describe('GlyphAtlas slot assignment', () => {
  it('assigns sequential slots keyed by (grapheme, bold) and rasterizes each unseen key once', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);

    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    const a = must(atlas.resolve('A', false));
    const boldA = must(atlas.resolve('A', true));
    const b = must(atlas.resolve('B', false));
    expect([a.slot, boldA.slot, b.slot]).toEqual([0, 1, 2]);
    expect([a.kind, boldA.kind, b.kind]).toEqual(['mono', 'mono', 'mono']);
    expect(a.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);

    // Cache hits return the same slot and never reach the rasterizer again.
    expect(atlas.resolve('A', false)).toEqual(a);
    expect(atlas.resolve('A', true)).toEqual(boldA);
    expect(rasterizer.calls).toEqual([
      requestFor('A', false),
      requestFor('A', true),
      requestFor('B', false),
    ]);
  });

  it('resolveSlot keys on the BOLD bit of the packed flags byte and ignores every other flag', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);
    const { resolveSlot } = atlas;

    const regular = must(resolveSlot('A', 0));
    const bold = must(resolveSlot('A', FLAG_BOLD));
    expect(regular.slot).not.toBe(bold.slot);
    expect(resolveSlot('A', FLAG_DIM | UNDERLINE_SOLID)).toEqual(regular);
    expect(resolveSlot('A', FLAG_BOLD | FLAG_DIM | UNDERLINE_SOLID)).toEqual(bold);
    expect(atlas.resolve('A', true)).toEqual(bold);
    expect(rasterizer.calls).toHaveLength(2);
  });

  it('snapshots its slots as a GlyphSlotMap the reference oracle accepts', () => {
    const atlas = atlasOf(fakeRasterizer());
    atlas.resolve('A', false);
    atlas.resolve(TEST_GLYPH_COLOR_HEART, false);
    atlas.resolve('A', true);

    const slotMap = atlas.toSlotMap();
    expect(slotMap.entries).toEqual([
      { grapheme: 'A', bold: false, slot: 0, kind: 'mono' },
      { grapheme: TEST_GLYPH_COLOR_HEART, bold: false, slot: 1, kind: 'color' },
      { grapheme: 'A', bold: true, slot: 2, kind: 'mono' },
    ]);
    expect(slotMap.lookup(TEST_GLYPH_COLOR_HEART, false)).toEqual({ slot: 1, kind: 'color' });
    expect(slotMap.lookup('Z', false)).toBeUndefined();
  });
});

describe('GlyphAtlas texels and bijou-surface-gpu/1 slot encoding', () => {
  it('stores monochrome coverage in alpha and premultiplied colour at each slot origin', () => {
    const atlas = atlasOf(fakeRasterizer());
    const a = must(atlas.resolve('A', false));
    const heart = must(atlas.resolve(TEST_GLYPH_COLOR_HEART, false));
    // A slot on the second atlas row, so the row origin is exercised too.
    for (const grapheme of ['B', 'C', 'D']) {
      atlas.resolve(grapheme, false);
    }
    const second = must(atlas.resolve('E', true));
    expect(second.slot).toBe(5);

    expect(atlas.bitmap).toMatchObject({ cellPxW: 4, cellPxH: 6, atlasCols: 4, atlasRows: 2 });
    expect(atlas.bitmap.rgba).toHaveLength(4 * 4 * 2 * 6 * 4);
    expect(slotTexels(atlas, a.slot)).toEqual(expectedMonoTexels(requestFor('A', false)));
    expect(slotTexels(atlas, second.slot)).toEqual(expectedMonoTexels(requestFor('E', true)));

    // Straight (224, 32, 64) at alpha 255 and 128, premultiplied ties-to-even.
    const heartTexels = slotTexels(atlas, heart.slot);
    expect(heartTexels.slice(0, 8)).toEqual([224, 32, 64, 255, 112, 16, 32, 128]);
    // Unallocated slots stay transparent.
    expect(slotTexels(atlas, 7).every((value) => value === 0)).toBe(true);
  });

  it('gives monochrome glyphs and colour emoji distinct glyph_kind bits, matching ABI vectors V1 and V2', () => {
    const atlas = atlasOf(fakeRasterizer(), 8, 8);
    const fillers = distinctGraphemes(42);
    fillers.slice(0, 7).forEach((grapheme) => atlas.resolve(grapheme, false));
    const a = must(atlas.resolve('A', true));
    fillers.slice(7, 41).forEach((grapheme) => atlas.resolve(grapheme, false));
    const heart = must(atlas.resolve(TEST_GLYPH_COLOR_HEART, false));

    expect(a).toMatchObject({ slot: 7, kind: 'mono' });
    expect(heart).toMatchObject({ slot: 42, kind: 'color' });
    // V1 word0: 'A' at mono atlas slot 7. V2 word0: colour emoji at slot 42.
    expect(encodeAtlasGlyphWord0(a)).toBe(0x00010007);
    expect(encodeAtlasGlyphWord0(heart)).toBe(0x0002002a);
    expect((encodeAtlasGlyphWord0(a) >>> 16) & 0xf).not.toBe((encodeAtlasGlyphWord0(heart) >>> 16) & 0xf);
  });

  it('refuses to encode a slot outside the 16-bit glyph payload', () => {
    expectCode(
      () => encodeAtlasGlyphWord0({ slot: 0x10000, kind: 'mono' }),
      'GEORDI_E_BIJOU_INVALID_ATLAS',
    );
    expectCode(() => encodeAtlasGlyphWord0({ slot: -1, kind: 'color' }), 'GEORDI_E_BIJOU_INVALID_ATLAS');
  });

  it('feeds the reference oracle the suite goldens when it rasterizes the test glyph pack', () => {
    const { suite, pack, table, paintReceipt, eraseReceipt } = renderSuite();
    const { cellPxW, cellPxH, atlasCols, rgba } = pack.atlasBitmap;
    // Serve the pack's hand-authored bitmaps as straight-alpha rasters.
    const packRasterizer: GlyphRasterizer = {
      rasterize(request) {
        const ref = pack.slotMap.lookup(request.grapheme, request.bold);
        expect(ref, request.grapheme).toBeDefined();
        const slot = ref!.slot;
        const out = new Uint8ClampedArray(cellPxW * cellPxH * 4);
        for (let ly = 0; ly < cellPxH; ly += 1) {
          for (let lx = 0; lx < cellPxW; lx += 1) {
            const sx = (slot % atlasCols) * cellPxW + lx;
            const sy = Math.floor(slot / atlasCols) * cellPxH + ly;
            const offset = (sy * atlasCols * cellPxW + sx) * 4;
            const alpha = rgba[offset + 3] ?? 0;
            const straight = [0, 1, 2].map((channel) =>
              alpha === 0 ? 0 : Math.round(((rgba[offset + channel] ?? 0) * 255) / alpha),
            );
            out.set([...straight, alpha], (ly * cellPxW + lx) * 4);
          }
        }
        return out;
      },
    };
    const atlas = createGlyphAtlas({
      rasterizer: packRasterizer,
      atlasCols: 3,
      atlasRows: 3,
      metrics: { cellPxW, cellPxH, fontIdentity: pack.fontIdentity },
    });
    // Resolve in an order unlike the pack's, so slots differ but pixels must not.
    for (const entry of [...pack.slotMap.entries].reverse()) {
      expect(must(atlas.resolve(entry.grapheme, entry.bold)).kind).toBe(entry.kind);
    }

    const options = {
      canvasPxW: suite.canvasPxW,
      canvasPxH: suite.canvasPxH,
      defaultFg: suite.defaultFg,
      defaultBg: suite.defaultBg,
    };
    const slotMap = atlas.toSlotMap();
    expect(renderReferenceRgba(paintReceipt, atlas.bitmap, slotMap, table, options).frameRgbaSha256).toBe(
      suiteFrame(suite, 'paint').frameRgbaSha256,
    );
    expect(renderReferenceRgba(eraseReceipt, atlas.bitmap, slotMap, table, options).frameRgbaSha256).toBe(
      suiteFrame(suite, 'erase').frameRgbaSha256,
    );
  });
});

describe('GlyphAtlas dirty sub-rects', () => {
  it('reports exactly the newly rasterized slots, merging row-adjacent slots, and drains on take', () => {
    const atlas = atlasOf(fakeRasterizer());
    expect(atlas.dirtyRects).toEqual([]);

    atlas.resolve('A', false);
    expect(atlas.dirtyRects).toEqual([{ x: 0, y: 0, width: 4, height: 6 }]);
    atlas.resolve('B', false);
    atlas.resolve('A', false);
    // Slots 0 and 1 share a row and touch: one rect. The cache hit adds nothing.
    expect(atlas.dirtyRects).toEqual([{ x: 0, y: 0, width: 8, height: 6 }]);

    expect(atlas.takeDirtyRects()).toEqual([{ x: 0, y: 0, width: 8, height: 6 }]);
    expect(atlas.dirtyRects).toEqual([]);
    expect(atlas.takeDirtyRects()).toEqual([]);

    atlas.resolve('C', false);
    atlas.resolve('D', false);
    atlas.resolve('E', false);
    // Slots 2..3 finish row 0; slot 4 starts row 1 and cannot merge with them.
    expect(atlas.takeDirtyRects()).toEqual([
      { x: 8, y: 0, width: 8, height: 6 },
      { x: 0, y: 6, width: 4, height: 6 },
    ]);
  });

  it('covers every changed texel and nothing outside the reported rects', () => {
    const atlas = atlasOf(fakeRasterizer());
    atlas.resolve('A', false);
    atlas.takeDirtyRects();
    const before = Uint8Array.from(atlas.bitmap.rgba);

    atlas.resolve('B', true);
    atlas.resolve(TEST_GLYPH_COLOR_HEART, false);
    const rects = atlas.takeDirtyRects();
    const widthPx = atlas.bitmap.atlasCols * atlas.bitmap.cellPxW;
    const after = atlas.bitmap.rgba;
    let changedInside = 0;
    for (let offset = 0; offset < after.length; offset += 4) {
      const px = (offset / 4) % widthPx;
      const py = Math.floor(offset / 4 / widthPx);
      const inside = rects.some(
        (rect) => px >= rect.x && px < rect.x + rect.width && py >= rect.y && py < rect.y + rect.height,
      );
      const changed = [0, 1, 2, 3].some((channel) => after[offset + channel] !== before[offset + channel]);
      if (changed) {
        expect(inside, `texel (${String(px)}, ${String(py)})`).toBe(true);
        changedInside += 1;
      }
    }
    // Both new 4x6 slots are fully non-transparent in the fake rasters.
    expect(changedInside).toBe(2 * 4 * 6);
    expect(rects).toEqual([{ x: 4, y: 0, width: 8, height: 6 }]);
  });
});

describe('colour-emoji detection (alpha-weighted RGB channel divergence)', () => {
  function pixels(...texels: (readonly [number, number, number, number])[]): Uint8ClampedArray {
    return Uint8ClampedArray.from(texels.flat());
  }

  it('classifies grayscale-antialiased ink of any gray level as monochrome', () => {
    expect(classifyGlyphPixels(pixels([255, 255, 255, 255], [255, 255, 255, 96], [255, 255, 255, 7]))).toBe(
      'mono',
    );
    expect(classifyGlyphPixels(pixels([0, 0, 0, 255], [0, 0, 0, 40]))).toBe('mono');
    expect(classifyGlyphPixels(pixels([127, 127, 127, 200], [128, 128, 128, 13]))).toBe('mono');
    // Unpremultiply round-off of one code value per channel is not colour.
    expect(classifyGlyphPixels(pixels([255, 254, 255, 31], [254, 255, 255, 9], [255, 255, 254, 200]))).toBe(
      'mono',
    );
  });

  it('classifies subpixel-antialiased white ink as monochrome despite coloured fringes', () => {
    // A one-pixel stem straddling a pixel boundary under horizontal-RGB LCD
    // antialiasing: the left pixel lights only its blue subpixel side, the
    // right only its red side. Each pixel is strongly coloured; the channel
    // totals are balanced.
    const opaqueFringes = pixels(
      [0, 85, 255, 255],
      [255, 170, 0, 255],
      [0, 85, 255, 255],
      [255, 170, 0, 255],
    );
    expect(classifyGlyphPixels(opaqueFringes)).toBe('mono');
    // The same stem with coverage carried in alpha (alpha = strongest channel).
    const alphaFringes = pixels([0, 85, 255, 255], [255, 170, 0, 255], [0, 0, 0, 0], [255, 255, 255, 255]);
    expect(classifyGlyphPixels(alphaFringes)).toBe('mono');
    // A wider glyph: fringes on both edges of a solid white interior.
    const stemWithInterior = pixels(
      [0, 128, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 128, 0, 255],
    );
    expect(classifyGlyphPixels(stemWithInterior)).toBe('mono');
  });

  it('classifies chromatic glyphs as colour, including faint ones', () => {
    expect(classifyGlyphPixels(pixels([224, 32, 64, 255], [224, 32, 64, 128]))).toBe('color');
    expect(classifyGlyphPixels(pixels([255, 204, 0, 255], [0, 0, 0, 0], [255, 255, 255, 12]))).toBe('color');
    // Antialiased edge of a colour glyph only: low alpha, still colour.
    expect(classifyGlyphPixels(pixels([255, 0, 0, 3]))).toBe('color');
  });

  it('applies the documented threshold exactly and treats empty rasters as monochrome', () => {
    expect(COLOR_GLYPH_DIVERGENCE_THRESHOLD).toBe(16);
    const atThreshold = pixels([200, 200 - COLOR_GLYPH_DIVERGENCE_THRESHOLD, 200, 255]);
    const aboveThreshold = pixels([200, 199 - COLOR_GLYPH_DIVERGENCE_THRESHOLD, 200, 255]);
    expect(classifyGlyphPixels(atThreshold)).toBe('mono');
    expect(classifyGlyphPixels(aboveThreshold)).toBe('color');
    // Transparent pixels carry no weight, whatever their RGB.
    expect(classifyGlyphPixels(pixels([255, 0, 0, 0], [0, 0, 255, 0]))).toBe('mono');
    expect(classifyGlyphPixels(new Uint8ClampedArray(0))).toBe('mono');
  });

  it('stores subpixel-antialiased ink as mean-channel coverage in a monochrome slot', () => {
    const lcdRasterizer: GlyphRasterizer = {
      rasterize: ({ cellPxW, cellPxH }) => {
        const rgba = new Uint8ClampedArray(cellPxW * cellPxH * 4);
        rgba.set([0, 85, 255, 255, 255, 170, 0, 255, 255, 255, 255, 128, 0, 0, 0, 0]);
        return rgba;
      },
    };
    const atlas = atlasOf(lcdRasterizer);
    const ref = must(atlas.resolve('l', false));
    expect(ref.kind).toBe('mono');
    // (0 + 85 + 255) / 3 = 113.33 -> 113; (255 + 170 + 0) / 3 = 141.67 -> 142;
    // white at alpha 128 -> 128; transparent -> 0.
    expect(slotTexels(atlas, ref.slot).slice(0, 16)).toEqual([
      255, 255, 255, 113, 255, 255, 255, 142, 255, 255, 255, 128, 255, 255, 255, 0,
    ]);
  });
});

describe('GlyphAtlas overflow: reset-and-mark-all-dirty', () => {
  it('increments generation, restarts slots at zero, clears old texels, and flags a full refresh', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer, 2, 2);
    const first = ['A', 'B', 'C', 'D'].map((grapheme) => must(atlas.resolve(grapheme, false)));
    expect(first.map((ref) => ref.slot)).toEqual([0, 1, 2, 3]);
    expect(atlas.needsFullRefresh).toBe(false);
    atlas.takeDirtyRects();

    const e = must(atlas.resolve('E', false));
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(e).toEqual({ slot: 0, kind: 'mono', generation: GLYPH_ATLAS_FIRST_GENERATION + 1 });
    expect(atlas.needsFullRefresh).toBe(true);
    expect(atlas.lastInvalidation).toEqual({
      generation: GLYPH_ATLAS_FIRST_GENERATION + 1,
      reason: 'overflow',
    });
    // The whole atlas is dirty: it was cleared, not patched.
    expect(atlas.takeDirtyRects()).toEqual([{ x: 0, y: 0, width: 8, height: 12 }]);
    expect(slotTexels(atlas, 0)).toEqual(expectedMonoTexels(requestFor('E', false)));
    for (const slot of [1, 2, 3]) {
      expect(slotTexels(atlas, slot).every((value) => value === 0)).toBe(true);
    }
    expect(atlas.getStats()).toMatchObject({ usedSlots: 1, capacity: 4, monoCount: 1, colorEmojiCount: 0 });

    // The flag is handed to the packer exactly once.
    expect(atlas.consumeFullRefresh()).toBe(true);
    expect(atlas.consumeFullRefresh()).toBe(false);
    expect(atlas.needsFullRefresh).toBe(false);
  });

  it('never serves a slot from before the reset: evicted glyphs are rasterized again', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer, 2, 2);
    const oldA = must(atlas.resolve('A', false));
    for (const grapheme of ['B', 'C', 'D', 'E']) {
      atlas.resolve(grapheme, false);
    }
    expect(atlas.isCurrent(oldA)).toBe(false);

    const newA = must(atlas.resolve('A', false));
    // 'E' took slot 0 after the reset, so the old slot 0 would alias it.
    expect(newA).toEqual({ slot: 1, kind: 'mono', generation: atlas.generation });
    expect(atlas.isCurrent(newA)).toBe(true);
    expect(rasterizer.calls.filter((call) => call.grapheme === 'A')).toHaveLength(2);
    expect(slotTexels(atlas, newA.slot)).toEqual(expectedMonoTexels(requestFor('A', false)));
  });

  it('keeps one pending full refresh across several resets before the packer runs', () => {
    const atlas = atlasOf(fakeRasterizer(), 1, 1);
    for (const grapheme of ['A', 'B', 'C']) {
      atlas.resolve(grapheme, false);
    }
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 2);
    expect(atlas.consumeFullRefresh()).toBe(true);
    expect(atlas.consumeFullRefresh()).toBe(false);
  });
});

describe('integer physical cell metrics', () => {
  it('snaps CSS cell sizes with Math.round at DPR 1, 1.5, and 2', () => {
    const css = { cellCssW: 9, cellCssH: 17 };
    expect(snapCellMetrics({ ...css, dpr: 1 })).toEqual({ cellPxW: 9, cellPxH: 17 });
    // 13.5 and 25.5 round half up, as Math.round does.
    expect(snapCellMetrics({ ...css, dpr: 1.5 })).toEqual({ cellPxW: 14, cellPxH: 26 });
    expect(snapCellMetrics({ ...css, dpr: 2 })).toEqual({ cellPxW: 18, cellPxH: 34 });
    expect(snapCellMetrics({ cellCssW: 8.4, cellCssH: 16.8, dpr: 1.25 })).toEqual({
      cellPxW: Math.round(8.4 * 1.25),
      cellPxH: Math.round(16.8 * 1.25),
    });
  });

  it('never yields a fractional cell size for any fractional DPR', () => {
    for (let step = 50; step <= 400; step += 1) {
      const dpr = step / 100;
      const { cellPxW, cellPxH } = snapCellMetrics({ cellCssW: 8.4, cellCssH: 17.3, dpr });
      expect(Number.isInteger(cellPxW) && Number.isInteger(cellPxH), `dpr ${String(dpr)}`).toBe(true);
      expect(cellPxW).toBe(Math.round(8.4 * dpr));
      expect(cellPxH).toBe(Math.round(17.3 * dpr));
    }
  });

  it('rejects non-finite, non-positive, and out-of-domain host metrics', () => {
    const code = 'GEORDI_E_BIJOU_INVALID_CELL_METRICS';
    for (const dpr of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectCode(() => snapCellMetrics({ cellCssW: 8, cellCssH: 16, dpr }), code, 'cellMetrics.dpr');
    }
    expectCode(() => snapCellMetrics({ cellCssW: 0, cellCssH: 16, dpr: 1 }), code, 'cellMetrics.cellCssW');
    expectCode(
      () => snapCellMetrics({ cellCssW: 8, cellCssH: Number.NaN, dpr: 1 }),
      code,
      'cellMetrics.cellCssH',
    );
    // Snaps to 0 and to 257: outside the ABI cell domain 1..256.
    expectCode(() => snapCellMetrics({ cellCssW: 0.4, cellCssH: 16, dpr: 1 }), code, 'cellMetrics.cellPxW');
    expectCode(() => snapCellMetrics({ cellCssW: 8, cellCssH: 128.5, dpr: 2 }), code, 'cellMetrics.cellPxH');
  });
});

describe('GlyphAtlas invalidation', () => {
  it('re-rasterizes at each integer cell size as DPR moves 1 -> 1.5 -> 2, bumping generation each time', () => {
    const rasterizer = fakeRasterizer();
    const css = { cellCssW: 9, cellCssH: 17 };
    const metricsAt = (dpr: number): GlyphAtlasMetrics => ({
      ...snapCellMetrics({ ...css, dpr }),
      fontIdentity: `fake-font ${String(Math.round(14 * dpr))}px`,
    });
    const atlas = atlasOf(rasterizer, 4, 2, metricsAt(1));
    const at1 = must(atlas.resolve('A', false));
    atlas.resolve('B', false);
    atlas.takeDirtyRects();
    expect(atlas.bitmap.rgba).toHaveLength(4 * 9 * 2 * 17 * 4);

    const expected = [
      { dpr: 1.5, cellPxW: 14, cellPxH: 26 },
      { dpr: 2, cellPxW: 18, cellPxH: 34 },
    ];
    let generation = atlas.generation;
    for (const { dpr, cellPxW, cellPxH } of expected) {
      atlas.invalidate(metricsAt(dpr), 'dpr-change');
      generation += 1;
      expect(atlas.generation).toBe(generation);
      expect(atlas.lastInvalidation).toEqual({ generation, reason: 'dpr-change' });
      expect(atlas.metrics).toEqual(metricsAt(dpr));
      expect(atlas.bitmap).toMatchObject({ cellPxW, cellPxH, atlasCols: 4, atlasRows: 2 });
      expect(atlas.bitmap.rgba).toHaveLength(4 * cellPxW * 2 * cellPxH * 4);
      expect(atlas.bitmap.rgba.every((value) => value === 0)).toBe(true);
      expect(atlas.getStats()).toMatchObject({ usedSlots: 0, cellPxW, cellPxH });
      expect(atlas.consumeFullRefresh()).toBe(true);
      expect(atlas.takeDirtyRects()).toEqual([{ x: 0, y: 0, width: 4 * cellPxW, height: 2 * cellPxH }]);
      expect(atlas.isCurrent(at1)).toBe(false);

      // 'B' first this time: slot order belongs to the new generation only.
      const b = must(atlas.resolve('B', false));
      const a = must(atlas.resolve('A', false));
      expect([b.slot, a.slot]).toEqual([0, 1]);
      expect(rasterizer.calls.at(-1)).toEqual(requestFor('A', false, metricsAt(dpr)));
      expect(slotTexels(atlas, a.slot)).toEqual(expectedMonoTexels(requestFor('A', false, metricsAt(dpr))));
      expect(atlas.takeDirtyRects()).toEqual([{ x: 0, y: 0, width: 2 * cellPxW, height: cellPxH }]);
    }
  });

  it('flushes glyphs cached before a web font arrived when the font-ready invalidation fires', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);
    const early = must(atlas.resolve('A', false));
    const fallbackTexels = slotTexels(atlas, early.slot);

    // The web font lands: the same request now rasterizes differently.
    rasterizer.salt = 101;
    expect(atlas.resolve('A', false)).toEqual(early);
    expect(slotTexels(atlas, early.slot)).toEqual(fallbackTexels);

    atlas.invalidate(undefined, 'font-ready');
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(atlas.lastInvalidation).toEqual({
      generation: GLYPH_ATLAS_FIRST_GENERATION + 1,
      reason: 'font-ready',
    });
    expect(atlas.metrics).toEqual(METRICS);
    expect(atlas.needsFullRefresh).toBe(true);
    expect(atlas.isCurrent(early)).toBe(false);
    expect(atlas.getStats().usedSlots).toBe(0);

    const late = must(atlas.resolve('A', false));
    expect(late.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(slotTexels(atlas, late.slot)).toEqual(expectedMonoTexels(requestFor('A', false), 101));
    expect(slotTexels(atlas, late.slot)).not.toEqual(fallbackTexels);
  });

  it('accepts a partial metrics update and defaults the reason', () => {
    const atlas = atlasOf(fakeRasterizer());
    atlas.invalidate({ fontIdentity: 'other-font 6px' });
    expect(atlas.metrics).toEqual({ ...METRICS, fontIdentity: 'other-font 6px' });
    expect(atlas.lastInvalidation?.reason).toBe('metrics-change');
    atlas.invalidate();
    expect(atlas.lastInvalidation?.reason).toBe('manual');
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 2);
  });

  it('rejects fractional or out-of-domain metrics and leaves the atlas untouched', () => {
    const atlas = atlasOf(fakeRasterizer());
    const a = must(atlas.resolve('A', false));
    const code = 'GEORDI_E_BIJOU_INVALID_CELL_METRICS';
    for (const update of [{ cellPxW: 13.5 }, { cellPxH: 0 }, { cellPxW: 257 }]) {
      expectCode(() => {
        atlas.invalidate(update);
      }, code);
    }
    expectCode(() => {
      atlas.invalidate({ fontIdentity: '' });
    }, 'GEORDI_E_BIJOU_INVALID_ATLAS');
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(atlas.metrics).toEqual(METRICS);
    expect(atlas.isCurrent(a)).toBe(true);
    expect(atlas.needsFullRefresh).toBe(false);
  });
});

describe('GlyphAtlas diagnostics', () => {
  it('reports slot occupancy, generation, and asset metadata through getStats()', () => {
    const atlas = atlasOf(fakeRasterizer(), 4, 2);
    expect(atlas.getStats()).toEqual({
      generation: GLYPH_ATLAS_FIRST_GENERATION,
      usedSlots: 0,
      capacity: 8,
      monoCount: 0,
      colorEmojiCount: 0,
      atlasCols: 4,
      atlasRows: 2,
      cellPxW: 4,
      cellPxH: 6,
      fontIdentity: 'fake-font 6px',
    });

    atlas.resolve('A', false);
    atlas.resolve('A', true);
    atlas.resolve(TEST_GLYPH_COLOR_HEART, false);
    atlas.resolve('A', false);
    const stats = atlas.getStats();
    expect(stats).toMatchObject({ usedSlots: 3, capacity: 8, monoCount: 2, colorEmojiCount: 1 });
    expect(stats.usedSlots).toBe(stats.monoCount + stats.colorEmojiCount);
    expect(Object.isFrozen(stats)).toBe(true);

    atlas.invalidate(undefined, 'font-ready');
    expect(atlas.getStats()).toMatchObject({
      generation: GLYPH_ATLAS_FIRST_GENERATION + 1,
      usedSlots: 0,
      monoCount: 0,
      colorEmojiCount: 0,
    });
  });

  it('produces receipt asset fields that validate inside a geordi-bijou-gpu-receipt/1', () => {
    const { suite, paint, pack } = renderSuite();
    const atlas = createGlyphAtlas({
      rasterizer: fakeRasterizer(),
      atlasCols: 4,
      atlasRows: 2,
      metrics: { cellPxW: paint.cellPxW, cellPxH: paint.cellPxH, fontIdentity: pack.fontIdentity },
    });
    atlas.resolve('A', false);
    atlas.resolve(TEST_GLYPH_COLOR_HEART, false);
    atlas.invalidate(undefined, 'font-ready');
    atlas.resolve('A', false);
    atlas.resolve('A', true);
    atlas.resolve(TEST_GLYPH_COLOR_HEART, true);

    const assets = atlas.getReceiptAssets();
    expect(assets).toEqual({
      atlasGeneration: GLYPH_ATLAS_FIRST_GENERATION + 1,
      atlasStats: { usedSlots: 3, capacity: 8, monoCount: 2, colorEmojiCount: 1 },
      fontIdentity: pack.fontIdentity,
      cellPx: { width: paint.cellPxW, height: paint.cellPxH },
    });

    const receipt: EndpointReceipt = {
      receiptVersion: 'geordi-bijou-gpu-receipt/1',
      gpuAbiVersion: 'bijou-surface-gpu/1',
      cellFormatId: 'bijou-packed-cell-u8x10-le/1',
      inputReceiptSha256: suiteFrame(suite, 'paint').inputReceiptSha256,
      preparedBufferSha256: paint.preparedBufferSha256,
      proceduralTableSha256: '7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46',
      bunnyPrimitives: [
        {
          contractId: 'bunny-u32-div-round-even/1',
          bunnyCommit: '3b7fbad',
          wgslSha256: 'ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f',
          vectorsSha256: 'df265cc7233772e33347b04fa1f7a3e71f34566e4aa6af5cf3fecf23e2b044a6',
        },
        {
          contractId: 'bunny-u32-ellipse-classify/1',
          bunnyCommit: '292a2c3',
          wgslSha256: '1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99',
          vectorsSha256: '5f0ec6422de185e2ce7e832a7c1bce7ccde9b6f33e92b399f7c547191ef205e4',
        },
      ],
      assembledWgslSha256: null,
      generatedGlslSha256: null,
      shaderSha256: null,
      executedArtifactSha256: '3'.repeat(64),
      backendProfile: 'geordi-canvas2d/1',
      adapter: { backend: 'canvas2d', name: '', driver: '' },
      evidenceLevel: 'unit-upload',
      widthCells: paint.widthCells,
      heightCells: paint.heightCells,
      canvasPxW: paint.canvasPxW,
      canvasPxH: paint.canvasPxH,
      dpr: 1,
      defaultFg: paint.defaultFg,
      defaultBg: paint.defaultBg,
      ...assets,
      frameRgbaSha256: null,
      probePolicy: 'integer-canonical-exact',
      probes: [],
    };
    const validation = validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt)));
    expect(validation.ok ? [] : validation.issues).toEqual([]);
  });
});

describe('GlyphAtlas edges and refusals', () => {
  it('handles the empty string safely: no slot, no raster, no state change', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);
    expect(atlas.resolve('', false)).toBeUndefined();
    expect(atlas.resolve('', true)).toBeUndefined();
    expect(atlas.resolveSlot('', FLAG_BOLD)).toBeUndefined();
    expect(rasterizer.calls).toEqual([]);
    expect(atlas.dirtyRects).toEqual([]);
    expect(atlas.getStats()).toMatchObject({ usedSlots: 0, generation: GLYPH_ATLAS_FIRST_GENERATION });
  });

  it('refuses width-2 graphemes in strict canonical mode with a typed error and no state change', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);
    for (const wide of ['漢', '\u{1f600}', '❤️']) {
      expectCode(
        () => atlas.resolve(wide, false),
        'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
        'glyphAtlas.resolve.grapheme',
      );
    }
    expect(rasterizer.calls).toEqual([]);
    expect(atlas.getStats().usedSlots).toBe(0);
  });

  it('refuses text that is not one terminal-safe grapheme in strict canonical mode', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);
    for (const unsafe of ['AB', '\u001b', '́', '\ud800']) {
      expectCode(
        () => atlas.resolve(unsafe, false),
        'GEORDI_E_BIJOU_INVALID_PACKED_CELLS',
        'glyphAtlas.resolve.grapheme',
      );
    }
    expect(rasterizer.calls).toEqual([]);
    // The RE-510 width-1 glyphs are accepted.
    expect(must(atlas.resolve('é', false)).slot).toBe(0);
    expect(must(atlas.resolve('', false)).slot).toBe(1);
  });

  it('rasterizes a width-2 grapheme into one cell only when strict canonical mode is off', () => {
    const rasterizer = fakeRasterizer();
    const atlas = createGlyphAtlas({
      rasterizer,
      atlasCols: 2,
      atlasRows: 2,
      metrics: METRICS,
      strictCanonical: false,
    });
    expect(must(atlas.resolve('漢', false)).slot).toBe(0);
    expect(rasterizer.calls).toEqual([requestFor('漢', false)]);
    expect(atlas.dirtyRects).toEqual([{ x: 0, y: 0, width: 4, height: 6 }]);
  });

  it('rejects a raster of the wrong size or with non-byte values, consuming no slot', () => {
    let output: ArrayLike<number> = new Uint8ClampedArray(4 * 6 * 4 - 4);
    const atlas = atlasOf({ rasterize: () => output }, 1, 1);
    expectCode(() => atlas.resolve('A', false), 'GEORDI_E_BIJOU_INVALID_ATLAS', 'glyphAtlas.rasterizer.rgba');
    output = Array.from({ length: 4 * 6 * 4 }, (_, index) => (index === 5 ? 256 : 0));
    expectCode(() => atlas.resolve('A', false), 'GEORDI_E_BIJOU_INVALID_ATLAS', 'glyphAtlas.rasterizer.rgba[5]');
    output = Array.from({ length: 4 * 6 * 4 }, (_, index) => (index === 9 ? 0.5 : 0));
    expectCode(() => atlas.resolve('A', false), 'GEORDI_E_BIJOU_INVALID_ATLAS', 'glyphAtlas.rasterizer.rgba[9]');
    expect(atlas.getStats().usedSlots).toBe(0);
    expect(atlas.dirtyRects).toEqual([]);

    // A full atlas is not evicted by a raster that fails.
    output = new Uint8ClampedArray(4 * 6 * 4).fill(255);
    const kept = must(atlas.resolve('A', false));
    output = new Uint8ClampedArray(3);
    expectCode(() => atlas.resolve('B', false), 'GEORDI_E_BIJOU_INVALID_ATLAS');
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(atlas.isCurrent(kept)).toBe(true);
  });

  it('rejects invalid atlas options', () => {
    const rasterizer = fakeRasterizer();
    const make = (atlasCols: number, atlasRows: number, metrics: GlyphAtlasMetrics = METRICS) => () =>
      createGlyphAtlas({ rasterizer, atlasCols, atlasRows, metrics });
    expectCode(make(0, 1), 'GEORDI_E_BIJOU_INVALID_ATLAS', 'glyphAtlas.atlasCols');
    expectCode(make(1, 1.5), 'GEORDI_E_BIJOU_INVALID_ATLAS', 'glyphAtlas.atlasRows');
    // 257 * 256 = 65792 slots do not fit the 16-bit glyph payload.
    expectCode(make(257, 256), 'GEORDI_E_BIJOU_INVALID_ATLAS', 'glyphAtlas.capacity');
    expectCode(make(1, 1, { ...METRICS, cellPxW: 0 }), 'GEORDI_E_BIJOU_INVALID_CELL_METRICS');
    expectCode(make(1, 1, { ...METRICS, cellPxH: 12.5 }), 'GEORDI_E_BIJOU_INVALID_CELL_METRICS');
    expectCode(make(1, 1, { ...METRICS, fontIdentity: '' }), 'GEORDI_E_BIJOU_INVALID_ATLAS');
    expect(createGlyphAtlas({ rasterizer, atlasCols: 256, atlasRows: 256, metrics: { ...METRICS, cellPxW: 1, cellPxH: 1 } }).getStats().capacity).toBe(65536);
  });
});

describe('GlyphAtlas fuzz and stress', () => {
  it('survives capacity * 3 distinct graphemes with valid slots, monotonic generation, and no stale hits', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer, 5, 3);
    const capacity = atlas.getStats().capacity;
    const graphemes = distinctGraphemes(capacity * 3);
    let lastGeneration = atlas.generation;
    const live = new Map<string, GlyphAtlasSlotRef>();

    graphemes.forEach((grapheme, index) => {
      const bold = index % 4 === 0;
      const ref = must(atlas.resolve(grapheme, bold));
      expect(ref.slot).toBeGreaterThanOrEqual(0);
      expect(ref.slot).toBeLessThan(capacity);
      expect(Number.isInteger(ref.slot)).toBe(true);
      expect(atlas.generation).toBeGreaterThanOrEqual(lastGeneration);
      expect(ref.generation).toBe(atlas.generation);
      if (atlas.generation !== lastGeneration) {
        // Every ref handed out before the reset is now stale.
        for (const stale of live.values()) {
          expect(atlas.isCurrent(stale)).toBe(false);
        }
        live.clear();
        expect(ref.slot).toBe(0);
        lastGeneration = atlas.generation;
      }
      live.set(keyOf(grapheme, bold), ref);

      // No two live keys share a slot, and every live slot holds its own glyph.
      expect(new Set([...live.values()].map((item) => item.slot)).size).toBe(live.size);
      expect(atlas.getStats().usedSlots).toBe(live.size);
    });

    // Exactly two resets: capacity * 3 inserts fill the atlas three times.
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 2);
    expect(rasterizer.calls).toHaveLength(capacity * 3);
  });

  it('holds its invariants under a seeded random mix of hits, misses, and invalidations', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer, 3, 3);
    const capacity = atlas.getStats().capacity;
    const pool = [...distinctGraphemes(capacity * 2), TEST_GLYPH_COLOR_HEART];
    let state = 0x2545f491;
    const next = (bound: number): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % bound;
    };
    const live = new Map<string, { ref: GlyphAtlasSlotRef; request: GlyphRasterRequest }>();
    let lastGeneration = atlas.generation;
    let staleHits = 0;

    for (let step = 0; step < 2000; step += 1) {
      if (next(97) === 0) {
        atlas.invalidate(undefined, 'font-ready');
      }
      const grapheme = pool[next(pool.length)] ?? 'A';
      const bold = next(2) === 1;
      const callsBefore = rasterizer.calls.length;
      const ref = must(atlas.resolve(grapheme, bold));
      if (atlas.generation !== lastGeneration) {
        expect(atlas.generation).toBeGreaterThan(lastGeneration);
        lastGeneration = atlas.generation;
        live.clear();
      }
      const key = keyOf(grapheme, bold);
      const known = live.get(key);
      if (known === undefined) {
        // A miss in this generation must rasterize; it can never reuse a slot
        // remembered from an earlier generation.
        if (rasterizer.calls.length !== callsBefore + 1) {
          staleHits += 1;
        }
        live.set(key, { ref, request: requestFor(grapheme, bold) });
      } else {
        expect(ref).toEqual(known.ref);
        expect(rasterizer.calls.length).toBe(callsBefore);
      }
      expect(ref.generation).toBe(atlas.generation);
      expect(ref.slot).toBeLessThan(capacity);
      expect(ref.kind).toBe(grapheme === TEST_GLYPH_COLOR_HEART ? 'color' : 'mono');
    }

    expect(staleHits).toBe(0);
    // Every slot still live holds the texels of the glyph that owns it.
    for (const { ref, request } of live.values()) {
      if (ref.kind === 'mono') {
        expect(slotTexels(atlas, ref.slot)).toEqual(expectedMonoTexels(request));
      }
    }
    const stats = atlas.getStats();
    expect(stats.usedSlots).toBe(live.size);
    expect(stats.usedSlots).toBe(stats.monoCount + stats.colorEmojiCount);
    expect(stats.usedSlots).toBeLessThanOrEqual(capacity);
  });
});

describe('GlyphAtlas core purity', () => {
  it('names no browser global in the core module source', () => {
    const source = readFileSync(fileURLToPath(new URL('./glyph-atlas.ts', import.meta.url)), 'utf8');
    const browserGlobals =
      /\b(?:window|document|navigator|globalThis|self|OffscreenCanvas|HTMLCanvasElement|CanvasRenderingContext2D|ImageData|matchMedia|devicePixelRatio|ResizeObserver|requestAnimationFrame|FontFace)\b/u;
    const offending = source.split('\n').filter((line) => browserGlobals.test(line));
    expect(offending).toEqual([]);
    expect(source).not.toMatch(/from '\.\/glyph-atlas-browser\.js'/u);
  });

  it('runs where no DOM exists', () => {
    expect(typeof Reflect.get(globalThis, 'document')).toBe('undefined');
    expect(typeof Reflect.get(globalThis, 'window')).toBe('undefined');
    expect(typeof Reflect.get(globalThis, 'OffscreenCanvas')).toBe('undefined');
    const atlas = atlasOf(fakeRasterizer());
    expect(must(atlas.resolve('A', false)).slot).toBe(0);
  });
});

/** A one-row live surface: one glyph per cell, `''` for an empty cell. */
function rowSurface(cells: readonly (string | readonly [string, number])[], dirty: readonly number[]): GpuPackedSurface {
  const buffer = new Uint8Array(cells.length * CELL_STRIDE);
  const renderDirtyWords = new Uint32Array(Math.ceil(cells.length / 32));
  cells.forEach((cell, index) => {
    const [glyph, flags] = typeof cell === 'string' ? [cell, 0] : cell;
    const code = glyph === '' ? 0x20 : glyph.charCodeAt(0);
    buffer.set([code & 0xff, code >>> 8, 0, 0, 0, 0, 0, 0, flags, 63], index * CELL_STRIDE);
  });
  for (const cell of dirty) {
    renderDirtyWords[cell >>> 5] = ((renderDirtyWords[cell >>> 5] ?? 0) | (1 << (cell & 31))) >>> 0;
  }
  return { width: cells.length, height: 1, buffer, sideTable: [], renderDirtyWords };
}

/** The whole-grid reference lowering against the atlas as it stands now. */
function referenceWords(surface: GpuPackedSurface, atlas: GlyphAtlas): number[] {
  return Array.from(prepareReferenceCells(referenceSurfaceFromPackedSurface(surface), atlas.toSlotMap()));
}

describe('GlyphAtlas as the dirty-union packer\'s atlas', () => {
  it('is a SurfaceDamageOptions: resolveSlot is a ResolveGlyphSlot and atlasGeneration reads generation', () => {
    const atlas = atlasOf(fakeRasterizer());
    const options: SurfaceDamageOptions = atlas;
    const resolveSlot: ResolveGlyphSlot = atlas.resolveSlot;
    expect(options.atlasGeneration?.()).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(resolveSlot('A', FLAG_BOLD)).toEqual({ slot: 0, kind: 'mono', generation: 1 });
    atlas.invalidate();
    expect(atlas.atlasGeneration()).toBe(atlas.generation);
    expect(atlas.atlasGeneration()).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
  });

  it('packs a first frame whose words match the reference lowering, kind bits included', () => {
    const atlas = atlasOf(fakeRasterizer());
    const empty = rowSurface(['', '', '', ''], []);
    const target = rowSurface(['A', ['A', FLAG_BOLD], TEST_GLYPH_COLOR_HEART, ''], [0, 1, 2]);
    const result = packSurfaceDamage(createSurfaceDamageState(), empty, target, atlas);

    expect(result.fullRefresh).toBe(true);
    expect(Array.from(result.staging)).toEqual(referenceWords(target, atlas));
    expect([0, 1, 2, 3].map((cell) => result.staging[cell * 4])).toEqual([
      0x00010000, 0x00010001, 0x00020002, 0x00000000,
    ]);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
  });

  it('repacks the whole grid when the atlas overflows in the middle of a first pack', () => {
    const atlas = atlasOf(fakeRasterizer(), 2, 2);
    for (const grapheme of ['X', 'Y', 'Z']) {
      atlas.resolve(grapheme, false);
    }
    const target = rowSurface(['A', 'B', 'C'], [0, 1, 2]);
    const result = packSurfaceDamage(createSurfaceDamageState(), rowSurface(['', '', ''], []), target, atlas);

    // 'A' took the last free slot (3); 'B' overflowed and reset the atlas, so
    // slot 3 from the abandoned pass must not survive in the staging buffer.
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(result.fullRefresh).toBe(true);
    expect([0, 1, 2].map((cell) => result.staging[cell * 4])).toEqual([0x00010002, 0x00010000, 0x00010001]);
    expect(Array.from(result.staging)).toEqual(referenceWords(target, atlas));
    expect(atlas.getStats()).toMatchObject({ usedSlots: 3, capacity: 4 });
  });

  it('discards an incremental pack and repacks when one new glyph overflows the atlas', () => {
    const atlas = atlasOf(fakeRasterizer(), 2, 2);
    const state = createSurfaceDamageState();
    const frame1 = rowSurface(['A', 'B', 'C', ''], [0, 1, 2]);
    packSurfaceDamage(state, rowSurface(['', '', '', ''], []), frame1, atlas);
    const frame2 = rowSurface(['A', 'B', 'C', 'D'], [3]);
    const second = packSurfaceDamage(state, frame1, frame2, atlas);
    expect(second.fullRefresh).toBe(false);
    expect(atlas.getStats().usedSlots).toBe(4);
    const beforeOverflow = Array.from(second.staging);

    // One changed cell, one unseen glyph, a full atlas.
    const frame3 = rowSurface(['A', 'B', 'C', 'E'], [3]);
    const third = packSurfaceDamage(state, frame2, frame3, atlas);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(third.fullRefresh).toBe(true);
    expect(third.fullRefreshReason).toBe('atlas-generation');
    expect(third.dirtyRowSpans).toEqual([{ minRow: 0, maxRow: 0 }]);
    // 'E' reset the atlas and took slot 0, which 'A' held. The three clean
    // cells were re-slotted too; keeping their old words would draw 'E' for 'A'.
    expect([0, 1, 2, 3].map((cell) => beforeOverflow[cell * 4])).toEqual([
      0x00010000, 0x00010001, 0x00010002, 0x00010003,
    ]);
    expect([0, 1, 2, 3].map((cell) => third.staging[cell * 4])).toEqual([
      0x00010001, 0x00010002, 0x00010003, 0x00010000,
    ]);
    expect(Array.from(third.staging)).toEqual(referenceWords(frame3, atlas));
  });

  it('forces a full repack after a font-ready invalidation with no dirty cells', () => {
    const rasterizer = fakeRasterizer();
    const atlas = atlasOf(rasterizer);
    const state = createSurfaceDamageState();
    const frame = rowSurface(['B', 'A'], [0, 1]);
    packSurfaceDamage(state, rowSurface(['', ''], []), frame, atlas);
    const clean = rowSurface(['B', 'A'], []);
    expect(packSurfaceDamage(state, frame, clean, atlas).fullRefresh).toBe(false);

    atlas.invalidate(undefined, 'font-ready');
    const after = packSurfaceDamage(state, clean, clean, atlas);
    expect(after.fullRefresh).toBe(true);
    expect(after.fullRefreshReason).toBe('atlas-generation');
    expect(Array.from(after.staging)).toEqual(referenceWords(clean, atlas));
    expect(rasterizer.calls.filter((call) => call.grapheme === 'A')).toHaveLength(2);
  });

  it('lets the packer refuse a frame with more distinct glyphs than the atlas holds', () => {
    const atlas = atlasOf(fakeRasterizer(), 2, 1);
    const target = rowSurface(['A', 'B', 'C'], [0, 1, 2]);
    expectCode(
      () => packSurfaceDamage(createSurfaceDamageState(), rowSurface(['', '', ''], []), target, atlas),
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      'atlasGeneration',
    );
  });
});
