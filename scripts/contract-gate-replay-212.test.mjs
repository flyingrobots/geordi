// Golden test of the contract gate (flyingrobots/geordi#217): replay
// flyingrobots/geordi#212, which renamed a field of geordi-ray-traced-scene/1,
// replaced a field of a public Rust type, added one diagnostic code and narrowed
// another, and changed the reference scene hash, all on a green build.
//
// The two trees are the real commits: the merge of flyingrobots/geordi#212
// (head) and its first parent on main (base), read with `git archive`. Neither
// commit has a contract registry or a scene schema, so the test lays the files
// in fixtures/contract-gate/replay-212/ over both trees; see the README there.
// The test needs those two commits in the local object store (CI checks out
// with full history). It fails, never skips, when they are missing.
//
//   node --test scripts/contract-gate-replay-212.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { loadSchemaDirectory, validateJsonSchema } from './lib/json-schema-subset.mjs';
import { parseJson, stringifyJson } from './lib/contract-gate/json.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const GATE = join(REPO_ROOT, 'scripts', 'contract-gate.mjs');
const FIXTURE = join(REPO_ROOT, 'fixtures', 'contract-gate', 'replay-212');
const SCHEMAS = loadSchemaDirectory(join(REPO_ROOT, 'schemas', 'geordi-contract-gate'));

/** First parent of the merge of flyingrobots/geordi#212 on main. */
const BASE_COMMIT = 'fa474ecb74cbfb1cccb34db10f34c3b641c9961e';
/** The merge of flyingrobots/geordi#212. */
const HEAD_COMMIT = '52ba6bbf96508aaf951fb7c70cff2c19bb2a6799';
const TREE_PATHS = ['Cargo.toml', 'Cargo.lock', 'crates/geordi-ir', 'docs/ERROR_CODES.md', 'fixtures/ray-traced-scene'];
const CONTRACT = 'geordi-ray-traced-scene/1';
const SCHEMA_PATH = 'schemas/geordi-ray-traced-scene/1/scene.schema.json';
const REFERENCE = 'fixtures/ray-traced-scene/reference.rt-scene.geordi.json';
const REFERENCE_V2 = 'fixtures/ray-traced-scene/2/reference.rt-scene.geordi.json';
const OLD_SCENE_HASH = 'sha256:3f245c019731d361dbbdd4c38362e2a2e6d0f725ba799f5d0baaa6d34f482747';
const NEW_SCENE_HASH = 'sha256:5ea6b6085b5178fcda09fc966737e44cd5c731ed311e4fcd601ddf935a480a24';

const SCRATCH = mkdtempSync(join(tmpdir(), 'geordi-contract-gate-replay-'));
after(() => rmSync(SCRATCH, { recursive: true, force: true }));

function materialise(commit, dir) {
  const present = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: REPO_ROOT });
  assert.equal(
    present.status,
    0,
    `commit ${commit} is not in this clone; the replay needs full history (actions/checkout fetch-depth: 0)`,
  );
  mkdirSync(dir, { recursive: true });
  const archive = spawnSync('git', ['archive', '--format=tar', commit, '--', ...TREE_PATHS], { cwd: REPO_ROOT, maxBuffer: 1 << 28 });
  assert.equal(archive.status, 0, String(archive.stderr));
  const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  assert.equal(untar.status, 0, String(untar.stderr));
}

function overlay(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(dir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    if (typeof content === 'object' && content !== null && 'copyFrom' in content) {
      copyFileSync(content.copyFrom, absolute);
    } else {
      writeFileSync(absolute, typeof content === 'string' ? content : `${stringifyJson(content, 2)}\n`);
    }
  }
}

function fixtureJson(name) {
  return parseJson(readFileSync(join(FIXTURE, name), 'utf8'));
}

function registryWith(status) {
  const registry = fixtureJson('registry.json');
  registry.contracts[0].status = status;
  return registry;
}

let caseCounter = 0;
/** Fresh copies of the two recorded trees with the given overlays. */
function trees(baseOverlay, headOverlay) {
  caseCounter += 1;
  const base = join(SCRATCH, `case-${String(caseCounter)}`, 'base');
  const head = join(SCRATCH, `case-${String(caseCounter)}`, 'head');
  materialise(BASE_COMMIT, base);
  materialise(HEAD_COMMIT, head);
  overlay(base, { [SCHEMA_PATH]: { copyFrom: join(FIXTURE, 'base.scene.schema.json') }, ...baseOverlay });
  overlay(head, { [SCHEMA_PATH]: { copyFrom: join(FIXTURE, 'head.scene.schema.json') }, ...headOverlay });
  return { base, head };
}

function parseLines(text) {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const record = parseJson(line);
      const schema = SCHEMAS.get(record._schema.id);
      assert.ok(schema !== undefined, line);
      validateJsonSchema(schema, record);
      return record;
    });
}

function gate({ base, head }) {
  const result = spawnSync(process.execPath, [GATE, '--base-dir', base, '--head-dir', head], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 900_000,
  });
  const stdout = parseLines(result.stdout);
  const stderr = parseLines(result.stderr);
  return {
    status: result.status,
    stdout,
    stderr,
    text: result.stdout + result.stderr,
    differences: stdout.filter((line) => line.kind === 'difference'),
    violations: stdout.filter((line) => line.kind === 'violation'),
    contracts: stdout.filter((line) => line.kind === 'contract'),
  };
}

const DRAFT_RECORD = fixtureJson('record.json');

let noRecord;
before(() => {
  noRecord = gate(trees({ 'contracts/registry.json': registryWith('draft') }, { 'contracts/registry.json': registryWith('draft') }));
});

test('replaying flyingrobots/geordi#212 with no change record fails the gate', () => {
  assert.equal(noRecord.status, 1, noRecord.text);
  assert.deepEqual(
    noRecord.violations.map((line) => [line.code, line.contract]),
    [['GEORDI_E_CONTRACT_RECORD_MISSING', CONTRACT]],
  );
  const [contract] = noRecord.contracts;
  assert.equal(contract.contract, CONTRACT);
  assert.equal(contract.state, 'changed');
  assert.equal(contract.classification, 'breaking');
  assert.equal(noRecord.stderr.at(-1).code, 'GEORDI_E_CONTRACT_GATE_FAILED');
});

test('the replay names the renamed field of the serialized format', () => {
  const schema = noRecord.differences.filter((line) => line.surface === 'schema');
  const radiance = schema.find((line) => line.change === 'removed' && line.item.endsWith('/properties/radiance'));
  const irradiance = schema.find((line) => line.change === 'added' && line.item.endsWith('/properties/irradiance'));
  assert.ok(radiance, stringifyJson(schema));
  assert.ok(irradiance, stringifyJson(schema));
  assert.equal(radiance.classification, 'breaking');
  assert.equal(irradiance.classification, 'breaking', 'a new required field is breaking');
  assert.equal(radiance.contract, CONTRACT);
});

test('the replay names the added and the narrowed diagnostic codes', () => {
  const diagnostics = noRecord.differences.filter((line) => line.surface === 'diagnostic');
  const added = diagnostics.find((line) => line.item === 'GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE');
  const narrowed = diagnostics.find((line) => line.item === 'GEORDI_E_RT_RADIANCE_OUT_OF_RANGE');
  assert.equal(added.change, 'added');
  assert.equal(added.classification, 'additive');
  assert.equal(narrowed.change, 'changed');
  assert.equal(narrowed.treatedAs, 'breaking');
  assert.match(narrowed.before, /radiance channel is outside/u);
  assert.match(narrowed.after, /uniform sky/u);
});

test('the replay names the changed public Rust type', () => {
  const api = noRecord.differences.filter((line) => line.surface === 'rust-api');
  const items = new Map(api.map((line) => [line.item, line]));
  assert.equal(items.get('field GeordiRayTracedLight.radiance')?.change, 'removed', stringifyJson([...items.keys()]));
  assert.equal(items.get('field GeordiRayTracedLight.radiance').classification, 'breaking');
  assert.equal(items.get('field GeordiRayTracedLight.value')?.change, 'added');
  assert.equal(items.get('field GeordiRayTracedLight.value').classification, 'breaking', 'a new field of an exhaustive struct breaks struct literals');
  assert.equal(items.get('enum GeordiRayTracedLightValue')?.change, 'added');
  assert.equal(items.get('use GeordiRayTracedLightValue')?.change, 'added');
  assert.ok(!items.has('impl Deserialize for GeordiRayTracedLight'), 'a derive replaced by a hand-written impl is not a change');
});

test('the replay names the changed reference hash, computed by each tree\'s own encoder', () => {
  const example = noRecord.differences.find((line) => line.surface === 'example' && line.item === REFERENCE);
  assert.ok(example, noRecord.text);
  assert.equal(example.before, OLD_SCENE_HASH);
  assert.equal(example.after, NEW_SCENE_HASH);
  assert.equal(example.classification, 'breaking');
});

test('the same replay with a change record passes for a draft contract', () => {
  const run = gate(
    trees(
      { 'contracts/registry.json': registryWith('draft') },
      { 'contracts/registry.json': registryWith('draft'), 'contracts/changes/212-directional-irradiance.json': DRAFT_RECORD },
    ),
  );
  assert.equal(run.status, 0, run.text);
  assert.deepEqual(run.violations, []);
  assert.deepEqual(run.contracts[0].records, ['contracts/changes/212-directional-irradiance.json']);
});

test('the same replay with a change record fails for a frozen contract', () => {
  const run = gate(
    trees(
      { 'contracts/registry.json': registryWith('frozen') },
      { 'contracts/registry.json': registryWith('frozen'), 'contracts/changes/212-directional-irradiance.json': DRAFT_RECORD },
    ),
  );
  assert.equal(run.status, 1, run.text);
  assert.deepEqual(run.violations.map((line) => line.code), ['GEORDI_E_CONTRACT_FROZEN_BREAKING']);
});

test('the frozen replay passes when the version is raised and version 1 is kept', () => {
  // What flyingrobots/geordi#212 would have had to do against a frozen contract: keep the
  // version 1 schema and reference scene byte for byte, and carry the change as version 2.
  const dirs = trees(
    { 'contracts/registry.json': registryWith('frozen') },
    {
      'contracts/registry.json': fixtureJson('registry-version-raised.json'),
      [SCHEMA_PATH]: { copyFrom: join(FIXTURE, 'base.scene.schema.json') },
      'schemas/geordi-ray-traced-scene/2/scene.schema.json': { copyFrom: join(FIXTURE, 'head.scene.schema.json') },
      'contracts/changes/212-version-2.json': fixtureJson('record-version-2.json'),
      'contracts/changes/212-version-1-superseded.json': fixtureJson('record-version-1-superseded.json'),
    },
  );
  overlay(dirs.head, {
    [REFERENCE_V2]: { copyFrom: join(dirs.head, REFERENCE) },
  });
  overlay(dirs.head, {
    [REFERENCE]: { copyFrom: join(dirs.base, REFERENCE) },
  });
  const run = gate(dirs);
  assert.equal(run.status, 0, run.text);
  assert.deepEqual(
    run.contracts.map((line) => [line.contract, line.state]),
    [
      [CONTRACT, 'superseded'],
      ['geordi-ray-traced-scene/2', 'new'],
    ],
  );
});

test('the frozen replay fails when the version is raised but version 1 is not kept', () => {
  const dirs = trees(
    { 'contracts/registry.json': registryWith('frozen') },
    {
      'contracts/registry.json': fixtureJson('registry-version-raised.json'),
      'schemas/geordi-ray-traced-scene/2/scene.schema.json': { copyFrom: join(FIXTURE, 'head.scene.schema.json') },
      'contracts/changes/212-version-2.json': fixtureJson('record-version-2.json'),
      'contracts/changes/212-version-1-superseded.json': fixtureJson('record-version-1-superseded.json'),
    },
  );
  overlay(dirs.head, { [REFERENCE_V2]: { copyFrom: join(dirs.head, REFERENCE) } });
  const run = gate(dirs);
  assert.equal(run.status, 1, run.text);
  assert.deepEqual(run.violations.map((line) => line.code), ['GEORDI_E_CONTRACT_SUPERSEDED_CHANGED']);
  assert.deepEqual(run.violations[0].paths, [SCHEMA_PATH, REFERENCE]);
});
