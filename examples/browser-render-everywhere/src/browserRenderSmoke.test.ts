import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach } from 'vitest';
import { canonicalJsonPort, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';
import {
  BrowserHarnessFetchError,
  BrowserHarnessInvalidIrError,
  createBrowserFetchText,
  renderBrowserFixture,
  type BrowserHarnessFetchText,
} from './browserRenderSmoke.js';

interface CanvasCall {
  readonly args: readonly (number | string)[];
  readonly name: string;
}

class FakeCanvasContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  textAlign: CanvasTextAlign = 'start';
  readonly calls: CanvasCall[] = [];

  fillRect(x: number, y: number, width: number, height: number): void {
    this.push('fillRect', x, y, width, height);
  }

  save(): void {
    this.push('save');
  }

  restore(): void {
    this.push('restore');
  }

  beginPath(): void {
    this.push('beginPath');
  }

  closePath(): void {
    this.push('closePath');
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.push('rect', x, y, width, height);
  }

  fill(): void {
    this.push('fill');
  }

  stroke(): void {
    this.push('stroke');
  }

  moveTo(x: number, y: number): void {
    this.push('moveTo', x, y);
  }

  lineTo(x: number, y: number): void {
    this.push('lineTo', x, y);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.push('arcTo', x1, y1, x2, y2, radius);
  }

  fillText(text: string, x: number, y: number): void {
    this.push('fillText', text, x, y);
  }

  private push(name: string, ...args: (number | string)[]): void {
    this.calls.push({ args, name });
  }
}

class BrowserRenderSmokeTestError extends Error {
  constructor(url: string) {
    super(`Missing test fixture source for ${url}`);
    this.name = new.target.name;
  }
}

class BrowserRenderSmokeJsonShapeError extends Error {
  constructor() {
    super('Expected shared fixture scene JSON to be an object');
    this.name = new.target.name;
  }
}

const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
const originalDocument = hadDocument ? globalThis.document : undefined;

afterEach(() => {
  if (hadDocument && originalDocument) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    return;
  }

  Reflect.deleteProperty(globalThis, 'document');
});

function fixtureSource(path: string): string {
  return readFileSync(
    new URL(`../../../fixtures/render-everywhere/hello-panel/${path}`, import.meta.url),
    'utf8',
  );
}

function fixtureSceneObject(): JsonObject {
  const scene = canonicalJsonPort.parse(fixtureSource('scene.geordi.json'));
  if (isJsonObjectValue(scene)) {
    return scene;
  }

  throw new BrowserRenderSmokeJsonShapeError();
}

function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function makeCanvas(context: CanvasRenderingContext2D | null): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: (contextId: string) => (contextId === '2d' ? context : null),
    setAttribute: () => undefined,
  } as object as HTMLCanvasElement;
}

function installCanvasDocument(canvas: HTMLCanvasElement): void {
  const fakeDocument = {
    createElement: (tagName: string) => {
      expect(tagName).toBe('canvas');
      return canvas;
    },
  } as object as Document;

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  });
}

function makeFixtureFetchText(
  sceneSource = fixtureSource('scene.geordi.json'),
): BrowserHarnessFetchText {
  const sources = new Map<string, string>([
    ['fixture.json', fixtureSource('fixture.json')],
    ['scene.geordi.json', sceneSource],
  ]);

  return (url: string): Promise<string> => {
    const source = sources.get(url);
    if (source === undefined) {
      throw new BrowserRenderSmokeTestError(url);
    }

    return Promise.resolve(source);
  };
}

describe('browser render smoke', () => {
  it('loads and renders the shared hello-panel fixture to one canvas', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    const result = await renderBrowserFixture({
      assets: {
        manifestUrl: 'fixture.json',
        sceneUrl: 'scene.geordi.json',
      },
      fetchText: makeFixtureFetchText(),
    });

    expect(result.manifest.id).toBe('render-everywhere:hello-panel');
    expect(result.ir.scene.width).toBe(640);
    expect(result.ir.scene.height).toBe(360);
    expect(result.canvas).toBe(canvas);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(context.calls.filter((call) => call.name === 'fill')).toHaveLength(8);
  });

  it('rejects invalid IR with a custom browser harness error', async () => {
    const invalidSceneSource = canonicalJsonPort.stringify(
      {
        ...fixtureSceneObject(),
        irVersion: 'geordi-ir/2',
      } satisfies JsonValue,
      { space: 2 },
    );

    await expect(
      renderBrowserFixture({
        assets: {
          manifestUrl: 'fixture.json',
          sceneUrl: 'scene.geordi.json',
        },
        fetchText: makeFixtureFetchText(invalidSceneSource),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessInvalidIrError);
  });

  it('wraps failed fetch responses in a custom browser harness error', async () => {
    const fetchText = createBrowserFetchText(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve(''),
      }),
    );

    await expect(fetchText('missing.json')).rejects.toBeInstanceOf(BrowserHarnessFetchError);
  });
});
