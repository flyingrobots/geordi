import { describe, expect, it } from 'vitest';

import {
  BackendUnavailableError,
  BijouGpuValidationError,
  createCanvasGlyphRasterizer,
  createGlyphAtlas,
  GLYPH_ATLAS_FIRST_GENERATION,
  resolveCanvasGlyphEnvironment,
  watchGlyphAtlasEnvironment,
  type CanvasGlyphContext,
  type CanvasGlyphFont,
  type CanvasGlyphSurface,
  type GlyphAtlasCssFont,
  type GlyphAtlasEnvironmentEvent,
  type GlyphAtlasEnvironmentHost,
} from './index.js';

const FONT: CanvasGlyphFont = { family: '"Fira Code", monospace', sizePx: 16 };
const CSS_FONT: GlyphAtlasCssFont = {
  family: '"Fira Code", monospace',
  sizeCssPx: 14,
  cellCssW: 9,
  cellCssH: 17,
};

interface FakeCanvas {
  readonly surface: CanvasGlyphSurface;
  readonly log: string[];
  created: number;
  /** Text metrics the fake context reports. */
  metrics: { width: number; fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number };
  contextAvailable: boolean;
  /** RGBA every pixel of a read-back holds. */
  ink: readonly [number, number, number, number];
}

/** A canvas that records every 2D call instead of drawing. */
function fakeCanvas(): FakeCanvas & {
  readonly createCanvas: (width: number, height: number) => CanvasGlyphSurface;
} {
  const log: string[] = [];
  const state: FakeCanvas = {
    log,
    created: 0,
    metrics: { width: 9.6, fontBoundingBoxAscent: 15.2, fontBoundingBoxDescent: 4.1 },
    contextAvailable: true,
    ink: [255, 255, 255, 200],
    surface: {
      width: 0,
      height: 0,
      getContext: (id, settings) => {
        log.push(`getContext ${id} ${String(settings?.willReadFrequently)} ${String(settings?.colorSpace)}`);
        return state.contextAvailable ? context : null;
      },
    },
  };
  const context: CanvasGlyphContext = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    textAlign: '',
    clearRect: (x, y, width, height) => {
      log.push(`clearRect ${String(x)} ${String(y)} ${String(width)} ${String(height)}`);
    },
    measureText: (text) => {
      log.push(`measureText ${text} [${context.font}]`);
      return state.metrics;
    },
    fillText: (text, x, y) => {
      log.push(
        `fillText ${text} ${String(x)} ${String(y)} [${context.font}] ${typeof context.fillStyle === 'string' ? context.fillStyle : 'object'} ${context.textBaseline} ${context.textAlign}`,
      );
    },
    getImageData: (x, y, width, height) => {
      log.push(`getImageData ${String(x)} ${String(y)} ${String(width)} ${String(height)}`);
      const data = new Uint8ClampedArray(width * height * 4);
      for (let offset = 0; offset < data.length; offset += 4) {
        data.set(state.ink, offset);
      }
      return { data };
    },
  };
  return Object.assign(state, {
    createCanvas: (width: number, height: number): CanvasGlyphSurface => {
      state.created += 1;
      state.surface.width = width;
      state.surface.height = height;
      return state.surface;
    },
  });
}

const REQUEST = { grapheme: 'A', bold: false, cellPxW: 10, cellPxH: 20, fontIdentity: 'x' };

describe('createCanvasGlyphRasterizer', () => {
  it('draws white ink at an integer origin with the regular or bold font and reads the cell back', () => {
    const canvas = fakeCanvas();
    const rasterizer = createCanvasGlyphRasterizer({ font: FONT, createCanvas: canvas.createCanvas });

    const pixels = rasterizer.rasterize(REQUEST);
    expect(pixels).toHaveLength(10 * 20 * 4);
    expect(Array.from(pixels).slice(0, 4)).toEqual([255, 255, 255, 200]);
    // x = round((10 - 9.6) / 2) = 0; baseline = round((20 - 19.3) / 2 + 15.2) = 16.
    expect(canvas.log).toEqual([
      'getContext 2d true srgb',
      'clearRect 0 0 10 20',
      'measureText A [400 16px "Fira Code", monospace]',
      'fillText A 0 16 [400 16px "Fira Code", monospace] #ffffff alphabetic left',
      'getImageData 0 0 10 20',
    ]);

    canvas.log.length = 0;
    canvas.metrics = { width: 7, fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 3 };
    rasterizer.rasterize({ ...REQUEST, grapheme: 'é', bold: true });
    // x = round((10 - 7) / 2) = 2 (1.5 rounds up); baseline = round(1.5 + 14) = 16.
    expect(canvas.log).toContain(
      'fillText é 2 16 [700 16px "Fira Code", monospace] #ffffff alphabetic left',
    );
  });

  it('keeps one scratch canvas and resizes it to each requested cell', () => {
    const canvas = fakeCanvas();
    const rasterizer = createCanvasGlyphRasterizer({ font: FONT, createCanvas: canvas.createCanvas });
    rasterizer.rasterize(REQUEST);
    rasterizer.rasterize({ ...REQUEST, grapheme: 'B' });
    expect([canvas.surface.width, canvas.surface.height]).toEqual([10, 20]);

    const larger = rasterizer.rasterize({ ...REQUEST, cellPxW: 15, cellPxH: 30 });
    expect(larger).toHaveLength(15 * 30 * 4);
    expect([canvas.surface.width, canvas.surface.height]).toEqual([15, 30]);
    expect(canvas.created).toBe(1);
    expect(canvas.log.filter((entry) => entry.startsWith('getContext'))).toHaveLength(1);
    expect(canvas.log.at(-1)).toBe('getImageData 0 0 15 30');
  });

  it('falls back to size-derived ascent and descent when the host reports no font bounding box', () => {
    const canvas = fakeCanvas();
    canvas.metrics = { width: 10 };
    const rasterizer = createCanvasGlyphRasterizer({ font: FONT, createCanvas: canvas.createCanvas });
    rasterizer.rasterize(REQUEST);
    // ascent 0.8 * 16 = 12.8, descent 0.2 * 16 = 3.2; baseline = round(2 + 12.8) = 15.
    expect(canvas.log).toContain(
      'fillText A 0 15 [400 16px "Fira Code", monospace] #ffffff alphabetic left',
    );
  });

  it('applies custom weights and a later setFont()', () => {
    const canvas = fakeCanvas();
    const rasterizer = createCanvasGlyphRasterizer({
      font: { family: 'Probe', sizePx: 12, regularWeight: '300', boldWeight: '600' },
      createCanvas: canvas.createCanvas,
    });
    rasterizer.rasterize({ ...REQUEST, bold: true });
    expect(canvas.log.some((entry) => entry.includes('[600 12px Probe]'))).toBe(true);

    rasterizer.setFont({ family: 'Probe', sizePx: 24 });
    expect(rasterizer.font).toEqual({ family: 'Probe', sizePx: 24 });
    rasterizer.rasterize(REQUEST);
    expect(canvas.log.at(-2)).toContain('[400 24px Probe]');
  });

  it('rejects an empty family or a non-finite, non-positive size', () => {
    const canvas = fakeCanvas();
    const codeOf = (font: CanvasGlyphFont): string | undefined => {
      try {
        createCanvasGlyphRasterizer({ font, createCanvas: canvas.createCanvas });
      } catch (error) {
        return error instanceof BijouGpuValidationError ? `${error.code} ${error.path}` : undefined;
      }
      return undefined;
    };
    expect(codeOf({ family: '', sizePx: 16 })).toBe(
      'GEORDI_E_BIJOU_INVALID_ATLAS canvasGlyphFont.family',
    );
    for (const sizePx of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeOf({ family: 'Probe', sizePx })).toBe(
        'GEORDI_E_BIJOU_INVALID_ATLAS canvasGlyphFont.sizePx',
      );
    }
    const rasterizer = createCanvasGlyphRasterizer({ font: FONT, createCanvas: canvas.createCanvas });
    expect(() => {
      rasterizer.setFont({ family: 'Probe', sizePx: 0 });
    }).toThrow(BijouGpuValidationError);
    expect(rasterizer.font).toEqual(FONT);
  });

  it('refuses with BackendUnavailableError when the host has no canvas or no 2D context', () => {
    // Node has neither OffscreenCanvas nor document.
    const hostless = createCanvasGlyphRasterizer({ font: FONT });
    expect(() => hostless.rasterize(REQUEST)).toThrow(BackendUnavailableError);

    const canvas = fakeCanvas();
    canvas.contextAvailable = false;
    const contextless = createCanvasGlyphRasterizer({ font: FONT, createCanvas: canvas.createCanvas });
    let caught: BackendUnavailableError | undefined;
    try {
      contextless.rasterize(REQUEST);
    } catch (error) {
      if (error instanceof BackendUnavailableError) {
        caught = error;
      }
    }
    expect(caught?.code).toBe('GEORDI_E_BIJOU_BACKEND_UNAVAILABLE');
    expect(caught?.backend).toBe('canvas2d');
  });

  it('feeds the atlas core: canvas ink becomes a monochrome slot, colour ink a colour slot', () => {
    const canvas = fakeCanvas();
    const rasterizer = createCanvasGlyphRasterizer({ font: FONT, createCanvas: canvas.createCanvas });
    const atlas = createGlyphAtlas({
      rasterizer,
      atlasCols: 2,
      atlasRows: 1,
      metrics: { cellPxW: 10, cellPxH: 20, fontIdentity: 'Probe 16px' },
    });
    expect(atlas.resolve('A', false)).toEqual({ slot: 0, kind: 'mono', generation: 1 });
    expect(Array.from(atlas.bitmap.rgba.subarray(0, 4))).toEqual([255, 255, 255, 200]);

    canvas.ink = [255, 204, 0, 255];
    expect(atlas.resolve('♥', false)).toEqual({ slot: 1, kind: 'color', generation: 1 });
  });
});

describe('resolveCanvasGlyphEnvironment', () => {
  it('snaps cell and font sizes to integer physical pixels at DPR 1, 1.5, and 2', () => {
    expect(resolveCanvasGlyphEnvironment(CSS_FONT, 1)).toEqual({
      dpr: 1,
      metrics: { cellPxW: 9, cellPxH: 17, fontIdentity: '"Fira Code", monospace 14px' },
      font: { family: '"Fira Code", monospace', sizePx: 14 },
    });
    expect(resolveCanvasGlyphEnvironment(CSS_FONT, 1.5)).toEqual({
      dpr: 1.5,
      metrics: { cellPxW: 14, cellPxH: 26, fontIdentity: '"Fira Code", monospace 21px' },
      font: { family: '"Fira Code", monospace', sizePx: 21 },
    });
    expect(resolveCanvasGlyphEnvironment(CSS_FONT, 2)).toEqual({
      dpr: 2,
      metrics: { cellPxW: 18, cellPxH: 34, fontIdentity: '"Fira Code", monospace 28px' },
      font: { family: '"Fira Code", monospace', sizePx: 28 },
    });
  });

  it('carries weights through and never yields a zero font size', () => {
    const environment = resolveCanvasGlyphEnvironment(
      { ...CSS_FONT, sizeCssPx: 0.3, regularWeight: '300', boldWeight: '600' },
      1,
    );
    expect(environment.font).toEqual({
      family: '"Fira Code", monospace',
      sizePx: 1,
      regularWeight: '300',
      boldWeight: '600',
    });
  });

  it('rejects a non-finite or non-positive DPR or font size', () => {
    for (const dpr of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveCanvasGlyphEnvironment(CSS_FONT, dpr)).toThrow(BijouGpuValidationError);
    }
    expect(() => resolveCanvasGlyphEnvironment({ ...CSS_FONT, sizeCssPx: Number.NaN }, 1)).toThrow(
      BijouGpuValidationError,
    );
  });
});

interface FakeMediaQuery {
  readonly query: string;
  readonly listeners: Set<() => void>;
}

interface FakeHost {
  readonly host: GlyphAtlasEnvironmentHost;
  dpr: number;
  readonly queries: FakeMediaQuery[];
  readonly fontListeners: Set<() => void>;
  resolveFontsReady(): Promise<void>;
  readonly observed: { target: object; box: string | undefined }[];
  resizeCallbacks: (() => void)[];
  disconnects: number;
  observeThrows: boolean;
}

class FakeObserveError extends Error {}

function fakeHost(dpr: number): FakeHost {
  let resolveReady: (value: object) => void = () => undefined;
  const ready = new Promise<object>((resolve) => {
    resolveReady = resolve;
  });
  const state: FakeHost = {
    dpr,
    queries: [],
    fontListeners: new Set(),
    observed: [],
    resizeCallbacks: [],
    disconnects: 0,
    observeThrows: false,
    resolveFontsReady: async () => {
      resolveReady({});
      await ready;
      await Promise.resolve();
    },
    host: {
      get devicePixelRatio() {
        return state.dpr;
      },
      matchMedia: (query) => {
        const entry: FakeMediaQuery = { query, listeners: new Set() };
        state.queries.push(entry);
        return {
          addEventListener: (_type, listener) => {
            entry.listeners.add(listener);
          },
          removeEventListener: (_type, listener) => {
            entry.listeners.delete(listener);
          },
        };
      },
      fonts: {
        ready,
        addEventListener: (_type, listener) => {
          state.fontListeners.add(listener);
        },
        removeEventListener: (_type, listener) => {
          state.fontListeners.delete(listener);
        },
      },
      ResizeObserver: class {
        constructor(callback: () => void) {
          state.resizeCallbacks.push(callback);
        }
        observe(target: object, options?: { box?: string }): void {
          if (state.observeThrows) {
            throw new FakeObserveError('device-pixel-content-box is not supported');
          }
          state.observed.push({ target, box: options?.box });
        }
        disconnect(): void {
          state.disconnects += 1;
        }
      },
    },
  };
  return state;
}

function fire(listeners: Iterable<() => void>): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function setup(dpr = 1) {
  const fake = fakeHost(dpr);
  const canvas = fakeCanvas();
  const initial = resolveCanvasGlyphEnvironment(CSS_FONT, dpr);
  const rasterizer = createCanvasGlyphRasterizer({ font: initial.font, createCanvas: canvas.createCanvas });
  const atlas = createGlyphAtlas({ rasterizer, atlasCols: 4, atlasRows: 2, metrics: initial.metrics });
  const events: GlyphAtlasEnvironmentEvent[] = [];
  return { fake, canvas, rasterizer, atlas, events };
}

describe('watchGlyphAtlasEnvironment: DPR changes', () => {
  it('re-arms a resolution media query per DPR and invalidates at snapped metrics for 1 -> 1.5 -> 2', () => {
    const { fake, rasterizer, atlas, events } = setup(1);
    const watcher = watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: fake.host,
      onInvalidate: (event) => events.push(event),
    });
    expect(watcher.dpr).toBe(1);
    expect(fake.queries.map((entry) => entry.query)).toEqual(['(resolution: 1dppx)']);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    const early = atlas.resolve('A', false);

    fake.dpr = 1.5;
    fire(fake.queries[0]?.listeners ?? []);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(atlas.metrics).toEqual({ cellPxW: 14, cellPxH: 26, fontIdentity: '"Fira Code", monospace 21px' });
    expect(atlas.lastInvalidation?.reason).toBe('dpr-change');
    expect(atlas.needsFullRefresh).toBe(true);
    expect(early !== null && atlas.isCurrent(early)).toBe(false);
    expect(rasterizer.font.sizePx).toBe(21);
    expect(watcher.dpr).toBe(1.5);
    // The spent query is released and the new DPR is watched.
    expect(fake.queries[0]?.listeners.size).toBe(0);
    expect(fake.queries.map((entry) => entry.query)).toEqual(['(resolution: 1dppx)', '(resolution: 1.5dppx)']);
    expect(fake.queries[1]?.listeners.size).toBe(1);

    fake.dpr = 2;
    fire(fake.queries[1]?.listeners ?? []);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 2);
    expect(atlas.metrics).toEqual({ cellPxW: 18, cellPxH: 34, fontIdentity: '"Fira Code", monospace 28px' });
    expect(Number.isInteger(atlas.bitmap.cellPxW) && Number.isInteger(atlas.bitmap.cellPxH)).toBe(true);
    expect(rasterizer.font.sizePx).toBe(28);

    expect(events).toEqual([
      {
        reason: 'dpr-change',
        dpr: 1.5,
        generation: GLYPH_ATLAS_FIRST_GENERATION + 1,
        metrics: { cellPxW: 14, cellPxH: 26, fontIdentity: '"Fira Code", monospace 21px' },
      },
      {
        reason: 'dpr-change',
        dpr: 2,
        generation: GLYPH_ATLAS_FIRST_GENERATION + 2,
        metrics: { cellPxW: 18, cellPxH: 34, fontIdentity: '"Fira Code", monospace 28px' },
      },
    ]);
    watcher.dispose();
  });

  it('ignores a media-query change that leaves the DPR where it was', () => {
    const { fake, rasterizer, atlas, events } = setup(2);
    watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: fake.host,
      onInvalidate: (event) => events.push(event),
    });
    fire(fake.queries[0]?.listeners ?? []);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(events).toEqual([]);
    // Still armed for the next real change.
    expect(fake.queries.at(-1)?.listeners.size).toBe(1);
  });

  it('uses a device-pixel-content-box ResizeObserver on the element as a second DPR trigger', () => {
    const { fake, rasterizer, atlas } = setup(1);
    const element = { id: 'canvas' };
    watchGlyphAtlasEnvironment({ atlas, rasterizer, font: CSS_FONT, host: fake.host, element });
    expect(fake.observed).toEqual([{ target: element, box: 'device-pixel-content-box' }]);

    // An ordinary resize at the same DPR changes nothing.
    fire(fake.resizeCallbacks);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);

    fake.dpr = 2;
    fire(fake.resizeCallbacks);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(atlas.metrics.cellPxW).toBe(18);
    // The later media-query event for the same change is not counted twice.
    fire(fake.queries[0]?.listeners ?? []);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
  });

  it('keeps working through the media query when the box option is unsupported', () => {
    const { fake, rasterizer, atlas } = setup(1);
    fake.observeThrows = true;
    watchGlyphAtlasEnvironment({ atlas, rasterizer, font: CSS_FONT, host: fake.host, element: {} });
    fake.dpr = 2;
    fire(fake.queries[0]?.listeners ?? []);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
  });

  it('reports metrics the ABI cannot hold to onError and leaves the atlas untouched', () => {
    const { fake, rasterizer, atlas } = setup(1);
    const errors: BijouGpuValidationError[] = [];
    watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: fake.host,
      onError: (error) => errors.push(error),
    });
    // 17 CSS px * 16 = 272 physical px, beyond the 256 px cell bound.
    fake.dpr = 16;
    fire(fake.queries[0]?.listeners ?? []);
    expect(errors.map((error) => error.code)).toEqual(['GEORDI_E_BIJOU_INVALID_CELL_METRICS']);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(atlas.metrics.cellPxW).toBe(9);
    expect(rasterizer.font.sizePx).toBe(14);

    // Without onError the listener throws rather than hiding the refusal.
    const second = setup(1);
    watchGlyphAtlasEnvironment({
      atlas: second.atlas,
      rasterizer: second.rasterizer,
      font: CSS_FONT,
      host: second.fake.host,
    });
    second.fake.dpr = 16;
    expect(() => {
      fire(second.fake.queries[0]?.listeners ?? []);
    }).toThrow(BijouGpuValidationError);
  });
});

describe('watchGlyphAtlasEnvironment: font arrival', () => {
  it('flushes glyphs cached before document.fonts.ready resolved', async () => {
    const { fake, canvas, rasterizer, atlas, events } = setup(1);
    watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: fake.host,
      onInvalidate: (event) => events.push(event),
    });
    const early = atlas.resolve('A', false);
    expect(Array.from(atlas.bitmap.rgba.subarray(0, 4))).toEqual([255, 255, 255, 200]);

    // The web font lands and the same glyph now draws differently.
    canvas.ink = [255, 255, 255, 90];
    await fake.resolveFontsReady();
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(atlas.lastInvalidation?.reason).toBe('font-ready');
    expect(atlas.needsFullRefresh).toBe(true);
    expect(early !== null && atlas.isCurrent(early)).toBe(false);
    expect(atlas.metrics).toEqual({ cellPxW: 9, cellPxH: 17, fontIdentity: '"Fira Code", monospace 14px' });
    expect(events.map((event) => event.reason)).toEqual(['font-ready']);

    atlas.resolve('A', false);
    expect(Array.from(atlas.bitmap.rgba.subarray(0, 4))).toEqual([255, 255, 255, 90]);
  });

  it('does not start a generation when nothing was rasterized before the fonts were ready', async () => {
    const { fake, rasterizer, atlas, events } = setup(1);
    watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: fake.host,
      onInvalidate: (event) => events.push(event),
    });
    await fake.resolveFontsReady();
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(events).toEqual([]);
  });

  it('flushes again when a later font finishes loading', async () => {
    const { fake, rasterizer, atlas } = setup(1);
    watchGlyphAtlasEnvironment({ atlas, rasterizer, font: CSS_FONT, host: fake.host });
    await fake.resolveFontsReady();
    atlas.resolve('A', false);
    expect(fake.fontListeners.size).toBe(1);

    fire(fake.fontListeners);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
    expect(atlas.lastInvalidation?.reason).toBe('font-ready');
    // Nothing cached since: a second event is a no-op.
    fire(fake.fontListeners);
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION + 1);
  });
});

describe('watchGlyphAtlasEnvironment: lifetime', () => {
  it('dispose() releases every listener and ignores a late fonts.ready', async () => {
    const { fake, rasterizer, atlas } = setup(1);
    const watcher = watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: fake.host,
      element: {},
    });
    atlas.resolve('A', false);
    const armed = [...(fake.queries[0]?.listeners ?? [])];
    const fontListeners = [...fake.fontListeners];
    watcher.dispose();
    watcher.dispose();

    expect(fake.queries[0]?.listeners.size).toBe(0);
    expect(fake.fontListeners.size).toBe(0);
    expect(fake.disconnects).toBe(1);

    fake.dpr = 2;
    fire(armed);
    fire(fontListeners);
    fire(fake.resizeCallbacks);
    await fake.resolveFontsReady();
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
    expect(fake.queries).toHaveLength(1);
  });

  it('works on a host with no matchMedia, fonts, or ResizeObserver', () => {
    const { rasterizer, atlas } = setup(1);
    const watcher = watchGlyphAtlasEnvironment({
      atlas,
      rasterizer,
      font: CSS_FONT,
      host: { devicePixelRatio: 2 },
      element: {},
    });
    expect(watcher.dpr).toBe(2);
    watcher.dispose();
    expect(atlas.generation).toBe(GLYPH_ATLAS_FIRST_GENERATION);
  });

  it('refuses with BackendUnavailableError where there is no browser host at all', () => {
    const { rasterizer, atlas } = setup(1);
    expect(() => watchGlyphAtlasEnvironment({ atlas, rasterizer, font: CSS_FONT })).toThrow(
      BackendUnavailableError,
    );
  });
});
