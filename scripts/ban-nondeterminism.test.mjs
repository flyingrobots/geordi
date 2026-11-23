/* eslint-disable no-restricted-syntax -- The test reads the command's JSON Lines output and its
   schemas, which are JSON documents by definition; no JsonPort is available to a script test. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  CANONICAL_RUST_PATHS,
  RUST_PATTERNS,
  inlineWaivedLines,
  parseAllowlist,
  scanRust,
} from './lib/nondeterminism.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const COMMAND = join(REPO_ROOT, 'scripts', 'ban-nondeterminism.mjs');
const SCHEMA_DIR = join(REPO_ROOT, 'schemas', 'geordi-ban-nondeterminism');

/** Echo's rule IDs that the Rust scan carries, one row of Echo's script each. */
const ECHO_RUST_RULES = [
  'time-system',
  'time-instant',
  'thread-sleep',
  'host-parallelism',
  'random',
  'host-callback',
  'network',
  'unordered-container',
  'hand-hashed-table',
  'json-serialization',
  'wasm-serde',
  'float-sentinel',
  'float-op',
  'std-env',
  'std-fs',
  'std-process',
];

// A snippet each rule must report, and one it must not.
const MUST_REPORT = {
  'time-system': ['let t = std::time::SystemTime::now();', 'use std::time::SystemTime;'],
  'time-instant': ['let t = Instant::now();', 'use std::time::Instant;'],
  'thread-sleep': ['std::thread::sleep(d);', 'tokio::time::sleep(d).await;'],
  'host-parallelism': ['let n = std::thread::available_parallelism();', 'let n = available_parallelism ();'],
  random: ['let x = rand::random::<u8>();', 'getrandom::getrandom(&mut b);', 'fastrand::u8(..);'],
  'host-callback': ['let f: js_sys::Function = g;', 'let c = Closure<dyn Fn()>::new(f);'],
  network: ['let s = std::net::TcpStream::connect(a);', 'reqwest::get(u);', 'ureq::get(u);'],
  'unordered-container': [
    'let m: std::collections::HashMap<u8, u8> = x;',
    'use std::collections::{BTreeMap, HashSet};',
    'let m = HashMap<u8, u8>::new();',
    'use rustc_hash::FxHashMap;',
  ],
  'hand-hashed-table': ['// open addressing with linear probing', '// Open-Addressing table'],
  'json-serialization': ['let v = serde_json::from_str(s);'],
  'wasm-serde': ['serde_wasm_bindgen::to_value(&v);'],
  'float-sentinel': ['let x = f64::NAN;', 'let x = f32::INFINITY;', 'let x = f64::NEG_INFINITY;'],
  'float-op': ['let y = x.sin();', 'let y = x.cos();', 'let y = x.tan();', 'let y = x.sqrt();', 'let y = x.powf(2.0);', 'let y = c.pow(2);'],
  'std-env': ['let v = std::env::var("X");', 'use std::env;', 'let d = env::temp_dir();'],
  'std-fs': ['let b = std::fs::read(p);', 'use std::fs;', 'let b = fs::read_to_string(p);'],
  'std-process': ['let p = std::process::id();', 'use std::process;', 'process::exit(1);'],
};

const MUST_NOT_REPORT = {
  'time-system': ['let t = Duration::from_secs(1);', '// a SystemTimeline struct'],
  'time-instant': ['let t = InstantaneousRate::new();'],
  'thread-sleep': ['let s = sleeper.name();'],
  'host-parallelism': ['let n = workers.len();'],
  random: ['let operand = 1; let brand = 2;'],
  'host-callback': ['let c = ClosureBox::new();'],
  network: ['let n = std::collections::BTreeMap::new();'],
  'unordered-container': [
    'let m: std::collections::BTreeMap<u8, u8> = x;',
    'let m = HashMapLike::new();',
    'use std::collections::{BTreeMap, BTreeSet};',
  ],
  'hand-hashed-table': ['// the table is a sorted vector'],
  'json-serialization': ['let v = serde_derive::x();'],
  'wasm-serde': ['let v = serde::de::x();'],
  'float-sentinel': ['let x = f64::from(1_u8);', 'let x = i64::MAX;'],
  'float-op': ['let y = x.checked_pow(2);', 'let y = x.wrapping_add(1);'],
  'std-env': ['let v = environment::var("X");', 'let x = my_env::value();'],
  'std-fs': ['let b = confs::read(p);', 'let x = offs::read_count;'],
  'std-process': ['let p = my_process::id();', 'let x = processor::count();'],
};

function withTree(files, body) {
  const root = mkdtempSync(join(tmpdir(), 'ban-nondeterminism-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function scan(source, { allowlist = '' } = {}) {
  return withTree({ 'crate/src/lib.rs': `${source}\n` }, (root) =>
    scanRust({ root, paths: ['crate'], waivers: parseAllowlist(allowlist) }),
  );
}

function run(args, { root = REPO_ROOT, env = {} } = {}) {
  const result = spawnSync(process.execPath, [COMMAND, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DETERMINISM_PATHS: '', DETERMINISM_ALLOWLIST: '', ...env },
  });
  const lines = (text) => text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  return { status: result.status, stdout: lines(result.stdout), stderr: lines(result.stderr), raw: result };
}

/** The subset of JSON Schema 2020-12 the declared schemas use. */
function validate(schema, value, path = '$') {
  const fail = (message) => assert.fail(`${path}: ${message}`);
  if ('const' in schema && value !== schema.const) fail(`expected ${String(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(value)) fail(`${String(value)} is not allowed`);
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('expected an object');
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property === undefined) {
        if (schema.additionalProperties === false) fail(`unexpected ${key}`);
      } else validate(property, item, `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('expected an array');
    value.forEach((item, index) => schema.items && validate(schema.items, item, `${path}[${String(index)}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail('expected a string');
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('too short');
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value)) fail('expected an integer');
    if (schema.minimum !== undefined && value < schema.minimum) fail('below minimum');
  }
}

const SCHEMAS = new Map(
  readdirSync(SCHEMA_DIR)
    .filter((file) => file.endsWith('.schema.json'))
    .map((file) => {
      const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
      return [schema['x-schema-id'], schema];
    }),
);

function assertValid(records) {
  assert.ok(records.length > 0, 'at least one line');
  for (const record of records) {
    const schema = SCHEMAS.get(record._schema?.id);
    assert.ok(schema, `a declared schema for ${JSON.stringify(record)}`);
    validate(schema, record);
  }
}

test('every Echo rule ID has a Rust pattern, a report case and a no-report case', () => {
  const present = new Set(RUST_PATTERNS.map((entry) => entry.rule));
  for (const rule of ECHO_RUST_RULES) {
    assert.ok(present.has(rule), `a pattern for ${rule}`);
    assert.ok((MUST_REPORT[rule] ?? []).length > 0, `a report case for ${rule}`);
    assert.ok((MUST_NOT_REPORT[rule] ?? []).length > 0, `a no-report case for ${rule}`);
  }
  assert.deepEqual([...present].sort(), [...ECHO_RUST_RULES].sort(), 'no rule ID that is not Echo\'s');
});

for (const [rule, snippets] of Object.entries(MUST_REPORT)) {
  for (const snippet of snippets) {
    test(`reports [${rule}]: ${snippet}`, () => {
      const { findings } = scan(snippet);
      assert.ok(
        findings.some((finding) => finding.rule === rule),
        `expected ${rule}; got ${findings.map((finding) => finding.rule).join(',') || 'nothing'}`,
      );
    });
  }
}

for (const [rule, snippets] of Object.entries(MUST_NOT_REPORT)) {
  for (const snippet of snippets) {
    test(`does not report [${rule}]: ${snippet}`, () => {
      const { findings } = scan(snippet);
      assert.deepEqual(
        findings.filter((finding) => finding.rule === rule),
        [],
      );
    });
  }
}

test('a finding carries the rule, the repository-relative file, the line and the text', () => {
  const { findings } = scan('fn a() {}\nlet x = f64::NAN;');
  assert.deepEqual(findings, [{ rule: 'float-sentinel', file: 'crate/src/lib.rs', line: 2, text: 'let x = f64::NAN;' }]);
});

test('an allowlist row waives only the named rule at the named path', () => {
  const source = 'let x = f64::NAN;\nlet v = std::env::var("X");';
  const waived = scan(source, { allowlist: 'float-sentinel crate/src/lib.rs test input only' });
  assert.deepEqual(waived.findings.map((finding) => finding.rule), ['std-env']);
  assert.deepEqual(waived.waived, { 'float-sentinel': 1 });
  const otherPath = scan(source, { allowlist: 'float-sentinel crate/src/other.rs test input only' });
  assert.equal(otherPath.findings.length, 2);
});

test('an allowlist row may use a glob', () => {
  const { findings } = scan('let x = f64::NAN;', { allowlist: 'float-sentinel crate/src/*.rs a glob' });
  assert.deepEqual(findings, []);
});

test('an allowlist row with no reason is refused', () => {
  assert.throws(() => parseAllowlist('std-fs crates/geordi-ir/src/lib.rs'), /malformed waiver/);
  assert.throws(() => parseAllowlist('std-fs'), /malformed waiver/);
  assert.deepEqual(parseAllowlist('# a comment\n\nstd-fs a/b.rs why\n'), [{ rule: 'std-fs', glob: 'a/b.rs', reason: 'why' }]);
});

test('an inline waiver covers its own line and the next, and only its rule', () => {
  const sameLine = scan('let x = f64::NAN; // ban-nondeterminism: allow(float-sentinel) input for a rejection test');
  assert.deepEqual(sameLine.findings, []);
  const nextLine = scan('// ban-nondeterminism: allow(float-sentinel) input for a rejection test\nlet x = f64::NAN;');
  assert.deepEqual(nextLine.findings, []);
  const tooFar = scan('// ban-nondeterminism: allow(float-sentinel) input for a rejection test\n\nlet x = f64::NAN;');
  assert.equal(tooFar.findings.length, 1);
  const otherRule = scan('// ban-nondeterminism: allow(std-env) wrong rule\nlet x = f64::NAN;');
  assert.equal(otherRule.findings.length, 1);
});

test('an inline waiver with no reason waives nothing', () => {
  const { findings } = scan('let x = f64::NAN; // ban-nondeterminism: allow(float-sentinel)');
  assert.equal(findings.length, 1);
  assert.equal(inlineWaivedLines('// ban-nondeterminism: allow(std-fs)   \nuse std::fs;', 'std-fs').size, 0);
});

test('an inline region waives every line between begin and end', () => {
  const source = [
    '// ban-nondeterminism: allow-begin(std-fs) fixture I/O',
    'let a = std::fs::read(p);',
    'let b = std::fs::read(q);',
    '// ban-nondeterminism: allow-end(std-fs)',
    'let c = std::fs::read(r);',
  ].join('\n');
  const { findings } = scan(source);
  assert.deepEqual(findings.map((finding) => finding.line), [5]);
});

test('two patterns of one rule on one line are one finding', () => {
  const { findings } = scan('let t = std::time::SystemTime::now();');
  assert.equal(findings.length, 1);
});

test('files outside .rs, target directories and missing paths are not scanned', () => {
  const found = withTree(
    {
      'crate/src/lib.rs': 'let ok = 1;\n',
      'crate/notes.md': 'f64::NAN\n',
      'crate/target/debug/x.rs': 'f64::NAN\n',
    },
    (root) => scanRust({ root, paths: ['crate', 'missing'], waivers: [] }),
  );
  assert.deepEqual(found.findings, []);
});

test('the command streams one finding line per hit and a failed result, as JSON Lines', () => {
  withTree({ 'crate/src/lib.rs': 'let x = f64::NAN;\nlet v = std::env::var("X");\n' }, (root) => {
    const result = run(['--paths', 'crate'], { root });
    assert.equal(result.status, 1);
    assert.deepEqual(result.stderr, []);
    assertValid(result.stdout);
    assert.deepEqual(result.stdout.map((line) => line.kind), ['finding', 'finding', 'result']);
    assert.equal(result.stdout[2].status, 'failed');
    assert.equal(result.stdout[2].findings, 2);
  });
});

test('the command passes, and reports what was waived, when every hit has a reason', () => {
  withTree(
    {
      'crate/src/lib.rs': 'let x = f64::NAN;\nlet v = std::env::var("X");\n',
      '.ban-nondeterminism-allowlist': '# rows\nfloat-sentinel crate/src/lib.rs a rejection test input\nstd-env crate/src/lib.rs fixture directory\n',
    },
    (root) => {
      const result = run(['--paths', 'crate', '--allowlist', '.ban-nondeterminism-allowlist'], { root });
      assert.equal(result.status, 0);
      assertValid(result.stdout);
      assert.deepEqual(result.stdout.map((line) => line.kind), ['result']);
      assert.deepEqual(result.stdout[0].waived, [
        { rule: 'float-sentinel', count: 1 },
        { rule: 'std-env', count: 1 },
      ]);
    },
  );
});

test('a malformed allowlist is a typed error on stderr and exit 2', () => {
  withTree({ 'crate/src/lib.rs': 'let ok = 1;\n', 'allow': 'std-fs crate/src/lib.rs\n' }, (root) => {
    const result = run(['--paths', 'crate', '--allowlist', 'allow'], { root });
    assert.equal(result.status, 2);
    assert.deepEqual(result.stdout, []);
    assertValid(result.stderr);
    assert.equal(result.stderr[0].code, 'GEORDI_E_BAN_NONDETERMINISM_MALFORMED_WAIVER');
  });
});

test('an unknown argument is a typed usage error on stderr and exit 2', () => {
  const result = run(['--nope']);
  assert.equal(result.status, 2);
  assertValid(result.stderr);
  assert.equal(result.stderr[0].code, 'GEORDI_E_BAN_NONDETERMINISM_USAGE');
});

test('--schema prints every message schema and exits 0; --help describes the command first', () => {
  const schema = run(['--schema']);
  assert.equal(schema.status, 0);
  assertValid(schema.stdout);
  assert.deepEqual(
    schema.stdout.map((line) => line.describes.id).sort(),
    [...SCHEMAS.keys()].sort(),
  );
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assertValid(help.stdout);
  assert.equal(help.stdout[0].kind, 'help');
  assert.ok(help.stdout[0].errors.includes('GEORDI_E_BAN_NONDETERMINISM_MALFORMED_WAIVER'));
});

test('--human writes prose, not JSON', () => {
  withTree({ 'crate/src/lib.rs': 'let x = f64::NAN;\n' }, (root) => {
    const result = spawnSync(process.execPath, [COMMAND, '--root', root, '--paths', 'crate', '--human'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /crate\/src\/lib\.rs:1 \[float-sentinel\]/);
    assert.match(result.stdout, /FAILED/);
  });
});

test('the canonical Rust crates on this branch pass with the checked-in allowlist', () => {
  const result = run([]);
  assert.deepEqual(result.stderr, []);
  const findings = result.stdout.filter((line) => line.kind === 'finding');
  assert.deepEqual(findings, [], 'no unwaived finding');
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.at(-1).paths, CANONICAL_RUST_PATHS);
});
