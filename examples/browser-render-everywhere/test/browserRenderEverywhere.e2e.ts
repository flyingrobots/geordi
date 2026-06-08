import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { canonicalJsonPort, type JsonValue } from '@flyingrobots/geordi-core';
import {
  parseRenderFixtureManifest,
  parseRenderFixtureStrictTextFixtureManifest,
  parseRenderFixtureStrictTextOutlineEvidencePack,
  parseRenderFixtureStrictTextProbePolicy,
  assertRenderFixturePixelProbes,
  renderFixtureRgbaFromBytes,
  type RenderFixtureManifest,
  type RenderFixturePixelProbe,
  type RenderFixtureRgba,
} from '@flyingrobots/geordi-render-fixture';
import { compileGpvueSource } from '@flyingrobots/geordi-gpvue';

declare global {
  interface Window {
    __geordiTextApiCalls?: string[];
  }
}

interface ProbeInput {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface PixelSample {
  readonly id: string;
  readonly rgba: readonly number[];
  readonly x: number;
  readonly y: number;
}

type StrictTextProbeExpectation = 'fill' | 'transparent';
type StrictTextProbeTolerance = 'alpha-zero' | 'exact-fill-rgba';

interface StrictTextProbeInput {
  readonly expectation: StrictTextProbeExpectation;
  readonly id: string;
  readonly tolerance: StrictTextProbeTolerance;
  readonly x: number;
  readonly y: number;
}

interface StrictTextProbeSample extends StrictTextProbeInput {
  readonly rgba: readonly number[];
}

interface CanvasSnapshot {
  readonly canvasCount: number;
  readonly height: number;
  readonly nonblank: boolean;
  readonly samples: readonly PixelSample[];
  readonly width: number;
}

interface CanvasFailure {
  readonly canvasCount: number;
  readonly reason: 'canvas-count' | 'context-unavailable';
}

type CanvasEvaluation = CanvasFailure | CanvasSnapshot;

interface StrictTextBounds {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
}

interface StrictTextCanvasSnapshot {
  readonly bounds: StrictTextBounds;
  readonly canvasCount: number;
  readonly height: number;
  readonly nonblank: true;
  readonly nonblankPixelCount: number;
  readonly probes: readonly StrictTextProbeSample[];
  readonly sampledPixelCount: number;
  readonly textApiCalls: readonly string[];
  readonly width: number;
}

interface StrictTextCanvasFailure {
  readonly canvasCount: number;
  readonly reason: 'blank' | 'canvas-count' | 'context-unavailable' | 'text-api-call';
  readonly textApiCalls: readonly string[];
}

type StrictTextCanvasEvaluation = StrictTextCanvasFailure | StrictTextCanvasSnapshot;

class BrowserGateCanvasEvaluationError extends Error {
  public readonly reason: string;

  constructor(reason: string) {
    super('Browser gate canvas evaluation failed');
    this.name = new.target.name;
    this.reason = reason;
  }
}

class BrowserGateStrictTextSmokeError extends Error {
  public readonly reason: string;
  public readonly textApiCalls: readonly string[];

  constructor(reason: string, textApiCalls: readonly string[] = []) {
    super('Browser strict text smoke failed');
    this.name = new.target.name;
    this.reason = reason;
    this.textApiCalls = textApiCalls;
  }
}

class BrowserGatePixelSampleMissingError extends Error {
  public readonly probeId: string;

  constructor(probeId: string) {
    super('Browser gate pixel sample missing');
    this.name = new.target.name;
    this.probeId = probeId;
  }
}

class BrowserGateStrictTextProbeError extends Error {
  public readonly actual: readonly number[];
  public readonly expected: StrictTextProbeExpectation;
  public readonly fixtureId: string;
  public readonly probeId: string;
  public readonly tolerance: string;
  public readonly x: number;
  public readonly y: number;

  constructor(fixtureId: string, probe: StrictTextProbeSample) {
    super('Browser strict text pixel probe failed');
    this.name = new.target.name;
    this.actual = probe.rgba;
    this.expected = probe.expectation;
    this.fixtureId = fixtureId;
    this.probeId = probe.id;
    this.tolerance = probe.tolerance;
    this.x = probe.x;
    this.y = probe.y;
  }
}

class BrowserGateStrictTextBoundsError extends Error {
  public readonly allowed: StrictTextBounds;
  public readonly actual: StrictTextBounds;
  public readonly fixtureId: string;

  constructor(fixtureId: string, actual: StrictTextBounds, allowed: StrictTextBounds) {
    super('Browser strict text nonblank bounds failed');
    this.name = new.target.name;
    this.allowed = allowed;
    this.actual = actual;
    this.fixtureId = fixtureId;
  }
}

class BrowserGateCompiledScenePathError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('Browser gate compiled scene path failed');
    this.name = new.target.name;
    this.path = path;
  }
}

class BrowserGateCompiledManifestPathError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('Browser gate compiled manifest path failed');
    this.name = new.target.name;
    this.path = path;
  }
}

function loadManifest(): RenderFixtureManifest {
  return parseRenderFixtureManifest(loadManifestSource());
}

function loadManifestSource(): string {
  const { GEORDI_RENDER_EVERYWHERE_COMPILED_MANIFEST: overridePath } = process.env;
  if (overridePath !== undefined && overridePath.length > 0) {
    try {
      return readFileSync(overridePath, 'utf8');
    } catch {
      throw new BrowserGateCompiledManifestPathError(overridePath);
    }
  }

  return readFileSync(
    new URL('../../../fixtures/render-everywhere/hello-panel/fixture.json', import.meta.url),
    'utf8',
  );
}

function loadCompiledSceneSource(): string {
  const { GEORDI_RENDER_EVERYWHERE_COMPILED_SCENE: overridePath } = process.env;
  if (overridePath !== undefined && overridePath.length > 0) {
    try {
      return readFileSync(overridePath, 'utf8');
    } catch {
      throw new BrowserGateCompiledScenePathError(overridePath);
    }
  }

  return compileGpvueSource({
    filename: 'source.gpvue',
    source: readFileSync(
      new URL('../../../fixtures/render-everywhere/hello-panel/source.gpvue', import.meta.url),
      'utf8',
    ),
  }).artifacts.ir.content;
}

function loadStrictTextFixtureSource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json', import.meta.url),
    'utf8',
  );
}

function loadStrictTextEvidenceSource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json', import.meta.url),
    'utf8',
  );
}

function loadStrictTextProbePolicySource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/strict-text/geordi.probe-policy.geordi.json', import.meta.url),
    'utf8',
  );
}

function loadStrictTextFontPackSource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/assets/fonts/font-pack.geordi.json', import.meta.url),
    'utf8',
  );
}

function artifactHash(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function canonicalJsonHash(value: JsonValue): string {
  return artifactHash(`${canonicalJsonPort.stringify(value, { space: 2 })}\n`);
}

function strictTextEvidencePixelBounds(
  fixture: {
    readonly glyphRuns: readonly {
      readonly glyphs: readonly {
        readonly glyphId: number;
        readonly x: number;
        readonly xOffset: number;
        readonly y: number;
        readonly yOffset: number;
      }[];
    }[];
  },
  evidence: {
    readonly glyphs: readonly {
      readonly bounds: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly draws: boolean;
      readonly glyphId: number;
    }[];
  },
): StrictTextBounds {
  const evidenceByGlyphId = new Map(evidence.glyphs.map((glyph) => [glyph.glyphId, glyph]));
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  for (const run of fixture.glyphRuns) {
    for (const glyph of run.glyphs) {
      const glyphEvidence = evidenceByGlyphId.get(glyph.glyphId);
      if (glyphEvidence?.draws !== true) {
        continue;
      }

      const left = glyph.x + glyph.xOffset + glyphEvidence.bounds.x;
      const top = glyph.y + glyph.yOffset + glyphEvidence.bounds.y;
      const right = left + glyphEvidence.bounds.width;
      const bottom = top + glyphEvidence.bounds.height;
      minX = Math.min(minX, Math.floor(left / 64));
      minY = Math.min(minY, Math.floor(top / 64));
      maxX = Math.max(maxX, Math.ceil(right / 64) - 1);
      maxY = Math.max(maxY, Math.ceil(bottom / 64) - 1);
    }
  }

  return { maxX, maxY, minX, minY };
}

function probeInputs(probes: readonly RenderFixturePixelProbe[]): readonly ProbeInput[] {
  return probes.map((probe) => ({
    id: probe.id,
    x: probe.x,
    y: probe.y,
  }));
}

function strictTextProbeInputs(
  probes: readonly {
    readonly expectation: StrictTextProbeExpectation;
    readonly id: string;
    readonly tolerance: StrictTextProbeTolerance;
    readonly x: number;
    readonly y: number;
  }[],
): readonly StrictTextProbeInput[] {
  return probes.map((probe) => ({
    expectation: probe.expectation,
    id: probe.id,
    tolerance: probe.tolerance,
    x: probe.x,
    y: probe.y,
  }));
}

function snapshotFromEvaluation(evaluation: CanvasEvaluation): CanvasSnapshot {
  if ('width' in evaluation) {
    return evaluation;
  }

  throw new BrowserGateCanvasEvaluationError(evaluation.reason);
}

function strictTextSnapshotFromEvaluation(
  evaluation: StrictTextCanvasEvaluation,
): StrictTextCanvasSnapshot {
  if (!('width' in evaluation)) {
    throw new BrowserGateStrictTextSmokeError(evaluation.reason, evaluation.textApiCalls);
  }

  if (evaluation.textApiCalls.length > 0) {
    throw new BrowserGateStrictTextSmokeError('text-api-call', evaluation.textApiCalls);
  }

  return evaluation;
}

function sampleForProbe(
  samples: ReadonlyMap<string, RenderFixtureRgba>,
  probe: RenderFixturePixelProbe,
): RenderFixtureRgba {
  const sample = samples.get(probe.id);
  if (sample === undefined) {
    throw new BrowserGatePixelSampleMissingError(probe.id);
  }

  return sample;
}

function assertStrictTextBoundsInsidePolicy(
  fixtureId: string,
  actual: StrictTextBounds,
  allowed: StrictTextBounds,
): void {
  const passes =
    actual.minX >= allowed.minX &&
    actual.minY >= allowed.minY &&
    actual.maxX <= allowed.maxX &&
    actual.maxY <= allowed.maxY;

  if (!passes) {
    throw new BrowserGateStrictTextBoundsError(fixtureId, actual, allowed);
  }
}

function assertStrictTextProbe(
  fixtureId: string,
  fillRgba: RenderFixtureRgba,
  probe: StrictTextProbeSample,
): void {
  const [red = 0, green = 0, blue = 0, alpha = 0] = probe.rgba;
  const [fillRed, fillGreen, fillBlue, fillAlpha] = fillRgba;
  const passes =
    probe.expectation === 'fill'
      ? probe.tolerance === 'exact-fill-rgba' &&
        red === fillRed &&
        green === fillGreen &&
        blue === fillBlue &&
        alpha === fillAlpha
      : probe.tolerance === 'alpha-zero' && alpha === 0;

  if (!passes) {
    throw new BrowserGateStrictTextProbeError(fixtureId, probe);
  }
}

test('renders the shared hello-panel fixture with exact browser pixel probes', async ({ page }) => {
  const manifest = loadManifest();
  const compiledSceneSource = loadCompiledSceneSource();
  const manifestSource = loadManifestSource();
  const strictTextFixtureSource = loadStrictTextFixtureSource();
  const strictTextFixture = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureSource);
  const strictTextEvidenceSource = loadStrictTextEvidenceSource();
  const strictTextEvidence =
    parseRenderFixtureStrictTextOutlineEvidencePack(strictTextEvidenceSource);
  const strictTextProbePolicy = parseRenderFixtureStrictTextProbePolicy(
    loadStrictTextProbePolicySource(),
  );
  const strictTextFontPackSource = loadStrictTextFontPackSource();
  let servedCompiledManifest = false;
  let servedCompiledScene = false;

  await page.addInitScript(() => {
    const textApiCalls: string[] = [];
    window.__geordiTextApiCalls = textApiCalls;

    const canvasPrototype = CanvasRenderingContext2D.prototype;
    canvasPrototype.fillText = function fillTextSpy(
      this: CanvasRenderingContext2D,
      text: string,
      _x: number,
      _y: number,
      maxWidth?: number,
    ): void {
      textApiCalls.push('CanvasRenderingContext2D.fillText');
      void text;
      void maxWidth;
    };
    canvasPrototype.strokeText = function strokeTextSpy(
      this: CanvasRenderingContext2D,
      text: string,
      _x: number,
      _y: number,
      maxWidth?: number,
    ): void {
      textApiCalls.push('CanvasRenderingContext2D.strokeText');
      void text;
      void maxWidth;
    };
    canvasPrototype.measureText = function measureTextSpy(
      this: CanvasRenderingContext2D,
      text: string,
    ): TextMetrics {
      textApiCalls.push('CanvasRenderingContext2D.measureText');
      void text;
      return { width: 0 } as TextMetrics;
    };

    const OriginalFontFace = window.FontFace;
    if (typeof OriginalFontFace === 'function') {
      window.FontFace = class FontFaceSpy extends OriginalFontFace {
        constructor(
          family: string,
          source: string | BufferSource,
          descriptors?: FontFaceDescriptors,
        ) {
          textApiCalls.push('FontFace');
          super(family, source, descriptors);
        }
      };
    }
  });

  expect(artifactHash(compiledSceneSource)).toBe(manifest.artifactHash);

  await page.route(/\/fixture\.json(?:\?.*)?$/u, async (route) => {
    if (route.request().url().includes('?import')) {
      await route.continue();
      return;
    }

    servedCompiledManifest = true;
    await route.fulfill({
      body: manifestSource,
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(/scene\.geordi\.json(?:\?.*)?$/u, async (route) => {
    if (route.request().url().includes('?import')) {
      await route.continue();
      return;
    }

    servedCompiledScene = true;
    await route.fulfill({
      body: compiledSceneSource,
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Geordi Render Everywhere' })).toBeVisible();
  expect(servedCompiledManifest).toBe(true);
  expect(servedCompiledScene).toBe(true);

  const rectanglesButton = page.getByRole('button', { name: 'Rectangles' });
  const bunnyButton = page.getByRole('button', { name: 'Bunny' });
  const textButton = page.getByRole('button', { name: 'Text' });
  const rendererMarker = page.locator('.harness-marker');
  const rectanglePanel = page.locator('[data-geordi-demo-panel="rectangles"]');
  const bunnyPanel = page.locator('[data-geordi-demo-panel="bunny"]');
  const textPanel = page.locator('[data-geordi-demo-panel="text"]');

  await expect(rendererMarker).toHaveText('browser-canvas-wireframe-mesh');
  await expect(bunnyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(rectanglesButton).toHaveAttribute('aria-pressed', 'false');
  await expect(textButton).toHaveAttribute('aria-pressed', 'false');
  await expect(bunnyPanel).toBeVisible();
  await expect(rectanglePanel).toBeHidden();
  await expect(textPanel).toBeHidden();

  const bunnyReport = bunnyPanel.locator('[data-geordi-bunny-report="true"]');
  await expect(bunnyReport).toBeHidden();
  await expect(bunnyReport).toContainText('browser-canvas-wireframe-mesh');
  await expect(bunnyReport).toContainText('transformProfile=geordi-fixed-rate-rotation/1');
  await expect(bunnyReport).toContainText(
    'normalizedAxis=0.4866642633922876,0.8111071056538126,0.32444284226152503',
  );
  await expect(bunnyReport).toContainText('vertices=1889');
  await expect(bunnyReport).toContainText('faces=3851');
  await expect(bunnyReport).toContainText(
    'assetHash=sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6',
  );
  await expect(bunnyReport).toContainText(/frame=[1-9][0-9]*/u);

  const bunnyEvaluation = await page.evaluate<CanvasEvaluation>(() => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      '[data-geordi-demo-panel="bunny"]:not([hidden]) canvas[data-geordi-bunny-canvas="true"]',
    );
    if (canvases.length !== 1) {
      return {
        canvasCount: canvases.length,
        reason: 'canvas-count',
      };
    }

    const canvas = canvases.item(0);
    const context = canvas.getContext('2d');
    if (context === null) {
      return {
        canvasCount: canvases.length,
        reason: 'context-unavailable',
      };
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonblank = false;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      const red = pixels[index] ?? 17;
      const green = pixels[index + 1] ?? 24;
      const blue = pixels[index + 2] ?? 39;
      if (alpha > 0 && (red !== 17 || green !== 24 || blue !== 39)) {
        nonblank = true;
        break;
      }
    }

    return {
      canvasCount: canvases.length,
      height: canvas.height,
      nonblank,
      samples: [],
      width: canvas.width,
    };
  });

  const bunnySnapshot = snapshotFromEvaluation(bunnyEvaluation);
  expect(bunnySnapshot.canvasCount).toBe(1);
  expect(bunnySnapshot.width).toBe(512);
  expect(bunnySnapshot.height).toBe(512);
  expect(bunnySnapshot.nonblank).toBe(true);

  await rectanglesButton.click();
  await expect(rectanglesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(bunnyButton).toHaveAttribute('aria-pressed', 'false');
  await expect(textButton).toHaveAttribute('aria-pressed', 'false');
  await expect(rendererMarker).toHaveText('browser-canvas');
  await expect(rectanglePanel).toBeVisible();
  await expect(bunnyPanel).toBeHidden();
  await expect(textPanel).toBeHidden();

  await rectanglePanel.getByText('Rectangle metadata').click();
  await expect(rectanglePanel.getByText(manifest.id)).toBeVisible();
  await expect(rectanglePanel.getByText(manifest.artifactHash)).toBeVisible();
  await expect(rectanglePanel.getByText(manifest.runtimeProfile.irVersion)).toBeVisible();
  await expect(rectanglePanel.getByText(manifest.runtimeProfile.numericProfile)).toBeVisible();
  await expect(rectanglePanel.getByText(manifest.runtimeProfile.requires.join(', '))).toBeVisible();

  const evaluation = await page.evaluate<CanvasEvaluation, readonly ProbeInput[]>((probes) => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      '[data-geordi-demo-panel="rectangles"]:not([hidden]) canvas[data-geordi-render-canvas="true"]',
    );
    if (canvases.length !== 1) {
      return {
        canvasCount: canvases.length,
        reason: 'canvas-count',
      };
    }

    const canvas = canvases.item(0);
    const context = canvas.getContext('2d');
    if (context === null) {
      return {
        canvasCount: canvases.length,
        reason: 'context-unavailable',
      };
    }

    const samples = probes.map((probe): PixelSample => {
      const data = context.getImageData(probe.x, probe.y, 1, 1).data;
      return {
        id: probe.id,
        rgba: Array.from(data),
        x: probe.x,
        y: probe.y,
      };
    });

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonblank = false;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;
      if (alpha > 0 && (red !== 255 || green !== 255 || blue !== 255)) {
        nonblank = true;
        break;
      }
    }

    return {
      canvasCount: canvases.length,
      height: canvas.height,
      nonblank,
      samples,
      width: canvas.width,
    };
  }, probeInputs(manifest.pixelProbes));

  const snapshot = snapshotFromEvaluation(evaluation);
  expect(snapshot.canvasCount).toBe(1);
  expect(snapshot.width).toBe(manifest.canvas.width);
  expect(snapshot.height).toBe(manifest.canvas.height);
  expect(snapshot.nonblank).toBe(true);

  const samples = new Map(
    snapshot.samples.map((sample) => [sample.id, renderFixtureRgbaFromBytes(sample.rgba)]),
  );
  assertRenderFixturePixelProbes(manifest.id, manifest.pixelProbes, (probe) =>
    sampleForProbe(samples, probe),
  );

  await textButton.click();
  await expect(textButton).toHaveAttribute('aria-pressed', 'true');
  await expect(rectanglesButton).toHaveAttribute('aria-pressed', 'false');
  await expect(bunnyButton).toHaveAttribute('aria-pressed', 'false');
  await expect(rendererMarker).toHaveText('browser-canvas-outline-glyphs');
  await expect(textPanel).toBeVisible();
  await expect(rectanglePanel).toBeHidden();
  await expect(bunnyPanel).toBeHidden();

  await expect(
    textPanel.locator('canvas[data-geordi-strict-text-canvas="true"]'),
  ).toHaveCount(1);
  const strictTextEvaluation = await page.evaluate<
    StrictTextCanvasEvaluation,
    readonly StrictTextProbeInput[]
  >((probes) => {
    const textApiCalls = window.__geordiTextApiCalls ?? [];
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      '[data-geordi-demo-panel="text"]:not([hidden]) canvas[data-geordi-strict-text-canvas="true"]',
    );
    if (canvases.length !== 1) {
      return {
        canvasCount: canvases.length,
        reason: 'canvas-count',
        textApiCalls,
      };
    }

    const canvas = canvases.item(0);
    const context = canvas.getContext('2d');
    if (context === null) {
      return {
        canvasCount: canvases.length,
        reason: 'context-unavailable',
        textApiCalls,
      };
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const probeSamples = probes.map((probe): StrictTextProbeSample => {
      const data = context.getImageData(probe.x, probe.y, 1, 1).data;
      return {
        ...probe,
        rgba: Array.from(data),
      };
    });
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let nonblankPixelCount = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;
      if (alpha > 0 && (red !== 255 || green !== 255 || blue !== 255)) {
        const pixelIndex = index / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        nonblankPixelCount += 1;
      }
    }

    if (textApiCalls.length > 0) {
      return {
        canvasCount: canvases.length,
        reason: 'text-api-call',
        textApiCalls,
      };
    }

    if (nonblankPixelCount === 0) {
      return {
        canvasCount: canvases.length,
        reason: 'blank',
        textApiCalls,
      };
    }

    return {
      bounds: { maxX, maxY, minX, minY },
      canvasCount: canvases.length,
      height: canvas.height,
      nonblank: true,
      nonblankPixelCount,
      probes: probeSamples,
      sampledPixelCount: pixels.length / 4,
      textApiCalls,
      width: canvas.width,
    };
  }, strictTextProbeInputs(strictTextProbePolicy.probes));
  const strictTextSnapshot = strictTextSnapshotFromEvaluation(strictTextEvaluation);
  expect(strictTextProbePolicy.fixtureId).toBe(strictTextFixture.id);
  expect(strictTextProbePolicy.evidencePackId).toBe(
    'render-everywhere:strict-text:geordi:outline-evidence',
  );
  expect(strictTextProbePolicy.canvas).toEqual({ height: 64, width: 192 });
  expect(strictTextProbePolicy.allowedNonblankBounds).toEqual(
    strictTextEvidencePixelBounds(strictTextFixture, strictTextEvidence),
  );
  expect(strictTextSnapshot.canvasCount).toBe(1);
  expect(strictTextSnapshot.width).toBe(192);
  expect(strictTextSnapshot.height).toBe(64);
  expect(strictTextSnapshot.nonblankPixelCount).toBeGreaterThan(0);
  expect(strictTextSnapshot.sampledPixelCount).toBe(
    strictTextSnapshot.width * strictTextSnapshot.height,
  );
  expect(strictTextSnapshot.textApiCalls).toEqual([]);
  expect(strictTextSnapshot.bounds.minX).toBeGreaterThanOrEqual(0);
  expect(strictTextSnapshot.bounds.minY).toBeGreaterThanOrEqual(0);
  expect(strictTextSnapshot.bounds.maxX).toBeLessThan(strictTextSnapshot.width);
  expect(strictTextSnapshot.bounds.maxY).toBeLessThan(strictTextSnapshot.height);
  assertStrictTextBoundsInsidePolicy(
    strictTextFixture.id,
    strictTextSnapshot.bounds,
    strictTextProbePolicy.allowedNonblankBounds,
  );
  expect(strictTextSnapshot.probes).toHaveLength(strictTextProbePolicy.probes.length);
  for (const probe of strictTextSnapshot.probes) {
    assertStrictTextProbe(strictTextFixture.id, strictTextProbePolicy.fillRgba, probe);
  }
  const textReport = textPanel.locator('[data-geordi-strict-text-report="true"]');
  await expect(textReport).toBeHidden();
  await textPanel.getByText('Text metadata').click();
  await expect(textReport).toBeVisible();
  await expect(textReport).toContainText('browser-canvas-outline-glyphs');
  await expect(textReport).toContainText(`fixtureId=${strictTextFixture.id}`);
  await expect(textReport).toContainText(`fixtureHash=${artifactHash(strictTextFixtureSource)}`);
  await expect(textReport).toContainText(`fontPackPath=${strictTextFixture.fontPackPath}`);
  await expect(textReport).toContainText(`fontPackHash=${artifactHash(strictTextFontPackSource)}`);
  await expect(textReport).toContainText(`glyphRunHash=${canonicalJsonHash(strictTextFixture.glyphRuns)}`);
  await expect(textReport).toContainText(`lineBoxHash=${canonicalJsonHash(strictTextFixture.lineBoxes)}`);
  await expect(textReport).toContainText(
    'evidencePackId=render-everywhere:strict-text:geordi:outline-evidence',
  );
  await expect(textReport).toContainText('evidenceKind=outlinePaths');
  await expect(textReport).toContainText(`evidenceHash=${artifactHash(strictTextEvidenceSource)}`);
  await expect(textReport).toContainText(`textProfile=${strictTextFixture.textProfile}`);
  await expect(textReport).toContainText(`positionEncoding=${strictTextFixture.positionEncoding}`);
  await expect(textReport).toContainText('semanticTextAffectsPixels=false');
  await expect(textReport).toContainText(
    'semanticTextRole=non-rendering metadata; pixels follow glyph evidence',
  );
});
