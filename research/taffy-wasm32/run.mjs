/* eslint-disable no-restricted-syntax -- A standalone research harness: it reads and writes its own
   JSON Lines and golden file directly, outside the compiler's JsonPort boundary. */
// Cross-target determinism experiment for Taffy block and flex layout (flyingrobots/geordi#136).
//
// Builds the scratch crate in this directory natively and for wasm32-unknown-unknown, runs the
// same 50 generated trees on each, and compares every output value bit for bit: each variant
// against the native release build of this run (with a per-field diff), and every variant against
// the per-tree SHA-256 values in golden.json, which were recorded on another host.
//
// Output is JSON Lines on stdout. Exit status is 1 when any compared variant differs, or when a
// variant cannot run under CI (CI=true). Outside CI, a variant this machine cannot build or run is
// reported as a refusal and skipped.
//
//   node research/taffy-wasm32/run.mjs                 compare
//   node research/taffy-wasm32/run.mjs --write-golden  rewrite golden.json from this host
//   node research/taffy-wasm32/run.mjs --help          describe the command

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const goldenPath = join(here, 'golden.json');
const crateName = 'taffy_wasm32_determinism';
const schemaVersion = '1.0.0';
const fieldNames = [
  'order',
  'location.x',
  'location.y',
  'size.width',
  'size.height',
  'scrollable_overflow_rect.left',
  'scrollable_overflow_rect.right',
  'scrollable_overflow_rect.top',
  'scrollable_overflow_rect.bottom',
  'scrollbar_size.width',
  'scrollbar_size.height',
  'border.left',
  'border.right',
  'border.top',
  'border.bottom',
  'padding.left',
  'padding.right',
  'padding.top',
  'padding.bottom',
  'margin.left',
  'margin.right',
  'margin.top',
  'margin.bottom',
];
const wordsPerLayout = fieldNames.length;
const wordsPerNode = 1 + 2 * wordsPerLayout;
const maxReportedFields = 20;
const inCi = process.env.CI === 'true';

const messageSchemas = JSON.parse(
  readFileSync(join(repoRoot, 'schemas', 'geordi-research-taffy-wasm32', 'messages.schema.json'), 'utf8'),
).$defs;

// Checks each line's keys against its declared schema before writing it: a partial check (keys,
// not value types) that keeps the schema file and the output from drifting apart.
const emit = (kind, fields) => {
  const line = {
    _schema: { id: `geordi.research.taffy_wasm32.${kind}`, version: schemaVersion },
    kind,
    ...fields,
  };
  const schema = messageSchemas[kind];
  const keys = Object.keys(line);
  if (
    schema === undefined ||
    schema.required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in schema.properties))
  ) {
    process.stdout.write(
      `${JSON.stringify({
        _schema: { id: 'geordi.research.taffy_wasm32.error', version: schemaVersion },
        kind: 'error',
        code: 'schema-violation',
        message: `a ${kind} line does not match messages.schema.json`,
      })}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(line)}\n`);
};

class ExperimentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: here,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

const toolchain = () => {
  const verbose = execFileSync('rustc', ['-vV'], { cwd: here, encoding: 'utf8' });
  const line = (key) => verbose.split('\n').find((entry) => entry.startsWith(`${key}: `))?.slice(key.length + 2);
  const sysroot = execFileSync('rustc', ['--print', 'sysroot'], { cwd: here, encoding: 'utf8' }).trim();
  return {
    rustc: verbose.split('\n')[0],
    host: line('host'),
    llvm: line('LLVM version'),
    wasm32Std: existsSync(join(sysroot, 'lib', 'rustlib', 'wasm32-unknown-unknown', 'lib')),
  };
};

const lockedTaffyVersion = () => {
  const lock = readFileSync(join(here, 'Cargo.lock'), 'utf8');
  const match = /\[\[package\]\]\nname = "taffy"\nversion = "([^"]+)"/u.exec(lock);
  return match?.[1] ?? null;
};

const variants = [
  { name: 'native-release', target: 'native', profile: 'release', rustflags: '', runner: 'native' },
  {
    name: 'native-release-target-cpu-native',
    target: 'native',
    profile: 'release',
    rustflags: '-C target-cpu=native',
    runner: 'native',
  },
  { name: 'native-debug', target: 'native', profile: 'dev', rustflags: '', runner: 'native' },
  { name: 'wasm32-release-node', target: 'wasm32', profile: 'release', rustflags: '', runner: 'node' },
  {
    name: 'wasm32-release-simd128-node',
    target: 'wasm32',
    profile: 'release',
    rustflags: '-C target-feature=+simd128',
    runner: 'node',
  },
  { name: 'wasm32-release-chromium', target: 'wasm32', profile: 'release', rustflags: '', runner: 'browser' },
];

const targetDir = (variant) =>
  join(here, 'target', `${variant.target}-${variant.profile}${variant.rustflags === '' ? '' : '-flags'}`);

const build = (variant) => {
  const args = ['build', '--locked', '--profile', variant.profile];
  if (variant.target === 'wasm32') {
    args.push('--lib', '--target', 'wasm32-unknown-unknown');
  }
  const result = run('cargo', args, {
    env: { ...process.env, CARGO_TARGET_DIR: targetDir(variant), RUSTFLAGS: variant.rustflags },
  });
  if (!result.ok) {
    return { ok: false, reason: result.stderr.split('\n').filter((entry) => entry.startsWith('error')).join('; ') };
  }
  const profileDir = variant.profile === 'dev' ? 'debug' : variant.profile;
  const artifact =
    variant.target === 'wasm32'
      ? join(targetDir(variant), 'wasm32-unknown-unknown', profileDir, `${crateName}.wasm`)
      : join(targetDir(variant), profileDir, 'taffy-wasm32-determinism');
  return { ok: true, artifact };
};

const runNative = (artifact) => {
  const result = run(artifact, []);
  if (!result.ok) {
    throw new ExperimentError('native-run-failed', result.stderr);
  }
  const line = JSON.parse(result.stdout.trim());
  return { bytes: Buffer.from(line.bytes, 'hex'), engine: null };
};

const runNode = async (artifact) => {
  const { instance } = await WebAssembly.instantiate(readFileSync(artifact), {});
  const length = instance.exports.dump_len();
  const pointer = instance.exports.dump_ptr();
  const bytes = Buffer.from(new Uint8Array(instance.exports.memory.buffer, pointer, length));
  return { bytes, engine: `node ${process.version} (V8 ${process.versions.v8})` };
};

const loadPlaywright = () => {
  const require = createRequire(join(repoRoot, 'examples', 'browser-render-everywhere', 'package.json'));
  return require('@playwright/test');
};

const launchBrowser = async () => {
  const { chromium } = loadPlaywright();
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return chromium.launch();
  }
};

const runBrowser = async (artifact) => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const encoded = await page.evaluate(async (moduleBase64) => {
      const binary = Uint8Array.from(atob(moduleBase64), (character) => character.charCodeAt(0));
      const { instance } = await WebAssembly.instantiate(binary, {});
      // Run the experiment before touching memory.buffer: it grows memory, which detaches the old buffer.
      const length = instance.exports.dump_len();
      const pointer = instance.exports.dump_ptr();
      const view = new Uint8Array(instance.exports.memory.buffer, pointer, length);
      let text = '';
      for (let offset = 0; offset < view.length; offset += 0x8000) {
        text += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
      }
      return btoa(text);
    }, readFileSync(artifact).toString('base64'));
    const userAgent = await page.evaluate(() => navigator.userAgent);
    return { bytes: Buffer.from(encoded, 'base64'), engine: `${browser.browserType().name()} ${browser.version()} (${userAgent})` };
  } finally {
    await browser.close();
  }
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Splits the stream into one Uint32Array of words per tree.
const decode = (bytes) => {
  if (bytes.subarray(0, 4).toString('latin1') !== 'TFY1') {
    throw new ExperimentError('bad-stream', 'stream does not start with TFY1');
  }
  const word = (offset) => bytes.readUInt32LE(offset);
  const treeCount = word(4);
  const trees = [];
  let offset = 8;
  for (let index = 0; index < treeCount; index += 1) {
    const nodeCount = word(offset + 4);
    const end = offset + 12 + nodeCount * wordsPerNode * 4;
    trees.push({ index: word(offset), nodeCount, status: word(offset + 8), bytes: bytes.subarray(offset, end) });
    offset = end;
  }
  if (offset !== bytes.length) {
    throw new ExperimentError('bad-stream', `stream has ${bytes.length - offset} trailing bytes`);
  }
  return trees;
};

const isNaNBits = (bits) => (bits & 0x7f800000) === 0x7f800000 && (bits & 0x007fffff) !== 0;

const classify = (a, b) => {
  if (isNaNBits(a) && isNaNBits(b)) {
    return 'nan-payload-or-sign';
  }
  if ((a === 0 && b === 0x80000000) || (a === 0x80000000 && b === 0)) {
    return 'signed-zero';
  }
  return 'value';
};

const hex32 = (value) => `0x${value.toString(16).padStart(8, '0')}`;

// Locates the differing fields between two decoded trees.
const diffTree = (reference, candidate, limit) => {
  const fields = [];
  let count = 0;
  const ref = reference.bytes;
  const cand = candidate.bytes;
  if (ref.length !== cand.length) {
    return { count: 1, fields: [{ field: 'node_count', reference: reference.nodeCount, candidate: candidate.nodeCount }] };
  }
  for (let offset = 12; offset < ref.length; offset += 4) {
    const a = ref.readUInt32LE(offset);
    const b = cand.readUInt32LE(offset);
    if (a !== b) {
      count += 1;
      if (fields.length < limit) {
        const wordInNode = ((offset - 12) / 4) % wordsPerNode;
        const node = Math.floor((offset - 12) / 4 / wordsPerNode);
        const pass = wordInNode === 0 ? 'depth' : wordInNode <= wordsPerLayout ? 'rounded' : 'unrounded';
        const field = wordInNode === 0 ? 'depth' : fieldNames[(wordInNode - 1) % wordsPerLayout];
        fields.push({ node, pass, field, reference: hex32(a), candidate: hex32(b), class: classify(a, b) });
      }
    }
  }
  return { count, fields };
};

const summarise = (bytes) => {
  const trees = decode(bytes);
  let nanWords = 0;
  let negativeZeroWords = 0;
  let subnormalWords = 0;
  for (const tree of trees) {
    for (let offset = 12; offset < tree.bytes.length; offset += 4) {
      const wordInNode = ((offset - 12) / 4) % wordsPerNode;
      if (wordInNode === 0 || wordInNode === 1 || wordInNode === 1 + wordsPerLayout) {
        continue;
      }
      const bits = tree.bytes.readUInt32LE(offset);
      nanWords += isNaNBits(bits) ? 1 : 0;
      negativeZeroWords += bits === 0x80000000 ? 1 : 0;
      subnormalWords += (bits & 0x7f800000) === 0 && (bits & 0x007fffff) !== 0 ? 1 : 0;
    }
  }
  return {
    trees,
    treeCount: trees.length,
    failedTrees: trees.filter((tree) => tree.status !== 0).map((tree) => tree.index),
    nodeCount: trees.reduce((total, tree) => total + tree.nodeCount, 0),
    streamSha256: sha256(bytes),
    nanWords,
    negativeZeroWords,
    subnormalWords,
  };
};

const help = () => {
  emit('help', {
    command: 'node research/taffy-wasm32/run.mjs [--write-golden] [--help]',
    description:
      'Builds the Taffy experiment of flyingrobots/geordi#136 natively and for wasm32-unknown-unknown, runs 50 generated block and flex trees on each, and compares every output value bit for bit against the native release build and against golden.json.',
    emits: ['host', 'variant', 'refusal', 'mismatch', 'tree-dump', 'golden', 'summary', 'error'],
    schemas: 'schemas/geordi-research-taffy-wasm32/',
  });
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    help();
    return 0;
  }
  const writeGolden = args.includes('--write-golden');
  const chain = toolchain();
  const taffy = lockedTaffyVersion();
  emit('host', {
    platform: platform(),
    osRelease: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? null,
    node: process.version,
    ci: inCi,
    taffy,
    ...chain,
  });

  const results = [];
  let failed = false;
  for (const variant of variants) {
    if (variant.target === 'wasm32' && !chain.wasm32Std) {
      emit('refusal', { variant: variant.name, reason: 'the wasm32-unknown-unknown standard library is not installed for this rustc' });
      failed ||= inCi;
      continue;
    }
    const built = build(variant);
    if (!built.ok) {
      emit('refusal', { variant: variant.name, reason: `build failed: ${built.reason}` });
      failed ||= inCi;
      continue;
    }
    let output;
    try {
      output =
        variant.runner === 'native'
          ? runNative(built.artifact)
          : variant.runner === 'node'
            ? await runNode(built.artifact)
            : await runBrowser(built.artifact);
    } catch (error) {
      emit('refusal', { variant: variant.name, reason: `run failed: ${error.message.split('\n')[0]}` });
      failed ||= inCi;
      continue;
    }
    const summary = summarise(output.bytes);
    results.push({ variant, summary });
    emit('variant', {
      variant: variant.name,
      target: variant.target === 'native' ? chain.host : 'wasm32-unknown-unknown',
      profile: variant.profile,
      rustflags: variant.rustflags,
      engine: output.engine,
      treeCount: summary.treeCount,
      failedTrees: summary.failedTrees,
      nodeCount: summary.nodeCount,
      valueCount: summary.nodeCount * 2 * wordsPerLayout,
      streamSha256: summary.streamSha256,
      nanWords: summary.nanWords,
      negativeZeroWords: summary.negativeZeroWords,
      subnormalWords: summary.subnormalWords,
    });
  }

  const reference = results.find((result) => result.variant.name === 'native-release');
  if (reference === undefined) {
    throw new ExperimentError('no-reference', 'the native release build did not run');
  }

  for (const { variant, summary } of results) {
    if (variant === reference.variant) {
      continue;
    }
    for (const [index, tree] of summary.trees.entries()) {
      const diff = diffTree(reference.summary.trees[index], tree, maxReportedFields);
      if (diff.count > 0) {
        failed = true;
        emit('mismatch', {
          against: `${reference.variant.name} (${chain.host}, this run)`,
          variant: variant.name,
          tree: tree.index,
          differingWords: diff.count,
          fields: diff.fields,
        });
      }
    }
  }

  if (writeGolden) {
    const golden = {
      format: 'TFY1',
      taffy,
      recordedOn: { host: chain.host, rustc: chain.rustc, platform: platform(), arch: arch() },
      variant: reference.variant.name,
      treeCount: reference.summary.treeCount,
      nodeCount: reference.summary.nodeCount,
      streamSha256: reference.summary.streamSha256,
      treeSha256: reference.summary.trees.map((tree) => sha256(tree.bytes)),
    };
    writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`);
    emit('golden', { action: 'written', path: 'research/taffy-wasm32/golden.json', streamSha256: golden.streamSha256 });
  } else {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
    for (const { variant, summary } of results) {
      const differingTrees = summary.trees
        .filter((tree, index) => sha256(tree.bytes) !== golden.treeSha256[index])
        .map((tree) => tree.index);
      const matches = summary.streamSha256 === golden.streamSha256;
      failed ||= !matches;
      // The golden file holds hashes only, so a cross-host difference is located by writing the
      // differing trees' bytes to the log, to be diffed against a local run on the golden host.
      for (const index of differingTrees.slice(0, 3)) {
        emit('tree-dump', { variant: variant.name, tree: index, bytes: summary.trees[index].bytes.toString('hex') });
      }
      emit('golden', {
        action: 'compared',
        variant: variant.name,
        against: `golden.json (${golden.recordedOn.host}, ${golden.recordedOn.rustc})`,
        matches,
        differingTrees,
      });
    }
  }

  emit('summary', {
    ok: !failed,
    comparedVariants: results.map((result) => result.variant.name),
    referenceStreamSha256: reference.summary.streamSha256,
  });
  return failed ? 1 : 0;
};

try {
  process.exitCode = await main();
} catch (error) {
  emit('error', { code: error.code ?? 'unexpected', message: String(error.message ?? error) });
  process.exitCode = 1;
}
