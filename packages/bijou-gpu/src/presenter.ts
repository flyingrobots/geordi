import type { EndpointReceipt } from './receipt.js';

/**
 * The structural slice of Bijou's `PackedSurface` a GPU presenter consumes
 * (`packages/bijou/src/ports/surface-contract.ts`). It is declared
 * structurally so this package never imports Bijou.
 */
export interface GpuPackedSurface {
  /** Width in cells. */
  readonly width: number;
  /** Height in cells. */
  readonly height: number;
  /** Raw `bijou-packed-cell-u8x10-le/1` cells in row-major order. */
  readonly buffer: Uint8Array;
  /** Multi-codepoint graphemes referenced by packed character indexes. */
  readonly sideTable: readonly string[];
  /** One render-dirty bit per cell. */
  readonly renderDirtyWords: Uint32Array;
}

/** Per-frame context handed to {@link GpuSurfacePresenter.present}. */
export interface GpuPresentContext {
  /**
   * Rebuild and re-upload the whole grid, ignoring incremental dirty words.
   * Presenters also force a full refresh themselves on the triggers the ABI
   * lists (first frame, grid or metric change, atlas generation change, theme
   * default change, context or device restoration).
   */
  readonly forceFullRefresh?: boolean;
}

/** Host-boundary resize input: CSS box plus device pixel ratio. */
export interface GpuSurfaceResize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
  /** Exact device-pixel content box when the host can observe one. */
  readonly devicePixelContentBox?: { readonly width: number; readonly height: number };
}

/** A zero-based cell address. */
export interface GpuCellPoint {
  readonly col: number;
  readonly row: number;
}

/**
 * The one presenter contract shared by the WebGL2, Canvas 2D, and WebGPU
 * presenters and by host adapters.
 */
export interface GpuSurfacePresenter {
  /**
   * Present `target`, using the union of `current` and `target` dirty words as
   * damage. Synchronous: every byte and side-table string needed must be
   * consumed before this returns, because the caller reuses the buffers.
   */
  present(current: GpuPackedSurface, target: GpuPackedSurface, ctx: GpuPresentContext): void;
  /** Apply a new host size and device pixel ratio. */
  resize(size: GpuSurfaceResize): void;
  /** Hit-test client coordinates to a cell, or `null` when there is no grid. */
  cellFromPoint(clientX: number, clientY: number): GpuCellPoint | null;
  /** The receipt of the most recently presented frame, or `null` before one. */
  getLastReceipt(): EndpointReceipt | null;
  /** Release every GPU and host resource. */
  dispose(): void;
}

/**
 * Creates a presenter. Backends that initialise synchronously (WebGL2,
 * Canvas 2D) return the presenter directly; backends that must await an
 * adapter or device (WebGPU) return a promise. An unavailable backend throws
 * or rejects with `BackendUnavailableError`.
 */
export type GpuSurfacePresenterFactory<Options> = (
  options: Options,
) => GpuSurfacePresenter | Promise<GpuSurfacePresenter>;

/** Await a presenter from either a synchronous or an asynchronous factory. */
export async function createGpuSurfacePresenter<Options>(
  factory: GpuSurfacePresenterFactory<Options>,
  options: Options,
): Promise<GpuSurfacePresenter> {
  return await factory(options);
}

/** Client rectangle of the presenting element, in CSS pixels. */
export interface GpuClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Integer geometry of a presented grid. */
export interface GpuGridGeometry {
  readonly cols: number;
  readonly rows: number;
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The shared zero-based host-boundary hit-test every presenter must implement
 * identically. This is float ingress at the DOM edge; core rendering never
 * calls it.
 */
export function cellFromPoint(
  geometry: GpuGridGeometry,
  rect: GpuClientRect,
  clientX: number,
  clientY: number,
): GpuCellPoint | null {
  const { cols, rows, cellPxW, cellPxH, canvasPxW, canvasPxH } = geometry;
  if (
    cols === 0 ||
    rows === 0 ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY)
  ) {
    return null;
  }
  const physX = (clientX - rect.left) * (canvasPxW / rect.width);
  const physY = (clientY - rect.top) * (canvasPxH / rect.height);
  return {
    col: clamp(Math.floor(physX / cellPxW), 0, cols - 1),
    row: clamp(Math.floor(physY / cellPxH), 0, rows - 1),
  };
}
