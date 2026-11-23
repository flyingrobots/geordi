/* eslint-disable no-restricted-syntax -- A standalone research harness: it reads and writes its own
   JSON Lines and golden file directly, outside the compiler's JsonPort boundary. */
// Cross-target determinism experiment for rustybuzz shaping (flyingrobots/geordi#137).
//
// Builds the scratch crate in this directory natively and for wasm32-unknown-unknown, shapes the
// same 200 Latin strings with the pinned Lato Regular face under five configurations on each, and
// compares every glyph id, cluster, flag, advance and offset bit for bit: each variant against
// the native release build of this run (with a per-field diff), and every variant against the
// per-run SHA-256 values in golden.json, which were recorded on another host.
//
// Output is JSON Lines on stdout. Exit status is 1 when any compared variant differs, or when a
// variant cannot run under CI (CI=true). Outside CI, a variant this machine cannot build or run is
// reported as a refusal and skipped.
//
//   node research/rustybuzz-wasm32/run.mjs                 compare
//   node research/rustybuzz-wasm32/run.mjs --write-golden  rewrite golden.json from this host
//   node research/rustybuzz-wasm32/run.mjs --help          describe the command

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
const crateName = 'rustybuzz_wasm32_determinism';
const binaryName = 'rustybuzz-wasm32-determinism';
const schemaVersion = '1.0.0';
const configNames = [
  'ltr-default',
  'ltr-no-kern-no-liga-characters',
  'ltr-optional-features-turkish',
  'rtl-forced',
  'vertical',
];
const fieldNames = ['glyph_id', 'cluster', 'unsafe_to_break', 'x_advance', 'y_advance', 'x_offset', 'y_offset'];
const wordsPerGlyph = fieldNames.length;
const maxReportedFields = 20;
const inCi = process.env.CI === 'true';

const messageSchemas = JSON.parse(
  readFileSync(join(repoRoot, 'schemas', 'geordi-research-rustybuzz-wasm32', 'messages.schema.json'), 'utf8'),
).$defs;

// Checks each line's keys against its declared schema before writing it: a partial check (keys,
// not value types) that keeps the schema file and the output from drifting apart.
const emit = (kind, fields) => {
  const line = {
    _schema: { id: `geordi.research.rustybuzz_wasm32.${kind}`, version: schemaVersion },
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
        _schema: { id: 'geordi.research.rustybuzz_wasm32.error', version: schemaVersion },
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
  const stderr = result.stderr ?? '';
  // Keep why a process failed: a startup error (ENOENT for a missing executable, EACCES and
  // others), a signal, or an exit status, alongside whatever it wrote to stderr.
  const failure =
    result.error !== undefined
      ? result.error.code === 'ENOENT'
        ? `${command} not found`
        : `${command} could not start: ${result.error.message}`
      : result.signal !== null
        ? `${command} killed by ${result.signal}`
        : result.status === 0
          ? null
          : `${command} exited with status ${result.status}`;
  return { ok: failure === null, failure, stdout: result.stdout ?? '', stderr };
};

const describeFailure = (result) => {
  const errors = result.stderr.split('\n').filter((entry) => entry.startsWith('error'));
  return [result.failure, ...errors].join('; ');
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

const lockedVersion = (name) => {
  const lock = readFileSync(join(here, 'Cargo.lock'), 'utf8');
  const match = new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`, 'u').exec(lock);
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

// Builds one variant for an explicit target triple, so the artifact path does not depend on an
// inherited CARGO_BUILD_TARGET or build.target, and with only the variant's RUSTFLAGS: an inherited
// CARGO_ENCODED_RUSTFLAGS would take precedence over RUSTFLAGS, so it is removed.
const build = (variant, hostTriple) => {
  const triple = variant.target === 'wasm32' ? 'wasm32-unknown-unknown' : hostTriple;
  const args = ['build', '--locked', '--profile', variant.profile, '--target', triple];
  if (variant.target === 'wasm32') {
    args.push('--lib');
  }
  const env = { ...process.env, CARGO_TARGET_DIR: targetDir(variant), RUSTFLAGS: variant.rustflags };
  delete env.CARGO_ENCODED_RUSTFLAGS;
  delete env.CARGO_BUILD_TARGET;
  const result = run('cargo', args, { env });
  if (!result.ok) {
    return { ok: false, reason: describeFailure(result) };
  }
  const profileDir = variant.profile === 'dev' ? 'debug' : variant.profile;
  const artifact =
    variant.target === 'wasm32'
      ? join(targetDir(variant), triple, profileDir, `${crateName}.wasm`)
      : join(targetDir(variant), triple, profileDir, binaryName);
  return { ok: true, artifact };
};

const runNative = (artifact) => {
  const result = run(artifact, []);
  if (!result.ok) {
    throw new ExperimentError('native-run-failed', describeFailure(result));
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

// Splits the stream into one entry per shaped run (one string under one configuration).
const decode = (bytes) => {
  if (bytes.subarray(0, 4).toString('latin1') !== 'RBZ1') {
    throw new ExperimentError('bad-stream', 'stream does not start with RBZ1');
  }
  const word = (offset) => bytes.readUInt32LE(offset);
  const runCount = word(4);
  const runs = [];
  let offset = 8;
  for (let index = 0; index < runCount; index += 1) {
    const glyphCount = word(offset + 8);
    const end = offset + 12 + glyphCount * wordsPerGlyph * 4;
    runs.push({ config: word(offset), string: word(offset + 4), glyphCount, bytes: bytes.subarray(offset, end) });
    offset = end;
  }
  if (offset !== bytes.length) {
    throw new ExperimentError('bad-stream', `stream has ${bytes.length - offset} trailing bytes`);
  }
  return runs;
};

const hex32 = (value) => `0x${value.toString(16).padStart(8, '0')}`;

// Locates the differing fields between two decoded runs.
const diffRun = (reference, candidate, limit) => {
  const ref = reference.bytes;
  const cand = candidate.bytes;
  if (ref.length !== cand.length) {
    return {
      count: 1,
      fields: [{ field: 'glyph_count', reference: reference.glyphCount, candidate: candidate.glyphCount }],
    };
  }
  const fields = [];
  let count = 0;
  for (let offset = 12; offset < ref.length; offset += 4) {
    const a = ref.readUInt32LE(offset);
    const b = cand.readUInt32LE(offset);
    if (a !== b) {
      count += 1;
      if (fields.length < limit) {
        const index = (offset - 12) / 4;
        fields.push({
          glyph: Math.floor(index / wordsPerGlyph),
          field: fieldNames[index % wordsPerGlyph],
          reference: hex32(a),
          candidate: hex32(b),
        });
      }
    }
  }
  return { count, fields };
};

// Evidence that the inputs reach the features under test: per configuration, how many runs have
// fewer glyphs than code points (ligatures and compositions), nonzero offsets (mark positioning),
// and the number of strings whose total advance under the default configuration differs from
// the no-kern, no-liga one.
const coverage = (runs, texts) => {
  const perConfig = configNames.map((name) => ({ name, runs: 0, glyphs: 0, merged: 0, offsets: 0, notdef: 0 }));
  for (const run of runs) {
    const entry = perConfig[run.config];
    entry.runs += 1;
    entry.glyphs += run.glyphCount;
    if (run.glyphCount < [...texts[run.string]].length) {
      entry.merged += 1;
    }
    let hasOffset = false;
    for (let glyph = 0; glyph < run.glyphCount; glyph += 1) {
      const base = 12 + glyph * wordsPerGlyph * 4;
      hasOffset ||= run.bytes.readInt32LE(base + 20) !== 0 || run.bytes.readInt32LE(base + 24) !== 0;
      entry.notdef += run.bytes.readUInt32LE(base) === 0 ? 1 : 0;
    }
    entry.offsets += hasOffset ? 1 : 0;
  }
  const totalAdvance = (run) => {
    let total = 0;
    for (let glyph = 0; glyph < run.glyphCount; glyph += 1) {
      total += run.bytes.readInt32LE(12 + glyph * wordsPerGlyph * 4 + 12);
    }
    return total;
  };
  const plainAdvance = new Map(runs.filter((run) => run.config === 1).map((run) => [run.string, totalAdvance(run)]));
  let kernedOrLigated = 0;
  for (const run of runs.filter((entry) => entry.config === 0)) {
    kernedOrLigated += totalAdvance(run) === plainAdvance.get(run.string) ? 0 : 1;
  }
  return { perConfig, defaultAdvanceDiffersFromNoKernNoLiga: kernedOrLigated };
};

const summarise = (bytes) => {
  const runs = decode(bytes);
  return {
    runs,
    runCount: runs.length,
    glyphCount: runs.reduce((total, run) => total + run.glyphCount, 0),
    streamSha256: sha256(bytes),
  };
};

const nativeStrings = (artifact) => {
  const result = run(artifact, ['--glyphs']);
  if (!result.ok) {
    throw new ExperimentError('native-run-failed', describeFailure(result));
  }
  const texts = [];
  for (const line of result.stdout.trim().split('\n')) {
    const parsed = JSON.parse(line);
    texts[parsed.string] = parsed.text;
  }
  return texts;
};

const help = () => {
  emit('help', {
    command: 'node research/rustybuzz-wasm32/run.mjs [--write-golden] [--help]',
    description:
      'Builds the rustybuzz experiment of flyingrobots/geordi#137 natively and for wasm32-unknown-unknown, shapes 200 Latin strings with the pinned Lato Regular face under five configurations on each, and compares every glyph id, cluster, flag, advance and offset bit for bit against the native release build and against golden.json.',
    emits: ['host', 'variant', 'coverage', 'refusal', 'mismatch', 'run-dump', 'golden', 'summary', 'error'],
    schemas: 'schemas/geordi-research-rustybuzz-wasm32/',
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
  const fontSha256 = sha256(
    readFileSync(join(repoRoot, 'fixtures', 'render-everywhere', 'assets', 'fonts', 'lato', 'Lato-Regular.ttf')),
  );
  emit('host', {
    platform: platform(),
    osRelease: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? null,
    node: process.version,
    ci: inCi,
    rustybuzz: lockedVersion('rustybuzz'),
    ttfParser: lockedVersion('ttf-parser'),
    fontSha256,
    ...chain,
  });

  const results = [];
  let texts = null;
  let failed = false;
  for (const variant of variants) {
    if (variant.target === 'wasm32' && !chain.wasm32Std) {
      emit('refusal', { variant: variant.name, reason: 'the wasm32-unknown-unknown standard library is not installed for this rustc' });
      failed ||= inCi;
      continue;
    }
    const built = build(variant, chain.host);
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
    if (texts === null && variant.runner === 'native') {
      texts = nativeStrings(built.artifact);
    }
    const summary = summarise(output.bytes);
    results.push({ variant, summary });
    emit('variant', {
      variant: variant.name,
      target: variant.target === 'native' ? chain.host : 'wasm32-unknown-unknown',
      profile: variant.profile,
      rustflags: variant.rustflags,
      engine: output.engine,
      runCount: summary.runCount,
      glyphCount: summary.glyphCount,
      valueCount: summary.glyphCount * wordsPerGlyph,
      streamSha256: summary.streamSha256,
    });
  }

  const reference = results.find((result) => result.variant.name === 'native-release');
  if (reference === undefined || texts === null) {
    throw new ExperimentError('no-reference', 'the native release build did not run');
  }
  emit('coverage', { variant: reference.variant.name, ...coverage(reference.summary.runs, texts) });

  for (const { variant, summary } of results) {
    if (variant === reference.variant) {
      continue;
    }
    // The verdict is the whole-stream digest; the per-run diff only locates a difference.
    if (summary.streamSha256 !== reference.summary.streamSha256) {
      failed = true;
    }
    const runCount = Math.max(summary.runs.length, reference.summary.runs.length);
    for (let index = 0; index < runCount; index += 1) {
      const shaped = summary.runs[index];
      const expected = reference.summary.runs[index];
      if (shaped === undefined || expected === undefined) {
        const present = shaped ?? expected;
        emit('mismatch', {
          against: `${reference.variant.name} (${chain.host}, this run)`,
          variant: variant.name,
          config: configNames[present.config] ?? String(present.config),
          string: present.string,
          text: texts[present.string] ?? '',
          differingWords: 1,
          fields: [{ field: 'run', reference: expected === undefined ? 'missing' : 'present', candidate: shaped === undefined ? 'missing' : 'present' }],
        });
        continue;
      }
      const headerDiffers = !shaped.bytes.subarray(0, 12).equals(expected.bytes.subarray(0, 12));
      const diff = headerDiffers
        ? { count: 1, fields: [{ field: 'run header', reference: expected.bytes.subarray(0, 12).toString('hex'), candidate: shaped.bytes.subarray(0, 12).toString('hex') }] }
        : diffRun(expected, shaped, maxReportedFields);
      if (diff.count > 0) {
        failed = true;
        emit('mismatch', {
          against: `${reference.variant.name} (${chain.host}, this run)`,
          variant: variant.name,
          config: configNames[shaped.config] ?? String(shaped.config),
          string: shaped.string,
          text: texts[shaped.string] ?? '',
          differingWords: diff.count,
          fields: diff.fields,
        });
      }
    }
  }

  if (writeGolden && failed) {
    emit('golden', { action: 'not-written', path: 'research/rustybuzz-wasm32/golden.json', reason: 'the run failed' });
  } else if (writeGolden) {
    const golden = {
      format: 'RBZ1',
      rustybuzz: lockedVersion('rustybuzz'),
      ttfParser: lockedVersion('ttf-parser'),
      fontSha256,
      recordedOn: { host: chain.host, rustc: chain.rustc, platform: platform(), arch: arch() },
      variant: reference.variant.name,
      runCount: reference.summary.runCount,
      glyphCount: reference.summary.glyphCount,
      streamSha256: reference.summary.streamSha256,
      runSha256: reference.summary.runs.map((shaped) => sha256(shaped.bytes)),
    };
    writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`);
    emit('golden', { action: 'written', path: 'research/rustybuzz-wasm32/golden.json', streamSha256: golden.streamSha256 });
  } else {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
    for (const { variant, summary } of results) {
      const differingRuns = summary.runs
        .map((shaped, index) => ({ shaped, index }))
        .filter(({ shaped, index }) => sha256(shaped.bytes) !== golden.runSha256[index])
        .map(({ index }) => index);
      const matches =
        summary.streamSha256 === golden.streamSha256 &&
        summary.runs.length === golden.runSha256.length &&
        differingRuns.length === 0;
      failed ||= !matches;
      // The golden file holds hashes only, so a cross-host difference is located by writing the
      // differing runs' bytes to the log, to be diffed against a local run on the golden host.
      for (const index of differingRuns.slice(0, 5)) {
        const shaped = summary.runs[index];
        emit('run-dump', {
          variant: variant.name,
          run: index,
          config: configNames[shaped.config],
          string: shaped.string,
          bytes: shaped.bytes.toString('hex'),
        });
      }
      emit('golden', {
        action: 'compared',
        variant: variant.name,
        against: `golden.json (${golden.recordedOn.host}, ${golden.recordedOn.rustc})`,
        matches,
        differingRuns,
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
