// Tests of the contract gate's TypeScript surface (flyingrobots/geordi#219): the public
// TypeScript API of each published package, computed from each tree's own sources by the
// TypeScript compiler's type checker and compared with the base like the other surfaces.
// Every line the gate writes, on stdout and stderr, is validated against the schema it names.
//
//   node --test scripts/contract-gate-typescript.test.mjs
//
// The trees are small synthetic repositories with one or two packages under packages/. The
// last test runs the gate over this repository's own published packages.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';

import { loadSchemaDirectory, validateJsonSchema } from './lib/json-schema-subset.mjs';
import { parseJson, stringifyJson } from './lib/contract-gate/json.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const GATE = join(REPO_ROOT, 'scripts', 'contract-gate.mjs');
const SCHEMAS = loadSchemaDirectory(join(REPO_ROOT, 'schemas', 'geordi-contract-gate'));
const SCRATCH = mkdtempSync(join(tmpdir(), 'geordi-contract-gate-ts-test-'));

after(() => rmSync(SCRATCH, { recursive: true, force: true }));

let counter = 0;
function scratchDir(name) {
  counter += 1;
  const dir = join(SCRATCH, `${String(counter)}-${name}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTree(dir, files, transform = (text) => text) {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      continue;
    }
    const absolute = join(dir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, transform(typeof content === 'string' ? content : `${stringifyJson(content, 2)}\n`));
  }
  return dir;
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

function runGate(args) {
  const result = spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', cwd: REPO_ROOT, timeout: 600_000 });
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
    coverage: of('coverage'),
    result: of('result')[0],
    raw: result,
  };
}

function compare(baseFiles, headFiles, options = {}) {
  const base = writeTree(scratchDir('base'), baseFiles);
  const head = writeTree(scratchDir('head'), headFiles, options.headTransform);
  return runGate(['--base-dir', base, '--head-dir', head]);
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2022'],
    strict: true,
    outDir: './dist',
    rootDir: './src',
    types: [],
    skipLibCheck: true,
  },
  include: ['src/**/*'],
};

const CONTRACT = '@demo/api/0';
const DEP_CONTRACT = '@demo/dep/0';

/** A published package at packages/<dir>: manifest, tsconfig and `src` files. */
function pkg(dir, name, sources, manifest = {}) {
  const files = {
    [`packages/${dir}/package.json`]: {
      name,
      version: '0.1.0',
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      scripts: { build: 'tsc' },
      ...manifest,
    },
    [`packages/${dir}/tsconfig.json`]: TSCONFIG,
  };
  for (const [path, text] of Object.entries(sources)) {
    files[`packages/${dir}/src/${path}`] = text;
  }
  return files;
}

function registry(extra = {}) {
  return {
    registryVersion: 'geordi-contract-registry/1',
    contracts: [],
    messageSchemaFamilies: [],
    ungated: [],
    typescriptPackages: { directory: 'packages', status: 'draft', statusEvidence: 'test fixture' },
    ...extra,
  };
}

const API_INDEX = [
  'export interface Options {',
  '  readonly size: number;',
  '  label?: string;',
  '}',
  'export type Mode = "fast" | "exact";',
  'export function render(options: Options): string {',
  '  return String(options.size);',
  '}',
  'export function parse(text: string): number;',
  'export function parse(text: string, radix: number): number;',
  'export function parse(text: string | Uint8Array, radix?: number | bigint): number {',
  '  return Number.parseInt(String(text), Number(radix ?? 10));',
  '}',
  'export const VERSION = "1";',
  'export class Renderer {',
  '  constructor(readonly mode: Mode) {}',
  '  draw(): void {}',
  '}',
  'export { helper } from "./helper.js";',
  'export * from "./more.js";',
  '',
].join('\n');

const HELPER = 'export function helper(value: number): number {\n  return value + 1;\n}\nexport function internalOnly(): void {}\n';
const MORE = 'export const MORE = 2;\nexport interface More {\n  more: number;\n}\n';

function apiTree(index = API_INDEX, extra = {}) {
  return {
    'contracts/registry.json': registry(),
    ...pkg('api', '@demo/api', { 'index.ts': index, 'helper.ts': HELPER, 'more.ts': MORE }),
    ...extra,
  };
}

function record(contract, change, extra = {}) {
  return {
    contract,
    change,
    summary: `test change to ${contract}`,
    why: 'test',
    references: ['flyingrobots/geordi#219'],
    ...extra,
  };
}

function codes(run) {
  return run.violations.map((violation) => violation.code).sort();
}

function differenceOf(run, item) {
  return run.differences.find((line) => line.surface === 'typescript-api' && line.item === item);
}

function edit(text, from, to) {
  assert.ok(text.includes(from), `fixture does not contain ${from}`);
  return text.replace(from, to);
}

test('an unchanged package passes with no record, and its coverage names the typescript-api surface', () => {
  const run = compare(apiTree(), apiTree());
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.differences.length, 0);
  const coverage = run.coverage.find((line) => line.contract === CONTRACT);
  assert.deepEqual(coverage.surfaces, ['typescript-api']);
  assert.equal(coverage.gated, true);
});

test('golden: a removed export fails without a change record and names the item', () => {
  const head = apiTree(edit(API_INDEX, 'export const VERSION = "1";\n', ''));
  const run = compare(apiTree(), head);
  assert.equal(run.status, 1, run.raw.stdout + run.raw.stderr);
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const removed = differenceOf(run, 'export VERSION');
  assert.equal(removed.change, 'removed');
  assert.equal(removed.classification, 'breaking');
  assert.equal(removed.contract, CONTRACT);
  assert.equal(run.differences.length, 1, stringifyJson(run.differences));
  assert.equal(run.contracts.find((line) => line.contract === CONTRACT).classification, 'breaking');
  assert.equal(run.stderr.at(-1).code, 'GEORDI_E_CONTRACT_GATE_FAILED');

  const understated = compare(apiTree(), { ...head, 'contracts/changes/2026-11-23-demo.json': record(CONTRACT, 'additive') });
  assert.deepEqual(codes(understated), ['GEORDI_E_CONTRACT_RECORD_UNDERSTATED']);
  const recorded = compare(apiTree(), { ...head, 'contracts/changes/2026-11-23-demo.json': record(CONTRACT, 'breaking') });
  assert.equal(recorded.status, 0, recorded.raw.stdout + recorded.raw.stderr);
});

test('a renamed export is a removed export and an added one', () => {
  const run = compare(apiTree(), apiTree(edit(API_INDEX, 'export function render(', 'export function draw(')));
  assert.equal(differenceOf(run, 'export render').classification, 'breaking');
  assert.equal(differenceOf(run, 'export draw').classification, 'additive');
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
});

test('a changed function signature is breaking and shows both signatures', () => {
  const run = compare(apiTree(), apiTree(edit(API_INDEX, 'export function render(options: Options): string {', 'export function render(options: Options, scale: number): string {')));
  const changed = differenceOf(run, 'signature render');
  assert.equal(changed.change, 'changed');
  assert.equal(changed.classification, 'breaking');
  assert.equal(changed.before, '(Options) => string');
  assert.equal(changed.after, '(Options, number) => string');
});

test('renaming a parameter is not a difference, but narrowing its type is', () => {
  const renamed = compare(apiTree(), apiTree(edit(API_INDEX, 'render(options: Options): string {\n  return String(options.size);', 'render(input: Options): string {\n  return String(input.size);')));
  assert.equal(renamed.differences.length, 0, stringifyJson(renamed.differences));
  const helperNarrowed = compare(apiTree(), { ...apiTree(), 'packages/api/src/helper.ts': edit(HELPER, 'helper(value: number)', 'helper(value: 1 | 2)') });
  const changed = differenceOf(helperNarrowed, 'signature helper');
  assert.equal(changed.classification, 'breaking');
  assert.equal(changed.before, '(number) => number');
  assert.equal(changed.after, '(1 | 2) => number');
});

test('an added export is additive and passes with an additive record', () => {
  const head = apiTree(`${API_INDEX}export function extra(): void {}\n`);
  const run = compare(apiTree(), head);
  const added = differenceOf(run, 'export extra');
  assert.equal(added.change, 'added');
  assert.equal(added.classification, 'additive');
  assert.equal(run.contracts.find((line) => line.contract === CONTRACT).classification, 'additive');
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const recorded = compare(apiTree(), { ...head, 'contracts/changes/2026-11-23-demo.json': record(CONTRACT, 'additive') });
  assert.equal(recorded.status, 0, recorded.raw.stdout + recorded.raw.stderr);
});

test('a type-only export is recorded as a type, and making a value export type-only is breaking', () => {
  const typeOnly = 'export type { Renderer as RendererType } from "./index.js";\n';
  const base = apiTree(API_INDEX, { 'packages/api/src/types.ts': typeOnly });
  const withTypes = (tree) => ({ ...tree, 'packages/api/src/index.ts': `${tree['packages/api/src/index.ts']}export type { RendererType } from "./types.js";\n` });
  const added = compare(base, withTypes(base));
  const line = differenceOf(added, 'export RendererType');
  assert.equal(line.classification, 'additive');
  assert.equal(line.after, 'class, type only');

  const head = apiTree(edit(API_INDEX, 'export class Renderer', 'class Renderer').concat('export type { Renderer };\n'));
  const run = compare(apiTree(), head);
  const changed = differenceOf(run, 'export Renderer');
  assert.equal(changed.change, 'changed');
  assert.equal(changed.classification, 'breaking');
  assert.equal(changed.before, 'class');
  assert.equal(changed.after, 'class, type only');

  const star = compare(apiTree(), apiTree(edit(API_INDEX, 'export * from "./more.js";', 'export type * from "./more.js";')));
  assert.equal(differenceOf(star, 'export MORE').classification, 'breaking');
  assert.equal(differenceOf(star, 'export More'), undefined, 'an interface is a type either way');
});

test('re-exports are followed: a re-exported item is compared, and dropping a re-export is breaking', () => {
  const changed = compare(apiTree(), { ...apiTree(), 'packages/api/src/helper.ts': edit(HELPER, '): number {', '): string {').replace('return value + 1;', 'return String(value);') });
  assert.equal(differenceOf(changed, 'signature helper').classification, 'breaking');

  const dropped = compare(apiTree(), apiTree(edit(API_INDEX, 'export { helper } from "./helper.js";\n', '')));
  assert.equal(differenceOf(dropped, 'export helper').classification, 'breaking');

  const starChanged = compare(apiTree(), { ...apiTree(), 'packages/api/src/more.ts': edit(MORE, 'more: number;', 'more: string;') });
  assert.equal(differenceOf(starChanged, 'member More.more').classification, 'breaking');
  assert.equal(differenceOf(changed, 'export internalOnly'), undefined, 'a function the entry does not re-export is not public');
});

test('an overload: adding one is additive, changing one is breaking', () => {
  const added = compare(apiTree(), apiTree(edit(API_INDEX, 'export function parse(text: string): number;', 'export function parse(text: string): number;\nexport function parse(text: Uint8Array): number;')));
  const line = differenceOf(added, 'signature parse');
  assert.equal(line.change, 'added');
  assert.equal(line.classification, 'additive');
  assert.equal(line.after, '(Uint8Array<ArrayBufferLike>) => number');

  const changed = compare(apiTree(), apiTree(edit(API_INDEX, 'export function parse(text: string, radix: number): number;', 'export function parse(text: string, radix: bigint): number;')));
  const kinds = changed.differences.filter((entry) => entry.item === 'signature parse').map((entry) => `${entry.change}:${entry.classification}`).sort();
  assert.deepEqual(kinds, ['added:additive', 'removed:breaking']);
  assert.equal(changed.contracts.find((entry) => entry.contract === CONTRACT).classification, 'breaking');
});

test('interface members: a new optional property is additive; a required, removed or re-typed one is breaking', () => {
  const optional = compare(apiTree(), apiTree(edit(API_INDEX, '  label?: string;', '  label?: string;\n  color?: string;')));
  assert.equal(differenceOf(optional, 'member Options.color').classification, 'additive');
  const required = compare(apiTree(), apiTree(edit(API_INDEX, '  label?: string;', '  label?: string;\n  color: string;')));
  assert.equal(differenceOf(required, 'member Options.color').classification, 'breaking');
  const removed = compare(apiTree(), apiTree(edit(API_INDEX, '  label?: string;\n', '')));
  assert.equal(differenceOf(removed, 'member Options.label').classification, 'breaking');
  const retyped = compare(apiTree(), apiTree(edit(API_INDEX, '  readonly size: number;', '  readonly size: bigint;').replace('String(options.size)', 'options.size.toString()')));
  const line = differenceOf(retyped, 'member Options.size');
  assert.equal(line.classification, 'breaking');
  assert.equal(line.before, 'readonly size: number');
  assert.equal(line.after, 'readonly size: bigint');
  const method = compare(apiTree(), apiTree(edit(API_INDEX, '  draw(): void {}', '  draw(): void {}\n  clear(): void {}')));
  assert.equal(differenceOf(method, 'member Renderer.clear').classification, 'additive', 'a method added to a class is additive');
});

test('an inferred type is compared, so a change that leaves the declaration text alone is seen', () => {
  const run = compare(apiTree(), apiTree(edit(API_INDEX, 'export const VERSION = "1";', 'export const VERSION = "2";')));
  const line = differenceOf(run, 'export VERSION');
  assert.equal(line.change, 'changed');
  assert.equal(line.classification, 'breaking');
  assert.equal(line.before, 'const "1"');
  assert.equal(line.after, 'const "2"');
});

test('the base resolves workspace packages to its own sources, not to the head\'s', () => {
  // @demo/api re-exports a constant whose type is inferred from @demo/dep. Only dep changes, so
  // api's source text is identical in both trees; api's API differs only if each tree's api
  // resolved its own dep.
  const tree = (value) => ({
    'contracts/registry.json': registry(),
    ...pkg('api', '@demo/api', { 'index.ts': 'import { DEP } from "@demo/dep";\nexport const FROM_DEP = DEP;\n' }),
    ...pkg('dep', '@demo/dep', { 'index.ts': `export const DEP = ${value} as const;\n` }),
  });
  const run = compare(tree('1'), tree('2'));
  const line = differenceOf(run, 'export FROM_DEP');
  assert.equal(line.contract, CONTRACT);
  assert.equal(line.before, 'const 1');
  assert.equal(line.after, 'const 2');
  assert.equal(run.differences.find((entry) => entry.contract === DEP_CONTRACT).item, 'export DEP');
});

test('a subpath export is its own entry point; removing it is breaking; a non-TypeScript export is recorded by target', () => {
  const manifest = {
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './node': { types: './dist/node.d.ts', import: './dist/node.js' },
      './data.json': './data/data.json',
    },
  };
  const tree = (withNode) => ({
    'contracts/registry.json': registry(),
    ...pkg('api', '@demo/api', { 'index.ts': 'export const A = 1;\n', 'node.ts': 'export function onNode(): void {}\n' }, withNode ? manifest : { exports: { '.': manifest.exports['.'], './data.json': manifest.exports['./data.json'] } }),
  });
  const same = compare(tree(true), tree(true));
  assert.equal(same.status, 0, same.raw.stdout + same.raw.stderr);
  const run = compare(tree(true), tree(false));
  assert.equal(differenceOf(run, 'entry ./node').classification, 'breaking');
  assert.equal(differenceOf(run, 'export ./node:onNode').classification, 'breaking');
  const retargeted = tree(true);
  retargeted['packages/api/package.json'] = { ...retargeted['packages/api/package.json'], exports: { ...manifest.exports, './data.json': './data/other.json' } };
  const moved = compare(tree(true), retargeted);
  const line = differenceOf(moved, 'entry ./data.json');
  assert.equal(line.classification, 'unknown');
  assert.equal(line.treatedAs, 'breaking');
});

test('a new package with no base is a new contract that needs a record', () => {
  const head = { ...apiTree(), ...pkg('dep', '@demo/dep', { 'index.ts': 'export const DEP = 1;\n' }) };
  const run = compare(apiTree(), head);
  const contract = run.contracts.find((line) => line.contract === DEP_CONTRACT);
  assert.equal(contract.state, 'new');
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const recorded = compare(apiTree(), { ...head, 'contracts/changes/2026-11-23-dep.json': record(DEP_CONTRACT, 'additive') });
  assert.equal(recorded.status, 0, recorded.raw.stdout + recorded.raw.stderr);
});

test('a private package is not published and has no TypeScript contract', () => {
  const head = { ...apiTree(), ...pkg('tool', '@demo/tool', { 'index.ts': 'export const T = 1;\n' }, { private: true }) };
  const run = compare(apiTree(), head);
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.contracts.some((line) => line.contract.startsWith('@demo/tool')), false);
});

test('anti-evasion: a pin or stored snapshot edited in the head does not satisfy the gate', () => {
  // The base pins the export list in a file, as scripts/smoke-package-exports.mjs does. The head
  // removes an export, edits the pin to match, and adds a "snapshot" of the new API. The gate
  // reads neither: both snapshots are computed from source.
  const pin = (names) => `${stringifyJson({ exports: names }, 2)}\n`;
  const base = apiTree(API_INDEX, { 'contracts/typescript-api/demo-api.json': pin(['VERSION', 'render']) });
  const head = apiTree(edit(API_INDEX, 'export const VERSION = "1";\n', ''), {
    'contracts/typescript-api/demo-api.json': pin(['render']),
    'packages/api/api-snapshot.json': pin(['render']),
  });
  const run = compare(base, head);
  assert.equal(run.status, 1);
  assert.equal(differenceOf(run, 'export VERSION').classification, 'breaking');
  assert.deepEqual(codes(run), ['GEORDI_E_CONTRACT_RECORD_MISSING']);

  // Marking the package private, or dropping the TypeScript section of the registry, removes the
  // contract, which is itself a breaking difference that needs a record.
  const hidden = compare(apiTree(), apiTree(API_INDEX, { 'packages/api/package.json': { ...apiTree()['packages/api/package.json'], private: true } }));
  assert.equal(hidden.contracts.find((line) => line.contract === CONTRACT).state, 'removed');
  assert.deepEqual(codes(hidden), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
  const unregistered = compare(apiTree(), apiTree(API_INDEX, { 'contracts/registry.json': { ...registry(), typescriptPackages: undefined } }));
  assert.equal(unregistered.contracts.find((line) => line.contract === CONTRACT).state, 'removed');
  assert.deepEqual(codes(unregistered), ['GEORDI_E_CONTRACT_RECORD_MISSING']);
});

test('line endings and file creation order do not change the snapshot', () => {
  const reversed = Object.fromEntries(Object.entries(apiTree()).reverse());
  const run = compare(apiTree(), reversed, { headTransform: (text) => text.replace(/\n/gu, '\r\n') });
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.differences.length, 0, stringifyJson(run.differences));
});

test('a package whose program has a compiler error fails closed with a schema-tagged error', () => {
  const run = compare(apiTree(), apiTree(`${API_INDEX}export const broken: number = "text";\n`));
  assert.equal(run.status, 1);
  const error = run.stderr.at(-1);
  assert.equal(error.code, 'GEORDI_E_CONTRACT_GATE_SNAPSHOT');
  assert.match(error.message, /@demo\/api/u);
  assert.match(error.message, /TS2322/u);
  assert.equal(run.result, undefined, 'no result line: the comparison did not run');
});

test('an import that resolves to a workspace symlink outside node_modules fails closed', () => {
  // The tree imports a package it does not contain. The installed repository links that name
  // to its own workspace sources; using them would compare against the head's code, so the
  // gate refuses instead.
  const run = compare(apiTree(), apiTree(`${API_INDEX}export type { GeordiScene } from "@flyingrobots/geordi-core";\n`));
  assert.equal(run.status, 1);
  const error = run.stderr.at(-1);
  assert.equal(error.code, 'GEORDI_E_CONTRACT_GATE_SNAPSHOT');
  assert.match(error.message, /@flyingrobots\/geordi-core resolves outside node_modules/u);
});

test('an exported type that maps to no source fails closed', () => {
  const run = compare(apiTree(), apiTree(API_INDEX, { 'packages/api/package.json': { ...apiTree()['packages/api/package.json'], exports: { '.': { types: './dist/missing.d.ts' } } } }));
  assert.equal(run.stderr.at(-1).code, 'GEORDI_E_CONTRACT_GATE_SNAPSHOT');
  assert.match(run.stderr.at(-1).message, /maps to no TypeScript source/u);
});

test('this repository\'s published packages are snapshotted from a git tree extracted blob by blob', () => {
  // --base HEAD and --head HEAD extract HEAD under target/contract-gate/trees/, where no package
  // has node_modules or dist/: the snapshot needs only the tree's sources and the installed deps.
  const run = runGate(['--base', 'HEAD', '--head', 'HEAD']);
  assert.equal(run.status, 0, run.raw.stdout + run.raw.stderr);
  assert.equal(run.differences.length, 0, stringifyJson(run.differences.slice(0, 5)));
  const packages = run.coverage.filter((line) => line.surfaces.includes('typescript-api')).map((line) => line.contract);
  assert.ok(packages.includes('@flyingrobots/geordi-core/0'), packages.join(', '));
  assert.ok(packages.includes('@flyingrobots/geordi-bijou-gpu/0'), packages.join(', '));
  assert.equal(packages.length, 10, packages.join(', '));
});
