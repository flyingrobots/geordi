/**
 * The slice of the WebGPU API the WebGPU presenter touches, described
 * structurally.
 *
 * The package compiles without DOM typings, so it cannot name `GPUDevice` and
 * friends. Every member here is a subset of the corresponding WebGPU interface,
 * so a browser's `navigator.gpu` satisfies {@link WebGpuGpu} directly, and a
 * test can inject a recording fake.
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
  mapAsync(mode: number): Promise<undefined>;
  getMappedRange(): ArrayBuffer;
  unmap(): undefined;
  destroy(): undefined;
}

export interface WebGpuTextureView {
  readonly label: string;
}

export interface WebGpuTexture {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  createView(): WebGpuTextureView;
  destroy(): undefined;
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

export interface WebGpuRenderPassEncoder {
  setPipeline(pipeline: WebGpuRenderPipeline): undefined;
  setBindGroup(index: number, bindGroup: WebGpuBindGroup): undefined;
  draw(vertexCount: number): undefined;
  end(): undefined;
}

export interface WebGpuTexelCopyBufferLayout {
  readonly offset?: number;
  readonly bytesPerRow?: number;
  readonly rowsPerImage?: number;
}

export interface WebGpuCommandEncoder {
  beginRenderPass(descriptor: {
    colorAttachments: {
      view: WebGpuTextureView;
      loadOp: 'clear' | 'load';
      storeOp: 'store' | 'discard';
      clearValue?: number[];
    }[];
  }): WebGpuRenderPassEncoder;
  copyTextureToBuffer(
    source: { texture: WebGpuTexture },
    destination: { buffer: WebGpuBuffer; bytesPerRow: number; rowsPerImage: number },
    copySize: number[],
  ): undefined;
  finish(): WebGpuCommandBuffer;
}

export interface WebGpuQueue {
  writeBuffer(buffer: WebGpuBuffer, bufferOffset: number, data: Uint32Array): undefined;
  writeTexture(
    destination: { texture: WebGpuTexture; origin?: number[] },
    data: Uint8Array | Uint32Array,
    dataLayout: WebGpuTexelCopyBufferLayout,
    size: number[],
  ): undefined;
  submit(commandBuffers: WebGpuCommandBuffer[]): undefined;
  onSubmittedWorkDone(): Promise<undefined>;
}

export interface WebGpuBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: { type: 'uniform' };
  texture?: { sampleType: 'uint'; viewDimension: '2d' };
}

export interface WebGpuBindGroupEntry {
  binding: number;
  resource: WebGpuTextureView | { buffer: WebGpuBuffer };
}

export interface WebGpuRenderPipelineDescriptor {
  label: string;
  layout: WebGpuPipelineLayout;
  vertex: { module: WebGpuShaderModule; entryPoint: string };
  fragment: { module: WebGpuShaderModule; entryPoint: string; targets: { format: string }[] };
  primitive: { topology: 'triangle-list' };
}

export interface WebGpuDevice {
  readonly limits: WebGpuSupportedLimits;
  readonly queue: WebGpuQueue;
  readonly lost: Promise<WebGpuDeviceLostInfo>;
  createBuffer(descriptor: { label: string; size: number; usage: number }): WebGpuBuffer;
  createTexture(descriptor: {
    label: string;
    size: number[];
    format: string;
    usage: number;
  }): WebGpuTexture;
  createShaderModule(descriptor: { label: string; code: string }): WebGpuShaderModule;
  createBindGroupLayout(descriptor: {
    label: string;
    entries: WebGpuBindGroupLayoutEntry[];
  }): WebGpuBindGroupLayout;
  createPipelineLayout(descriptor: {
    label: string;
    bindGroupLayouts: WebGpuBindGroupLayout[];
  }): WebGpuPipelineLayout;
  createRenderPipelineAsync(descriptor: WebGpuRenderPipelineDescriptor): Promise<WebGpuRenderPipeline>;
  createBindGroup(descriptor: {
    label: string;
    layout: WebGpuBindGroupLayout;
    entries: WebGpuBindGroupEntry[];
  }): WebGpuBindGroup;
  createCommandEncoder(): WebGpuCommandEncoder;
  pushErrorScope(filter: 'validation' | 'out-of-memory' | 'internal'): undefined;
  popErrorScope(): Promise<WebGpuError | null>;
  destroy(): undefined;
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

export interface WebGpuCanvasContext {
  configure(configuration: {
    device: WebGpuDevice;
    format: string;
    alphaMode: 'opaque';
    usage: number;
  }): undefined;
  unconfigure(): undefined;
  getCurrentTexture(): WebGpuTexture;
}

/** The slice of `HTMLCanvasElement` or `OffscreenCanvas` the presenter uses. */
export interface WebGpuCanvas {
  width: number;
  height: number;
  getContext(contextId: 'webgpu'): WebGpuCanvasContext | null;
}
