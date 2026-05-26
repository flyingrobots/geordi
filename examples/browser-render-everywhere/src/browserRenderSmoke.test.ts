import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterEach } from 'vitest';
import { canonicalJsonPort, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';
import {
  parseRenderFixtureStrictTextFixtureManifest,
  parseRenderFixtureStrictTextOutlineEvidencePack,
  RenderFixtureArtifactValidationError,
  RenderFixtureInvalidStrictTextEvidenceCoverageError,
  RenderFixtureInvalidStrictTextEvidenceLineBoxError,
} from '@flyingrobots/geordi-render-fixture';
import { GeordiRuntimeUnsupportedProfileError } from '@flyingrobots/geordi-runtime-webgl';
import {
  BrowserHarnessStrictTextFontPackRejectedError,
  BrowserHarnessStrictTextFontReferenceRejectedError,
  BrowserHarnessStrictTextFixtureAcceptedError,
  BrowserHarnessStrictTextOutlineEvidenceRejectedError,
  BrowserHarnessFetchError,
  BrowserHarnessInvalidIrError,
  createBrowserFetchText,
  rejectBrowserStrictTextFixture,
  renderBrowserStrictTextFixture,
  renderBrowserFixture,
  type BrowserHarnessFetchText,
} from './browserRenderSmoke.js';
import { renderStrictTextOutlineGlyphsToCanvas } from './strictTextRender.js';

interface CanvasCall {
  readonly args: readonly (number | string)[];
  readonly name: string;
}

interface FixtureFetchTextOptions {
  readonly fixtureName?: string;
  readonly sceneSource?: string;
}

interface NativeStrictTextMetadataCliOutput extends Record<string, string> {
  readonly rendererName: string;
  readonly smoke: string;
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

  fill(fillRule?: CanvasFillRule): void {
    if (fillRule === undefined) {
      this.push('fill');
      return;
    }

    this.push('fill', fillRule);
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

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.push('quadraticCurveTo', cpx, cpy, x, y);
  }

  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): void {
    this.push('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
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
const originalCrypto = globalThis.crypto;
const HELLO_PANEL_FIXTURE = 'hello-panel';
const UNSUPPORTED_STRICT_TEXT_FIXTURE = 'unsupported-strict-text';
const UNSUPPORTED_RUNTIME_SHAPING_STRICT_TEXT_FIXTURE =
  'unsupported-runtime-shaping.strict-text.geordi.json';

afterEach(() => {
  if (hadDocument && originalDocument) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });
});

function fixtureSource(path: string, fixtureName = HELLO_PANEL_FIXTURE): string {
  return readFileSync(
    new URL(`../../../fixtures/render-everywhere/${fixtureName}/${path}`, import.meta.url),
    'utf8',
  );
}

function strictTextFixtureSource(path: string): string {
  return readFileSync(
    new URL(`../../../fixtures/render-everywhere/strict-text/${path}`, import.meta.url),
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

function fixtureSceneMetadata(): JsonObject {
  const scene = jsonProperty(fixtureSceneObject(), 'scene');
  if (isJsonObjectValue(scene)) {
    return scene;
  }

  throw new BrowserRenderSmokeJsonShapeError();
}

function isJsonObjectValue(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonProperty(object: JsonObject, key: string): JsonValue | undefined {
  return object[key];
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

function installHashingCrypto(): void {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      subtle: {
        digest: (_algorithm: string, data: BufferSource) =>
          Promise.resolve(createHash('sha256').update(bufferSourceBytes(data)).digest()),
      },
    },
  });
}

function makeFixtureFetchText(options: FixtureFetchTextOptions = {}): BrowserHarnessFetchText {
  const fixtureName = options.fixtureName ?? HELLO_PANEL_FIXTURE;
  const sceneSource = options.sceneSource ?? fixtureSource('scene.geordi.json', fixtureName);
  const sources = new Map<string, string>([
    ['fixture.json', fixtureSource('fixture.json', fixtureName)],
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

function makeStrictTextFetchText(sources: ReadonlyMap<string, string>): BrowserHarnessFetchText {
  return (url: string): Promise<string> => {
    const source = sources.get(url);
    if (source === undefined) {
      throw new BrowserRenderSmokeTestError(url);
    }

    return Promise.resolve(source);
  };
}

function sha256ArtifactHash(source: string): Promise<string> {
  return Promise.resolve(sha256ArtifactHashSync(source));
}

function sha256ArtifactHashSync(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function sha256CanonicalJson(value: JsonValue): string {
  return `sha256:${createHash('sha256')
    .update(`${canonicalJsonPort.stringify(value, { space: 2 })}\n`)
    .digest('hex')}`;
}

function nativeStrictTextMetadata(): NativeStrictTextMetadataCliOutput {
  const output = execFileSync(
    'cargo',
    [
      'run',
      '-p',
      'native-render-everywhere',
      '--',
      '--strict-text-smoke',
      'fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json',
    ],
    {
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      encoding: 'utf8',
    },
  );

  return Object.fromEntries(
    output
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  ) as NativeStrictTextMetadataCliOutput;
}

function browserStrictTextParityFields(
  metadata: Awaited<ReturnType<typeof renderBrowserStrictTextFixture>>['metadata'],
): Record<string, string> {
  return {
    commandCount: String(metadata.commandCount),
    drawGlyphCount: String(metadata.drawGlyphCount),
    evidenceHash: metadata.evidenceHash,
    evidenceKind: metadata.evidenceKind,
    evidencePackId: metadata.evidencePackId,
    fixtureHash: metadata.fixtureHash,
    fixtureId: metadata.fixtureId,
    fontPackHash: metadata.fontPackHash,
    fontPackPath: metadata.fontPackPath,
    glyphCount: String(metadata.glyphCount),
    glyphRunHash: metadata.glyphRunHash,
    lineBoxHash: metadata.lineBoxHash,
    positionEncoding: metadata.positionEncoding,
    semanticTextAffectsPixels: String(metadata.semanticTextAffectsPixels),
    semanticTextLanguage: metadata.semanticTextLanguage,
    semanticTextRole: metadata.semanticTextRole,
    semanticTextSource: metadata.semanticTextSource,
    textProfile: metadata.textProfile,
  };
}

function bufferSourceBytes(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
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
      hashArtifact: sha256ArtifactHash,
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
        fetchText: makeFixtureFetchText({ sceneSource: invalidSceneSource }),
        hashArtifact: sha256ArtifactHash,
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessInvalidIrError);
  });

  it('rejects scene bytes that do not match the fixture manifest before drawing', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const mismatchedSceneSource = canonicalJsonPort.stringify(
      {
        ...fixtureSceneObject(),
        scene: {
          ...fixtureSceneMetadata(),
          width: 641,
        },
      } satisfies JsonValue,
      { space: 2 },
    );
    installCanvasDocument(canvas);

    await expect(
      renderBrowserFixture({
        assets: {
          manifestUrl: 'fixture.json',
          sceneUrl: 'scene.geordi.json',
        },
        fetchText: makeFixtureFetchText({ sceneSource: mismatchedSceneSource }),
        hashArtifact: sha256ArtifactHash,
      }),
    ).rejects.toBeInstanceOf(RenderFixtureArtifactValidationError);

    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects unsupported fixture requirements before drawing', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    await expect(
      renderBrowserFixture({
        assets: {
          manifestUrl: 'fixture.json',
          sceneUrl: 'scene.geordi.json',
        },
        fetchText: makeFixtureFetchText({ fixtureName: UNSUPPORTED_STRICT_TEXT_FIXTURE }),
        hashArtifact: sha256ArtifactHash,
      }),
    ).rejects.toBeInstanceOf(GeordiRuntimeUnsupportedProfileError);

    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects unsupported strict text fixture artifacts before drawing', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const fixtureUrl = UNSUPPORTED_RUNTIME_SHAPING_STRICT_TEXT_FIXTURE;
    const sources = new Map<string, string>([
      [
        fixtureUrl,
        strictTextFixtureSource(`failures/${UNSUPPORTED_RUNTIME_SHAPING_STRICT_TEXT_FIXTURE}`),
      ],
    ]);
    installCanvasDocument(canvas);

    const rejection = await rejectBrowserStrictTextFixture({
      assets: { fixtureUrl },
      fetchText: makeStrictTextFetchText(sources),
    });

    expect(rejection).toMatchObject({
      fixtureUrl,
      rejected: true,
    });
    expect(rejection.issues).toContainEqual({
      message: 'Strict text feature is not supported',
      path: '$.features[3]',
    });
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('renders strict text outline glyphs from evidence without canvas text APIs', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);
    const fixture = parseRenderFixtureStrictTextFixtureManifest(
      strictTextFixtureSource('geordi.strict-text.geordi.json'),
    );
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextFixtureSource('geordi.outline-evidence.geordi.json'),
    );

    const result = renderStrictTextOutlineGlyphsToCanvas(fixture, evidence);

    expect(result.canvas).toBe(canvas);
    expect(canvas.width).toBe(192);
    expect(canvas.height).toBe(64);
    expect(result.report).toMatchObject({
      drawGlyphCount: 6,
      evidenceKind: 'outlinePaths',
      fixtureId: 'render-everywhere:strict-text:geordi',
      glyphCount: 6,
      rendererName: 'browser-canvas-outline-glyphs',
    });
    expect(result.report.commandCount).toBeGreaterThan(0);
    expect(context.fillStyle).toBe('rgba(17, 24, 39, 1)');
    expect(context.calls.map((call) => call.name)).toEqual(
      expect.arrayContaining([
        'save',
        'beginPath',
        'moveTo',
        'lineTo',
        'quadraticCurveTo',
        'closePath',
        'fill',
        'restore',
      ]),
    );
    expect(context.calls.some((call) => call.name === 'fillText')).toBe(false);
    expect(context.calls.some((call) => call.name === 'strokeText')).toBe(false);
    expect(context.calls.some((call) => call.name === 'measureText')).toBe(false);
  });

  it('rejects missing strict text glyph evidence before direct canvas drawing', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);
    const fixture = parseRenderFixtureStrictTextFixtureManifest(
      strictTextFixtureSource('geordi.strict-text.geordi.json'),
    );
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextFixtureSource(
        'failures/missing-glyph-evidence.outline-evidence.geordi.json',
      ),
    );

    expect(() => renderStrictTextOutlineGlyphsToCanvas(fixture, evidence)).toThrow(
      RenderFixtureInvalidStrictTextEvidenceCoverageError,
    );
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects unreferenced strict text glyph evidence before direct canvas drawing', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);
    const fixture = parseRenderFixtureStrictTextFixtureManifest(
      strictTextFixtureSource('geordi.strict-text.geordi.json'),
    );
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextFixtureSource(
        'failures/unknown-glyph-evidence.outline-evidence.geordi.json',
      ),
    );

    expect(() => renderStrictTextOutlineGlyphsToCanvas(fixture, evidence)).toThrow(
      RenderFixtureInvalidStrictTextEvidenceCoverageError,
    );
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects strict text evidence outside line boxes before direct canvas drawing', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);
    const fixture = parseRenderFixtureStrictTextFixtureManifest(
      strictTextFixtureSource('failures/bad-line-box.strict-text.geordi.json'),
    );
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextFixtureSource('geordi.outline-evidence.geordi.json'),
    );

    expect(() => renderStrictTextOutlineGlyphsToCanvas(fixture, evidence)).toThrow(
      RenderFixtureInvalidStrictTextEvidenceLineBoxError,
    );
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('loads and renders strict text fixture mode from fixture and evidence assets', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'geordi.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const strictTextSource = strictTextFixtureSource(fixtureUrl);
    const evidenceSource = strictTextFixtureSource(evidenceUrl);
    const fontPackSource = fixtureSource('font-pack.geordi.json', 'assets/fonts');
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextSource],
      [evidenceUrl, evidenceSource],
      [fontPackUrl, fontPackSource],
    ]);
    const fixture = parseRenderFixtureStrictTextFixtureManifest(strictTextSource);
    installCanvasDocument(canvas);
    installHashingCrypto();

    const result = await renderBrowserStrictTextFixture({
      assets: {
        evidenceUrl,
        fontPackUrl,
        fixtureUrl,
      },
      fetchText: makeStrictTextFetchText(sources),
    });

    expect(result.canvas).toBe(canvas);
    expect(result.report.rendererName).toBe('browser-canvas-outline-glyphs');
    expect(result.report.evidencePackId).toBe('render-everywhere:strict-text:geordi:outline-evidence');
    expect(result.metadata).toMatchObject({
      evidenceHash: sha256ArtifactHashSync(evidenceSource),
      evidenceKind: 'outlinePaths',
      evidencePackId: 'render-everywhere:strict-text:geordi:outline-evidence',
      fixtureHash: sha256ArtifactHashSync(strictTextSource),
      fixtureId: 'render-everywhere:strict-text:geordi',
      fontPackHash: sha256ArtifactHashSync(fontPackSource),
      fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      glyphRunHash: sha256CanonicalJson(fixture.glyphRuns),
      lineBoxHash: sha256CanonicalJson(fixture.lineBoxes),
      positionEncoding: 'geordi-fixed-26.6/1',
      rendererName: 'browser-canvas-outline-glyphs',
      semanticTextAffectsPixels: false,
      semanticTextRole: 'non-rendering metadata; pixels follow glyph evidence',
      semanticTextSource: 'GEORDI',
      textProfile: 'geordi-strict-positioned-glyph-run/1',
    });
    expect(context.calls.some((call) => call.name === 'fillText')).toBe(false);
  });

  it('matches native strict text metadata for the canonical fixture', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'geordi.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(evidenceUrl)],
      [fontPackUrl, fixtureSource('font-pack.geordi.json', 'assets/fonts')],
    ]);
    installCanvasDocument(canvas);
    installHashingCrypto();

    const browser = await renderBrowserStrictTextFixture({
      assets: {
        evidenceUrl,
        fontPackUrl,
        fixtureUrl,
      },
      fetchText: makeStrictTextFetchText(sources),
    });
    const native = nativeStrictTextMetadata();

    expect(native.rendererName).toBe('rust-software-outline-glyphs');
    expect(browser.metadata.rendererName).toBe('browser-canvas-outline-glyphs');
    expect(native).toMatchObject(browserStrictTextParityFields(browser.metadata));
    expect(native.smoke).toBe('passed');
  });

  it('rejects invalid strict text evidence before fixture mode drawing', async () => {
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'bad-outline-command.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(`failures/${evidenceUrl}`)],
      [fontPackUrl, fixtureSource('font-pack.geordi.json', 'assets/fonts')],
    ]);
    installHashingCrypto();

    await expect(
      renderBrowserStrictTextFixture({
        assets: {
          evidenceUrl,
          fontPackUrl,
          fixtureUrl,
        },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextOutlineEvidenceRejectedError);
  });

  it('rejects missing strict text glyph evidence before fixture mode drawing', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'missing-glyph-evidence.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(`failures/${evidenceUrl}`)],
      [fontPackUrl, fixtureSource('font-pack.geordi.json', 'assets/fonts')],
    ]);
    installCanvasDocument(canvas);
    installHashingCrypto();

    await expect(
      renderBrowserStrictTextFixture({
        assets: {
          evidenceUrl,
          fontPackUrl,
          fixtureUrl,
        },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextOutlineEvidenceRejectedError);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects unreferenced strict text glyph evidence before fixture mode drawing', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'unknown-glyph-evidence.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(`failures/${evidenceUrl}`)],
      [fontPackUrl, fixtureSource('font-pack.geordi.json', 'assets/fonts')],
    ]);
    installCanvasDocument(canvas);
    installHashingCrypto();

    await expect(
      renderBrowserStrictTextFixture({
        assets: {
          evidenceUrl,
          fontPackUrl,
          fixtureUrl,
        },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextOutlineEvidenceRejectedError);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects strict text evidence outside line boxes before fixture mode drawing', async () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    const fixtureUrl = 'failures/bad-line-box.strict-text.geordi.json';
    const evidenceUrl = 'geordi.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(evidenceUrl)],
      [fontPackUrl, fixtureSource('font-pack.geordi.json', 'assets/fonts')],
    ]);
    installCanvasDocument(canvas);
    installHashingCrypto();

    await expect(
      renderBrowserStrictTextFixture({
        assets: {
          evidenceUrl,
          fontPackUrl,
          fixtureUrl,
        },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextOutlineEvidenceRejectedError);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(context.calls).toHaveLength(0);
  });

  it('rejects invalid strict text font packs before fixture mode drawing', async () => {
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'geordi.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(evidenceUrl)],
      [fontPackUrl, '{}'],
    ]);
    installHashingCrypto();

    await expect(
      renderBrowserStrictTextFixture({
        assets: {
          evidenceUrl,
          fontPackUrl,
          fixtureUrl,
        },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextFontPackRejectedError);
  });

  it('rejects unresolved strict text font references before fixture mode drawing', async () => {
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const evidenceUrl = 'geordi.outline-evidence.geordi.json';
    const fontPackUrl = 'font-pack.geordi.json';
    const fontPackSource = fixtureSource('font-pack.geordi.json', 'assets/fonts').replace(
      '"id": "lato-regular"',
      '"id": "lato-missing"',
    );
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
      [evidenceUrl, strictTextFixtureSource(evidenceUrl)],
      [fontPackUrl, fontPackSource],
    ]);
    installHashingCrypto();

    await expect(
      renderBrowserStrictTextFixture({
        assets: {
          evidenceUrl,
          fontPackUrl,
          fixtureUrl,
        },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextFontReferenceRejectedError);
  });

  it('fails the strict text rejection guard when the artifact is accepted', async () => {
    const fixtureUrl = 'geordi.strict-text.geordi.json';
    const sources = new Map<string, string>([
      [fixtureUrl, strictTextFixtureSource(fixtureUrl)],
    ]);

    await expect(
      rejectBrowserStrictTextFixture({
        assets: { fixtureUrl },
        fetchText: makeStrictTextFetchText(sources),
      }),
    ).rejects.toBeInstanceOf(BrowserHarnessStrictTextFixtureAcceptedError);
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
