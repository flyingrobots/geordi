import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonValue, stringifyCanonicalJson, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import type { WebGpuProbe, WebGpuProbeFrame, WebGpuProbeResult } from '../harness/webgpu.js';
import {
  classifyWebGpuAdapter,
  readPixel,
  serializeEndpointReceipt,
  validateEndpointReceipt,
  type EndpointReceipt,
} from '../src/index.js';
import { renderSuite } from '../test/support.js';

declare global {
  interface Window {
    __geordiWebGpuProbe?: WebGpuProbe;
    __geordiWebGpuProbeError?: string;
  }
}

class WebGpuProbeMissingError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

/**
 * Real-browser evidence for the WebGPU presenter.
 *
 * Positive rendering evidence and capability refusal are separate tests. A
 * browser without a WebGPU adapter skips the positive tests (or fails them
 * when `GEORDI_BIJOU_GPU_REQUIRE_WEBGPU=1`); it never passes them. The refusal
 * test removes `navigator.gpu` on purpose and witnesses refusal only.
 *
 * Set `GEORDI_BIJOU_GPU_WITNESS_DIR` to write each positive run's adapter and
 * probed receipts to that directory.
 */

const REQUIRE_WEBGPU = process.env.GEORDI_BIJOU_GPU_REQUIRE_WEBGPU === '1';
const WITNESS_DIR = process.env.GEORDI_BIJOU_GPU_WITNESS_DIR;

const MANIFEST = parseJsonValue(
  readFileSync(fileURLToPath(new URL('../shaders/bijou-shaders.manifest.json', import.meta.url)), 'utf8'),
);

function objectOf(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WebGpuProbeMissingError(`${label} is not an object`);
  }
  return value as JsonObject;
}

function manifestSurfaceDigest(): string {
  const shaders = objectOf(MANIFEST, 'manifest').shaders;
  const entry = Array.isArray(shaders)
    ? (shaders as readonly JsonValue[]).find((item) => objectOf(item, 'shader').id === 'bijou-surface')
    : undefined;
  const digest = objectOf(entry, 'bijou-surface shader').assembledWgslSha256;
  if (typeof digest !== 'string') {
    throw new WebGpuProbeMissingError('manifest has no bijou-surface digest');
  }
  return digest;
}

function present<T>(value: T | null): T {
  if (value === null) {
    throw new WebGpuProbeMissingError('window.__geordiWebGpuProbe is missing');
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
  await page.goto('/webgpu.html');
  await expect(page.locator('body')).toHaveAttribute('data-webgpu-probe', 'ready');
  expect(await page.evaluate(() => window.__geordiWebGpuProbeError ?? null)).toBeNull();
  return problems;
}

function receiptJson(receipt: EndpointReceipt): JsonValue {
  return parseJsonValue(serializeEndpointReceipt(receipt));
}

function expectValidReceipt(receipt: EndpointReceipt): void {
  const validation = validateEndpointReceipt(receiptJson(receipt));
  expect(validation.ok ? [] : validation.issues).toEqual([]);
}

/**
 * Skip a positive test on a lane that refused WebGPU, saying so on stdout as a
 * JSON line, because the default CI reporter prints no skip reasons.
 */
function skipRefused(reason: string): void {
  expect(REQUIRE_WEBGPU, `WebGPU is required but was refused: ${reason}`).toBe(false);
  process.stdout.write(
    `${stringifyCanonicalJson({ event: 'webgpu-capability-refused', test: test.info().title, reason })}\n`,
  );
  test.skip(true, `capability-refused, not a rendering pass: ${reason}`);
}

/** Skip, or fail when WebGPU is required, on a lane that refused the backend. */
function rendered(result: WebGpuProbeResult): Extract<WebGpuProbeResult, { status: 'rendered' }> {
  if (result.status === 'refused') {
    skipRefused(result.reason);
    throw new WebGpuProbeMissingError('unreachable after test.skip');
  }
  return result;
}

async function recordWitness(
  page: Page,
  testInfo: TestInfo,
  name: string,
  result: Extract<WebGpuProbeResult, { status: 'rendered' }>,
): Promise<void> {
  const body = stringifyCanonicalJson(
    {
      witness: name,
      project: testInfo.project.name,
      // The real engine version; the page's user agent is the device profile's.
      browserVersion: page.context().browser()?.version() ?? 'unknown',
      adapter: { ...result.adapter },
      presenterStatus: result.presenterStatus,
      frames: result.frames.map((frame) => ({
        id: frame.id,
        oracleFrameRgbaSha256: frame.oracleFrameRgbaSha256,
        oraclePreparedBufferSha256: frame.oraclePreparedBufferSha256,
        bitExactFailure: frame.bitExactFailure,
        differingPixels: frame.differingPixels,
        displayDifferingPixels: frame.displayDifferingPixels,
        gammaSensitivePixels: frame.gammaSensitivePixels,
        readbackBytesPerRow: frame.readbackBytesPerRow,
        receipt: receiptJson(frame.receipt),
      })),
    },
    { space: 2 },
  );
  await testInfo.attach(`${name}.json`, { body, contentType: 'application/json' });
  if (WITNESS_DIR !== undefined) {
    mkdirSync(WITNESS_DIR, { recursive: true });
    writeFileSync(join(WITNESS_DIR, `${name}.json`), `${body}\n`);
  }
}

function expectProbedFrame(
  frame: WebGpuProbeFrame,
  adapter: Extract<WebGpuProbeResult, { status: 'rendered' }>['adapter'],
): void {
  expect(frame.bitExactFailure).toBeNull();
  expect(frame.differingPixels).toBe(0);
  expect(frame.receipt.frameRgbaSha256).toBe(frame.oracleFrameRgbaSha256);
  expect(frame.receipt.preparedBufferSha256).toBe(frame.oraclePreparedBufferSha256);
  expect(frame.readbackBytesPerRow % 256).toBe(0);
  expectValidReceipt(frame.receipt);
  const expectedClass = classifyWebGpuAdapter({
    info: adapter,
    requestDevice: () => Promise.reject(new WebGpuProbeMissingError('not requested')),
  });
  expect(frame.receipt.evidenceLevel).toBe(expectedClass.evidenceLevel);
  expect(frame.receipt.adapter).toEqual(expectedClass.adapter);
  expect(frame.receipt).toMatchObject({
    assembledWgslSha256: manifestSurfaceDigest(),
    shaderSha256: manifestSurfaceDigest(),
    generatedGlslSha256: null,
    backendProfile: 'geordi-webgpu/1',
  });
}

test.describe('WebGPU presenter positive pixel probes (rendering evidence)', () => {
  test('deterministic-atlas paint -> erase reads back bit-exactly equal to renderReferenceRgba', async ({
    page,
  }, testInfo) => {
    const problems = await openProbe(page);
    const result = rendered(present(await page.evaluate(() => window.__geordiWebGpuProbe?.runAtlasFixture() ?? null)));
    await recordWitness(page, testInfo, 'webgpu-atlas-paint-erase', result);

    const { suite, paint, erase } = renderSuite();
    expect(result.frames.map((frame) => frame.id)).toEqual(['paint', 'erase']);
    for (const [index, oracle] of [paint, erase].entries()) {
      const frame = present(result.frames.at(index) ?? null);
      expectProbedFrame(frame, result.adapter);
      const golden = present(suite.frames.find((candidate) => candidate.id === frame.id) ?? null);
      // The in-page oracle must agree with the Node goldens checked into the suite.
      expect(frame.receipt).toMatchObject({
        frameRgbaSha256: golden.frameRgbaSha256,
        preparedBufferSha256: golden.preparedBufferSha256,
        inputReceiptSha256: golden.inputReceiptSha256,
        canvasPxW: suite.canvasPxW,
        canvasPxH: suite.canvasPxH,
        widthCells: 8,
        heightCells: 7,
      });
      for (const probe of frame.receipt.probes) {
        expect([probe.px, probe.py, ...probe.rgba]).toEqual([probe.px, probe.py, ...readPixel(oracle, probe.px, probe.py)]);
      }
    }
    expect(result.presenterStatus).toBe('ready');
    expect(problems).toEqual([]);
  });

  test('procedural-only paint -> erase with an empty atlas reads back bit-exactly', async ({ page }, testInfo) => {
    const problems = await openProbe(page);
    const result = rendered(present(await page.evaluate(() => window.__geordiWebGpuProbe?.runProceduralFixture() ?? null)));
    await recordWitness(page, testInfo, 'webgpu-procedural-paint-erase', result);
    expect(result.frames.map((frame) => frame.id)).toEqual(['procedural-paint', 'procedural-erase']);
    for (const frame of result.frames) {
      expectProbedFrame(frame, result.adapter);
      expect(frame.receipt.atlasStats.usedSlots).toBe(0);
    }
    // The two fixtures are different frames, so the comparison is not vacuous.
    expect(result.frames[0]?.oracleFrameRgbaSha256).not.toBe(renderSuite().paint.frameRgbaSha256);
    expect(problems).toEqual([]);
  });

  test('the display pass writes the canonical bytes to a non-sRGB canvas with no double-gamma shift', async ({
    page,
  }) => {
    await openProbe(page);
    const result = rendered(present(await page.evaluate(() => window.__geordiWebGpuProbe?.runAtlasFixture() ?? null)));
    expect(['bgra8unorm', 'rgba8unorm']).toContain(result.adapter.preferredCanvasFormat);
    for (const frame of result.frames) {
      // An -srgb swapchain would move every one of these pixels.
      expect(frame.gammaSensitivePixels).toBeGreaterThan(1000);
      expect(frame.displayDifferingPixels).toBe(0);
    }
  });

  test('a randomized resize sequence stays bit-exact with 256-byte aligned readback and no WebGPU errors', async ({
    page,
  }) => {
    const problems = await openProbe(page);
    const result = present(await page.evaluate(() => window.__geordiWebGpuProbe?.runResizeSequence(24, 0x175) ?? null));
    if (result.status === 'refused') {
      skipRefused(result.reason);
      return;
    }
    expect(result.fault).toBeNull();
    expect(result.presenterStatus).toBe('ready');
    expect(result.steps).toHaveLength(24);
    expect(new Set(result.steps.map((step) => `${String(step.widthCells)}x${String(step.heightCells)}`)).size).toBeGreaterThan(5);
    for (const step of result.steps) {
      expect(step.bytesPerRow % 256).toBe(0);
      expect(step.bytesPerRow).toBeGreaterThanOrEqual(step.canvasPxW * 4);
      expect(step.bytesPerRow).toBeLessThan(step.canvasPxW * 4 + 256);
      expect(step, `frame at ${String(step.canvasPxW)}x${String(step.canvasPxH)}`).toMatchObject({ matchesOracle: true });
    }
    expect(problems).toEqual([]);
  });

  test('a WGSL compile error from the real device is a RendererFaultError, not a refusal', async ({ page }) => {
    await openProbe(page);
    const result = present(await page.evaluate(() => window.__geordiWebGpuProbe?.runShaderFault() ?? null));
    if (result.status === 'refused') {
      skipRefused(result.reason);
      return;
    }
    expect(result).toMatchObject({
      status: 'fault',
      errorName: 'RendererFaultError',
      code: 'GEORDI_E_BIJOU_RENDERER_FAULT',
    });
  });
});

test.describe('WebGPU presenter capability refusal (refusal evidence only)', () => {
  test('a browser without navigator.gpu refuses with a validated capability-refused receipt and no pixels', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });
    });
    const problems = await openProbe(page);
    expect(await page.evaluate(() => window.__geordiWebGpuProbe?.hasNavigatorGpu ?? null)).toBe(false);
    const result = present(await page.evaluate(() => window.__geordiWebGpuProbe?.runAtlasFixture() ?? null));
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') {
      return;
    }
    expect(result.reason).toBe('navigator.gpu is undefined');
    expectValidReceipt(result.receipt);
    const { suite } = renderSuite();
    expect(result.receipt).toMatchObject({
      evidenceLevel: 'capability-refused',
      frameRgbaSha256: null,
      probes: [],
      adapter: { backend: 'webgpu', name: '', driver: '' },
      assembledWgslSha256: manifestSurfaceDigest(),
      preparedBufferSha256: suite.frames[0]?.preparedBufferSha256,
      inputReceiptSha256: suite.frames[0]?.inputReceiptSha256,
    });
    expect(problems).toEqual([]);
  });
});
