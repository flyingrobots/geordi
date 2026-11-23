import { BackendUnavailableError, BijouGpuValidationError } from './errors.js';
import {
  snapCellMetrics,
  type GlyphAtlas,
  type GlyphAtlasMetrics,
  type GlyphRasterizer,
  type GlyphRasterRequest,
} from './glyph-atlas.js';

/**
 * The browser side of the glyph atlas: a 2D-canvas rasterizer and the
 * listeners that invalidate an atlas when a web font arrives or the device
 * pixel ratio changes.
 *
 * It is an adapter and holds no atlas state. Every host object it touches is
 * described structurally and can be injected, so the package compiles without
 * DOM typings and this module is testable without a browser.
 */

/** The slice of a 2D canvas context the rasterizer uses. */
export interface CanvasGlyphContext {
  font: string;
  fillStyle: string | object;
  textBaseline: string;
  textAlign: string;
  clearRect(x: number, y: number, width: number, height: number): void;
  measureText(text: string): {
    readonly width: number;
    readonly fontBoundingBoxAscent?: number;
    readonly fontBoundingBoxDescent?: number;
  };
  fillText(text: string, x: number, y: number): void;
  getImageData(x: number, y: number, width: number, height: number): { readonly data: ArrayLike<number> };
}

/** The slice of `OffscreenCanvas` or `HTMLCanvasElement` the rasterizer uses. */
export interface CanvasGlyphSurface {
  width: number;
  height: number;
  getContext(
    contextId: '2d',
    settings?: { willReadFrequently?: boolean; colorSpace?: 'srgb' },
  ): CanvasGlyphContext | null;
}

/** A font as the canvas draws it, sized in physical pixels. */
export interface CanvasGlyphFont {
  /** A CSS `font-family` list. */
  readonly family: string;
  /** Font size in physical pixels. */
  readonly sizePx: number;
  /** CSS `font-weight` for regular glyphs. Defaults to `400`. */
  readonly regularWeight?: string;
  /** CSS `font-weight` for bold glyphs. Defaults to `700`. */
  readonly boldWeight?: string;
}

export interface CanvasGlyphRasterizerOptions {
  readonly font: CanvasGlyphFont;
  /**
   * Makes the scratch canvas. Defaults to `OffscreenCanvas`, then to
   * `document.createElement('canvas')`.
   */
  readonly createCanvas?: (width: number, height: number) => CanvasGlyphSurface;
}

export interface CanvasGlyphRasterizer extends GlyphRasterizer {
  readonly font: CanvasGlyphFont;
  /** Replace the font. The caller must also invalidate the atlas. */
  setFont(font: CanvasGlyphFont): void;
}

interface CanvasHostGlobals {
  readonly OffscreenCanvas?: new (width: number, height: number) => CanvasGlyphSurface;
  readonly document?: {
    createElement(tagName: 'canvas'): CanvasGlyphSurface;
    readonly fonts?: GlyphAtlasFontSet;
  };
  readonly devicePixelRatio?: number;
  readonly matchMedia?: (query: string) => GlyphAtlasMediaQuery;
  readonly ResizeObserver?: GlyphAtlasResizeObserverConstructor;
}

function hostGlobals(): CanvasHostGlobals {
  // The assertion is redundant only when this file is compiled with DOM typings.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return globalThis as CanvasHostGlobals;
}

function defaultCreateCanvas(width: number, height: number): CanvasGlyphSurface {
  const host = hostGlobals();
  if (host.OffscreenCanvas !== undefined) {
    return new host.OffscreenCanvas(width, height);
  }
  if (host.document !== undefined) {
    const canvas = host.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new BackendUnavailableError('canvas2d', 'this host has no OffscreenCanvas and no document');
}

function assertFont(font: CanvasGlyphFont): void {
  if (font.family.trim().length === 0) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      'canvasGlyphFont.family',
      'expected a non-empty font family',
    );
  }
  if (!Number.isFinite(font.sizePx) || font.sizePx <= 0) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      'canvasGlyphFont.sizePx',
      `expected a finite positive size, received ${String(font.sizePx)}`,
    );
  }
}

/**
 * A {@link GlyphRasterizer} that draws each glyph with `fillText` on one
 * cell-sized scratch canvas and reads it back.
 *
 * Glyphs are drawn in opaque white on a transparent canvas, horizontally
 * centred on the advance width and vertically centred on the font's ascent
 * plus descent, with both origins rounded to whole pixels. The canvas is
 * created on the first glyph; a host with no canvas refuses there with
 * `BackendUnavailableError`.
 */
export function createCanvasGlyphRasterizer(options: CanvasGlyphRasterizerOptions): CanvasGlyphRasterizer {
  assertFont(options.font);
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;
  let font = options.font;
  let surface: CanvasGlyphSurface | undefined;
  let context: CanvasGlyphContext | undefined;

  function contextFor(width: number, height: number): CanvasGlyphContext {
    if (surface === undefined || context === undefined) {
      surface = createCanvas(width, height);
      const created = surface.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      if (created === null) {
        surface = undefined;
        throw new BackendUnavailableError('canvas2d', 'the canvas has no 2d context');
      }
      context = created;
    }
    if (surface.width !== width || surface.height !== height) {
      // Resizing also clears the canvas and resets the context state.
      surface.width = width;
      surface.height = height;
    }
    return context;
  }

  function rasterize(request: GlyphRasterRequest): ArrayLike<number> {
    const { cellPxW, cellPxH } = request;
    const ctx = contextFor(cellPxW, cellPxH);
    ctx.clearRect(0, 0, cellPxW, cellPxH);
    const weight = request.bold ? (font.boldWeight ?? '700') : (font.regularWeight ?? '400');
    ctx.font = `${weight} ${String(font.sizePx)}px ${font.family}`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const measured = ctx.measureText(request.grapheme);
    const ascent = measured.fontBoundingBoxAscent ?? font.sizePx * 0.8;
    const descent = measured.fontBoundingBoxDescent ?? font.sizePx * 0.2;
    const x = Math.round((cellPxW - measured.width) / 2);
    const baseline = Math.round((cellPxH - (ascent + descent)) / 2 + ascent);
    ctx.fillText(request.grapheme, x, baseline);
    return ctx.getImageData(0, 0, cellPxW, cellPxH).data;
  }

  return {
    get font() {
      return font;
    },
    setFont(next) {
      assertFont(next);
      font = next;
    },
    rasterize,
  };
}

/** A terminal font and cell box in CSS pixels. */
export interface GlyphAtlasCssFont {
  readonly family: string;
  readonly sizeCssPx: number;
  readonly cellCssW: number;
  readonly cellCssH: number;
  readonly regularWeight?: string;
  readonly boldWeight?: string;
}

/** A CSS font resolved at one device pixel ratio. */
export interface CanvasGlyphEnvironment {
  readonly dpr: number;
  /** Atlas metrics: integer cell size and `fontIdentity`. */
  readonly metrics: GlyphAtlasMetrics;
  /** The rasterizer font at an integer physical size. */
  readonly font: CanvasGlyphFont;
}

/**
 * Resolve a CSS font at a device pixel ratio: the cell through
 * {@link snapCellMetrics}, the font size as `max(1, Math.round(css * dpr))`,
 * and `fontIdentity` as `"<family> <size>px"`.
 */
export function resolveCanvasGlyphEnvironment(font: GlyphAtlasCssFont, dpr: number): CanvasGlyphEnvironment {
  const cell = snapCellMetrics({ cellCssW: font.cellCssW, cellCssH: font.cellCssH, dpr });
  if (!Number.isFinite(font.sizeCssPx) || font.sizeCssPx <= 0) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_INVALID_ATLAS',
      'glyphAtlasCssFont.sizeCssPx',
      `expected a finite positive size, received ${String(font.sizeCssPx)}`,
    );
  }
  const sizePx = Math.max(1, Math.round(font.sizeCssPx * dpr));
  const resolved: CanvasGlyphFont = {
    family: font.family,
    sizePx,
    ...(font.regularWeight === undefined ? {} : { regularWeight: font.regularWeight }),
    ...(font.boldWeight === undefined ? {} : { boldWeight: font.boldWeight }),
  };
  assertFont(resolved);
  return {
    dpr,
    metrics: { ...cell, fontIdentity: `${font.family} ${String(sizePx)}px` },
    font: resolved,
  };
}

/** The slice of `MediaQueryList` the watcher uses. */
export interface GlyphAtlasMediaQuery {
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/** The slice of `FontFaceSet` (`document.fonts`) the watcher uses. */
export interface GlyphAtlasFontSet {
  readonly ready: PromiseLike<object>;
  addEventListener?(type: 'loadingdone', listener: () => void): void;
  removeEventListener?(type: 'loadingdone', listener: () => void): void;
}

export type GlyphAtlasResizeObserverConstructor = new (callback: () => void) => {
  observe(target: object, options?: { box?: string }): void;
  disconnect(): void;
};

/** The host the watcher listens to. In a browser, built from `window`. */
export interface GlyphAtlasEnvironmentHost {
  readonly devicePixelRatio: number;
  readonly matchMedia?: (query: string) => GlyphAtlasMediaQuery;
  readonly fonts?: GlyphAtlasFontSet;
  readonly ResizeObserver?: GlyphAtlasResizeObserverConstructor;
}

export interface GlyphAtlasEnvironmentEvent {
  readonly reason: 'dpr-change' | 'font-ready';
  readonly dpr: number;
  /** The atlas generation the invalidation produced. */
  readonly generation: number;
  readonly metrics: GlyphAtlasMetrics;
}

export interface GlyphAtlasEnvironmentOptions {
  readonly atlas: GlyphAtlas;
  /** Receives the font resolved at each new DPR before the atlas is reset. */
  readonly rasterizer: Pick<CanvasGlyphRasterizer, 'setFont'>;
  readonly font: GlyphAtlasCssFont;
  /** Defaults to the browser globals. */
  readonly host?: GlyphAtlasEnvironmentHost;
  /**
   * An element to observe with a `device-pixel-content-box` `ResizeObserver`,
   * which reports a DPR change even where the media query does not fire.
   */
  readonly element?: object;
  /** Called after each invalidation, for example to schedule a frame. */
  readonly onInvalidate?: (event: GlyphAtlasEnvironmentEvent) => void;
  /**
   * Called when a new DPR yields metrics the ABI cannot hold. Without it the
   * error is thrown from the host event listener.
   */
  readonly onError?: (error: BijouGpuValidationError) => void;
}

export interface GlyphAtlasEnvironmentWatcher {
  /** The DPR the atlas was last resolved at. */
  readonly dpr: number;
  /** Remove every listener. Idempotent. */
  dispose(): void;
}

function defaultEnvironmentHost(): GlyphAtlasEnvironmentHost {
  const host = hostGlobals();
  const dpr = host.devicePixelRatio;
  if (typeof dpr !== 'number') {
    throw new BackendUnavailableError('canvas2d', 'this host has no devicePixelRatio');
  }
  const fonts = host.document?.fonts;
  return {
    get devicePixelRatio() {
      return host.devicePixelRatio ?? dpr;
    },
    ...(host.matchMedia === undefined ? {} : { matchMedia: host.matchMedia.bind(globalThis) }),
    ...(fonts === undefined ? {} : { fonts }),
    ...(host.ResizeObserver === undefined ? {} : { ResizeObserver: host.ResizeObserver }),
  };
}

/**
 * Keep an atlas valid as the browser environment changes.
 *
 * - **DPR.** A `(resolution: <dpr>dppx)` media query is armed for the current
 *   DPR and re-armed after each change; an optional `device-pixel-content-box`
 *   `ResizeObserver` is a second trigger. When `devicePixelRatio` differs from
 *   the last value seen, the font is resolved at the new DPR, handed to the
 *   rasterizer, and the atlas is invalidated with the snapped integer metrics.
 * - **Fonts.** When `document.fonts.ready` resolves, and on every later
 *   `loadingdone`, the atlas is invalidated if it holds any glyph, because
 *   those glyphs may have been drawn with a fallback font.
 *
 * It does not resolve the initial metrics: create the atlas and rasterizer
 * from {@link resolveCanvasGlyphEnvironment} at the host's current DPR.
 */
export function watchGlyphAtlasEnvironment(options: GlyphAtlasEnvironmentOptions): GlyphAtlasEnvironmentWatcher {
  const { atlas, rasterizer, font, onInvalidate, onError } = options;
  const host = options.host ?? defaultEnvironmentHost();
  let dpr = host.devicePixelRatio;
  let disposed = false;
  let armedQuery: GlyphAtlasMediaQuery | undefined;

  function emit(reason: GlyphAtlasEnvironmentEvent['reason']): void {
    onInvalidate?.({ reason, dpr, generation: atlas.generation, metrics: atlas.metrics });
  }

  function arm(): void {
    armedQuery = host.matchMedia?.(`(resolution: ${String(dpr)}dppx)`);
    armedQuery?.addEventListener('change', checkDpr);
  }

  function disarm(): void {
    armedQuery?.removeEventListener('change', checkDpr);
    armedQuery = undefined;
  }

  function applyDpr(next: number): void {
    // Resolve first: a refusal must leave the rasterizer and the atlas alone.
    const environment = resolveCanvasGlyphEnvironment(font, next);
    rasterizer.setFont(environment.font);
    atlas.invalidate(environment.metrics, 'dpr-change');
    dpr = next;
    disarm();
    arm();
    emit('dpr-change');
  }

  function checkDpr(): void {
    const next = host.devicePixelRatio;
    if (disposed || next === dpr) {
      return;
    }
    try {
      applyDpr(next);
    } catch (error) {
      if (error instanceof BijouGpuValidationError && onError !== undefined) {
        onError(error);
        return;
      }
      throw error;
    }
  }

  function flushFonts(): void {
    if (disposed || atlas.getStats().usedSlots === 0) {
      return;
    }
    atlas.invalidate(undefined, 'font-ready');
    emit('font-ready');
  }

  arm();

  let observer: InstanceType<GlyphAtlasResizeObserverConstructor> | undefined;
  if (options.element !== undefined && host.ResizeObserver !== undefined) {
    observer = new host.ResizeObserver(checkDpr);
    try {
      observer.observe(options.element, { box: 'device-pixel-content-box' });
    } catch {
      // The box is not supported everywhere; the media query still covers DPR.
      observer.disconnect();
      observer = undefined;
    }
  }

  void host.fonts?.ready.then(flushFonts);
  host.fonts?.addEventListener?.('loadingdone', flushFonts);

  return {
    get dpr() {
      return dpr;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disarm();
      observer?.disconnect();
      observer = undefined;
      host.fonts?.removeEventListener?.('loadingdone', flushFonts);
    },
  };
}
