import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseJsonValue, type JsonValue } from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';

import {
  FakeCanvas,
  FakeGpu,
  type FakeDevice,
  type FakeGpuOptions,
} from '../test/fake-webgpu.js';
import { renderSuite, type RenderedSuite } from '../test/support.js';
import {
  BackendUnavailableError,
  BijouGpuValidationError,
  RendererFaultError,
} from './errors.js';
import type { GlyphAtlasDirtyRect } from './glyph-atlas.js';
import type { PackedBijouCellsReceipt } from './packed-cells.js';
import { staticAtlasSource, type PresenterAtlasSource } from './presenter-host.js';
import type { GpuPackedSurface } from './presenter.js';
import { preparedBufferBytes } from './prepare.js';
import { serializeEndpointReceipt, validateEndpointReceipt } from './receipt.js';
import { sha256Hex, utf8Bytes } from './sha256.js';
import { createSurfaceDamageState, packSurfaceDamage, resolveSlotFromSlotMap } from './surface-damage.js';
import {
  alignedBytesPerRow,
  classifyWebGpuAdapter,
  createWebGPUSurfacePresenter,
  createWebGpuRefusalReceipt,
  decodeBijouSurfaceShader,
  planAtlasUploads,
  planCellRowUploads,
  selectWebGpuCanvasFormat,
  stripRowPadding,
  WEBGPU_DISPLAY_WGSL,
  webGpuExecutedArtifactSha256,
  type WebGpuSurfacePresenter,
  type WebGpuSurfacePresenterOptions,
} from './webgpu-presenter.js';

const SHADER_DIR = new URL('../shaders/', import.meta.url);
const WGSL = readFileSync(fileURLToPath(new URL('bijou-surface.wgsl', SHADER_DIR)), 'utf8');
const MANIFEST_TEXT = readFileSync(fileURLToPath(new URL('bijou-shaders.manifest.json', SHADER_DIR)), 'utf8');
const MANIFEST: JsonValue = parseJsonValue(MANIFEST_TEXT);
const MANIFEST_SURFACE_SHA = (() => {
  const match = /"assembledWgslSha256": "([0-9a-f]{64})",\s*"authoredSource": \{\s*"path": "packages\/bijou-gpu\/shaders\/src\/bijou-surface\.main\.wgsl"/u.exec(
    MANIFEST_TEXT,
  );
  if (match?.[1] === undefined) {
    throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_SURFACE', 'manifest', 'no bijou-surface digest');
  }
  return match[1];
})();

const SUITE: RenderedSuite = renderSuite();
const PAINT = SUITE.paint;
const ERASE = SUITE.erase;

function surfaceOf(receipt: PackedBijouCellsReceipt): GpuPackedSurface {
  const cells = receipt.widthCells * receipt.heightCells;
  return {
    width: receipt.widthCells,
    height: receipt.heightCells,
    buffer: Uint8Array.from(receipt.bytes),
    sideTable: [...receipt.sideTable],
    renderDirtyWords: new Uint32Array(Math.ceil(cells / 32)).fill(0xffffffff),
  };
}

const PAINT_SURFACE = surfaceOf(SUITE.paintReceipt);
const ERASE_SURFACE = surfaceOf(SUITE.eraseReceipt);

/** A surface of `width x height` cells copied from the top-left of the paint frame. */
function croppedPaint(width: number, height: number): GpuPackedSurface {
  const buffer = new Uint8Array(width * height * 10);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const sourceCol = col % PAINT_SURFACE.width;
      const sourceRow = row % PAINT_SURFACE.height;
      const from = (sourceRow * PAINT_SURFACE.width + sourceCol) * 10;
      buffer.set(PAINT_SURFACE.buffer.subarray(from, from + 10), (row * width + col) * 10);
    }
  }
  return {
    width,
    height,
    buffer,
    sideTable: PAINT_SURFACE.sideTable,
    renderDirtyWords: new Uint32Array(Math.ceil((width * height) / 32)).fill(0xffffffff),
  };
}

function testAtlas(): PresenterAtlasSource {
  return staticAtlasSource(SUITE.pack);
}

interface Rig {
  readonly gpu: FakeGpu;
  readonly canvas: FakeCanvas;
  readonly presenter: WebGpuSurfacePresenter;
  readonly device: FakeDevice;
}

const SUITE_SIZE = {
  cssWidth: SUITE.suite.canvasPxW,
  cssHeight: SUITE.suite.canvasPxH,
  dpr: 1,
} as const;

function presenterOptions(
  gpu: FakeGpu,
  overrides: Partial<WebGpuSurfacePresenterOptions> = {},
): WebGpuSurfacePresenterOptions {
  return {
    gpu,
    shader: { wgsl: WGSL, manifest: MANIFEST },
    atlas: testAtlas(),
    defaultFg: SUITE.suite.defaultFg,
    defaultBg: SUITE.suite.defaultBg,
    size: SUITE_SIZE,
    ...overrides,
  };
}

async function rig(
  gpuOptions: FakeGpuOptions = {},
  overrides: Partial<WebGpuSurfacePresenterOptions> = {},
): Promise<Rig> {
  const gpu = new FakeGpu(gpuOptions);
  const canvas = new FakeCanvas();
  const presenter = await createWebGPUSurfacePresenter(canvas, presenterOptions(gpu, overrides));
  return { gpu, canvas, presenter, device: gpu.device };
}

function cellsTextureWords(device: FakeDevice): Uint8Array {
  return device.texture('bijou-surface cells').bytes;
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('decodeBijouSurfaceShader', () => {
  it('accepts the canonical assembled WGSL verbatim and reads the manifest layout', () => {
    const layout = decodeBijouSurfaceShader({ wgsl: WGSL, manifest: MANIFEST });
    expect(layout.assembledWgslSha256).toBe(MANIFEST_SURFACE_SHA);
    expect(sha256Hex(utf8Bytes(WGSL))).toBe(MANIFEST_SURFACE_SHA);
    expect(layout).toMatchObject({
      group: 0,
      uniformBinding: 0,
      cellsBinding: 1,
      atlasBinding: 2,
      uniformByteSize: 64,
      uniformOffsets: {
        canvasPx: 0,
        cellPx: 8,
        gridCells: 16,
        atlasCols: 24,
        defaultFg: 32,
        defaultBg: 48,
        flags: 60,
      },
    });
  });

  it('refuses shader text that is not byte-identical to the pinned artifact', () => {
    expect(() => decodeBijouSurfaceShader({ wgsl: `${WGSL}\n`, manifest: MANIFEST })).toThrow(
      RendererFaultError,
    );
    expect(() => decodeBijouSurfaceShader({ wgsl: WGSL, manifest: { shaders: [] } })).toThrow(
      RendererFaultError,
    );
  });
});

describe('createWebGPUSurfacePresenter capability refusal', () => {
  it('throws BackendUnavailableError, never RendererFaultError, when navigator.gpu is absent', async () => {
    const attempt = createWebGPUSurfacePresenter(new FakeCanvas(), {
      shader: { wgsl: WGSL, manifest: MANIFEST },
      atlas: testAtlas(),
    });
    await expect(attempt).rejects.toBeInstanceOf(BackendUnavailableError);
    await expect(attempt).rejects.not.toBeInstanceOf(RendererFaultError);
    await expect(attempt).rejects.toMatchObject({ code: 'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE', backend: 'webgpu' });
  });

  it.each([
    ['requestAdapter() returns null', { adapters: ['null'] }],
    ['requestAdapter() rejects', { adapters: ['reject'] }],
    ['requestDevice() rejects', { requestDeviceRejects: true }],
  ] as const)('throws BackendUnavailableError when %s', async (_label, options: FakeGpuOptions) => {
    const gpu = new FakeGpu(options);
    const attempt = createWebGPUSurfacePresenter(new FakeCanvas(), presenterOptions(gpu));
    await expect(attempt).rejects.toBeInstanceOf(BackendUnavailableError);
  });

  it('throws BackendUnavailableError and releases the device when the canvas has no webgpu context', async () => {
    const gpu = new FakeGpu();
    const attempt = createWebGPUSurfacePresenter(new FakeCanvas(300, 150, false), presenterOptions(gpu));
    await expect(attempt).rejects.toBeInstanceOf(BackendUnavailableError);
    expect(gpu.device.destroyed).toBe(true);
  });

  it('checks capability before the shader, so a refusal is never hidden behind a fault', async () => {
    const attempt = createWebGPUSurfacePresenter(
      new FakeCanvas(),
      presenterOptions(new FakeGpu({ adapters: ['null'] }), { shader: { wgsl: 'broken', manifest: MANIFEST } }),
    );
    await expect(attempt).rejects.toBeInstanceOf(BackendUnavailableError);
  });
});

describe('createWebGPUSurfacePresenter renderer faults', () => {
  it.each([
    ['tampered shader text', {}, { shader: { wgsl: WGSL.replace('fs_main', 'fs_mian'), manifest: MANIFEST } }],
    ['a WGSL compile error', { device: { compileErrors: ['bijou-surface.wgsl'] } }, {}],
    ['a display shader compile error', { device: { compileErrors: ['geordi-webgpu-display.wgsl'] } }, {}],
    ['a rejected render pipeline', { device: { pipelineRejections: ['bijou-surface canonical pass'] } }, {}],
    ['a validation error during pipeline creation', { device: { creationValidationError: 'bad layout' } }, {}],
    ['an -srgb preferred canvas format', { preferredFormat: 'bgra8unorm-srgb' }, {}],
  ] as const)(
    'throws RendererFaultError, never BackendUnavailableError, on %s',
    async (_label, gpuOptions: FakeGpuOptions, overrides: Partial<WebGpuSurfacePresenterOptions>) => {
      const gpu = new FakeGpu(gpuOptions);
      const attempt = createWebGPUSurfacePresenter(new FakeCanvas(), presenterOptions(gpu, overrides));
      await expect(attempt).rejects.toBeInstanceOf(RendererFaultError);
      await expect(attempt).rejects.not.toBeInstanceOf(BackendUnavailableError);
      expect(gpu.device.destroyed).toBe(true);
    },
  );
});

describe('selectWebGpuCanvasFormat', () => {
  it('keeps normalized non-sRGB formats and refuses -srgb ones (double-gamma shift)', () => {
    expect(selectWebGpuCanvasFormat('bgra8unorm')).toBe('bgra8unorm');
    expect(selectWebGpuCanvasFormat('rgba8unorm')).toBe('rgba8unorm');
    expect(() => selectWebGpuCanvasFormat('bgra8unorm-srgb')).toThrow(RendererFaultError);
    expect(() => selectWebGpuCanvasFormat('rgba8unorm-srgb')).toThrow(RendererFaultError);
  });

  it('configures the canvas with the preferred non-sRGB format and draws the display pass into it', async () => {
    const { canvas, device, presenter } = await rig({ preferredFormat: 'rgba8unorm' });
    expect(presenter.canvasFormat).toBe('rgba8unorm');
    expect(canvas.context.configuration?.format).toBe('rgba8unorm');
    expect(device.pipelines.map((pipeline) => pipeline.fragment?.targets[0]?.format)).toEqual([
      'rgba8uint',
      'rgba8unorm',
    ]);
  });
});

describe('dirty-row queue.writeTexture uploads', () => {
  it('plans one tight full-width write per dirty row span, straight from the staging buffer', () => {
    expect(
      planCellRowUploads(
        [
          { minRow: 0, maxRow: 0 },
          { minRow: 2, maxRow: 4 },
        ],
        8,
      ),
    ).toEqual([
      { originX: 0, originY: 0, width: 8, height: 1, offset: 0, bytesPerRow: 128 },
      { originX: 0, originY: 2, width: 8, height: 3, offset: 256, bytesPerRow: 128 },
    ]);
    expect(planCellRowUploads([{ minRow: 0, maxRow: 3 }], 0)).toEqual([]);
  });

  it('uploads the whole grid on the first frame and only the dirty spans of paint -> erase', async () => {
    const { device, presenter } = await rig();
    const blank = surfaceOf({ ...SUITE.eraseReceipt });
    presenter.present(blank, PAINT_SURFACE, {});
    const first = device.writesTo('bijou-surface cells');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      origin: [0, 0],
      size: [8, 7],
      layout: { offset: 0, bytesPerRow: 8 * 16, rowsPerImage: 7 },
    });
    expect(cellsTextureWords(device)).toEqual(preparedBufferBytes(PAINT.preparedCells));

    // The packer's own report of the same frame is the expected upload plan.
    const reference = createSurfaceDamageState();
    const resolveSlot = resolveSlotFromSlotMap(SUITE.pack.slotMap);
    packSurfaceDamage(reference, blank, PAINT_SURFACE, { resolveSlot });
    const expected = packSurfaceDamage(reference, PAINT_SURFACE, ERASE_SURFACE, { resolveSlot });
    expect(expected.fullRefresh).toBe(false);

    const before = device.writes.length;
    presenter.present(PAINT_SURFACE, ERASE_SURFACE, {});
    const incremental = device.writesTo('bijou-surface cells', before);
    expect(incremental.map((write) => [write.origin[1], write.size[1]])).toEqual(
      expected.dirtyRowSpans.map((span) => [span.minRow, span.maxRow - span.minRow + 1]),
    );
    for (const write of incremental) {
      expect(write.layout).toEqual({
        offset: (write.origin[1] ?? 0) * 8 * 16,
        bytesPerRow: 8 * 16,
        rowsPerImage: write.size[1],
      });
    }
    expect(cellsTextureWords(device)).toEqual(preparedBufferBytes(ERASE.preparedCells));
    expect(device.validationErrors).toEqual([]);
  });

  it('writes nothing to the cells texture when a frame changes no cell', async () => {
    const { device, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const before = device.writes.length;
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    expect(device.writesTo('bijou-surface cells', before)).toEqual([]);
    expect(device.draws.slice(-2).map((draw) => draw.pipeline)).toEqual([
      'bijou-surface canonical pass',
      'display pass',
    ]);
  });

  it('honours forceFullRefresh from the present context', async () => {
    const { device, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const before = device.writes.length;
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, { forceFullRefresh: true });
    expect(device.writesTo('bijou-surface cells', before).map((write) => write.size)).toEqual([[8, 7]]);
  });

  it('writes uniforms at the manifest offsets', async () => {
    const { device, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const words = device.uniformWrites.at(-1);
    expect(Array.from(words ?? [])).toEqual([
      67, 117, 8, 16, 8, 7, 4, 0, 0xe6, 0xed, 0xf3, 0, 0x0d, 0x11, 0x17, 0,
    ]);
  });
});

describe('atlas uploads', () => {
  it('plans a full upload or clipped dirty rectangles', () => {
    const bitmap = SUITE.pack.atlasBitmap;
    expect(planAtlasUploads(bitmap, [], true)).toEqual([
      { originX: 0, originY: 0, width: 32, height: 32, offset: 0, bytesPerRow: 128 },
    ]);
    expect(
      planAtlasUploads(
        bitmap,
        [
          { x: 8, y: 16, width: 8, height: 16 },
          { x: 30, y: 30, width: 8, height: 8 },
          { x: 40, y: 0, width: 4, height: 4 },
        ],
        false,
      ),
    ).toEqual([
      { originX: 8, originY: 16, width: 8, height: 16, offset: (16 * 32 + 8) * 4, bytesPerRow: 128 },
      { originX: 30, originY: 30, width: 2, height: 2, offset: (30 * 32 + 30) * 4, bytesPerRow: 128 },
    ]);
  });

  it('uploads dirty rectangles incrementally and the whole atlas again after an atlas reset', async () => {
    let generation = 1;
    let dirty: GlyphAtlasDirtyRect[] = [];
    const base = testAtlas();
    const atlas: PresenterAtlasSource = {
      ...base,
      atlasGeneration: () => generation,
      takeDirtyRects: () => {
        const rects = dirty;
        dirty = [];
        return rects;
      },
      getReceiptAssets: () => ({ ...base.getReceiptAssets(), atlasGeneration: generation }),
    };
    const { device, presenter } = await rig({}, { atlas });
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    expect(device.writesTo('bijou-surface glyph atlas').map((write) => write.size)).toEqual([[32, 32]]);
    expect(device.texture('bijou-surface glyph atlas').bytes).toEqual(SUITE.pack.atlasBitmap.rgba);

    dirty = [{ x: 8, y: 0, width: 8, height: 16 }];
    let before = device.writes.length;
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    expect(device.writesTo('bijou-surface glyph atlas', before).map((write) => [write.origin, write.size])).toEqual([
      [
        [8, 0],
        [8, 16],
      ],
    ]);
    expect(device.writesTo('bijou-surface cells', before)).toEqual([]);

    generation = 2;
    before = device.writes.length;
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    expect(device.writesTo('bijou-surface glyph atlas', before).map((write) => write.size)).toEqual([[32, 32]]);
    // An atlas generation change is a full-invalidation trigger for the grid too.
    expect(device.writesTo('bijou-surface cells', before).map((write) => write.size)).toEqual([[8, 7]]);
    expect(presenter.getLastReceipt()?.atlasGeneration).toBe(2);
  });
});

describe('receipts', () => {
  it('records a validated unit-upload receipt with the manifest digest after present()', async () => {
    const { presenter } = await rig();
    expect(presenter.getLastReceipt()).toBeNull();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const receipt = presenter.getLastReceipt();
    expect(receipt).not.toBeNull();
    expect(validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt!))).ok).toBe(true);
    expect(receipt).toMatchObject({
      evidenceLevel: 'unit-upload',
      frameRgbaSha256: null,
      probes: [],
      assembledWgslSha256: MANIFEST_SURFACE_SHA,
      shaderSha256: MANIFEST_SURFACE_SHA,
      generatedGlslSha256: null,
      executedArtifactSha256: webGpuExecutedArtifactSha256(WGSL),
      backendProfile: 'geordi-webgpu/1',
      adapter: { backend: 'webgpu', name: 'apple metal-3', driver: '' },
      preparedBufferSha256: PAINT.preparedBufferSha256,
      widthCells: 8,
      heightCells: 7,
      canvasPxW: 67,
      canvasPxH: 117,
      cellPx: { width: 8, height: 16 },
      defaultFg: SUITE.suite.defaultFg,
      defaultBg: SUITE.suite.defaultBg,
      fontIdentity: SUITE.pack.fontIdentity,
    });
  });

  it('pins every executed WGSL text in executedArtifactSha256', () => {
    const framed = (
      [
        ['bijou-surface.wgsl', WGSL],
        ['geordi-webgpu-display.wgsl', WEBGPU_DISPLAY_WGSL],
      ] as const
    )
      .map(([name, text]) => `${name}\n${String(utf8Bytes(text).length)}\n${text}`)
      .join('');
    expect(webGpuExecutedArtifactSha256(WGSL)).toBe(sha256Hex(utf8Bytes(framed)));
  });

  it.each([
    [{ vendor: 'apple', architecture: 'metal-3' }, 'gpu-probed', 'apple metal-3'],
    [{ vendor: 'google', architecture: 'swiftshader' }, 'software-probed', 'google swiftshader'],
    [{ vendor: 'mesa', description: 'llvmpipe (LLVM 17)' }, 'software-probed', 'mesa llvmpipe (LLVM 17)'],
    [{ vendor: 'nvidia', isFallbackAdapter: true }, 'software-probed', 'nvidia'],
    [{}, 'software-probed', 'unnamed WebGPU adapter'],
  ] as const)('classifies adapter %o as %s', (info, level, name) => {
    const adapterClass = classifyWebGpuAdapter({
      info: { vendor: '', architecture: '', device: '', description: '', ...info },
      requestDevice: () => Promise.reject(new RendererFaultError('webgpu', 'unused')),
    });
    expect(adapterClass.evidenceLevel).toBe(level);
    expect(adapterClass.adapter.name).toBe(name);
  });
});

describe('captureFrame readback', () => {
  it('strips 256-byte copy padding into tight top-left RGBA8', () => {
    const width = 3;
    const height = 2;
    const padded = new Uint8Array(256 * 2).fill(0xee);
    padded.set([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255], 0);
    padded.set([10, 11, 12, 255, 13, 14, 15, 255, 16, 17, 18, 255], 256);
    expect(Array.from(stripRowPadding(padded, width, height, 256))).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255, 13, 14, 15, 255, 16, 17, 18, 255,
    ]);
    expect(alignedBytesPerRow(67 * 4)).toBe(512);
    expect(alignedBytesPerRow(64 * 4)).toBe(256);
    expect(() => stripRowPadding(padded, 70, 2, 256)).toThrow(RendererFaultError);
  });

  it('copies the rgba8uint target with an aligned stride and records a probed receipt', async () => {
    const { device, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const target = device.texture('bijou-surface canonical frame');
    expect(target.format).toBe('rgba8uint');
    target.fillPattern();
    const capture = await presenter.captureFrame({
      probes: [
        [0, 0],
        [66, 116],
      ],
      inputReceiptSha256: SUITE.suite.frames[0]?.inputReceiptSha256,
    });
    expect(device.copies.at(-1)).toMatchObject({ texture: target, bytesPerRow: 512, rowsPerImage: 117, size: [67, 117] });
    expect(capture.bytesPerRow).toBe(512);
    expect(capture.rgba).toEqual(target.bytes);
    expect(capture.receipt).toMatchObject({
      evidenceLevel: 'gpu-probed',
      frameRgbaSha256: sha256Hex(target.bytes),
      probes: [
        { px: 0, py: 0, rgba: [0, 0, 0, 255] },
        { px: 66, py: 116, rgba: [66, 116, (66 * 7 + 116 * 13) & 0xff, 255] },
      ],
      inputReceiptSha256: SUITE.suite.frames[0]?.inputReceiptSha256,
    });
    expect(presenter.getLastReceipt()).toBe(capture.receipt);
    expect(device.validationErrors).toEqual([]);
  });

  it('records software-probed evidence for a software adapter', async () => {
    const { device, presenter } = await rig({ info: { vendor: 'google', architecture: 'swiftshader' } });
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    device.texture('bijou-surface canonical frame').fillPattern();
    expect((await presenter.captureFrame()).receipt.evidenceLevel).toBe('software-probed');
  });

  it('refuses to capture before a frame is drawn', async () => {
    const { presenter } = await rig();
    await expect(presenter.captureFrame()).rejects.toBeInstanceOf(RendererFaultError);
  });

  it('turns a readback validation error into RendererFaultError', async () => {
    const { device, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const original = device.createCommandEncoder.bind(device);
    device.createCommandEncoder = () => {
      const encoder = original();
      return {
        ...encoder,
        copyTextureToBuffer: (source, destination, size) => {
          device.raise('validation', 'copy from destroyed texture');
          encoder.copyTextureToBuffer(source, destination, size);
          return undefined;
        },
      };
    };
    await expect(presenter.captureFrame()).rejects.toBeInstanceOf(RendererFaultError);
  });
});

describe('device.lost recovery', () => {
  it('re-uploads the retained staging buffer to a new device without a new present', async () => {
    const { gpu, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const lostDevice = gpu.device;
    const release = gpu.holdAdapterRequests();
    lostDevice.lose('unknown');
    await settle();
    expect(presenter.status).toBe('recovering');
    // A frame presented while the device is gone is packed and kept on the CPU.
    presenter.present(PAINT_SURFACE, ERASE_SURFACE, {});
    expect(lostDevice.writesTo('bijou-surface cells').length).toBe(1);
    expect(gpu.devices).toHaveLength(1);
    release();
    await presenter.restored();

    const restored = gpu.device;
    expect(restored).not.toBe(lostDevice);
    expect(presenter.status).toBe('ready');
    expect(presenter.deviceGeneration).toBe(2);
    expect(restored.writesTo('bijou-surface cells').map((write) => write.size)).toEqual([[8, 7]]);
    expect(cellsTextureWords(restored)).toEqual(preparedBufferBytes(ERASE.preparedCells));
    expect(restored.texture('bijou-surface glyph atlas').bytes).toEqual(SUITE.pack.atlasBitmap.rgba);
    expect(restored.draws.map((draw) => draw.pipeline)).toEqual(['bijou-surface canonical pass', 'display pass']);
    expect(presenter.getLastReceipt()?.preparedBufferSha256).toBe(ERASE.preparedBufferSha256);

    // Device restoration is a full-invalidation trigger: the next present rebuilds the grid.
    const before = restored.writes.length;
    presenter.present(ERASE_SURFACE, ERASE_SURFACE, {});
    expect(restored.writesTo('bijou-surface cells', before).map((write) => write.size)).toEqual([[8, 7]]);
    expect(restored.validationErrors).toEqual([]);
  });

  it('faults with BackendUnavailableError when no adapter comes back', async () => {
    const { gpu, presenter } = await rig({ adapters: ['ok', 'null'] });
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    gpu.device.lose('unknown');
    await settle();
    await presenter.restored();
    expect(presenter.status).toBe('faulted');
    expect(() => {
      presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    }).toThrow(BackendUnavailableError);
  });

  it('does not recover a device it destroyed in dispose()', async () => {
    const { gpu, canvas, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    presenter.dispose();
    await settle();
    expect(gpu.devices).toHaveLength(1);
    expect(gpu.device.destroyed).toBe(true);
    expect(canvas.context.configuration).toBeNull();
    expect(presenter.status).toBe('disposed');
    expect(presenter.getLastReceipt()).toBeNull();
    expect(() => {
      presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    }).toThrow(RendererFaultError);
  });
});

describe('resize, zero-size guard and cellFromPoint', () => {
  it.each([
    { cssWidth: 0, cssHeight: 117, dpr: 1 },
    { cssWidth: 67, cssHeight: -1, dpr: 1 },
    { cssWidth: 67, cssHeight: 117, dpr: 0 },
    { cssWidth: Number.NaN, cssHeight: 117, dpr: 1 },
    { cssWidth: 67, cssHeight: 117, dpr: 1, devicePixelContentBox: { width: 0, height: 117 } },
  ])('refuses a zero-size or non-finite resize %o and keeps the canvas', async (size) => {
    const { canvas, presenter } = await rig();
    expect(() => {
      presenter.resize(size);
    }).toThrow(BijouGpuValidationError);
    expect([canvas.width, canvas.height]).toEqual([67, 117]);
  });

  it('refuses a grid that does not fit the canvas', async () => {
    const { presenter } = await rig({}, { size: { cssWidth: 63, cssHeight: 117, dpr: 1 } });
    expect(() => {
      presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    }).toThrow(BijouGpuValidationError);
    expect(presenter.getLastReceipt()).toBeNull();
  });

  it('draws only defaultBg for an empty grid without creating a zero-size texture', async () => {
    const { device, presenter } = await rig();
    const empty: GpuPackedSurface = {
      width: 0,
      height: 0,
      buffer: new Uint8Array(0),
      sideTable: [],
      renderDirtyWords: new Uint32Array(0),
    };
    presenter.present(empty, empty, {});
    expect(device.texture('bijou-surface cells')).toMatchObject({ width: 1, height: 1 });
    expect(device.writesTo('bijou-surface cells')).toEqual([]);
    expect(device.uniformWrites.at(-1)?.slice(4, 6)).toEqual(new Uint32Array([0, 0]));
    expect(device.validationErrors).toEqual([]);
  });

  it('reallocates the canonical target and redraws when the canvas grows', async () => {
    const { canvas, device, presenter } = await rig();
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const groups = device.bindGroups.length;
    presenter.resize({ cssWidth: 50, cssHeight: 70, dpr: 2 });
    expect([canvas.width, canvas.height]).toEqual([100, 140]);
    expect(device.texture('bijou-surface canonical frame')).toMatchObject({ width: 100, height: 140 });
    expect(device.bindGroups.length).toBe(groups + 2);
    expect(device.draws.at(-1)?.target).toMatchObject({ width: 100, height: 140 });
    expect(presenter.getLastReceipt()).toMatchObject({ canvasPxW: 100, canvasPxH: 140, dpr: 2 });
    // A device pixel ratio change forces the next present to rebuild the grid.
    const before = device.writes.length;
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    expect(device.writesTo('bijou-surface cells', before).map((write) => write.size)).toEqual([[8, 7]]);
  });

  it('reallocates the cell texture and bind group when the grid dimensions change', async () => {
    const { device, presenter } = await rig({}, { size: { cssWidth: 200, cssHeight: 200, dpr: 1 } });
    presenter.present(PAINT_SURFACE, PAINT_SURFACE, {});
    const firstCells = device.texture('bijou-surface cells');
    const groups = device.bindGroups.length;
    const wide = croppedPaint(12, 9);
    presenter.present(PAINT_SURFACE, wide, {});
    const cells = device.texture('bijou-surface cells');
    expect(cells).not.toBe(firstCells);
    expect(firstCells.destroyed).toBe(true);
    expect(cells).toMatchObject({ width: 12, height: 9 });
    expect(device.bindGroups.length).toBeGreaterThan(groups);
    expect(device.bindGroups.at(-2)?.label).toBe('bijou-surface bindings');
    expect(device.validationErrors).toEqual([]);
  });

  it('hit-tests 0-based cells through the shared host-boundary law', async () => {
    const { canvas, presenter } = await rig();
    canvas.rect = { left: 10, top: 20, width: 67, height: 117 };
    expect(presenter.cellFromPoint(10, 20)).toEqual({ col: 0, row: 0 });
    expect(presenter.cellFromPoint(10 + 8, 20 + 16)).toEqual({ col: 1, row: 1 });
    expect(presenter.cellFromPoint(10 + 66, 20 + 116)).toEqual({ col: 7, row: 6 });
    expect(presenter.cellFromPoint(-100, -100)).toEqual({ col: 0, row: 0 });
    expect(presenter.cellFromPoint(Number.NaN, 0)).toBeNull();
    canvas.rect = { left: 0, top: 0, width: 0, height: 117 };
    expect(presenter.cellFromPoint(1, 1)).toBeNull();
  });
});

describe('randomized resize sequences', () => {
  it('keep every write and readback stride valid with zero validation errors', async () => {
    let seed = 0x175;
    const next = (bound: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed % bound;
    };
    const { device, presenter } = await rig();
    let current = PAINT_SURFACE;
    for (let step = 0; step < 120; step += 1) {
      const dpr = [1, 1.25, 1.5, 2, 3][next(5)] ?? 1;
      const cssWidth = 8 + next(400);
      const cssHeight = 16 + next(300);
      presenter.resize({ cssWidth, cssHeight, dpr });
      const canvasPxW = Math.max(1, Math.round(cssWidth * dpr));
      const canvasPxH = Math.max(1, Math.round(cssHeight * dpr));
      const cols = Math.floor(canvasPxW / 8);
      const rows = Math.floor(canvasPxH / 16);
      const target = croppedPaint(next(cols + 1), next(rows + 1));
      presenter.present(current, target, {});
      current = target;
      device.texture('bijou-surface canonical frame').fillPattern();
      const capture = await presenter.captureFrame();
      expect(capture.bytesPerRow % 256).toBe(0);
      expect(capture.bytesPerRow).toBeGreaterThanOrEqual(canvasPxW * 4);
      expect(capture.bytesPerRow).toBeLessThan(canvasPxW * 4 + 256);
      expect(capture.rgba.length).toBe(canvasPxW * canvasPxH * 4);
      expect(validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(capture.receipt))).ok).toBe(true);
    }
    for (const write of device.writes) {
      const bytesPerTexel = write.texture.bytesPerTexel;
      expect(write.layout.bytesPerRow).toBe(write.texture.width * bytesPerTexel);
    }
    expect(device.validationErrors).toEqual([]);
  });
});

describe('capability-refused receipts', () => {
  it('records a refusal as capability-refused evidence with no frame digest and no probes', async () => {
    let refusal: BackendUnavailableError | null = null;
    try {
      await createWebGPUSurfacePresenter(new FakeCanvas(), presenterOptions(new FakeGpu({ adapters: ['null'] })));
    } catch (error) {
      if (error instanceof BackendUnavailableError) {
        refusal = error;
      }
    }
    expect(refusal).not.toBeNull();
    const receipt = createWebGpuRefusalReceipt({
      error: refusal!,
      shader: { wgsl: WGSL, manifest: MANIFEST },
      atlas: testAtlas(),
      target: PAINT_SURFACE,
      size: SUITE_SIZE,
      defaultFg: SUITE.suite.defaultFg,
      defaultBg: SUITE.suite.defaultBg,
      inputReceiptSha256: SUITE.suite.frames[0]?.inputReceiptSha256,
    });
    expect(validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt))).ok).toBe(true);
    expect(receipt).toMatchObject({
      evidenceLevel: 'capability-refused',
      frameRgbaSha256: null,
      probes: [],
      adapter: { backend: 'webgpu', name: '', driver: '' },
      assembledWgslSha256: MANIFEST_SURFACE_SHA,
      shaderSha256: MANIFEST_SURFACE_SHA,
      preparedBufferSha256: PAINT.preparedBufferSha256,
      canvasPxW: 67,
      canvasPxH: 117,
    });
  });

  it('cannot be built from a renderer fault', () => {
    expect(() =>
      createWebGpuRefusalReceipt({
        // A caller that ignores the types still cannot turn a fault into a refusal.
        error: new RendererFaultError('webgpu', 'compile error') as never,
        shader: { wgsl: WGSL, manifest: MANIFEST },
        atlas: testAtlas(),
        target: PAINT_SURFACE,
        size: SUITE_SIZE,
      }),
    ).toThrow(RendererFaultError);
  });
});
