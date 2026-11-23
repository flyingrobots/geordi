import { parseJsonValue } from '@flyingrobots/geordi-core';
import { expect, test, type Page } from '@playwright/test';

import type { Canvas2DProbe, Canvas2DProbeFrameId, Canvas2DProbeResult } from '../harness/canvas2d.js';
import {
  assertBitExactFrameHash,
  createTestGlyphPack,
  parseEndpointReceipt,
  readPixel,
  renderReferenceRgba,
  type EndpointReceipt,
  type ReferenceFrame,
} from '../src/index.js';
import { renderSuite, suiteFrame } from '../test/support.js';

declare global {
  interface Window {
    __geordiCanvas2DProbe?: Canvas2DProbe;
    __geordiCanvas2DProbeError?: string;
  }
}

class Canvas2DProbeMissingError extends Error {
  constructor() {
    super('window.__geordiCanvas2DProbe is missing');
    this.name = new.target.name;
  }
}

async function openProbe(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console.error: ${message.text()}`);
    }
  });
  await page.goto('/canvas2d.html');
  await expect(page.locator('body')).toHaveAttribute('data-canvas2d-probe', 'ready');
  expect(await page.evaluate(() => window.__geordiCanvas2DProbeError ?? null)).toBeNull();
  return problems;
}

function receiptOf(result: Canvas2DProbeResult | null): EndpointReceipt {
  if (result === null) {
    throw new Canvas2DProbeMissingError();
  }
  // Validated outside the page, by the Node build of the kit's validator.
  return parseEndpointReceipt(parseJsonValue(result.receipt));
}

async function present(page: Page, frameId: Canvas2DProbeFrameId): Promise<Canvas2DProbeResult | null> {
  return page.evaluate((id) => window.__geordiCanvas2DProbe?.present(id) ?? null, frameId);
}

async function canvasRgba(page: Page): Promise<Uint8Array> {
  const pixels = await page.evaluate(() => window.__geordiCanvas2DProbe?.canvasRgba() ?? null);
  if (pixels === null) {
    throw new Canvas2DProbeMissingError();
  }
  return Uint8Array.from(pixels);
}

/** Labelled cells whose pixels differ between a canvas readback and an oracle frame. */
function mismatchedCells(
  rgba: Uint8Array,
  oracle: ReferenceFrame,
  cells: readonly { readonly id: string; readonly col: number; readonly row: number }[],
): string[] {
  const frame = { rgba, canvasPxW: oracle.canvasPxW, canvasPxH: oracle.canvasPxH };
  const bad: string[] = [];
  for (const cell of cells) {
    for (let ly = 0; ly < oracle.cellPxH; ly += 1) {
      for (let lx = 0; lx < oracle.cellPxW; lx += 1) {
        const px = cell.col * oracle.cellPxW + lx;
        const py = cell.row * oracle.cellPxH + ly;
        const actual = readPixel(frame, px, py);
        const expected = readPixel(oracle, px, py);
        if (actual.some((channel, index) => channel !== expected[index])) {
          bad.push(`${cell.id} (${String(lx)}, ${String(ly)}): [${actual.join(', ')}] != [${expected.join(', ')}]`);
          lx = oracle.cellPxW;
          ly = oracle.cellPxH;
        }
      }
    }
  }
  return bad;
}

test.describe('Canvas 2D presenter in a real browser', () => {
  test('presents the paint -> erase fixture bit-exactly to the CPU oracle, cell by cell and by frame hash', async ({
    page,
  }) => {
    const problems = await openProbe(page);
    const { suite, paint, erase } = renderSuite();
    const categories = ['color-', 'modifier-', 'underline-', 'opacity-', 'glyph-', 'box-', 'block-', 'braille-'];
    for (const prefix of categories) {
      expect(suite.cells.some((cell) => cell.id.startsWith(prefix)), prefix).toBe(true);
    }

    for (const [frameId, oracle] of [
      ['paint', paint],
      ['erase', erase],
    ] as const) {
      const result = await present(page, frameId);
      const receipt = receiptOf(result);
      // Pixel probes: every pixel of every labelled cell, then the whole frame.
      const rgba = await canvasRgba(page);
      expect(mismatchedCells(rgba, oracle, suite.cells), frameId).toEqual([]);
      expect(rgba, frameId).toEqual(oracle.rgba);
      expect(receipt.frameRgbaSha256, frameId).toBe(suiteFrame(suite, frameId).frameRgbaSha256);
      expect(result?.oracleSha256, `${frameId} oracle in the browser`).toBe(oracle.frameRgbaSha256);
      expect(receipt.inputReceiptSha256).toBe(suiteFrame(suite, frameId).inputReceiptSha256);
      assertBitExactFrameHash(receipt, oracle);
      for (const probe of receipt.probes) {
        expect(probe.rgba).toEqual(readPixel(oracle, probe.px, probe.py));
      }
      expect(receipt).toMatchObject({
        backendProfile: 'geordi-canvas2d/1',
        evidenceLevel: 'software-probed',
        shaderSha256: null,
        adapter: { backend: 'canvas2d', name: 'canvas2d-imagedata' },
      });
    }
    expect(problems).toEqual([]);
  });

  test('erased cells come back as the oracle erase frame, not as leftovers of the paint frame', async ({ page }) => {
    await openProbe(page);
    const { suite, paint, erase } = renderSuite();
    await present(page, 'paint');
    await present(page, 'erase');
    const rgba = await canvasRgba(page);
    const erased = suite.cells.filter((cell) => cell.id !== suite.retainedCellId);
    // The test is only meaningful if the erased cells looked different when painted.
    expect(mismatchedCells(paint.rgba, erase, erased).length).toBeGreaterThan(erased.length / 2);
    expect(mismatchedCells(rgba, erase, erased)).toEqual([]);
  });

  test('does not accumulate alpha when a partial-opacity cell is repainted over itself', async ({ page }) => {
    await openProbe(page);
    const result = await page.evaluate(() => window.__geordiCanvas2DProbe?.partialOpacityRepaints(21) ?? null);
    const receipt = receiptOf(result);
    expect(receipt.frameRgbaSha256).toBe(result?.oracleSha256);
  });

  test('redraws the whole frame bit-exactly after a DPR resize', async ({ page }) => {
    await openProbe(page);
    const { suite, paintReceipt, pack, table } = renderSuite();
    await present(page, 'paint');
    await page.evaluate(
      ([width, height]) => {
        window.__geordiCanvas2DProbe?.resize(width, height, 2);
      },
      [suite.canvasPxW, suite.canvasPxH] as const,
    );
    const result = await page.evaluate(() => window.__geordiCanvas2DProbe?.presentAgain() ?? null);
    const receipt = receiptOf(result);
    const oracle = renderReferenceRgba(paintReceipt, pack.atlasBitmap, pack.slotMap, table, {
      canvasPxW: suite.canvasPxW * 2,
      canvasPxH: suite.canvasPxH * 2,
      defaultFg: suite.defaultFg,
      defaultBg: suite.defaultBg,
    });
    expect([receipt.canvasPxW, receipt.canvasPxH, receipt.dpr]).toEqual([
      suite.canvasPxW * 2,
      suite.canvasPxH * 2,
      2,
    ]);
    expect(await canvasRgba(page)).toEqual(oracle.rgba);
    assertBitExactFrameHash(receipt, oracle);
  });

  test('presents glyphs the browser rasterized into a live GlyphAtlas bit-exactly against the oracle on the same atlas bytes', async ({
    page,
  }) => {
    await openProbe(page);
    const result = await page.evaluate(() => window.__geordiCanvas2DProbe?.liveAtlasFrame() ?? null);
    const receipt = receiptOf(result);
    expect(result?.usedSlots).toBeGreaterThanOrEqual(9);
    expect(result?.inkedTexels).toBeGreaterThan(0);
    expect(receipt.atlasStats.usedSlots).toBe(result?.usedSlots);
    expect(receipt.fontIdentity).not.toBe(createTestGlyphPack().fontIdentity);
    expect(receipt.frameRgbaSha256).toBe(result?.oracleSha256);
  });

  test('records the browser that produced the pixels in the receipt', async ({ page, browserName }) => {
    await openProbe(page);
    const result = await present(page, 'paint');
    const receipt = receiptOf(result);
    const userAgent = await page.evaluate(() => window.__geordiCanvas2DProbe?.userAgent ?? null);
    expect(browserName).toBe('chromium');
    expect(receipt.adapter.driver).toBe(userAgent);
    expect(receipt.adapter.driver).toMatch(/Chrome\/\d+/u);
  });
});
