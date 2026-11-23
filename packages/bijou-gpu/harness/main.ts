import { parseJsonValue, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

import eraseFrameText from '../../../fixtures/bijou-gpu/width1-erase.packed-bijou-cells.json?raw';
import paintFrameText from '../../../fixtures/bijou-gpu/width1-paint.packed-bijou-cells.json?raw';
import suiteText from '../../../fixtures/bijou-gpu/width1-conformance-suite.json?raw';
import {
  createTestGlyphPack,
  BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT,
  loadBundledProceduralGlyphTable,
  parsePackedBijouCellsReceipt,
  readPixel,
  renderReferenceRgba,
  sha256Hex,
  utf8Bytes,
  type ReferenceFrame,
} from '../src/index.js';

/**
 * Shared browser probe harness for `bijou-surface-gpu/1`.
 *
 * It boots the bundled deterministic test glyph pack, the checked-in width-1
 * conformance frames, and the CPU reference oracle inside a real browser, then
 * publishes them on `window.__geordiBijouGpuHarness`. Presenter probes render
 * the same frames with the same atlas bytes and compare against this oracle.
 */
export const HARNESS_VERSION = 'geordi-bijou-gpu-probe-harness/1';

export interface HarnessFrame {
  readonly id: string;
  readonly inputReceiptSha256: string;
  readonly preparedBufferSha256: string;
  readonly frameRgbaSha256: string;
}

export interface BijouGpuProbeHarness {
  readonly ready: true;
  readonly harnessVersion: typeof HARNESS_VERSION;
  readonly fontIdentity: string;
  readonly atlasRgbaSha256: string;
  readonly proceduralTableSha256: string;
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
  readonly frames: readonly HarnessFrame[];
  /** Draw an oracle frame onto the reference canvas. */
  showFrame(frameId: string): void;
  /** Exact oracle RGBA at a physical pixel of a frame. */
  oraclePixel(frameId: string, px: number, py: number): readonly number[];
  /** RGBA read back from the reference canvas at a physical pixel. */
  canvasPixel(px: number, py: number): readonly number[];
}

declare global {
  interface Window {
    __geordiBijouGpuHarness?: BijouGpuProbeHarness;
    __geordiBijouGpuHarnessError?: string;
  }
}

class BijouGpuHarnessError extends Error {
  constructor(detail: string) {
    super(`bijou-gpu probe harness: ${detail}`);
    this.name = new.target.name;
  }
}

function objectOf(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BijouGpuHarnessError(`${label} is not an object`);
  }
  return value as JsonObject;
}

function stringOf(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string') {
    throw new BijouGpuHarnessError(`${label} is not a string`);
  }
  return value;
}

function integerOf(value: JsonValue | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BijouGpuHarnessError(`${label} is not an integer`);
  }
  return value;
}

function boot(): BijouGpuProbeHarness {
  const suite = objectOf(parseJsonValue(suiteText), 'suite');
  const canvasPxW = integerOf(suite.canvasPxW, 'canvasPxW');
  const canvasPxH = integerOf(suite.canvasPxH, 'canvasPxH');
  const defaultFg = stringOf(suite.defaultFg, 'defaultFg');
  const defaultBg = stringOf(suite.defaultBg, 'defaultBg');

  const pack = createTestGlyphPack();
  const table = loadBundledProceduralGlyphTable();
  const rendered = new Map<string, ReferenceFrame>();
  const frames: HarnessFrame[] = [];
  for (const [id, text] of [
    ['paint', paintFrameText],
    ['erase', eraseFrameText],
  ] as const) {
    const receipt = parsePackedBijouCellsReceipt(parseJsonValue(text));
    const frame = renderReferenceRgba(receipt, pack.atlasBitmap, pack.slotMap, table, {
      canvasPxW,
      canvasPxH,
      defaultFg,
      defaultBg,
    });
    rendered.set(id, frame);
    frames.push({
      id,
      inputReceiptSha256: sha256Hex(utf8Bytes(text)),
      preparedBufferSha256: frame.preparedBufferSha256,
      frameRgbaSha256: frame.frameRgbaSha256,
    });
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#bijou-gpu-reference');
  const context = canvas?.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (canvas === null || context === null || context === undefined) {
    throw new BijouGpuHarnessError('reference canvas 2d context is unavailable');
  }
  canvas.width = canvasPxW;
  canvas.height = canvasPxH;

  const frameOf = (frameId: string): ReferenceFrame => {
    const frame = rendered.get(frameId);
    if (frame === undefined) {
      throw new BijouGpuHarnessError(`unknown frame ${frameId}`);
    }
    return frame;
  };
  const showFrame = (frameId: string): void => {
    const frame = frameOf(frameId);
    const image = context.createImageData(canvasPxW, canvasPxH);
    image.data.set(frame.rgba);
    context.putImageData(image, 0, 0);
    canvas.dataset.frame = frameId;
  };
  showFrame('paint');

  return {
    ready: true,
    harnessVersion: HARNESS_VERSION,
    fontIdentity: pack.fontIdentity,
    atlasRgbaSha256: pack.atlasRgbaSha256,
    proceduralTableSha256: sha256Hex(utf8Bytes(BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT)),
    cellPxW: pack.atlasBitmap.cellPxW,
    cellPxH: pack.atlasBitmap.cellPxH,
    canvasPxW,
    canvasPxH,
    defaultFg,
    defaultBg,
    frames,
    showFrame,
    oraclePixel: (frameId, px, py) => readPixel(frameOf(frameId), px, py),
    canvasPixel: (px, py) => Array.from(context.getImageData(px, py, 1, 1).data),
  };
}

try {
  window.__geordiBijouGpuHarness = boot();
  document.body.dataset.harness = 'ready';
} catch (error) {
  window.__geordiBijouGpuHarnessError = error instanceof Error ? error.message : String(error);
  document.body.dataset.harness = 'error';
}
