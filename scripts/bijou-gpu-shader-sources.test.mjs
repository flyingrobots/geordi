// Tests for scripts/generate-bijou-gpu-shader-sources.mjs: the drift gate of
// the bundled shader-source modules of @flyingrobots/geordi-bijou-gpu, and the
// JSON Lines contract of its output. Run with:
//
//   node --test scripts/bijou-gpu-shader-sources.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { parseJsonValue } from '../packages/core/dist/index.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const GENERATOR = join(REPO_ROOT, 'scripts', 'generate-bijou-gpu-shader-sources.mjs');
const SCHEMA_DIR = join(REPO_ROOT, 'schemas', 'geordi-bijou-shader-sources');
const SHADER_DIR = 'packages/bijou-gpu/shaders';
const GENERATED_DIR = 'packages/bijou-gpu/src/generated';
const SOURCES = ['bijou-shaders.manifest.json', 'bijou-surface.vert.glsl', 'bijou-surface.frag.glsl', 'bijou-surface.wgsl'];

class SchemaViolationError extends Error {
  constructor(path, detail) {
    super(`${path}: ${detail}`);
    this.name = new.target.name;
  }
}

const SCHEMAS = new Map(
  readdirSync(SCHEMA_DIR).map((file) => {
    const schema = parseJsonValue(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
    return [schema['x-schema-id'], schema];
  }),
);

/** The subset of JSON Schema 2020-12 these schemas use. */
function validate(schema, value, path = '$') {
  if ('const' in schema && value !== schema.const) {
    throw new SchemaViolationError(path, `expected ${String(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    throw new SchemaViolationError(path, `${String(value)} is not one of ${schema.enum.join(', ')}`);
  }
  const type = schema.type;
  if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SchemaViolationError(path, 'not an object');
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        throw new SchemaViolationError(path, `missing ${key}`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property === undefined) {
        if (schema.additionalProperties === false) {
          throw new SchemaViolationError(path, `unexpected ${key}`);
        }
        continue;
      }
      validate(property, item, `${path}.${key}`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) {
      throw new SchemaViolationError(path, 'not an array');
    }
    value.forEach((item, index) => schema.items && validate(schema.items, item, `${path}[${String(index)}]`));
  } else if (type === 'string') {
    if (typeof value !== 'string') {
      throw new SchemaViolationError(path, 'not a string');
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new SchemaViolationError(path, 'too short');
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      throw new SchemaViolationError(path, 'too long');
    }
  } else if (type === 'integer') {
    if (!Number.isInteger(value)) {
      throw new SchemaViolationError(path, 'not an integer');
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new SchemaViolationError(path, 'below minimum');
    }
  }
}

/** Run the generator; parse and validate every line of both streams against its declared schema. */
function generate(...args) {
  const result = spawnSync(process.execPath, [GENERATOR, ...args], { encoding: 'utf8' });
  const parse = (stream, text) =>
    text
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const record = parseJsonValue(line);
        const schema = SCHEMAS.get(record._schema?.id);
        assert.ok(schema, `${stream} line has no declared schema: ${line}`);
        assert.equal(record._schema.version, schema['x-schema-version']);
        validate(schema, record);
        return record;
      });
  return { status: result.status, stdout: parse('stdout', result.stdout), stderr: parse('stderr', result.stderr) };
}

/** A scratch repository root holding only what the generator reads and writes. */
function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'geordi-shader-sources-'));
  mkdirSync(join(root, SHADER_DIR), { recursive: true });
  for (const file of SOURCES) {
    cpSync(join(REPO_ROOT, SHADER_DIR, file), join(root, SHADER_DIR, file));
  }
  cpSync(join(REPO_ROOT, GENERATED_DIR), join(root, GENERATED_DIR), { recursive: true });
  return root;
}

function snapshot(root, dirs = [SHADER_DIR, GENERATED_DIR]) {
  const files = new Map();
  for (const dir of dirs) {
    for (const name of readdirSync(join(root, dir))) {
      files.set(`${dir}/${name}`, readFileSync(join(root, dir, name), 'utf8'));
    }
  }
  return files;
}

test('--check passes on the checked-in tree and ends with a result line', () => {
  const run = generate('--check');
  assert.equal(run.status, 0);
  assert.deepEqual(run.stderr, []);
  const artifacts = run.stdout.filter((record) => record.kind === 'artifact');
  assert.deepEqual(
    artifacts.map((record) => [record.path, record.state]),
    [
      [`${GENERATED_DIR}/bijou-shaders-manifest.generated.ts`, 'match'],
      [`${GENERATED_DIR}/bijou-surface-glsl.generated.ts`, 'match'],
      [`${GENERATED_DIR}/bijou-surface-wgsl.generated.ts`, 'match'],
    ],
  );
  assert.deepEqual(run.stdout.at(-1), {
    _schema: { id: 'geordi.bijou_shader_sources.result', version: '1.0.0' },
    artifacts: 3,
    kind: 'result',
    mode: 'check',
    ok: true,
    sources: 4,
  });
});

test('--check reports a drifted, a missing and a stray module, exits 1 and writes nothing', () => {
  const root = scratchRepo();
  try {
    const glsl = join(root, GENERATED_DIR, 'bijou-surface-glsl.generated.ts');
    writeFileSync(glsl, readFileSync(glsl, 'utf8').replace('#version 300 es', '#version 300 es '));
    rmSync(join(root, GENERATED_DIR, 'bijou-surface-wgsl.generated.ts'));
    writeFileSync(join(root, GENERATED_DIR, 'stray.generated.ts'), 'export {};\n');
    const before = snapshot(root);
    const run = generate('--check', '--repo-root', root);
    assert.equal(run.status, 1);
    assert.deepEqual(
      run.stdout.map((record) => record.state),
      ['match', 'drift', 'missing'],
    );
    assert.equal(run.stderr.length, 1);
    assert.equal(run.stderr[0].code, 'GEORDI_E_BIJOU_SHADER_SOURCES_DRIFT');
    assert.deepEqual(run.stderr[0].paths, [
      `${GENERATED_DIR}/bijou-surface-glsl.generated.ts`,
      `${GENERATED_DIR}/bijou-surface-wgsl.generated.ts`,
      `${GENERATED_DIR}/stray.generated.ts`,
    ]);
    assert.deepEqual(snapshot(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--write regenerates byte-identical modules, deterministically', () => {
  const root = scratchRepo();
  try {
    rmSync(join(root, GENERATED_DIR), { recursive: true });
    const first = generate('--write', '--repo-root', root);
    assert.equal(first.status, 0);
    assert.deepEqual(
      first.stdout.filter((record) => record.kind === 'artifact').map((record) => record.state),
      ['written', 'written', 'written'],
    );
    assert.deepEqual(snapshot(root, [GENERATED_DIR]), snapshot(REPO_ROOT, [GENERATED_DIR]));
    const second = generate('--write', '--repo-root', root);
    assert.deepEqual(
      second.stdout.filter((record) => record.kind === 'artifact').map((record) => record.state),
      ['unchanged', 'unchanged', 'unchanged'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a CRLF-converted or edited shader file instead of embedding it, and writes nothing', () => {
  for (const [file, edit] of [
    ['bijou-surface.frag.glsl', (text) => text.replaceAll('\n', '\r\n')],
    ['bijou-surface.wgsl', (text) => `${text}\n`],
  ]) {
    const root = scratchRepo();
    try {
      const path = join(root, SHADER_DIR, file);
      writeFileSync(path, edit(readFileSync(path, 'utf8')));
      const before = snapshot(root);
      const run = generate('--write', '--repo-root', root);
      assert.equal(run.status, 1);
      assert.deepEqual(run.stdout, []);
      assert.equal(run.stderr.length, 1);
      assert.equal(run.stderr[0].code, 'GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH');
      assert.deepEqual(run.stderr[0].paths, [`${SHADER_DIR}/${file}`]);
      assert.deepEqual(snapshot(root), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('embeds each text as one string literal, so converting the module line endings keeps its bytes', () => {
  for (const name of readdirSync(join(REPO_ROOT, GENERATED_DIR))) {
    const text = readFileSync(join(REPO_ROOT, GENERATED_DIR, name), 'utf8');
    for (const literal of text.split('\n').filter((line) => line.startsWith('  "'))) {
      assert.match(literal, /^ {2}".*";$/u);
      assert.doesNotMatch(literal, /\r/u);
    }
  }
});

test('--schema and --help emit schema-valid JSON Lines and exit 0; a bad command line exits 2 with an error line', () => {
  const schema = generate('--schema');
  assert.equal(schema.status, 0);
  assert.deepEqual(
    schema.stdout.map((record) => [record.describes.id, record.stream]),
    [
      ['geordi.bijou_shader_sources.artifact', 'stdout'],
      ['geordi.bijou_shader_sources.result', 'stdout'],
      ['geordi.bijou_shader_sources.error', 'stderr'],
      ['geordi.bijou_shader_sources.help', 'stdout'],
      ['geordi.bijou_shader_sources.schema', 'stdout'],
    ],
  );
  const help = generate('--help');
  assert.equal(help.status, 0);
  assert.equal(help.stdout[0].kind, 'help');
  assert.equal(help.stdout.length, 6);
  for (const args of [[], ['--check', '--write'], ['--bogus'], ['--check', '--repo-root']]) {
    const bad = generate(...args);
    assert.equal(bad.status, 2, args.join(' '));
    assert.deepEqual(bad.stdout, []);
    assert.equal(bad.stderr[0].code, 'GEORDI_E_BIJOU_SHADER_SOURCES_USAGE');
  }
});

test('--human writes prose, not JSON', () => {
  const result = spawnSync(process.execPath, [GENERATOR, '--check', '--human'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^match: packages\/bijou-gpu\/src\/generated\//mu);
  assert.doesNotMatch(result.stdout, /^\{/mu);
});
