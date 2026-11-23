import { parseJsonValue, type JsonObject } from '@flyingrobots/geordi-core';

import eraseFrameText from '../../../fixtures/bijou-gpu/width1-erase.packed-bijou-cells.json?raw';
import paintFrameText from '../../../fixtures/bijou-gpu/width1-paint.packed-bijou-cells.json?raw';
import suiteText from '../../../fixtures/bijou-gpu/width1-conformance-suite.json?raw';
import {
  assertBitExactFrameHash,
  BackendUnavailableError,
  CELL_STRIDE,
  createGlyphAtlas,
  createStaticAtlasSource,
  createTestGlyphPack,
  createWebGL2SurfacePresenter,
  loadBundledProceduralGlyphTable,
  FLAG_BG_SET,
  FLAG_BOLD,
  FLAG_DASHED,
  FLAG_DIM,
  FLAG_FG_SET,
  FLAG_INVERSE,
  FLAG_STRIKETHROUGH,
  parsePackedBijouCellsReceipt,
  renderReferenceRgba,
  RendererFaultError,
  serializeEndpointReceipt,
  sha256Hex,
  SIDE_TABLE_THRESHOLD,
  UNDERLINE_CURLY,
  UNDERLINE_DOTDASH,
  UNDERLINE_SOLID,
  utf8Bytes,
  validateEndpointReceipt,
  WEBGL2_ENUMS,
  type AtlasBitmap,
  type GlyphRasterizer,
  type GlyphSlotMap,
  type GpuPackedSurface,
  type PresenterAtlasSource,
  type ReferenceFrame,
  type ReferenceSurface,
  type WebGL2SurfacePresenter,
} from '../src/index.js';
import { markChangedCells, markCellDirty, packedSurfaceFromReference } from '../test/packed-surface.js';

/**
 * Real-browser probe for the WebGL2 surface presenter.
 *
 * Every scenario creates its own canvas and presenter, renders the checked-in
 * conformance frames (or a generated animation) through the generated GLSL
 * that the presenter's bundled shader source carries (no shader argument),
 * and returns what it read back next to what the CPU reference oracle renders
 * for the same input. The e2e test decides pass or fail.
 */
export const WEBGL2_PROBE_VERSION = 'geordi-bijou-gpu-webgl2-probe/1';

interface SuiteSettings {
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
}

function suiteSettings(): SuiteSettings {
  const suite = parseJsonValue(suiteText);
  if (typeof suite !== 'object' || suite === null || Array.isArray(suite)) {
    throw new RendererFaultError('webgl2', 'probe: suite is not an object');
  }
  const record = suite as JsonObject;
  return {
    canvasPxW: Number(record.canvasPxW),
    canvasPxH: Number(record.canvasPxH),
    defaultFg: typeof record.defaultFg === 'string' ? record.defaultFg : '',
    defaultBg: typeof record.defaultBg === 'string' ? record.defaultBg : '',
  };
}

const settings = suiteSettings();
const pack = createTestGlyphPack();
const table = loadBundledProceduralGlyphTable();
const paintReceipt = parsePackedBijouCellsReceipt(parseJsonValue(paintFrameText));
const eraseReceipt = parsePackedBijouCellsReceipt(parseJsonValue(eraseFrameText));
const PAINT_SHA = sha256Hex(utf8Bytes(paintFrameText));
const ERASE_SHA = sha256Hex(utf8Bytes(eraseFrameText));

export interface ProbeFrame {
  readonly receipt: string | null;
  readonly receiptIssues: readonly string[];
  readonly evidenceLevel: string | null;
  readonly canonicalSha256: string | null;
  readonly displaySha256: string;
  readonly oracleSha256: string;
  readonly oraclePreparedSha256: string;
  /** `assertBitExactFrameHash(receipt, oracle)` error message, or null when it passed. */
  readonly bitExactFailure: string | null;
  readonly canonicalMismatches: number;
  readonly displayMismatches: number;
  readonly firstMismatch: string | null;
  /** The canonical frame, for per-cell probes on the Node side. */
  readonly canonicalRgba: readonly number[] | null;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly lastCellUploads: number;
  readonly lastAtlasUploads: number;
  readonly lastFullRefreshReason: string | null;
  readonly readbackPath: string | null;
}

export interface WebGL2Probe {
  readonly ready: true;
  readonly probeVersion: typeof WEBGL2_PROBE_VERSION;
  renderer(): { name: string; driver: string; probedEvidenceLevel: string };
  enumMismatches(): string[];
  contextState(): {
    attributes: Record<string, boolean | string> | null;
    drawingBufferColorSpace: string;
  };
  paintErase(): { paint: ProbeFrame; erase: ProbeFrame };
  contextLoss(presentWhileLost: boolean): Promise<{ before: ProbeFrame; after: ProbeFrame; prevented: boolean }>;
  atlasReset(): { before: ProbeFrame; after: ProbeFrame; generations: [number, number] };
  letterbox(dpr: number, cssWidth: number, cssHeight: number): { resized: ProbeFrame; shrunk: ProbeFrame };
  dprScene(): { frame: ProbeFrame; rect: { left: number; top: number; width: number; height: number }; dpr: number };
  hits(): { col: number; row: number }[];
  overlay(): { off: ProbeFrame; on: ProbeFrame; again: ProbeFrame; tintedRows: number[] };
  stress(frames: number, widthCells: number, heightCells: number): Promise<{
    framesPresented: number;
    glErrors: number[];
    invalidReceipts: string[];
    final: ProbeFrame;
    elapsedMs: number;
  }>;
  unavailable(): { name: string; code: string; backend: string; isFault: boolean };
}

declare global {
  interface Window {
    __geordiWebGL2Probe?: WebGL2Probe;
    __geordiWebGL2ProbeError?: string;
  }
}

function newCanvas(cssWidth: number, cssHeight: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${String(cssWidth)}px`;
  canvas.style.height = `${String(cssHeight)}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  document.body.append(canvas);
  return canvas;
}

function webgl2Of(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2');
  if (gl === null) {
    throw new BackendUnavailableError('webgl2', 'probe: no webgl2 context');
  }
  return gl;
}

/** The default framebuffer through readPixels(RGBA, UNSIGNED_BYTE), flipped to top-left. */
function readDisplay(canvas: HTMLCanvasElement): Uint8Array {
  const gl = webgl2Of(canvas);
  const { width, height } = canvas;
  const bottomUp = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
  const rgba = new Uint8Array(bottomUp.length);
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    rgba.set(bottomUp.subarray((height - 1 - row) * stride, (height - row) * stride), row * stride);
  }
  return rgba;
}

function diff(actual: Uint8Array, expected: Uint8Array, width: number): { count: number; first: string | null } {
  let count = 0;
  let first: string | null = null;
  const length = Math.max(actual.length, expected.length);
  for (let offset = 0; offset < length; offset += 4) {
    const a = Array.from(actual.subarray(offset, offset + 4));
    const e = Array.from(expected.subarray(offset, offset + 4));
    if (a.some((value, index) => value !== e[index]) || a.length !== e.length) {
      count += 1;
      if (first === null) {
        const pixel = offset / 4;
        first = `(${String(pixel % width)}, ${String(Math.floor(pixel / width))}) expected [${e.join(', ')}] actual [${a.join(', ')}]`;
      }
    }
  }
  return { count, first };
}

function oracle(
  surface: ReferenceSurface,
  bitmap: AtlasBitmap,
  slotMap: GlyphSlotMap,
  canvasPxW: number,
  canvasPxH: number,
): ReferenceFrame {
  return renderReferenceRgba(surface, bitmap, slotMap, table, {
    canvasPxW,
    canvasPxH,
    defaultFg: settings.defaultFg,
    defaultBg: settings.defaultBg,
  });
}

function probeFrame(
  presenter: WebGL2SurfacePresenter,
  canvas: HTMLCanvasElement,
  expected: ReferenceFrame,
  includeRgba = false,
): ProbeFrame {
  const receipt = presenter.getLastReceipt();
  const canonical = presenter.readCanonicalFrame();
  const display = readDisplay(canvas);
  const issues: string[] = [];
  let bitExactFailure: string | null = null;
  if (receipt === null) {
    issues.push('no receipt');
    bitExactFailure = 'no receipt';
  } else {
    const validation = validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt)));
    if (!validation.ok) {
      issues.push(...validation.issues.map((issue) => `${issue.path}: ${issue.detail}`));
    }
    try {
      assertBitExactFrameHash(receipt, expected);
    } catch (error) {
      bitExactFailure = error instanceof Error ? error.message : String(error);
    }
  }
  const canonicalDiff = canonical === null ? { count: -1, first: 'no canonical frame' } : diff(canonical.rgba, expected.rgba, canvas.width);
  const displayDiff = diff(display, expected.rgba, canvas.width);
  const diagnostics = presenter.getDiagnostics();
  return {
    receipt: receipt === null ? null : serializeEndpointReceipt(receipt),
    receiptIssues: issues,
    evidenceLevel: receipt?.evidenceLevel ?? null,
    canonicalSha256: canonical?.frameRgbaSha256 ?? null,
    displaySha256: sha256Hex(display),
    oracleSha256: expected.frameRgbaSha256,
    oraclePreparedSha256: expected.preparedBufferSha256,
    bitExactFailure,
    canonicalMismatches: canonicalDiff.count,
    displayMismatches: displayDiff.count,
    firstMismatch: canonicalDiff.first ?? displayDiff.first,
    canonicalRgba: includeRgba && canonical !== null ? Array.from(canonical.rgba) : null,
    canvasPxW: canvas.width,
    canvasPxH: canvas.height,
    lastCellUploads: diagnostics.lastCellUploads,
    lastAtlasUploads: diagnostics.lastAtlasUploads.length,
    lastFullRefreshReason: diagnostics.lastFullRefreshReason,
    readbackPath: diagnostics.readbackPath,
  };
}

function packAtlas(): PresenterAtlasSource {
  return createStaticAtlasSource({ bitmap: pack.atlasBitmap, slotMap: pack.slotMap, fontIdentity: pack.fontIdentity });
}

function presenterOn(
  canvas: HTMLCanvasElement,
  atlas: PresenterAtlasSource,
  inputReceiptSha256?: (target: GpuPackedSurface) => string,
): WebGL2SurfacePresenter {
  return createWebGL2SurfacePresenter({
    canvas,
    atlas,
    defaultFg: settings.defaultFg,
    defaultBg: settings.defaultBg,
    canonicalReadback: true,
    ...(inputReceiptSha256 === undefined ? {} : { inputReceiptSha256 }),
  });
}

const fixtureDigest = (target: GpuPackedSurface): string =>
  target.buffer.length === paintReceipt.bytes.length &&
  target.buffer.every((byte, index) => byte === paintReceipt.bytes[index])
    ? PAINT_SHA
    : ERASE_SHA;

/** Nearest-neighbour upscale of an atlas, the shape a 2x DPR atlas has. */
function upscaleAtlas(bitmap: AtlasBitmap, scale: number): AtlasBitmap {
  const cellPxW = bitmap.cellPxW * scale;
  const cellPxH = bitmap.cellPxH * scale;
  const srcW = bitmap.atlasCols * bitmap.cellPxW;
  const dstW = bitmap.atlasCols * cellPxW;
  const dstH = bitmap.atlasRows * cellPxH;
  const rgba = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const from = (Math.floor(y / scale) * srcW + Math.floor(x / scale)) * 4;
      rgba.set(bitmap.rgba.subarray(from, from + 4), (y * dstW + x) * 4);
    }
  }
  return { cellPxW, cellPxH, atlasCols: bitmap.atlasCols, atlasRows: bitmap.atlasRows, rgba };
}

/** Serve the test pack's bitmaps as straight-alpha rasters, as a font rasterizer would. */
function packRasterizer(): GlyphRasterizer {
  const { cellPxW, cellPxH, atlasCols, rgba } = pack.atlasBitmap;
  return {
    rasterize(request) {
      const ref = pack.slotMap.lookup(request.grapheme, request.bold);
      if (ref === undefined) {
        throw new RendererFaultError('webgl2', `probe: the test pack has no ${request.grapheme}`);
      }
      const out = new Uint8ClampedArray(cellPxW * cellPxH * 4);
      for (let ly = 0; ly < cellPxH; ly += 1) {
        for (let lx = 0; lx < cellPxW; lx += 1) {
          const sx = (ref.slot % atlasCols) * cellPxW + lx;
          const sy = Math.floor(ref.slot / atlasCols) * cellPxH + ly;
          const offset = (sy * atlasCols * cellPxW + sx) * 4;
          const alpha = rgba[offset + 3] ?? 0;
          const straight = [0, 1, 2].map((channel) =>
            alpha === 0 ? 0 : Math.round(((rgba[offset + channel] ?? 0) * 255) / alpha),
          );
          out.set([...straight, alpha], (ly * cellPxW + lx) * 4);
        }
      }
      return out;
    },
  };
}

let hitLog: { col: number; row: number }[] = [];

function paintThenErase(presenter: WebGL2SurfacePresenter): {
  paint: GpuPackedSurface;
  erase: GpuPackedSurface;
} {
  const paint = packedSurfaceFromReference(paintReceipt, 'all');
  presenter.present(paint, paint, {});
  const erase = packedSurfaceFromReference(eraseReceipt, 'none');
  markChangedCells(paint, erase);
  return { paint, erase };
}

const GLYPHS = ['A', '', '♥', 'é', '─', '┼', '╭', '█', '▒', '▚', '⣿', '⠁', ' '];
const FLAG_CYCLE = [
  0,
  FLAG_BOLD,
  FLAG_DIM,
  FLAG_INVERSE,
  FLAG_STRIKETHROUGH,
  UNDERLINE_SOLID,
  UNDERLINE_CURLY,
  UNDERLINE_DOTDASH,
  FLAG_DASHED | UNDERLINE_SOLID,
  FLAG_BOLD | FLAG_INVERSE | UNDERLINE_CURLY,
];

/** Write one animated cell of frame `k`. */
function animateCell(surface: GpuPackedSurface & { buffer: Uint8Array }, col: number, row: number, k: number): void {
  const glyph = GLYPHS[(col * 3 + row * 5 + k) % GLYPHS.length] ?? ' ';
  const code = glyph.length === 1 ? glyph.charCodeAt(0) : SIDE_TABLE_THRESHOLD;
  const flags = FLAG_CYCLE[(col + row * 7 + k) % FLAG_CYCLE.length] ?? 0;
  const opacity = (col + row + k) % 5 === 0 ? (k * 13 + col) % 64 : 63;
  const presence = ((col + k) % 3 === 0 ? 0 : FLAG_FG_SET) | ((row + k) % 4 === 0 ? 0 : FLAG_BG_SET);
  surface.buffer.set(
    [
      code & 0xff,
      code >>> 8,
      (col * 7 + k * 3) & 0xff,
      (row * 11 + k) & 0xff,
      (col + row + k * 5) & 0xff,
      (col * 2 + k) & 0xff,
      (row * 3) & 0xff,
      (k * 9) & 0xff,
      flags,
      opacity | presence,
    ],
    (row * surface.width + col) * CELL_STRIDE,
  );
}

function boot(): WebGL2Probe {
  return {
    ready: true,
    probeVersion: WEBGL2_PROBE_VERSION,

    renderer() {
      const canvas = newCanvas(8, 8, 1);
      const presenter = presenterOn(canvas, packAtlas());
      const diagnostics = presenter.getDiagnostics();
      presenter.dispose();
      canvas.remove();
      return {
        name: diagnostics.adapter.name,
        driver: diagnostics.adapter.driver,
        probedEvidenceLevel: diagnostics.probedEvidenceLevel,
      };
    },

    enumMismatches() {
      const gl = webgl2Of(newCanvas(4, 4, 1));
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return Object.entries(WEBGL2_ENUMS).flatMap(([name, value]) => {
        const live = Reflect.get(gl, name) as number | undefined;
        const actual = live ?? (info === null ? undefined : (Reflect.get(info, name) as number | undefined));
        return actual === value ? [] : [`${name}: pinned ${String(value)}, live ${String(actual)}`];
      });
    },

    contextState() {
      const canvas = newCanvas(8, 8, 1);
      const presenter = presenterOn(canvas, packAtlas());
      const gl = webgl2Of(canvas);
      const attributes = gl.getContextAttributes();
      const state = {
        attributes:
          attributes === null
            ? null
            : {
                alpha: attributes.alpha === true,
                antialias: attributes.antialias === true,
                premultipliedAlpha: attributes.premultipliedAlpha === true,
                preserveDrawingBuffer: attributes.preserveDrawingBuffer === true,
              },
        drawingBufferColorSpace: gl.drawingBufferColorSpace,
      };
      presenter.dispose();
      return state;
    },

    paintErase() {
      const canvas = newCanvas(settings.canvasPxW, settings.canvasPxH, 1);
      const presenter = presenterOn(canvas, packAtlas(), fixtureDigest);
      const { paint, erase } = paintThenErase(presenter);
      const w = settings.canvasPxW;
      const h = settings.canvasPxH;
      const paintFrame = probeFrame(presenter, canvas, oracle(paintReceipt, pack.atlasBitmap, pack.slotMap, w, h), true);
      presenter.present(paint, erase, {});
      const eraseFrame = probeFrame(presenter, canvas, oracle(eraseReceipt, pack.atlasBitmap, pack.slotMap, w, h), true);
      presenter.dispose();
      return { paint: paintFrame, erase: eraseFrame };
    },

    async contextLoss(presentWhileLost) {
      const canvas = newCanvas(settings.canvasPxW, settings.canvasPxH, 1);
      const presenter = presenterOn(canvas, packAtlas(), fixtureDigest);
      const { paint, erase } = paintThenErase(presenter);
      const w = settings.canvasPxW;
      const h = settings.canvasPxH;
      const paintOracle = oracle(paintReceipt, pack.atlasBitmap, pack.slotMap, w, h);
      const before = probeFrame(presenter, canvas, paintOracle);
      const gl = webgl2Of(canvas);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose === null) {
        throw new BackendUnavailableError('webgl2', 'probe: WEBGL_lose_context is unavailable');
      }
      let prevented = false;
      const lostEvent = new Promise<void>((resolve) => {
        canvas.addEventListener(
          'webglcontextlost',
          (event) => {
            prevented = event.defaultPrevented;
            resolve();
          },
          { once: true },
        );
      });
      lose.loseContext();
      await lostEvent;
      if (presentWhileLost) {
        presenter.present(paint, erase, {});
      }
      const restored = new Promise<void>((resolve) => {
        canvas.addEventListener('webglcontextrestored', () => {
          resolve();
        }, { once: true });
      });
      // Chrome refuses restoreContext() inside the task that dispatched webglcontextlost.
      await new Promise((resolve) => setTimeout(resolve, 0));
      lose.restoreContext();
      const timedOut = await Promise.race([
        restored.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => {
          resolve(true);
        }, 5000)),
      ]);
      if (timedOut) {
        throw new RendererFaultError('webgl2', 'probe: webglcontextrestored did not fire within 5 s');
      }
      const after = probeFrame(
        presenter,
        canvas,
        presentWhileLost ? oracle(eraseReceipt, pack.atlasBitmap, pack.slotMap, w, h) : paintOracle,
      );
      presenter.dispose();
      return { before, after, prevented };
    },

    atlasReset() {
      const canvas = newCanvas(settings.canvasPxW, settings.canvasPxH, 1);
      const atlas = createGlyphAtlas({
        rasterizer: packRasterizer(),
        atlasCols: 3,
        atlasRows: 3,
        metrics: { cellPxW: pack.atlasBitmap.cellPxW, cellPxH: pack.atlasBitmap.cellPxH, fontIdentity: pack.fontIdentity },
      });
      const presenter = presenterOn(canvas, atlas);
      const paint = packedSurfaceFromReference(paintReceipt, 'all');
      presenter.present(paint, paint, {});
      const w = settings.canvasPxW;
      const h = settings.canvasPxH;
      const before = probeFrame(presenter, canvas, oracle(paintReceipt, atlas.bitmap, atlas.toSlotMap(), w, h));
      const first = atlas.generation;
      atlas.invalidate(undefined, 'manual');
      // Nothing in the surface changed; the reset alone must re-upload everything.
      const again = packedSurfaceFromReference(paintReceipt, 'none');
      presenter.present(paint, again, {});
      const after = probeFrame(presenter, canvas, oracle(paintReceipt, atlas.bitmap, atlas.toSlotMap(), w, h));
      presenter.dispose();
      return { before, after, generations: [first, atlas.generation] };
    },

    letterbox(dpr, cssWidth, cssHeight) {
      // Present at the suite canvas first, then resize: the resize must redraw the retained frame.
      const canvas = newCanvas(settings.canvasPxW, settings.canvasPxH, 1);
      canvas.style.width = `${String(cssWidth)}px`;
      canvas.style.height = `${String(cssHeight)}px`;
      const presenter = presenterOn(canvas, packAtlas(), fixtureDigest);
      const paint = packedSurfaceFromReference(paintReceipt, 'all');
      presenter.present(paint, paint, {});
      presenter.resize({ cssWidth, cssHeight, dpr });
      const w = canvas.width;
      const h = canvas.height;
      const resized = probeFrame(presenter, canvas, oracle(paintReceipt, pack.atlasBitmap, pack.slotMap, w, h));
      // Shrink the grid to 3 x 2 cells: everything the old grid painted must clear to defaultBg.
      const small: ReferenceSurface = {
        widthCells: 3,
        heightCells: 2,
        bytes: [...paintReceipt.bytes.slice(0, 3 * CELL_STRIDE), ...paintReceipt.bytes.slice(8 * CELL_STRIDE, 11 * CELL_STRIDE)],
        sideTable: paintReceipt.sideTable,
      };
      presenter.present(paint, packedSurfaceFromReference(small, 'all'), {});
      const shrunk = probeFrame(presenter, canvas, oracle(small, pack.atlasBitmap, pack.slotMap, w, h));
      presenter.dispose();
      return { resized, shrunk };
    },

    dprScene() {
      const dpr = window.devicePixelRatio;
      const scale = Math.round(dpr);
      const bitmap = upscaleAtlas(pack.atlasBitmap, scale);
      const cssWidth = settings.canvasPxW;
      const cssHeight = settings.canvasPxH;
      const canvas = newCanvas(cssWidth, cssHeight, dpr);
      const presenter = presenterOn(
        canvas,
        createStaticAtlasSource({ bitmap, slotMap: pack.slotMap, fontIdentity: `${pack.fontIdentity} x${String(scale)}` }),
        fixtureDigest,
      );
      presenter.resize({ cssWidth, cssHeight, dpr });
      const paint = packedSurfaceFromReference(paintReceipt, 'all');
      presenter.present(paint, paint, {});
      const frame = probeFrame(presenter, canvas, oracle(paintReceipt, bitmap, pack.slotMap, canvas.width, canvas.height));
      hitLog = [];
      canvas.addEventListener('pointerdown', (event) => {
        const cell = presenter.cellFromPoint(event.clientX, event.clientY);
        if (cell !== null) {
          hitLog.push(cell);
        }
      });
      const rect = canvas.getBoundingClientRect();
      return { frame, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, dpr };
    },

    hits() {
      return hitLog;
    },

    overlay() {
      const canvas = newCanvas(settings.canvasPxW, settings.canvasPxH, 1);
      const presenter = presenterOn(canvas, packAtlas(), fixtureDigest);
      const paint = packedSurfaceFromReference(paintReceipt, 'all');
      presenter.present(paint, paint, {});
      const next = packedSurfaceFromReference(paintReceipt, 'none');
      // Change one cell in row 3 only.
      const cell = 3 * paint.width + 2;
      next.buffer[cell * CELL_STRIDE + 2] = (next.buffer[cell * CELL_STRIDE + 2] ?? 0) ^ 0x80;
      markCellDirty(next.renderDirtyWords, cell);
      presenter.present(paint, next, {});
      const nextOracle = oracle(
        { widthCells: next.width, heightCells: next.height, bytes: next.buffer, sideTable: next.sideTable },
        pack.atlasBitmap,
        pack.slotMap,
        canvas.width,
        canvas.height,
      );
      const off = probeFrame(presenter, canvas, nextOracle);
      presenter.setDiagnosticOverlay(true);
      const on = probeFrame(presenter, canvas, nextOracle);
      const display = readDisplay(canvas);
      const tinted = new Set<number>();
      for (let offset = 0; offset < display.length; offset += 4) {
        if (display.subarray(offset, offset + 4).some((value, index) => value !== nextOracle.rgba[offset + index])) {
          tinted.add(Math.floor(Math.floor(offset / 4 / canvas.width) / pack.atlasBitmap.cellPxH));
        }
      }
      presenter.setDiagnosticOverlay(false);
      const again = probeFrame(presenter, canvas, nextOracle);
      presenter.dispose();
      return { off, on, again, tintedRows: [...tinted].sort((a, b) => a - b) };
    },

    async stress(frames, widthCells, heightCells) {
      const cellPxW = pack.atlasBitmap.cellPxW;
      const cellPxH = pack.atlasBitmap.cellPxH;
      const canvas = newCanvas(widthCells * cellPxW, heightCells * cellPxH, 1);
      const presenter = presenterOn(canvas, packAtlas());
      presenter.setCanonicalReadback(false);
      const gl = webgl2Of(canvas);
      const empty: ReferenceSurface = {
        widthCells,
        heightCells,
        bytes: new Uint8Array(widthCells * heightCells * CELL_STRIDE),
        sideTable: ['é'],
      };
      let current = packedSurfaceFromReference(empty, 'all');
      for (let row = 0; row < heightCells; row += 1) {
        for (let col = 0; col < widthCells; col += 1) {
          animateCell(current, col, row, 0);
        }
      }
      const glErrors: number[] = [];
      const invalidReceipts: string[] = [];
      const started = performance.now();
      presenter.present(current, current, {});
      let presented = 1;
      for (let k = 1; k < frames; k += 1) {
        const next = packedSurfaceFromReference(
          { widthCells, heightCells, bytes: current.buffer, sideTable: current.sideTable },
          'none',
        );
        for (let row = 0; row < heightCells; row += 1) {
          for (let col = 0; col < widthCells; col += 1) {
            if ((col + row * 3 + k) % 4 === 0) {
              animateCell(next, col, row, k);
              markCellDirty(next.renderDirtyWords, row * widthCells + col);
            }
          }
        }
        if (k === frames - 1) {
          presenter.setCanonicalReadback(true);
        }
        presenter.present(current, next, {});
        presented += 1;
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
          glErrors.push(error);
        }
        const receipt = presenter.getLastReceipt();
        const validation =
          receipt === null
            ? { ok: false as const, issues: [{ path: '$', detail: 'no receipt' }] }
            : validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt)));
        if (!validation.ok) {
          invalidReceipts.push(`frame ${String(k)}: ${validation.issues.map((issue) => issue.path).join(', ')}`);
        }
        current = next;
        if (k % 30 === 0) {
          // Yield so the page stays responsive and the compositor runs between frames.
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      const elapsedMs = performance.now() - started;
      const final = probeFrame(
        presenter,
        canvas,
        oracle(
          { widthCells, heightCells, bytes: current.buffer, sideTable: current.sideTable },
          pack.atlasBitmap,
          pack.slotMap,
          canvas.width,
          canvas.height,
        ),
      );
      presenter.dispose();
      return { framesPresented: presented, glErrors, invalidReceipts, final, elapsedMs };
    },

    unavailable() {
      const canvas = newCanvas(8, 8, 1);
      // A canvas that already has a 2D context returns null for webgl2.
      canvas.getContext('2d');
      try {
        presenterOn(canvas, packAtlas());
      } catch (error) {
        if (error instanceof BackendUnavailableError) {
          return { name: error.name, code: error.code, backend: error.backend, isFault: error instanceof RendererFaultError };
        }
        throw error;
      }
      return { name: 'none', code: 'none', backend: 'none', isFault: false };
    },
  };
}

try {
  window.__geordiWebGL2Probe = boot();
  document.body.dataset.webgl2Probe = 'ready';
} catch (error) {
  window.__geordiWebGL2ProbeError = error instanceof Error ? error.message : String(error);
  document.body.dataset.webgl2Probe = 'error';
}
