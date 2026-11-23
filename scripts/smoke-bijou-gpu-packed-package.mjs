// Packs @flyingrobots/geordi-bijou-gpu the way it is published, installs the
// tarball into a scratch consumer, and proves from that packed copy that:
//
// - the tarball holds the shader manifest and every generated shader artifact,
//   and none of the authored or vendored shader inputs;
// - the tarball holds the procedural glyph table as a byte-identical JSON copy
//   and a bundled module, and a consumer can construct the Canvas 2D presenter
//   from the packed copy alone, with no proceduralTable argument and no path
//   into this repository;
// - every subpath export resolves by package name and has its named exports;
// - the Node file adapter reads every artifact from the packed shaders/ at its
//   manifest digest, byte-identical to the bundled adapters.
//
//   pnpm --filter @flyingrobots/geordi-bijou-gpu... build
//   node scripts/smoke-bijou-gpu-packed-package.mjs
//
// Every line on stdout and stderr is one JSON object with a `kind`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseJsonValue, stringifyCanonicalJson } from '../packages/core/dist/index.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGE_DIR = join(REPO_ROOT, 'packages', 'bijou-gpu');
const PACKAGE_NAME = '@flyingrobots/geordi-bijou-gpu';

const SHADER_FILES = [
  'bijou-shaders.manifest.json',
  'bijou-surface.wgsl',
  'bijou-surface.vert.glsl',
  'bijou-surface.frag.glsl',
  'bijou-kernel-conformance.wgsl',
  'bijou-kernel-conformance.vert.glsl',
  'bijou-kernel-conformance.transport-canary.frag.glsl',
  'bijou-kernel-conformance.div-round-even.frag.glsl',
  'bijou-kernel-conformance.ellipse-classify.frag.glsl',
];

const REQUIRED_ENTRIES = [
  ...SHADER_FILES.map((file) => `package/shaders/${file}`),
  'package/dist/index.js',
  'package/dist/shader-source.js',
  'package/dist/shader-source-webgl2.js',
  'package/dist/shader-source-webgl2.d.ts',
  'package/dist/shader-source-webgpu.js',
  'package/dist/shader-source-webgpu.d.ts',
  'package/dist/shader-source-node.js',
  'package/dist/shader-source-node.d.ts',
  'package/dist/generated/bijou-surface-glsl.generated.js',
  'package/dist/generated/bijou-surface-wgsl.generated.js',
  'package/dist/generated/bijou-shaders-manifest.generated.js',
  'package/procedural/procedural-glyphs.json',
  'package/dist/procedural-glyphs-bundled.js',
  'package/dist/procedural-glyphs-bundled.d.ts',
  'package/dist/canvas2d-presenter-default.js',
  'package/dist/generated/bijou-procedural-glyphs.generated.js',
];

class PackedPackageSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

function emit(record, stream = process.stdout) {
  stream.write(`${stringifyCanonicalJson({ suite: 'bijou-gpu-packed-package', ...record })}\n`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new PackedPackageSmokeError(`${command} ${args.join(' ')} exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/**
 * The consumer-side probe. It runs from inside the scratch consumer, so every
 * specifier resolves through the packed copy's package.json `exports`.
 */
const PROBE = `
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const out = (record) => process.stdout.write(JSON.stringify(record) + '\\n');
const fail = (message) => { out({ kind: 'probe-failure', message }); process.exitCode = 1; };

const specifiers = {
  '${PACKAGE_NAME}': ['createWebGL2SurfacePresenter', 'createWebGL2SurfacePresenterCore', 'createWebGPUSurfacePresenter', 'createWebGPUSurfacePresenterCore', 'loadBijouSurfaceShader', 'createInMemoryShaderSource', 'requireShaderText', 'BIJOU_SHADER_ARTIFACT_FILES', 'WEBGL2_SURFACE_SHADER_PIN', 'createCanvas2DSurfacePresenter', 'decodeProceduralGlyphTableText', 'createTestGlyphPack', 'PROCEDURAL_GLYPH_TABLE_SHA256'],
  '${PACKAGE_NAME}/procedural-glyphs': ['BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT', 'loadBundledProceduralGlyphTable', 'verifyProceduralGlyphTable'],
  '${PACKAGE_NAME}/shader-source/webgl2': ['WEBGL2_BUNDLED_SHADER_SOURCE'],
  '${PACKAGE_NAME}/shader-source/webgpu': ['WEBGPU_BUNDLED_SHADER_SOURCE'],
  '${PACKAGE_NAME}/shader-source/node': ['createFileShaderSource'],
};
const modules = {};
const packedRoot = realpathSync(new URL('./node_modules/${PACKAGE_NAME}/', import.meta.url));
for (const [specifier, names] of Object.entries(specifiers)) {
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(specifier)));
  if (!resolved.startsWith(packedRoot)) {
    fail(specifier + ' resolved outside the packed copy: ' + resolved);
  }
  const mod = await import(specifier);
  const missing = names.filter((name) => !(name in mod));
  if (missing.length > 0) {
    fail(specifier + ' is missing ' + missing.join(', '));
  }
  modules[specifier] = mod;
  out({ kind: 'resolved', specifier, path: resolved.slice(packedRoot.length), exports: names });
}

const manifestPath = realpathSync(fileURLToPath(import.meta.resolve('${PACKAGE_NAME}/shaders/bijou-shaders.manifest.json')));
if (!manifestPath.startsWith(packedRoot)) {
  fail('shaders/* resolved outside the packed copy: ' + manifestPath);
}
out({ kind: 'resolved', specifier: '${PACKAGE_NAME}/shaders/bijou-shaders.manifest.json', path: manifestPath.slice(packedRoot.length), exports: [] });

// The procedural glyph table: the published JSON file, the bundled module and the
// Canvas 2D presenter agree, and the presenter is built from the packed copy alone.
const root = modules['${PACKAGE_NAME}'];
const glyphs = modules['${PACKAGE_NAME}/procedural-glyphs'];
const tablePath = realpathSync(fileURLToPath(import.meta.resolve('${PACKAGE_NAME}/procedural-glyphs.json')));
if (!tablePath.startsWith(packedRoot)) {
  fail('procedural-glyphs.json resolved outside the packed copy: ' + tablePath);
}
const tableText = readFileSync(tablePath, 'utf8');
if (sha(tableText) !== root.PROCEDURAL_GLYPH_TABLE_SHA256) {
  fail('the packed procedural-glyphs.json has SHA-256 ' + sha(tableText) + ', not ' + root.PROCEDURAL_GLYPH_TABLE_SHA256);
}
if (tableText !== glyphs.BUNDLED_PROCEDURAL_GLYPH_TABLE_TEXT) {
  fail('the bundled procedural glyph table differs from the packed procedural-glyphs.json');
}
const decoded = root.decodeProceduralGlyphTableText(tableText);
out({ kind: 'procedural-table', path: tablePath.slice(packedRoot.length), sha256: sha(tableText), boxGlyphs: decoded.boxGlyphs.length, blockGlyphs: decoded.blockGlyphs.length });

const pack = root.createTestGlyphPack();
const atlas = {
  bitmap: pack.atlasBitmap,
  resolveSlot: (...args) => root.resolveSlotFromSlotMap(pack.slotMap)(...args),
  atlasGeneration: () => 1,
  getReceiptAssets: () => ({
    atlasGeneration: 1,
    atlasStats: { ...pack.atlasStats },
    fontIdentity: pack.fontIdentity,
    cellPx: { width: pack.atlasBitmap.cellPxW, height: pack.atlasBitmap.cellPxH },
  }),
};
const context = {
  createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
  putImageData() {},
  getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
};
const makeCanvas = () => ({ width: 16, height: 32, getContext: () => context });
try {
  const presenter = root.createCanvas2DSurfacePresenter({ canvas: makeCanvas(), atlas });
  presenter.dispose();
  out({ kind: 'canvas2d-presenter', proceduralTable: 'bundled' });
} catch (error) {
  fail('createCanvas2DSurfacePresenter({ canvas, atlas }) failed from the packed copy: ' + String(error));
}
try {
  const altered = Uint32Array.from(decoded.boxGlyphs);
  altered[0] ^= 1;
  root.createCanvas2DSurfacePresenter({ canvas: makeCanvas(), atlas, proceduralTable: { ...decoded, boxGlyphs: altered } });
  fail('the packed Canvas 2D presenter accepted an altered procedural table');
} catch (error) {
  if (error?.code === 'GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE') {
    out({ kind: 'canvas2d-presenter-refusal', code: error.code, path: error.path });
  } else {
    fail('the packed Canvas 2D presenter refused an altered table with ' + String(error));
  }
}

const files = modules['${PACKAGE_NAME}/shader-source/node'].createFileShaderSource();
if (!files.description.includes(packedRoot.split('/').slice(-3).join('/'))) {
  fail('the file adapter does not default to the packed shaders/: ' + files.description);
}
const manifestText = files.readText('bijou-shaders.manifest.json');
if (manifestText === undefined) {
  fail('the file adapter cannot read the packed manifest');
} else {
  const manifest = JSON.parse(manifestText);
  const pins = new Map();
  for (const shader of manifest.shaders) {
    pins.set(shader.wgslPath.split('/').at(-1), shader.assembledWgslSha256);
    for (const stage of shader.stages) {
      pins.set(stage.path.split('/').at(-1), stage.sha256);
    }
  }
  for (const [file, pin] of pins) {
    const text = files.readText(file);
    const digest = text === undefined ? null : sha(text);
    if (digest !== pin) {
      fail(file + ' from the packed shaders/ has SHA-256 ' + digest + ', not the manifest pin ' + pin);
    }
    out({ kind: 'file-adapter', file, sha256: digest });
  }
  const bundles = [
    modules['${PACKAGE_NAME}/shader-source/webgl2'].WEBGL2_BUNDLED_SHADER_SOURCE,
    modules['${PACKAGE_NAME}/shader-source/webgpu'].WEBGPU_BUNDLED_SHADER_SOURCE,
  ];
  for (const bundle of bundles) {
    for (const file of modules['${PACKAGE_NAME}'].BIJOU_SHADER_ARTIFACT_FILES) {
      const text = bundle.readText(file);
      if (text !== undefined && text !== files.readText(file)) {
        fail(bundle.description + ' ' + file + ' differs from the packed file');
      } else if (text !== undefined) {
        out({ kind: 'bundle-matches-file', source: bundle.description, file, sha256: sha(text) });
      }
    }
  }
}
`;

const scratch = mkdtempSync(join(tmpdir(), 'geordi-bijou-gpu-packed-'));
try {
  run('pnpm', ['pack', '--pack-destination', scratch], PACKAGE_DIR);
  const tarball = readdirSync(scratch).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) {
    throw new PackedPackageSmokeError('pnpm pack wrote no tarball');
  }
  const entries = run('tar', ['-tzf', join(scratch, tarball)], scratch)
    .split('\n')
    .filter((entry) => entry.length > 0);
  const listed = new Set(entries);
  const missing = REQUIRED_ENTRIES.filter((entry) => !listed.has(entry));
  if (missing.length > 0) {
    throw new PackedPackageSmokeError(`the tarball is missing ${missing.join(', ')}`);
  }
  const unexpected = entries.filter(
    (entry) => entry.startsWith('package/shaders/src/') || entry.startsWith('package/shaders/vendor/') || entry.startsWith('package/src/'),
  );
  if (unexpected.length > 0) {
    throw new PackedPackageSmokeError(`the tarball publishes sources it must not: ${unexpected.join(', ')}`);
  }
  for (const entry of entries.filter((name) => name.startsWith('package/shaders/') || name.startsWith('package/procedural/'))) {
    emit({ kind: 'tarball-entry', path: entry });
  }

  const consumer = join(scratch, 'consumer');
  const installed = join(consumer, 'node_modules', '@flyingrobots', 'geordi-bijou-gpu');
  mkdirSync(installed, { recursive: true });
  run('tar', ['-xzf', join(scratch, tarball), '-C', installed, '--strip-components=1'], scratch);
  // The packed package depends on @flyingrobots/geordi-core; link the built workspace copy.
  symlinkSync(join(REPO_ROOT, 'packages', 'core'), join(consumer, 'node_modules', '@flyingrobots', 'geordi-core'), 'dir');
  writeFileSync(join(consumer, 'package.json'), '{"name":"geordi-bijou-gpu-packed-consumer","private":true,"type":"module"}\n');
  writeFileSync(join(consumer, 'probe.mjs'), PROBE);

  const probe = spawnSync(process.execPath, ['probe.mjs'], { cwd: consumer, encoding: 'utf8' });
  const lines = probe.stdout.split('\n').filter((line) => line.length > 0).map((line) => parseJsonValue(line));
  for (const record of lines) {
    emit(record);
  }
  const failures = lines.filter((record) => record.kind === 'probe-failure');
  if (probe.status !== 0 || failures.length > 0) {
    throw new PackedPackageSmokeError(
      `the packed-copy probe failed (exit ${String(probe.status)}): ${failures.map((record) => record.message).join('; ')}${probe.stderr.trim()}`,
    );
  }
  emit({
    kind: 'result',
    ok: true,
    tarball,
    shaderEntries: entries.filter((name) => name.startsWith('package/shaders/')).length,
    resolved: lines.filter((record) => record.kind === 'resolved').length,
  });
} catch (error) {
  emit(
    { kind: 'error', name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) },
    process.stderr,
  );
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
