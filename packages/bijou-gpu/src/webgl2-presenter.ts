import type { JsonObject } from '@flyingrobots/geordi-core';

import {
  BackendUnavailableError,
  BijouGpuValidationError,
  DrawingBufferMismatchError,
  RendererFaultError,
} from './errors.js';
import type { GlyphAtlasDirtyRect } from './glyph-atlas.js';
import { PACKED_BIJOU_CELL_FORMAT } from './packed-cells.js';
import { preparedBufferBytes } from './prepare.js';
import type { PresenterAtlasSource } from './presenter-atlas.js';
import {
  cellFromPoint as sharedCellFromPoint,
  type GpuCellPoint,
  type GpuPackedSurface,
  type GpuPresentContext,
  type GpuSurfacePresenter,
  type GpuSurfaceResize,
} from './presenter.js';
import { BIJOU_SURFACE_GPU_ABI, PROCEDURAL_GLYPH_TABLE_SHA256 } from './procedural-table.js';
import {
  BUNNY_PRIMITIVE_PINS,
  ENDPOINT_RECEIPT_VERSION,
  parseEndpointReceipt,
  PROBE_POLICY,
  type EndpointReceipt,
  type EndpointReceiptAdapter,
  type EvidenceLevel,
} from './receipt.js';
import { parseHexColor, REFERENCE_DEFAULT_BG, REFERENCE_DEFAULT_FG } from './reference.js';
import { sha256Hex, utf8Bytes } from './sha256.js';
import {
  createSurfaceDamageState,
  packSurfaceDamage,
  type DirtyRowSpan,
  type FullRefreshReason,
} from './surface-damage.js';
import {
  WEBGL2_ENUMS as GL,
  type WebGL2ContextEvent,
  type WebGL2Handle,
  type WebGL2SurfaceCanvas,
  type WebGL2SurfaceContext,
  type WebGL2SurfaceContextAttributes,
} from './webgl2-gl.js';

/**
 * The WebGL2 presenter of `bijou-surface-gpu/1`.
 *
 * It compiles the checked-in naga-generated GLSL ES 3.00 stages of
 * `bijou-surface` unmodified, keeps the prepared cells in an `RGBA32UI`
 * texture and the glyph atlas in an `RGBA8UI` texture, and draws one
 * fullscreen triangle into an offscreen `RGBA8UI` target: the canonical frame,
 * exact integers that can be read back bit for bit. A second fullscreen
 * triangle, the display pass, converts that target to the canvas's
 * normalized drawing buffer. Only the display pass knows about the canvas.
 */

export const WEBGL2_SURFACE_BACKEND_PROFILE = 'geordi-webgl2/1';

/**
 * The `bijou-surface` entry of `packages/bijou-gpu/shaders/bijou-shaders.manifest.json`
 * this presenter executes. A unit test asserts every value against the
 * checked-in manifest, so regenerating the shaders fails until this pin is
 * updated with them.
 */
export const WEBGL2_SURFACE_SHADER_PIN = {
  assembledWgslSha256: '241e1392c446866b331e9992046ef599cc3fd5c83c01bb4f3674f26979a06c53',
  generatedGlslSha256: 'ee0924ab19dfa78e59fb2560304ee81647b95f3a7d681842ecf7836dca1620cf',
  vertex: {
    file: 'bijou-surface.vert.glsl',
    sha256: '0fd67d80ef689992608ab50d65d456d1097f324563d8c4b48e7314b1d1d9fbc5',
  },
  fragment: {
    file: 'bijou-surface.frag.glsl',
    sha256: '6d6a2dee7a8b766ef8396a37aa25ae1d6c3e7bfbae11280768db5c459c18418b',
  },
  uniformBlock: 'BijouSurfaceUniforms_block_0Fragment',
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
  cellsSampler: '_group_0_binding_1_fs',
  atlasSampler: '_group_0_binding_2_fs',
} as const;

export const WEBGL2_DISPLAY_FRAGMENT_FILE = 'geordi-webgl2-display.frag.glsl';

/**
 * The display pass. It is not part of the canonical frame: it copies each
 * exact `RGBA8UI` texel of the canonical target to the default drawing buffer
 * as `texel / 255`, which a normalized `RGBA8` buffer stores back as the same
 * byte. With the overlay on it tints the rows uploaded in the last frame.
 * `gl_FragCoord` is bottom-left in both targets, so no flip is needed here.
 */
export const WEBGL2_DISPLAY_FRAGMENT_GLSL = `#version 300 es

precision highp float;
precision highp int;

uniform highp usampler2D uCanonical;
uniform highp usampler2D uRowMask;
uniform uint uOverlay;
uniform uint uCellPxH;
uniform uint uCanvasPxH;
uniform uint uRows;

layout(location = 0) out vec4 displayColor;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec3 color = vec3(texelFetch(uCanonical, p, 0).rgb) / 255.0;
    if (uOverlay != 0u && uCellPxH != 0u) {
        uint row = ((uCanvasPxH - 1u) - uint(p.y)) / uCellPxH;
        if (row < uRows && texelFetch(uRowMask, ivec2(0, int(row)), 0).r != 0u) {
            color = mix(color, vec3(1.0, 0.0, 1.0), 0.5);
        }
    }
    displayColor = vec4(color, 1.0);
}
`;

export interface WebGL2GlslStage {
  readonly file: string;
  readonly source: string;
}

/**
 * The manifest's `generatedGlslSha256` framing: SHA-256 over, for each stage
 * in order, the file name, a line feed, the decimal byte length, a line feed,
 * and the file bytes.
 */
export function webgl2FramedGlslSha256(stages: readonly WebGL2GlslStage[]): string {
  const parts: Uint8Array[] = [];
  for (const stage of stages) {
    const bytes = utf8Bytes(stage.source);
    parts.push(utf8Bytes(`${stage.file}\n${String(bytes.length)}\n`), bytes);
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return sha256Hex(joined);
}

/** The GLSL text of the two generated `bijou-surface` stages, exactly as checked in. */
export interface WebGL2SurfaceShaderSources {
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Receipt `executedArtifactSha256`: the framed digest of every GLSL stage the
 * presenter executes, in order: the generated vertex and fragment stages, then
 * the display fragment stage.
 */
export function webgl2ExecutedArtifactSha256(shaders: WebGL2SurfaceShaderSources): string {
  return webgl2FramedGlslSha256([
    { file: WEBGL2_SURFACE_SHADER_PIN.vertex.file, source: shaders.vertex },
    { file: WEBGL2_SURFACE_SHADER_PIN.fragment.file, source: shaders.fragment },
    { file: WEBGL2_DISPLAY_FRAGMENT_FILE, source: WEBGL2_DISPLAY_FRAGMENT_GLSL },
  ]);
}

export interface WebGL2SurfacePresenterOptions {
  readonly canvas: WebGL2SurfaceCanvas;
  /** The checked-in generated GLSL. Refused unless it hashes to {@link WEBGL2_SURFACE_SHADER_PIN}. */
  readonly shaders: WebGL2SurfaceShaderSources;
  /** A live `GlyphAtlas`, or `createStaticAtlasSource()` over a fixed bitmap. */
  readonly atlas: PresenterAtlasSource;
  /** `#RRGGBB`; defaults to `REFERENCE_DEFAULT_FG`. */
  readonly defaultFg?: string;
  /** `#RRGGBB`; defaults to `REFERENCE_DEFAULT_BG`. */
  readonly defaultBg?: string;
  /**
   * Read every canonical frame back and put its digest and probes in the
   * receipt (`software-probed` or `gpu-probed`). Off by default: a readback
   * stalls the pipeline, and an unread frame's receipt is `unit-upload`.
   */
  readonly canonicalReadback?: boolean;
  /** Probe points for read-back receipts. Defaults to the four corners and the centre. */
  readonly probePoints?: readonly (readonly [number, number])[];
  /**
   * Receipt `inputReceiptSha256` for a target surface, typically the SHA-256
   * of the `packed-bijou-cells/1` receipt it came from. Defaults to the
   * SHA-256 of the target's packed cell bytes.
   */
  readonly inputReceiptSha256?: (target: GpuPackedSurface) => string;
  /** Start with the diagnostic overlay on. */
  readonly overlay?: boolean;
}

export type WebGL2ReadbackPath = 'rgba-integer-unsigned-byte' | 'rgba-integer-unsigned-int';

/** One read-back canonical frame: tight top-left row-major RGBA8. */
export interface WebGL2CanonicalFrame {
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly rgba: Uint8Array;
  readonly frameRgbaSha256: string;
  readonly readbackPath: WebGL2ReadbackPath;
}

export interface WebGL2PresenterDiagnostics {
  readonly overlay: boolean;
  readonly canonicalReadback: boolean;
  readonly contextLost: boolean;
  readonly adapter: EndpointReceiptAdapter;
  /** The evidence level a read-back frame earns on this adapter. */
  readonly probedEvidenceLevel: Extract<EvidenceLevel, 'software-probed' | 'gpu-probed'>;
  readonly framesDrawn: number;
  readonly lastDirtyRowSpans: readonly DirtyRowSpan[];
  readonly lastFullRefreshReason: FullRefreshReason | null;
  /** Cell texture row uploads (`texSubImage2D` calls) in the last drawn frame. */
  readonly lastCellUploads: number;
  /** Atlas texture uploads in the last drawn frame. */
  readonly lastAtlasUploads: readonly GlyphAtlasDirtyRect[];
  readonly atlasGeneration: number;
  readonly atlasStats: EndpointReceipt['atlasStats'];
  readonly readbackPath: WebGL2ReadbackPath | null;
  /** A failure while rebuilding after `webglcontextrestored`, which the next `present()` repeats. */
  readonly restoreFault: string | null;
}

export interface WebGL2SurfacePresenter extends GpuSurfacePresenter {
  /** Toggle the dirty-row tint. It changes only the display pass. */
  setDiagnosticOverlay(enabled: boolean): void;
  /** Turn per-frame canonical readback on or off from the next frame. */
  setCanonicalReadback(enabled: boolean): void;
  /** Read the last canonical frame back, or `null` before one or while the context is lost. */
  readCanonicalFrame(): WebGL2CanonicalFrame | null;
  getDiagnostics(): WebGL2PresenterDiagnostics;
}

const CONTEXT_ATTRIBUTES: WebGL2SurfaceContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
};

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/iu;

const UNIT_CELLS = 0;
const UNIT_ATLAS = 1;
const UNIT_CANONICAL = 2;
const UNIT_ROW_MASK = 3;

function fault(detail: string): never {
  throw new RendererFaultError('webgl2', detail);
}

function invalidSurface(path: string, detail: string): never {
  throw new BijouGpuValidationError('GEORDI_E_BIJOU_INVALID_SURFACE', path, detail);
}

function verifyShaderSources(shaders: WebGL2SurfaceShaderSources): void {
  for (const [label, source, pin] of [
    ['vertex', shaders.vertex, WEBGL2_SURFACE_SHADER_PIN.vertex],
    ['fragment', shaders.fragment, WEBGL2_SURFACE_SHADER_PIN.fragment],
  ] as const) {
    const digest = sha256Hex(utf8Bytes(source));
    if (digest !== pin.sha256) {
      fault(
        `${label} GLSL SHA-256 ${digest} is not the manifest pin ${pin.sha256} of ${pin.file}; pass the checked-in generated file unmodified`,
      );
    }
  }
  const framed = webgl2FramedGlslSha256([
    { file: WEBGL2_SURFACE_SHADER_PIN.vertex.file, source: shaders.vertex },
    { file: WEBGL2_SURFACE_SHADER_PIN.fragment.file, source: shaders.fragment },
  ]);
  if (framed !== WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256) {
    fault(`generated GLSL SHA-256 ${framed} is not the manifest pin ${WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256}`);
  }
}

interface Texture {
  readonly handle: WebGL2Handle;
  readonly width: number;
  readonly height: number;
}

interface Resources {
  readonly canonical: WebGL2Handle;
  readonly display: WebGL2Handle;
  readonly vertexArray: WebGL2Handle;
  readonly uniformBuffer: WebGL2Handle;
  readonly displayUniforms: {
    readonly overlay: WebGL2Handle | null;
    readonly cellPxH: WebGL2Handle | null;
    readonly canvasPxH: WebGL2Handle | null;
    readonly rows: WebGL2Handle | null;
  };
  cells: Texture | null;
  atlas: Texture | null;
  target: (Texture & { readonly framebuffer: WebGL2Handle }) | null;
  rowMask: Texture | null;
}

function describeAdapter(gl: WebGL2SurfaceContext): {
  adapter: EndpointReceiptAdapter;
  probed: Extract<EvidenceLevel, 'software-probed' | 'gpu-probed'>;
} {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(info === null ? GL.RENDERER : GL.UNMASKED_RENDERER_WEBGL) ?? '');
  const version = String(gl.getParameter(GL.VERSION) ?? '');
  // A hardware claim needs a named, unmasked, non-software renderer. Anything else is software.
  const hardware = info !== null && renderer.length > 0 && !SOFTWARE_RENDERER.test(renderer);
  return {
    adapter: { backend: 'webgl2', name: renderer, driver: version },
    probed: hardware ? 'gpu-probed' : 'software-probed',
  };
}

function defaultProbePoints(width: number, height: number): [number, number][] {
  const points: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), Math.floor(height / 2)],
  ];
  const seen = new Set<string>();
  return points.filter(([x, y]) => {
    const key = `${String(x)},${String(y)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Create a WebGL2 presenter on `options.canvas`.
 *
 * @throws BackendUnavailableError when the canvas has no WebGL2 context, or it
 *   is lost at creation. This is a capability refusal, never a pass.
 * @throws RendererFaultError when the shader text is not the pinned generated
 *   GLSL, or a stage fails to compile or link, or a binding is missing. A
 *   fault is never turned into a fallback.
 */
export function createWebGL2SurfacePresenter(options: WebGL2SurfacePresenterOptions): WebGL2SurfacePresenter {
  verifyShaderSources(options.shaders);
  const { canvas, shaders, atlas } = options;
  const defaultFg = options.defaultFg ?? REFERENCE_DEFAULT_FG;
  const defaultBg = options.defaultBg ?? REFERENCE_DEFAULT_BG;
  const fgRgb = parseHexColor(defaultFg, 'options.defaultFg');
  const bgRgb = parseHexColor(defaultBg, 'options.defaultBg');
  const executedArtifactSha256 = webgl2ExecutedArtifactSha256(shaders);

  const context = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  if (context === null) {
    throw new BackendUnavailableError('webgl2', 'canvas.getContext("webgl2") returned null');
  }
  const gl: WebGL2SurfaceContext = context;
  if (gl.isContextLost()) {
    throw new BackendUnavailableError('webgl2', 'the WebGL2 context is lost');
  }
  gl.drawingBufferColorSpace = 'srgb';
  const { adapter, probed } = describeAdapter(gl);

  const damage = createSurfaceDamageState();
  let resources: Resources | null = null;
  let lost = false;
  let disposed = false;
  let overlay = options.overlay === true;
  let readback = options.canonicalReadback === true;
  let dpr = 1;
  let pendingForce = false;
  /** The cell texture must be uploaded whole before the next draw. */
  let fullUploadPending = true;
  let uploadedAtlasGeneration: number | null = null;
  let uploadedAtlasRgba: Uint8Array | null = null;
  let hasFrame = false;
  let lastInputSha256 = '';
  let lastSpans: readonly DirtyRowSpan[] = [];
  let lastReason: FullRefreshReason | null = null;
  let lastCellUploads = 0;
  let lastAtlasUploads: GlyphAtlasDirtyRect[] = [];
  let lastReceipt: EndpointReceipt | null = null;
  let lastFrame: WebGL2CanonicalFrame | null = null;
  let readbackPath: WebGL2ReadbackPath | null = null;
  let framesDrawn = 0;
  let restoreFault: string | null = null;

  function compile(type: number, source: string, label: string): WebGL2Handle {
    const shader = gl.createShader(type) ?? fault(`could not create the ${label} shader`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, GL.COMPILE_STATUS) !== true) {
      const log = gl.getShaderInfoLog(shader) ?? '';
      gl.deleteShader(shader);
      fault(`${label} failed to compile: ${log}`);
    }
    return shader;
  }

  function link(vertex: WebGL2Handle, fragment: WebGL2Handle, label: string): WebGL2Handle {
    const program = gl.createProgram() ?? fault(`could not create the ${label} program`);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, GL.LINK_STATUS) !== true) {
      const log = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      fault(`${label} program failed to link: ${log}`);
    }
    return program;
  }

  /** Build every GL object that does not depend on a size. */
  function createResources(): Resources {
    const created: { shaders: WebGL2Handle[]; programs: WebGL2Handle[] } = { shaders: [], programs: [] };
    try {
      const vertex = compile(GL.VERTEX_SHADER, shaders.vertex, WEBGL2_SURFACE_SHADER_PIN.vertex.file);
      created.shaders.push(vertex);
      const fragment = compile(GL.FRAGMENT_SHADER, shaders.fragment, WEBGL2_SURFACE_SHADER_PIN.fragment.file);
      created.shaders.push(fragment);
      const displayFragment = compile(GL.FRAGMENT_SHADER, WEBGL2_DISPLAY_FRAGMENT_GLSL, WEBGL2_DISPLAY_FRAGMENT_FILE);
      created.shaders.push(displayFragment);
      const canonical = link(vertex, fragment, 'bijou-surface');
      created.programs.push(canonical);
      const display = link(vertex, displayFragment, 'display');
      created.programs.push(display);

      const blockIndex = gl.getUniformBlockIndex(canonical, WEBGL2_SURFACE_SHADER_PIN.uniformBlock);
      if (blockIndex === GL.INVALID_INDEX) {
        fault(`uniform block ${WEBGL2_SURFACE_SHADER_PIN.uniformBlock} is not in the linked program`);
      }
      gl.uniformBlockBinding(canonical, blockIndex, 0);
      const cellsLocation =
        gl.getUniformLocation(canonical, WEBGL2_SURFACE_SHADER_PIN.cellsSampler) ??
        fault(`sampler ${WEBGL2_SURFACE_SHADER_PIN.cellsSampler} is not in the linked program`);
      const atlasLocation =
        gl.getUniformLocation(canonical, WEBGL2_SURFACE_SHADER_PIN.atlasSampler) ??
        fault(`sampler ${WEBGL2_SURFACE_SHADER_PIN.atlasSampler} is not in the linked program`);
      gl.useProgram(canonical);
      gl.uniform1i(cellsLocation, UNIT_CELLS);
      gl.uniform1i(atlasLocation, UNIT_ATLAS);

      const canonicalLocation =
        gl.getUniformLocation(display, 'uCanonical') ?? fault('sampler uCanonical is not in the display program');
      gl.useProgram(display);
      gl.uniform1i(canonicalLocation, UNIT_CANONICAL);
      gl.uniform1i(gl.getUniformLocation(display, 'uRowMask'), UNIT_ROW_MASK);

      const uniformBuffer = gl.createBuffer() ?? fault('could not create the uniform buffer');
      const vertexArray = gl.createVertexArray() ?? fault('could not create the vertex array');
      for (const shader of created.shaders) {
        gl.deleteShader(shader);
      }
      return {
        canonical,
        display,
        vertexArray,
        uniformBuffer,
        displayUniforms: {
          overlay: gl.getUniformLocation(display, 'uOverlay'),
          cellPxH: gl.getUniformLocation(display, 'uCellPxH'),
          canvasPxH: gl.getUniformLocation(display, 'uCanvasPxH'),
          rows: gl.getUniformLocation(display, 'uRows'),
        },
        cells: null,
        atlas: null,
        target: null,
        rowMask: null,
      };
    } catch (error) {
      for (const shader of created.shaders) {
        gl.deleteShader(shader);
      }
      for (const program of created.programs) {
        gl.deleteProgram(program);
      }
      throw error;
    }
  }

  function releaseResources(owned: Resources): void {
    gl.deleteProgram(owned.canonical);
    gl.deleteProgram(owned.display);
    gl.deleteVertexArray(owned.vertexArray);
    gl.deleteBuffer(owned.uniformBuffer);
    for (const texture of [owned.cells, owned.atlas, owned.rowMask]) {
      if (texture !== null) {
        gl.deleteTexture(texture.handle);
      }
    }
    if (owned.target !== null) {
      gl.deleteFramebuffer(owned.target.framebuffer);
      gl.deleteTexture(owned.target.handle);
    }
  }

  function allocateTexture(unit: number, internalFormat: number, width: number, height: number): Texture {
    const handle = gl.createTexture() ?? fault('could not create a texture');
    gl.activeTexture(GL.TEXTURE0 + unit);
    gl.bindTexture(GL.TEXTURE_2D, handle);
    // Integer textures are incomplete under any filter but NEAREST, and have one level.
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    gl.texStorage2D(GL.TEXTURE_2D, 1, internalFormat, width, height);
    return { handle, width, height };
  }

  function resetUnpack(): void {
    gl.pixelStorei(GL.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(GL.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(GL.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(GL.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  }

  function ensureTarget(owned: Resources, width: number, height: number): void {
    if (owned.target?.width === width && owned.target.height === height) {
      return;
    }
    if (owned.target !== null) {
      gl.deleteFramebuffer(owned.target.framebuffer);
      gl.deleteTexture(owned.target.handle);
      owned.target = null;
    }
    const texture = allocateTexture(UNIT_CANONICAL, GL.RGBA8UI, width, height);
    const framebuffer = gl.createFramebuffer();
    if (framebuffer === null) {
      gl.deleteTexture(texture.handle);
      fault('could not create the canonical framebuffer');
    }
    owned.target = { ...texture, framebuffer };
    gl.bindFramebuffer(GL.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, texture.handle, 0);
    const status = gl.checkFramebufferStatus(GL.FRAMEBUFFER);
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    if (status !== GL.FRAMEBUFFER_COMPLETE) {
      fault(`the RGBA8UI canonical framebuffer is incomplete (status 0x${status.toString(16)})`);
    }
  }

  function uploadAtlas(owned: Resources): void {
    const bitmap = atlas.bitmap;
    const width = bitmap.atlasCols * bitmap.cellPxW;
    const height = bitmap.atlasRows * bitmap.cellPxH;
    const generation = atlas.atlasGeneration();
    const rects = atlas.takeDirtyRects();
    lastAtlasUploads = [];
    let whole =
      generation !== uploadedAtlasGeneration || bitmap.rgba !== uploadedAtlasRgba || owned.atlas === null;
    if (owned.atlas?.width !== width || owned.atlas.height !== height) {
      if (owned.atlas !== null) {
        gl.deleteTexture(owned.atlas.handle);
      }
      owned.atlas = allocateTexture(UNIT_ATLAS, GL.RGBA8UI, width, height);
      whole = true;
    }
    gl.activeTexture(GL.TEXTURE0 + UNIT_ATLAS);
    gl.bindTexture(GL.TEXTURE_2D, owned.atlas.handle);
    resetUnpack();
    if (whole) {
      gl.texSubImage2D(GL.TEXTURE_2D, 0, 0, 0, width, height, GL.RGBA_INTEGER, GL.UNSIGNED_BYTE, bitmap.rgba, 0);
      lastAtlasUploads.push({ x: 0, y: 0, width, height });
    } else if (rects.length > 0) {
      gl.pixelStorei(GL.UNPACK_ROW_LENGTH, width);
      for (const rect of rects) {
        gl.pixelStorei(GL.UNPACK_SKIP_PIXELS, rect.x);
        gl.pixelStorei(GL.UNPACK_SKIP_ROWS, rect.y);
        gl.texSubImage2D(
          GL.TEXTURE_2D,
          0,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          GL.RGBA_INTEGER,
          GL.UNSIGNED_BYTE,
          bitmap.rgba,
          0,
        );
        lastAtlasUploads.push(rect);
      }
      resetUnpack();
    }
    uploadedAtlasGeneration = generation;
    uploadedAtlasRgba = bitmap.rgba;
  }

  function uploadCells(owned: Resources, spans: readonly DirtyRowSpan[], whole: boolean): void {
    const { staging, widthCells, heightCells } = damage;
    const textureWidth = Math.max(1, widthCells);
    const textureHeight = Math.max(1, heightCells);
    if (owned.cells?.width !== textureWidth || owned.cells.height !== textureHeight) {
      if (owned.cells !== null) {
        gl.deleteTexture(owned.cells.handle);
      }
      owned.cells = allocateTexture(UNIT_CELLS, GL.RGBA32UI, textureWidth, textureHeight);
      whole = true;
    }
    gl.activeTexture(GL.TEXTURE0 + UNIT_CELLS);
    gl.bindTexture(GL.TEXTURE_2D, owned.cells.handle);
    resetUnpack();
    lastCellUploads = 0;
    if (widthCells === 0 || heightCells === 0) {
      return;
    }
    const uploads = whole ? [{ minRow: 0, maxRow: heightCells - 1 }] : spans;
    for (const span of uploads) {
      gl.texSubImage2D(
        GL.TEXTURE_2D,
        0,
        0,
        span.minRow,
        widthCells,
        span.maxRow - span.minRow + 1,
        GL.RGBA_INTEGER,
        GL.UNSIGNED_INT,
        staging,
        span.minRow * widthCells * 4,
      );
      lastCellUploads += 1;
    }
  }

  function uniformWords(): Uint32Array {
    const offsets = WEBGL2_SURFACE_SHADER_PIN.uniformOffsets;
    const words = new Uint32Array(WEBGL2_SURFACE_SHADER_PIN.uniformByteSize / 4);
    words.set([canvas.width, canvas.height], offsets.canvasPx / 4);
    words.set([atlas.bitmap.cellPxW, atlas.bitmap.cellPxH], offsets.cellPx / 4);
    words.set([damage.widthCells, damage.heightCells], offsets.gridCells / 4);
    words[offsets.atlasCols / 4] = atlas.bitmap.atlasCols;
    words.set(fgRgb, offsets.defaultFg / 4);
    words.set(bgRgb, offsets.defaultBg / 4);
    // `flags` is reserved and must be 0.
    words[offsets.flags / 4] = 0;
    return words;
  }

  function fixedState(): void {
    gl.disable(GL.DITHER);
    gl.disable(GL.BLEND);
    gl.disable(GL.DEPTH_TEST);
    gl.disable(GL.STENCIL_TEST);
    gl.disable(GL.SCISSOR_TEST);
    gl.disable(GL.CULL_FACE);
  }

  function drawCanonical(owned: Resources): void {
    const target = owned.target ?? fault('the canonical target is missing');
    const cells = owned.cells ?? fault('the cell texture is missing');
    const atlasTexture = owned.atlas ?? fault('the atlas texture is missing');
    gl.bindFramebuffer(GL.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    fixedState();
    gl.useProgram(owned.canonical);
    gl.bindVertexArray(owned.vertexArray);
    gl.activeTexture(GL.TEXTURE0 + UNIT_CELLS);
    gl.bindTexture(GL.TEXTURE_2D, cells.handle);
    gl.activeTexture(GL.TEXTURE0 + UNIT_ATLAS);
    gl.bindTexture(GL.TEXTURE_2D, atlasTexture.handle);
    gl.bindBuffer(GL.UNIFORM_BUFFER, owned.uniformBuffer);
    gl.bufferData(GL.UNIFORM_BUFFER, uniformWords(), GL.DYNAMIC_DRAW);
    gl.bindBufferBase(GL.UNIFORM_BUFFER, 0, owned.uniformBuffer);
    gl.drawArrays(GL.TRIANGLES, 0, 3);
  }

  function uploadRowMask(owned: Resources): void {
    const rows = Math.max(1, damage.heightCells);
    if (owned.rowMask?.height !== rows) {
      if (owned.rowMask !== null) {
        gl.deleteTexture(owned.rowMask.handle);
      }
      owned.rowMask = allocateTexture(UNIT_ROW_MASK, GL.R8UI, 1, rows);
    }
    const mask = new Uint8Array(rows);
    for (const span of lastSpans) {
      mask.fill(1, span.minRow, span.maxRow + 1);
    }
    gl.activeTexture(GL.TEXTURE0 + UNIT_ROW_MASK);
    gl.bindTexture(GL.TEXTURE_2D, owned.rowMask.handle);
    resetUnpack();
    gl.texSubImage2D(GL.TEXTURE_2D, 0, 0, 0, 1, rows, GL.RED_INTEGER, GL.UNSIGNED_BYTE, mask, 0);
  }

  function drawDisplay(owned: Resources): void {
    const target = owned.target ?? fault('the canonical target is missing');
    uploadRowMask(owned);
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    fixedState();
    gl.useProgram(owned.display);
    gl.bindVertexArray(owned.vertexArray);
    gl.activeTexture(GL.TEXTURE0 + UNIT_CANONICAL);
    gl.bindTexture(GL.TEXTURE_2D, target.handle);
    gl.uniform1ui(owned.displayUniforms.overlay, overlay ? 1 : 0);
    gl.uniform1ui(owned.displayUniforms.cellPxH, atlas.bitmap.cellPxH);
    gl.uniform1ui(owned.displayUniforms.canvasPxH, canvas.height);
    gl.uniform1ui(owned.displayUniforms.rows, damage.heightCells);
    gl.drawArrays(GL.TRIANGLES, 0, 3);
  }

  /** Returns false when the context was lost; throws on any other GL error. */
  function checkErrors(stage: string): boolean {
    const error = gl.getError();
    if (error === GL.NO_ERROR) {
      return true;
    }
    if (error === GL.CONTEXT_LOST_WEBGL || gl.isContextLost()) {
      markLost();
      return false;
    }
    return fault(`WebGL error 0x${error.toString(16)} after ${stage}`);
  }

  function readCanonical(owned: Resources): WebGL2CanonicalFrame {
    const target = owned.target ?? fault('the canonical target is missing');
    const { width, height } = target;
    gl.bindFramebuffer(GL.FRAMEBUFFER, target.framebuffer);
    gl.pixelStorei(GL.PACK_ALIGNMENT, 1);
    gl.pixelStorei(GL.PACK_ROW_LENGTH, 0);
    gl.pixelStorei(GL.PACK_SKIP_ROWS, 0);
    gl.pixelStorei(GL.PACK_SKIP_PIXELS, 0);
    const readFormat = gl.getParameter(GL.IMPLEMENTATION_COLOR_READ_FORMAT);
    const readType = gl.getParameter(GL.IMPLEMENTATION_COLOR_READ_TYPE);
    const bottomUp = new Uint8Array(width * height * 4);
    let path: WebGL2ReadbackPath;
    if (readFormat === GL.RGBA_INTEGER && readType === GL.UNSIGNED_BYTE) {
      // The ABI's path: exact bytes straight out of the RGBA8UI target.
      gl.readPixels(0, 0, width, height, GL.RGBA_INTEGER, GL.UNSIGNED_BYTE, bottomUp);
      path = 'rgba-integer-unsigned-byte';
    } else {
      // RGBA_INTEGER / UNSIGNED_INT is the pair every implementation must accept for an
      // unsigned integer target. Each lane holds one exact byte.
      const wide = new Uint32Array(width * height * 4);
      gl.readPixels(0, 0, width, height, GL.RGBA_INTEGER, GL.UNSIGNED_INT, wide);
      for (let index = 0; index < wide.length; index += 1) {
        const lane = wide[index] ?? 0;
        if (lane > 255) {
          fault(`canonical readback lane ${String(index)} holds ${String(lane)}, not a byte`);
        }
        bottomUp[index] = lane;
      }
      path = 'rgba-integer-unsigned-int';
    }
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    // readPixels rows run bottom-up. Flip them to the canonical top-left order.
    const rgba = new Uint8Array(width * height * 4);
    const stride = width * 4;
    for (let row = 0; row < height; row += 1) {
      const from = (height - 1 - row) * stride;
      rgba.set(bottomUp.subarray(from, from + stride), row * stride);
    }
    readbackPath = path;
    return { canvasPxW: width, canvasPxH: height, rgba, frameRgbaSha256: sha256Hex(rgba), readbackPath: path };
  }

  function buildReceipt(frame: WebGL2CanonicalFrame | null): EndpointReceipt {
    const assets = atlas.getReceiptAssets();
    const probes =
      frame === null
        ? []
        : (options.probePoints ?? defaultProbePoints(frame.canvasPxW, frame.canvasPxH)).map(([px, py]) => {
            const offset = (py * frame.canvasPxW + px) * 4;
            return {
              px,
              py,
              rgba: [frame.rgba[offset] ?? 0, frame.rgba[offset + 1] ?? 0, frame.rgba[offset + 2] ?? 0, frame.rgba[offset + 3] ?? 0],
            };
          });
    const json: JsonObject = {
      receiptVersion: ENDPOINT_RECEIPT_VERSION,
      gpuAbiVersion: BIJOU_SURFACE_GPU_ABI,
      cellFormatId: PACKED_BIJOU_CELL_FORMAT,
      inputReceiptSha256: lastInputSha256,
      preparedBufferSha256: sha256Hex(preparedBufferBytes(damage.staging)),
      proceduralTableSha256: PROCEDURAL_GLYPH_TABLE_SHA256,
      bunnyPrimitives: BUNNY_PRIMITIVE_PINS.map((pin) => ({ ...pin })),
      assembledWgslSha256: WEBGL2_SURFACE_SHADER_PIN.assembledWgslSha256,
      generatedGlslSha256: WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256,
      shaderSha256: WEBGL2_SURFACE_SHADER_PIN.generatedGlslSha256,
      executedArtifactSha256,
      backendProfile: WEBGL2_SURFACE_BACKEND_PROFILE,
      adapter: { ...adapter },
      evidenceLevel: frame === null ? 'unit-upload' : probed,
      widthCells: damage.widthCells,
      heightCells: damage.heightCells,
      cellPx: { ...assets.cellPx },
      canvasPxW: canvas.width,
      canvasPxH: canvas.height,
      dpr,
      defaultFg,
      defaultBg,
      fontIdentity: assets.fontIdentity,
      atlasGeneration: assets.atlasGeneration,
      atlasStats: { ...assets.atlasStats },
      frameRgbaSha256: frame === null ? null : frame.frameRgbaSha256,
      probePolicy: PROBE_POLICY,
      probes,
    };
    // Every receipt is validated before it is exposed; an invalid one is a bug here.
    return parseEndpointReceipt(json);
  }

  function assertDrawable(widthCells: number, heightCells: number): void {
    const { cellPxW, cellPxH } = atlas.bitmap;
    if (canvas.width < widthCells * cellPxW || canvas.height < heightCells * cellPxH) {
      invalidSurface(
        'canvas',
        `the ${String(canvas.width)}x${String(canvas.height)} canvas is smaller than the ${String(widthCells)}x${String(heightCells)} grid of ${String(cellPxW)}x${String(cellPxH)} cells`,
      );
    }
    if (gl.drawingBufferWidth !== canvas.width || gl.drawingBufferHeight !== canvas.height) {
      throw new DrawingBufferMismatchError(
        { width: canvas.width, height: canvas.height },
        { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      );
    }
  }

  /** Upload what changed, draw both passes, and record the receipt. */
  function drawFrame(spans: readonly DirtyRowSpan[], fullCells: boolean): void {
    const owned = (resources ??= createResources());
    try {
      ensureTarget(owned, canvas.width, canvas.height);
      uploadAtlas(owned);
      uploadCells(owned, spans, fullCells || fullUploadPending);
      fullUploadPending = false;
      drawCanonical(owned);
      drawDisplay(owned);
      if (!checkErrors('drawing the frame')) {
        return;
      }
      let frame: WebGL2CanonicalFrame | null = null;
      if (readback) {
        frame = readCanonical(owned);
        if (!checkErrors('reading the canonical frame back')) {
          return;
        }
      }
      framesDrawn += 1;
      hasFrame = true;
      lastFrame = frame;
      lastReceipt = buildReceipt(frame);
    } catch (error) {
      // Whatever was uploaded is now unknown; the next frame uploads everything.
      fullUploadPending = true;
      uploadedAtlasGeneration = null;
      throw error;
    }
  }

  function markLost(): void {
    lost = true;
    // Every handle died with the context; nothing is deleted.
    resources = null;
    fullUploadPending = true;
    uploadedAtlasGeneration = null;
    uploadedAtlasRgba = null;
  }

  function redraw(): void {
    if (!hasFrame || lost || disposed || damage.pendingFullRefresh === 'recovery') {
      return;
    }
    const { cellPxW, cellPxH } = atlas.bitmap;
    if (canvas.width < damage.widthCells * cellPxW || canvas.height < damage.heightCells * cellPxH) {
      // The retained grid no longer fits; the host's next present() lays out a new one.
      return;
    }
    assertDrawable(damage.widthCells, damage.heightCells);
    fullUploadPending = true;
    drawFrame([], true);
  }

  const onLost = (event: WebGL2ContextEvent): void => {
    // Without preventDefault() the browser never restores the context.
    event.preventDefault();
    markLost();
  };

  const onRestored = (): void => {
    if (disposed) {
      return;
    }
    lost = false;
    restoreFault = null;
    try {
      resources = createResources();
      redraw();
    } catch (error) {
      // Surfaced by the next present(), which rebuilds and throws it again.
      restoreFault = error instanceof Error ? error.message : String(error);
      if (resources !== null) {
        releaseResources(resources);
      }
      resources = null;
    }
  };

  resources = createResources();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function assertLive(): void {
    if (disposed) {
      fault('the presenter is disposed');
    }
  }

  return {
    present(current: GpuPackedSurface, target: GpuPackedSurface, ctx: GpuPresentContext): void {
      assertLive();
      const isLost = lost || gl.isContextLost();
      if (!isLost) {
        assertDrawable(target.width, target.height);
      }
      const forceFullRefresh = ctx.forceFullRefresh === true || pendingForce || atlas.consumeFullRefresh();
      const result = packSurfaceDamage(damage, current, target, {
        resolveSlot: atlas.resolveSlot,
        atlasGeneration: atlas.atlasGeneration,
        forceFullRefresh,
      });
      // The packer saw any reset that happened while it resolved glyphs.
      atlas.consumeFullRefresh();
      pendingForce = false;
      lastInputSha256 = options.inputReceiptSha256?.(target) ?? sha256Hex(target.buffer);
      lastSpans = result.dirtyRowSpans;
      lastReason = result.fullRefreshReason;
      if (isLost) {
        // Keep the staging buffer current; the restore handler uploads it whole.
        fullUploadPending = true;
        hasFrame = true;
        return;
      }
      drawFrame(result.dirtyRowSpans, result.fullRefresh);
    },

    resize(size: GpuSurfaceResize): void {
      assertLive();
      for (const [field, value] of [
        ['cssWidth', size.cssWidth],
        ['cssHeight', size.cssHeight],
        ['dpr', size.dpr],
      ] as const) {
        if (!Number.isFinite(value) || value <= 0) {
          invalidSurface(`resize.${field}`, `expected a finite positive number, received ${String(value)}`);
        }
      }
      const box = size.devicePixelContentBox;
      const width = box?.width ?? Math.round(size.cssWidth * size.dpr);
      const height = box?.height ?? Math.round(size.cssHeight * size.dpr);
      for (const [field, value] of [
        ['width', width],
        ['height', height],
      ] as const) {
        if (!Number.isInteger(value) || value < 1 || value > 0xffff) {
          invalidSurface(`resize.${field}`, `expected a physical size in 1..65535, received ${String(value)}`);
        }
      }
      if (size.dpr !== dpr) {
        // A device pixel ratio change is a full-refresh trigger of the ABI.
        pendingForce = true;
        dpr = size.dpr;
      }
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      redraw();
    },

    cellFromPoint(clientX: number, clientY: number): GpuCellPoint | null {
      if (disposed || !hasFrame) {
        return null;
      }
      return sharedCellFromPoint(
        {
          cols: damage.widthCells,
          rows: damage.heightCells,
          cellPxW: atlas.bitmap.cellPxW,
          cellPxH: atlas.bitmap.cellPxH,
          canvasPxW: canvas.width,
          canvasPxH: canvas.height,
        },
        canvas.getBoundingClientRect(),
        clientX,
        clientY,
      );
    },

    getLastReceipt(): EndpointReceipt | null {
      return lastReceipt;
    },

    setDiagnosticOverlay(enabled: boolean): void {
      assertLive();
      overlay = enabled;
      if (resources === null || lost || !hasFrame || resources.target === null) {
        return;
      }
      drawDisplay(resources);
      checkErrors('drawing the overlay');
    },

    setCanonicalReadback(enabled: boolean): void {
      assertLive();
      readback = enabled;
    },

    readCanonicalFrame(): WebGL2CanonicalFrame | null {
      assertLive();
      if (lastFrame !== null) {
        return lastFrame;
      }
      if (resources === null || lost || !hasFrame || resources.target === null) {
        return null;
      }
      const frame = readCanonical(resources);
      return checkErrors('reading the canonical frame back') ? frame : null;
    },

    getDiagnostics(): WebGL2PresenterDiagnostics {
      const assets = atlas.getReceiptAssets();
      return {
        overlay,
        canonicalReadback: readback,
        contextLost: lost,
        adapter,
        probedEvidenceLevel: probed,
        framesDrawn,
        lastDirtyRowSpans: lastSpans,
        lastFullRefreshReason: lastReason,
        lastCellUploads,
        lastAtlasUploads,
        atlasGeneration: assets.atlasGeneration,
        atlasStats: assets.atlasStats,
        readbackPath,
        restoreFault,
      };
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (resources !== null && !gl.isContextLost()) {
        releaseResources(resources);
      }
      resources = null;
      lastFrame = null;
    },
  };
}
