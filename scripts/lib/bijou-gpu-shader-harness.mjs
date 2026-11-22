// Thin WebGL2 / WebGPU execution harness for the generated bijou-surface-gpu/1 shaders.
//
// It runs in a browser page and in Node (where no context exists), so it imports nothing and
// touches no global. It is not a presenter: it draws one fullscreen triangle into an integer
// offscreen target and reads the integers back.
//
// Every step reports one of 'pass', 'fail', 'not-run'. A missing context is 'unavailable' and is
// never reported as 'pass'.

export const KERNEL_GRID_WIDTH = 64;

// Row 1 of the transport canary is written by the shader from these constants.
export const CANARY_SHADER_CONSTANTS = [0xffffffff, 0x80000000, 0x7fffffff, 0x01020304];

/**
 * Full-width u32 pattern: extremes, mixed bytes, then a walking bit that visits all 32 bit
 * positions of each of the four lanes.
 */
export function transportCanaryPattern() {
  const texels = [
    [0x00000000, 0x00000001, 0x00000002, 0x00000003],
    [0xffffffff, 0xfffffffe, 0x80000000, 0x7fffffff],
    [0xdeadbeef, 0x01234567, 0x89abcdef, 0xcafebabe],
  ];
  for (let bit = 0; bit < 32; bit += 1) {
    texels.push([0, 1, 2, 3].map((lane) => 2 ** ((bit + 8 * lane) % 32)));
  }
  return texels;
}

function notRun(detail) {
  return { status: 'not-run', detail };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true;
  return { shader, status: ok ? 'pass' : 'fail', detail: ok ? null : gl.getShaderInfoLog(shader) };
}

/** Compiles and links one program. Compilation and linking are reported separately. */
function buildProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const compiled = vertex.status === 'pass' && fragment.status === 'pass';
  const compilation = {
    status: compiled ? 'pass' : 'fail',
    detail: compiled ? null : `vertex: ${vertex.detail}; fragment: ${fragment.detail}`,
  };
  if (!compiled) {
    return { program: null, compilation, linking: notRun('compilation failed') };
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  return {
    program: linked ? program : null,
    compilation,
    linking: { status: linked ? 'pass' : 'fail', detail: linked ? null : gl.getProgramInfoLog(program) },
  };
}

function integerTexture(gl, unit, internalFormat, width, height, format, type, data) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  return texture;
}

function integerTarget(gl, internalFormat, width, height) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + 7);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.viewport(0, 0, width, height);
  return { complete, framebuffer, texture };
}

function drawTriangle(gl, program) {
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  gl.useProgram(program);
  gl.disable(gl.DITHER);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * Draws `fragmentSource` over an RGBA32UI target whose operands come from an RGBA32UI texture, and
 * reads the target back with readPixels(..., RGBA_INTEGER, UNSIGNED_INT, Uint32Array).
 */
function runKernelProgram(gl, vertexSource, fragmentSource, samplerName, width, height, operands) {
  const built = buildProgram(gl, vertexSource, fragmentSource);
  if (built.program === null) {
    return { compilation: built.compilation, linking: built.linking, words: null, detail: null };
  }
  integerTexture(gl, 0, gl.RGBA32UI, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, operands);
  if (!integerTarget(gl, gl.RGBA32UI, width, height).complete) {
    return { ...built, words: null, detail: 'RGBA32UI framebuffer is incomplete' };
  }
  gl.useProgram(built.program);
  gl.uniform1i(gl.getUniformLocation(built.program, samplerName), 0);
  drawTriangle(gl, built.program);
  const words = new Uint32Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, words);
  const error = gl.getError();
  return {
    compilation: built.compilation,
    linking: built.linking,
    words: error === gl.NO_ERROR ? words : null,
    detail: error === gl.NO_ERROR ? null : `WebGL error 0x${error.toString(16)}`,
  };
}

function describeWebGl2(gl) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL));
  const vendor = String(gl.getParameter(info === null ? gl.VENDOR : info.UNMASKED_VENDOR_WEBGL));
  // A hardware claim needs a named, unmasked, non-software renderer. Anything else is software.
  const hardware = info !== null && !/swiftshader|llvmpipe|softpipe|software|basic render/iu.test(renderer);
  return {
    executionClass: hardware ? 'gpu-probed' : 'software-probed',
    environment: {
      backend: 'webgl2',
      renderer,
      vendor,
      version: String(gl.getParameter(gl.VERSION)),
      shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
    },
  };
}

function runTransportCanary(gl, sources) {
  const pattern = transportCanaryPattern();
  const width = pattern.length;
  const operands = new Uint32Array(width * 2 * 4);
  operands.set(pattern.flat(), 0);
  const run = runKernelProgram(
    gl,
    sources.vertex,
    sources.transportCanary,
    sources.samplerNames.transportCanary,
    width,
    2,
    operands,
  );
  const expected = [...pattern.flat(), ...pattern.flatMap(() => CANARY_SHADER_CONSTANTS)];
  let transport = notRun(run.detail ?? 'the canary program did not build');
  if (run.words !== null) {
    const actual = Array.from(run.words);
    const index = actual.findIndex((word, at) => word !== expected[at]);
    transport =
      index === -1
        ? { status: 'pass', detail: null }
        : { status: 'fail', detail: `word ${index}: expected ${expected[index]}, read ${actual[index]}` };
  } else if (run.detail !== null) {
    transport = { status: 'fail', detail: run.detail };
  }
  return { compilation: run.compilation, linking: run.linking, transport };
}

function runKernelVectors(gl, sources, kernel, canary) {
  const operandLanes = kernel.operandLanes;
  const count = kernel.vectors.length;
  const height = Math.max(1, Math.ceil(count / KERNEL_GRID_WIDTH));
  const operands = new Uint32Array(KERNEL_GRID_WIDTH * height * 4);
  kernel.vectors.forEach((vector, index) => {
    operands.set(vector.slice(0, operandLanes), index * 4);
  });
  const run = runKernelProgram(
    gl,
    sources.vertex,
    sources[kernel.stage],
    sources.samplerNames[kernel.stage],
    KERNEL_GRID_WIDTH,
    height,
    operands,
  );
  const steps = {
    compilation: run.compilation,
    linking: run.linking,
    transport: canary.transport,
    arithmetic: notRun('the kernel program did not run'),
  };
  if (canary.compilation.status !== 'pass' || canary.linking.status !== 'pass') {
    steps.transport = notRun('the canary program did not build');
  }
  if (run.words === null) {
    if (run.detail !== null) {
      steps.arithmetic = { status: 'fail', detail: run.detail };
    }
    return { contractId: kernel.contractId, steps, actualResults: null };
  }
  if (steps.transport.status !== 'pass') {
    steps.arithmetic = notRun('integer transport is not proven, so the results cannot be trusted');
    return { contractId: kernel.contractId, steps, actualResults: null };
  }
  // Each texel is (value, status, echo of operand 0, echo of operand 1).
  const actualResults = [];
  let firstMismatch = null;
  kernel.vectors.forEach((vector, index) => {
    const at = index * 4;
    const value = run.words[at];
    const status = run.words[at + 1];
    actualResults.push(value, status);
    const echoed = run.words[at + 2] === vector[0] && run.words[at + 3] === vector[1];
    const matches = value === vector[operandLanes] && status === vector[operandLanes + 1];
    if (firstMismatch === null && !(echoed && matches)) {
      firstMismatch = `vector ${index} [${vector.join(', ')}]: read [${Array.from(run.words.slice(at, at + 4)).join(', ')}]`;
    }
  });
  steps.arithmetic =
    firstMismatch === null ? { status: 'pass', detail: null } : { status: 'fail', detail: firstMismatch };
  return { contractId: kernel.contractId, steps, actualResults };
}

/**
 * Runs the transport canary and then every kernel through translated GLSL ES 3.00.
 *
 * `createContext()` returns a WebGL2 context or null. `sources` holds the generated GLSL text and
 * the sampler uniform names from the implementation manifest. `kernels` is a list of
 * `{ contractId, stage, operandLanes, vectors }`, each vector being operands followed by
 * `[value, status]`.
 */
export function runKernelConformance(createContext, sources, kernels) {
  const gl = createContext();
  if (gl === null || gl === undefined) {
    const steps = {
      compilation: notRun('no WebGL2 context'),
      linking: notRun('no WebGL2 context'),
      transport: notRun('no WebGL2 context'),
      arithmetic: notRun('no WebGL2 context'),
    };
    return {
      available: false,
      executionClass: 'capability-refused',
      environment: { backend: 'webgl2', renderer: null, vendor: null, version: null, shadingLanguageVersion: null },
      kernels: kernels.map((kernel) => ({ contractId: kernel.contractId, steps, actualResults: null })),
    };
  }
  const canary = runTransportCanary(gl, sources);
  return {
    available: true,
    ...describeWebGl2(gl),
    kernels: kernels.map((kernel) => runKernelVectors(gl, sources, kernel, canary)),
  };
}

function uniformWords(layout, frame) {
  const words = new Uint32Array(layout.byteSize / 4);
  for (const member of layout.members) {
    const value = frame.uniforms[member.name];
    words.set(typeof value === 'number' ? [value] : value, member.byteOffset / 4);
  }
  return words;
}

/**
 * Builds the bijou-surface program from translated GLSL ES 3.00 once. `render(frame)` then draws a
 * frame into an RGBA8UI target and returns the canonical tight top-left row-major RGBA8 bytes as a
 * Uint8Array, or null with a `detail`.
 *
 * `frame` is `{ uniforms, cells: { width, height, words }, atlas: { width, height, bytes } }`.
 */
export function createSurfaceRendererWebGl2(gl, shader) {
  const built = buildProgram(gl, shader.vertex, shader.fragment);
  const program = built.program;
  const render = (frame) => {
    const [width, height] = frame.uniforms.canvasPx;
    const cells = integerTexture(
      gl,
      0,
      gl.RGBA32UI,
      frame.cells.width,
      frame.cells.height,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_INT,
      Uint32Array.from(frame.cells.words),
    );
    const atlas = integerTexture(
      gl,
      1,
      gl.RGBA8UI,
      frame.atlas.width,
      frame.atlas.height,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_BYTE,
      Uint8Array.from(frame.atlas.bytes),
    );
    const target = integerTarget(gl, gl.RGBA8UI, width, height);
    const buffer = gl.createBuffer();
    const release = () => {
      gl.deleteTexture(cells);
      gl.deleteTexture(atlas);
      gl.deleteBuffer(buffer);
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    };
    if (!target.complete) {
      release();
      return { rgba: null, detail: 'RGBA8UI framebuffer is incomplete' };
    }
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, shader.cellsSampler), 0);
    gl.uniform1i(gl.getUniformLocation(program, shader.atlasSampler), 1);
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, uniformWords(shader.uniformLayout, frame), gl.STATIC_DRAW);
    gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, shader.uniformBlock), 0);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, buffer);
    drawTriangle(gl, program);

    // RGBA_INTEGER / UNSIGNED_INT is the combination every WebGL2 implementation accepts for an
    // unsigned integer target. Each lane is an exact byte, so narrowing it loses nothing.
    const wide = new Uint32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, wide);
    const error = gl.getError();
    release();
    if (error !== gl.NO_ERROR) {
      return { rgba: null, detail: `WebGL error 0x${error.toString(16)}` };
    }
    // readPixels rows run bottom-up. Flip them to the canonical top-left order.
    const rgba = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const from = (height - 1 - row) * width * 4;
      rgba.set(wide.subarray(from, from + width * 4), row * width * 4);
    }
    return { rgba, detail: null };
  };
  return {
    compilation: built.compilation,
    linking: built.linking,
    render: program === null ? null : render,
  };
}

/**
 * Draws one bijou-surface frame through the assembled WGSL into an rgba8uint target and returns
 * the canonical tight top-left row-major RGBA8 bytes. `device` is a WebGPU device.
 */
export async function runSurfaceFrameWebGpu(device, usage, shader, frame) {
  const [width, height] = frame.uniforms.canvasPx;
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: shader.wgsl });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8uint' }] },
    primitive: { topology: 'triangle-list' },
  });
  const uniforms = device.createBuffer({
    size: shader.uniformLayout.byteSize,
    usage: usage.buffer.UNIFORM | usage.buffer.COPY_DST,
  });
  device.queue.writeBuffer(uniforms, 0, uniformWords(shader.uniformLayout, frame));
  const upload = (format, size, data, bytesPerTexel) => {
    const texture = device.createTexture({
      size,
      format,
      usage: usage.texture.TEXTURE_BINDING | usage.texture.COPY_DST,
    });
    device.queue.writeTexture({ texture }, data, { bytesPerRow: size[0] * bytesPerTexel }, size);
    return texture;
  };
  const cells = upload('rgba32uint', [frame.cells.width, frame.cells.height], Uint32Array.from(frame.cells.words), 16);
  const atlas = upload('rgba8uint', [frame.atlas.width, frame.atlas.height], Uint8Array.from(frame.atlas.bytes), 4);
  const target = device.createTexture({
    size: [width, height],
    format: 'rgba8uint',
    usage: usage.texture.RENDER_ATTACHMENT | usage.texture.COPY_SRC,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniforms } },
      { binding: 1, resource: cells.createView() },
      { binding: 2, resource: atlas.createView() },
    ],
  });
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: usage.buffer.COPY_DST | usage.buffer.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
  encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow }, [width, height]);
  device.queue.submit([encoder.finish()]);
  const validation = await device.popErrorScope();
  if (validation !== null) {
    return { rgba: null, detail: validation.message };
  }
  await readback.mapAsync(usage.map.READ);
  const padded = new Uint8Array(readback.getMappedRange());
  // Strip the 256-byte row alignment padding. WebGPU rows already run top-down.
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    rgba.set(padded.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4);
  }
  readback.unmap();
  return { rgba, detail: null };
}
