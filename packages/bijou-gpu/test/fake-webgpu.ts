import type {
  WebGpuAdapter,
  WebGpuAdapterInfo,
  WebGpuBindGroup,
  WebGpuBindGroupEntry,
  WebGpuBindGroupLayout,
  WebGpuBindGroupLayoutEntry,
  WebGpuBuffer,
  WebGpuCanvasConfiguration,
  WebGpuCanvasContext,
  WebGpuCommandBuffer,
  WebGpuCommandEncoder,
  WebGpuDevice,
  WebGpuDeviceLostInfo,
  WebGpuError,
  WebGpuGpu,
  WebGpuPipelineLayout,
  WebGpuRenderPassEncoder,
  WebGpuRenderPipeline,
  WebGpuRenderPipelineDescriptor,
  WebGpuShaderModule,
  WebGpuBufferSource,
  WebGpuExtent,
  WebGpuOrigin,
  WebGpuTexelCopyBufferLayout,
  WebGpuTexelCopyTextureInfo,
  WebGpuTexture,
  WebGpuTextureView,
} from '../src/webgpu-types.js';
import type { WebGpuPresenterCanvas } from '../src/webgpu-presenter.js';
import type { GpuClientRect } from '../src/presenter.js';

/**
 * A recording, validating stand-in for the WebGPU API slice the presenter uses.
 *
 * Textures keep their bytes, so a test can compare what a write sequence left
 * on the "GPU" with the oracle's prepared cells. Every call that WebGPU would
 * reject with a validation error records one instead, routed to the innermost
 * matching error scope exactly as a device does.
 */

export class FakeWebGpuRejection extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

function bytesOf(data: WebGpuBufferSource): Uint8Array {
  return ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
}

const BYTES_PER_TEXEL: Readonly<Record<string, number>> = {
  rgba32uint: 16,
  rgba8uint: 4,
  bgra8unorm: 4,
  rgba8unorm: 4,
};

export const FAKE_MAX_TEXTURE_DIMENSION = 8192;

export class FakeTexture implements WebGpuTexture {
  public destroyed = false;
  public readonly bytes: Uint8Array;
  public readonly bytesPerTexel: number;

  constructor(
    public readonly label: string,
    public readonly width: number,
    public readonly height: number,
    public readonly format: string,
    public readonly usage: number,
  ) {
    this.bytesPerTexel = BYTES_PER_TEXEL[format] ?? 4;
    this.bytes = new Uint8Array(width * height * this.bytesPerTexel);
  }

  createView(): WebGpuTextureView {
    return { label: `view of ${this.label}`, texture: this } as WebGpuTextureView;
  }

  destroy(): undefined {
    this.destroyed = true;
    return undefined;
  }

  /** Fill with a pattern that depends on the texel position, as a rendered frame would. */
  fillPattern(): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const offset = (y * this.width + x) * this.bytesPerTexel;
        this.bytes.set([x & 0xff, y & 0xff, (x * 7 + y * 13) & 0xff, 255], offset);
      }
    }
  }
}

function textureOfView(view: WebGpuTexture | WebGpuTextureView): FakeTexture {
  return view instanceof FakeTexture ? view : (view as WebGpuTextureView & { texture: FakeTexture }).texture;
}

function extent2d(size: WebGpuExtent): [number, number] {
  if (Array.isArray(size)) {
    return [size[0] ?? 0, size[1] ?? 1];
  }
  return [size.width, size.height ?? 1];
}

function origin2d(origin: WebGpuOrigin | undefined): [number, number] {
  if (origin === undefined) {
    return [0, 0];
  }
  if (Array.isArray(origin)) {
    return [origin[0] ?? 0, origin[1] ?? 0];
  }
  return [origin.x ?? 0, origin.y ?? 0];
}

export class FakeBuffer implements WebGpuBuffer {
  public destroyed = false;
  public readonly bytes: Uint8Array;

  constructor(
    public readonly label: string,
    public readonly size: number,
    public readonly usage: number,
  ) {
    this.bytes = new Uint8Array(size);
  }

  mapAsync(_mode: number): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  getMappedRange(): ArrayBuffer {
    return this.bytes.slice().buffer;
  }

  unmap(): undefined {
    return undefined;
  }

  destroy(): undefined {
    this.destroyed = true;
    return undefined;
  }
}

export interface FakeTextureWrite {
  readonly texture: FakeTexture;
  readonly origin: readonly number[];
  readonly layout: WebGpuTexelCopyBufferLayout;
  readonly size: readonly number[];
  readonly dataByteLength: number;
}

export interface FakeTextureCopy {
  readonly texture: FakeTexture;
  readonly bytesPerRow: number;
  readonly rowsPerImage: number;
  readonly size: readonly number[];
}

interface ErrorScope {
  readonly filter: string;
  readonly errors: string[];
}

export interface FakeDeviceBehaviour {
  /** Shader labels whose compilation reports an error message. */
  readonly compileErrors?: readonly string[];
  /** Pipeline labels whose async creation rejects. */
  readonly pipelineRejections?: readonly string[];
  /** A validation error raised during the first pipeline creation. */
  readonly creationValidationError?: string;
  /**
   * Resolve `popErrorScope()` on a later macrotask, as a real GPU process
   * does. The scope is still popped when the call is made.
   */
  readonly asyncErrorScopes?: boolean;
}

export class FakeDevice implements WebGpuDevice {
  public readonly limits = { maxTextureDimension2D: FAKE_MAX_TEXTURE_DIMENSION };
  public readonly queue;
  public readonly lost: Promise<WebGpuDeviceLostInfo>;
  public readonly textures: FakeTexture[] = [];
  public readonly buffers: FakeBuffer[] = [];
  public readonly writes: FakeTextureWrite[] = [];
  public readonly copies: FakeTextureCopy[] = [];
  public readonly bindGroups: { label: string; entries: WebGpuBindGroupEntry[] }[] = [];
  public readonly bindGroupLayouts: { label: string; entries: WebGpuBindGroupLayoutEntry[] }[] = [];
  public readonly pipelines: WebGpuRenderPipelineDescriptor[] = [];
  /** Every `createShaderModule` call, in order: the label and the exact code. */
  public readonly shaderModules: { label: string; code: string }[] = [];
  public readonly uniformWrites: Uint32Array[] = [];
  public readonly draws: { pipeline: string; target: FakeTexture; vertexCount: number }[] = [];
  public readonly validationErrors: string[] = [];
  /** Every `pushErrorScope` (`push`) and `popErrorScope` (`pop`) call, in call order. */
  public readonly scopeLog: ('push' | 'pop')[] = [];
  public submits = 0;
  public destroyed = false;
  private readonly scopes: ErrorScope[] = [];
  private resolveLost: (info: WebGpuDeviceLostInfo) => void = () => undefined;

  constructor(
    public readonly id: number,
    private readonly behaviour: FakeDeviceBehaviour,
  ) {
    this.lost = new Promise((resolve) => {
      this.resolveLost = resolve;
    });
    const raise = (detail: string): void => {
      this.raise('validation', detail);
    };
    const live = (texture: FakeTexture, what: string): boolean => {
      if (texture.destroyed) {
        raise(`${what} uses destroyed texture ${texture.label}`);
        return false;
      }
      return true;
    };
    this.queue = {
      writeBuffer: (_buffer: WebGpuBuffer, _offset: number, data: WebGpuBufferSource): undefined => {
        this.uniformWrites.push(new Uint32Array(bytesOf(data).slice().buffer));
        return undefined;
      },
      writeTexture: (
        destination: WebGpuTexelCopyTextureInfo,
        data: WebGpuBufferSource,
        layout: WebGpuTexelCopyBufferLayout,
        size: WebGpuExtent,
      ): undefined => {
        const texture = destination.texture as FakeTexture;
        const [ox, oy] = origin2d(destination.origin);
        const [width, height] = extent2d(size);
        this.writes.push({
          texture,
          origin: [ox, oy],
          layout: { ...layout },
          size: [width, height],
          dataByteLength: data.byteLength,
        });
        if (!live(texture, 'writeTexture')) {
          return undefined;
        }
        const bpt = texture.bytesPerTexel;
        const rowBytes = width * bpt;
        const offset = layout.offset ?? 0;
        const bytesPerRow = layout.bytesPerRow ?? rowBytes;
        if (height > 1 && layout.bytesPerRow === undefined) {
          raise('writeTexture of several rows needs bytesPerRow');
          return undefined;
        }
        if (bytesPerRow < rowBytes) {
          raise(`writeTexture bytesPerRow ${String(bytesPerRow)} < row bytes ${String(rowBytes)}`);
          return undefined;
        }
        if ((layout.rowsPerImage ?? height) < height) {
          raise('writeTexture rowsPerImage < height');
          return undefined;
        }
        if (offset + bytesPerRow * (height - 1) + rowBytes > data.byteLength) {
          raise('writeTexture reads past the end of the data');
          return undefined;
        }
        if (ox + width > texture.width || oy + height > texture.height || ox < 0 || oy < 0) {
          raise(`writeTexture region exceeds ${texture.label}`);
          return undefined;
        }
        const source = bytesOf(data);
        for (let row = 0; row < height; row += 1) {
          texture.bytes.set(
            source.subarray(offset + row * bytesPerRow, offset + row * bytesPerRow + rowBytes),
            ((oy + row) * texture.width + ox) * bpt,
          );
        }
        return undefined;
      },
      submit: (_buffers: WebGpuCommandBuffer[]): undefined => {
        this.submits += 1;
        return undefined;
      },
      onSubmittedWorkDone: (): Promise<undefined> => Promise.resolve(undefined),
    };
  }

  raise(filter: string, detail: string): void {
    this.validationErrors.push(detail);
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.scopes.at(index);
      if (scope?.filter === filter) {
        scope.errors.push(detail);
        return;
      }
    }
  }

  lose(reason = 'unknown'): void {
    this.resolveLost({ reason, message: `fake device ${String(this.id)} lost` });
  }

  createBuffer(descriptor: { label?: string; size: number; usage: number }): WebGpuBuffer {
    const buffer = new FakeBuffer(descriptor.label ?? '', descriptor.size, descriptor.usage);
    this.buffers.push(buffer);
    return buffer;
  }

  createTexture(descriptor: { label?: string; size: WebGpuExtent; format: string; usage: number }): WebGpuTexture {
    const label = descriptor.label ?? '';
    const [width, height] = extent2d(descriptor.size);
    if (width < 1 || height < 1 || width > FAKE_MAX_TEXTURE_DIMENSION || height > FAKE_MAX_TEXTURE_DIMENSION) {
      this.raise('validation', `createTexture ${label} with size ${String(width)}x${String(height)}`);
    }
    const texture = new FakeTexture(
      label,
      Math.max(1, width),
      Math.max(1, height),
      descriptor.format,
      descriptor.usage,
    );
    this.textures.push(texture);
    return texture;
  }

  createShaderModule(descriptor: { label?: string; code: string }): WebGpuShaderModule {
    const label = descriptor.label ?? '';
    this.shaderModules.push({ label, code: descriptor.code });
    const failing = this.behaviour.compileErrors?.includes(label) === true;
    return {
      getCompilationInfo: () =>
        Promise.resolve({
          messages: failing ? [{ type: 'error', message: `fake compile error in ${label}` }] : [],
        }),
    };
  }

  createBindGroupLayout(descriptor: { label?: string; entries: WebGpuBindGroupLayoutEntry[] }): WebGpuBindGroupLayout {
    const label = descriptor.label ?? '';
    this.bindGroupLayouts.push({ label, entries: descriptor.entries });
    return { label };
  }

  createPipelineLayout(descriptor: {
    label?: string;
    bindGroupLayouts: (WebGpuBindGroupLayout | null)[];
  }): WebGpuPipelineLayout {
    return { label: descriptor.label ?? '' };
  }

  createRenderPipelineAsync(descriptor: WebGpuRenderPipelineDescriptor): Promise<WebGpuRenderPipeline> {
    this.pipelines.push(descriptor);
    if (this.behaviour.creationValidationError !== undefined && this.pipelines.length === 1) {
      this.raise('validation', this.behaviour.creationValidationError);
    }
    const label = descriptor.label ?? '';
    if (this.behaviour.pipelineRejections?.includes(label) === true) {
      return Promise.reject(new FakeWebGpuRejection(`fake GPUPipelineError for ${label}`));
    }
    return Promise.resolve({ label });
  }

  createBindGroup(descriptor: {
    label?: string;
    layout: WebGpuBindGroupLayout;
    entries: WebGpuBindGroupEntry[];
  }): WebGpuBindGroup {
    const label = descriptor.label ?? '';
    this.bindGroups.push({ label, entries: descriptor.entries });
    return { label };
  }

  createCommandEncoder(): WebGpuCommandEncoder {
    return {
      beginRenderPass: (descriptor): WebGpuRenderPassEncoder => {
        const attachment = descriptor.colorAttachments.at(0);
        const target = attachment === undefined || attachment === null ? null : textureOfView(attachment.view);
        let pipeline = '';
        return {
          setPipeline: (value: WebGpuRenderPipeline): undefined => {
            pipeline = value.label;
            return undefined;
          },
          setBindGroup: (): undefined => undefined,
          draw: (vertexCount: number): undefined => {
            if (target !== null) {
              this.draws.push({ pipeline, target, vertexCount });
              if (target.destroyed) {
                this.raise('validation', `draw into destroyed ${target.label}`);
              }
            }
            return undefined;
          },
          end: (): undefined => undefined,
        };
      },
      copyTextureToBuffer: (source, destination, copySize): undefined => {
        const texture = source.texture as FakeTexture;
        const buffer = destination.buffer as FakeBuffer;
        const [width, height] = extent2d(copySize);
        const bytesPerRow = destination.bytesPerRow ?? 0;
        this.copies.push({
          texture,
          bytesPerRow,
          rowsPerImage: destination.rowsPerImage ?? height,
          size: [width, height],
        });
        const rowBytes = width * texture.bytesPerTexel;
        if (bytesPerRow % 256 !== 0 || bytesPerRow === 0) {
          this.raise('validation', `copyTextureToBuffer bytesPerRow ${String(bytesPerRow)} is not a positive multiple of 256`);
          return undefined;
        }
        if (bytesPerRow < rowBytes || buffer.size < bytesPerRow * (height - 1) + rowBytes) {
          this.raise('validation', 'copyTextureToBuffer destination too small');
          return undefined;
        }
        if (width > texture.width || height > texture.height) {
          this.raise('validation', 'copyTextureToBuffer region exceeds the texture');
          return undefined;
        }
        buffer.bytes.fill(0xee);
        for (let row = 0; row < height; row += 1) {
          buffer.bytes.set(
            texture.bytes.subarray(row * texture.width * texture.bytesPerTexel, row * texture.width * texture.bytesPerTexel + rowBytes),
            row * bytesPerRow,
          );
        }
        return undefined;
      },
      finish: (): WebGpuCommandBuffer => ({ label: 'commands' }),
    };
  }

  pushErrorScope(filter: string): undefined {
    this.scopeLog.push('push');
    this.scopes.push({ filter, errors: [] });
    return undefined;
  }

  popErrorScope(): Promise<WebGpuError | null> {
    this.scopeLog.push('pop');
    const scope = this.scopes.pop();
    if (scope === undefined) {
      return Promise.reject(new FakeWebGpuRejection('popErrorScope with an empty stack'));
    }
    const first = scope.errors.at(0);
    const result = first === undefined ? null : { message: first };
    if (this.behaviour.asyncErrorScopes === true) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(result);
        }, 0);
      });
    }
    return Promise.resolve(result);
  }

  destroy(): undefined {
    if (!this.destroyed) {
      this.destroyed = true;
      this.lose('destroyed');
    }
    return undefined;
  }

  /** The texture with `label` created most recently. */
  texture(label: string): FakeTexture {
    const found = [...this.textures].reverse().find((texture) => texture.label === label);
    if (found === undefined) {
      throw new FakeWebGpuRejection(`no texture labelled ${label}`);
    }
    return found;
  }

  /** Texture writes made after `since` writes, to the most recent texture with `label`. */
  writesTo(label: string, since = 0): FakeTextureWrite[] {
    return this.writes.slice(since).filter((write) => write.texture.label === label);
  }
}

export interface FakeGpuOptions {
  readonly info?: Partial<WebGpuAdapterInfo>;
  readonly preferredFormat?: string;
  /** Adapter result per `requestAdapter()` call; the last entry repeats. */
  readonly adapters?: readonly ('ok' | 'null' | 'reject')[];
  readonly requestDeviceRejects?: boolean;
  readonly device?: FakeDeviceBehaviour;
}

export class FakeGpu implements WebGpuGpu {
  public readonly devices: FakeDevice[] = [];
  public adapterRequests = 0;
  private gate: Promise<void> | null = null;

  constructor(private readonly options: FakeGpuOptions = {}) {}

  /** Hold every later `requestAdapter()` until the returned function is called. */
  holdAdapterRequests(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }

  async requestAdapter(): Promise<WebGpuAdapter | null> {
    if (this.gate !== null) {
      await this.gate;
    }
    return this.adapterOutcome();
  }

  private adapterOutcome(): Promise<WebGpuAdapter | null> {
    const plan = this.options.adapters ?? ['ok'];
    const outcome = plan[Math.min(this.adapterRequests, plan.length - 1)] ?? 'ok';
    this.adapterRequests += 1;
    if (outcome === 'reject') {
      return Promise.reject(new FakeWebGpuRejection('fake requestAdapter failure'));
    }
    if (outcome === 'null') {
      return Promise.resolve(null);
    }
    const info: WebGpuAdapterInfo = {
      vendor: 'apple',
      architecture: 'metal-3',
      device: '',
      description: '',
      isFallbackAdapter: false,
      ...this.options.info,
    };
    return Promise.resolve({
      info,
      requestDevice: () => {
        if (this.options.requestDeviceRejects === true) {
          return Promise.reject(new FakeWebGpuRejection('fake requestDevice failure'));
        }
        const device = new FakeDevice(this.devices.length, this.options.device ?? {});
        this.devices.push(device);
        return Promise.resolve(device);
      },
    });
  }

  getPreferredCanvasFormat(): string {
    return this.options.preferredFormat ?? 'bgra8unorm';
  }

  /** The most recently created device. */
  get device(): FakeDevice {
    const device = this.devices.at(-1);
    if (device === undefined) {
      throw new FakeWebGpuRejection('no device has been created');
    }
    return device;
  }
}

export class FakeCanvasContext implements WebGpuCanvasContext {
  public configuration: WebGpuCanvasConfiguration | null = null;
  public configureCount = 0;
  private current: FakeTexture | null = null;

  constructor(private readonly canvas: FakeCanvas) {}

  configure(configuration: WebGpuCanvasConfiguration): undefined {
    this.configuration = configuration;
    this.configureCount += 1;
    this.current = null;
    return undefined;
  }

  unconfigure(): undefined {
    this.configuration = null;
    return undefined;
  }

  getCurrentTexture(): WebGpuTexture {
    const configuration = this.configuration;
    if (configuration === null) {
      throw new FakeWebGpuRejection('getCurrentTexture() on an unconfigured context');
    }
    if (this.current?.width !== this.canvas.width || this.current.height !== this.canvas.height) {
      this.current = new FakeTexture(
        'canvas',
        this.canvas.width,
        this.canvas.height,
        configuration.format,
        configuration.usage ?? 0,
      );
    }
    return this.current;
  }
}

export class FakeCanvas implements WebGpuPresenterCanvas {
  public readonly context: FakeCanvasContext;
  public rect: GpuClientRect = { left: 0, top: 0, width: 67, height: 117 };

  constructor(
    public width = 300,
    public height = 150,
    private readonly hasContext = true,
  ) {
    this.context = new FakeCanvasContext(this);
  }

  getContext(_contextId: 'webgpu'): object | null {
    return this.hasContext ? this.context : null;
  }

  getBoundingClientRect(): GpuClientRect {
    return this.rect;
  }
}
