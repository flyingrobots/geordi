import type {
  WebGL2ContextEvent,
  WebGL2SurfaceCanvas,
  WebGL2SurfaceContext,
  WebGL2SurfaceContextAttributes,
} from '../src/index.js';
import { WEBGL2_ENUMS as GL } from '../src/index.js';

/**
 * A recording stand-in for a WebGL2 context, for the presenter unit tests.
 *
 * It renders nothing. It records every call, tracks which objects are alive,
 * and lets a test inject shader failures, GL errors, context loss and a
 * clamped drawing buffer. Real pixels are tested in Chrome by
 * `e2e/webgl2-presenter.e2e.ts`.
 */

export interface FakeCall {
  readonly name: string;
  readonly args: readonly (number | string | boolean | null | object)[];
}

export type FakeObjectKind =
  | 'shader'
  | 'program'
  | 'texture'
  | 'framebuffer'
  | 'buffer'
  | 'vertexArray';

export class FakeGlObject {
  public deleted = false;
  constructor(
    public readonly kind: FakeObjectKind,
    public readonly id: number,
  ) {}
}

export interface FakeWebGL2Options {
  readonly renderer?: string;
  readonly unmaskedRendererInfo?: boolean;
  readonly failCompile?: 'vertex' | 'fragment' | null;
  readonly failLink?: boolean;
  readonly framebufferStatus?: number;
  readonly readFormat?: number;
  readonly readType?: number;
  readonly missingUniformBlock?: boolean;
}

export class FakeWebGL2 implements WebGL2SurfaceContext {
  public readonly calls: FakeCall[] = [];
  public readonly objects: FakeGlObject[] = [];
  public readonly pendingErrors: number[] = [];
  public drawingBufferColorSpace = 'display-p3';
  public lost = false;
  public drawingBufferOverride: { width: number; height: number } | null = null;
  private nextId = 1;
  private shaderTypes = new Map<FakeGlObject, number>();

  constructor(
    private readonly canvas: { width: number; height: number },
    private readonly options: FakeWebGL2Options = {},
  ) {}

  get drawingBufferWidth(): number {
    return this.drawingBufferOverride?.width ?? this.canvas.width;
  }

  get drawingBufferHeight(): number {
    return this.drawingBufferOverride?.height ?? this.canvas.height;
  }

  private record(name: string, ...args: FakeCall['args']): void {
    this.calls.push({ name, args });
  }

  private create(kind: FakeObjectKind): FakeGlObject | null {
    if (this.lost) {
      return null;
    }
    const object = new FakeGlObject(kind, this.nextId);
    this.nextId += 1;
    this.objects.push(object);
    return object;
  }

  private remove(object: object | null): void {
    if (object instanceof FakeGlObject) {
      object.deleted = true;
    }
  }

  /** Objects created and not deleted. */
  live(kind?: FakeObjectKind): FakeGlObject[] {
    return this.objects.filter((object) => !object.deleted && (kind === undefined || object.kind === kind));
  }

  callsNamed(name: string): FakeCall[] {
    return this.calls.filter((call) => call.name === name);
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  isContextLost(): boolean {
    return this.lost;
  }

  getError(): number {
    return this.pendingErrors.shift() ?? GL.NO_ERROR;
  }

  getParameter(pname: number): string | number | null {
    switch (pname) {
      case GL.RENDERER:
        return 'WebKit WebGL';
      case GL.VENDOR:
        return 'WebKit';
      case GL.VERSION:
        return 'WebGL 2.0 (fake)';
      case GL.UNMASKED_RENDERER_WEBGL:
        return this.options.renderer ?? 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)';
      case GL.UNMASKED_VENDOR_WEBGL:
        return 'Google Inc. (Google)';
      case GL.IMPLEMENTATION_COLOR_READ_FORMAT:
        return this.options.readFormat ?? GL.RGBA_INTEGER;
      case GL.IMPLEMENTATION_COLOR_READ_TYPE:
        return this.options.readType ?? GL.UNSIGNED_BYTE;
      default:
        return null;
    }
  }

  getExtension(name: string): object | null {
    if (name === 'WEBGL_debug_renderer_info' && this.options.unmaskedRendererInfo !== false) {
      return {};
    }
    return null;
  }

  createShader(type: number): object | null {
    const shader = this.create('shader');
    if (shader !== null) {
      this.shaderTypes.set(shader, type);
    }
    return shader;
  }

  shaderSource(shader: object, source: string): void {
    this.record('shaderSource', shader, source);
  }

  compileShader(shader: object): void {
    this.record('compileShader', shader);
  }

  getShaderParameter(shader: object, pname: number): boolean | number | null {
    if (pname !== GL.COMPILE_STATUS || !(shader instanceof FakeGlObject)) {
      return null;
    }
    const type = this.shaderTypes.get(shader);
    const fail = this.options.failCompile;
    if (fail === 'vertex' && type === GL.VERTEX_SHADER) {
      return false;
    }
    if (fail === 'fragment' && type === GL.FRAGMENT_SHADER) {
      return false;
    }
    return true;
  }

  getShaderInfoLog(): string | null {
    return 'ERROR: 0:1: fake compile failure';
  }

  deleteShader(shader: object | null): void {
    this.remove(shader);
  }

  createProgram(): object | null {
    return this.create('program');
  }

  attachShader(program: object, shader: object): void {
    this.record('attachShader', program, shader);
  }

  linkProgram(program: object): void {
    this.record('linkProgram', program);
  }

  getProgramParameter(_program: object, pname: number): boolean | number | null {
    return pname === GL.LINK_STATUS ? this.options.failLink !== true : null;
  }

  getProgramInfoLog(): string | null {
    return 'fake link failure';
  }

  deleteProgram(program: object | null): void {
    this.remove(program);
  }

  useProgram(program: object | null): void {
    this.record('useProgram', program);
  }

  getUniformLocation(_program: object, name: string): object | null {
    return { uniform: name };
  }

  getUniformBlockIndex(_program: object, name: string): number {
    return this.options.missingUniformBlock === true ? GL.INVALID_INDEX : name.length > 0 ? 0 : GL.INVALID_INDEX;
  }

  uniformBlockBinding(program: object, index: number, binding: number): void {
    this.record('uniformBlockBinding', program, index, binding);
  }

  uniform1i(location: object | null, value: number): void {
    this.record('uniform1i', location, value);
  }

  uniform1ui(location: object | null, value: number): void {
    this.record('uniform1ui', location, value);
  }

  createBuffer(): object | null {
    return this.create('buffer');
  }

  bindBuffer(target: number, buffer: object | null): void {
    this.record('bindBuffer', target, buffer);
  }

  bindBufferBase(target: number, index: number, buffer: object | null): void {
    this.record('bindBufferBase', target, index, buffer);
  }

  bufferData(target: number, data: ArrayBufferView, usage: number): void {
    this.record('bufferData', target, Array.from(new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)), usage);
  }

  deleteBuffer(buffer: object | null): void {
    this.remove(buffer);
  }

  createTexture(): object | null {
    return this.create('texture');
  }

  bindTexture(target: number, texture: object | null): void {
    this.record('bindTexture', target, texture);
  }

  activeTexture(unit: number): void {
    this.record('activeTexture', unit);
  }

  texParameteri(target: number, pname: number, param: number): void {
    this.record('texParameteri', target, pname, param);
  }

  texStorage2D(target: number, levels: number, internalFormat: number, width: number, height: number): void {
    this.record('texStorage2D', target, levels, internalFormat, width, height);
  }

  texSubImage2D(
    target: number,
    level: number,
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    data: ArrayBufferView,
    srcOffset: number,
  ): void {
    this.record('texSubImage2D', target, level, x, y, width, height, format, type, data, srcOffset);
  }

  pixelStorei(pname: number, param: number): void {
    this.record('pixelStorei', pname, param);
  }

  deleteTexture(texture: object | null): void {
    this.remove(texture);
  }

  createFramebuffer(): object | null {
    return this.create('framebuffer');
  }

  bindFramebuffer(target: number, framebuffer: object | null): void {
    this.record('bindFramebuffer', target, framebuffer);
  }

  framebufferTexture2D(target: number, attachment: number, textarget: number, texture: object | null, level: number): void {
    this.record('framebufferTexture2D', target, attachment, textarget, texture, level);
  }

  checkFramebufferStatus(): number {
    return this.options.framebufferStatus ?? GL.FRAMEBUFFER_COMPLETE;
  }

  deleteFramebuffer(framebuffer: object | null): void {
    this.remove(framebuffer);
  }

  createVertexArray(): object | null {
    return this.create('vertexArray');
  }

  bindVertexArray(vertexArray: object | null): void {
    this.record('bindVertexArray', vertexArray);
  }

  deleteVertexArray(vertexArray: object | null): void {
    this.remove(vertexArray);
  }

  viewport(x: number, y: number, width: number, height: number): void {
    this.record('viewport', x, y, width, height);
  }

  disable(cap: number): void {
    this.record('disable', cap);
  }

  drawArrays(mode: number, first: number, count: number): void {
    this.record('drawArrays', mode, first, count);
  }

  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, data: ArrayBufferView): void {
    this.record('readPixels', x, y, width, height, format, type);
    // Opaque mid-grey in every channel, so a readback is distinguishable from no readback.
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (type === GL.UNSIGNED_INT) {
      new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4).fill(128);
      for (let index = 3; index < data.byteLength / 4; index += 4) {
        new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)[index] = 255;
      }
      return;
    }
    bytes.fill(128);
    for (let index = 3; index < bytes.length; index += 4) {
      bytes[index] = 255;
    }
  }
}

type ContextListener = (event: WebGL2ContextEvent) => void;

export class FakeCanvas implements WebGL2SurfaceCanvas {
  public width: number;
  public height: number;
  public readonly gl: FakeWebGL2;
  public readonly contextRequests: { id: string; attributes: WebGL2SurfaceContextAttributes }[] = [];
  public readonly listeners = new Map<string, Set<ContextListener>>();
  public rect = { left: 0, top: 0, width: 0, height: 0 };
  public unavailable = false;

  constructor(width: number, height: number, options: FakeWebGL2Options = {}) {
    this.width = width;
    this.height = height;
    this.rect = { left: 0, top: 0, width, height };
    this.gl = new FakeWebGL2(this, options);
  }

  getContext(contextId: 'webgl2', attributes: WebGL2SurfaceContextAttributes): WebGL2SurfaceContext | null {
    this.contextRequests.push({ id: contextId, attributes });
    return this.unavailable ? null : this.gl;
  }

  addEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: ContextListener): void {
    const set = this.listeners.get(type) ?? new Set<ContextListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: ContextListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect;
  }

  listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    return count;
  }

  /** Dispatch a context event; returns whether a listener called preventDefault(). */
  dispatch(type: 'webglcontextlost' | 'webglcontextrestored'): boolean {
    let prevented = false;
    const event: WebGL2ContextEvent = {
      preventDefault: () => {
        prevented = true;
      },
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
    return prevented;
  }

  loseContext(): boolean {
    this.gl.lost = true;
    return this.dispatch('webglcontextlost');
  }

  restoreContext(): void {
    this.gl.lost = false;
    this.dispatch('webglcontextrestored');
  }
}
