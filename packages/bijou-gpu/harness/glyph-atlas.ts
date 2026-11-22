import probeFontUrl from '../../../fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf?url';
import {
  BijouGpuValidationError,
  createCanvasGlyphRasterizer,
  createGlyphAtlas,
  resolveCanvasGlyphEnvironment,
  watchGlyphAtlasEnvironment,
  type CanvasGlyphSurface,
  type GlyphAtlas,
  type GlyphAtlasCssFont,
  type GlyphAtlasDirtyRect,
  type GlyphAtlasEnvironmentEvent,
  type GlyphAtlasMetrics,
  type GlyphAtlasStats,
} from '../src/index.js';

/**
 * Real-browser probe for the glyph atlas adapter.
 *
 * It wires `createCanvasGlyphRasterizer`, `createGlyphAtlas`, and
 * `watchGlyphAtlasEnvironment` to the page's own canvas, fonts, and device
 * pixel ratio, and publishes what happened on `window.__geordiGlyphAtlasProbe`.
 * Nothing here is deterministic across hosts: glyph pixels come from whatever
 * fonts the browser has.
 */
export const GLYPH_ATLAS_PROBE_FONT_FAMILY = 'GeordiProbe';

const STRICT_FONT: GlyphAtlasCssFont = {
  family: `${GLYPH_ATLAS_PROBE_FONT_FAMILY}, monospace`,
  sizeCssPx: 14,
  cellCssW: 9,
  cellCssH: 17,
};
const EMOJI_FONT: GlyphAtlasCssFont = {
  family: 'sans-serif',
  sizeCssPx: 14,
  cellCssW: 18,
  cellCssH: 18,
};

export interface GlyphAtlasProbeSlot {
  readonly slot: number;
  readonly kind: 'mono' | 'color';
  readonly generation: number;
  /** Texels of the slot with non-zero alpha. */
  readonly inkedTexels: number;
  readonly maxAlpha: number;
  readonly alphaSum: number;
  /** Some texel has unequal RGB. */
  readonly chromatic: boolean;
  /** Every texel has RGB no greater than alpha. */
  readonly premultiplied: boolean;
}

export interface GlyphAtlasProbeState {
  readonly dpr: number;
  readonly watcherDpr: number;
  readonly generation: number;
  readonly metrics: GlyphAtlasMetrics;
  readonly stats: GlyphAtlasStats;
  readonly needsFullRefresh: boolean;
  readonly rasterizerFontPx: number;
  readonly bitmapBytes: number;
  readonly events: readonly GlyphAtlasEnvironmentEvent[];
}

export interface GlyphAtlasProbe {
  readonly ready: true;
  state(): GlyphAtlasProbeState;
  /** Resolve through the strict atlas (OffscreenCanvas rasterizer). */
  resolve(grapheme: string, bold: boolean): GlyphAtlasProbeSlot | string | null;
  /** Resolve through the non-strict atlas (HTMLCanvasElement rasterizer). */
  resolveLoose(grapheme: string): GlyphAtlasProbeSlot | string | null;
  /** Ink produced by a rasterizer that uses the default canvas factory. */
  defaultFactoryInkedTexels(grapheme: string): number;
  takeDirtyRects(): GlyphAtlasDirtyRect[];
  consumeFullRefresh(): boolean;
  /** Load the probe web font into `document.fonts`. */
  loadProbeFont(): Promise<string>;
}

declare global {
  interface Window {
    __geordiGlyphAtlasProbe?: GlyphAtlasProbe;
    __geordiGlyphAtlasProbeError?: string;
  }
}

class GlyphAtlasProbeError extends Error {
  constructor(detail: string) {
    super(`bijou-gpu glyph atlas probe: ${detail}`);
    this.name = new.target.name;
  }
}

function describeSlot(atlas: GlyphAtlas, grapheme: string, bold: boolean): GlyphAtlasProbeSlot | string | null {
  let ref;
  try {
    ref = atlas.resolve(grapheme, bold);
  } catch (error) {
    if (error instanceof BijouGpuValidationError) {
      return error.code;
    }
    throw error;
  }
  if (ref === null) {
    return null;
  }
  const { cellPxW, cellPxH, atlasCols, rgba } = atlas.bitmap;
  const originX = (ref.slot % atlasCols) * cellPxW;
  const originY = Math.floor(ref.slot / atlasCols) * cellPxH;
  let inkedTexels = 0;
  let maxAlpha = 0;
  let alphaSum = 0;
  let chromatic = false;
  let premultiplied = true;
  for (let ly = 0; ly < cellPxH; ly += 1) {
    for (let lx = 0; lx < cellPxW; lx += 1) {
      const offset = ((originY + ly) * atlasCols * cellPxW + originX + lx) * 4;
      const [r = 0, g = 0, b = 0, a = 0] = rgba.subarray(offset, offset + 4);
      if (a > 0) {
        inkedTexels += 1;
        chromatic ||= r !== g || g !== b;
      }
      maxAlpha = Math.max(maxAlpha, a);
      alphaSum += a;
      premultiplied &&= r <= a && g <= a && b <= a;
    }
  }
  return { ...ref, inkedTexels, maxAlpha, alphaSum, chromatic, premultiplied };
}

function boot(): GlyphAtlasProbe {
  const element = document.querySelector<HTMLCanvasElement>('#bijou-gpu-glyph-atlas');
  if (element === null) {
    throw new GlyphAtlasProbeError('probe canvas is missing');
  }
  const events: GlyphAtlasEnvironmentEvent[] = [];

  const strict = resolveCanvasGlyphEnvironment(STRICT_FONT, window.devicePixelRatio);
  const offscreen = (width: number, height: number): CanvasGlyphSurface => new OffscreenCanvas(width, height);
  const strictRasterizer = createCanvasGlyphRasterizer({ font: strict.font, createCanvas: offscreen });
  const strictAtlas = createGlyphAtlas({
    rasterizer: strictRasterizer,
    atlasCols: 8,
    atlasRows: 4,
    metrics: strict.metrics,
  });
  const watcher = watchGlyphAtlasEnvironment({
    atlas: strictAtlas,
    rasterizer: strictRasterizer,
    font: STRICT_FONT,
    element,
    onInvalidate: (event) => events.push(event),
  });

  const loose = resolveCanvasGlyphEnvironment(EMOJI_FONT, window.devicePixelRatio);
  const domCanvas = (width: number, height: number): CanvasGlyphSurface => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const looseAtlas = createGlyphAtlas({
    rasterizer: createCanvasGlyphRasterizer({ font: loose.font, createCanvas: domCanvas }),
    atlasCols: 4,
    atlasRows: 2,
    metrics: loose.metrics,
    strictCanonical: false,
  });

  return {
    ready: true,
    state: () => ({
      dpr: window.devicePixelRatio,
      watcherDpr: watcher.dpr,
      generation: strictAtlas.generation,
      metrics: strictAtlas.metrics,
      stats: strictAtlas.getStats(),
      needsFullRefresh: strictAtlas.needsFullRefresh,
      rasterizerFontPx: strictRasterizer.font.sizePx,
      bitmapBytes: strictAtlas.bitmap.rgba.length,
      events: [...events],
    }),
    resolve: (grapheme, bold) => describeSlot(strictAtlas, grapheme, bold),
    resolveLoose: (grapheme) => describeSlot(looseAtlas, grapheme, false),
    defaultFactoryInkedTexels: (grapheme) => {
      const rasterizer = createCanvasGlyphRasterizer({ font: strict.font });
      const pixels = rasterizer.rasterize({ grapheme, bold: false, ...strict.metrics });
      let inked = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        inked += (pixels[offset] ?? 0) > 0 ? 1 : 0;
      }
      return inked;
    },
    takeDirtyRects: () => strictAtlas.takeDirtyRects(),
    consumeFullRefresh: () => strictAtlas.consumeFullRefresh(),
    loadProbeFont: async () => {
      const face = new FontFace(GLYPH_ATLAS_PROBE_FONT_FAMILY, `url(${probeFontUrl})`);
      document.fonts.add(face);
      const loaded = await face.load();
      return loaded.status;
    },
  };
}

try {
  window.__geordiGlyphAtlasProbe = boot();
  document.body.dataset.glyphAtlasProbe = 'ready';
} catch (error) {
  window.__geordiGlyphAtlasProbeError = error instanceof Error ? error.message : String(error);
  document.body.dataset.glyphAtlasProbe = 'error';
}
