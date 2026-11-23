import {
  CELL_STRIDE,
  FLAG_BG_SET,
  FLAG_EMPTY,
  FLAG_FG_SET,
  resolveSlotFromSlotMap,
  SIDE_TABLE_THRESHOLD,
  type Canvas2DGlyphAtlas,
  type Canvas2DImageData,
  type Canvas2DSurfaceCanvas,
  type Canvas2DSurfaceContext,
  type GpuClientRect,
  type GpuPackedSurface,
  type ReferenceSurface,
  type TestGlyphPack,
} from '../src/index.js';

/**
 * Test support for the Canvas 2D presenter, shared by the Node unit tests and
 * the browser harness. It imports no Node module.
 */

type Rgb = readonly [number, number, number];

/** The canonical empty cell of the checked-in receipts: `FLAG_EMPTY` at opacity 0. */
const RECEIPT_EMPTY = [0x20, 0, 0, 0, 0, 0, 0, 0, FLAG_EMPTY, 0] as const;
/** Bijou's live empty cell (`EMPTY_PACKED` in `core/render/differ-cell.ts`). */
const LIVE_EMPTY = [0x20, 0, 0, 0, 0, 0, 0, 0, FLAG_EMPTY, 63] as const;

export interface CellSpec {
  readonly glyph?: string;
  readonly fg?: Rgb;
  readonly bg?: Rgb;
  readonly flags?: number;
  readonly opacity?: number;
}

/**
 * A model of how Bijou drives a live `PackedSurface`: clearing resets every
 * cell and every render-dirty bit, and painting a cell sets its bit.
 */
export class LiveSurface implements GpuPackedSurface {
  public readonly buffer: Uint8Array;
  public readonly renderDirtyWords: Uint32Array;
  public sideTable: string[] = [];

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    this.buffer = new Uint8Array(width * height * CELL_STRIDE);
    this.renderDirtyWords = new Uint32Array(Math.ceil((width * height) / 32));
    this.clear();
  }

  clear(): this {
    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      this.buffer.set(LIVE_EMPTY, cell * CELL_STRIDE);
    }
    this.renderDirtyWords.fill(0);
    this.sideTable = [];
    return this;
  }

  paint(col: number, row: number, spec: CellSpec): this {
    const cell = row * this.width + col;
    const fg = spec.fg ?? [0, 0, 0];
    const bg = spec.bg ?? [0, 0, 0];
    const alpha =
      (spec.opacity ?? 63) |
      (spec.fg === undefined ? 0 : FLAG_FG_SET) |
      (spec.bg === undefined ? 0 : FLAG_BG_SET);
    const code = this.codeFor(spec.glyph ?? ' ');
    this.buffer.set([code & 0xff, code >>> 8, ...fg, ...bg, spec.flags ?? 0, alpha], cell * CELL_STRIDE);
    this.markDirty(cell);
    return this;
  }

  markDirty(cell: number): void {
    const word = cell >>> 5;
    this.renderDirtyWords[word] = ((this.renderDirtyWords[word] ?? 0) | (1 << (cell & 31))) >>> 0;
  }

  /** A deep copy, as Bijou's front buffer is a separate surface. */
  clone(): LiveSurface {
    const copy = new LiveSurface(this.width, this.height);
    copy.buffer.set(this.buffer);
    copy.renderDirtyWords.set(this.renderDirtyWords);
    copy.sideTable = [...this.sideTable];
    return copy;
  }

  toReferenceSurface(): ReferenceSurface {
    return {
      widthCells: this.width,
      heightCells: this.height,
      bytes: this.buffer.slice(),
      sideTable: [...this.sideTable],
    };
  }

  private codeFor(glyph: string): number {
    if (glyph.length === 1 && glyph.charCodeAt(0) < SIDE_TABLE_THRESHOLD) {
      return glyph.charCodeAt(0);
    }
    let index = this.sideTable.indexOf(glyph);
    if (index < 0) {
      index = this.sideTable.push(glyph) - 1;
    }
    return SIDE_TABLE_THRESHOLD + index;
  }
}

/** A live surface carrying a checked-in receipt, with a dirty bit on every non-empty cell. */
export function liveFromReceipt(receipt: ReferenceSurface): LiveSurface {
  const surface = new LiveSurface(receipt.widthCells, receipt.heightCells);
  const bytes = Uint8Array.from(receipt.bytes);
  surface.buffer.set(bytes);
  surface.sideTable = [...receipt.sideTable];
  for (let cell = 0; cell < receipt.widthCells * receipt.heightCells; cell += 1) {
    const cellBytes = bytes.subarray(cell * CELL_STRIDE, (cell + 1) * CELL_STRIDE);
    if (cellBytes.some((byte, index) => byte !== RECEIPT_EMPTY[index])) {
      surface.markDirty(cell);
    }
  }
  return surface;
}

/**
 * The bundled test glyph pack as a fixed atlas: the deterministic `rgba8uint`
 * bytes and slot map the conformance goldens were rendered with, in the shape
 * the Canvas 2D presenter reads from a `GlyphAtlas`. It never resets.
 */
export function testGlyphPackAtlas(pack: TestGlyphPack): Canvas2DGlyphAtlas {
  return {
    bitmap: pack.atlasBitmap,
    resolveSlot: resolveSlotFromSlotMap(pack.slotMap),
    atlasGeneration: () => 1,
    getReceiptAssets: () => ({
      atlasGeneration: 1,
      atlasStats: { ...pack.atlasStats },
      fontIdentity: pack.fontIdentity,
      cellPx: { width: pack.atlasBitmap.cellPxW, height: pack.atlasBitmap.cellPxH },
    }),
  };
}

/** One recorded call on a {@link RecordingCanvas}'s 2D context. */
export type RecordedDraw =
  | {
      readonly op: 'putImageData';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly op: 'getImageData'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly op: 'createImageData'; readonly width: number; readonly height: number };

/**
 * A software canvas with a recording 2D context. It keeps real opaque pixels,
 * so a presenter's frame can be read back and hashed, and records every call
 * so tests can count draw operations and allocations.
 */
export class RecordingCanvas implements Canvas2DSurfaceCanvas {
  public readonly contextRequests: string[] = [];
  public readonly calls: RecordedDraw[] = [];
  public readonly listeners = new Map<string, Set<() => void>>();
  public rect: GpuClientRect;
  public pixels: Uint8ClampedArray;
  /** When true, `getContext` returns `null`. */
  public refuseContext = false;
  private widthPx: number;
  private heightPx: number;
  private readonly context: Canvas2DSurfaceContext;

  constructor(width: number, height: number) {
    this.widthPx = width;
    this.heightPx = height;
    this.pixels = RecordingCanvas.blank(width, height);
    this.rect = { left: 0, top: 0, width, height };
    this.context = {
      createImageData: (w, h) => {
        this.calls.push({ op: 'createImageData', width: w, height: h });
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData: (image, dx, dy, dirtyX, dirtyY, dirtyW, dirtyH) => {
        this.calls.push({ op: 'putImageData', x: dx + dirtyX, y: dy + dirtyY, width: dirtyW, height: dirtyH });
        this.blit(image, dx, dy, dirtyX, dirtyY, dirtyW, dirtyH);
      },
      getImageData: (x, y, w, h) => {
        this.calls.push({ op: 'getImageData', x, y, width: w, height: h });
        const data = new Uint8ClampedArray(w * h * 4);
        for (let row = 0; row < h; row += 1) {
          const from = ((y + row) * this.widthPx + x) * 4;
          data.set(this.pixels.subarray(from, from + w * 4), row * w * 4);
        }
        return { width: w, height: h, data };
      },
    };
  }

  private static blank(width: number, height: number): Uint8ClampedArray {
    // An opaque (`alpha: false`) canvas starts opaque black.
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let offset = 3; offset < pixels.length; offset += 4) {
      pixels[offset] = 255;
    }
    return pixels;
  }

  get width(): number {
    return this.widthPx;
  }

  set width(value: number) {
    // Assigning a size clears a real canvas even when the value is unchanged.
    this.widthPx = value;
    this.pixels = RecordingCanvas.blank(this.widthPx, this.heightPx);
  }

  get height(): number {
    return this.heightPx;
  }

  set height(value: number) {
    this.heightPx = value;
    this.pixels = RecordingCanvas.blank(this.widthPx, this.heightPx);
  }

  getContext(contextId: string): Canvas2DSurfaceContext | null {
    this.contextRequests.push(contextId);
    if (contextId !== '2d' || this.refuseContext) {
      return null;
    }
    return this.context;
  }

  getBoundingClientRect(): GpuClientRect {
    return this.rect;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  /** Simulate a lost backing store: a real canvas comes back blank. */
  loseContents(): void {
    this.pixels = RecordingCanvas.blank(this.widthPx, this.heightPx);
  }

  listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    return count;
  }

  /** The whole canvas as tight top-left row-major RGBA8. */
  rgba(): Uint8Array {
    return new Uint8Array(this.pixels);
  }

  takeCalls(): RecordedDraw[] {
    return this.calls.splice(0, this.calls.length);
  }

  private blit(
    image: Canvas2DImageData,
    dx: number,
    dy: number,
    dirtyX: number,
    dirtyY: number,
    dirtyW: number,
    dirtyH: number,
  ): void {
    for (let row = dirtyY; row < dirtyY + dirtyH; row += 1) {
      for (let col = dirtyX; col < dirtyX + dirtyW; col += 1) {
        const x = dx + col;
        const y = dy + row;
        if (x < 0 || y < 0 || x >= this.widthPx || y >= this.heightPx) {
          continue;
        }
        const from = (row * image.width + col) * 4;
        const to = (y * this.widthPx + x) * 4;
        this.pixels[to] = image.data[from] ?? 0;
        this.pixels[to + 1] = image.data[from + 1] ?? 0;
        this.pixels[to + 2] = image.data[from + 2] ?? 0;
        // The canvas is opaque: alpha is always 255.
        this.pixels[to + 3] = 255;
      }
    }
  }
}
