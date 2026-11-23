/**
 * The slice of the WebGPU API the WebGPU presenter touches, described
 * structurally.
 *
 * The package compiles without DOM typings, so it cannot name `GPUDevice` and
 * friends. Each object type here lists a subset of the members of its WebGPU
 * interface, and each parameter type accepts at least what WebGPU's does, so
 * a browser's `navigator.gpu` and `HTMLCanvasElement` satisfy these types
 * without a cast, and a test can inject a recording fake.
 */

/** `GPUBufferUsage` flags, as fixed by the WebGPU specification. */
export const WEBGPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
} as const;

/** `GPUTextureUsage` flags, as fixed by the WebGPU specification. */
export const WEBGPU_TEXTURE_USAGE = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  RENDER_ATTACHMENT: 0x10,
} as const;

/** `GPUShaderStage.FRAGMENT`. */
export const WEBGPU_SHADER_STAGE_FRAGMENT = 0x2;

/** `GPUMapMode.READ`. */
export const WEBGPU_MAP_MODE_READ = 0x1;

export interface WebGpuAdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
  /** Present in current browsers; older ones expose it on the adapter. */
  readonly isFallbackAdapter?: boolean;
}

export interface WebGpuDeviceLostInfo {
  readonly reason: string;
  readonly message: string;
}

export interface WebGpuError {
  readonly message: string;
}

export interface WebGpuSupportedLimits {
  readonly maxTextureDimension2D: number;
}

export interface WebGpuBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

export interface WebGpuTextureView {
  readonly label: string;
}

export interface WebGpuTexture {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  createView(): WebGpuTextureView;
  destroy(): void;
}

export interface WebGpuBindGroupLayout {
  readonly label: string;
}

export interface WebGpuPipelineLayout {
  readonly label: string;
}

export interface WebGpuBindGroup {
  readonly label: string;
}

export interface WebGpuShaderModule {
  getCompilationInfo(): Promise<{
    readonly messages: readonly { readonly type: string; readonly message: string }[];
  }>;
}

export interface WebGpuRenderPipeline {
  readonly label: string;
}

export interface WebGpuCommandBuffer {
  readonly label: string;
}

/** `GPUExtent3D`. The presenter always passes `[width, height]`. */
export type WebGpuExtent = number[] | { width: number; height?: number; depthOrArrayLayers?: number };

/** `GPUOrigin3D`. The presenter always passes `[x, y]`. */
export type WebGpuOrigin = number[] | { x?: number; y?: number; z?: number };

/** `AllowSharedBufferSource`. */
export type WebGpuBufferSource = ArrayBufferLike | ArrayBufferView;

export interface WebGpuTexelCopyBufferLayout {
  offset?: number;
  bytesPerRow?: number;
  rowsPerImage?: number;
}

export interface WebGpuTexelCopyTextureInfo {
  texture: WebGpuTexture;
  origin?: WebGpuOrigin;
  mipLevel?: number;
  aspect?: string;
}

export interface WebGpuRenderPassColorAttachment {
  view: WebGpuTexture | WebGpuTextureView;
  loadOp: string;
  storeOp: string;
  clearValue?: number[] | { r: number; g: number; b: number; a: number };
}

export interface WebGpuRenderPassEncoder {
  setPipeline(pipeline: WebGpuRenderPipeline): void;
  setBindGroup(index: number, bindGroup: WebGpuBindGroup | null): void;
  draw(vertexCount: number): void;
  end(): void;
}

export interface WebGpuCommandEncoder {
  beginRenderPass(descriptor: {
    label?: string;
    colorAttachments: (WebGpuRenderPassColorAttachment | null)[];
  }): WebGpuRenderPassEncoder;
  copyTextureToBuffer(
    source: WebGpuTexelCopyTextureInfo,
    destination: WebGpuTexelCopyBufferLayout & { buffer: WebGpuBuffer },
    copySize: WebGpuExtent,
  ): void;
  finish(): WebGpuCommandBuffer;
}

export interface WebGpuQueue {
  writeBuffer(buffer: WebGpuBuffer, bufferOffset: number, data: WebGpuBufferSource): void;
  writeTexture(
    destination: WebGpuTexelCopyTextureInfo,
    data: WebGpuBufferSource,
    dataLayout: WebGpuTexelCopyBufferLayout,
    size: WebGpuExtent,
  ): void;
  submit(commandBuffers: WebGpuCommandBuffer[]): void;
}

export interface WebGpuBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: { type?: string };
  texture?: { sampleType?: string; viewDimension?: string; multisampled?: boolean };
}

export interface WebGpuBindGroupEntry {
  binding: number;
  /** A texture view or `{ buffer }` here; WebGPU also accepts samplers and more. */
  resource: object;
}

export interface WebGpuProgrammableStage {
  module: WebGpuShaderModule;
  entryPoint?: string;
}

export interface WebGpuRenderPipelineDescriptor {
  label?: string;
  layout: WebGpuPipelineLayout | 'auto';
  vertex: WebGpuProgrammableStage;
  fragment?: WebGpuProgrammableStage & { targets: ({ format: string } | null)[] };
  primitive?: { topology?: string };
}

export interface WebGpuDevice {
  readonly limits: WebGpuSupportedLimits;
  readonly queue: WebGpuQueue;
  readonly lost: Promise<WebGpuDeviceLostInfo>;
  createBuffer(descriptor: { label?: string; size: number; usage: number }): WebGpuBuffer;
  createTexture(descriptor: {
    label?: string;
    size: WebGpuExtent;
    format: string;
    usage: number;
  }): WebGpuTexture;
  createShaderModule(descriptor: { label?: string; code: string }): WebGpuShaderModule;
  createBindGroupLayout(descriptor: {
    label?: string;
    entries: WebGpuBindGroupLayoutEntry[];
  }): WebGpuBindGroupLayout;
  createPipelineLayout(descriptor: {
    label?: string;
    bindGroupLayouts: (WebGpuBindGroupLayout | null)[];
  }): WebGpuPipelineLayout;
  createRenderPipelineAsync(descriptor: WebGpuRenderPipelineDescriptor): Promise<WebGpuRenderPipeline>;
  createBindGroup(descriptor: {
    label?: string;
    layout: WebGpuBindGroupLayout;
    entries: WebGpuBindGroupEntry[];
  }): WebGpuBindGroup;
  createCommandEncoder(): WebGpuCommandEncoder;
  pushErrorScope(filter: string): void;
  popErrorScope(): Promise<WebGpuError | null>;
  destroy(): void;
}

export interface WebGpuAdapter {
  readonly info: WebGpuAdapterInfo;
  readonly isFallbackAdapter?: boolean;
  requestDevice(): Promise<WebGpuDevice>;
}

export interface WebGpuGpu {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<WebGpuAdapter | null>;
  getPreferredCanvasFormat(): string;
}

export interface WebGpuCanvasConfiguration {
  device: WebGpuDevice;
  format: string;
  alphaMode?: string;
  usage?: number;
}

export interface WebGpuCanvasContext {
  configure(configuration: WebGpuCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): WebGpuTexture;
}

/**
 * The slice of `HTMLCanvasElement` or `OffscreenCanvas` the presenter uses.
 *
 * `getContext` returns a plain object because DOM typings declare it as an
 * overload set that no single structural signature matches; the presenter
 * checks the returned object for the context members it calls.
 */
export interface WebGpuCanvas {
  width: number;
  height: number;
  getContext(contextId: 'webgpu'): object | null;
}

/** Whether a `getContext('webgpu')` result has the members the presenter calls. */
export function isWebGpuCanvasContext(value: object | null): value is WebGpuCanvasContext {
  return (
    value !== null &&
    'configure' in value &&
    typeof value.configure === 'function' &&
    'unconfigure' in value &&
    typeof value.unconfigure === 'function' &&
    'getCurrentTexture' in value &&
    typeof value.getCurrentTexture === 'function'
  );
}
