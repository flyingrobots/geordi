/**
 * Stable error codes for the `bijou-surface-gpu/1` conformance kit.
 *
 * Every code is documented in `docs/ERROR_CODES.md`.
 */
export const BIJOU_GPU_ERROR_CODES = [
  'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE',
  'GEORDI_E_BIJOU_RENDERER_FAULT',
  'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
  'GEORDI_E_BIJOU_INVALID_PACKED_CELLS',
  'GEORDI_E_BIJOU_INVALID_CELL_METRICS',
  'GEORDI_E_BIJOU_INVALID_SURFACE',
  'GEORDI_E_BIJOU_INVALID_ATLAS',
  'GEORDI_E_BIJOU_MISSING_GLYPH_SLOT',
  'GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE',
  'GEORDI_E_BIJOU_INVALID_RECEIPT',
  'GEORDI_E_BIJOU_FRAME_HASH_MISMATCH',
  'GEORDI_E_BIJOU_PIXEL_PROBE_MISMATCH',
  'GEORDI_E_BIJOU_NUMERIC_DOMAIN',
] as const;

export type BijouGpuErrorCode = (typeof BIJOU_GPU_ERROR_CODES)[number];

export type BijouGpuValidationErrorCode = Exclude<
  BijouGpuErrorCode,
  | 'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE'
  | 'GEORDI_E_BIJOU_RENDERER_FAULT'
  | 'GEORDI_E_BIJOU_INVALID_RECEIPT'
  | 'GEORDI_E_BIJOU_FRAME_HASH_MISMATCH'
  | 'GEORDI_E_BIJOU_PIXEL_PROBE_MISMATCH'
>;

/** Backends named by `adapter.backend` in `geordi-bijou-gpu-receipt/1`. */
export const GPU_BACKENDS = ['webgl2', 'webgpu', 'canvas2d', 'wgpu'] as const;

export type GpuBackend = (typeof GPU_BACKENDS)[number];

/**
 * A backend could not be created on this host (no WebGPU adapter, no WebGL2
 * context, ...). This is a capability refusal: it witnesses `capability-refused`
 * evidence and is never a rendering pass or a renderer fault.
 */
export class BackendUnavailableError extends Error {
  public readonly code = 'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE';
  public readonly backend: GpuBackend;
  public readonly reason: string;

  constructor(backend: GpuBackend, reason: string) {
    super(`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE: ${backend} is unavailable: ${reason}`);
    this.name = new.target.name;
    this.backend = backend;
    this.reason = reason;
  }
}

/**
 * An available backend failed while preparing, drawing, or reading back a
 * frame (shader compile failure, lost device, corrupted readback, ...).
 */
export class RendererFaultError extends Error {
  public readonly code = 'GEORDI_E_BIJOU_RENDERER_FAULT';
  public readonly backend: GpuBackend;
  public readonly detail: string;

  constructor(backend: GpuBackend, detail: string) {
    super(`GEORDI_E_BIJOU_RENDERER_FAULT: ${backend} renderer fault: ${detail}`);
    this.name = new.target.name;
    this.backend = backend;
    this.detail = detail;
  }
}

/** Input rejected by a conformance-kit validator. */
export class BijouGpuValidationError extends Error {
  public readonly code: BijouGpuValidationErrorCode;
  public readonly path: string;
  public readonly detail: string;

  constructor(code: BijouGpuValidationErrorCode, path: string, detail: string) {
    super(`${code} at ${path}: ${detail}`);
    this.name = new.target.name;
    this.code = code;
    this.path = path;
    this.detail = detail;
  }
}

export interface EndpointReceiptIssue {
  readonly path: string;
  readonly detail: string;
}

/** A `geordi-bijou-gpu-receipt/1` document failed validation. */
export class EndpointReceiptValidationError extends Error {
  public readonly code = 'GEORDI_E_BIJOU_INVALID_RECEIPT';
  public readonly issues: readonly EndpointReceiptIssue[];

  constructor(issues: readonly EndpointReceiptIssue[]) {
    super(
      `GEORDI_E_BIJOU_INVALID_RECEIPT: ${issues
        .map((issue) => `${issue.path}: ${issue.detail}`)
        .join('; ')}`,
    );
    this.name = new.target.name;
    this.issues = issues;
  }
}

/** A presenter frame did not hash bit-exactly to the reference oracle frame. */
export class FrameHashMismatchError extends Error {
  public readonly code = 'GEORDI_E_BIJOU_FRAME_HASH_MISMATCH';
  public readonly detail: string;

  constructor(detail: string) {
    super(`GEORDI_E_BIJOU_FRAME_HASH_MISMATCH: ${detail}`);
    this.name = new.target.name;
    this.detail = detail;
  }
}

export interface PixelProbeMismatch {
  readonly px: number;
  readonly py: number;
  readonly expected: readonly [number, number, number, number];
  readonly actual: readonly [number, number, number, number];
}

/** One or more exact sRGB-direct pixel probes did not match a frame. */
export class PixelProbeMismatchError extends Error {
  public readonly code = 'GEORDI_E_BIJOU_PIXEL_PROBE_MISMATCH';
  public readonly mismatches: readonly PixelProbeMismatch[];

  constructor(mismatches: readonly PixelProbeMismatch[]) {
    super(
      `GEORDI_E_BIJOU_PIXEL_PROBE_MISMATCH: ${mismatches
        .map(
          (mismatch) =>
            `(${String(mismatch.px)}, ${String(mismatch.py)}) expected [${mismatch.expected.join(', ')}] actual [${mismatch.actual.join(', ')}]`,
        )
        .join('; ')}`,
    );
    this.name = new.target.name;
    this.mismatches = mismatches;
  }
}
