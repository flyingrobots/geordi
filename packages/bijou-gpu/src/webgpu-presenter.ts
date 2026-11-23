import { parseJsonValue, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

import { assertCellMetrics, type AtlasBitmap } from './atlas.js';
import { BackendUnavailableError, BijouGpuValidationError, RendererFaultError } from './errors.js';
import type { GlyphAtlasDirtyRect } from './glyph-atlas.js';
import { isJsonArray, isJsonObject } from './json-decode.js';
import {
  assemblePresenterReceipt,
  presenterGridGeometry,
  resolvePresenterCanvasPx,
  type PresenterCanvasPx,
} from './presenter-host.js';
import type { PresenterAtlasSource } from './presenter-atlas.js';
import {
  cellFromPoint,
  type GpuCellPoint,
  type GpuClientRect,
  type GpuPackedSurface,
  type GpuPresentContext,
  type GpuSurfacePresenter,
  type GpuSurfaceResize,
} from './presenter.js';
import { preparedBufferBytes } from './prepare.js';
import type { EndpointReceipt, EndpointReceiptAdapter, EndpointReceiptProbe } from './receipt.js';
import { parseHexColor, REFERENCE_DEFAULT_BG, REFERENCE_DEFAULT_FG } from './reference.js';
import { sha256Hex, utf8Bytes } from './sha256.js';
import { BIJOU_SHADER_MANIFEST_FILE, requireShaderText, type ShaderSourcePort } from './shader-source.js';
import {
  createSurfaceDamageState,
  packSurfaceDamage,
  type DirtyRowSpan,
  type SurfaceDamageState,
} from './surface-damage.js';
import {
  WEBGPU_BUFFER_USAGE,
  WEBGPU_MAP_MODE_READ,
  WEBGPU_SHADER_STAGE_FRAGMENT,
  WEBGPU_TEXTURE_USAGE,
  type WebGpuAdapter,
  type WebGpuBindGroup,
  type WebGpuBindGroupLayout,
  type WebGpuBuffer,
  type WebGpuCanvas,
  type WebGpuCanvasContext,
  type WebGpuDevice,
  type WebGpuDeviceLostInfo,
  type WebGpuGpu,
  type WebGpuRenderPipeline,
  type WebGpuShaderModule,
  type WebGpuTexture,
  isWebGpuCanvasContext,
} from './webgpu-types.js';

/**
 * Browser WebGPU presenter for `bijou-surface-gpu/1`.
 *
 * It executes the canonical assembled `bijou-surface.wgsl` verbatim: the
 * fragment stage writes exact integers into an `rgba8uint` offscreen target,
 * which is the canonical frame. A separate display pass converts those bytes
 * to a non-sRGB (`bgra8unorm` or `rgba8unorm`) canvas, so no gamma curve is
 * ever applied on top of sRGB-direct bytes.
 */

/** `backendProfile` of every receipt this presenter emits. */
export const WEBGPU_BACKEND_PROFILE = 'geordi-webgpu/1';

/** Bytes per `rgba32uint` prepared cell texel. */
export const WEBGPU_CELL_TEXEL_BYTES = 16;

/** Bytes per `rgba8uint` atlas or frame texel. */
export const WEBGPU_RGBA8_TEXEL_BYTES = 4;

/**
 * `bytesPerRow` alignment WebGPU requires of buffer copies
 * (`copyTextureToBuffer`, `copyBufferToTexture`). `queue.writeTexture` has no
 * such requirement.
 */
export const WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT = 256;

/** Canvas formats the display pass may target: normalized, never `-srgb`. */
export const WEBGPU_DISPLAY_FORMATS = ['bgra8unorm', 'rgba8unorm'] as const;

export type WebGpuDisplayFormat = (typeof WEBGPU_DISPLAY_FORMATS)[number];

/** Name the display shader is framed under in `executedArtifactSha256`. */
export const WEBGPU_DISPLAY_WGSL_NAME = 'geordi-webgpu-display.wgsl';

/**
 * The display pass. It reads the canonical `rgba8uint` frame texel under each
 * canvas pixel and writes it to a normalized swapchain. Floats appear only
 * here, after the canonical frame is final.
 */
export const WEBGPU_DISPLAY_WGSL = `@group(0) @binding(0) var frame: texture_2d<u32>;

@vertex
fn vs_display(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  return vec4<f32>(x, y, 0.0, 1.0);
}

@fragment
fn fs_display(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let texel = textureLoad(frame, vec2<u32>(u32(position.x), u32(position.y)), 0);
  return vec4<f32>(f32(texel.r), f32(texel.g), f32(texel.b), 255.0) / 255.0;
}
`;

const SURFACE_WGSL_NAME = 'bijou-surface.wgsl';
const SURFACE_SHADER_ID = 'bijou-surface';
const UNIFORM_MEMBERS = [
  'canvasPx',
  'cellPx',
  'gridCells',
  'atlasCols',
  'defaultFg',
  'defaultBg',
  'flags',
] as const;

type UniformMember = (typeof UNIFORM_MEMBERS)[number];

/** The canonical shader text and the implementation manifest that pins it. */
export interface BijouSurfaceShaderSource {
  /** Exact text of `packages/bijou-gpu/shaders/bijou-surface.wgsl`. */
  readonly wgsl: string;
  /** Parsed `packages/bijou-gpu/shaders/bijou-shaders.manifest.json`. */
  readonly manifest: JsonValue;
}

/** What the presenter reads from the manifest's `bijou-surface` entry. */
export interface BijouSurfaceShaderLayout {
  readonly wgsl: string;
  readonly assembledWgslSha256: string;
  readonly group: number;
  readonly uniformBinding: number;
  readonly cellsBinding: number;
  readonly atlasBinding: number;
  readonly uniformByteSize: number;
  readonly uniformOffsets: Readonly<Record<UniformMember, number>>;
}

function shaderFault(detail: string): never {
  throw new RendererFaultError('webgpu', detail);
}

function manifestObject(value: JsonValue | undefined, path: string): JsonObject {
  return isJsonObject(value) ? value : shaderFault(`shader manifest ${path} is not an object`);
}

function manifestInteger(value: JsonValue | undefined, path: string): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : shaderFault(`shader manifest ${path} is not a non-negative integer`);
}

/**
 * Read the assembled WGSL and the manifest from `port` and decode them with
 * {@link decodeBijouSurfaceShader}, which refuses any WGSL byte the manifest
 * does not pin.
 *
 * @throws RendererFaultError when the port lacks either file, the manifest is
 *   not JSON, or {@link decodeBijouSurfaceShader} refuses them.
 */
export function loadBijouSurfaceShader(port: ShaderSourcePort): BijouSurfaceShaderLayout {
  const wgsl = requireShaderText(port, SURFACE_WGSL_NAME, 'webgpu');
  const manifestText = requireShaderText(port, BIJOU_SHADER_MANIFEST_FILE, 'webgpu');
  let manifest: JsonValue;
  try {
    manifest = parseJsonValue(manifestText);
  } catch (error) {
    return shaderFault(`shader manifest from ${port.description} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return decodeBijouSurfaceShader({ wgsl, manifest });
}

/**
 * Read the binding map and uniform layout of `bijou-surface` from the
 * implementation manifest, and check that `wgsl` is the exact assembled text
 * the manifest pins.
 *
 * @throws RendererFaultError when the manifest is malformed or the text does
 *   not hash to the manifest's `assembledWgslSha256`.
 */
export function decodeBijouSurfaceShader(source: BijouSurfaceShaderSource): BijouSurfaceShaderLayout {
  const manifest = manifestObject(source.manifest, '$');
  const shaders = manifest.shaders;
  if (!isJsonArray(shaders)) {
    return shaderFault('shader manifest $.shaders is not an array');
  }
  const entry = shaders.find((item) => isJsonObject(item) && item.id === SURFACE_SHADER_ID);
  const shader = manifestObject(entry, `shaders[id=${SURFACE_SHADER_ID}]`);
  const assembled = shader.assembledWgslSha256;
  if (typeof assembled !== 'string') {
    return shaderFault('shader manifest has no assembledWgslSha256 for bijou-surface');
  }
  const actual = sha256Hex(utf8Bytes(source.wgsl));
  if (actual !== assembled) {
    return shaderFault(
      `${SURFACE_WGSL_NAME} text hashes to ${actual}, but the manifest pins ${assembled}; load the file verbatim`,
    );
  }
  const bindings = shader.bindings;
  if (!isJsonArray(bindings)) {
    return shaderFault('shader manifest bijou-surface.bindings is not an array');
  }
  const bindingOf = (wgslName: string): JsonObject =>
    manifestObject(
      bindings.find((item) => isJsonObject(item) && item.wgslName === wgslName),
      `bijou-surface.bindings[wgslName=${wgslName}]`,
    );
  const uniforms = bindingOf('surface');
  const cells = bindingOf('cells');
  const atlas = bindingOf('glyph_atlas');
  const group = manifestInteger(uniforms.group, 'surface.group');
  for (const [name, binding] of [
    ['cells', cells],
    ['glyph_atlas', atlas],
  ] as const) {
    if (manifestInteger(binding.group, `${name}.group`) !== group) {
      shaderFault(`shader manifest binds ${name} outside group ${String(group)}`);
    }
  }
  if (cells.textureFormat !== 'rgba32uint' || atlas.textureFormat !== 'rgba8uint') {
    shaderFault('shader manifest texture formats are not rgba32uint cells and an rgba8uint atlas');
  }
  const members = uniforms.members;
  if (!isJsonArray(members)) {
    return shaderFault('shader manifest surface.members is not an array');
  }
  const uniformByteSize = manifestInteger(uniforms.byteSize, 'surface.byteSize');
  const offsets: Partial<Record<UniformMember, number>> = {};
  for (const name of UNIFORM_MEMBERS) {
    const member = manifestObject(
      members.find((item) => isJsonObject(item) && item.name === name),
      `surface.members[name=${name}]`,
    );
    const offset = manifestInteger(member.byteOffset, `surface.members.${name}.byteOffset`);
    if (offset % 4 !== 0 || offset + 4 > uniformByteSize) {
      shaderFault(`shader manifest places uniform ${name} at an invalid offset ${String(offset)}`);
    }
    offsets[name] = offset;
  }
  return {
    wgsl: source.wgsl,
    assembledWgslSha256: assembled,
    group,
    uniformBinding: manifestInteger(uniforms.binding, 'surface.binding'),
    cellsBinding: manifestInteger(cells.binding, 'cells.binding'),
    atlasBinding: manifestInteger(atlas.binding, 'glyph_atlas.binding'),
    uniformByteSize,
    uniformOffsets: offsets as Record<UniformMember, number>,
  };
}

/**
 * SHA-256 of every WGSL text the presenter executes, framed like the
 * manifest's `generatedGlslSha256`: for each file, its name, a line feed, the
 * decimal byte length, a line feed, and its bytes. The canonical shader comes
 * first, then {@link WEBGPU_DISPLAY_WGSL}.
 */
export function webGpuExecutedArtifactSha256(surfaceWgsl: string): string {
  const parts: Uint8Array[] = [];
  for (const [name, text] of [
    [SURFACE_WGSL_NAME, surfaceWgsl],
    [WEBGPU_DISPLAY_WGSL_NAME, WEBGPU_DISPLAY_WGSL],
  ] as const) {
    const bytes = utf8Bytes(text);
    parts.push(utf8Bytes(`${name}\n${String(bytes.length)}\n`), bytes);
  }
  const framed = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    framed.set(part, offset);
    offset += part.length;
  }
  return sha256Hex(framed);
}

/**
 * Smallest multiple of {@link WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT} that holds a
 * row of `rowBytes`, as `copyTextureToBuffer` requires.
 */
export function alignedBytesPerRow(rowBytes: number): number {
  return (
    Math.ceil(rowBytes / WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT) * WEBGPU_COPY_BYTES_PER_ROW_ALIGNMENT
  );
}

/**
 * Drop the `bytesPerRow` padding of a `copyTextureToBuffer` readback, giving
 * tight top-left row-major RGBA8 of exactly `width * height * 4` bytes.
 */
export function stripRowPadding(
  padded: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
): Uint8Array {
  const rowBytes = width * WEBGPU_RGBA8_TEXEL_BYTES;
  if (bytesPerRow < rowBytes || padded.length < bytesPerRow * Math.max(0, height - 1) + rowBytes) {
    shaderFault(
      `readback of ${String(padded.length)} bytes cannot hold ${String(height)} rows of ${String(rowBytes)} bytes at stride ${String(bytesPerRow)}`,
    );
  }
  const rgba = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    rgba.set(padded.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
  }
  return rgba;
}

/** One `queue.writeTexture` call: a texel rectangle and where its bytes start. */
export interface WebGpuTextureWrite {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  /** Byte offset into the source array. */
  readonly offset: number;
  readonly bytesPerRow: number;
}

/**
 * One write per dirty row span, straight out of the retained staging buffer:
 * the span's rows, full width, at the tight stride `widthCells * 16`.
 */
export function planCellRowUploads(
  spans: readonly DirtyRowSpan[],
  widthCells: number,
): WebGpuTextureWrite[] {
  const bytesPerRow = widthCells * WEBGPU_CELL_TEXEL_BYTES;
  if (widthCells === 0) {
    return [];
  }
  return spans.map((span) => ({
    originX: 0,
    originY: span.minRow,
    width: widthCells,
    height: span.maxRow - span.minRow + 1,
    offset: span.minRow * bytesPerRow,
    bytesPerRow,
  }));
}

/**
 * Writes that bring an atlas texture up to date: the whole bitmap when `full`,
 * otherwise one write per dirty rectangle, clipped to the bitmap.
 */
export function planAtlasUploads(
  bitmap: AtlasBitmap,
  rects: readonly GlyphAtlasDirtyRect[],
  full: boolean,
): WebGpuTextureWrite[] {
  const widthPx = bitmap.atlasCols * bitmap.cellPxW;
  const heightPx = bitmap.atlasRows * bitmap.cellPxH;
  const bytesPerRow = widthPx * WEBGPU_RGBA8_TEXEL_BYTES;
  if (widthPx === 0 || heightPx === 0) {
    return [];
  }
  if (full) {
    return [{ originX: 0, originY: 0, width: widthPx, height: heightPx, offset: 0, bytesPerRow }];
  }
  const writes: WebGpuTextureWrite[] = [];
  for (const rect of rects) {
    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const width = Math.min(widthPx, rect.x + rect.width) - x;
    const height = Math.min(heightPx, rect.y + rect.height) - y;
    if (width > 0 && height > 0) {
      writes.push({
        originX: x,
        originY: y,
        width,
        height,
        offset: (y * widthPx + x) * WEBGPU_RGBA8_TEXEL_BYTES,
        bytesPerRow,
      });
    }
  }
  return writes;
}

/**
 * The canvas format of the display pass: the browser's preferred format when it
 * is `bgra8unorm` or `rgba8unorm`.
 *
 * @throws RendererFaultError for any other format, `-srgb` ones included: an
 *   sRGB swapchain would gamma-encode bytes that are already sRGB.
 */
export function selectWebGpuCanvasFormat(preferred: string): WebGpuDisplayFormat {
  const format = WEBGPU_DISPLAY_FORMATS.find((candidate) => candidate === preferred);
  if (format === undefined) {
    return shaderFault(
      `canvas format ${preferred} is not one of ${WEBGPU_DISPLAY_FORMATS.join(', ')}; an -srgb swapchain would double-encode sRGB-direct bytes`,
    );
  }
  return format;
}

const SOFTWARE_ADAPTER_PATTERN = /swiftshader|llvmpipe|lavapipe|softpipe|software|warp|basic render/iu;

/** Receipt identity of an adapter and the evidence level its readbacks earn. */
export interface WebGpuAdapterClass {
  readonly adapter: EndpointReceiptAdapter;
  readonly evidenceLevel: 'gpu-probed' | 'software-probed';
}

/**
 * Name an adapter for receipts and decide its evidence level.
 *
 * Readback from an adapter is `gpu-probed` only when the adapter names itself
 * and is neither a fallback adapter nor a known software rasterizer.
 * Everything else, an unnamed adapter included, is `software-probed`.
 */
export function classifyWebGpuAdapter(adapter: WebGpuAdapter): WebGpuAdapterClass {
  const info = adapter.info;
  const fields = [info.vendor, info.architecture, info.device, info.description].filter(
    (field) => field.length > 0,
  );
  const named = fields.length > 0;
  const fallback = info.isFallbackAdapter === true || adapter.isFallbackAdapter === true;
  const software = fallback || !named || SOFTWARE_ADAPTER_PATTERN.test(fields.join(' '));
  return {
    adapter: {
      backend: 'webgpu',
      name: named ? fields.join(' ') : 'unnamed WebGPU adapter',
      driver: fallback ? 'fallback adapter' : '',
    },
    evidenceLevel: software ? 'software-probed' : 'gpu-probed',
  };
}

/** Options of {@link createWebGPUSurfacePresenterCore}. */
export interface WebGpuSurfacePresenterCoreOptions {
  /**
   * Where `bijou-surface.wgsl` and the shader manifest come from. The WGSL is
   * refused unless it hashes to the manifest's `assembledWgslSha256`.
   */
  readonly shaderSource: ShaderSourcePort;
  /**
   * The atlas to read. The presenter owns its dirty rectangles: it calls
   * `takeDirtyRects()` on every present.
   */
  readonly atlas: PresenterAtlasSource;
  /** Defaults to `globalThis.navigator.gpu`. */
  readonly gpu?: WebGpuGpu;
  /** Defaults to {@link REFERENCE_DEFAULT_FG}. */
  readonly defaultFg?: string;
  /** Defaults to {@link REFERENCE_DEFAULT_BG}. */
  readonly defaultBg?: string;
  /** Initial host size. Without it the canvas keeps its current pixel size. */
  readonly size?: GpuSurfaceResize;
  /** Client rectangle for {@link GpuSurfacePresenter.cellFromPoint}. Defaults to the canvas's. */
  readonly clientRect?: () => GpuClientRect;
  readonly powerPreference?: 'low-power' | 'high-performance';
}

/** The canvas the presenter draws to. */
export interface WebGpuPresenterCanvas extends WebGpuCanvas {
  getBoundingClientRect?(): GpuClientRect;
}

/** A read-back canonical frame and the probed receipt that describes it. */
export interface WebGpuFrameCapture {
  /** Tight top-left row-major RGBA8, `canvasPxW * canvasPxH * 4` bytes. */
  readonly rgba: Uint8Array;
  readonly receipt: EndpointReceipt;
  /** `bytesPerRow` of the `copyTextureToBuffer` that produced `rgba`. */
  readonly bytesPerRow: number;
}

export interface WebGpuCaptureOptions {
  /** Physical pixels to record as receipt probes. Defaults to the four corners. */
  readonly probes?: readonly (readonly [number, number])[];
  /**
   * Receipt `inputReceiptSha256`: the SHA-256 of the `packed-bijou-cells/1`
   * receipt the frame came from. Defaults to the SHA-256 of the presented
   * cell bytes, because a live surface has no receipt file.
   */
  readonly inputReceiptSha256?: string;
}

export type WebGpuPresenterStatus = 'ready' | 'recovering' | 'faulted' | 'disposed';

/** {@link GpuSurfacePresenter} plus the WebGPU-only readback and device state. */
export interface WebGpuSurfacePresenter extends GpuSurfacePresenter {
  readonly status: WebGpuPresenterStatus;
  /** Starts at 1 and increases by one on every device recovery. */
  readonly deviceGeneration: number;
  readonly canvasFormat: WebGpuDisplayFormat;
  readonly adapterClass: WebGpuAdapterClass;
  /**
   * Read the canonical `rgba8uint` frame of the last present back through
   * `copyTextureToBuffer`, strip the row padding, hash it, and record a
   * `gpu-probed` or `software-probed` receipt as the last receipt.
   */
  captureFrame(options?: WebGpuCaptureOptions): Promise<WebGpuFrameCapture>;
  /**
   * Read back what the display pass wrote to the canvas, as tight RGBA8. Call
   * it in the same task as `present()`, before the browser takes the canvas
   * texture. It exists to verify the display pass adds no gamma curve.
   */
  captureDisplay(): Promise<Uint8Array>;
  /** Resolves once no device recovery is in progress. */
  restored(): Promise<void>;
}

interface DeviceResources {
  readonly device: WebGpuDevice;
  readonly surfacePipeline: WebGpuRenderPipeline;
  readonly displayPipeline: WebGpuRenderPipeline;
  readonly surfaceLayout: WebGpuBindGroupLayout;
  readonly displayLayout: WebGpuBindGroupLayout;
  readonly uniforms: WebGpuBuffer;
  cells: WebGpuTexture | null;
  atlas: WebGpuTexture | null;
  target: WebGpuTexture | null;
  surfaceBindGroup: WebGpuBindGroup | null;
  displayBindGroup: WebGpuBindGroup | null;
  /** Atlas bitmap and generation last uploaded in full. */
  atlasBitmap: AtlasBitmap | null;
  atlasGeneration: number;
}

interface PresentedFrame {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly cells: Uint8Array;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly dpr: number;
  readonly cellPxW: number;
  readonly cellPxH: number;
}

const ERROR_FILTERS = ['validation', 'out-of-memory', 'internal'] as const;

function pushErrorScopes(device: WebGpuDevice): void {
  for (const filter of ERROR_FILTERS) {
    device.pushErrorScope(filter);
  }
}

/**
 * Pop the scopes {@link pushErrorScopes} pushed. Every pop is issued before
 * the first one resolves: the scope stack belongs to the whole device, so a
 * pop issued later could take a scope that other work pushed meanwhile.
 */
async function popErrorScopes(device: WebGpuDevice): Promise<string | null> {
  // An async callback runs synchronously up to its first await, so all the
  // pops are issued inside map().
  const pops = ERROR_FILTERS.map(async () => {
    const pending = device.popErrorScope();
    try {
      return (await pending)?.message ?? null;
    } catch (rejection) {
      return `popErrorScope rejected: ${String(rejection)}`;
    }
  });
  const messages = (await Promise.all(pops)).filter((message) => message !== null);
  return messages.length === 0 ? null : messages.join('; ');
}

function defaultGpu(): WebGpuGpu | undefined {
  const host = globalThis as { readonly navigator?: { readonly gpu?: WebGpuGpu } };
  return host.navigator?.gpu;
}

async function requestDevice(
  gpu: WebGpuGpu,
  powerPreference: WebGpuSurfacePresenterCoreOptions['powerPreference'],
): Promise<{ adapter: WebGpuAdapter; device: WebGpuDevice }> {
  let adapter: WebGpuAdapter | null;
  try {
    adapter = await gpu.requestAdapter(powerPreference === undefined ? undefined : { powerPreference });
  } catch (error) {
    throw new BackendUnavailableError('webgpu', `requestAdapter() rejected: ${String(error)}`);
  }
  if (adapter === null) {
    throw new BackendUnavailableError('webgpu', 'requestAdapter() returned no adapter');
  }
  try {
    return { adapter, device: await adapter.requestDevice() };
  } catch (error) {
    throw new BackendUnavailableError('webgpu', `requestDevice() rejected: ${String(error)}`);
  }
}

async function compiledModule(
  device: WebGpuDevice,
  label: string,
  code: string,
): Promise<WebGpuShaderModule> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((message) => message.type === 'error');
  if (errors.length > 0) {
    shaderFault(`${label} failed to compile: ${errors.map((message) => message.message).join('; ')}`);
  }
  return module;
}

async function createDeviceResources(
  device: WebGpuDevice,
  layout: BijouSurfaceShaderLayout,
  format: WebGpuDisplayFormat,
): Promise<DeviceResources> {
  pushErrorScopes(device);
  let resources: DeviceResources;
  try {
    const surfaceModule = await compiledModule(device, SURFACE_WGSL_NAME, layout.wgsl);
    const displayModule = await compiledModule(device, WEBGPU_DISPLAY_WGSL_NAME, WEBGPU_DISPLAY_WGSL);
    const uintTexture = { sampleType: 'uint', viewDimension: '2d' } as const;
    const surfaceLayout = device.createBindGroupLayout({
      label: 'bijou-surface bindings',
      entries: [
        { binding: layout.uniformBinding, visibility: WEBGPU_SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
        { binding: layout.cellsBinding, visibility: WEBGPU_SHADER_STAGE_FRAGMENT, texture: uintTexture },
        { binding: layout.atlasBinding, visibility: WEBGPU_SHADER_STAGE_FRAGMENT, texture: uintTexture },
      ],
    });
    const displayLayout = device.createBindGroupLayout({
      label: 'display bindings',
      entries: [{ binding: 0, visibility: WEBGPU_SHADER_STAGE_FRAGMENT, texture: uintTexture }],
    });
    const surfaceLayouts: WebGpuBindGroupLayout[] = [];
    surfaceLayouts[layout.group] = surfaceLayout;
    if (layout.group !== 0) {
      shaderFault(`the presenter binds one group, but the manifest uses group ${String(layout.group)}`);
    }
    const [surfacePipeline, displayPipeline] = await Promise.all([
      device.createRenderPipelineAsync({
        label: 'bijou-surface canonical pass',
        layout: device.createPipelineLayout({ label: 'bijou-surface', bindGroupLayouts: surfaceLayouts }),
        vertex: { module: surfaceModule, entryPoint: 'vs_main' },
        fragment: { module: surfaceModule, entryPoint: 'fs_main', targets: [{ format: 'rgba8uint' }] },
        primitive: { topology: 'triangle-list' },
      }),
      device.createRenderPipelineAsync({
        label: 'display pass',
        layout: device.createPipelineLayout({ label: 'display', bindGroupLayouts: [displayLayout] }),
        vertex: { module: displayModule, entryPoint: 'vs_display' },
        fragment: { module: displayModule, entryPoint: 'fs_display', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      }),
    ]);
    resources = {
      device,
      surfacePipeline,
      displayPipeline,
      surfaceLayout,
      displayLayout,
      uniforms: device.createBuffer({
        label: 'bijou-surface uniforms',
        size: layout.uniformByteSize,
        usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
      }),
      cells: null,
      atlas: null,
      target: null,
      surfaceBindGroup: null,
      displayBindGroup: null,
      atlasBitmap: null,
      atlasGeneration: -1,
    };
  } catch (error) {
    await popErrorScopes(device);
    if (error instanceof RendererFaultError) {
      throw error;
    }
    throw new RendererFaultError('webgpu', `pipeline creation failed: ${String(error)}`);
  }
  const scoped = await popErrorScopes(device);
  if (scoped !== null) {
    throw new RendererFaultError('webgpu', `pipeline creation failed: ${scoped}`);
  }
  return resources;
}

class WebGpuPresenter implements WebGpuSurfacePresenter {
  public status: WebGpuPresenterStatus = 'ready';
  public deviceGeneration = 1;
  public adapterClass: WebGpuAdapterClass;

  private resources: DeviceResources;
  private readonly damage: SurfaceDamageState = createSurfaceDamageState();
  private canvasPx: PresenterCanvasPx;
  private dpr: number;
  private readonly defaultFg: readonly [number, number, number];
  private readonly defaultBg: readonly [number, number, number];
  private readonly executedArtifactSha256: string;
  private frame: PresentedFrame | null = null;
  /** The last frame's cells are on the GPU and drawn at the current canvas size. */
  private drawn = false;
  private receipt: EndpointReceipt | null = null;
  private forceNextFullRefresh = false;
  private uploadEverything = false;
  private fault: Error | null = null;
  private recovery: Promise<void> | null = null;

  constructor(
    private readonly canvas: WebGpuPresenterCanvas,
    private readonly context: WebGpuCanvasContext,
    private readonly gpu: WebGpuGpu,
    public readonly canvasFormat: WebGpuDisplayFormat,
    private readonly layout: BijouSurfaceShaderLayout,
    private readonly options: WebGpuSurfacePresenterCoreOptions,
    adapter: WebGpuAdapter,
    resources: DeviceResources,
    canvasPx: PresenterCanvasPx,
    dpr: number,
  ) {
    this.adapterClass = classifyWebGpuAdapter(adapter);
    this.resources = resources;
    this.canvasPx = canvasPx;
    this.dpr = dpr;
    this.defaultFg = parseHexColor(options.defaultFg ?? REFERENCE_DEFAULT_FG, 'options.defaultFg');
    this.defaultBg = parseHexColor(options.defaultBg ?? REFERENCE_DEFAULT_BG, 'options.defaultBg');
    this.executedArtifactSha256 = webGpuExecutedArtifactSha256(layout.wgsl);
    this.configureCanvas();
    this.watchDevice(resources.device);
  }

  present(current: GpuPackedSurface, target: GpuPackedSurface, ctx: GpuPresentContext): void {
    this.assertUsable();
    const bitmap = this.options.atlas.bitmap;
    assertCellMetrics(bitmap.cellPxW, bitmap.cellPxH, 'atlas.bitmap');
    if (
      target.width * bitmap.cellPxW > this.canvasPx.canvasPxW ||
      target.height * bitmap.cellPxH > this.canvasPx.canvasPxH
    ) {
      throw new BijouGpuValidationError(
        'GEORDI_E_BIJOU_INVALID_SURFACE',
        'target',
        `a ${String(target.width)}x${String(target.height)} grid of ${String(bitmap.cellPxW)}x${String(bitmap.cellPxH)} px cells does not fit the ${String(this.canvasPx.canvasPxW)}x${String(this.canvasPx.canvasPxH)} canvas`,
      );
    }
    const previous = this.frame;
    const metricsChanged =
      previous !== null && (previous.cellPxW !== bitmap.cellPxW || previous.cellPxH !== bitmap.cellPxH);
    const result = packSurfaceDamage(this.damage, current, target, {
      resolveSlot: this.options.atlas.resolveSlot,
      atlasGeneration: this.options.atlas.atlasGeneration,
      forceFullRefresh: ctx.forceFullRefresh === true || this.forceNextFullRefresh || metricsChanged,
    });
    this.forceNextFullRefresh = false;
    this.frame = {
      widthCells: result.widthCells,
      heightCells: result.heightCells,
      cells: target.buffer.slice(),
      canvasPxW: this.canvasPx.canvasPxW,
      canvasPxH: this.canvasPx.canvasPxH,
      dpr: this.dpr,
      cellPxW: bitmap.cellPxW,
      cellPxH: bitmap.cellPxH,
    };
    this.receipt = null;
    this.drawn = false;
    if (this.status !== 'ready') {
      // The device is being recovered; the retained staging buffer is
      // uploaded in full once it is back.
      this.uploadEverything = true;
      return;
    }
    const spans = this.uploadEverything || result.fullRefresh
      ? fullSpan(result.heightCells)
      : result.dirtyRowSpans;
    this.uploadAndDraw(spans);
  }

  resize(size: GpuSurfaceResize): void {
    this.assertUsable();
    const canvasPx = resolvePresenterCanvasPx(size);
    const dprChanged = size.dpr !== this.dpr;
    const sizeChanged =
      canvasPx.canvasPxW !== this.canvasPx.canvasPxW || canvasPx.canvasPxH !== this.canvasPx.canvasPxH;
    this.dpr = size.dpr;
    if (dprChanged) {
      this.forceNextFullRefresh = true;
    }
    if (!sizeChanged) {
      return;
    }
    this.canvasPx = canvasPx;
    this.canvas.width = canvasPx.canvasPxW;
    this.canvas.height = canvasPx.canvasPxH;
    this.drawn = false;
    const frame = this.frame;
    if (
      this.status === 'ready' &&
      frame !== null &&
      frame.widthCells * frame.cellPxW <= canvasPx.canvasPxW &&
      frame.heightCells * frame.cellPxH <= canvasPx.canvasPxH
    ) {
      // Resizing clears the canvas. The cells are still on the GPU, so the
      // last frame is redrawn at the new size without repacking.
      this.frame = { ...frame, canvasPxW: canvasPx.canvasPxW, canvasPxH: canvasPx.canvasPxH, dpr: this.dpr };
      this.receipt = null;
      this.uploadAndDraw([]);
    }
  }

  cellFromPoint(clientX: number, clientY: number): GpuCellPoint | null {
    const rect = this.options.clientRect?.() ?? this.canvas.getBoundingClientRect?.();
    if (rect === undefined) {
      return null;
    }
    const bitmap = this.options.atlas.bitmap;
    return cellFromPoint(
      presenterGridGeometry(this.canvasPx, bitmap.cellPxW, bitmap.cellPxH),
      rect,
      clientX,
      clientY,
    );
  }

  getLastReceipt(): EndpointReceipt | null {
    if (this.frame === null) {
      return null;
    }
    this.receipt ??= this.buildReceipt(this.frame, 'unit-upload', null, [], undefined);
    return this.receipt;
  }

  async captureFrame(options: WebGpuCaptureOptions = {}): Promise<WebGpuFrameCapture> {
    await this.restored();
    this.assertUsable();
    const frame = this.frame;
    if (frame === null || !this.drawn || this.resources.target === null) {
      return shaderFault('captureFrame() needs a frame presented and drawn at the current canvas size');
    }
    const { device } = this.resources;
    const bytesPerRow = alignedBytesPerRow(frame.canvasPxW * WEBGPU_RGBA8_TEXEL_BYTES);
    const padded = await readTexture(device, this.resources.target, frame.canvasPxW, frame.canvasPxH, bytesPerRow);
    const rgba = stripRowPadding(padded, frame.canvasPxW, frame.canvasPxH, bytesPerRow);
    const translucent = rgba.findIndex((value, index) => index % 4 === 3 && value !== 255);
    if (translucent >= 0) {
      const pixel = (translucent - 3) / 4;
      return shaderFault(
        `readback pixel (${String(pixel % frame.canvasPxW)}, ${String(Math.floor(pixel / frame.canvasPxW))}) has alpha ${String(rgba[translucent])}; the canonical frame is opaque`,
      );
    }
    const points = options.probes ?? [
      [0, 0],
      [frame.canvasPxW - 1, 0],
      [0, frame.canvasPxH - 1],
      [frame.canvasPxW - 1, frame.canvasPxH - 1],
    ];
    const probes: EndpointReceiptProbe[] = points.map(([px, py]) => {
      const offset = (py * frame.canvasPxW + px) * WEBGPU_RGBA8_TEXEL_BYTES;
      return {
        px,
        py,
        rgba: [rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0, rgba[offset + 3] ?? 0],
      };
    });
    const receipt = this.buildReceipt(
      frame,
      this.adapterClass.evidenceLevel,
      sha256Hex(rgba),
      probes,
      options.inputReceiptSha256,
    );
    if (this.frame === frame) {
      this.receipt = receipt;
    }
    return { rgba, receipt, bytesPerRow };
  }

  async captureDisplay(): Promise<Uint8Array> {
    this.assertUsable();
    if (this.status !== 'ready' || !this.drawn) {
      return shaderFault('captureDisplay() needs a frame drawn in the current task');
    }
    const texture = this.context.getCurrentTexture();
    const bytesPerRow = alignedBytesPerRow(texture.width * WEBGPU_RGBA8_TEXEL_BYTES);
    const padded = await readTexture(this.resources.device, texture, texture.width, texture.height, bytesPerRow);
    const rgba = stripRowPadding(padded, texture.width, texture.height, bytesPerRow);
    if (texture.format === 'bgra8unorm') {
      for (let offset = 0; offset < rgba.length; offset += 4) {
        const blue = rgba[offset] ?? 0;
        rgba[offset] = rgba[offset + 2] ?? 0;
        rgba[offset + 2] = blue;
      }
    }
    return rgba;
  }

  async restored(): Promise<void> {
    while (this.recovery !== null) {
      await this.recovery;
    }
  }

  dispose(): void {
    if (this.status === 'disposed') {
      return;
    }
    this.status = 'disposed';
    destroyTextures(this.resources);
    this.resources.uniforms.destroy();
    this.context.unconfigure();
    this.resources.device.destroy();
    this.frame = null;
    this.receipt = null;
  }

  private assertUsable(): void {
    if (this.status === 'disposed') {
      shaderFault('the presenter has been disposed');
    }
    if (this.fault !== null) {
      throw this.fault;
    }
  }

  private configureCanvas(): void {
    this.canvas.width = this.canvasPx.canvasPxW;
    this.canvas.height = this.canvasPx.canvasPxH;
    this.context.configure({
      device: this.resources.device,
      format: this.canvasFormat,
      alphaMode: 'opaque',
      usage: WEBGPU_TEXTURE_USAGE.RENDER_ATTACHMENT | WEBGPU_TEXTURE_USAGE.COPY_SRC,
    });
  }

  private watchDevice(device: WebGpuDevice): void {
    void device.lost.then((info) => {
      this.onDeviceLost(device, info);
    });
  }

  private onDeviceLost(device: WebGpuDevice, info: WebGpuDeviceLostInfo): void {
    if (this.status === 'disposed' || device !== this.resources.device) {
      return;
    }
    this.status = 'recovering';
    this.drawn = false;
    this.recovery = this.recover(info).finally(() => {
      this.recovery = null;
    });
  }

  private async recover(info: WebGpuDeviceLostInfo): Promise<void> {
    try {
      const { adapter, device } = await requestDevice(this.gpu, this.options.powerPreference);
      const resources = await createDeviceResources(device, this.layout, this.canvasFormat);
      if (this.status === 'disposed') {
        device.destroy();
        return;
      }
      this.resources = resources;
      this.adapterClass = classifyWebGpuAdapter(adapter);
      this.deviceGeneration += 1;
      this.configureCanvas();
      this.watchDevice(device);
      this.status = 'ready';
      // The ABI's device-restoration trigger: the next pack rebuilds the grid.
      this.forceNextFullRefresh = true;
      if (this.frame !== null && this.damage.pendingFullRefresh !== 'recovery') {
        this.receipt = null;
        this.uploadAndDraw(fullSpan(this.frame.heightCells));
      }
    } catch (error) {
      if (this.status === 'disposed') {
        return;
      }
      this.status = 'faulted';
      this.fault =
        error instanceof BackendUnavailableError || error instanceof RendererFaultError
          ? error
          : new RendererFaultError('webgpu', `device recovery after loss (${info.reason}) failed: ${String(error)}`);
    }
  }

  private uploadAndDraw(cellSpans: readonly DirtyRowSpan[]): void {
    const frame = this.frame;
    if (frame === null) {
      return;
    }
    const resources = this.resources;
    const { device } = resources;
    pushErrorScopes(device);
    let spans = cellSpans;
    const cellsResized = this.ensureCells(resources, frame.widthCells, frame.heightCells);
    const atlasFull = this.ensureAtlas(resources) || this.uploadEverything;
    if (cellsResized || this.uploadEverything) {
      spans = fullSpan(frame.heightCells);
    }
    this.uploadEverything = false;
    const targetResized = this.ensureTarget(resources, frame.canvasPxW, frame.canvasPxH);
    if (cellsResized || targetResized || atlasFull || resources.surfaceBindGroup === null) {
      this.bindGroups(resources);
    }
    const staging = this.damage.staging;
    for (const write of planCellRowUploads(spans, frame.widthCells)) {
      device.queue.writeTexture(
        { texture: requireTexture(resources.cells), origin: [write.originX, write.originY] },
        staging,
        { offset: write.offset, bytesPerRow: write.bytesPerRow, rowsPerImage: write.height },
        [write.width, write.height],
      );
    }
    const atlas = this.options.atlas;
    const rects = atlas.takeDirtyRects();
    for (const write of planAtlasUploads(atlas.bitmap, rects, atlasFull)) {
      device.queue.writeTexture(
        { texture: requireTexture(resources.atlas), origin: [write.originX, write.originY] },
        atlas.bitmap.rgba,
        { offset: write.offset, bytesPerRow: write.bytesPerRow, rowsPerImage: write.height },
        [write.width, write.height],
      );
    }
    device.queue.writeBuffer(resources.uniforms, 0, this.uniformWords(frame));
    const encoder = device.createCommandEncoder();
    const canonical = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: requireTexture(resources.target).createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
    });
    canonical.setPipeline(resources.surfacePipeline);
    canonical.setBindGroup(this.layout.group, requireBindGroup(resources.surfaceBindGroup));
    canonical.draw(3);
    canonical.end();
    const display = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    display.setPipeline(resources.displayPipeline);
    display.setBindGroup(0, requireBindGroup(resources.displayBindGroup));
    display.draw(3);
    display.end();
    device.queue.submit([encoder.finish()]);
    this.drawn = true;
    void popErrorScopes(device).then((message) => {
      if (message !== null && this.status !== 'disposed' && device === this.resources.device) {
        this.status = 'faulted';
        this.fault = new RendererFaultError('webgpu', `frame upload or draw failed: ${message}`);
      }
    });
  }

  private ensureCells(resources: DeviceResources, widthCells: number, heightCells: number): boolean {
    // A texture edge must be at least 1; an empty grid draws only defaultBg.
    const width = Math.max(1, widthCells);
    const height = Math.max(1, heightCells);
    if (resources.cells?.width === width && resources.cells.height === height) {
      return false;
    }
    resources.cells?.destroy();
    resources.cells = resources.device.createTexture({
      label: 'bijou-surface cells',
      size: [width, height],
      format: 'rgba32uint',
      usage: WEBGPU_TEXTURE_USAGE.TEXTURE_BINDING | WEBGPU_TEXTURE_USAGE.COPY_DST,
    });
    return true;
  }

  private ensureAtlas(resources: DeviceResources): boolean {
    const atlas = this.options.atlas;
    const bitmap = atlas.bitmap;
    const generation = atlas.atlasGeneration();
    const width = Math.max(1, bitmap.atlasCols * bitmap.cellPxW);
    const height = Math.max(1, bitmap.atlasRows * bitmap.cellPxH);
    const sameTexture = resources.atlas?.width === width && resources.atlas.height === height;
    if (!sameTexture) {
      resources.atlas?.destroy();
      resources.atlas = resources.device.createTexture({
        label: 'bijou-surface glyph atlas',
        size: [width, height],
        format: 'rgba8uint',
        usage: WEBGPU_TEXTURE_USAGE.TEXTURE_BINDING | WEBGPU_TEXTURE_USAGE.COPY_DST,
      });
    }
    const full = !sameTexture || resources.atlasBitmap !== bitmap || resources.atlasGeneration !== generation;
    resources.atlasBitmap = bitmap;
    resources.atlasGeneration = generation;
    return full;
  }

  private ensureTarget(resources: DeviceResources, width: number, height: number): boolean {
    if (resources.target?.width === width && resources.target.height === height) {
      return false;
    }
    resources.target?.destroy();
    resources.target = resources.device.createTexture({
      label: 'bijou-surface canonical frame',
      size: [width, height],
      format: 'rgba8uint',
      usage: WEBGPU_TEXTURE_USAGE.RENDER_ATTACHMENT | WEBGPU_TEXTURE_USAGE.TEXTURE_BINDING | WEBGPU_TEXTURE_USAGE.COPY_SRC,
    });
    return true;
  }

  private bindGroups(resources: DeviceResources): void {
    resources.surfaceBindGroup = resources.device.createBindGroup({
      label: 'bijou-surface bindings',
      layout: resources.surfaceLayout,
      entries: [
        { binding: this.layout.uniformBinding, resource: { buffer: resources.uniforms } },
        { binding: this.layout.cellsBinding, resource: requireTexture(resources.cells).createView() },
        { binding: this.layout.atlasBinding, resource: requireTexture(resources.atlas).createView() },
      ],
    });
    resources.displayBindGroup = resources.device.createBindGroup({
      label: 'display bindings',
      layout: resources.displayLayout,
      entries: [{ binding: 0, resource: requireTexture(resources.target).createView() }],
    });
  }

  private uniformWords(frame: PresentedFrame): Uint32Array {
    const words = new Uint32Array(this.layout.uniformByteSize / 4);
    const offsets = this.layout.uniformOffsets;
    const put = (member: UniformMember, values: readonly number[]): void => {
      words.set(values, offsets[member] / 4);
    };
    put('canvasPx', [frame.canvasPxW, frame.canvasPxH]);
    put('cellPx', [frame.cellPxW, frame.cellPxH]);
    put('gridCells', [frame.widthCells, frame.heightCells]);
    put('atlasCols', [this.options.atlas.bitmap.atlasCols]);
    put('defaultFg', this.defaultFg);
    put('defaultBg', this.defaultBg);
    put('flags', [0]);
    return words;
  }

  private buildReceipt(
    frame: PresentedFrame,
    evidenceLevel: EndpointReceipt['evidenceLevel'],
    frameRgbaSha256: string | null,
    probes: readonly EndpointReceiptProbe[],
    inputReceiptSha256: string | undefined,
  ): EndpointReceipt {
    return assemblePresenterReceipt({
      inputReceiptSha256: inputReceiptSha256 ?? sha256Hex(frame.cells),
      preparedBufferSha256: sha256Hex(preparedBufferBytes(this.damage.staging)),
      assembledWgslSha256: this.layout.assembledWgslSha256,
      generatedGlslSha256: null,
      shaderSha256: this.layout.assembledWgslSha256,
      executedArtifactSha256: this.executedArtifactSha256,
      backendProfile: WEBGPU_BACKEND_PROFILE,
      adapter: this.adapterClass.adapter,
      evidenceLevel,
      widthCells: frame.widthCells,
      heightCells: frame.heightCells,
      canvasPxW: frame.canvasPxW,
      canvasPxH: frame.canvasPxH,
      dpr: frame.dpr,
      defaultFg: hexColor(this.defaultFg),
      defaultBg: hexColor(this.defaultBg),
      atlas: this.options.atlas.getReceiptAssets(),
      frameRgbaSha256,
      probes,
    });
  }
}

function fullSpan(heightCells: number): DirtyRowSpan[] {
  return heightCells === 0 ? [] : [{ minRow: 0, maxRow: heightCells - 1 }];
}

function hexColor(rgb: readonly number[]): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function requireTexture(texture: WebGpuTexture | null): WebGpuTexture {
  return texture ?? shaderFault('a texture was used before it was created');
}

function requireBindGroup(group: WebGpuBindGroup | null): WebGpuBindGroup {
  return group ?? shaderFault('a bind group was used before it was created');
}

function destroyTextures(resources: DeviceResources): void {
  resources.cells?.destroy();
  resources.atlas?.destroy();
  resources.target?.destroy();
  resources.cells = null;
  resources.atlas = null;
  resources.target = null;
}

async function readTexture(
  device: WebGpuDevice,
  texture: WebGpuTexture,
  width: number,
  height: number,
  bytesPerRow: number,
): Promise<Uint8Array> {
  pushErrorScopes(device);
  const buffer = device.createBuffer({
    label: 'bijou-surface readback',
    size: bytesPerRow * height,
    usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow, rowsPerImage: height }, [width, height]);
  device.queue.submit([encoder.finish()]);
  const scoped = await popErrorScopes(device);
  if (scoped !== null) {
    buffer.destroy();
    return shaderFault(`readback failed: ${scoped}`);
  }
  try {
    await buffer.mapAsync(WEBGPU_MAP_MODE_READ);
    return new Uint8Array(buffer.getMappedRange().slice(0));
  } catch (error) {
    return shaderFault(`readback mapping failed: ${String(error)}`);
  } finally {
    buffer.destroy();
  }
}

/**
 * The WebGPU presenter core: create a presenter on `canvas` with the WGSL and
 * manifest from `options.shaderSource`. `createWebGPUSurfacePresenter()` is
 * the same with the bundled adapter wired in by default.
 *
 * Capability is checked first: a missing `navigator.gpu`, no adapter, a
 * rejected `requestDevice()`, or a canvas without a `webgpu` context reject
 * with {@link BackendUnavailableError}. Once a device exists, a shader text
 * that does not match the manifest, a compile error, a pipeline error, or a
 * `-srgb` preferred format reject with {@link RendererFaultError}; they are
 * never reported as unavailability.
 */
export async function createWebGPUSurfacePresenterCore(
  canvas: WebGpuPresenterCanvas,
  options: WebGpuSurfacePresenterCoreOptions,
): Promise<WebGpuSurfacePresenter> {
  const gpu = options.gpu ?? defaultGpu();
  if (gpu === undefined) {
    throw new BackendUnavailableError('webgpu', 'navigator.gpu is undefined');
  }
  const { adapter, device } = await requestDevice(gpu, options.powerPreference);
  const context = canvas.getContext('webgpu');
  if (!isWebGpuCanvasContext(context)) {
    device.destroy();
    throw new BackendUnavailableError('webgpu', 'the canvas has no webgpu context');
  }
  try {
    const layout = loadBijouSurfaceShader(options.shaderSource);
    const format = selectWebGpuCanvasFormat(gpu.getPreferredCanvasFormat());
    const canvasPx = resolvePresenterCanvasPx(
      options.size ?? { cssWidth: canvas.width, cssHeight: canvas.height, dpr: 1 },
    );
    const resources = await createDeviceResources(device, layout, format);
    return new WebGpuPresenter(
      canvas,
      context,
      gpu,
      format,
      layout,
      options,
      adapter,
      resources,
      canvasPx,
      options.size?.dpr ?? 1,
    );
  } catch (error) {
    device.destroy();
    throw error;
  }
}

/** Inputs of {@link createWebGpuRefusalReceipt}. */
export interface WebGpuRefusalReceiptInput {
  /** The refusal being recorded. A renderer fault is not a refusal. */
  readonly error: BackendUnavailableError;
  /** The shader that would have run, read and checked like the presenter's. */
  readonly shaderSource: ShaderSourcePort;
  readonly atlas: PresenterAtlasSource;
  /** The surface that would have been presented. */
  readonly target: GpuPackedSurface;
  readonly size: GpuSurfaceResize;
  readonly defaultFg?: string;
  readonly defaultBg?: string;
  /** Defaults to the SHA-256 of the target's cell bytes. */
  readonly inputReceiptSha256?: string;
}

/**
 * The `capability-refused` receipt of a WebGPU refusal: what would have been
 * presented, which shader would have run, and no pixels. It witnesses the
 * refusal only and can never close a rendering claim.
 *
 * @throws RendererFaultError when `error` is not a `BackendUnavailableError`.
 */
export function createWebGpuRefusalReceipt(input: WebGpuRefusalReceiptInput): EndpointReceipt {
  if (!(input.error instanceof BackendUnavailableError)) {
    return shaderFault('only a BackendUnavailableError can be recorded as capability-refused');
  }
  const layout = loadBijouSurfaceShader(input.shaderSource);
  const canvasPx = resolvePresenterCanvasPx(input.size);
  const state = createSurfaceDamageState();
  const packed = packSurfaceDamage(state, input.target, input.target, {
    resolveSlot: input.atlas.resolveSlot,
    atlasGeneration: input.atlas.atlasGeneration,
  });
  return assemblePresenterReceipt({
    inputReceiptSha256: input.inputReceiptSha256 ?? sha256Hex(input.target.buffer),
    preparedBufferSha256: sha256Hex(preparedBufferBytes(packed.staging)),
    assembledWgslSha256: layout.assembledWgslSha256,
    generatedGlslSha256: null,
    shaderSha256: layout.assembledWgslSha256,
    executedArtifactSha256: webGpuExecutedArtifactSha256(layout.wgsl),
    backendProfile: WEBGPU_BACKEND_PROFILE,
    adapter: { backend: 'webgpu', name: '', driver: '' },
    evidenceLevel: 'capability-refused',
    widthCells: packed.widthCells,
    heightCells: packed.heightCells,
    canvasPxW: canvasPx.canvasPxW,
    canvasPxH: canvasPx.canvasPxH,
    dpr: input.size.dpr,
    defaultFg: hexColor(parseHexColor(input.defaultFg ?? REFERENCE_DEFAULT_FG, 'defaultFg')),
    defaultBg: hexColor(parseHexColor(input.defaultBg ?? REFERENCE_DEFAULT_BG, 'defaultBg')),
    atlas: input.atlas.getReceiptAssets(),
    frameRgbaSha256: null,
    probes: [],
  });
}
