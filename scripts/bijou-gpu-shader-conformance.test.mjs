// Kernel conformance and Option E4 arc conformance for flyingrobots/geordi#170.
//
// The generated GLSL ES 3.00 runs in a real WebGL2 context in headless Chrome. WebGL2 is required:
// a missing context fails these tests. WebGPU execution of the assembled WGSL is reported as
// skipped, never as passed, when the browser has no adapter; set
// GEORDI_BIJOU_GPU_REQUIRE_WEBGPU=1 to turn that into a failure.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';

import {
  BUNNY_PRIMITIVE_PINS,
  createGlyphSlotMap,
  decodeProceduralGlyphTable,
  renderReferenceRgba,
} from '@flyingrobots/geordi-bijou-gpu';
import { chromium } from '@playwright/test';

import { ADR_E4_SIZES, EXTRA_E4_SIZES, e4CornerLit } from './lib/bijou-gpu-e4-reference.mjs';
import { buildKernelReceipts, sha256Hex, u32LeBytes } from './lib/bijou-gpu-kernel-receipt.mjs';
import { runKernelConformance } from './lib/bijou-gpu-shader-harness.mjs';

const require = createRequire(import.meta.url);

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SHADER_DIR = 'packages/bijou-gpu/shaders';
const MANIFEST_PATH = `${SHADER_DIR}/bijou-shaders.manifest.json`;
const ORIGIN = 'https://bijou-gpu-shaders.test';

const readBytes = (path) => readFileSync(resolve(REPO_ROOT, path));
const readText = (path) => readFileSync(resolve(REPO_ROOT, path), 'utf8');
const shaderText = (file) => readText(`${SHADER_DIR}/${file}`);

const manifest = require(resolve(REPO_ROOT, MANIFEST_PATH));
const glyphTable = require(resolve(REPO_ROOT, 'fixtures/bijou-gpu/procedural-glyphs.json'));

const shaderOf = (id) => manifest.shaders.find((shader) => shader.id === id);
const glslNameOf = (shader, wgslName, file) =>
  shader.bindings.find((binding) => binding.wgslName === wgslName).glslNames[file];

const KERNEL_STAGES = {
  transportCanary: 'bijou-kernel-conformance.transport-canary.frag.glsl',
  divRoundEven: 'bijou-kernel-conformance.div-round-even.frag.glsl',
  ellipseClassify: 'bijou-kernel-conformance.ellipse-classify.frag.glsl',
};
const KERNEL_VERTEX = 'bijou-kernel-conformance.vert.glsl';

function kernelSources() {
  const kernel = shaderOf('bijou-kernel-conformance');
  const sources = { vertex: shaderText(KERNEL_VERTEX), samplerNames: {} };
  for (const [stage, file] of Object.entries(KERNEL_STAGES)) {
    sources[stage] = shaderText(file);
    sources.samplerNames[stage] = glslNameOf(kernel, 'kernel_inputs', file);
  }
  return sources;
}

function kernelCases() {
  const cases = [
    ['bunny-u32-div-round-even/1', 'divRoundEven', 2],
    ['bunny-u32-ellipse-classify/1', 'ellipseClassify', 4],
  ];
  return cases.map(([contractId, stage, operandLanes]) => {
    const primitive = manifest.bunnyPrimitives.find((entry) => entry.contractId === contractId);
    const fixture = require(resolve(REPO_ROOT, primitive.vectorsPath));
    assert.equal(fixture.contractId, contractId);
    assert.equal(fixture.vectors.length, fixture.vectorCount);
    return {
      contractId,
      stage,
      operandLanes,
      vectors: fixture.vectors,
      vectorsBytes: readBytes(primitive.vectorsPath),
      pinnedVectorsSha256: primitive.vectorsSha256,
      stages: [KERNEL_VERTEX, KERNEL_STAGES[stage]].map((file) => ({
        file,
        bytes: readBytes(`${SHADER_DIR}/${file}`),
      })),
    };
  });
}

function receiptsFor(report, cases) {
  return buildKernelReceipts(report, { manifestBytes: readBytes(MANIFEST_PATH), kernels: cases });
}

function surfaceShader() {
  const surface = shaderOf('bijou-surface');
  const fragment = 'bijou-surface.frag.glsl';
  const uniforms = surface.bindings.find((binding) => binding.wgslName === 'surface');
  return {
    vertex: shaderText('bijou-surface.vert.glsl'),
    fragment: shaderText(fragment),
    wgsl: shaderText('bijou-surface.wgsl'),
    uniformBlock: uniforms.glslNames[fragment],
    uniformLayout: { byteSize: uniforms.byteSize, members: uniforms.members },
    cellsSampler: glslNameOf(surface, 'cells', fragment),
    atlasSampler: glslNameOf(surface, 'glyph_atlas', fragment),
  };
}

// U+256D..U+2570, laid out row-major in the 2x2 test grid.
const ROUNDED_CORNERS = glyphTable.boxDrawing.entries
  .filter((entry) => entry.rounded)
  .map((entry) => ({
    index: entry.codePoint - glyphTable.boxDrawing.startCodePoint,
    right: entry.right > 0,
    down: entry.down > 0,
    char: entry.char,
  }));

let browser;
let page;

before(async () => {
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader'],
  });
  page = await browser.newPage();
  const modules = ['bijou-gpu-shader-harness.mjs', 'bijou-gpu-e4-reference.mjs'];
  await page.route(`${ORIGIN}/**`, (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    return modules.includes(name)
      ? route.fulfill({ contentType: 'text/javascript', body: readText(`scripts/lib/${name}`) })
      : route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>bijou-gpu shaders</title>' });
  });
  await page.goto(`${ORIGIN}/`);
});

after(async () => {
  await browser?.close();
});

/** Runs the kernel harness in the page, in a probe context configured as the ABI record requires. */
function runKernelsInPage(sources, cases) {
  return page.evaluate(
    async ({ sources: pageSources, kernels }) => {
      const harness = await import('/bijou-gpu-shader-harness.mjs');
      const report = harness.runKernelConformance(
        () =>
          document.createElement('canvas').getContext('webgl2', {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
          }),
        pageSources,
        kernels,
      );
      return { ...report, userAgent: navigator.userAgent };
    },
    {
      sources,
      kernels: cases.map(({ contractId, stage, operandLanes, vectors }) => ({
        contractId,
        stage,
        operandLanes,
        vectors,
      })),
    },
  );
}

test('a missing WebGL2 context yields outcome "unavailable", never "pass"', () => {
  const cases = kernelCases();
  for (const missing of [null, undefined]) {
    const report = runKernelConformance(() => missing, kernelSources(), cases);
    assert.equal(report.available, false);
    const receipts = receiptsFor(report, cases);
    assert.equal(receipts.length, 2);
    for (const receipt of receipts) {
      assert.equal(receipt.outcome, 'unavailable');
      assert.equal(receipt.executionClass, 'capability-refused');
      assert.equal(receipt.actualResultsSha256, null);
      for (const step of ['compilation', 'linking', 'transport', 'arithmetic']) {
        assert.equal(receipt.steps[step].status, 'not-run', step);
      }
    }
  }
});

test('kernel receipts fail closed when a step fails or the result bytes differ', () => {
  const [divCase] = kernelCases();
  const cases = [{ ...divCase, vectors: divCase.vectors.slice(0, 3) }];
  const pass = { status: 'pass', detail: null };
  const expected = cases[0].vectors.flatMap((vector) => vector.slice(2));
  const reportWith = (steps, actualResults) => ({
    available: true,
    executionClass: 'software-probed',
    environment: { backend: 'webgl2' },
    kernels: [{ contractId: divCase.contractId, steps: { compilation: pass, linking: pass, transport: pass, arithmetic: pass, ...steps }, actualResults }],
  });
  assert.equal(receiptsFor(reportWith({}, expected), cases)[0].outcome, 'pass');
  const wrong = [...expected];
  wrong[0] += 1;
  assert.equal(receiptsFor(reportWith({}, wrong), cases)[0].outcome, 'fail');
  for (const step of ['compilation', 'linking', 'transport', 'arithmetic']) {
    for (const status of ['fail', 'not-run']) {
      const receipt = receiptsFor(reportWith({ [step]: { status, detail: 'x' } }, expected), cases)[0];
      assert.equal(receipt.outcome, 'fail', `${step} ${status}`);
    }
  }
  assert.equal(receiptsFor(reportWith({}, null), cases)[0].outcome, 'fail');
  // Little-endian, least-significant byte first.
  assert.deepEqual(Array.from(u32LeBytes([0x11223344, 1])), [0x44, 0x33, 0x22, 0x11, 1, 0, 0, 0]);
});

test('shared Bunny fixtures carry the edge vectors the test plan names', () => {
  const [div, ellipse] = kernelCases();
  const has = (kernel, vector) => kernel.vectors.some((entry) => entry.join(',') === vector.join(','));
  assert.equal(div.vectors.length, 1720);
  assert.equal(ellipse.vectors.length, 1444);
  // 2 * r wraps for this input; the exact rounded quotient is 1.
  assert.ok(has(div, [3000000000, 4000000000, 1, 0]));
  // d == 0, including 0 / 0, is DivisionByZero.
  assert.ok(has(div, [0, 0, 0, 1]));
  assert.ok(has(div, [4294967295, 0, 0, 1]));
  // a == 0 || b == 0: the origin is on the boundary, every other point is outside.
  assert.ok(has(ellipse, [0, 0, 0, 5, 1, 0]));
  assert.ok(has(ellipse, [0, 1, 0, 5, 2, 0]));
  assert.ok(has(ellipse, [1, 0, 5, 0, 2, 0]));
  assert.ok(has(ellipse, [0, 0, 0, 0, 1, 0]));
  // Out-of-domain operands.
  assert.ok(has(ellipse, [46341, 0, 10, 10, 0, 1]));
  for (const kernel of [div, ellipse]) {
    assert.equal(sha256Hex(kernel.vectorsBytes), kernel.pinnedVectorsSha256);
  }
});

test('transport canary and the shared Bunny vectors pass bit for bit through translated GLSL ES 3.00 in WebGL2', async (t) => {
  const cases = kernelCases();
  const report = await runKernelsInPage(kernelSources(), cases);
  assert.equal(report.available, true, 'WebGL2 is required for this gate');
  const receipts = receiptsFor(report, cases);
  assert.equal(receipts.length, 2);
  receipts.forEach((receipt, index) => {
    const kernel = cases[index];
    assert.equal(receipt.receiptVersion, 'geordi-bijou-gpu-kernel-receipt/1');
    assert.equal(receipt.contractId, kernel.contractId);
    for (const step of ['compilation', 'linking', 'transport', 'arithmetic']) {
      assert.deepEqual(receipt.steps[step], { status: 'pass', detail: null }, `${kernel.contractId} ${step}`);
    }
    assert.equal(receipt.outcome, 'pass');
    assert.ok(['software-probed', 'gpu-probed'].includes(receipt.executionClass));
    assert.equal(receipt.environment.backend, 'webgl2');
    assert.ok(receipt.environment.renderer.length > 0);
    assert.equal(receipt.vectorCount, kernel.vectors.length);
    assert.equal(receipt.implementationManifestSha256, sha256Hex(readBytes(MANIFEST_PATH)));
    assert.equal(receipt.vectorsSha256, kernel.pinnedVectorsSha256);
    assert.match(receipt.executionArtifactSha256, /^[0-9a-f]{64}$/u);
    // Serialized little-endian result bytes, compared bit for bit through their digests.
    assert.equal(receipt.actualResultsSha256, receipt.expectedResultsSha256);
    assert.equal(
      receipt.expectedResultsSha256,
      sha256Hex(u32LeBytes(kernel.vectors.flatMap((vector) => vector.slice(kernel.operandLanes)))),
    );
    t.diagnostic(
      `${receipt.contractId}: ${receipt.outcome}, ${receipt.executionClass}, ${receipt.environment.renderer}, results ${receipt.actualResultsSha256}`,
    );
  });
});

test('the kernel harness detects a wrong kernel, a compile failure and a link failure', async () => {
  const cases = kernelCases();
  const sources = kernelSources();

  // The ellipse kernel answers the division vectors: arithmetic must fail, not transport.
  const swapped = { ...sources, divRoundEven: sources.ellipseClassify };
  const [wrong] = receiptsFor(await runKernelsInPage(swapped, [cases[0]]), [cases[0]]);
  assert.equal(wrong.steps.compilation.status, 'pass');
  assert.equal(wrong.steps.linking.status, 'pass');
  assert.equal(wrong.steps.transport.status, 'pass');
  assert.equal(wrong.steps.arithmetic.status, 'fail');
  assert.equal(wrong.outcome, 'fail');
  assert.notEqual(wrong.actualResultsSha256, wrong.expectedResultsSha256);

  const broken = { ...sources, divRoundEven: `${sources.divRoundEven}\nvoid broken( {` };
  const [uncompiled] = receiptsFor(await runKernelsInPage(broken, [cases[0]]), [cases[0]]);
  assert.equal(uncompiled.steps.compilation.status, 'fail');
  assert.equal(uncompiled.steps.linking.status, 'not-run');
  assert.equal(uncompiled.steps.arithmetic.status, 'not-run');
  assert.equal(uncompiled.outcome, 'fail');

  // Compiles, but reads a varying the vertex stage never writes: linking fails.
  const unlinked = {
    ...sources,
    divRoundEven:
      '#version 300 es\nprecision highp float;\nin vec4 never_written;\nlayout(location = 0) out uvec4 o;\nvoid main() { o = uvec4(never_written); }\n',
  };
  const [failedLink] = receiptsFor(await runKernelsInPage(unlinked, [cases[0]]), [cases[0]]);
  assert.equal(failedLink.steps.compilation.status, 'pass');
  assert.equal(failedLink.steps.linking.status, 'fail');
  assert.equal(failedLink.outcome, 'fail');

  // A corrupted canary leaves the arithmetic unproven.
  const leaky = { ...sources, transportCanary: sources.transportCanary.replace('2147483648u', '2147483649u') };
  assert.ok(leaky.transportCanary !== sources.transportCanary, 'the canary constant must be present');
  const [untrusted] = receiptsFor(await runKernelsInPage(leaky, [cases[0]]), [cases[0]]);
  assert.equal(untrusted.steps.transport.status, 'fail');
  assert.equal(untrusted.steps.arithmetic.status, 'not-run');
  assert.equal(untrusted.outcome, 'fail');
});

test('Option E4 reference model reproduces the bitmaps the ABI record pins', () => {
  const grid = (char, W, H) => {
    const corner = ROUNDED_CORNERS.find((entry) => entry.char === char);
    const rows = [];
    for (let ly = 0; ly < H; ly += 1) {
      let row = '';
      for (let lx = 0; lx < W; lx += 1) {
        row += e4CornerLit(corner.right, corner.down, lx, ly, W, H) ? '#' : '.';
      }
      rows.push(row);
    }
    return rows.join('/');
  };
  assert.deepEqual(
    ROUNDED_CORNERS.map((corner) => corner.char),
    ['╭', '╮', '╯', '╰'],
  );
  assert.equal(grid('╭', 2, 2), '##/#.');
  assert.equal(grid('╮', 2, 2), '#./#.');
  assert.equal(grid('╰', 2, 2), '##/..');
  assert.equal(grid('╯', 2, 2), '#./..');
  assert.equal(grid('╭', 4, 4), '..../.###/.#../.#..');
  assert.equal(grid('╭', 1, 4), './#/#/#');
  assert.equal(grid('╭', 5, 7), '...../...../...../...##/..##./..#../..#..');
  assert.equal(grid('╮', 5, 7), '...../...../...../##.../.##../..#../..#..');
  assert.equal(grid('╰', 5, 7), '..#../..#../..##./...##/...../...../.....');
  assert.equal(grid('╯', 5, 7), '..#../..#../.##../##.../...../...../.....');
});

/** Renders every size through translated GLSL in WebGL2 and diffs it in the page. */
function diffE4InWebGl2(shader, sizes) {
  return page.evaluate(
    async ({ shader: pageShader, corners, sizes: pageSizes, exhaustive }) => {
      const harness = await import('/bijou-gpu-shader-harness.mjs');
      const reference = await import('/bijou-gpu-e4-reference.mjs');
      const gl = document.createElement('canvas').getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      if (gl === null) {
        return { available: false };
      }
      const renderer = harness.createSurfaceRendererWebGl2(gl, pageShader);
      if (renderer.render === null) {
        return { available: true, compilation: renderer.compilation, linking: renderer.linking, diff: null };
      }
      let all = pageSizes;
      if (exhaustive) {
        all = [];
        for (let W = 1; W <= 256; W += 1) {
          for (let H = 1; H <= 256; H += 1) {
            all.push([W, H]);
          }
        }
      }
      return {
        available: true,
        compilation: renderer.compilation,
        linking: renderer.linking,
        diff: reference.diffE4Sizes(renderer.render, corners, all),
      };
    },
    { shader, corners: ROUNDED_CORNERS, sizes, exhaustive: process.env.GEORDI_BIJOU_GPU_E4_EXHAUSTIVE === '1' },
  );
}

test('translated GLSL ES 3.00 Option E4 arcs match the reference model with zero divergent pixels in WebGL2', { timeout: 3_600_000 }, async (t) => {
  const sizes = [...ADR_E4_SIZES, ...EXTRA_E4_SIZES];
  const result = await diffE4InWebGl2(surfaceShader(), sizes);
  assert.equal(result.available, true, 'WebGL2 is required for this gate');
  assert.deepEqual(result.compilation, { status: 'pass', detail: null });
  assert.deepEqual(result.linking, { status: 'pass', detail: null });
  assert.equal(result.diff.first, null);
  assert.equal(result.diff.divergentPixels, 0);
  const exhaustive = process.env.GEORDI_BIJOU_GPU_E4_EXHAUSTIVE === '1';
  assert.equal(result.diff.instances, exhaustive ? 262_144 : sizes.length * 4);
  t.diagnostic(`${result.diff.instances} corner instances, ${result.diff.pixels} pixels, 0 divergent`);
});

test('the Option E4 diff detects a flipped row origin and a changed arc rule', async () => {
  const shader = surfaceShader();
  const flipped = { ...shader, fragment: shader.fragment.replace('const bool BIJOU_FRAG_ORIGIN_BOTTOM_LEFT = true;', 'const bool BIJOU_FRAG_ORIGIN_BOTTOM_LEFT = false;') };
  assert.ok(flipped.fragment !== shader.fragment, 'the origin constant must be present');
  const upsideDown = await diffE4InWebGl2(flipped, [[8, 16]]);
  assert.ok(upsideDown.diff.divergentPixels > 0, 'a bottom-left origin must diverge');

  // `res.x <= 0u` instead of `res.x <= 1u` drops the exact boundary ties.
  const strict = { ...shader, fragment: shader.fragment.replace('(_e4.x <= 1u)', '(_e4.x <= 0u)') };
  assert.ok(strict.fragment !== shader.fragment, 'the boundary comparison must be present');
  const dropped = await diffE4InWebGl2(strict, ADR_E4_SIZES);
  assert.ok(dropped.diff.divergentPixels > 0, 'dropping boundary ties must diverge');
});

test('assembled WGSL Option E4 arcs match the reference model with zero divergent pixels in WebGPU', async (t) => {
  const sizes = [...ADR_E4_SIZES, ...EXTRA_E4_SIZES];
  const result = await page.evaluate(
    async ({ shader, corners, sizes: pageSizes }) => {
      const harness = await import('/bijou-gpu-shader-harness.mjs');
      const reference = await import('/bijou-gpu-e4-reference.mjs');
      const adapter = navigator.gpu === undefined ? null : await navigator.gpu.requestAdapter();
      if (adapter === null) {
        return { available: false, detail: navigator.gpu === undefined ? 'navigator.gpu is undefined' : 'no adapter' };
      }
      const device = await adapter.requestDevice();
      const usage = { buffer: GPUBufferUsage, texture: GPUTextureUsage, map: GPUMapMode };
      const frames = [];
      for (const [W, H] of pageSizes) {
        const frame = reference.e4Frame(corners, W, H);
        frames.push([W, H, await harness.runSurfaceFrameWebGpu(device, usage, shader, frame)]);
      }
      const rendered = new Map(frames.map(([W, H, frame]) => [`${W}x${H}`, frame]));
      const info = adapter.info ?? {};
      return {
        available: true,
        adapter: `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.description ?? ''}`.trim(),
        diff: reference.diffE4Sizes((frame) => rendered.get(frame.uniforms.cellPx.join('x')), corners, pageSizes),
      };
    },
    { shader: surfaceShader(), corners: ROUNDED_CORNERS, sizes },
  );
  if (!result.available) {
    assert.notEqual(process.env.GEORDI_BIJOU_GPU_REQUIRE_WEBGPU, '1', `WebGPU is required but unavailable: ${result.detail}`);
    t.skip(`unavailable: WebGPU did not execute the WGSL (${result.detail})`);
    return;
  }
  assert.equal(result.diff.first, null);
  assert.equal(result.diff.divergentPixels, 0);
  assert.equal(result.diff.instances, sizes.length * 4);
  t.diagnostic(`WebGPU adapter "${result.adapter}": ${result.diff.instances} corner instances, ${result.diff.pixels} pixels, 0 divergent`);
});

// ---------------------------------------------------------------------------------------------
// Full-frame parity with the CPU reference oracle of @flyingrobots/geordi-bijou-gpu
// ---------------------------------------------------------------------------------------------

/**
 * A frame holding all 416 procedural glyphs, atlas glyphs, the space and the empty cell, once
 * plainly styled and once with seeded pseudo-random flags, presence bits, opacity and colors,
 * over a synthetic atlas of mono and premultiplied color slots, with a letterboxed remainder.
 */
function oracleFrame(cellPxW, cellPxH) {
  let seed = 0x12345678 + cellPxW * 257 + cellPxH;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) & 0xff;
  };
  const atlasCols = 4;
  const atlasRows = 2;
  const atlasRgba = new Uint8Array(atlasCols * cellPxW * atlasRows * cellPxH * 4);
  for (let at = 0; at < atlasRgba.length; at += 4) {
    const slotCol = Math.floor(((at / 4) % (atlasCols * cellPxW)) / cellPxW);
    const alpha = next();
    if (slotCol >= 2) {
      atlasRgba.set([0, 1, 2].map(() => Math.floor((next() * alpha) / 255)), at);
    }
    atlasRgba[at + 3] = alpha;
  }
  const graphemes = ['A', 'B', '\u2665', '\u2666', 'C', 'D', '\u2660', '\u2663'];
  const slotMap = createGlyphSlotMap(
    graphemes.flatMap((grapheme, slot) =>
      [false, true].map((bold) => ({ grapheme, bold, slot, kind: slot % 4 < 2 ? 'mono' : 'color' })),
    ),
  );
  const codes = [];
  for (const [start, count] of [[0x2500, 128], [0x2580, 32], [0x2800, 256]]) {
    for (let index = 0; index < count; index += 1) {
      codes.push(start + index);
    }
  }
  codes.push(...graphemes.map((grapheme) => grapheme.codePointAt(0)), 0x20, 0);
  const widthCells = 32;
  const heightCells = Math.ceil((codes.length * 2) / widthCells);
  const bytes = new Uint8Array(widthCells * heightCells * 10);
  for (let cell = 0; cell < widthCells * heightCells; cell += 1) {
    const code = codes[cell % codes.length];
    const styled = cell >= codes.length;
    const flags = styled ? next() & (cell % 2 === 0 ? 0xff : 0x7f) : 0;
    const alpha = styled ? next() : 0xff;
    const fg = (alpha & 0x40) === 0 ? [0, 0, 0] : [next(), next(), next()];
    const bg = (alpha & 0x80) === 0 ? [0, 0, 0] : [next(), next(), next()];
    bytes.set([code & 0xff, code >> 8, ...fg, ...bg, flags, alpha], cell * 10);
  }
  const canvasPx = [widthCells * cellPxW + 5, heightCells * cellPxH + 3];
  const reference = renderReferenceRgba(
    { widthCells, heightCells, bytes, sideTable: [] },
    { cellPxW, cellPxH, atlasCols, atlasRows, rgba: atlasRgba },
    slotMap,
    decodeProceduralGlyphTable(glyphTable),
    { canvasPxW: canvasPx[0], canvasPxH: canvasPx[1], defaultFg: '#E6EDF3', defaultBg: '#0D1117' },
  );
  return {
    reference,
    frame: {
      uniforms: {
        canvasPx,
        cellPx: [cellPxW, cellPxH],
        gridCells: [widthCells, heightCells],
        atlasCols,
        defaultFg: [0xe6, 0xed, 0xf3],
        defaultBg: [0x0d, 0x11, 0x17],
        flags: 0,
      },
      cells: { width: widthCells, height: heightCells, words: Array.from(reference.preparedCells) },
      atlas: { width: atlasCols * cellPxW, height: atlasRows * cellPxH, bytes: Array.from(atlasRgba) },
    },
  };
}

const ORACLE_SIZES = [
  [8, 16],
  [5, 7],
  [2, 5],
  [3, 4],
  [15, 30],
];

/** Renders `frame` in the page through WebGL2 GLSL and, when available, WebGPU WGSL. */
function renderFrameInPage(shader, frame) {
  return page.evaluate(
    async ({ shader: pageShader, frame: pageFrame }) => {
      const harness = await import('/bijou-gpu-shader-harness.mjs');
      const base64 = (bytes) => {
        let text = '';
        for (let at = 0; at < bytes.length; at += 0x8000) {
          text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
        }
        return btoa(text);
      };
      const gl = document.createElement('canvas').getContext('webgl2', { alpha: false, antialias: false });
      const renderer = gl === null ? null : harness.createSurfaceRendererWebGl2(gl, pageShader);
      const webgl2 = renderer?.render?.(pageFrame) ?? { rgba: null, detail: 'no WebGL2 program' };
      const adapter = navigator.gpu === undefined ? null : await navigator.gpu.requestAdapter();
      let webgpu = null;
      if (adapter !== null) {
        const usage = { buffer: GPUBufferUsage, texture: GPUTextureUsage, map: GPUMapMode };
        webgpu = await harness.runSurfaceFrameWebGpu(await adapter.requestDevice(), usage, pageShader, pageFrame);
      }
      const encode = (result) => ({ rgba: result.rgba === null ? null : base64(result.rgba), detail: result.detail });
      return { webgl2: encode(webgl2), webgpu: webgpu === null ? null : encode(webgpu) };
    },
    { shader, frame },
  );
}

test('the manifest pins the same Bunny primitives as the endpoint receipt validator', () => {
  assert.deepEqual(
    manifest.bunnyPrimitives.map(({ contractId, bunnyCommit, wgslSha256, vectorsSha256 }) => ({
      contractId,
      bunnyCommit,
      wgslSha256,
      vectorsSha256,
    })),
    BUNNY_PRIMITIVE_PINS.map(({ contractId, bunnyCommit, wgslSha256, vectorsSha256 }) => ({
      contractId,
      bunnyCommit,
      wgslSha256,
      vectorsSha256,
    })),
  );
});

test('full frames of every procedural glyph, atlas glyph and style match the CPU reference oracle bit for bit', async (t) => {
  const shader = surfaceShader();
  let webgpuFrames = 0;
  for (const [cellPxW, cellPxH] of ORACLE_SIZES) {
    const { reference, frame } = oracleFrame(cellPxW, cellPxH);
    const rendered = await renderFrameInPage(shader, frame);
    assert.ok(rendered.webgl2.rgba !== null, `WebGL2 is required for this gate: ${rendered.webgl2.detail}`);
    const hashOf = (base64) => sha256Hex(Buffer.from(base64, 'base64'));
    assert.equal(hashOf(rendered.webgl2.rgba), reference.frameRgbaSha256, `WebGL2 GLSL at ${cellPxW}x${cellPxH}`);
    if (rendered.webgpu !== null) {
      assert.ok(rendered.webgpu.rgba !== null, rendered.webgpu.detail);
      assert.equal(hashOf(rendered.webgpu.rgba), reference.frameRgbaSha256, `WebGPU WGSL at ${cellPxW}x${cellPxH}`);
      webgpuFrames += 1;
    }
  }
  assert.notEqual(
    webgpuFrames === 0 && process.env.GEORDI_BIJOU_GPU_REQUIRE_WEBGPU === '1',
    true,
    'WebGPU is required but unavailable',
  );
  t.diagnostic(
    `WebGL2 GLSL: ${ORACLE_SIZES.length} frames identical to the oracle; WebGPU WGSL: ${webgpuFrames === 0 ? 'unavailable, not executed' : `${webgpuFrames} frames identical to the oracle`}`,
  );
});
