import { parseJsonValue, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

import manifestText from '../shaders/bijou-shaders.manifest.json?raw';
import surfaceWgsl from '../shaders/bijou-surface.wgsl?raw';
import eraseFrameText from '../../../fixtures/bijou-gpu/width1-erase.packed-bijou-cells.json?raw';
import paintFrameText from '../../../fixtures/bijou-gpu/width1-paint.packed-bijou-cells.json?raw';
import proceduralTableText from '../../../fixtures/bijou-gpu/procedural-glyphs.json?raw';
import suiteText from '../../../fixtures/bijou-gpu/width1-conformance-suite.json?raw';
import {
  assertBitExactFrameHash,
  BackendUnavailableError,
  createGlyphSlotMap,
  createTestGlyphPack,
  createWebGPUSurfacePresenter,
  createWebGpuRefusalReceipt,
  decodeProceduralGlyphTable,
  FrameHashMismatchError,
  GLYPH_KIND_BLOCK,
  GLYPH_KIND_BOX,
  GLYPH_KIND_BRAILLE,
  parsePackedBijouCellsReceipt,
  prepareReferenceCells,
  RendererFaultError,
  renderReferenceRgba,
  sha256Hex,
  staticAtlasSource,
  utf8Bytes,
  type EndpointReceipt,
  type GpuPackedSurface,
  type PackedBijouCellsReceipt,
  type PresenterAtlasSource,
  type ReferenceFrame,
  type ReferenceSurface,
  type WebGpuSurfacePresenter,
} from '../src/index.js';

/**
 * Real-browser WebGPU presenter probe.
 *
 * It runs `createWebGPUSurfacePresenter` on the page's canvas with the
 * canonical `bijou-surface.wgsl` loaded verbatim, presents the width-1
 * conformance frames, reads the canonical `rgba8uint` frame back, and compares
 * it byte for byte with `renderReferenceRgba()` run in the same page. When the
 * browser has no WebGPU adapter it records the refusal instead; a refusal is
 * never reported as a rendered frame.
 */
export const WEBGPU_PROBE_VERSION = 'geordi-bijou-gpu-webgpu-probe/1';

export interface WebGpuProbeAdapter {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
  readonly isFallbackAdapter: boolean;
  readonly preferredCanvasFormat: string;
}

export interface WebGpuProbeFrame {
  readonly id: string;
  readonly receipt: EndpointReceipt;
  readonly oracleFrameRgbaSha256: string;
  readonly oraclePreparedBufferSha256: string;
  /** `null` when `assertBitExactFrameHash` passed, else its message. */
  readonly bitExactFailure: string | null;
  /** Pixels where the read-back frame differs from the oracle frame. */
  readonly differingPixels: number;
  /** Pixels where the canvas (display pass) differs from the canonical frame. */
  readonly displayDifferingPixels: number;
  /** Canonical pixels an `-srgb` swapchain would have shifted. */
  readonly gammaSensitivePixels: number;
  readonly readbackBytesPerRow: number;
}

export type WebGpuProbeResult =
  | {
      readonly status: 'refused';
      readonly reason: string;
      readonly receipt: EndpointReceipt;
    }
  | {
      readonly status: 'rendered';
      readonly adapter: WebGpuProbeAdapter;
      readonly frames: readonly WebGpuProbeFrame[];
      readonly presenterStatus: string;
    };

export interface WebGpuResizeStep {
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly bytesPerRow: number;
  readonly matchesOracle: boolean;
}

export type WebGpuResizeResult =
  | { readonly status: 'refused'; readonly reason: string }
  | {
      readonly status: 'rendered';
      readonly steps: readonly WebGpuResizeStep[];
      readonly presenterStatus: string;
      readonly fault: string | null;
    };

export type WebGpuFaultResult =
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'fault'; readonly errorName: string; readonly code: string; readonly message: string }
  | { readonly status: 'created' };

export interface WebGpuProbe {
  readonly ready: true;
  readonly probeVersion: typeof WEBGPU_PROBE_VERSION;
  readonly hasNavigatorGpu: boolean;
  /** Paint -> erase on the deterministic test glyph atlas. */
  runAtlasFixture(): Promise<WebGpuProbeResult>;
  /** Paint -> erase with every atlas glyph lowered to an empty cell and an empty atlas. */
  runProceduralFixture(): Promise<WebGpuProbeResult>;
  /** Seeded random canvas sizes and grid sizes, each frame checked against the oracle. */
  runResizeSequence(steps: number, seed: number): Promise<WebGpuResizeResult>;
  /** A WGSL compile error the real device reports, behind a manifest that pins it. */
  runShaderFault(): Promise<WebGpuFaultResult>;
}

declare global {
  interface Window {
    __geordiWebGpuProbe?: WebGpuProbe;
    __geordiWebGpuProbeError?: string;
  }
}

class WebGpuProbeError extends Error {
  constructor(detail: string) {
    super(`webgpu probe: ${detail}`);
    this.name = new.target.name;
  }
}

interface SuiteGeometry {
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
}

function suiteGeometry(): SuiteGeometry {
  const suite = parseJsonValue(suiteText);
  if (typeof suite !== 'object' || suite === null || Array.isArray(suite)) {
    throw new WebGpuProbeError('suite is not an object');
  }
  const { canvasPxW, canvasPxH, defaultFg, defaultBg } = suite as JsonObject;
  if (
    typeof canvasPxW !== 'number' ||
    typeof canvasPxH !== 'number' ||
    typeof defaultFg !== 'string' ||
    typeof defaultBg !== 'string'
  ) {
    throw new WebGpuProbeError('suite geometry is malformed');
  }
  return { canvasPxW, canvasPxH, defaultFg, defaultBg };
}

const GEOMETRY = suiteGeometry();
const MANIFEST: JsonValue = parseJsonValue(manifestText);
const TABLE = decodeProceduralGlyphTable(parseJsonValue(proceduralTableText));
const PACK = createTestGlyphPack();
const PAINT = parsePackedBijouCellsReceipt(parseJsonValue(paintFrameText));
const ERASE = parsePackedBijouCellsReceipt(parseJsonValue(eraseFrameText));
const PAINT_SHA = sha256Hex(utf8Bytes(paintFrameText));
const ERASE_SHA = sha256Hex(utf8Bytes(eraseFrameText));

function liveSurface(surface: ReferenceSurface): GpuPackedSurface {
  const cells = surface.widthCells * surface.heightCells;
  return {
    width: surface.widthCells,
    height: surface.heightCells,
    buffer: Uint8Array.from(surface.bytes),
    sideTable: [...surface.sideTable],
    renderDirtyWords: new Uint32Array(Math.ceil(cells / 32)).fill(0xffffffff),
  };
}

/** The receipt with every atlas glyph replaced by an empty space cell. */
function proceduralOnly(receipt: PackedBijouCellsReceipt): ReferenceSurface {
  const prepared = prepareReferenceCells(receipt, PACK.slotMap);
  const bytes = [...receipt.bytes];
  for (let cell = 0; cell < receipt.widthCells * receipt.heightCells; cell += 1) {
    const kind = ((prepared[cell * 4] ?? 0) >>> 16) & 0xf;
    if (kind !== GLYPH_KIND_BRAILLE && kind !== GLYPH_KIND_BLOCK && kind !== GLYPH_KIND_BOX) {
      bytes[cell * 10] = 0x20;
      bytes[cell * 10 + 1] = 0;
    }
  }
  return { widthCells: receipt.widthCells, heightCells: receipt.heightCells, bytes, sideTable: [] };
}

/** An all-zero one-slot atlas: a procedural-only frame must never read it. */
const EMPTY_ATLAS = {
  atlasBitmap: {
    cellPxW: PACK.atlasBitmap.cellPxW,
    cellPxH: PACK.atlasBitmap.cellPxH,
    atlasCols: 1,
    atlasRows: 1,
    rgba: new Uint8Array(PACK.atlasBitmap.cellPxW * PACK.atlasBitmap.cellPxH * 4),
  },
  slotMap: createGlyphSlotMap([]),
  fontIdentity: 'geordi-bijou-gpu-empty-atlas/1',
  atlasStats: { usedSlots: 0, capacity: 1, monoCount: 0, colorEmojiCount: 0 },
};

function canvasElement(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#bijou-gpu-webgpu');
  if (canvas === null) {
    throw new WebGpuProbeError('canvas #bijou-gpu-webgpu is missing');
  }
  return canvas;
}

function freshCanvas(): HTMLCanvasElement {
  const old = canvasElement();
  const canvas = document.createElement('canvas');
  canvas.id = old.id;
  old.replaceWith(canvas);
  return canvas;
}

async function adapterOf(): Promise<WebGpuProbeAdapter> {
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) {
    throw new WebGpuProbeError('the adapter disappeared after the presenter was created');
  }
  return {
    vendor: adapter.info.vendor,
    architecture: adapter.info.architecture,
    device: adapter.info.device,
    description: adapter.info.description,
    isFallbackAdapter: adapter.info.isFallbackAdapter,
    preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat(),
  };
}

function oracle(surface: ReferenceSurface, atlas: typeof EMPTY_ATLAS | typeof PACK, w: number, h: number): ReferenceFrame {
  return renderReferenceRgba(surface, atlas.atlasBitmap, atlas.slotMap, TABLE, {
    canvasPxW: w,
    canvasPxH: h,
    defaultFg: GEOMETRY.defaultFg,
    defaultBg: GEOMETRY.defaultBg,
  });
}

function differing(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset < Math.max(a.length, b.length); offset += 4) {
    if (a[offset] !== b[offset] || a[offset + 1] !== b[offset + 1] || a[offset + 2] !== b[offset + 2] || a[offset + 3] !== b[offset + 3]) {
      count += 1;
    }
  }
  return count;
}

/** sRGB encode of a value already in sRGB: what an `-srgb` swapchain would store. */
function doubleEncoded(channel: number): number {
  const linear = channel / 255;
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function gammaSensitive(rgba: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if ([0, 1, 2].some((channel) => doubleEncoded(rgba[offset + channel] ?? 0) !== (rgba[offset + channel] ?? 0))) {
      count += 1;
    }
  }
  return count;
}

interface FixtureCase {
  readonly id: string;
  readonly surface: ReferenceSurface;
  /** The fixture file digest; omitted for a derived surface, which has no file. */
  readonly inputReceiptSha256?: string;
}

async function runFixture(
  atlasInput: typeof EMPTY_ATLAS | typeof PACK,
  cases: readonly FixtureCase[],
): Promise<WebGpuProbeResult> {
  const canvas = freshCanvas();
  const atlas: PresenterAtlasSource = staticAtlasSource(atlasInput);
  const shader = { wgsl: surfaceWgsl, manifest: MANIFEST };
  const size = { cssWidth: GEOMETRY.canvasPxW, cssHeight: GEOMETRY.canvasPxH, dpr: 1 };
  let presenter: WebGpuSurfacePresenter;
  try {
    presenter = await createWebGPUSurfacePresenter(canvas, {
      shader,
      atlas,
      size,
      defaultFg: GEOMETRY.defaultFg,
      defaultBg: GEOMETRY.defaultBg,
    });
  } catch (error) {
    if (!(error instanceof BackendUnavailableError)) {
      throw error;
    }
    const first = cases.at(0);
    if (first === undefined) {
      throw new WebGpuProbeError('no fixture cases');
    }
    return {
      status: 'refused',
      reason: error.reason,
      receipt: createWebGpuRefusalReceipt({
        error,
        shader,
        atlas,
        target: liveSurface(first.surface),
        size,
        defaultFg: GEOMETRY.defaultFg,
        defaultBg: GEOMETRY.defaultBg,
        inputReceiptSha256: first.inputReceiptSha256,
      }),
    };
  }
  try {
    const frames: WebGpuProbeFrame[] = [];
    let current = liveSurface(cases.at(0)?.surface ?? PAINT);
    for (const fixture of cases) {
      const target = liveSurface(fixture.surface);
      const expected = oracle(fixture.surface, atlasInput, GEOMETRY.canvasPxW, GEOMETRY.canvasPxH);
      presenter.present(current, target, {});
      current = target;
      // Same task as present(): the canvas texture is still the one just drawn.
      const display = presenter.captureDisplay();
      const capture = await presenter.captureFrame({
        inputReceiptSha256: fixture.inputReceiptSha256,
        probes: [
          [0, 0],
          [3, 5],
          [12, 20],
          [29, 40],
          [45, 70],
          [60, 100],
          [GEOMETRY.canvasPxW - 1, GEOMETRY.canvasPxH - 1],
        ],
      });
      let bitExactFailure: string | null = null;
      try {
        assertBitExactFrameHash(capture.receipt, expected);
      } catch (error) {
        if (!(error instanceof FrameHashMismatchError)) {
          throw error;
        }
        bitExactFailure = error.message;
      }
      frames.push({
        id: fixture.id,
        receipt: capture.receipt,
        oracleFrameRgbaSha256: expected.frameRgbaSha256,
        oraclePreparedBufferSha256: expected.preparedBufferSha256,
        bitExactFailure,
        differingPixels: differing(capture.rgba, expected.rgba),
        displayDifferingPixels: differing(await display, capture.rgba),
        gammaSensitivePixels: gammaSensitive(capture.rgba),
        readbackBytesPerRow: capture.bytesPerRow,
      });
    }
    return { status: 'rendered', adapter: await adapterOf(), frames, presenterStatus: presenter.status };
  } finally {
    presenter.dispose();
  }
}

/** A `width x height` surface tiled from the paint frame. */
function tiledPaint(width: number, height: number): ReferenceSurface {
  const bytes: number[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const from = ((row % PAINT.heightCells) * PAINT.widthCells + (col % PAINT.widthCells)) * 10;
      bytes.push(...PAINT.bytes.slice(from, from + 10));
    }
  }
  return { widthCells: width, heightCells: height, bytes, sideTable: [...PAINT.sideTable] };
}

async function runResizeSequence(steps: number, seed: number): Promise<WebGpuResizeResult> {
  const canvas = freshCanvas();
  let state = seed >>> 0;
  const next = (bound: number): number => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state % bound;
  };
  let presenter: WebGpuSurfacePresenter;
  try {
    presenter = await createWebGPUSurfacePresenter(canvas, {
      shader: { wgsl: surfaceWgsl, manifest: MANIFEST },
      atlas: staticAtlasSource(PACK),
      size: { cssWidth: GEOMETRY.canvasPxW, cssHeight: GEOMETRY.canvasPxH, dpr: 1 },
      defaultFg: GEOMETRY.defaultFg,
      defaultBg: GEOMETRY.defaultBg,
    });
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return { status: 'refused', reason: error.reason };
    }
    throw error;
  }
  const results: WebGpuResizeStep[] = [];
  let fault: string | null = null;
  try {
    let current = liveSurface(PAINT);
    for (let step = 0; step < steps; step += 1) {
      const dpr = [1, 1.5, 2][next(3)] ?? 1;
      const cssWidth = 4 + next(160);
      const cssHeight = 8 + next(120);
      presenter.resize({ cssWidth, cssHeight, dpr });
      const canvasPxW = canvas.width;
      const canvasPxH = canvas.height;
      const widthCells = next(Math.floor(canvasPxW / PACK.atlasBitmap.cellPxW) + 1);
      const heightCells = next(Math.floor(canvasPxH / PACK.atlasBitmap.cellPxH) + 1);
      const surface = tiledPaint(widthCells, heightCells);
      const target = liveSurface(surface);
      presenter.present(current, target, {});
      current = target;
      const capture = await presenter.captureFrame();
      const expected = oracle(surface, PACK, canvasPxW, canvasPxH);
      results.push({
        canvasPxW,
        canvasPxH,
        widthCells,
        heightCells,
        bytesPerRow: capture.bytesPerRow,
        matchesOracle: capture.receipt.frameRgbaSha256 === expected.frameRgbaSha256,
      });
    }
  } catch (error) {
    if (!(error instanceof RendererFaultError)) {
      throw error;
    }
    fault = error.message;
  }
  // Let the last frame's error scopes settle before reporting the status.
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  const presenterStatus = presenter.status;
  presenter.dispose();
  return { status: 'rendered', steps: results, presenterStatus, fault };
}

async function runShaderFault(): Promise<WebGpuFaultResult> {
  const broken = surfaceWgsl.replace('fn fs_main(', 'fn fs_main(this is not wgsl ');
  const manifest = parseJsonValue(manifestText.split(sha256Hex(utf8Bytes(surfaceWgsl))).join(sha256Hex(utf8Bytes(broken))));
  try {
    const presenter = await createWebGPUSurfacePresenter(freshCanvas(), {
      shader: { wgsl: broken, manifest },
      atlas: staticAtlasSource(PACK),
      size: { cssWidth: GEOMETRY.canvasPxW, cssHeight: GEOMETRY.canvasPxH, dpr: 1 },
    });
    presenter.dispose();
    return { status: 'created' };
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return { status: 'refused', reason: error.reason };
    }
    if (error instanceof RendererFaultError) {
      return { status: 'fault', errorName: error.name, code: error.code, message: error.message };
    }
    throw error;
  }
}

function boot(): WebGpuProbe {
  canvasElement();
  return {
    ready: true,
    probeVersion: WEBGPU_PROBE_VERSION,
    hasNavigatorGpu: 'gpu' in navigator && (navigator as { gpu?: GPU }).gpu !== undefined,
    runAtlasFixture: () =>
      runFixture(PACK, [
        { id: 'paint', surface: PAINT, inputReceiptSha256: PAINT_SHA },
        { id: 'erase', surface: ERASE, inputReceiptSha256: ERASE_SHA },
      ]),
    runProceduralFixture: () =>
      runFixture(EMPTY_ATLAS, [
        { id: 'procedural-paint', surface: proceduralOnly(PAINT) },
        { id: 'procedural-erase', surface: proceduralOnly(ERASE) },
      ]),
    runResizeSequence,
    runShaderFault,
  };
}

try {
  window.__geordiWebGpuProbe = boot();
  document.body.dataset.webgpuProbe = 'ready';
} catch (error) {
  window.__geordiWebGpuProbeError = error instanceof Error ? error.message : String(error);
  document.body.dataset.webgpuProbe = 'error';
}
