import { readFileSync } from 'node:fs';

import { parseJsonValue, stringifyCanonicalJson } from '@flyingrobots/geordi-core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  assertBitExactFrameHash,
  BackendUnavailableError,
  BijouGpuValidationError,
  CANVAS2D_BACKEND_PROFILE,
  canvas2DExecutedArtifactSource,
  cellFromPoint,
  createCanvas2DSurfacePresenter,
  createGlyphAtlas,
  FLAG_BOLD,
  FLAG_DIM,
  FLAG_INVERSE,
  FLAG_STRIKETHROUGH,
  parseEndpointReceipt,
  readPixel,
  RendererFaultError,
  renderReferenceRgba,
  serializeEndpointReceipt,
  sha256Hex,
  TEST_GLYPH_COLOR_HEART,
  TEST_GLYPH_DECOMPOSED_E_ACUTE,
  UNDERLINE_CURLY,
  UNDERLINE_SOLID,
  utf8Bytes,
  type Canvas2DGlyphAtlas,
  type Canvas2DSurfacePresenter,
  type Canvas2DSurfacePresenterOptions,
  type EndpointReceipt,
  type GlyphAtlas,
  type GlyphRasterRequest,
  type GpuSurfacePresenter,
  type GpuSurfacePresenterFactory,
  type ReferenceFrame,
} from './index.js';
import {
  LiveSurface,
  liveFromReceipt,
  RecordingCanvas,
  testGlyphPackAtlas,
  type RecordedDraw,
} from '../test/canvas2d-support.js';
import { loadProceduralTable, renderSuite, suiteFrame } from '../test/support.js';

const table = loadProceduralTable();
const rendered = renderSuite();
const { suite, pack } = rendered;

interface Rig {
  readonly canvas: RecordingCanvas;
  readonly presenter: Canvas2DSurfacePresenter;
  readonly atlas: Canvas2DGlyphAtlas;
}

function rig(
  overrides: Partial<Canvas2DSurfacePresenterOptions> & {
    readonly canvasPxW?: number;
    readonly canvasPxH?: number;
  } = {},
): Rig {
  const canvas = new RecordingCanvas(
    overrides.canvasPxW ?? suite.canvasPxW,
    overrides.canvasPxH ?? suite.canvasPxH,
  );
  const atlas = overrides.atlas ?? testGlyphPackAtlas(pack);
  const presenter = createCanvas2DSurfacePresenter({
    canvas,
    atlas,
    proceduralTable: table,
    defaultFg: suite.defaultFg,
    defaultBg: suite.defaultBg,
    ...overrides,
  });
  return { canvas, presenter, atlas };
}

function oracleOf(
  surface: LiveSurface,
  canvas: RecordingCanvas,
  atlas: Pick<GlyphAtlas, 'bitmap' | 'toSlotMap'> | null = null,
): ReferenceFrame {
  return renderReferenceRgba(
    surface.toReferenceSurface(),
    atlas?.bitmap ?? pack.atlasBitmap,
    atlas?.toSlotMap() ?? pack.slotMap,
    table,
    {
      canvasPxW: canvas.width,
      canvasPxH: canvas.height,
      defaultFg: suite.defaultFg,
      defaultBg: suite.defaultBg,
    },
  );
}

function receiptOf(presenter: GpuSurfacePresenter): EndpointReceipt {
  const receipt = presenter.getLastReceipt();
  if (receipt === null) {
    throw new RendererFaultError('canvas2d', 'test expected a receipt');
  }
  return receipt;
}

function puts(calls: readonly RecordedDraw[]): Extract<RecordedDraw, { op: 'putImageData' }>[] {
  return calls.filter((call): call is Extract<RecordedDraw, { op: 'putImageData' }> => call.op === 'putImageData');
}

function area(calls: readonly RecordedDraw[]): number {
  return puts(calls).reduce((sum, call) => sum + call.width * call.height, 0);
}

/** Every recorded operation that writes or allocates pixels: the draw-call budget. */
function drawOps(calls: readonly RecordedDraw[]): RecordedDraw[] {
  return calls.filter((call) => call.op !== 'getImageData');
}

/**
 * The first byte at which two frames differ, as `index: actual != expected`, or
 * `null` when they are identical. Exact, and fast on whole frames.
 */
function firstDifference(actual: Uint8Array, expected: Uint8Array): string | null {
  if (actual.length !== expected.length) {
    return `length ${String(actual.length)} != ${String(expected.length)}`;
  }
  if (Buffer.from(actual.buffer, actual.byteOffset, actual.length).equals(
    Buffer.from(expected.buffer, expected.byteOffset, expected.length),
  )) {
    return null;
  }
  const index = actual.findIndex((byte, at) => byte !== expected[at]);
  return `byte ${String(index)}: ${String(actual[index])} != ${String(expected[index])}`;
}

const BLANK = (width: number, height: number): LiveSurface => new LiveSurface(width, height);

describe('Canvas 2D presenter contract', () => {
  it('is a synchronous GpuSurfacePresenterFactory and implements every GpuSurfacePresenter member', () => {
    expectTypeOf(createCanvas2DSurfacePresenter).toExtend<
      GpuSurfacePresenterFactory<Canvas2DSurfacePresenterOptions>
    >();
    expectTypeOf<Canvas2DSurfacePresenter>().toExtend<GpuSurfacePresenter>();
    // A live GlyphAtlas is accepted as the presenter's atlas without adaptation.
    expectTypeOf<GlyphAtlas>().toExtend<Canvas2DGlyphAtlas>();
    const { presenter } = rig();
    expect(presenter).not.toBeInstanceOf(Promise);
    for (const member of ['present', 'resize', 'cellFromPoint', 'getLastReceipt', 'dispose'] as const) {
      expect(typeof presenter[member]).toBe('function');
    }
  });

  it('asks the canvas for a 2d context only and names no WebGL or WebGPU API in its source', () => {
    const { canvas, presenter } = rig();
    const paint = liveFromReceipt(rendered.paintReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    receiptOf(presenter);
    expect(canvas.contextRequests).toEqual(['2d']);
    for (const file of ['canvas2d-presenter.ts', 'canvas2d-compose.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/webgl|webgpu|navigator\.gpu|GPUDevice|WebGL2RenderingContext/iu);
    }
  });

  it('refuses with BackendUnavailableError when the canvas has no 2d context', () => {
    const canvas = new RecordingCanvas(8, 16);
    canvas.refuseContext = true;
    const create = (): Canvas2DSurfacePresenter =>
      createCanvas2DSurfacePresenter({ canvas, atlas: testGlyphPackAtlas(pack), proceduralTable: table });
    expect(create).toThrow(BackendUnavailableError);
    try {
      create();
    } catch (error) {
      expect(error).not.toBeInstanceOf(RendererFaultError);
      expect((error as BackendUnavailableError).backend).toBe('canvas2d');
    }
  });

  it('throws RendererFaultError when presenting after dispose, and dispose removes its listeners', () => {
    const { canvas, presenter } = rig();
    expect(canvas.listenerCount()).toBeGreaterThan(0);
    presenter.dispose();
    expect(canvas.listenerCount()).toBe(0);
    const paint = liveFromReceipt(rendered.paintReceipt);
    expect(() => {
      presenter.present(BLANK(paint.width, paint.height), paint, {});
    }).toThrow(RendererFaultError);
    expect(presenter.getLastReceipt()).toBeNull();
    // Dispose is idempotent.
    presenter.dispose();
  });
});

describe('Canvas 2D presenter golden frames', () => {
  it('presents the paint frame bit-exactly to the oracle and the suite golden frame digest', () => {
    const { canvas, presenter } = rig();
    const paint = liveFromReceipt(rendered.paintReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    const receipt = receiptOf(presenter);
    expect(firstDifference(canvas.rgba(), rendered.paint.rgba)).toBeNull();
    expect(receipt.frameRgbaSha256).toBe(suiteFrame(suite, 'paint').frameRgbaSha256);
    expect(receipt.preparedBufferSha256).toBe(suiteFrame(suite, 'paint').preparedBufferSha256);
    assertBitExactFrameHash(receipt, rendered.paint);
  });

  it('presents paint -> erase repainting only the union-damaged cells, bit-exactly to the erase golden', () => {
    const { canvas, presenter } = rig();
    const paint = liveFromReceipt(rendered.paintReceipt);
    const erase = liveFromReceipt(rendered.eraseReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    canvas.takeCalls();

    presenter.present(paint, erase, {});
    const calls = canvas.takeCalls();
    const receipt = receiptOf(presenter);
    expect(firstDifference(canvas.rgba(), rendered.erase.rgba)).toBeNull();
    expect(receipt.frameRgbaSha256).toBe(suiteFrame(suite, 'erase').frameRgbaSha256);
    assertBitExactFrameHash(receipt, rendered.erase);

    // Cells whose prepared words changed between the frames: the only pixels
    // the incremental present may write.
    const changed: number[] = [];
    for (let cell = 0; cell < paint.width * paint.height; cell += 1) {
      const before = rendered.paint.preparedCells.subarray(cell * 4, cell * 4 + 4);
      const after = rendered.erase.preparedCells.subarray(cell * 4, cell * 4 + 4);
      if (before.some((word, index) => word !== after[index])) {
        changed.push(cell);
      }
    }
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(paint.width * paint.height);
    const cellArea = suite.cellPxW * suite.cellPxH;
    expect(area(calls)).toBe(changed.length * cellArea);
    expect(puts(calls).length).toBeLessThanOrEqual(changed.length);
    expect(calls.some((call) => call.op === 'createImageData')).toBe(false);
    for (const call of puts(calls)) {
      // Rects are whole cells: no seam, no partial cell.
      expect(call.x % suite.cellPxW).toBe(0);
      expect(call.y % suite.cellPxH).toBe(0);
      expect(call.width % suite.cellPxW).toBe(0);
      expect(call.height).toBe(suite.cellPxH);
    }
  });
});

describe('Canvas 2D presenter receipt', () => {
  it('emits a receipt that passes the endpoint receipt validator with profile geordi-canvas2d/1 and software-probed evidence', () => {
    const { presenter } = rig({ adapter: { name: 'unit recording canvas', driver: 'vitest' } });
    const paint = liveFromReceipt(rendered.paintReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    const receipt = receiptOf(presenter);
    const reparsed = parseEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt)));
    expect(reparsed).toEqual(receipt);
    expect(CANVAS2D_BACKEND_PROFILE).toBe('geordi-canvas2d/1');
    expect(receipt).toMatchObject({
      backendProfile: 'geordi-canvas2d/1',
      adapter: { backend: 'canvas2d', name: 'unit recording canvas', driver: 'vitest' },
      evidenceLevel: 'software-probed',
      assembledWgslSha256: null,
      generatedGlslSha256: null,
      shaderSha256: null,
      widthCells: paint.width,
      heightCells: paint.height,
      cellPx: { width: suite.cellPxW, height: suite.cellPxH },
      canvasPxW: suite.canvasPxW,
      canvasPxH: suite.canvasPxH,
      dpr: 1,
      defaultFg: suite.defaultFg,
      defaultBg: suite.defaultBg,
      fontIdentity: pack.fontIdentity,
      atlasGeneration: 1,
      atlasStats: pack.atlasStats,
    });
    expect(receipt.executedArtifactSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(receipt.probes.length).toBeGreaterThan(0);
    for (const probe of receipt.probes) {
      expect(probe.rgba).toEqual(readPixel(rendered.paint, probe.px, probe.py));
    }
  });

  it('samples host-chosen probe points and refuses one outside the canvas', () => {
    const points = [
      [0, 0],
      [5, 7],
      [suite.canvasPxW - 1, suite.canvasPxH - 1],
    ] as const;
    const { presenter } = rig({ probePoints: points });
    const paint = liveFromReceipt(rendered.paintReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    expect(receiptOf(presenter).probes).toEqual(
      points.map(([px, py]) => ({ px, py, rgba: readPixel(rendered.paint, px, py) })),
    );
    const outside = rig({ probePoints: [[suite.canvasPxW, 0]] });
    outside.presenter.present(BLANK(paint.width, paint.height), paint, {});
    expect(() => outside.presenter.getLastReceipt()).toThrow(BijouGpuValidationError);
  });

  it('returns null before the first frame', () => {
    expect(rig().presenter.getLastReceipt()).toBeNull();
  });

  it('pins executedArtifactSha256 to the source text of the executed pixel functions, or to a host-supplied digest', () => {
    const paint = liveFromReceipt(rendered.paintReceipt);
    const source = canvas2DExecutedArtifactSource();
    const compose = readFileSync(new URL('./canvas2d-compose.ts', import.meta.url), 'utf8');
    expect(compose).toContain('export function composeCanvas2DCell');
    expect(source).toContain('function composeCanvas2DCell');
    expect(source).toContain('function packSurfaceDamage');
    expect(source).toContain('function lerpU8');

    const plain = rig();
    plain.presenter.present(BLANK(paint.width, paint.height), paint, {});
    expect(receiptOf(plain.presenter).executedArtifactSha256).toBe(sha256Hex(utf8Bytes(source)));

    const pinned = 'ab'.repeat(32);
    const hosted = rig({ executedArtifactSha256: pinned });
    hosted.presenter.present(BLANK(paint.width, paint.height), paint, {});
    expect(receiptOf(hosted.presenter).executedArtifactSha256).toBe(pinned);

    expect(() => rig({ executedArtifactSha256: 'not-a-digest' })).toThrow(BijouGpuValidationError);
  });

  it('binds inputReceiptSha256 to the host-supplied digest, or to a copy of the live input taken during present', () => {
    const paint = liveFromReceipt(rendered.paintReceipt);
    const { presenter } = rig();
    presenter.present(BLANK(paint.width, paint.height), paint, {
      inputReceiptSha256: suiteFrame(suite, 'paint').inputReceiptSha256,
    });
    expect(receiptOf(presenter).inputReceiptSha256).toBe(suiteFrame(suite, 'paint').inputReceiptSha256);

    const live = rig();
    const target = paint.clone();
    live.presenter.present(BLANK(paint.width, paint.height), target, {});
    const expected = sha256Hex(
      new Uint8Array([...target.buffer, ...utf8Bytes(stringifyCanonicalJson(target.sideTable))]),
    );
    // The caller reuses its buffers as soon as present returns.
    target.clear();
    target.sideTable.push('reused');
    expect(receiptOf(live.presenter).inputReceiptSha256).toBe(expected);
  });
});

describe('Canvas 2D presenter draw operations', () => {
  const surfaceW = 80;
  const surfaceH = 24;

  it('issues one cell-sized putImageData for a single-cell update on an 80x24 grid', () => {
    const { canvas, presenter } = rig({ canvasPxW: surfaceW * 8, canvasPxH: surfaceH * 16 });
    const front = BLANK(surfaceW, surfaceH);
    for (let col = 0; col < surfaceW; col += 1) {
      front.paint(col, 3, { glyph: 'A', fg: [200, 100, 50], bg: [10, 20, 30] });
    }
    presenter.present(BLANK(surfaceW, surfaceH), front, {});
    const first = canvas.takeCalls();
    expect(puts(first)).toEqual([
      { op: 'putImageData', x: 0, y: 0, width: surfaceW * 8, height: surfaceH * 16 },
    ]);

    const back = front.clone();
    back.renderDirtyWords.fill(0);
    back.paint(41, 17, { glyph: TEST_GLYPH_COLOR_HEART, bg: [1, 2, 3], opacity: 40 });
    presenter.present(front, back, {});
    const calls = canvas.takeCalls();
    expect(drawOps(calls)).toEqual([{ op: 'putImageData', x: 41 * 8, y: 17 * 16, width: 8, height: 16 }]);
    expect(firstDifference(canvas.rgba(), oracleOf(back, canvas).rgba)).toBeNull();
  });

  it('batches horizontally contiguous changed cells in a row into one putImageData', () => {
    const { canvas, presenter } = rig({ canvasPxW: surfaceW * 8, canvasPxH: surfaceH * 16 });
    const front = BLANK(surfaceW, surfaceH);
    presenter.present(BLANK(surfaceW, surfaceH), front, {});
    canvas.takeCalls();

    const back = BLANK(surfaceW, surfaceH);
    for (let col = 10; col < 30; col += 1) {
      back.paint(col, 5, { bg: [40, 80, 120] });
    }
    for (let col = 2; col < 5; col += 1) {
      back.paint(col, 5, { glyph: '█', fg: [9, 9, 9] });
    }
    back.paint(70, 9, { glyph: '⡇', fg: [250, 0, 0] });
    presenter.present(front, back, {});
    expect(drawOps(canvas.takeCalls())).toEqual([
      { op: 'putImageData', x: 2 * 8, y: 5 * 16, width: 3 * 8, height: 16 },
      { op: 'putImageData', x: 10 * 8, y: 5 * 16, width: 20 * 8, height: 16 },
      { op: 'putImageData', x: 70 * 8, y: 9 * 16, width: 8, height: 16 },
    ]);
    expect(firstDifference(canvas.rgba(), oracleOf(back, canvas).rgba)).toBeNull();
  });

  it('issues no draw operation when nothing changed', () => {
    const { canvas, presenter } = rig({ canvasPxW: surfaceW * 8, canvasPxH: surfaceH * 16 });
    const front = BLANK(surfaceW, surfaceH).paint(3, 3, { glyph: 'A' });
    presenter.present(BLANK(surfaceW, surfaceH), front, {});
    canvas.takeCalls();
    // Dirty but byte-identical: the packer skips it and nothing is drawn.
    const same = front.clone();
    presenter.present(front, same, {});
    expect(drawOps(canvas.takeCalls())).toEqual([]);
  });
});

describe('Canvas 2D presenter edges', () => {
  it('presents an empty 0x0 surface as solid defaultBg with a valid receipt', () => {
    const { canvas, presenter } = rig({ canvasPxW: 5, canvasPxH: 3 });
    presenter.present(BLANK(0, 0), BLANK(0, 0), {});
    const receipt = receiptOf(presenter);
    expect(receipt.widthCells).toBe(0);
    expect(receipt.heightCells).toBe(0);
    const oracle = oracleOf(BLANK(0, 0), canvas);
    expect(firstDifference(canvas.rgba(), oracle.rgba)).toBeNull();
    assertBitExactFrameHash(receipt, oracle);
    expect(presenter.cellFromPoint(1, 1)).toBeNull();
  });

  it('does not accumulate alpha when a partial-opacity cell is repainted over itself', () => {
    const { canvas, presenter } = rig({ canvasPxW: 32, canvasPxH: 32 });
    const ghost = { glyph: 'A', fg: [250, 250, 10], bg: [200, 0, 0], opacity: 20, flags: UNDERLINE_SOLID } as const;
    const other = { glyph: '▒', fg: [0, 200, 0], bg: [0, 0, 220], opacity: 33 } as const;
    let front = BLANK(4, 2);
    presenter.present(BLANK(4, 2), front, {});
    for (let step = 0; step < 21; step += 1) {
      const back = BLANK(4, 2).paint(1, 1, step % 2 === 0 ? ghost : other);
      // Every other present repaints the same partial-opacity bytes in full.
      presenter.present(front, back, { forceFullRefresh: step % 3 === 0 });
      front = back;
    }
    const expected = oracleOf(BLANK(4, 2).paint(1, 1, ghost), canvas);
    expect(firstDifference(canvas.rgba(), expected.rgba)).toBeNull();
    assertBitExactFrameHash(receiptOf(presenter), expected);
  });

  it('invalidates on a DPR resize: resizes the canvas, reallocates once, and redraws the whole frame', () => {
    const { canvas, presenter } = rig();
    const paint = liveFromReceipt(rendered.paintReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    canvas.takeCalls();

    presenter.resize({ cssWidth: suite.canvasPxW, cssHeight: suite.canvasPxH, dpr: 2 });
    expect([canvas.width, canvas.height]).toEqual([suite.canvasPxW * 2, suite.canvasPxH * 2]);
    const same = paint.clone();
    same.renderDirtyWords.fill(0);
    presenter.present(paint, same, {});
    const calls = canvas.takeCalls();
    expect(drawOps(calls)).toEqual([
      { op: 'createImageData', width: suite.canvasPxW * 2, height: suite.canvasPxH * 2 },
      { op: 'putImageData', x: 0, y: 0, width: suite.canvasPxW * 2, height: suite.canvasPxH * 2 },
    ]);
    const receipt = receiptOf(presenter);
    expect(receipt.dpr).toBe(2);
    expect([receipt.canvasPxW, receipt.canvasPxH]).toEqual([suite.canvasPxW * 2, suite.canvasPxH * 2]);
    assertBitExactFrameHash(receipt, oracleOf(paint, canvas));

    // The exact device-pixel box wins over CSS size times DPR.
    presenter.resize({
      cssWidth: suite.canvasPxW,
      cssHeight: suite.canvasPxH,
      dpr: 1.5,
      devicePixelContentBox: { width: 101, height: 176 },
    });
    expect([canvas.width, canvas.height]).toEqual([101, 176]);
    // An unchanged size does not clear the canvas or force a redraw.
    canvas.takeCalls();
    presenter.resize({
      cssWidth: suite.canvasPxW,
      cssHeight: suite.canvasPxH,
      dpr: 1.5,
      devicePixelContentBox: { width: 101, height: 176 },
    });
    presenter.present(paint, same.clone(), {});
    expect(drawOps(canvas.takeCalls()).map((call) => call.op)).toEqual(['createImageData', 'putImageData']);
    presenter.present(same, same.clone(), {});
    expect(drawOps(canvas.takeCalls())).toEqual([]);
  });

  it('rejects non-finite or non-positive host resize input', () => {
    const { presenter } = rig();
    for (const [index, bad] of [
      { cssWidth: Number.NaN, cssHeight: 10, dpr: 1 },
      { cssWidth: 10, cssHeight: 0, dpr: 1 },
      { cssWidth: 10, cssHeight: 10, dpr: Number.POSITIVE_INFINITY },
      { cssWidth: 10, cssHeight: 10, dpr: -1 },
      { cssWidth: 10, cssHeight: 10, dpr: 1, devicePixelContentBox: { width: 0, height: 4 } },
      { cssWidth: 10, cssHeight: 10, dpr: 1, devicePixelContentBox: { width: 2.5, height: 4 } },
    ].entries()) {
      expect(() => {
        presenter.resize(bad);
      }, `case ${String(index)}`).toThrow(BijouGpuValidationError);
    }
  });

  it('redraws the whole grid after an atlas reset, bit-exactly against the new atlas bytes', () => {
    const rasterize = (request: GlyphRasterRequest): number[] => {
      const out: number[] = [];
      const seed = request.grapheme.charCodeAt(0) + (request.bold ? 7 : 0);
      for (let ly = 0; ly < request.cellPxH; ly += 1) {
        for (let lx = 0; lx < request.cellPxW; lx += 1) {
          out.push(255, 255, 255, (seed * 13 + lx * 31 + ly * 17) & 255);
        }
      }
      return out;
    };
    const atlas = createGlyphAtlas({
      rasterizer: { rasterize },
      atlasCols: 4,
      atlasRows: 4,
      metrics: { cellPxW: 6, cellPxH: 10, fontIdentity: 'unit-pattern-font' },
    });
    const { canvas, presenter } = rig({ atlas, canvasPxW: 6 * 10, canvasPxH: 10 * 3 });
    const front = BLANK(10, 3)
      .paint(0, 0, { glyph: 'x', fg: [255, 0, 0] })
      .paint(1, 0, { glyph: 'y', flags: FLAG_BOLD | FLAG_INVERSE })
      .paint(9, 2, { glyph: 'z', bg: [0, 0, 90], opacity: 11, flags: FLAG_DIM | UNDERLINE_CURLY });
    presenter.present(BLANK(10, 3), front, {});
    expect(firstDifference(canvas.rgba(), oracleOf(front, canvas, atlas).rgba)).toBeNull();
    canvas.takeCalls();

    atlas.invalidate(undefined, 'font-ready');
    const back = front.clone();
    back.renderDirtyWords.fill(0);
    back.paint(5, 1, { glyph: 'w', flags: FLAG_STRIKETHROUGH });
    presenter.present(front, back, {});
    expect(drawOps(canvas.takeCalls())).toEqual([
      { op: 'putImageData', x: 0, y: 0, width: 60, height: 30 },
    ]);
    const receipt = receiptOf(presenter);
    expect(receipt.atlasGeneration).toBe(2);
    expect(receipt.atlasStats.usedSlots).toBe(4);
    assertBitExactFrameHash(receipt, oracleOf(back, canvas, atlas));
  });

  it('repaints the retained frame when a lost 2D context is restored, without a new present', () => {
    const { canvas, presenter } = rig();
    const paint = liveFromReceipt(rendered.paintReceipt);
    presenter.present(BLANK(paint.width, paint.height), paint, {});
    canvas.dispatch('contextlost');
    canvas.loseContents();
    expect(firstDifference(canvas.rgba(), rendered.paint.rgba)).not.toBeNull();
    canvas.takeCalls();
    canvas.dispatch('contextrestored');
    expect(drawOps(canvas.takeCalls())).toEqual([
      { op: 'putImageData', x: 0, y: 0, width: suite.canvasPxW, height: suite.canvasPxH },
    ]);
    expect(firstDifference(canvas.rgba(), rendered.paint.rgba)).toBeNull();
    assertBitExactFrameHash(receiptOf(presenter), rendered.paint);
  });

  it('refuses a grid larger than the canvas and redraws fully once it fits', () => {
    const { canvas, presenter } = rig({ canvasPxW: 16, canvasPxH: 16 });
    const wide = BLANK(3, 1).paint(2, 0, { glyph: 'A' });
    expect(() => {
      presenter.present(BLANK(3, 1), wide, {});
    }).toThrow(BijouGpuValidationError);
    presenter.resize({ cssWidth: 24, cssHeight: 16, dpr: 1 });
    canvas.takeCalls();
    presenter.present(wide, wide.clone(), {});
    expect(puts(canvas.takeCalls())).toEqual([{ op: 'putImageData', x: 0, y: 0, width: 24, height: 16 }]);
    expect(firstDifference(canvas.rgba(), oracleOf(wide, canvas).rgba)).toBeNull();
  });

  it('hit-tests with the shared zero-based cellFromPoint law over the canvas grid capacity', () => {
    const { canvas, presenter } = rig({ canvasPxW: 67, canvasPxH: 117 });
    canvas.rect = { left: 10, top: 20, width: 33.5, height: 58.5 };
    const geometry = { cols: 8, rows: 7, cellPxW: 8, cellPxH: 16, canvasPxW: 67, canvasPxH: 117 };
    for (const [x, y] of [
      [10, 20],
      [10 + 4, 20 + 8],
      [10 + 33.4, 20 + 58.4],
      [-100, -100],
      [1e6, 1e6],
      [10 + 4.0001, 20],
    ] as const) {
      expect(presenter.cellFromPoint(x, y)).toEqual(cellFromPoint(geometry, canvas.rect, x, y));
    }
    expect(presenter.cellFromPoint(10 + 4, 20 + 8)).toEqual({ col: 1, row: 1 });
    expect(presenter.cellFromPoint(Number.NaN, 0)).toBeNull();
    canvas.rect = { left: 0, top: 0, width: 0, height: 10 };
    expect(presenter.cellFromPoint(0, 0)).toBeNull();
  });
});

describe('Canvas 2D presenter fuzz and stress', () => {
  it('keeps draw calls bounded and leaks nothing over 500 single-cell paint/erase updates', () => {
    const width = 40;
    const height = 12;
    const { canvas, presenter } = rig({ canvasPxW: width * 8 + 3, canvasPxH: height * 16 + 5 });
    const listeners = canvas.listenerCount();
    let seed = 0x2545f491;
    const next = (bound: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 8) % bound;
    };
    const glyphs = ['A', TEST_GLYPH_DECOMPOSED_E_ACUTE, TEST_GLYPH_COLOR_HEART, '╭', '▓', '⣿', ' '];
    let front = BLANK(width, height);
    presenter.present(BLANK(width, height), front, {});
    canvas.takeCalls();
    let painted: readonly [number, number] | null = null;
    let maxOps = 0;
    for (let step = 0; step < 500; step += 1) {
      const back = BLANK(width, height);
      const erase = step % 2 === 1;
      if (!erase) {
        const cell = [next(width), next(height)] as const;
        back.paint(cell[0], cell[1], {
          glyph: glyphs[next(glyphs.length)] ?? 'A',
          fg: [next(256), next(256), next(256)],
          bg: [next(256), next(256), next(256)],
          opacity: next(64),
          flags: next(256) & 0x7f,
        });
        painted = cell;
      }
      presenter.present(front, back, {});
      const calls = canvas.takeCalls();
      const ops = drawOps(calls);
      maxOps = Math.max(maxOps, ops.length);
      // Paint touches at most the new cell and the cell erased before it.
      expect(ops.length, `step ${String(step)}`).toBeLessThanOrEqual(2);
      expect(ops.every((call) => call.op === 'putImageData')).toBe(true);
      expect(area(calls), `step ${String(step)}`).toBeLessThanOrEqual(2 * 8 * 16);
      if (step % 50 === 49) {
        assertBitExactFrameHash(receiptOf(presenter), oracleOf(back, canvas));
      }
      front = back;
    }
    expect(painted).not.toBeNull();
    expect(maxOps).toBeGreaterThan(0);
    expect(canvas.listenerCount()).toBe(listeners);
    expect(canvas.contextRequests).toEqual(['2d']);
    assertBitExactFrameHash(receiptOf(presenter), oracleOf(front, canvas));
  });
});
