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

function loadManifest(): RenderFixtureManifest {
  return parseRenderFixtureManifest(
    readFileSync(
      new URL('../../../fixtures/render-everywhere/hello-panel/fixture.json', import.meta.url),
      'utf8',
    ),
  );
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

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Geordi Render Everywhere' })).toBeVisible();

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
});
