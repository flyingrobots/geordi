// Tests for scripts/contract-gate.mjs (flyingrobots/geordi#217): the contract gate
// that compares a pull request's public contract surfaces with those of its base.
// Every line the gate writes, on stdout and stderr, is validated against the
// schema it names. Run with:
//
//   node --test scripts/contract-gate.test.mjs
//
// The trees here are small synthetic repositories. The replay of
// flyingrobots/geordi#212 is in scripts/contract-gate-replay-212.test.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';

import { loadSchemaDirectory, validateJsonSchema } from './lib/json-schema-subset.mjs';
import { parseJson, stringifyJson } from './lib/contract-gate/json.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const GATE = join(REPO_ROOT, 'scripts', 'contract-gate.mjs');
const SCHEMAS = loadSchemaDirectory(join(REPO_ROOT, 'schemas', 'geordi-contract-gate'));
const SCRATCH = mkdtempSync(join(tmpdir(), 'geordi-contract-gate-test-'));

after(() => rmSync(SCRATCH, { recursive: true, force: true }));

let counter = 0;
function scratchDir(name) {
  counter += 1;
  const dir = join(SCRATCH, `${String(counter)}-${name}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTree(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      continue;
    }
    const absolute = join(dir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, typeof content === 'string' ? content : `${stringifyJson(content, 2)}\n`);
  }
  return dir;
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/** Parse a stream as JSON Lines and validate each line against the schema its `_schema` names. */
function parseLines(text, stream) {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const record = parseJson(line);
      const schema = SCHEMAS.get(record?._schema?.id);
      assert.ok(schema !== undefined, `${stream} line names no declared schema: ${line}`);
      assert.equal(record._schema.version, schema['x-schema-version'], line);
      validateJsonSchema(schema, record);
      return record;
    });
}

function runGate(args, options = {}) {
  const result = spawnSync(process.execPath, [GATE, ...args], {
    encoding: 'utf8',
    cwd: options.cwd ?? REPO_ROOT,
    env: { ...process.env, ...options.env },
    timeout: 600_000,
  });
  if (options.raw) {
    return result;
  }
  const stdout = parseLines(result.stdout, 'stdout');
  const stderr = parseLines(result.stderr, 'stderr');
  const of = (kind) => stdout.filter((line) => line.kind === kind);
  return {
    status: result.status,
    stdout,
    stderr,
    differences: of('difference'),
    violations: of('violation'),
    contracts: of('contract'),
    result: of('result')[0],
    raw: result,
  };
}

function compare(baseFiles, headFiles) {
  const base = writeTree(scratchDir('base'), baseFiles);
  const head = writeTree(scratchDir('head'), headFiles);
  return runGate(['--base-dir', base, '--head-dir', head]);
}

const DEMO_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Demo document',
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    size: { type: 'integer', minimum: 0 },
  },
};

const ERRORS_MD = [
  '# Errors',
  '',
  '### `DEMO_E_BAD`',
  '',
  '**Severity**: Error',
  '**Message**: The input is bad',
  '**Fix**: Send good input.',
  '',
  '### `DEMO_E_WORSE`',
  '',
  '**Severity**: Error',
  '**Message**: The input is worse',
  '',
].join('\n');

const DEMO_RS = [
  '//! Demo.',
  '/// Bad.',
  'pub const DEMO_E_BAD: &str = "DEMO_E_BAD";',
  '/// Worse.',
  'pub const DEMO_E_WORSE: &str = "DEMO_E_WORSE";',
  '/// Parse.',
  'pub fn demo_parse(source: &str) -> u8 { source.len() as u8 }',
  '',
].join('\n');

function demoContract(overrides = {}) {
  return {
    contract: 'demo-format/1',
    status: 'draft',
    statusEvidence: 'test fixture',
    schema: 'schemas/demo/1/demo.schema.json',
    examples: [{ path: 'fixtures/demo/a.json', encoder: { kind: 'sha256-bytes' } }],
    diagnostics: { catalog: 'docs/ERRORS.md', sources: ['src/demo.rs'], prefix: 'DEMO_E_' },
    rustApi: [{ file: 'src/demo.rs', select: 'all' }],
    ...overrides,
  };
}

function otherContract(overrides = {}) {
  return {
    contract: 'demo-other/1',
    status: 'draft',
    statusEvidence: 'test fixture',
    schema: 'schemas/other/1/other.schema.json',
    examples: [{ path: 'fixtures/other/b.json', encoder: { kind: 'sha256-bytes' } }],
    ...overrides,
  };
}

function registry(contracts) {
  return { registryVersion: 'geordi-contract-registry/1', contracts, messageSchemaFamilies: [], ungated: [] };
}

function demoTree(overrides = {}) {
  return {
    'contracts/registry.json': registry([demoContract(), otherContract()]),
    'schemas/demo/1/demo.schema.json': DEMO_SCHEMA,
    'schemas/other/1/other.schema.json': { type: 'object' },
    'fixtures/demo/a.json': { name: 'a', size: 1 },
    'fixtures/other/b.json': { b: true },
    'docs/ERRORS.md': ERRORS_MD,
    'src/demo.rs': DEMO_RS,
    ...overrides,
  };
}

function record(contract, change, extra = {}) {
  return {
    contract,
    change,
    summary: `test change to ${contract}`,
    why: 'test',
    references: ['flyingrobots/geordi#217'],
    ...extra,
  };
}

function codes(run) {
  return run.violations.map((violation) => violation.code).sort();
}

test('a pull request that changes no contract surface passes with no record', () => {
  const run = compare(demoTree(), demoTree());
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.deepEqual(run.differences, []);
  assert.deepEqual(run.violations, []);
  assert.equal(run.result.ok, true);
  assert.deepEqual(
    run.contracts.map((line) => [line.contract, line.state, line.verdict]),
    [
      ['demo-format/1', 'unchanged', 'pass'],
      ['demo-other/1', 'unchanged', 'pass'],
    ],
  );
});

test('an additive field fails without a record and passes with an additive one', () => {
  const widened = structuredClone(DEMO_SCHEMA);
  widened.properties.label = { type: 'string' };
  const head = demoTree({ 'schemas/demo/1/demo.schema.json': widened });
  const missing = compare(demoTree(), head);
  assert.equal(missing.status, 1);
  assert.deepEqual(codes(missing), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const [difference] = missing.differences;
  assert.equal(difference.contract, 'demo-format/1');
  assert.equal(difference.surface, 'schema');
  assert.equal(difference.item, '/properties/label');
  assert.equal(difference.change, 'added');
  assert.equal(difference.classification, 'additive');
  const declared = compare(demoTree(), { ...head, 'contracts/changes/demo-label.json': record('demo-format/1', 'additive') });
  assert.equal(declared.status, 0, declared.raw.stdout);
  assert.deepEqual(declared.contracts[0].records, ['contracts/changes/demo-label.json']);
});

test('a new required field is breaking', () => {
  const tightened = structuredClone(DEMO_SCHEMA);
  tightened.properties.label = { type: 'string' };
  tightened.required = ['name', 'label'];
  const run = compare(demoTree(), demoTree({ 'schemas/demo/1/demo.schema.json': tightened }));
  assert.equal(run.differences[0].classification, 'breaking');
  assert.match(run.differences[0].detail, /required/u);
});

test('a removed diagnostic code is breaking and an additive record understates it', () => {
  const head = demoTree({
    'docs/ERRORS.md': ERRORS_MD.split('### `DEMO_E_WORSE`')[0],
    'src/demo.rs': DEMO_RS.replace('/// Worse.\npub const DEMO_E_WORSE: &str = "DEMO_E_WORSE";\n', ''),
  });
  const understated = compare(demoTree(), { ...head, 'contracts/changes/worse.json': record('demo-format/1', 'additive') });
  assert.equal(understated.status, 1);
  assert.deepEqual(codes(understated), ['GEORDI_E_CONTRACT_RECORD_UNDERSTATED']);
  const removed = understated.differences.find((line) => line.surface === 'diagnostic');
  assert.equal(removed.item, 'DEMO_E_WORSE');
  assert.equal(removed.change, 'removed');
  assert.equal(removed.classification, 'breaking');
  const declared = compare(demoTree(), { ...head, 'contracts/changes/worse.json': record('demo-format/1', 'breaking') });
  assert.equal(declared.status, 0, declared.raw.stdout);
});

test('a changed diagnostic meaning is unknown and treated as breaking', () => {
  const run = compare(
    demoTree(),
    demoTree({ 'docs/ERRORS.md': ERRORS_MD.replace('The input is worse', 'The header is worse') }),
  );
  const changed = run.differences.find((line) => line.item === 'DEMO_E_WORSE');
  assert.equal(changed.change, 'changed');
  assert.equal(changed.classification, 'unknown');
  assert.equal(changed.treatedAs, 'breaking');
  assert.equal(changed.before, 'The input is worse');
  assert.equal(changed.after, 'The header is worse');
});

test('diagnostic codes in the catalog and in the source must agree on the head', () => {
  const run = compare(demoTree(), demoTree({ 'docs/ERRORS.md': ERRORS_MD.split('### `DEMO_E_WORSE`')[0] }));
  assert.ok(codes(run).includes('GEORDI_E_CONTRACT_DIAGNOSTICS_DISAGREE'), stringifyJson(run.violations));
  const disagreement = run.violations.find((line) => line.code === 'GEORDI_E_CONTRACT_DIAGNOSTICS_DISAGREE');
  assert.match(disagreement.message, /DEMO_E_WORSE/u);
});

test('a renamed public function is a removed item and an added item', () => {
  const run = compare(demoTree(), demoTree({ 'src/demo.rs': DEMO_RS.replace('demo_parse', 'demo_decode') }));
  assert.equal(run.status, 1);
  const api = run.differences.filter((line) => line.surface === 'rust-api');
  assert.deepEqual(
    api.map((line) => [line.item, line.change, line.classification]),
    [
      ['fn demo_decode', 'added', 'additive'],
      ['fn demo_parse', 'removed', 'breaking'],
    ],
  );
  assert.equal(run.contracts[0].classification, 'breaking');
});

test('a new contract with no base needs a record', () => {
  const head = demoTree({
    'contracts/registry.json': registry([
      demoContract(),
      otherContract(),
      otherContract({ contract: 'demo-new/1', schema: 'schemas/other/1/other.schema.json' }),
    ]),
  });
  const missing = compare(demoTree(), head);
  assert.deepEqual(codes(missing), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const added = missing.contracts.find((line) => line.contract === 'demo-new/1');
  assert.equal(added.state, 'new');
  assert.equal(added.baseStatus, null);
  const declared = compare(demoTree(), { ...head, 'contracts/changes/new.json': record('demo-new/1', 'additive') });
  assert.equal(declared.status, 0, declared.raw.stdout);
});

test('a record that names the wrong contract fails twice: missing and stale', () => {
  const run = compare(
    demoTree(),
    demoTree({
      'fixtures/demo/a.json': { name: 'a', size: 2 },
      'contracts/changes/wrong.json': record('demo-other/1', 'breaking'),
    }),
  );
  assert.equal(run.status, 1);
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING', 'GEORDI_E_CONTRACT_RECORD_STALE']);
  assert.equal(run.violations.find((line) => line.code === 'GEORDI_E_CONTRACT_RECORD_MISSING').contract, 'demo-format/1');
  assert.equal(run.violations.find((line) => line.code === 'GEORDI_E_CONTRACT_RECORD_STALE').contract, 'demo-other/1');
});

test('a record that names an unregistered contract is invalid', () => {
  const run = compare(demoTree(), demoTree({ 'contracts/changes/ghost.json': record('demo-ghost/1', 'additive') }));
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_INVALID']);
});

test('a record that does not match the change-record schema is invalid', () => {
  const run = compare(demoTree(), demoTree({ 'contracts/changes/bad.json': { contract: 'demo-format/1' } }));
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_INVALID']);
});

test('editing a pinned hash and the fixture in the same pull request does not pass', () => {
  const baseDoc = `${stringifyJson({ name: 'a', size: 1 }, 2)}\n`;
  const headDoc = `${stringifyJson({ name: 'a', size: 9 }, 2)}\n`;
  const run = compare(
    demoTree({ 'tests/pins.txt': sha256(baseDoc) }),
    demoTree({ 'fixtures/demo/a.json': { name: 'a', size: 9 }, 'tests/pins.txt': sha256(headDoc) }),
  );
  assert.equal(run.status, 1);
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const example = run.differences.find((line) => line.surface === 'example');
  assert.equal(example.item, 'fixtures/demo/a.json');
  assert.equal(example.before, sha256(baseDoc));
  assert.equal(example.after, sha256(headDoc));
  assert.equal(example.classification, 'breaking');
});

test('an example that its own schema rejects is a violation on the head', () => {
  const run = compare(demoTree(), demoTree({ 'fixtures/demo/a.json': { name: '' } }));
  assert.ok(codes(run).includes('GEORDI_E_CONTRACT_EXAMPLE_INVALID'), stringifyJson(run.violations));
});

test('a breaking change to a frozen contract fails even with a record', () => {
  const frozen = demoTree({ 'contracts/registry.json': registry([demoContract({ status: 'frozen' }), otherContract()]) });
  const run = compare(frozen, {
    ...frozen,
    'src/demo.rs': DEMO_RS.replace('demo_parse', 'demo_decode'),
    'contracts/changes/rename.json': record('demo-format/1', 'breaking'),
  });
  assert.equal(run.status, 1);
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_FROZEN_BREAKING']);
  assert.match(run.violations[0].message, /demo-format\/2/u);
});

test('an additive change to a frozen contract passes with an additive record', () => {
  const frozen = demoTree({ 'contracts/registry.json': registry([demoContract({ status: 'frozen' }), otherContract()]) });
  const head = { ...frozen, 'src/demo.rs': `${DEMO_RS}/// New.\npub fn demo_extra() {}\n` };
  assert.deepEqual(codes(compare(frozen, head)), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const run = compare(frozen, { ...head, 'contracts/changes/extra.json': record('demo-format/1', 'additive') });
  assert.equal(run.status, 0, run.raw.stdout);
});

function raisedRegistry() {
  return registry([
    demoContract({ status: 'superseded', supersededBy: 'demo-format/2', diagnostics: undefined, rustApi: undefined }),
    demoContract({
      contract: 'demo-format/2',
      schema: 'schemas/demo/2/demo.schema.json',
      examples: [{ path: 'fixtures/demo/2/a.json', encoder: { kind: 'sha256-bytes' } }],
    }),
    otherContract(),
  ]);
}

test('a breaking change to a frozen contract passes when the version is raised and the old one is kept', () => {
  const frozen = demoTree({ 'contracts/registry.json': registry([demoContract({ status: 'frozen' }), otherContract()]) });
  const run = compare(frozen, {
    ...frozen,
    'contracts/registry.json': raisedRegistry(),
    'schemas/demo/2/demo.schema.json': DEMO_SCHEMA,
    'fixtures/demo/2/a.json': { name: 'a' },
    'src/demo.rs': DEMO_RS.replace('demo_parse', 'demo_decode'),
    'contracts/changes/v2.json': record('demo-format/2', 'additive'),
    'contracts/changes/v1-superseded.json': record('demo-format/1', 'breaking', { status: { from: 'frozen', to: 'superseded' } }),
  });
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.contracts.find((line) => line.contract === 'demo-format/1').state, 'superseded');
  assert.equal(run.contracts.find((line) => line.contract === 'demo-format/2').state, 'new');
});

test('a version raised with the old schema deleted fails', () => {
  const frozen = demoTree({ 'contracts/registry.json': registry([demoContract({ status: 'frozen' }), otherContract()]) });
  const run = compare(frozen, {
    ...frozen,
    'contracts/registry.json': raisedRegistry(),
    'schemas/demo/1/demo.schema.json': null,
    'schemas/demo/2/demo.schema.json': DEMO_SCHEMA,
    'fixtures/demo/2/a.json': { name: 'a' },
    'contracts/changes/v2.json': record('demo-format/2', 'additive'),
    'contracts/changes/v1-superseded.json': record('demo-format/1', 'breaking', { status: { from: 'frozen', to: 'superseded' } }),
  });
  assert.equal(run.status, 1);
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_SUPERSEDED_CHANGED']);
  assert.deepEqual(run.violations[0].paths, ['schemas/demo/1/demo.schema.json']);
});

test('a frozen contract cannot be removed or returned to draft', () => {
  const frozen = demoTree({ 'contracts/registry.json': registry([demoContract({ status: 'frozen' }), otherContract()]) });
  const removed = compare(frozen, { ...frozen, 'contracts/registry.json': registry([otherContract()]), 'contracts/changes/rm.json': record('demo-format/1', 'breaking') });
  assert.deepEqual(codes(removed), ['GEORDI_E_CONTRACT_FROZEN_REMOVED']);
  const thawed = compare(frozen, { ...demoTree(), 'contracts/changes/thaw.json': record('demo-format/1', 'breaking', { status: { from: 'frozen', to: 'draft' } }) });
  assert.deepEqual(codes(thawed), ['GEORDI_E_CONTRACT_STATUS_INVALID']);
});

test('freezing a draft contract needs a record that states the status change', () => {
  const head = demoTree({ 'contracts/registry.json': registry([demoContract({ status: 'frozen' }), otherContract()]) });
  const missing = compare(demoTree(), head);
  assert.deepEqual(codes(missing), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const status = missing.differences.find((line) => line.surface === 'status');
  assert.deepEqual([status.before, status.after], ['draft', 'frozen']);
  const declared = compare(demoTree(), { ...head, 'contracts/changes/freeze.json': record('demo-format/1', 'additive', { status: { from: 'draft', to: 'frozen' } }) });
  assert.equal(declared.status, 0, declared.raw.stdout);
});

test('change records already on the base are history: they satisfy nothing and cannot be edited', () => {
  const base = demoTree({ 'contracts/changes/old.json': record('demo-format/1', 'breaking') });
  const reused = compare(base, { ...base, 'fixtures/demo/a.json': { name: 'a', size: 5 } });
  assert.deepEqual(codes(reused), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const edited = compare(base, { ...base, 'contracts/changes/old.json': record('demo-format/1', 'additive') });
  assert.deepEqual(codes(edited), ['GEORDI_E_CONTRACT_HISTORY_REWRITTEN']);
  const deleted = compare(base, { ...base, 'contracts/changes/old.json': null });
  assert.deepEqual(codes(deleted), ['GEORDI_E_CONTRACT_HISTORY_REWRITTEN']);
});

test('a retroactive record is accepted without an observed difference', () => {
  const run = compare(demoTree(), demoTree({ 'contracts/changes/past.json': record('demo-format/1', 'breaking', { retroactive: true }) }));
  assert.equal(run.status, 0, run.raw.stdout);
  const line = run.stdout.find((entry) => entry.kind === 'record');
  assert.equal(line.state, 'retroactive');
});

test('line endings and key order do not change a snapshot', () => {
  const crlf = (text) => text.replace(/\n/gu, '\r\n');
  const reordered = { properties: DEMO_SCHEMA.properties, additionalProperties: false, required: ['name'], type: 'object', title: 'Demo document', $schema: DEMO_SCHEMA.$schema };
  const run = compare(
    demoTree(),
    demoTree({
      'docs/ERRORS.md': crlf(ERRORS_MD),
      'src/demo.rs': crlf(DEMO_RS),
      'schemas/demo/1/demo.schema.json': crlf(`${stringifyJson(reordered, 2)}\n`),
    }),
  );
  assert.equal(run.status, 0, run.raw.stdout);
  assert.deepEqual(run.differences, []);
});

test('a base without a registry is a bootstrap: contracts are new and need no record', () => {
  const base = demoTree({ 'contracts/registry.json': null });
  const run = compare(base, demoTree());
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.stdout[0].kind, 'comparison');
  assert.equal(run.stdout[0].mode, 'bootstrap');
  assert.ok(run.contracts.every((line) => line.state === 'new'));
});

test('a head without a registry fails closed with a schema-tagged error', () => {
  const run = compare(demoTree(), demoTree({ 'contracts/registry.json': null }));
  assert.equal(run.status, 1);
  assert.equal(run.stderr.length, 1);
  assert.equal(run.stderr[0].code, 'GEORDI_E_CONTRACT_GATE_REGISTRY');
});

test('a surface that cannot be computed fails closed', () => {
  const run = compare(demoTree(), demoTree({ 'fixtures/demo/a.json': null }));
  assert.equal(run.status, 1);
  assert.equal(run.stderr.at(-1).code, 'GEORDI_E_CONTRACT_GATE_SNAPSHOT');
  assert.deepEqual(run.stderr.at(-1).paths, ['fixtures/demo/a.json']);
});

test('message schema families are expanded into one contract per schema file', () => {
  const message = (id, version) => ({ type: 'object', 'x-schema-id': id, 'x-schema-version': version, properties: { a: { type: 'string' } } });
  const tree = (version, extra = {}) => ({
    'contracts/registry.json': {
      ...registry([]),
      messageSchemaFamilies: [{ directory: 'schemas/demo-cli', status: 'draft', statusEvidence: 'test fixture' }],
    },
    'schemas/demo-cli/result.schema.json': message('demo.cli.result', version),
    ...extra,
  });
  const same = compare(tree('1.0.0'), tree('1.0.0'));
  assert.equal(same.status, 0, same.raw.stdout + same.raw.stderr);
  assert.deepEqual(same.contracts.map((line) => line.contract), ['demo.cli.result/1']);
  const raised = compare(tree('1.0.0'), tree('2.0.0'));
  assert.deepEqual(raised.contracts.map((line) => [line.contract, line.state]), [
    ['demo.cli.result/1', 'removed'],
    ['demo.cli.result/2', 'new'],
  ]);
});

// ---------------------------------------------------------------------------------------------
// Base selection from git
// ---------------------------------------------------------------------------------------------

const GIT_IDENTITY = ['-c', 'user.name=Contract Gate Test', '-c', 'user.email=contract-gate@example.invalid', '-c', 'commit.gpgsign=false'];

function git(cwd, ...args) {
  const result = spawnSync('git', [...GIT_IDENTITY, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commitTree(repo, files, message) {
  writeTree(repo, files);
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(repo, path), { force: true });
    }
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

test('the base is the merge base, not the moving tip of the base branch', () => {
  const repo = scratchDir('git');
  git(repo, 'init', '-q', '-b', 'main');
  const fork = commitTree(repo, demoTree(), 'base');
  git(repo, 'checkout', '-q', '-b', 'feature');
  commitTree(repo, { 'README.md': 'feature work\n' }, 'feature: no contract change');
  git(repo, 'checkout', '-q', 'main');
  commitTree(
    repo,
    { 'fixtures/demo/a.json': { name: 'a', size: 3 }, 'contracts/changes/main.json': record('demo-format/1', 'breaking') },
    'main: a declared contract change',
  );
  git(repo, 'checkout', '-q', 'feature');

  const run = runGate(['--repo', repo, '--base-ref', 'main']);
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.stdout[0].base.sha, fork);
  assert.equal(run.stdout[0].base.ref, 'main');
  assert.deepEqual(run.differences, []);

  // Comparing with the tip instead would blame the feature branch for main's change.
  const tip = runGate(['--repo', repo, '--base', 'main']);
  assert.equal(tip.status, 1);
  assert.ok(tip.differences.some((line) => line.surface === 'example'));
});

test('the head defaults to the working tree, and --head compares a commit', () => {
  const repo = scratchDir('git-head');
  git(repo, 'init', '-q', '-b', 'main');
  commitTree(repo, demoTree(), 'base');
  git(repo, 'checkout', '-q', '-b', 'feature');
  writeTree(repo, { 'fixtures/demo/a.json': { name: 'a', size: 4 } });
  const dirty = runGate(['--repo', repo, '--base-ref', 'main']);
  assert.equal(dirty.status, 1);
  const committed = runGate(['--repo', repo, '--base-ref', 'main', '--head', 'HEAD']);
  assert.equal(committed.status, 0, committed.raw.stdout + committed.raw.stderr);
  assert.equal(committed.stdout[0].head.source, 'git');
});

test('an unresolvable base fails closed with a schema-tagged error', () => {
  const repo = scratchDir('git-nobase');
  git(repo, 'init', '-q', '-b', 'main');
  commitTree(repo, demoTree(), 'base');
  const run = runGate(['--repo', repo, '--base-ref', 'origin/does-not-exist']);
  assert.equal(run.status, 1);
  assert.equal(run.stderr.at(-1).code, 'GEORDI_E_CONTRACT_GATE_BASE');
});

test('a shallow clone that cannot reach the merge base fails closed', () => {
  const upstream = scratchDir('git-upstream');
  git(upstream, 'init', '-q', '-b', 'main');
  commitTree(upstream, demoTree(), 'base');
  git(upstream, 'checkout', '-q', '-b', 'feature');
  commitTree(upstream, { 'README.md': 'one\n' }, 'one');
  commitTree(upstream, { 'README.md': 'two\n' }, 'two');
  git(upstream, 'checkout', '-q', 'main');
  commitTree(upstream, { 'README.md': 'main moved\n' }, 'main moved');
  const clone = join(scratchDir('git-shallow'), 'clone');
  git(SCRATCH, 'clone', '-q', '--depth', '1', '--branch', 'feature', '--no-single-branch', `file://${upstream}`, clone);
  const run = runGate(['--repo', clone, '--base-ref', 'origin/main']);
  assert.equal(run.status, 1);
  assert.equal(run.stderr.at(-1).code, 'GEORDI_E_CONTRACT_GATE_BASE');
  assert.match(run.stderr.at(-1).message, /fetch-depth|history/u);
});

// ---------------------------------------------------------------------------------------------
// Command line contract
// ---------------------------------------------------------------------------------------------

test('--schema prints every message schema and exits 0', () => {
  const run = runGate(['--schema']);
  assert.equal(run.status, 0);
  const described = run.stdout.map((line) => line.describes.id).sort();
  assert.deepEqual(described, [...SCHEMAS.keys()].sort());
});

test('--help describes the command, then the schemas of its output and errors', () => {
  const run = runGate(['--help']);
  assert.equal(run.status, 0);
  assert.equal(run.stdout[0].kind, 'help');
  assert.ok(run.stdout[0].errorCodes.some((entry) => entry.code === 'GEORDI_E_CONTRACT_GATE_BASE'));
  const described = run.stdout.slice(1).map((line) => line.describes.id);
  for (const kind of ['comparison', 'contract', 'difference', 'record', 'coverage', 'violation', 'result', 'error']) {
    assert.ok(described.includes(`geordi.contract_gate.${kind}`), kind);
  }
});

test('--human writes prose, and an unknown argument is a usage error', () => {
  const prose = runGate(['--help', '--human'], { raw: true });
  assert.equal(prose.status, 0);
  assert.match(prose.stdout, /^contract-gate: /u);
  assert.throws(() => parseJson(prose.stdout.split('\n')[0]));
  const usage = runGate(['--frobnicate']);
  assert.equal(usage.status, 2);
  assert.equal(usage.stderr[0].code, 'GEORDI_E_CONTRACT_GATE_USAGE');
});

test('the repository registry passes against itself, with every line schema-valid', () => {
  const run = runGate(['--base-dir', REPO_ROOT, '--head-dir', REPO_ROOT]);
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.ok(run.contracts.some((line) => line.contract === 'geordi-ray-traced-scene/1'));
  assert.ok(run.stdout.some((line) => line.kind === 'coverage' && line.gated === false));
});

test('the checked-in registry and change records validate against their schemas', () => {
  const formats = loadSchemaDirectory(join(REPO_ROOT, 'schemas', 'geordi-contract-registry'));
  const registryText = readFileSync(join(REPO_ROOT, 'contracts', 'registry.json'), 'utf8');
  validateJsonSchema(formats.get('geordi.contract_registry.registry'), parseJson(registryText));
  const changes = join(REPO_ROOT, 'contracts', 'changes');
  const records = readdirSync(changes).filter((name) => name.endsWith('.json'));
  assert.ok(records.length > 0);
  for (const name of records) {
    validateJsonSchema(formats.get('geordi.contract_registry.change_record'), parseJson(readFileSync(join(changes, name), 'utf8')));
  }
});
