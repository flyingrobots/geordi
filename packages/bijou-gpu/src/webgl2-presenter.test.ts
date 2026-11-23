import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseJsonValue } from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';

import { markChangedCells, packedSurfaceFromReference } from '../test/packed-surface.js';
import { arr, int, obj, renderSuite, str } from '../test/support.js';
import { FakeCanvas, type FakeCall, type FakeWebGL2Options } from '../test/webgl2-fake.js';
import {
  BackendUnavailableError,
  createGlyphAtlas,
  createStaticAtlasSource,
  createWebGL2SurfacePresenter,
  DrawingBufferMismatchError,
  RendererFaultError,
  serializeEndpointReceipt,
  sha256Hex,
  utf8Bytes,
  validateEndpointReceipt,
  WEBGL2_DISPLAY_FRAGMENT_GLSL,
  WEBGL2_ENUMS as GL,
  WEBGL2_SURFACE_BACKEND_PROFILE,
  WEBGL2_SURFACE_SHADER_PIN,
  webgl2ExecutedArtifactSha256,
  webgl2FramedGlslSha256,
  type EndpointReceipt,
  type GlyphRasterizer,
  type GpuPackedSurface,
  type PresenterAtlasSource,
  type WebGL2SurfacePresenterOptions,
} from './index.js';

const SHADER_DIR = new URL('../shaders/', import.meta.url);

function shaderText(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, SHADER_DIR)), 'utf8');
}

const SHADERS = {
  vertex: shaderText('bijou-surface.vert.glsl'),
  fragment: shaderText('bijou-surface.frag.glsl'),
};

interface ManifestStage {
  readonly file: string;
  readonly sha256: string;
  readonly stage: string;
}
interface ManifestBinding {
  readonly kind: string;
  readonly byteSize: number | null;
  readonly fragmentName: string | null;
  readonly members: readonly { readonly name: string; readonly byteOffset: number }[];
  readonly textureFormat: string | null;
}
interface ManifestShader {
  readonly assembledWgslSha256: string;
  readonly generatedGlslSha256: string;
  readonly stages: readonly ManifestStage[];
  readonly bindings: readonly ManifestBinding[];
}

/** Decode the bijou-surface entry of the checked-in shader manifest. */
function loadManifestShader(): ManifestShader {
  const manifest = obj(parseJsonValue(shaderText('bijou-shaders.manifest.json')), 'manifest');
  const shader = arr(manifest.shaders, 'shaders')
    .map((entry) => obj(entry, 'shader'))
    .find((entry) => entry.id === 'bijou-surface');
  if (shader === undefined) {
    throw new RendererFaultError('webgl2', 'manifest has no bijou-surface shader');
  }
  return {
    assembledWgslSha256: str(shader.assembledWgslSha256, 'assembledWgslSha256'),
    generatedGlslSha256: str(shader.generatedGlslSha256, 'generatedGlslSha256'),
    stages: arr(shader.stages, 'stages').map((item) => {
      const stage = obj(item, 'stage');
      return {
        file: str(stage.path, 'stage.path').split('/').at(-1) ?? '',
        sha256: str(stage.sha256, 'stage.sha256'),
        stage: str(stage.stage, 'stage.stage'),
      };
    }),
    bindings: arr(shader.bindings, 'bindings').map((item) => {
      const binding = obj(item, 'binding');
      const names = obj(binding.glslNames, 'glslNames');
      const fragmentName = names['bijou-surface.frag.glsl'];
      return {
        kind: str(binding.kind, 'kind'),
        byteSize: binding.byteSize === undefined ? null : int(binding.byteSize, 'byteSize'),
        fragmentName: typeof fragmentName === 'string' ? fragmentName : null,
        members:
          binding.members === undefined
            ? []
            : arr(binding.members, 'members').map((member) => ({
                name: str(obj(member, 'member').name, 'member.name'),
                byteOffset: int(obj(member, 'member').byteOffset, 'member.byteOffset'),
              })),
        textureFormat: binding.textureFormat === undefined ? null : str(binding.textureFormat, 'textureFormat'),
      };
    }),
  };
}

const rendered = renderSuite();

/** Round-trip a presenter receipt through canonical JSON and the schema validator. */
function revalidate(receipt: EndpointReceipt | null | undefined): boolean {
  if (receipt === null || receipt === undefined) {
    return false;
  }
  const result = validateEndpointReceipt(parseJsonValue(serializeEndpointReceipt(receipt)));
  return result.ok;
}

function staticAtlas(): PresenterAtlasSource {
  return createStaticAtlasSource({
    bitmap: rendered.pack.atlasBitmap,
    slotMap: rendered.pack.slotMap,
    fontIdentity: rendered.pack.fontIdentity,
  });
}

function makeCanvas(options: FakeWebGL2Options = {}): FakeCanvas {
  return new FakeCanvas(rendered.suite.canvasPxW, rendered.suite.canvasPxH, options);
}

function presenterOptions(canvas: FakeCanvas, extra: Partial<WebGL2SurfacePresenterOptions> = {}): WebGL2SurfacePresenterOptions {
  return {
    canvas,
    shaders: SHADERS,
    atlas: staticAtlas(),
    defaultFg: rendered.suite.defaultFg,
    defaultBg: rendered.suite.defaultBg,
    ...extra,
  };
}

function paintSurface(): GpuPackedSurface & { renderDirtyWords: Uint32Array; buffer: Uint8Array } {
  return packedSurfaceFromReference(rendered.paintReceipt, 'all');
}

function eraseAfter(paint: GpuPackedSurface): GpuPackedSurface & { renderDirtyWords: Uint32Array; buffer: Uint8Array } {
  const erase = packedSurfaceFromReference(rendered.eraseReceipt, 'none');
  markChangedCells(paint, erase);
  return erase;
}

function cellUploads(calls: readonly FakeCall[]): { y: number; rows: number; srcOffset: number }[] {
  return calls
    .filter((call) => call.name === 'texSubImage2D' && call.args[7] === GL.UNSIGNED_INT)
    .map((call) => ({ y: call.args[3] as number, rows: call.args[5] as number, srcOffset: call.args[9] as number }));
}

function atlasUploads(calls: readonly FakeCall[]): { x: number; y: number; width: number; height: number }[] {
  return calls
    .filter((call) => call.name === 'texSubImage2D' && call.args[6] === GL.RGBA_INTEGER && call.args[7] === GL.UNSIGNED_BYTE)
    .map((call) => ({
      x: call.args[2] as number,
      y: call.args[3] as number,
      width: call.args[4] as number,
      height: call.args[5] as number,
    }));
}

function draws(calls: readonly FakeCall[]): FakeCall[] {
  return calls.filter((call) => call.name === 'drawArrays');
}

describe('createWebGL2SurfacePresenter: shader identity', () => {
  it('pins exactly the checked-in naga-generated GLSL ES 3.00 stages, digests and binding map of the manifest', () => {
    const shader = loadManifestShader();
    const vertex = shader.stages.find((stage) => stage.stage === 'vertex');
    const fragment = shader.stages.find((stage) => stage.stage === 'fragment');
    expect(WEBGL2_SURFACE_SHADER_PIN.assembledWgslSha256).toBe(shader.assembledWgslSha256);
    expect(WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256).toBe(shader.generatedGlslSha256);
    expect(WEBGL2_SURFACE_SHADER_PIN.vertex).toEqual({ file: vertex?.file, sha256: vertex?.sha256 });
    expect(WEBGL2_SURFACE_SHADER_PIN.fragment).toEqual({ file: fragment?.file, sha256: fragment?.sha256 });
    // The pinned digests are the digests of the files on disk, byte for byte.
    expect(sha256Hex(utf8Bytes(SHADERS.vertex))).toBe(vertex?.sha256);
    expect(sha256Hex(utf8Bytes(SHADERS.fragment))).toBe(fragment?.sha256);
    expect(webgl2FramedGlslSha256([
      { file: 'bijou-surface.vert.glsl', source: SHADERS.vertex },
      { file: 'bijou-surface.frag.glsl', source: SHADERS.fragment },
    ])).toBe(shader.generatedGlslSha256);

    const uniforms = shader.bindings.find((binding) => binding.kind === 'uniform-buffer');
    const textures = shader.bindings.filter((binding) => binding.kind === 'texture');
    expect(WEBGL2_SURFACE_SHADER_PIN.uniformBlock).toBe(uniforms?.fragmentName);
    expect(WEBGL2_SURFACE_SHADER_PIN.uniformByteSize).toBe(uniforms?.byteSize);
    expect(WEBGL2_SURFACE_SHADER_PIN.uniformOffsets).toEqual(
      Object.fromEntries((uniforms?.members ?? []).map((member) => [member.name, member.byteOffset])),
    );
    expect(textures.map((binding) => [binding.textureFormat, binding.fragmentName])).toEqual([
      ['rgba32uint', WEBGL2_SURFACE_SHADER_PIN.cellsSampler],
      ['rgba8uint', WEBGL2_SURFACE_SHADER_PIN.atlasSampler],
    ]);
  });

  it('compiles the injected generated GLSL text unmodified, with zero hand-edited forks', () => {
    const canvas = makeCanvas();
    createWebGL2SurfacePresenter(presenterOptions(canvas));
    const sources = canvas.gl.callsNamed('shaderSource').map((call) => call.args[1]);
    expect(sources).toContain(SHADERS.vertex);
    expect(sources).toContain(SHADERS.fragment);
    // The display pass is the only other stage, and it is not a bijou-surface stage.
    expect(sources.filter((source) => source !== SHADERS.vertex && source !== SHADERS.fragment)).toEqual([
      WEBGL2_DISPLAY_FRAGMENT_GLSL,
    ]);
  });

  it('refuses GLSL whose bytes differ from the manifest pin with a RendererFaultError, before touching GL', () => {
    for (const shaders of [
      { vertex: SHADERS.vertex, fragment: `${SHADERS.fragment}\n` },
      { vertex: SHADERS.vertex.replace('void main', 'void  main'), fragment: SHADERS.fragment },
    ]) {
      const canvas = makeCanvas();
      const thrown = captureError(() => createWebGL2SurfacePresenter(presenterOptions(canvas, { shaders })));
      expect(thrown).toBeInstanceOf(RendererFaultError);
      expect(thrown).not.toBeInstanceOf(BackendUnavailableError);
      expect((thrown as RendererFaultError).detail).toMatch(/SHA-256/u);
      expect(canvas.gl.objects).toEqual([]);
    }
  });
});

function captureError(run: () => void): Error | null {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  return null;
}

describe('createWebGL2SurfacePresenter: capability refusal and renderer faults', () => {
  it('throws BackendUnavailableError, never a fault, when the canvas has no webgl2 context', () => {
    const canvas = makeCanvas();
    canvas.unavailable = true;
    const thrown = captureError(() => createWebGL2SurfacePresenter(presenterOptions(canvas)));
    expect(thrown).toBeInstanceOf(BackendUnavailableError);
    expect(thrown).not.toBeInstanceOf(RendererFaultError);
    expect((thrown as BackendUnavailableError).backend).toBe('webgl2');
    expect((thrown as BackendUnavailableError).code).toBe('GEORDI_E_BIJOU_BACKEND_UNAVAILABLE');
  });

  it('throws BackendUnavailableError when the context is already lost at creation', () => {
    const canvas = makeCanvas();
    canvas.gl.lost = true;
    expect(() => createWebGL2SurfacePresenter(presenterOptions(canvas))).toThrow(BackendUnavailableError);
  });

  it('requests the exact canonical context attributes and an sRGB drawing buffer', () => {
    const canvas = makeCanvas();
    createWebGL2SurfacePresenter(presenterOptions(canvas));
    expect(canvas.contextRequests).toEqual([
      {
        id: 'webgl2',
        attributes: {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
        },
      },
    ]);
    expect(canvas.gl.drawingBufferColorSpace).toBe('srgb');
  });

  it('throws RendererFaultError, never a capability refusal, on a shader compile or link failure', () => {
    for (const [label, options] of [
      ['vertex compile', { failCompile: 'vertex' }],
      ['fragment compile', { failCompile: 'fragment' }],
      ['link', { failLink: true }],
      ['uniform block binding', { missingUniformBlock: true }],
      ['incomplete framebuffer', { framebufferStatus: 0x8cd6 }],
    ] as const) {
      const canvas = makeCanvas(options);
      const thrown = captureError(() => {
        const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
        presenter.present(paintSurface(), paintSurface(), {});
      });
      expect(thrown, label).toBeInstanceOf(RendererFaultError);
      expect(thrown).not.toBeInstanceOf(BackendUnavailableError);
    }
  });

  it('turns a GL error after a frame into a RendererFaultError instead of masking it', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    canvas.gl.pendingErrors.push(0x0502);
    const thrown = captureError(() => {
      presenter.present(paintSurface(), paintSurface(), {});
    });
    expect(thrown).toBeInstanceOf(RendererFaultError);
    expect((thrown as RendererFaultError).detail).toMatch(/0x502/u);
  });

  it('fails loudly with GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH when the browser clamps the drawing buffer', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    canvas.gl.drawingBufferOverride = { width: rendered.suite.canvasPxW - 1, height: rendered.suite.canvasPxH };
    const thrown = captureError(() => {
      presenter.present(paintSurface(), paintSurface(), {});
    });
    expect(thrown).toBeInstanceOf(DrawingBufferMismatchError);
    expect((thrown as DrawingBufferMismatchError).code).toBe('GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH');
    expect(draws(canvas.gl.calls)).toEqual([]);
  });
});

describe('createWebGL2SurfacePresenter: textures and uploads', () => {
  it('allocates an RGBA32UI cell texture and an RGBA8UI atlas texture with NEAREST filters and no mipmaps', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    presenter.present(paintSurface(), paintSurface(), {});
    const storage = canvas.gl.callsNamed('texStorage2D').map((call) => call.args);
    expect(storage).toContainEqual([GL.TEXTURE_2D, 1, GL.RGBA32UI, rendered.suite.canvasPxW >> 3, 7]);
    expect(storage).toContainEqual([GL.TEXTURE_2D, 1, GL.RGBA8UI, 32, 32]);
    // The canonical render target is RGBA8UI at the drawing-buffer size.
    expect(storage).toContainEqual([GL.TEXTURE_2D, 1, GL.RGBA8UI, rendered.suite.canvasPxW, rendered.suite.canvasPxH]);
    const filters = canvas.gl.callsNamed('texParameteri').map((call) => call.args);
    const minFilters = filters.filter((args) => args[1] === GL.TEXTURE_MIN_FILTER);
    const magFilters = filters.filter((args) => args[1] === GL.TEXTURE_MAG_FILTER);
    expect(minFilters.length).toBeGreaterThanOrEqual(3);
    expect(minFilters.every((args) => args[2] === GL.NEAREST)).toBe(true);
    expect(magFilters.length).toBe(minFilters.length);
    expect(magFilters.every((args) => args[2] === GL.NEAREST)).toBe(true);
  });

  it('draws one fullscreen triangle for the canonical frame and one for the display pass', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    canvas.gl.clearCalls();
    presenter.present(paintSurface(), paintSurface(), {});
    expect(draws(canvas.gl.calls).map((call) => call.args)).toEqual([
      [GL.TRIANGLES, 0, 3],
      [GL.TRIANGLES, 0, 3],
    ]);
    expect(canvas.gl.callsNamed('disable').map((call) => call.args[0])).toContain(GL.DITHER);
  });

  it('uploads the whole staging buffer on the first frame and only the dirty row spans after it', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    const width = rendered.paintReceipt.widthCells;
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    expect(cellUploads(canvas.gl.calls)).toEqual([{ y: 0, rows: 7, srcOffset: 0 }]);

    // Change one cell in row 2 and one in row 5: two disjoint spans, two uploads.
    const next = packedSurfaceFromReference(rendered.paintReceipt, 'none');
    next.buffer[(2 * width + 1) * 10 + 2] ^= 0xff;
    next.buffer[(5 * width + 3) * 10 + 5] ^= 0xff;
    markChangedCells(paint, next);
    canvas.gl.clearCalls();
    presenter.present(paint, next, {});
    expect(cellUploads(canvas.gl.calls)).toEqual([
      { y: 2, rows: 1, srcOffset: 2 * width * 4 },
      { y: 5, rows: 1, srcOffset: 5 * width * 4 },
    ]);
    expect(presenter.getDiagnostics().lastDirtyRowSpans).toEqual([
      { minRow: 2, maxRow: 2 },
      { minRow: 5, maxRow: 5 },
    ]);

    // Nothing changed: no cell upload, but the frame is still drawn.
    const same = packedSurfaceFromReference(rendered.paintReceipt, 'none');
    same.buffer.set(next.buffer);
    canvas.gl.clearCalls();
    presenter.present(next, same, {});
    expect(cellUploads(canvas.gl.calls)).toEqual([]);
    expect(draws(canvas.gl.calls)).toHaveLength(2);
  });

  it('re-uploads the whole staging buffer on forceFullRefresh and on a grid resize', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    canvas.gl.clearCalls();
    presenter.present(paint, packedSurfaceFromReference(rendered.paintReceipt, 'none'), { forceFullRefresh: true });
    expect(cellUploads(canvas.gl.calls)).toEqual([{ y: 0, rows: 7, srcOffset: 0 }]);

    const small = packedSurfaceFromReference(
      {
        widthCells: 2,
        heightCells: 1,
        bytes: rendered.paintReceipt.bytes.slice(0, 20),
        sideTable: rendered.paintReceipt.sideTable,
      },
      'all',
    );
    canvas.gl.clearCalls();
    presenter.present(paint, small, {});
    expect(canvas.gl.callsNamed('texStorage2D').map((call) => call.args)).toContainEqual([
      GL.TEXTURE_2D,
      1,
      GL.RGBA32UI,
      2,
      1,
    ]);
    expect(cellUploads(canvas.gl.calls)).toEqual([{ y: 0, rows: 1, srcOffset: 0 }]);
  });

  it('uploads atlas dirty sub-rects with texSubImage2D and re-uploads everything after an atlas reset', () => {
    const rasterizer: GlyphRasterizer = {
      rasterize: (request) => new Uint8Array(request.cellPxW * request.cellPxH * 4).fill(255),
    };
    const atlas = createGlyphAtlas({
      rasterizer,
      atlasCols: 2,
      atlasRows: 1,
      metrics: { cellPxW: 8, cellPxH: 16, fontIdentity: 'fake' },
    });
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas, { atlas }));
    const surfaceOf = (text: string) =>
      packedSurfaceFromReference(
        {
          widthCells: text.length,
          heightCells: 1,
          bytes: Array.from(text).flatMap((ch) => [ch.charCodeAt(0), 0, 255, 255, 255, 0, 0, 0, 0, 0xff]),
          sideTable: [],
        },
        'all',
      );

    const first = surfaceOf('AB');
    presenter.present(first, first, {});
    // First frame: the whole atlas texture.
    expect(atlasUploads(canvas.gl.calls)).toEqual([{ x: 0, y: 0, width: 16, height: 16 }]);
    const generation = atlas.generation;

    // Two new glyphs overflow the two-slot atlas: new generation, full atlas, full cells.
    const second = surfaceOf('CD');
    canvas.gl.clearCalls();
    presenter.present(first, second, {});
    expect(atlas.generation).toBeGreaterThan(generation);
    expect(atlasUploads(canvas.gl.calls)).toEqual([{ x: 0, y: 0, width: 16, height: 16 }]);
    expect(cellUploads(canvas.gl.calls)).toEqual([{ y: 0, rows: 1, srcOffset: 0 }]);
    expect(presenter.getDiagnostics().lastFullRefreshReason).not.toBeNull();
    expect(presenter.getLastReceipt()?.atlasGeneration).toBe(atlas.generation);

    // A glyph added within one generation uploads only its slot rectangle.
    const atlasTwo = createGlyphAtlas({
      rasterizer,
      atlasCols: 4,
      atlasRows: 1,
      metrics: { cellPxW: 8, cellPxH: 16, fontIdentity: 'fake' },
    });
    const canvasTwo = makeCanvas();
    const presenterTwo = createWebGL2SurfacePresenter(presenterOptions(canvasTwo, { atlas: atlasTwo }));
    presenterTwo.present(first, first, {});
    canvasTwo.gl.clearCalls();
    presenterTwo.present(first, surfaceOf('ABC'), {});
    expect(atlasUploads(canvasTwo.gl.calls)).toEqual([{ x: 16, y: 0, width: 8, height: 16 }]);
    const rowLength = canvasTwo.gl
      .callsNamed('pixelStorei')
      .filter((call) => call.args[0] === GL.UNPACK_ROW_LENGTH)
      .map((call) => call.args[1]);
    expect(rowLength).toContain(32);
    // Row length is reset before cell rows upload.
    expect(rowLength.at(-1)).toBe(0);
  });
});

describe('createWebGL2SurfacePresenter: receipts', () => {
  it('returns null before the first frame and a schema-valid unit-upload receipt pinning shader, atlas and profile after it', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(
      presenterOptions(canvas, { inputReceiptSha256: () => rendered.suite.frames[0]?.inputReceiptSha256 ?? '' }),
    );
    expect(presenter.getLastReceipt()).toBeNull();
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    const receipt = presenter.getLastReceipt();
    expect(receipt).not.toBeNull();
    expect(revalidate(receipt)).toBe(true);
    expect(receipt).toMatchObject({
      backendProfile: WEBGL2_SURFACE_BACKEND_PROFILE,
      adapter: { backend: 'webgl2', name: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)' },
      evidenceLevel: 'unit-upload',
      generatedGlslSha256: WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256,
      shaderSha256: WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256,
      assembledWgslSha256: WEBGL2_SURFACE_SHADER_PIN.assembledWgslSha256,
      executedArtifactSha256: webgl2ExecutedArtifactSha256(SHADERS),
      inputReceiptSha256: rendered.suite.frames[0]?.inputReceiptSha256,
      preparedBufferSha256: rendered.paint.preparedBufferSha256,
      widthCells: 8,
      heightCells: 7,
      cellPx: { width: 8, height: 16 },
      canvasPxW: rendered.suite.canvasPxW,
      canvasPxH: rendered.suite.canvasPxH,
      dpr: 1,
      defaultFg: rendered.suite.defaultFg,
      defaultBg: rendered.suite.defaultBg,
      fontIdentity: rendered.pack.fontIdentity,
      atlasGeneration: 1,
      atlasStats: rendered.pack.atlasStats,
      frameRgbaSha256: null,
      probes: [],
    });
    expect(canvas.gl.callsNamed('readPixels')).toEqual([]);
  });

  it('labels canonical readback software-probed on SwiftShader and gpu-probed only on a named hardware renderer', () => {
    for (const [label, options, expected] of [
      ['SwiftShader', {}, 'software-probed'],
      ['Apple Metal', { renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' }, 'gpu-probed'],
      ['llvmpipe', { renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }, 'software-probed'],
      ['masked renderer', { unmaskedRendererInfo: false }, 'software-probed'],
    ] as const) {
      const canvas = makeCanvas(options);
      const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas, { canonicalReadback: true }));
      const paint = paintSurface();
      presenter.present(paint, paint, {});
      const receipt = presenter.getLastReceipt();
      expect(receipt?.evidenceLevel, label).toBe(expected);
      expect(receipt?.frameRgbaSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(receipt?.probes.length).toBeGreaterThan(0);
      expect(revalidate(receipt)).toBe(true);
    }
  });

  it('reads the canonical RGBA8UI target back with RGBA_INTEGER and the implementation read type, flipping rows to top-left', () => {
    for (const readType of [GL.UNSIGNED_BYTE, GL.UNSIGNED_INT]) {
      const canvas = makeCanvas({ readType });
      const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas, { canonicalReadback: true }));
      const paint = paintSurface();
      presenter.present(paint, paint, {});
      const reads = canvas.gl.callsNamed('readPixels').map((call) => call.args);
      expect(reads).toEqual([[0, 0, rendered.suite.canvasPxW, rendered.suite.canvasPxH, GL.RGBA_INTEGER, readType]]);
      const frame = presenter.readCanonicalFrame();
      expect(frame?.rgba.length).toBe(rendered.suite.canvasPxW * rendered.suite.canvasPxH * 4);
      expect(frame?.frameRgbaSha256).toBe(sha256Hex(frame?.rgba ?? new Uint8Array()));
      expect(presenter.getLastReceipt()?.frameRgbaSha256).toBe(frame?.frameRgbaSha256);
    }
  });

  it('refuses a canvas smaller than the grid instead of emitting an invalid receipt', () => {
    const canvas = new FakeCanvas(32, 32);
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    const paint = paintSurface();
    expect(() => {
      presenter.present(paint, paint, {});
    }).toThrow(/GEORDI_E_BIJOU_INVALID_SURFACE/u);
  });
});

describe('createWebGL2SurfacePresenter: resize and cellFromPoint', () => {
  it('maps client points to 0-based cells at DPR 1 and DPR 2, and returns null before any grid', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    expect(presenter.cellFromPoint(1, 1)).toBeNull();
    const paint = paintSurface();

    presenter.resize({ cssWidth: 67, cssHeight: 117, dpr: 1 });
    canvas.rect = { left: 10, top: 20, width: 67, height: 117 };
    presenter.present(paint, paint, {});
    expect(presenter.cellFromPoint(10, 20)).toEqual({ col: 0, row: 0 });
    expect(presenter.cellFromPoint(10 + 7.9, 20 + 15.9)).toEqual({ col: 0, row: 0 });
    expect(presenter.cellFromPoint(10 + 8, 20 + 16)).toEqual({ col: 1, row: 1 });
    expect(presenter.cellFromPoint(10 + 66, 20 + 116)).toEqual({ col: 7, row: 6 });

    // DPR 2 with the same 8 x 16 physical cells: the canvas doubles, so each CSS pixel addresses half a cell.
    presenter.resize({ cssWidth: 67, cssHeight: 117, dpr: 2 });
    expect([canvas.width, canvas.height]).toEqual([134, 234]);
    expect(presenter.cellFromPoint(10 + 8, 20 + 16)).toEqual({ col: 2, row: 2 });
    expect(presenter.cellFromPoint(10 + 4, 20 + 8)).toEqual({ col: 1, row: 1 });
    expect(presenter.cellFromPoint(10 + 3.9, 20 + 7.9)).toEqual({ col: 0, row: 0 });
    expect(presenter.cellFromPoint(Number.NaN, 0)).toBeNull();
  });

  it('sizes the drawing buffer from devicePixelContentBox when given and rejects non-finite input', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    presenter.resize({ cssWidth: 53.6, cssHeight: 93.6, dpr: 1.25, devicePixelContentBox: { width: 67, height: 117 } });
    expect([canvas.width, canvas.height]).toEqual([67, 117]);
    for (const bad of [
      { cssWidth: Number.NaN, cssHeight: 10, dpr: 1 },
      { cssWidth: 10, cssHeight: 10, dpr: 0 },
      { cssWidth: 10, cssHeight: -1, dpr: 1 },
    ]) {
      expect(() => {
        presenter.resize(bad);
      }).toThrow(/GEORDI_E_BIJOU_INVALID_SURFACE/u);
    }
  });

  it('redraws the retained frame after a resize and records the new DPR in the receipt', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    canvas.gl.clearCalls();
    presenter.resize({ cssWidth: 60, cssHeight: 100, dpr: 1.25 });
    expect([canvas.width, canvas.height]).toEqual([75, 125]);
    expect(draws(canvas.gl.calls)).toHaveLength(2);
    expect(cellUploads(canvas.gl.calls)).toEqual([{ y: 0, rows: 7, srcOffset: 0 }]);
    expect(presenter.getLastReceipt()).toMatchObject({ canvasPxW: 75, canvasPxH: 125, dpr: 1.25 });
  });
});

describe('createWebGL2SurfacePresenter: context loss', () => {
  it('prevents the default on webglcontextlost, keeps packing while lost, and restores the full surface from the retained staging buffer', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    const before = presenter.getLastReceipt();

    expect(canvas.loseContext()).toBe(true);
    expect(presenter.getDiagnostics().contextLost).toBe(true);
    canvas.gl.clearCalls();
    const erase = eraseAfter(paint);
    presenter.present(paint, erase, {});
    expect(draws(canvas.gl.calls)).toEqual([]);
    // The receipt still describes the last frame that was drawn.
    expect(presenter.getLastReceipt()).toBe(before);

    canvas.gl.clearCalls();
    canvas.restoreContext();
    expect(presenter.getDiagnostics().contextLost).toBe(false);
    // Every object is rebuilt and the whole retained staging buffer and atlas are uploaded.
    expect(canvas.gl.callsNamed('linkProgram')).toHaveLength(2);
    expect(cellUploads(canvas.gl.calls)).toEqual([{ y: 0, rows: 7, srcOffset: 0 }]);
    expect(atlasUploads(canvas.gl.calls)).toEqual([{ x: 0, y: 0, width: 32, height: 32 }]);
    expect(draws(canvas.gl.calls)).toHaveLength(2);
    expect(presenter.getLastReceipt()?.preparedBufferSha256).toBe(rendered.erase.preparedBufferSha256);
  });
});

describe('createWebGL2SurfacePresenter: dispose', () => {
  it('deletes every GL object it created, removes its listeners, and refuses later frames', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas, { canonicalReadback: true }));
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    presenter.setDiagnosticOverlay(true);
    canvas.loseContext();
    const firstRestored = canvas.gl.objects.length;
    canvas.restoreContext();
    presenter.present(paint, eraseAfter(paint), {});
    expect(canvas.listenerCount()).toBe(2);
    expect(canvas.gl.live().length).toBeGreaterThan(0);

    presenter.dispose();
    // Objects lost with the context are gone with it; everything created after the restore is deleted.
    const restoredObjects = canvas.gl.objects.slice(firstRestored);
    expect(restoredObjects.length).toBeGreaterThan(0);
    expect(restoredObjects.filter((object) => !object.deleted)).toEqual([]);
    expect(canvas.listenerCount()).toBe(0);
    expect(() => {
      presenter.present(paint, paint, {});
    }).toThrow(RendererFaultError);
    // Idempotent.
    presenter.dispose();
  });

  it('deletes every object of a presenter that never lost its context', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas));
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    presenter.dispose();
    expect(canvas.gl.live()).toEqual([]);
  });
});

describe('createWebGL2SurfacePresenter: diagnostic overlay', () => {
  it('toggles a dirty-row tint in the display pass only, without touching the canonical frame or its receipt', () => {
    const canvas = makeCanvas();
    const presenter = createWebGL2SurfacePresenter(presenterOptions(canvas, { canonicalReadback: true }));
    const paint = paintSurface();
    presenter.present(paint, paint, {});
    const receipt = presenter.getLastReceipt();
    canvas.gl.clearCalls();
    presenter.setDiagnosticOverlay(true);
    // Only the display pass is redrawn.
    expect(draws(canvas.gl.calls)).toHaveLength(1);
    expect(canvas.gl.callsNamed('uniform1ui').map((call) => call.args[1])).toContain(1);
    expect(presenter.getLastReceipt()).toBe(receipt);
    expect(presenter.getDiagnostics()).toMatchObject({
      overlay: true,
      atlasStats: rendered.pack.atlasStats,
      atlasGeneration: 1,
    });
  });
});
