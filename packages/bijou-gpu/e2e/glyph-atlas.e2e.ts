import { expect, test, type Page } from '@playwright/test';

import type { GlyphAtlasProbe, GlyphAtlasProbeSlot } from '../harness/glyph-atlas.js';

declare global {
  interface Window {
    __geordiGlyphAtlasProbe?: GlyphAtlasProbe;
    __geordiGlyphAtlasProbeError?: string;
  }
}

class GlyphAtlasProbeMissingError extends Error {
  constructor() {
    super('window.__geordiGlyphAtlasProbe is missing');
    this.name = new.target.name;
  }
}

const PROBE_FAMILY = 'GeordiProbe, monospace';

async function openProbe(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console.error: ${message.text()}`);
    }
  });
  await page.goto('/glyph-atlas.html');
  await expect(page.locator('body')).toHaveAttribute('data-glyph-atlas-probe', 'ready');
  expect(await page.evaluate(() => window.__geordiGlyphAtlasProbeError ?? null)).toBeNull();
  // Let the initial document.fonts.ready settle while the atlas is still empty,
  // so a later font-ready flush can only come from a font the test loads.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return problems;
}

function probeState(page: Page) {
  return page.evaluate(() => {
    const probe = window.__geordiGlyphAtlasProbe;
    return probe === undefined ? null : probe.state();
  });
}

function resolveGlyph(page: Page, grapheme: string, bold: boolean) {
  return page.evaluate(
    ([text, isBold]) => window.__geordiGlyphAtlasProbe?.resolve(text, isBold) ?? null,
    [grapheme, bold] as const,
  );
}

function slotOf(value: GlyphAtlasProbeSlot | string | null): GlyphAtlasProbeSlot {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  if (value === null || typeof value === 'string') {
    throw new GlyphAtlasProbeMissingError();
  }
  return value;
}

/**
 * Change the device pixel ratio of a live page, as moving to another monitor
 * does.
 *
 * Two properties of Chrome's DevTools emulation shape this helper. The
 * override lasts only as long as its session, so one session is kept for the
 * whole test. And a scale-only override does not re-evaluate media queries
 * after the first one, so each step also moves the viewport width by a pixel,
 * which does.
 */
async function devicePixelRatioSetter(page: Page): Promise<(deviceScaleFactor: number) => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  let width = 1280;
  return async (deviceScaleFactor) => {
    width += 1;
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor,
      mobile: false,
    });
  };
}

test.describe('bijou-surface-gpu/1 glyph atlas browser adapter', () => {
  test('rasterizes host-font glyphs into integer-sized monochrome slots', async ({ page }) => {
    const problems = await openProbe(page);

    const initial = await probeState(page);
    expect(initial).toMatchObject({
      dpr: 1,
      watcherDpr: 1,
      generation: 1,
      metrics: { cellPxW: 9, cellPxH: 17, fontIdentity: `${PROBE_FAMILY} 14px` },
      rasterizerFontPx: 14,
      bitmapBytes: 8 * 9 * 4 * 17 * 4,
      needsFullRefresh: false,
      events: [],
    });

    const regular = slotOf(await resolveGlyph(page, 'A', false));
    const bold = slotOf(await resolveGlyph(page, 'A', true));
    expect(regular).toMatchObject({ slot: 0, kind: 'mono', generation: 1, chromatic: false });
    expect(bold).toMatchObject({ slot: 1, kind: 'mono', generation: 1, chromatic: false });
    // Real ink reached the atlas, and the bold face is heavier.
    expect(regular.inkedTexels).toBeGreaterThan(8);
    expect(regular.maxAlpha).toBeGreaterThan(128);
    expect(bold.alphaSum).toBeGreaterThan(regular.alphaSum);
    // A cache hit returns the same slot.
    expect(slotOf(await resolveGlyph(page, 'A', false))).toEqual(regular);

    expect(await page.evaluate(() => window.__geordiGlyphAtlasProbe?.takeDirtyRects())).toEqual([
      { x: 0, y: 0, width: 18, height: 17 },
    ]);
    expect(await resolveGlyph(page, '', false)).toBeNull();
    expect(await resolveGlyph(page, '漢', false)).toBe('GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH');
    expect(
      await page.evaluate(() => window.__geordiGlyphAtlasProbe?.defaultFactoryInkedTexels('A')),
    ).toBeGreaterThan(8);
    expect((await probeState(page))?.stats).toMatchObject({ usedSlots: 2, monoCount: 2, colorEmojiCount: 0 });
    expect(problems).toEqual([]);
  });

  test('tags a host colour emoji as a colour slot with premultiplied texels', async ({ page }) => {
    const problems = await openProbe(page);
    const [letter, emoji] = await page.evaluate(() => [
      window.__geordiGlyphAtlasProbe?.resolveLoose('A') ?? null,
      window.__geordiGlyphAtlasProbe?.resolveLoose('\u{1f600}') ?? null,
    ]);
    expect(slotOf(letter ?? null)).toMatchObject({ kind: 'mono', chromatic: false });
    const emojiSlot = slotOf(emoji ?? null);
    expect(emojiSlot).toMatchObject({ kind: 'color', chromatic: true, premultiplied: true });
    expect(emojiSlot.inkedTexels).toBeGreaterThan(8);
    expect(problems).toEqual([]);
  });

  for (const { deviceScaleFactor, cellPxW, cellPxH, fontPx } of [
    { deviceScaleFactor: 1, cellPxW: 9, cellPxH: 17, fontPx: 14 },
    { deviceScaleFactor: 1.5, cellPxW: 14, cellPxH: 26, fontPx: 21 },
    { deviceScaleFactor: 2, cellPxW: 18, cellPxH: 34, fontPx: 28 },
  ]) {
    test(`boots at device pixel ratio ${String(deviceScaleFactor)} with integer cell metrics`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ deviceScaleFactor });
      const page = await context.newPage();
      const problems = await openProbe(page);
      expect(await probeState(page)).toMatchObject({
        dpr: deviceScaleFactor,
        metrics: { cellPxW, cellPxH, fontIdentity: `${PROBE_FAMILY} ${String(fontPx)}px` },
        rasterizerFontPx: fontPx,
        bitmapBytes: 8 * cellPxW * 4 * cellPxH * 4,
      });
      const glyph = slotOf(await resolveGlyph(page, 'g', false));
      expect(glyph.inkedTexels).toBeGreaterThan(8);
      expect(await page.evaluate(() => window.__geordiGlyphAtlasProbe?.takeDirtyRects())).toEqual([
        { x: 0, y: 0, width: cellPxW, height: cellPxH },
      ]);
      expect(problems).toEqual([]);
      await context.close();
    });
  }

  test('a live device pixel ratio change 1 -> 1.5 -> 2 invalidates the atlas at snapped metrics', async ({
    page,
  }) => {
    const problems = await openProbe(page);
    const before = slotOf(await resolveGlyph(page, 'A', false));
    expect(before.generation).toBe(1);
    const setDevicePixelRatio = await devicePixelRatioSetter(page);

    const steps = [
      { deviceScaleFactor: 1.5, cellPxW: 14, cellPxH: 26, fontPx: 21, generation: 2 },
      { deviceScaleFactor: 2, cellPxW: 18, cellPxH: 34, fontPx: 28, generation: 3 },
    ];
    let previousAlphaSum = before.alphaSum;
    for (const step of steps) {
      await setDevicePixelRatio(step.deviceScaleFactor);
      await expect.poll(async () => (await probeState(page))?.generation).toBe(step.generation);
      const state = await probeState(page);
      expect(state).toMatchObject({
        dpr: step.deviceScaleFactor,
        watcherDpr: step.deviceScaleFactor,
        metrics: {
          cellPxW: step.cellPxW,
          cellPxH: step.cellPxH,
          fontIdentity: `${PROBE_FAMILY} ${String(step.fontPx)}px`,
        },
        rasterizerFontPx: step.fontPx,
        bitmapBytes: 8 * step.cellPxW * 4 * step.cellPxH * 4,
        needsFullRefresh: true,
        stats: { usedSlots: 0 },
      });
      expect(await page.evaluate(() => window.__geordiGlyphAtlasProbe?.consumeFullRefresh())).toBe(true);
      // The glyph is drawn again, larger, in the new generation.
      const redrawn = slotOf(await resolveGlyph(page, 'A', false));
      expect(redrawn).toMatchObject({ slot: 0, generation: step.generation });
      expect(redrawn.alphaSum).toBeGreaterThan(previousAlphaSum);
      previousAlphaSum = redrawn.alphaSum;
    }

    const events = (await probeState(page))?.events ?? [];
    expect(events.map((event) => [event.reason, event.dpr, event.generation])).toEqual([
      ['dpr-change', 1.5, 2],
      ['dpr-change', 2, 3],
    ]);
    expect(problems).toEqual([]);
  });

  test('a web font that loads after first use flushes the fallback glyphs', async ({ page }) => {
    const problems = await openProbe(page);
    // The probe family is not loaded yet, so this is the monospace fallback.
    const fallback = slotOf(await resolveGlyph(page, 'W', false));
    expect(fallback.generation).toBe(1);
    expect((await probeState(page))?.events).toEqual([]);

    expect(await page.evaluate(() => window.__geordiGlyphAtlasProbe?.loadProbeFont())).toBe('loaded');
    await expect.poll(async () => (await probeState(page))?.generation).toBe(2);
    const state = await probeState(page);
    expect(state).toMatchObject({ needsFullRefresh: true, stats: { usedSlots: 0 } });
    expect(state?.events.map((event) => event.reason)).toEqual(['font-ready']);

    const webFont = slotOf(await resolveGlyph(page, 'W', false));
    expect(webFont).toMatchObject({ slot: 0, kind: 'mono', generation: 2 });
    // Same key, different font, different pixels.
    expect(webFont.alphaSum).not.toBe(fallback.alphaSum);
    expect(problems).toEqual([]);
  });
});
