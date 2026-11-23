import type { AtlasBitmap, GlyphSlotMap } from './atlas.js';
import { BijouGpuValidationError } from './errors.js';
import type { GlyphAtlasDirtyRect, GlyphAtlasReceiptAssets } from './glyph-atlas.js';
import { PACKED_BIJOU_CELL_FORMAT } from './packed-cells.js';
import type { GpuGridGeometry, GpuSurfaceResize } from './presenter.js';
import { BIJOU_SURFACE_GPU_ABI, PROCEDURAL_GLYPH_TABLE_SHA256 } from './procedural-table.js';
import {
  BUNNY_PRIMITIVE_PINS,
  ENDPOINT_RECEIPT_VERSION,
  parseEndpointReceipt,
  PROBE_POLICY,
  type EndpointReceipt,
  type EndpointReceiptAdapter,
  type EndpointReceiptProbe,
  type EvidenceLevel,
} from './receipt.js';
import { resolveSlotFromSlotMap, type ResolveGlyphSlot } from './surface-damage.js';

/**
 * Host-boundary helpers every `bijou-surface-gpu/1` presenter shares: canvas
 * size ingress, grid geometry, the atlas a presenter reads, and receipt
 * assembly. Nothing here touches a graphics API.
 */

/** Largest physical canvas edge a receipt can record. */
export const MAX_PRESENTER_CANVAS_PX = 0xffff;

/** Integer physical canvas size. */
export interface PresenterCanvasPx {
  readonly canvasPxW: number;
  readonly canvasPxH: number;
}

function refuseSize(path: string, detail: string): never {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_SURFACE', path, detail);
}

function physicalEdge(value: number, path: string): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PRESENTER_CANVAS_PX) {
    return refuseSize(path, `expected an integer in 1..${String(MAX_PRESENTER_CANVAS_PX)}`);
  }
  return value;
}

/**
 * Convert a host resize into integer physical canvas pixels, the one place
 * CSS floats enter a presenter.
 *
 * Non-finite or non-positive `cssWidth`, `cssHeight` or `dpr` are refused, so
 * a zero-size canvas never reaches a graphics API. The exact
 * `devicePixelContentBox` wins when the host observed one; otherwise each edge
 * is `max(1, Math.round(css * dpr))`.
 *
 * @throws BijouGpuValidationError `GEORDI_E_BIJOU_INVALID_SURFACE`.
 */
export function resolvePresenterCanvasPx(size: GpuSurfaceResize): PresenterCanvasPx {
  for (const [field, value] of [
    ['cssWidth', size.cssWidth],
    ['cssHeight', size.cssHeight],
    ['dpr', size.dpr],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      refuseSize(`size.${field}`, 'expected a finite positive number');
    }
  }
  const box = size.devicePixelContentBox;
  if (box !== undefined) {
    return {
      canvasPxW: physicalEdge(box.width, 'size.devicePixelContentBox.width'),
      canvasPxH: physicalEdge(box.height, 'size.devicePixelContentBox.height'),
    };
  }
  return {
    canvasPxW: physicalEdge(Math.max(1, Math.round(size.cssWidth * size.dpr)), 'size.cssWidth'),
    canvasPxH: physicalEdge(Math.max(1, Math.round(size.cssHeight * size.dpr)), 'size.cssHeight'),
  };
}

/**
 * Grid capacity of a canvas: `cols = canvasPxW / cellPxW` and
 * `rows = canvasPxH / cellPxH`, integer floor division.
 */
export function presenterGridGeometry(
  canvas: PresenterCanvasPx,
  cellPxW: number,
  cellPxH: number,
): GpuGridGeometry {
  return {
    cols: Math.floor(canvas.canvasPxW / cellPxW),
    rows: Math.floor(canvas.canvasPxH / cellPxH),
    cellPxW,
    cellPxH,
    canvasPxW: canvas.canvasPxW,
    canvasPxH: canvas.canvasPxH,
  };
}

/**
 * The atlas a presenter reads. A live `GlyphAtlas` satisfies it as is; a fixed
 * bitmap such as the test glyph pack is adapted by {@link staticAtlasSource}.
 */
export interface PresenterAtlasSource {
  /** The `rgba8uint` atlas texels and the cell metrics they are cut to. */
  readonly bitmap: AtlasBitmap;
  readonly resolveSlot: ResolveGlyphSlot;
  /** The atlas generation; a change re-uploads the whole atlas and grid. */
  readonly atlasGeneration: () => number;
  /** Texel regions written since the last call, cleared by the call. */
  takeDirtyRects(): readonly GlyphAtlasDirtyRect[];
  getReceiptAssets(): GlyphAtlasReceiptAssets;
}

/** The fields of a fixed atlas, such as `createTestGlyphPack()` returns. */
export interface StaticAtlasInput {
  readonly atlasBitmap: AtlasBitmap;
  readonly slotMap: GlyphSlotMap;
  readonly fontIdentity: string;
  readonly atlasStats: GlyphAtlasReceiptAssets['atlasStats'];
  /** Receipt `atlasGeneration`. Defaults to `1`. */
  readonly generation?: number;
}

/** Adapt a fixed atlas bitmap and slot map to a {@link PresenterAtlasSource}. */
export function staticAtlasSource(input: StaticAtlasInput): PresenterAtlasSource {
  const generation = input.generation ?? 1;
  const assets: GlyphAtlasReceiptAssets = {
    atlasGeneration: generation,
    atlasStats: { ...input.atlasStats },
    fontIdentity: input.fontIdentity,
    cellPx: { width: input.atlasBitmap.cellPxW, height: input.atlasBitmap.cellPxH },
  };
  return {
    bitmap: input.atlasBitmap,
    resolveSlot: resolveSlotFromSlotMap(input.slotMap),
    atlasGeneration: () => generation,
    takeDirtyRects: () => [],
    getReceiptAssets: () => assets,
  };
}

/** Everything a presenter knows about one frame, by receipt field name. */
export interface PresenterReceiptInput {
  readonly inputReceiptSha256: string;
  readonly preparedBufferSha256: string;
  readonly assembledWgslSha256: string | null;
  readonly generatedGlslSha256: string | null;
  readonly shaderSha256: string | null;
  readonly executedArtifactSha256: string;
  readonly backendProfile: string;
  readonly adapter: EndpointReceiptAdapter;
  readonly evidenceLevel: EvidenceLevel;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly dpr: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
  readonly atlas: GlyphAtlasReceiptAssets;
  readonly frameRgbaSha256: string | null;
  readonly probes: readonly EndpointReceiptProbe[];
}

/**
 * Assemble a `geordi-bijou-gpu-receipt/1` from presenter state and run it
 * through the receipt validator, so a presenter can only ever emit a receipt
 * the validator accepts.
 *
 * @throws EndpointReceiptValidationError when the fields break a receipt rule,
 *   for example probed evidence without a frame digest.
 */
export function assemblePresenterReceipt(input: PresenterReceiptInput): EndpointReceipt {
  return parseEndpointReceipt({
    receiptVersion: ENDPOINT_RECEIPT_VERSION,
    gpuAbiVersion: BIJOU_SURFACE_GPU_ABI,
    cellFormatId: PACKED_BIJOU_CELL_FORMAT,
    inputReceiptSha256: input.inputReceiptSha256,
    preparedBufferSha256: input.preparedBufferSha256,
    proceduralTableSha256: PROCEDURAL_GLYPH_TABLE_SHA256,
    bunnyPrimitives: BUNNY_PRIMITIVE_PINS.map((pin) => ({ ...pin })),
    assembledWgslSha256: input.assembledWgslSha256,
    generatedGlslSha256: input.generatedGlslSha256,
    shaderSha256: input.shaderSha256,
    executedArtifactSha256: input.executedArtifactSha256,
    backendProfile: input.backendProfile,
    adapter: { ...input.adapter },
    evidenceLevel: input.evidenceLevel,
    widthCells: input.widthCells,
    heightCells: input.heightCells,
    cellPx: { ...input.atlas.cellPx },
    canvasPxW: input.canvasPxW,
    canvasPxH: input.canvasPxH,
    dpr: input.dpr,
    defaultFg: input.defaultFg,
    defaultBg: input.defaultBg,
    fontIdentity: input.atlas.fontIdentity,
    atlasGeneration: input.atlas.atlasGeneration,
    atlasStats: { ...input.atlas.atlasStats },
    frameRgbaSha256: input.frameRgbaSha256,
    probePolicy: PROBE_POLICY,
    probes: input.probes.map((probe) => ({ px: probe.px, py: probe.py, rgba: [...probe.rgba] })),
  });
}
