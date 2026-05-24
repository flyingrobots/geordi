import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  parseRenderFixtureManifest,
  assertRenderFixturePixelProbes,
  renderFixtureRgbaFromBytes,
  type RenderFixtureManifest,
  type RenderFixturePixelProbe,
  type RenderFixtureRgba,
} from '@flyingrobots/geordi-render-fixture';
import { compileGpvueSource } from '@flyingrobots/geordi-gpvue';

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

class BrowserGateCanvasEvaluationError extends Error {
  public readonly reason: string;

  constructor(reason: string) {
    super('Browser gate canvas evaluation failed');
    this.name = new.target.name;
    this.reason = reason;
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

function artifactHash(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function probeInputs(probes: readonly RenderFixturePixelProbe[]): readonly ProbeInput[] {
  return probes.map((probe) => ({
    id: probe.id,
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

test('renders the shared hello-panel fixture with exact browser pixel probes', async ({ page }) => {
  const manifest = loadManifest();
  const compiledSceneSource = loadCompiledSceneSource();
  const manifestSource = loadManifestSource();
  let servedCompiledManifest = false;
  let servedCompiledScene = false;

  expect(artifactHash(compiledSceneSource)).toBe(manifest.artifactHash);

  await page.route(/fixture\.json(?:\?.*)?$/u, async (route) => {
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
  await expect(page.getByText('browser-canvas').first()).toBeVisible();
  await expect(page.getByText(manifest.id)).toBeVisible();
  await expect(page.getByText(manifest.artifactHash)).toBeVisible();
  await expect(page.getByText(manifest.runtimeProfile.irVersion)).toBeVisible();
  await expect(page.getByText(manifest.runtimeProfile.numericProfile)).toBeVisible();
  await expect(page.getByText(manifest.runtimeProfile.requires.join(', '))).toBeVisible();
  await expect(page.getByText('browser-canvas-wireframe-mesh')).toBeVisible();
  await expect(page.getByText('vertices=1889')).toBeVisible();
  await expect(page.getByText('faces=3851')).toBeVisible();
  await expect(
    page.getByText(
      'asset=sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6',
    ),
  ).toBeVisible();

  const evaluation = await page.evaluate<CanvasEvaluation, readonly ProbeInput[]>((probes) => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-geordi-render-canvas="true"]',
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

  const bunnyEvaluation = await page.evaluate<CanvasEvaluation>(() => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-geordi-bunny-canvas="true"]',
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
});
