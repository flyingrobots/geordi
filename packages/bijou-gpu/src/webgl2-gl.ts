import type { GpuClientRect } from './presenter.js';

/**
 * The slice of the WebGL2 API the WebGL2 surface presenter uses, described
 * structurally so this package compiles without DOM typings and the presenter
 * runs against a recording fake in unit tests. A browser
 * `WebGL2RenderingContext` satisfies it.
 */

/**
 * WebGL2 enum values, from the WebGL 2.0 and OpenGL ES 3.0 specifications.
 * The browser probe checks every value against a live context.
 */
export const WEBGL2_ENUMS = {
  NO_ERROR: 0,
  TRIANGLES: 0x0004,
  CULL_FACE: 0x0b44,
  DEPTH_TEST: 0x0b71,
  STENCIL_TEST: 0x0b90,
  DITHER: 0x0bd0,
  BLEND: 0x0be2,
  SCISSOR_TEST: 0x0c11,
  UNPACK_ROW_LENGTH: 0x0cf2,
  UNPACK_SKIP_ROWS: 0x0cf3,
  UNPACK_SKIP_PIXELS: 0x0cf4,
  UNPACK_ALIGNMENT: 0x0cf5,
  PACK_ROW_LENGTH: 0x0d02,
  PACK_SKIP_ROWS: 0x0d03,
  PACK_SKIP_PIXELS: 0x0d04,
  PACK_ALIGNMENT: 0x0d05,
  TEXTURE_2D: 0x0de1,
  UNSIGNED_BYTE: 0x1401,
  UNSIGNED_INT: 0x1405,
  VENDOR: 0x1f00,
  RENDERER: 0x1f01,
  VERSION: 0x1f02,
  NEAREST: 0x2600,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  CLAMP_TO_EDGE: 0x812f,
  R8UI: 0x8232,
  TEXTURE0: 0x84c0,
  DYNAMIC_DRAW: 0x88e8,
  PIXEL_PACK_BUFFER: 0x88eb,
  PIXEL_UNPACK_BUFFER: 0x88ec,
  UNIFORM_BUFFER: 0x8a11,
  FRAGMENT_SHADER: 0x8b30,
  VERTEX_SHADER: 0x8b31,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  IMPLEMENTATION_COLOR_READ_TYPE: 0x8b9a,
  IMPLEMENTATION_COLOR_READ_FORMAT: 0x8b9b,
  READ_FRAMEBUFFER: 0x8ca8,
  DRAW_FRAMEBUFFER: 0x8ca9,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER: 0x8d40,
  RGBA32UI: 0x8d70,
  RGBA8UI: 0x8d7c,
  RED_INTEGER: 0x8d94,
  RGBA_INTEGER: 0x8d99,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
  CONTEXT_LOST_WEBGL: 0x9242,
  UNMASKED_VENDOR_WEBGL: 0x9245,
  UNMASKED_RENDERER_WEBGL: 0x9246,
  INVALID_INDEX: 0xffffffff,
} as const;

/** An opaque WebGL object: shader, program, texture, buffer, framebuffer, or vertex array. */
export type WebGL2Handle = object;

export interface WebGL2SurfaceContext {
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  drawingBufferColorSpace: string;
  isContextLost(): boolean;
  getError(): number;
  getParameter(pname: number): string | number | null;
  getExtension(name: string): object | null;

  createShader(type: number): WebGL2Handle | null;
  shaderSource(shader: WebGL2Handle, source: string): void;
  compileShader(shader: WebGL2Handle): void;
  getShaderParameter(shader: WebGL2Handle, pname: number): boolean | number | null;
  getShaderInfoLog(shader: WebGL2Handle): string | null;
  deleteShader(shader: WebGL2Handle | null): void;
  createProgram(): WebGL2Handle | null;
  attachShader(program: WebGL2Handle, shader: WebGL2Handle): void;
  linkProgram(program: WebGL2Handle): void;
  getProgramParameter(program: WebGL2Handle, pname: number): boolean | number | null;
  getProgramInfoLog(program: WebGL2Handle): string | null;
  deleteProgram(program: WebGL2Handle | null): void;
  useProgram(program: WebGL2Handle | null): void;
  getUniformLocation(program: WebGL2Handle, name: string): WebGL2Handle | null;
  getUniformBlockIndex(program: WebGL2Handle, name: string): number;
  uniformBlockBinding(program: WebGL2Handle, index: number, binding: number): void;
  uniform1i(location: WebGL2Handle | null, value: number): void;
  uniform1ui(location: WebGL2Handle | null, value: number): void;

  createBuffer(): WebGL2Handle | null;
  bindBuffer(target: number, buffer: WebGL2Handle | null): void;
  bindBufferBase(target: number, index: number, buffer: WebGL2Handle | null): void;
  bufferData(target: number, data: ArrayBufferView, usage: number): void;
  deleteBuffer(buffer: WebGL2Handle | null): void;

  createTexture(): WebGL2Handle | null;
  bindTexture(target: number, texture: WebGL2Handle | null): void;
  activeTexture(unit: number): void;
  texParameteri(target: number, pname: number, param: number): void;
  texStorage2D(target: number, levels: number, internalFormat: number, width: number, height: number): void;
  texSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    type: number,
    srcData: ArrayBufferView,
    srcOffset: number,
  ): void;
  pixelStorei(pname: number, param: number): void;
  deleteTexture(texture: WebGL2Handle | null): void;

  createFramebuffer(): WebGL2Handle | null;
  bindFramebuffer(target: number, framebuffer: WebGL2Handle | null): void;
  framebufferTexture2D(
    target: number,
    attachment: number,
    textarget: number,
    texture: WebGL2Handle | null,
    level: number,
  ): void;
  checkFramebufferStatus(target: number): number;
  deleteFramebuffer(framebuffer: WebGL2Handle | null): void;

  createVertexArray(): WebGL2Handle | null;
  bindVertexArray(vertexArray: WebGL2Handle | null): void;
  deleteVertexArray(vertexArray: WebGL2Handle | null): void;

  viewport(x: number, y: number, width: number, height: number): void;
  disable(cap: number): void;
  drawArrays(mode: number, first: number, count: number): void;
  readPixels(
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    dstData: ArrayBufferView,
  ): void;
}

/** The context attributes the presenter requests. */
export interface WebGL2SurfaceContextAttributes {
  readonly alpha: false;
  readonly antialias: false;
  readonly depth: false;
  readonly stencil: false;
  readonly premultipliedAlpha: false;
  readonly preserveDrawingBuffer: true;
}

/** The part of a `webglcontextlost` / `webglcontextrestored` event the presenter uses. */
export interface WebGL2ContextEvent {
  preventDefault(): void;
}

export type WebGL2ContextEventType = 'webglcontextlost' | 'webglcontextrestored';

/** The slice of `HTMLCanvasElement` the presenter uses. */
export interface WebGL2SurfaceCanvas {
  width: number;
  height: number;
  getContext(contextId: 'webgl2', attributes: WebGL2SurfaceContextAttributes): WebGL2SurfaceContext | null;
  addEventListener(type: WebGL2ContextEventType, listener: (event: WebGL2ContextEvent) => void): void;
  removeEventListener(type: WebGL2ContextEventType, listener: (event: WebGL2ContextEvent) => void): void;
  getBoundingClientRect(): GpuClientRect;
}
