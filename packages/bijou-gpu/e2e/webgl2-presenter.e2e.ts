import { parseJsonValue } from '@flyingrobots/geordi-core';
import { expect, test, type Page } from '@playwright/test';

import type { ProbeFrame, WebGL2Probe } from '../harness/webgl2.js';
import { renderSuite, suiteFrame, type RenderedSuite } from '../test/support.js';

declare global {
  interface Window {
    __geordiWebGL2Probe?: WebGL2Probe;
    __geordiWebGL2ProbeError?: string;
  }
}

class WebGL2ProbeMissingError extends Error {
  constructor() {
    super('window.__geordiWebGL2Probe is missing');
    this.name = new.target.name;
  }
}

const rendered: RenderedSuite = renderSuite();

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new WebGL2ProbeMissingError();
  }
  return value;
}

async function openProbe(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console.error: ${message.text()}`);
    }
  });
  await page.goto('/webgl2.html');
  await expect(page.locator('body')).toHaveAttribute('data-webgl2-probe', 'ready');
  expect(await page.evaluate(() => window.__geordiWebGL2ProbeError ?? null)).toBeNull();
  return problems;
}

/**
 * Record which adapter produced the pixels, so the evidence level of every
 * positive result is attached to the run: `software-probed` on SwiftShader or
 * any unnamed renderer, `gpu-probed` only on a named hardware renderer.
 */
async function recordEvidence(page: Page): Promise<string> {
  const renderer = await page.evaluate(() => {
    const probe = window.__geordiWebGL2Probe;
    if (probe === undefined) {
      return null;
    }
    return probe.renderer();
  });
  if (renderer === null) {
    throw new WebGL2ProbeMissingError();
  }
  test.info().annotations.push({
    type: 'evidence',
    description: `${renderer.probedEvidenceLevel} on "${renderer.name}" (${renderer.driver})`,
  });
  return renderer.probedEvidenceLevel;
}

function expectBitExact(frame: ProbeFrame, golden: string, evidenceLevel: string, label: string): void {
  expect(frame.receiptIssues, label).toEqual([]);
  expect(frame.firstMismatch, label).toBeNull();
  expect(frame.canonicalMismatches, label).toBe(0);
  expect(frame.displayMismatches, label).toBe(0);
  expect(frame.oracleSha256, label).toBe(golden);
  expect(frame.canonicalSha256, label).toBe(golden);
  expect(frame.displaySha256, label).toBe(golden);
  expect(frame.bitExactFailure, label).toBeNull();
  expect(frame.evidenceLevel, label).toBe(evidenceLevel);
}

/** Labels of every suite cell with at least one pixel that differs from the Node oracle. */
function mismatchingCells(frame: ProbeFrame, oracleRgba: Uint8Array): string[] {
  const { suite } = rendered;
  const rgba = frame.canonicalRgba ?? [];
  return suite.cells.flatMap((cell) => {
    for (let ly = 0; ly < suite.cellPxH; ly += 1) {
      for (let lx = 0; lx < suite.cellPxW; lx += 1) {
        const offset = ((cell.row * suite.cellPxH + ly) * suite.canvasPxW + cell.col * suite.cellPxW + lx) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (rgba[offset + channel] !== oracleRgba[offset + channel]) {
            return [`${cell.id} (${String(lx)}, ${String(ly)})`];
          }
        }
      }
    }
    return [];
  });
}

test.describe('bijou-surface-gpu/1 WebGL2 presenter in Chrome', () => {
  test('pins WebGL2 enums that equal the live context and creates the canonical context', async ({ page }) => {
    const problems = await openProbe(page);
    await recordEvidence(page);
    expect(await page.evaluate(() => window.__geordiWebGL2Probe?.enumMismatches())).toEqual([]);
    expect(await page.evaluate(() => window.__geordiWebGL2Probe?.contextState())).toEqual({
      attributes: { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true },
      drawingBufferColorSpace: 'srgb',
    });
    expect(problems).toEqual([]);
  });

  test('renders the paint -> erase fixture bit-exactly against renderReferenceRgba through canonical and display readback', async ({
    page,
  }) => {
    const problems = await openProbe(page);
    const evidence = await recordEvidence(page);
    const result = must(await page.evaluate(() => window.__geordiWebGL2Probe?.paintErase()));
    const { suite, paint, erase } = rendered;
    expectBitExact(result.paint, suiteFrame(suite, 'paint').frameRgbaSha256, evidence, 'paint');
    expectBitExact(result.erase, suiteFrame(suite, 'erase').frameRgbaSha256, evidence, 'erase');
    // Every labelled cell (flags, underlines, procedural glyphs, default-colour fallbacks) probed pixel by pixel.
    expect(mismatchingCells(result.paint, paint.rgba)).toEqual([]);
    expect(mismatchingCells(result.erase, erase.rgba)).toEqual([]);
    test.info().annotations.push({ type: 'readback', description: String(result.paint.readbackPath) });
    // The erase frame went through the incremental path, not a full refresh.
    expect(result.erase.lastFullRefreshReason).toBeNull();
    expect(result.erase.lastCellUploads).toBeGreaterThan(0);
    for (const [frame, id] of [
      [result.paint, 'paint'],
      [result.erase, 'erase'],
    ] as const) {
      expect(parseJsonValue(frame.receipt ?? '{}'), id).toMatchObject({
        inputReceiptSha256: suiteFrame(suite, id).inputReceiptSha256,
        preparedBufferSha256: suiteFrame(suite, id).preparedBufferSha256,
        backendProfile: 'geordi-webgl2/1',
      });
    }
    expect(problems).toEqual([]);
  });

  for (const presentWhileLost of [false, true]) {
    test(`recovers the full surface from the retained staging buffer after WEBGL_lose_context lose -> restore${presentWhileLost ? ', presenting while lost' : ''}`, async ({
      page,
    }) => {
      const problems = await openProbe(page);
      const evidence = await recordEvidence(page);
      const result = must(await page.evaluate(
        (whileLost) => window.__geordiWebGL2Probe?.contextLoss(whileLost),
        presentWhileLost,
      ));
      expect(result.prevented).toBe(true);
      expectBitExact(result.before, suiteFrame(rendered.suite, 'paint').frameRgbaSha256, evidence, 'before');
      const expected = suiteFrame(rendered.suite, presentWhileLost ? 'erase' : 'paint').frameRgbaSha256;
      expectBitExact(result.after, expected, evidence, 'after');
      // The restore uploaded the whole retained staging buffer in one span.
      expect(result.after.lastCellUploads).toBe(1);
      expect(problems).toEqual([]);
    });
  }

  test('an atlas reset re-uploads the whole atlas and grid and still matches the oracle', async ({ page }) => {
    const problems = await openProbe(page);
    const evidence = await recordEvidence(page);
    const result = must(await page.evaluate(() => window.__geordiWebGL2Probe?.atlasReset()));
    const golden = suiteFrame(rendered.suite, 'paint').frameRgbaSha256;
    expectBitExact(result.before, golden, evidence, 'before');
    expectBitExact(result.after, golden, evidence, 'after');
    expect(result.generations[1]).toBe(result.generations[0] + 1);
    expect(result.after.lastFullRefreshReason).toBe('atlas-generation');
    expect(result.after.lastAtlasUploads).toBe(1);
    expect(result.after.lastCellUploads).toBe(1);
    expect(problems).toEqual([]);
  });

  for (const [dpr, cssWidth, cssHeight] of [
    [1.25, 60, 100],
    [1.5, 67, 117],
  ] as const) {
    test(`clears letterboxed remainder pixels to defaultBg at fractional DPR ${String(dpr)}`, async ({ page }) => {
      const problems = await openProbe(page);
      const evidence = await recordEvidence(page);
      const result = must(await page.evaluate(
        ([d, w, h]) => window.__geordiWebGL2Probe?.letterbox(d, w, h),
        [dpr, cssWidth, cssHeight] as const,
      ));
      expect([result.resized.canvasPxW, result.resized.canvasPxH]).toEqual([
        Math.round(cssWidth * dpr),
        Math.round(cssHeight * dpr),
      ]);
      // The oracle letterboxes with solid defaultBg; zero mismatches means every remainder pixel is defaultBg.
      expectBitExact(result.resized, result.resized.oracleSha256, evidence, 'resized');
      expectBitExact(result.shrunk, result.shrunk.oracleSha256, evidence, 'shrunk');
      expect(parseJsonValue(result.resized.receipt ?? '{}')).toMatchObject({ dpr });
      expect(problems).toEqual([]);
    });
  }

  for (const deviceScaleFactor of [1, 2]) {
    test(`hit-tests real pointer events with cellFromPoint at DPR ${String(deviceScaleFactor)}`, async ({ browser }) => {
      const context = await browser.newContext({ deviceScaleFactor, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const problems = await openProbe(page);
      const evidence = await recordEvidence(page);
      const scene = must(await page.evaluate(() => window.__geordiWebGL2Probe?.dprScene()));
      expect(scene.dpr).toBe(deviceScaleFactor);
      expectBitExact(scene.frame, scene.frame.oracleSha256, evidence, 'frame');
      expect([scene.frame.canvasPxW, scene.frame.canvasPxH]).toEqual([67 * deviceScaleFactor, 117 * deviceScaleFactor]);
      if (deviceScaleFactor === 1) {
        // At DPR 1 the frame is the suite golden itself.
        expect(scene.frame.canonicalSha256).toBe(suiteFrame(rendered.suite, 'paint').frameRgbaSha256);
      }
      const { left, top } = scene.rect;
      // Cells are 8 x 16 CSS pixels at both ratios (8 x 16 or 16 x 32 physical).
      const points: [number, number, number, number][] = [
        [0.5, 0.5, 0, 0],
        [7.5, 15.5, 0, 0],
        [8.5, 16.5, 1, 1],
        [3 * 8 + 4, 5 * 16 + 8, 3, 5],
        [63.5, 111.5, 7, 6],
        // The letterboxed remainder clamps into the last cell.
        [66.5, 116.5, 7, 6],
      ];
      for (const [x, y] of points) {
        await page.mouse.move(left + x, top + y);
        await page.mouse.down();
        await page.mouse.up();
      }
      expect(await page.evaluate(() => window.__geordiWebGL2Probe?.hits())).toEqual(
        points.map(([, , col, row]) => ({ col, row })),
      );
      expect(problems).toEqual([]);
      await context.close();
    });
  }

  test('the diagnostic overlay tints only the uploaded rows of the display pass and never the canonical frame', async ({
    page,
  }) => {
    const problems = await openProbe(page);
    const evidence = await recordEvidence(page);
    const result = must(await page.evaluate(() => window.__geordiWebGL2Probe?.overlay()));
    expectBitExact(result.off, result.off.oracleSha256, evidence, 'off');
    // Canonical frame and receipt untouched; display differs, in row 3 only.
    expect(result.on.canonicalSha256).toBe(result.off.oracleSha256);
    expect(result.on.receipt).toBe(result.off.receipt);
    expect(result.on.displayMismatches).toBeGreaterThan(0);
    expect(result.tintedRows).toEqual([3]);
    expectBitExact(result.again, result.again.oracleSha256, evidence, 'again');
    expect(problems).toEqual([]);
  });

  test('presents 120 consecutive animated frames at 160 x 48 with zero GL errors and valid receipts', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = await openProbe(page);
    const evidence = await recordEvidence(page);
    const result = must(await page.evaluate(() => window.__geordiWebGL2Probe?.stress(120, 160, 48)));
    expect(result.framesPresented).toBe(120);
    expect(result.glErrors).toEqual([]);
    expect(result.invalidReceipts).toEqual([]);
    expectBitExact(result.final, result.final.oracleSha256, evidence, 'final frame');
    test.info().annotations.push({ type: 'timing', description: `120 frames in ${result.elapsedMs.toFixed(0)} ms` });
    expect(problems).toEqual([]);
  });

  test('refuses with BackendUnavailableError, not a fault, when the canvas has no webgl2 context', async ({ page }) => {
    const problems = await openProbe(page);
    expect(await page.evaluate(() => window.__geordiWebGL2Probe?.unavailable())).toEqual({
      name: 'BackendUnavailableError',
      code: 'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE',
      backend: 'webgl2',
      isFault: false,
    });
    expect(problems).toEqual([]);
  });
});
