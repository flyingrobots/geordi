import { parseJsonValue, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

import eraseFrameText from '../../../fixtures/bijou-gpu/width1-erase.packed-bijou-cells.json?raw';
import paintFrameText from '../../../fixtures/bijou-gpu/width1-paint.packed-bijou-cells.json?raw';
import suiteText from '../../../fixtures/bijou-gpu/width1-conformance-suite.json?raw';
import {
  createCanvas2DSurfacePresenter,
  createCanvasGlyphRasterizer,
  createGlyphAtlas,
  createTestGlyphPack,
  loadBundledProceduralGlyphTable,
  FLAG_BOLD,
  FLAG_INVERSE,
  parsePackedBijouCellsReceipt,
  renderReferenceRgba,
  resolveCanvasGlyphEnvironment,
  serializeEndpointReceipt,
  sha256Hex,
  UNDERLINE_CURLY,
  UNDERLINE_SOLID,
  utf8Bytes,
  type Canvas2DSurfacePresenter,
  type EndpointReceipt,
} from '../src/index.js';
import { LiveSurface, liveFromReceipt, testGlyphPackAtlas } from '../test/canvas2d-support.js';

/**
 * Real-browser probe for the Canvas 2D presenter.
 *
 * It runs `createCanvas2DSurfacePresenter` on real `<canvas>` elements with
 * the bundled deterministic test glyph pack and the checked-in width-1
 * conformance frames, and publishes `window.__geordiCanvas2DProbe`. Every
 * frame digest it reports is hashed from the canvas's own `getImageData`
 * readback, and every oracle digest is computed in the same browser.
 */

export type Canvas2DProbeFrameId = 'paint' | 'erase';

export interface Canvas2DProbeResult {
  /** The presenter receipt as canonical JSON, for validation outside the page. */
  readonly receipt: string;
  /** The CPU oracle digest for the same input, canvas size, and atlas bytes. */
  readonly oracleSha256: string;
}

export interface Canvas2DProbe {
  readonly ready: true;
  readonly userAgent: string;
  /** Present a conformance frame after whatever the conformance canvas last showed. */
  present(frameId: Canvas2DProbeFrameId): Canvas2DProbeResult;
  /** Resize the conformance canvas through the presenter's host-boundary resize. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** Present the last frame again with clear dirty words (a redraw only invalidation forces). */
  presentAgain(): Canvas2DProbeResult;
  /** The conformance canvas's pixels, read back with `getImageData`. */
  canvasRgba(): number[];
  /** Repaint a partial-opacity cell over itself `count` times on a fresh canvas. */
  partialOpacityRepaints(count: number): Canvas2DProbeResult;
  /** Present glyphs rasterized by the browser into a live `GlyphAtlas`. */
  liveAtlasFrame(): Canvas2DProbeResult & { readonly usedSlots: number; readonly inkedTexels: number };
}

declare global {
  interface Window {
    __geordiCanvas2DProbe?: Canvas2DProbe;
    __geordiCanvas2DProbeError?: string;
  }
}

class Canvas2DProbeError extends Error {
  constructor(detail: string) {
    super(`bijou-gpu canvas2d probe: ${detail}`);
    this.name = new.target.name;
  }
}

function objectOf(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Canvas2DProbeError(`${label} is not an object`);
  }
  return value as JsonObject;
}

function stringOf(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string') {
    throw new Canvas2DProbeError(`${label} is not a string`);
  }
  return value;
}

function integerOf(value: JsonValue | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Canvas2DProbeError(`${label} is not an integer`);
  }
  return value;
}

function receiptOf(presenter: Canvas2DSurfacePresenter): EndpointReceipt {
  const receipt = presenter.getLastReceipt();
  if (receipt === null) {
    throw new Canvas2DProbeError('the presenter produced no receipt');
  }
  return receipt;
}

function canvasElement(selector: string): HTMLCanvasElement {
  const element = document.querySelector<HTMLCanvasElement>(selector);
  if (element === null) {
    throw new Canvas2DProbeError(`${selector} is missing`);
  }
  return element;
}

function boot(): Canvas2DProbe {
  const suite = objectOf(parseJsonValue(suiteText), 'suite');
  const canvasPxW = integerOf(suite.canvasPxW, 'canvasPxW');
  const canvasPxH = integerOf(suite.canvasPxH, 'canvasPxH');
  const defaultFg = stringOf(suite.defaultFg, 'defaultFg');
  const defaultBg = stringOf(suite.defaultBg, 'defaultBg');
  const pack = createTestGlyphPack();
  const table = loadBundledProceduralGlyphTable();
  const receipts = {
    paint: parsePackedBijouCellsReceipt(parseJsonValue(paintFrameText)),
    erase: parsePackedBijouCellsReceipt(parseJsonValue(eraseFrameText)),
  };
  const inputDigests = {
    paint: sha256Hex(utf8Bytes(paintFrameText)),
    erase: sha256Hex(utf8Bytes(eraseFrameText)),
  };

  const canvas = canvasElement('#bijou-gpu-canvas2d');
  canvas.width = canvasPxW;
  canvas.height = canvasPxH;
  const presenter = createCanvas2DSurfacePresenter({
    canvas,
    atlas: testGlyphPackAtlas(pack),
    defaultFg,
    defaultBg,
  });
  const readContext = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb', willReadFrequently: true });
  if (readContext === null) {
    throw new Canvas2DProbeError('the conformance canvas has no 2d context');
  }
  const first = liveFromReceipt(receipts.paint);
  let shown: LiveSurface = new LiveSurface(first.width, first.height);
  let shownId: Canvas2DProbeFrameId | null = null;

  const oracleSha256 = (frameId: Canvas2DProbeFrameId): string =>
    renderReferenceRgba(receipts[frameId], pack.atlasBitmap, pack.slotMap, table, {
      canvasPxW: canvas.width,
      canvasPxH: canvas.height,
      defaultFg,
      defaultBg,
    }).frameRgbaSha256;

  const present = (frameId: Canvas2DProbeFrameId): Canvas2DProbeResult => {
    const target = liveFromReceipt(receipts[frameId]);
    presenter.present(shown, target, { inputReceiptSha256: inputDigests[frameId] });
    shown = target;
    shownId = frameId;
    return { receipt: serializeEndpointReceipt(receiptOf(presenter)), oracleSha256: oracleSha256(frameId) };
  };

  const presentAgain = (): Canvas2DProbeResult => {
    if (shownId === null) {
      throw new Canvas2DProbeError('nothing has been presented');
    }
    const again = shown.clone();
    again.renderDirtyWords.fill(0);
    presenter.present(shown, again, { inputReceiptSha256: inputDigests[shownId] });
    shown = again;
    return { receipt: serializeEndpointReceipt(receiptOf(presenter)), oracleSha256: oracleSha256(shownId) };
  };

  const freshCanvas = (width: number, height: number): HTMLCanvasElement => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    document.body.append(element);
    return element;
  };

  const partialOpacityRepaints = (count: number): Canvas2DProbeResult => {
    const element = freshCanvas(40, 40);
    const repaint = createCanvas2DSurfacePresenter({
      canvas: element,
      atlas: testGlyphPackAtlas(pack),
      defaultFg,
      defaultBg,
    });
    const ghost = { glyph: 'A', fg: [250, 250, 10], bg: [200, 0, 0], opacity: 20, flags: UNDERLINE_SOLID } as const;
    const other = { glyph: '▒', fg: [0, 200, 0], bg: [0, 0, 220], opacity: 33 } as const;
    let front = new LiveSurface(4, 2);
    repaint.present(new LiveSurface(4, 2), front, {});
    for (let step = 0; step < count; step += 1) {
      const back = new LiveSurface(4, 2).paint(1, 1, step % 2 === 0 ? ghost : other);
      repaint.present(front, back, { forceFullRefresh: step % 3 === 0 });
      front = back;
    }
    const expected = renderReferenceRgba(front.toReferenceSurface(), pack.atlasBitmap, pack.slotMap, table, {
      canvasPxW: 40,
      canvasPxH: 40,
      defaultFg,
      defaultBg,
    });
    const result = { receipt: serializeEndpointReceipt(receiptOf(repaint)), oracleSha256: expected.frameRgbaSha256 };
    repaint.dispose();
    return result;
  };

  const liveAtlasFrame = (): Canvas2DProbeResult & { usedSlots: number; inkedTexels: number } => {
    const environment = resolveCanvasGlyphEnvironment(
      { family: 'monospace', sizeCssPx: 14, cellCssW: 9, cellCssH: 17 },
      window.devicePixelRatio,
    );
    const atlas = createGlyphAtlas({
      rasterizer: createCanvasGlyphRasterizer({ font: environment.font }),
      atlasCols: 16,
      atlasRows: 4,
      metrics: environment.metrics,
    });
    const { cellPxW, cellPxH } = environment.metrics;
    const cols = 12;
    const rows = 2;
    const element = freshCanvas(cols * cellPxW + 2, rows * cellPxH + 1);
    const live = createCanvas2DSurfacePresenter({
      canvas: element,
      atlas,
      defaultFg,
      defaultBg,
      dpr: window.devicePixelRatio,
    });
    const surface = new LiveSurface(cols, rows);
    ['G', 'e', 'o', 'r', 'd', 'i', ' ', 'e\u0301', '\u2500', '\u2588', '\u28ff'].forEach((glyph, col) => {
      surface.paint(col, 0, { glyph, fg: [230, 180, 40], bg: [20, 30, 60], opacity: 63 - col * 3 });
    });
    Array.from('Bijou').forEach((glyph, col) => {
      surface.paint(col, 1, {
        glyph,
        flags: col % 2 === 0 ? FLAG_BOLD | UNDERLINE_CURLY : FLAG_INVERSE,
        opacity: 40,
      });
    });
    live.present(new LiveSurface(cols, rows), surface, {});
    const receipt = receiptOf(live);
    const expected = renderReferenceRgba(surface.toReferenceSurface(), atlas.bitmap, atlas.toSlotMap(), table, {
      canvasPxW: element.width,
      canvasPxH: element.height,
      defaultFg,
      defaultBg,
    });
    let inkedTexels = 0;
    for (let offset = 3; offset < atlas.bitmap.rgba.length; offset += 4) {
      inkedTexels += (atlas.bitmap.rgba[offset] ?? 0) > 0 ? 1 : 0;
    }
    const result = {
      receipt: serializeEndpointReceipt(receipt),
      oracleSha256: expected.frameRgbaSha256,
      usedSlots: atlas.getStats().usedSlots,
      inkedTexels,
    };
    live.dispose();
    return result;
  };

  return {
    ready: true,
    userAgent: navigator.userAgent,
    present,
    presentAgain,
    resize: (cssWidth, cssHeight, dpr) => {
      presenter.resize({ cssWidth, cssHeight, dpr });
    },
    canvasRgba: () => Array.from(readContext.getImageData(0, 0, canvas.width, canvas.height).data),
    partialOpacityRepaints,
    liveAtlasFrame,
  };
}

try {
  window.__geordiCanvas2DProbe = boot();
  document.body.dataset.canvas2dProbe = 'ready';
} catch (error) {
  window.__geordiCanvas2DProbeError = error instanceof Error ? error.message : String(error);
  document.body.dataset.canvas2dProbe = 'error';
}
