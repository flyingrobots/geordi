import { stringifyCanonicalJson } from '@flyingrobots/geordi-core';

import { assertAtlasBitmap, type AtlasBitmap } from './atlas.js';
import { composeCanvas2DCell, fillCanvas2DRect, type Canvas2DFrame } from './canvas2d-compose.js';
import { BackendUnavailableError, BijouGpuValidationError, RendererFaultError } from './errors.js';
import type { GlyphAtlasReceiptAssets } from './glyph-atlas.js';
import {
  absDiff,
  bunnyU32DivRoundEven,
  bunnyU32EllipseClassify,
  divRoundEven,
  lerpU8,
  satSub,
} from './numeric.js';
import { PACKED_BIJOU_CELL_FORMAT } from './packed-cells.js';
import { preparedBufferBytes } from './prepare.js';
import {
  cellFromPoint as sharedCellFromPoint,
  type GpuCellPoint,
  type GpuClientRect,
  type GpuPackedSurface,
  type GpuPresentContext,
  type GpuSurfacePresenter,
  type GpuSurfaceResize,
} from './presenter.js';
import { blockPixelQuarters, boxPixelLit, braillePixelLit, decorationPixelLit } from './procedural.js';
import {
  BIJOU_SURFACE_GPU_ABI,
  PROCEDURAL_GLYPH_TABLE_SHA256,
  type ProceduralGlyphTable,
} from './procedural-table.js';
import {
  BUNNY_PRIMITIVE_PINS,
  ENDPOINT_RECEIPT_VERSION,
  parseEndpointReceipt,
  PROBE_POLICY,
  type EndpointReceipt,
} from './receipt.js';
import { parseHexColor, REFERENCE_DEFAULT_BG, REFERENCE_DEFAULT_FG, samplePixelProbes } from './reference.js';
import { isSha256Hex, sha256Hex, utf8Bytes } from './sha256.js';
import {
  createSurfaceDamageState,
  packSurfaceDamage,
  type ResolveGlyphSlot,
  type SurfaceDamageResult,
} from './surface-damage.js';

/**
 * The Canvas 2D fallback presenter of `bijou-surface-gpu/1`.
 *
 * Pixels are computed on the CPU by the pure-integer compositor in
 * `canvas2d-compose.ts` into a retained frame and copied to the canvas with
 * `putImageData`, one call per horizontal run of changed cells. Canvas drawing
 * operations (`fillRect`, `fillText`, `drawImage`) are never used: they
 * antialias, filter, and premultiply in floating point, and the ABI's
 * conformance bar is a frame hash equal to the CPU oracle's with zero LSB
 * tolerance. The presenter requests a `2d` context and no GPU context.
 *
 * Every host object is described structurally, so the package compiles
 * without DOM typings and the presenter runs against a recording context in
 * unit tests.
 */

/** `backendProfile` of every Canvas 2D receipt. */
export const CANVAS2D_BACKEND_PROFILE = 'geordi-canvas2d/1';

/** Default `adapter.name` of a Canvas 2D receipt. */
export const CANVAS2D_DEFAULT_ADAPTER_NAME = 'canvas2d-imagedata';

/** The slice of `ImageData` the presenter uses. */
export interface Canvas2DImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** The slice of `CanvasRenderingContext2D` the presenter uses. */
export interface Canvas2DSurfaceContext {
  createImageData(width: number, height: number): Canvas2DImageData;
  putImageData(
    image: Canvas2DImageData,
    dx: number,
    dy: number,
    dirtyX: number,
    dirtyY: number,
    dirtyWidth: number,
    dirtyHeight: number,
  ): void;
  getImageData(x: number, y: number, width: number, height: number): { readonly data: ArrayLike<number> };
}

/** Context attributes the presenter requests. */
export interface Canvas2DContextSettings {
  readonly alpha: false;
  readonly colorSpace: 'srgb';
  readonly willReadFrequently: true;
}

/** The slice of `HTMLCanvasElement` or `OffscreenCanvas` the presenter uses. */
export interface Canvas2DSurfaceCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d', settings?: Canvas2DContextSettings): Canvas2DSurfaceContext | null;
  /** Needed by {@link GpuSurfacePresenter.cellFromPoint}; without it hit-testing returns `null`. */
  getBoundingClientRect?(): GpuClientRect;
  addEventListener?(type: 'contextlost' | 'contextrestored', listener: () => void): void;
  removeEventListener?(type: 'contextlost' | 'contextrestored', listener: () => void): void;
}

/**
 * The `GlyphAtlas` members the presenter reads. A `GlyphAtlas` satisfies it;
 * so does a fixed atlas such as the bundled test glyph pack. The presenter
 * reads the bitmap from CPU memory, so it never takes the atlas's dirty rects.
 */
export interface Canvas2DGlyphAtlas {
  /** The live `rgba8uint` atlas, read again after every pack. */
  readonly bitmap: AtlasBitmap;
  readonly resolveSlot: ResolveGlyphSlot;
  readonly atlasGeneration: () => number;
  getReceiptAssets(): GlyphAtlasReceiptAssets;
}

export interface Canvas2DSurfacePresenterOptions {
  readonly canvas: Canvas2DSurfaceCanvas;
  readonly atlas: Canvas2DGlyphAtlas;
  /** From `decodeProceduralGlyphTable(fixtures/bijou-gpu/procedural-glyphs.json)`. */
  readonly proceduralTable: ProceduralGlyphTable;
  /** `uDefaultFg`, uppercase `#RRGGBB`. Defaults to `REFERENCE_DEFAULT_FG`. */
  readonly defaultFg?: string;
  /** `uDefaultBg`, uppercase `#RRGGBB`. Defaults to `REFERENCE_DEFAULT_BG`. */
  readonly defaultBg?: string;
  /** Device pixel ratio recorded until the first `resize`. Defaults to `1`. */
  readonly dpr?: number;
  /**
   * Physical pixels sampled into receipt `probes`. Defaults to the top-left
   * pixel, the centre pixel, and the bottom-right pixel of the canvas.
   */
  readonly probePoints?: readonly (readonly [number, number])[];
  /** Receipt `adapter.name` and `adapter.driver`. */
  readonly adapter?: { readonly name?: string; readonly driver?: string };
  /**
   * Receipt `executedArtifactSha256`, for a host that pins its own bundle.
   * Defaults to the digest of {@link canvas2DExecutedArtifactSource}.
   */
  readonly executedArtifactSha256?: string;
}

/** {@link GpuPresentContext} plus the Canvas 2D presenter's optional input binding. */
export interface Canvas2DPresentContext extends GpuPresentContext {
  /**
   * Receipt `inputReceiptSha256` for this frame, such as the digest of the
   * `packed-bijou-cells/1` receipt the surface came from. When omitted, the
   * receipt binds a copy of the live input taken during `present` (see
   * {@link liveInputSha256}).
   */
  readonly inputReceiptSha256?: string;
}

export interface Canvas2DSurfacePresenter extends GpuSurfacePresenter {
  present(current: GpuPackedSurface, target: GpuPackedSurface, ctx: Canvas2DPresentContext): void;
}

/**
 * The functions whose engine-held source text the default
 * `executedArtifactSha256` pins: the presenter factory and the compositor,
 * and the exported kit functions they call to compute words and pixels.
 * Unexported helpers inside those kit modules are reached through them but are
 * not part of this text.
 */
const EXECUTED_FUNCTIONS: readonly { readonly name: string; toString(): string }[] = [
  createCanvas2DSurfacePresenter,
  composeCanvas2DCell,
  fillCanvas2DRect,
  packSurfaceDamage,
  lerpU8,
  divRoundEven,
  bunnyU32DivRoundEven,
  bunnyU32EllipseClassify,
  satSub,
  absDiff,
  boxPixelLit,
  blockPixelQuarters,
  braillePixelLit,
  decorationPixelLit,
];

/**
 * The executed artifact the default `executedArtifactSha256` pins: the source
 * text the JavaScript engine holds (`Function.prototype.toString`) for each
 * pixel-path function, joined by newlines. It is the code that actually ran,
 * so it differs between the unbundled modules and a minified bundle.
 */
export function canvas2DExecutedArtifactSource(): string {
  return EXECUTED_FUNCTIONS.map((fn) => fn.toString()).join('\n');
}

let executedArtifactDigest: string | undefined;

function defaultExecutedArtifactSha256(): string {
  executedArtifactDigest ??= sha256Hex(utf8Bytes(canvas2DExecutedArtifactSource()));
  return executedArtifactDigest;
}

/**
 * The default `inputReceiptSha256` of a live frame: SHA-256 of the target's
 * raw `bijou-packed-cell-u8x10-le/1` buffer followed by the UTF-8 bytes of
 * `stringifyCanonicalJson(sideTable)` (a compact JSON array of strings).
 */
export function liveInputSha256(buffer: Uint8Array, sideTable: readonly string[]): string {
  const tail = utf8Bytes(stringifyCanonicalJson([...sideTable]));
  const bytes = new Uint8Array(buffer.length + tail.length);
  bytes.set(buffer);
  bytes.set(tail, buffer.length);
  return sha256Hex(bytes);
}

function invalid(path: string, detail: string): never {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_SURFACE', path, detail);
}

const MAX_CANVAS_PX = 0xffff;

function physicalSize(size: GpuSurfaceResize): { width: number; height: number } {
  for (const [label, value] of [
    ['cssWidth', size.cssWidth],
    ['cssHeight', size.cssHeight],
    ['dpr', size.dpr],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      invalid(`resize.${label}`, `expected a finite positive number, received ${String(value)}`);
    }
  }
  const box = size.devicePixelContentBox;
  const width = box?.width ?? Math.max(1, Math.round(size.cssWidth * size.dpr));
  const height = box?.height ?? Math.max(1, Math.round(size.cssHeight * size.dpr));
  for (const [label, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_CANVAS_PX) {
      invalid(
        `resize.${box === undefined ? 'physical' : 'devicePixelContentBox'}.${label}`,
        `expected an integer physical size in 1..${String(MAX_CANVAS_PX)}, received ${String(value)}`,
      );
    }
  }
  return { width, height };
}

interface DrawnState {
  /** The retained frame, the size of the canvas. */
  image: Canvas2DImageData;
  /** Prepared words of every cell as last composited into `image`. */
  words: Uint32Array;
  widthCells: number;
  heightCells: number;
  cellPxW: number;
  cellPxH: number;
}

interface FrameRecord {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly staging: Uint32Array;
  readonly inputReceiptSha256: string | null;
  readonly inputBuffer: Uint8Array | null;
  readonly inputSideTable: readonly string[];
  readonly atlasAssets: GlyphAtlasReceiptAssets;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly dpr: number;
}

/**
 * Create a Canvas 2D presenter on `options.canvas`. It is a synchronous
 * `GpuSurfacePresenterFactory<Canvas2DSurfacePresenterOptions>`.
 *
 * @throws BackendUnavailableError when the canvas has no 2D context.
 * @throws BijouGpuValidationError for invalid theme colours, DPR, or
 *   `executedArtifactSha256`.
 */
export function createCanvas2DSurfacePresenter(
  options: Canvas2DSurfacePresenterOptions,
): Canvas2DSurfacePresenter {
  const { canvas, atlas, proceduralTable } = options;
  const defaultFgHex = options.defaultFg ?? REFERENCE_DEFAULT_FG;
  const defaultBgHex = options.defaultBg ?? REFERENCE_DEFAULT_BG;
  const theme = {
    defaultFg: parseHexColor(defaultFgHex, 'options.defaultFg'),
    defaultBg: parseHexColor(defaultBgHex, 'options.defaultBg'),
  };
  let dpr = options.dpr ?? 1;
  if (!Number.isFinite(dpr) || dpr <= 0) {
    invalid('options.dpr', `expected a finite positive number, received ${String(dpr)}`);
  }
  const executedArtifactSha256 = options.executedArtifactSha256 ?? defaultExecutedArtifactSha256();
  if (!isSha256Hex(executedArtifactSha256)) {
    invalid('options.executedArtifactSha256', 'expected a lowercase 64-hex SHA-256 digest');
  }
  const adapter = {
    backend: 'canvas2d' as const,
    name: options.adapter?.name ?? CANVAS2D_DEFAULT_ADAPTER_NAME,
    driver: options.adapter?.driver ?? hostUserAgent(),
  };

  const created = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb', willReadFrequently: true });
  if (created === null) {
    throw new BackendUnavailableError('canvas2d', 'the canvas has no 2d context');
  }
  const context: Canvas2DSurfaceContext = created;

  const damage = createSurfaceDamageState();
  let drawn: DrawnState | null = null;
  let pendingFullRefresh = true;
  let lastFrame: FrameRecord | null = null;
  let cachedReceipt: EndpointReceipt | null = null;
  let inputCopy = new Uint8Array(0);
  let disposed = false;

  const onContextLost = (): void => {
    pendingFullRefresh = true;
  };
  const onContextRestored = (): void => {
    // The backing store comes back blank; repaint the retained frame now
    // instead of waiting for the application to render again.
    if (disposed || drawn === null) {
      return;
    }
    const { image } = drawn;
    if (image.width === canvas.width && image.height === canvas.height) {
      context.putImageData(image, 0, 0, 0, 0, image.width, image.height);
      pendingFullRefresh = false;
    }
  };
  canvas.addEventListener?.('contextlost', onContextLost);
  canvas.addEventListener?.('contextrestored', onContextRestored);

  function assertLive(): void {
    if (disposed) {
      throw new RendererFaultError('canvas2d', 'the presenter has been disposed');
    }
  }

  function frameImage(): Canvas2DImageData {
    if (drawn?.image.width === canvas.width && drawn.image.height === canvas.height) {
      return drawn.image;
    }
    const image = context.createImageData(canvas.width, canvas.height);
    if (image.width !== canvas.width || image.height !== canvas.height || image.data.length !== canvas.width * canvas.height * 4) {
      throw new RendererFaultError(
        'canvas2d',
        `createImageData returned ${String(image.width)}x${String(image.height)} for a ${String(canvas.width)}x${String(canvas.height)} canvas`,
      );
    }
    return image;
  }

  function drawFull(result: SurfaceDamageResult, bitmap: AtlasBitmap): void {
    const image = frameImage();
    const frame: Canvas2DFrame = image;
    const { widthCells, heightCells, staging } = result;
    const gridW = widthCells * bitmap.cellPxW;
    const gridH = heightCells * bitmap.cellPxH;
    // Letterboxed remainder: solid uDefaultBg.
    fillCanvas2DRect(frame, gridW, 0, image.width - gridW, image.height, theme.defaultBg);
    fillCanvas2DRect(frame, 0, gridH, gridW, image.height - gridH, theme.defaultBg);
    for (let row = 0; row < heightCells; row += 1) {
      for (let col = 0; col < widthCells; col += 1) {
        composeCanvas2DCell(frame, staging, row * widthCells + col, col, row, bitmap, proceduralTable, theme);
      }
    }
    context.putImageData(image, 0, 0, 0, 0, image.width, image.height);
    drawn = {
      image,
      words: staging.slice(),
      widthCells,
      heightCells,
      cellPxW: bitmap.cellPxW,
      cellPxH: bitmap.cellPxH,
    };
  }

  function drawIncremental(state: DrawnState, result: SurfaceDamageResult, bitmap: AtlasBitmap): void {
    const { image, words } = state;
    const { staging, widthCells } = result;
    const { cellPxW, cellPxH } = bitmap;
    for (const span of result.dirtyRowSpans) {
      for (let row = span.minRow; row <= span.maxRow; row += 1) {
        let runStart = -1;
        for (let col = 0; col <= widthCells; col += 1) {
          let changed = false;
          if (col < widthCells) {
            const base = (row * widthCells + col) * 4;
            changed =
              words[base] !== staging[base] ||
              words[base + 1] !== staging[base + 1] ||
              words[base + 2] !== staging[base + 2] ||
              words[base + 3] !== staging[base + 3];
            if (changed) {
              composeCanvas2DCell(image, staging, row * widthCells + col, col, row, bitmap, proceduralTable, theme);
              words.set(staging.subarray(base, base + 4), base);
            }
          }
          if (changed && runStart < 0) {
            runStart = col;
          } else if (!changed && runStart >= 0) {
            // One blit per horizontal run of changed cells, snapped to whole
            // cells so no physical pixel row or column is left between rects.
            context.putImageData(
              image,
              0,
              0,
              runStart * cellPxW,
              row * cellPxH,
              (col - runStart) * cellPxW,
              cellPxH,
            );
            runStart = -1;
          }
        }
      }
    }
  }

  function present(current: GpuPackedSurface, target: GpuPackedSurface, ctx: Canvas2DPresentContext): void {
    assertLive();
    if (ctx.inputReceiptSha256 !== undefined && !isSha256Hex(ctx.inputReceiptSha256)) {
      invalid('ctx.inputReceiptSha256', 'expected a lowercase 64-hex SHA-256 digest');
    }
    cachedReceipt = null;
    lastFrame = null;
    const force = pendingFullRefresh || ctx.forceFullRefresh === true;
    // Any failure from here on leaves the canvas and the retained frame out of
    // step, so the next present redraws everything.
    pendingFullRefresh = true;
    const result = packSurfaceDamage(damage, current, target, {
      resolveSlot: atlas.resolveSlot,
      atlasGeneration: atlas.atlasGeneration,
      forceFullRefresh: force,
    });
    // Read the bitmap after packing: an atlas reset during the pack replaces it.
    const bitmap = atlas.bitmap;
    assertAtlasBitmap(bitmap);
    const { widthCells, heightCells } = result;
    if (widthCells * bitmap.cellPxW > canvas.width || heightCells * bitmap.cellPxH > canvas.height) {
      invalid(
        'target',
        `a ${String(widthCells)}x${String(heightCells)} grid of ${String(bitmap.cellPxW)}x${String(bitmap.cellPxH)} px cells does not fit the ${String(canvas.width)}x${String(canvas.height)} canvas`,
      );
    }

    const state = drawn;
    if (
      result.fullRefresh ||
      state?.image.width !== canvas.width ||
      state.image.height !== canvas.height ||
      state.widthCells !== widthCells ||
      state.heightCells !== heightCells ||
      state.cellPxW !== bitmap.cellPxW ||
      state.cellPxH !== bitmap.cellPxH
    ) {
      drawFull(result, bitmap);
    } else {
      drawIncremental(state, result, bitmap);
    }
    pendingFullRefresh = false;

    let inputBuffer: Uint8Array | null = null;
    if (ctx.inputReceiptSha256 === undefined) {
      // present() is synchronous and the caller reuses its buffers, so the
      // input is copied now and hashed only if a receipt is requested.
      if (inputCopy.length !== target.buffer.length) {
        inputCopy = new Uint8Array(target.buffer.length);
      }
      inputCopy.set(target.buffer);
      inputBuffer = inputCopy;
    }
    lastFrame = {
      widthCells,
      heightCells,
      staging: result.staging,
      inputReceiptSha256: ctx.inputReceiptSha256 ?? null,
      inputBuffer,
      inputSideTable: ctx.inputReceiptSha256 === undefined ? [...target.sideTable] : [],
      atlasAssets: atlas.getReceiptAssets(),
      canvasPxW: canvas.width,
      canvasPxH: canvas.height,
      dpr,
    };
  }

  function resize(size: GpuSurfaceResize): void {
    assertLive();
    const { width, height } = physicalSize(size);
    if (width !== canvas.width || height !== canvas.height) {
      // Assigning a size clears the canvas, so only a real change assigns.
      canvas.width = width;
      canvas.height = height;
      pendingFullRefresh = true;
    }
    if (size.dpr !== dpr) {
      dpr = size.dpr;
      pendingFullRefresh = true;
    }
  }

  function cellFromPoint(clientX: number, clientY: number): GpuCellPoint | null {
    if (disposed || canvas.getBoundingClientRect === undefined) {
      return null;
    }
    const { cellPxW, cellPxH } = atlas.bitmap;
    return sharedCellFromPoint(
      {
        cols: Math.floor(canvas.width / cellPxW),
        rows: Math.floor(canvas.height / cellPxH),
        cellPxW,
        cellPxH,
        canvasPxW: canvas.width,
        canvasPxH: canvas.height,
      },
      canvas.getBoundingClientRect(),
      clientX,
      clientY,
    );
  }

  function getLastReceipt(): EndpointReceipt | null {
    if (disposed || lastFrame === null) {
      return null;
    }
    if (cachedReceipt !== null) {
      return cachedReceipt;
    }
    const frame = lastFrame;
    // Canonical readback: the canvas's own pixels, tight top-left row-major.
    const readback = context.getImageData(0, 0, frame.canvasPxW, frame.canvasPxH).data;
    const rgba = Uint8Array.from(readback);
    if (rgba.length !== frame.canvasPxW * frame.canvasPxH * 4) {
      throw new RendererFaultError(
        'canvas2d',
        `getImageData returned ${String(rgba.length)} bytes for a ${String(frame.canvasPxW)}x${String(frame.canvasPxH)} canvas`,
      );
    }
    const probeFrame = { rgba, canvasPxW: frame.canvasPxW, canvasPxH: frame.canvasPxH };
    const points =
      options.probePoints ??
      ([
        [0, 0],
        [Math.floor(frame.canvasPxW / 2), Math.floor(frame.canvasPxH / 2)],
        [frame.canvasPxW - 1, frame.canvasPxH - 1],
      ] as const);
    const { atlasAssets } = frame;
    const receipt = parseEndpointReceipt({
      receiptVersion: ENDPOINT_RECEIPT_VERSION,
      gpuAbiVersion: BIJOU_SURFACE_GPU_ABI,
      cellFormatId: PACKED_BIJOU_CELL_FORMAT,
      inputReceiptSha256:
        frame.inputReceiptSha256 ?? liveInputSha256(frame.inputBuffer ?? new Uint8Array(0), frame.inputSideTable),
      preparedBufferSha256: sha256Hex(preparedBufferBytes(frame.staging)),
      proceduralTableSha256: PROCEDURAL_GLYPH_TABLE_SHA256,
      bunnyPrimitives: BUNNY_PRIMITIVE_PINS.map((pin) => ({ ...pin })),
      assembledWgslSha256: null,
      generatedGlslSha256: null,
      shaderSha256: null,
      executedArtifactSha256,
      backendProfile: CANVAS2D_BACKEND_PROFILE,
      adapter: { ...adapter },
      evidenceLevel: 'software-probed',
      widthCells: frame.widthCells,
      heightCells: frame.heightCells,
      cellPx: { ...atlasAssets.cellPx },
      canvasPxW: frame.canvasPxW,
      canvasPxH: frame.canvasPxH,
      dpr: frame.dpr,
      defaultFg: defaultFgHex,
      defaultBg: defaultBgHex,
      fontIdentity: atlasAssets.fontIdentity,
      atlasGeneration: atlasAssets.atlasGeneration,
      atlasStats: { ...atlasAssets.atlasStats },
      frameRgbaSha256: sha256Hex(rgba),
      probePolicy: PROBE_POLICY,
      probes: samplePixelProbes(probeFrame, points).map((probe) => ({
        px: probe.px,
        py: probe.py,
        rgba: [...probe.rgba],
      })),
    });
    cachedReceipt = receipt;
    return receipt;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    canvas.removeEventListener?.('contextlost', onContextLost);
    canvas.removeEventListener?.('contextrestored', onContextRestored);
    drawn = null;
    lastFrame = null;
    cachedReceipt = null;
    inputCopy = new Uint8Array(0);
  }

  return { present, resize, cellFromPoint, getLastReceipt, dispose };
}

function hostUserAgent(): string {
  const host = globalThis as { readonly navigator?: { readonly userAgent?: string } };
  return host.navigator?.userAgent ?? '';
}
