import { expect, test } from '@playwright/test';

import type { BijouGpuProbeHarness } from '../harness/main.js';
import { createTestGlyphPack, PROCEDURAL_GLYPH_TABLE_SHA256 } from '../src/index.js';
import { loadSuite, renderSuite, suiteCell } from '../test/support.js';

declare global {
  interface Window {
    __geordiBijouGpuHarness?: BijouGpuProbeHarness;
    __geordiBijouGpuHarnessError?: string;
  }
}

test.describe('bijou-surface-gpu/1 shared browser probe harness', () => {
  test('boots cleanly with the bundled test glyph pack and reproduces the oracle goldens', async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push(`console.error: ${message.text()}`);
      }
    });

    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-harness', 'ready');
    expect(await page.evaluate(() => window.__geordiBijouGpuHarnessError ?? null)).toBeNull();

    const state = await page.evaluate(() => {
      const harness = window.__geordiBijouGpuHarness;
      if (harness === undefined) {
        return null;
      }
      return {
        ready: harness.ready,
        harnessVersion: harness.harnessVersion,
        fontIdentity: harness.fontIdentity,
        atlasRgbaSha256: harness.atlasRgbaSha256,
        proceduralTableSha256: harness.proceduralTableSha256,
        cellPx: [harness.cellPxW, harness.cellPxH],
        canvasPx: [harness.canvasPxW, harness.canvasPxH],
        frames: harness.frames,
      };
    });

    const suite = loadSuite();
    const pack = createTestGlyphPack();
    expect(state).toEqual({
      ready: true,
      harnessVersion: 'geordi-bijou-gpu-probe-harness/1',
      fontIdentity: pack.fontIdentity,
      atlasRgbaSha256: pack.atlasRgbaSha256,
      proceduralTableSha256: PROCEDURAL_GLYPH_TABLE_SHA256,
      cellPx: [suite.cellPxW, suite.cellPxH],
      canvasPx: [suite.canvasPxW, suite.canvasPxH],
      // The oracle run inside the browser engine must hash to the same
      // goldens as the Node run recorded in the suite manifest.
      frames: suite.frames.map((frame) => ({
        id: frame.id,
        inputReceiptSha256: frame.inputReceiptSha256,
        preparedBufferSha256: frame.preparedBufferSha256,
        frameRgbaSha256: frame.frameRgbaSha256,
      })),
    });
    expect(problems).toEqual([]);
  });

  test('reference canvas pixels equal the oracle for the paint and erase frames', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-harness', 'ready');

    const { suite, paint, erase } = renderSuite();
    const canvas = page.locator('#bijou-gpu-reference');
    await expect(canvas).toHaveJSProperty('width', suite.canvasPxW);
    await expect(canvas).toHaveJSProperty('height', suite.canvasPxH);

    const points: (readonly [number, number])[] = [
      [suite.canvasPxW - 1, suite.canvasPxH - 1],
      ...['glyph-ascii-a', 'modifier-dim', 'block-shade-medium', 'box-arc-down-right', 'braille-all-dots'].flatMap(
        (id) => {
          const cell = suiteCell(suite, id);
          const originX = cell.col * suite.cellPxW;
          const originY = cell.row * suite.cellPxH;
          return [
            [originX, originY],
            [originX + 3, originY + 3],
            [originX + 1, originY + 1],
            [originX + 5, originY + 7],
          ] as const;
        },
      ),
    ];

    for (const [frameId, nodeFrame] of [
      ['paint', paint],
      ['erase', erase],
    ] as const) {
      const sampled = await page.evaluate(
        ({ id, pixels }) => {
          const harness = window.__geordiBijouGpuHarness;
          if (harness === undefined) {
            return null;
          }
          harness.showFrame(id);
          return pixels.map(([px, py]) => ({
            oracle: Array.from(harness.oraclePixel(id, px, py)),
            canvas: Array.from(harness.canvasPixel(px, py)),
          }));
        },
        { id: frameId, pixels: points },
      );
      const expected = points.map(([px, py]) => {
        const offset = (py * nodeFrame.canvasPxW + px) * 4;
        const rgba = Array.from(nodeFrame.rgba.subarray(offset, offset + 4));
        return { oracle: rgba, canvas: rgba };
      });
      expect(sampled, frameId).toEqual(expected);
      await expect(canvas).toHaveAttribute('data-frame', frameId);
    }
  });
});
