// Contract surface snapshots, computed from the source of one tree.
//
// The same code runs over the base and the head. Nothing here reads a stored snapshot or a
// pinned value: schemas are canonicalised and hashed, example documents are hashed by the
// tree's own encoder (a Rust function built from that tree), diagnostic codes are read from
// the catalog and from the source, and public Rust items are parsed from source with
// crates/geordi-contract-api. The public TypeScript API of each published package is read from
// the tree's own sources by the TypeScript compiler: see typescript-api.mjs.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { ContractGateError } from './errors.mjs';
import { canonicalJson, ContractGateJsonError, parseJson } from './json.mjs';
import { publishedPackages, typescriptApis } from './typescript-api.mjs';
import { JsonSchemaViolationError, loadSchemaDirectory, UnsupportedJsonSchemaError, validateJsonSchema } from '../json-schema-subset.mjs';

export const REGISTRY_PATH = 'contracts/registry.json';
export const CHANGES_DIR = 'contracts/changes';

const SCRIPT_REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const API_SCHEMAS = loadSchemaDirectory(join(SCRIPT_REPO_ROOT, 'schemas', 'geordi-contract-api'));
const HARNESS_SCHEMAS = loadSchemaDirectory(join(SCRIPT_REPO_ROOT, 'schemas', 'geordi-contract-hash-harness'));
export const FORMAT_SCHEMAS = loadSchemaDirectory(join(SCRIPT_REPO_ROOT, 'schemas', 'geordi-contract-registry'));

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function snapshotError(message, paths = []) {
  return new ContractGateError('GEORDI_E_CONTRACT_GATE_SNAPSHOT', message, paths);
}

/** Validate against a schema; return the first violation's message, or null. */
export function schemaViolation(schema, value) {
  try {
    validateJsonSchema(schema, value);
    return null;
  } catch (error) {
    if (error instanceof JsonSchemaViolationError) {
      return error.message;
    }
    if (error instanceof UnsupportedJsonSchemaError) {
      return error.message;
    }
    throw error;
  }
}

/** `name/N` → { id, version } */
export function splitContract(key) {
  const slash = key.lastIndexOf('/');
  return { id: key.slice(0, slash), version: Number(key.slice(slash + 1)) };
}

export function compareContractKeys(left, right) {
  const a = splitContract(left);
  const b = splitContract(right);
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return a.version - b.version;
}

/**
 * The registry of a tree, or null when the tree has none. `side` names the tree in errors.
 * An invalid registry is an error on either side: the gate cannot compare what it cannot read.
 */
export function loadRegistry(tree, side) {
  const text = tree.text(REGISTRY_PATH);
  if (text === null) {
    return null;
  }
  let registry;
  try {
    registry = parseJson(text);
  } catch (error) {
    if (error instanceof ContractGateJsonError) {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `${side} ${REGISTRY_PATH} is not JSON: ${error.message}`, [REGISTRY_PATH]);
    }
    throw error;
  }
  const violation = schemaViolation(FORMAT_SCHEMAS.get('geordi.contract_registry.registry'), registry);
  if (violation !== null) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `${side} ${REGISTRY_PATH} does not match its schema: ${violation}`, [REGISTRY_PATH]);
  }
  return registry;
}

/**
 * Every contract of a registry, keyed by `name/N`, with message schema families expanded
 * into one contract per `*.schema.json` file (`<x-schema-id>/<major of x-schema-version>`).
 */
export function expandContracts(tree, registry, side) {
  const contracts = new Map();
  const add = (entry) => {
    if (contracts.has(entry.contract)) {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `${side} registry lists ${entry.contract} twice`, [REGISTRY_PATH]);
    }
    contracts.set(entry.contract, entry);
  };
  for (const entry of registry.contracts) {
    add({ ...entry, family: null });
  }
  for (const family of registry.messageSchemaFamilies) {
    const names = tree.list(family.directory, '.schema.json');
    if (names.length === 0) {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `${side} message schema family ${family.directory} has no *.schema.json files`, [family.directory]);
    }
    for (const name of names) {
      const path = `${family.directory}/${name}`;
      const schema = readJson(tree, path, `${side} message schema`);
      const id = schema['x-schema-id'];
      const version = /^([1-9][0-9]*)\.[0-9]+\.[0-9]+$/u.exec(String(schema['x-schema-version']));
      if (typeof id !== 'string' || version === null) {
        throw new ContractGateError(
          'GEORDI_E_CONTRACT_GATE_REGISTRY',
          `${side} ${path} is in a message schema family but has no x-schema-id and semantic x-schema-version`,
          [path],
        );
      }
      add({
        contract: `${id}/${version[1]}`,
        status: family.status,
        statusEvidence: family.statusEvidence,
        schema: path,
        examples: [],
        notCovered: [
          ...(family.notCovered ?? []),
          'examples: the command\'s own tests validate its real output against this schema; the gate compares the schema only',
        ],
        family: family.directory,
      });
    }
  }
  if (registry.typescriptPackages !== undefined) {
    for (const entry of typescriptPackageContracts(tree, registry.typescriptPackages, side)) {
      add(entry);
    }
  }
  return contracts;
}

/** What the TypeScript surface does not see; printed on every package's coverage line. */
export const TYPESCRIPT_NOT_COVERED = [
  'Behaviour: a function whose signature is unchanged may still do something else.',
  'Third-party types are read from the dependencies installed for the repository running the gate (the head\'s lockfile), on both trees; a dependency upgrade that changes a re-exported third-party type is seen only where it changes a type this package prints.',
  'Types are compared as the compiler prints them: two spellings of one type (an alias and its expansion) differ, and a parameter widened is reported as changed (breaking), like one narrowed.',
  'Only package.json exports (or types/main) are entry points; deep imports into dist/ are not public API.',
];

/**
 * One contract per published package (`private` is not true) under the group's directory:
 * `<package name>/<major version>`, compared by its public TypeScript API.
 */
function typescriptPackageContracts(tree, group, side) {
  const entries = [];
  for (const pkg of publishedPackages(tree, group.directory)) {
    const major = /^(0|[1-9][0-9]*)\.[0-9]+\.[0-9]+(?:[-+].*)?$/u.exec(pkg.version ?? '');
    if (major === null) {
      throw new ContractGateError(
        'GEORDI_E_CONTRACT_GATE_REGISTRY',
        `${side} ${pkg.dir}/package.json is a published package with no semantic version, so its TypeScript API contract has no name/N key`,
        [`${pkg.dir}/package.json`],
      );
    }
    entries.push({
      contract: `${pkg.name}/${major[1]}`,
      status: group.status,
      statusEvidence: group.statusEvidence,
      schema: null,
      examples: [],
      typescriptApi: { package: pkg.dir },
      notCovered: [...(group.notCovered ?? []), ...TYPESCRIPT_NOT_COVERED],
      family: null,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Rust public items (crates/geordi-contract-api)
// ---------------------------------------------------------------------------------------------

function parseToolLines(text, schemas, what) {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      let record;
      try {
        record = parseJson(line);
      } catch (error) {
        if (error instanceof ContractGateJsonError) {
          throw snapshotError(`${what} wrote a line that is not JSON: ${line.slice(0, 200)}`);
        }
        throw error;
      }
      const schema = schemas.get(record?._schema?.id);
      const violation = schema === undefined ? `no declared schema ${String(record?._schema?.id)}` : schemaViolation(schema, record);
      if (violation !== null) {
        throw snapshotError(`${what} wrote a line that does not match its schema: ${violation}`);
      }
      return record;
    });
}

function lastLines(text, count) {
  return text.trim().split('\n').slice(-count).join(' | ');
}

/** Public Rust items of each file, by repository-relative path. Files must exist. */
function rustItems(tree, paths) {
  const result = new Map();
  if (paths.length === 0) {
    return result;
  }
  for (const path of paths) {
    if (tree.bytes(path) === null) {
      throw snapshotError(`${tree.description}: ${path} does not exist`, [path]);
    }
    result.set(path, []);
  }
  const byAbsolute = new Map(paths.map((path) => [tree.absolute(path), path]));
  const run = spawnSync(
    'cargo',
    ['run', '--quiet', '--locked', '--manifest-path', join(SCRIPT_REPO_ROOT, 'Cargo.toml'), '-p', 'geordi-contract-api', '--', ...byAbsolute.keys()],
    { encoding: 'utf8', maxBuffer: 1 << 30 },
  );
  if (run.error !== undefined) {
    throw snapshotError(`cannot run cargo for the Rust public-item snapshot: ${run.error.message}`);
  }
  if (run.status !== 0) {
    const errors = run.stderr
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .flatMap((line) => {
        try {
          return [parseJson(line)];
        } catch {
          return [];
        }
      })
      .filter((line) => line.kind === 'error');
    if (errors.length > 0) {
      const paths = errors.flatMap((line) => line.paths.map((path) => byAbsolute.get(path) ?? path));
      throw snapshotError(`${tree.description}: Rust public-item snapshot failed: ${errors.map((line) => line.message).join('; ')}`, paths);
    }
    throw snapshotError(`${tree.description}: cannot build or run geordi-contract-api: ${lastLines(run.stderr, 6)}`);
  }
  for (const line of parseToolLines(run.stdout, API_SCHEMAS, 'geordi-contract-api')) {
    if (line.kind === 'item') {
      result.get(byAbsolute.get(line.file)).push(line);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Example hashes: each tree's own encoder, built from that tree
// ---------------------------------------------------------------------------------------------

function digestDirectory(root, rel, hash) {
  const absolute = join(root, ...rel.split('/'));
  for (const name of readdirSync(absolute).sort()) {
    if (name === 'target') {
      continue;
    }
    const child = rel === '' ? name : `${rel}/${name}`;
    const stats = statSync(join(absolute, name));
    if (stats.isDirectory()) {
      digestDirectory(root, child, hash);
    } else if (stats.isFile()) {
      hash.update(`${child}\0`);
      hash.update(readFileSync(join(absolute, name)));
      hash.update('\0');
    }
  }
}

/** A content-addressed copy of the encoder crate with the tree's root manifest and lock. */
function copyCrate(tree, crate, cacheRoot) {
  if (tree.bytes(`${crate}/Cargo.toml`) === null) {
    throw snapshotError(`${tree.description}: encoder crate ${crate} has no Cargo.toml`, [`${crate}/Cargo.toml`]);
  }
  const hash = createHash('sha256');
  hash.update(`${crate}\0`);
  for (const root of ['Cargo.toml', 'Cargo.lock']) {
    const bytes = tree.bytes(root);
    hash.update(`${root}\0`);
    hash.update(bytes ?? Buffer.alloc(0));
  }
  digestDirectory(tree.dir, crate, hash);
  const digest = hash.digest('hex');
  const dir = join(cacheRoot, 'crates', digest);
  if (!existsSync(join(dir, '.contract-gate-complete'))) {
    const staging = `${dir}.${String(process.pid)}.partial`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    for (const root of ['Cargo.toml', 'Cargo.lock']) {
      const bytes = tree.bytes(root);
      if (bytes !== null) {
        writeFileSync(join(staging, root), bytes);
      }
    }
    // Skip build output inside the crate. The test is relative to the crate: a git base is
    // extracted under target/contract-gate/trees/, so every absolute path of it contains `target`.
    const crateRoot = tree.absolute(crate);
    cpSync(crateRoot, join(staging, ...crate.split('/')), {
      recursive: true,
      filter: (source) => !relative(crateRoot, source).split(sep).includes('target'),
    });
    writeFileSync(join(staging, '.contract-gate-complete'), `${digest}\n`);
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
  }
  return { dir, digest };
}

function packageName(manifest) {
  const match = /^\[package\][^[]*?^name\s*=\s*"([^"]+)"/msu.exec(manifest);
  return match === null ? null : match[1];
}

const HARNESS_TEMPLATE = readFileSync(join(import.meta.dirname, 'hash-harness.rs.template'), 'utf8');

function harnessSource(functions) {
  const arms = functions
    .map((fn, index) => `            "${String(index)}" => ${fn}(&source).map_err(|error| format!("{error:?}")),`)
    .join('\n');
  return HARNESS_TEMPLATE.replace('/*ENCODER_ARMS*/', arms);
}

/** The key of one example's hash: two contracts may hash the same file with different encoders. */
export function hashKey(fn, path) {
  return `${fn}\0${path}`;
}

/** Hash each example with its Rust encoder, built from this tree. Returns hashKey → hash. */
function rustHashes(tree, examples, cacheRoot) {
  const hashes = new Map();
  const byCrate = new Map();
  for (const example of examples) {
    const list = byCrate.get(example.encoder.crate) ?? [];
    list.push(example);
    byCrate.set(example.encoder.crate, list);
  }
  for (const [crate, jobs] of [...byCrate].sort(([a], [b]) => (a < b ? -1 : 1))) {
    hashCrate(tree, crate, jobs, cacheRoot, hashes);
  }
  return hashes;
}

function hashCrate(tree, crate, jobs, cacheRoot, hashes) {
  const copy = copyCrate(tree, crate, cacheRoot);
  const name = packageName(readFileSync(join(copy.dir, ...crate.split('/'), 'Cargo.toml'), 'utf8'));
  if (name === null) {
    throw snapshotError(`${tree.description}: cannot read the package name of ${crate}/Cargo.toml`, [`${crate}/Cargo.toml`]);
  }
  const lib = name.replace(/-/gu, '_');
  const functions = [...new Set(jobs.map((job) => job.encoder.function))].sort();
  for (const fn of functions) {
    if (!fn.startsWith(`${lib}::`)) {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `encoder ${fn} is not in crate ${name} (${crate})`, [REGISTRY_PATH]);
    }
  }
  const source = harnessSource(functions);
  const harness = join(cacheRoot, 'harness', sha256Hex(`${copy.digest}\0${source}`));
  if (!existsSync(join(harness, 'src', 'main.rs'))) {
    mkdirSync(join(harness, 'src'), { recursive: true });
    const cratePath = join(copy.dir, ...crate.split('/')).split(sep).join('/');
    writeFileSync(
      join(harness, 'Cargo.toml'),
      `[package]\nname = "geordi-contract-hash-harness"\nversion = "0.0.0"\nedition = "2024"\npublish = false\n\n[dependencies]\n${name} = { path = "${cratePath}" }\n\n[workspace]\n`,
    );
    if (existsSync(join(copy.dir, 'Cargo.lock'))) {
      writeFileSync(join(harness, 'Cargo.lock'), readFileSync(join(copy.dir, 'Cargo.lock')));
    }
    writeFileSync(join(harness, 'src', 'main.rs'), source);
  }
  const args = jobs.flatMap((job) => [String(functions.indexOf(job.encoder.function)), tree.absolute(job.path)]);
  const run = spawnSync('cargo', ['run', '--quiet', '--manifest-path', join(harness, 'Cargo.toml'), '--', ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    cwd: harness,
    env: { ...process.env, CARGO_TARGET_DIR: join(cacheRoot, 'target') },
  });
  if (run.error !== undefined || run.status !== 0) {
    throw snapshotError(
      `${tree.description}: cannot build or run the encoder harness for ${crate} (${functions.join(', ')}); an encoder must be fn(&str) -> Result<String, E: Debug>: ${run.error?.message ?? lastLines(run.stderr, 8)}`,
      [crate],
    );
  }
  const byAbsolute = new Map(jobs.map((job) => [tree.absolute(job.path), job.path]));
  for (const line of parseToolLines(run.stdout, HARNESS_SCHEMAS, 'the encoder harness')) {
    const path = byAbsolute.get(line.path);
    if (line.kind === 'refusal') {
      throw snapshotError(`${tree.description}: ${functions[Number(line.encoder)]} refuses ${path}: ${line.message}`, [path]);
    }
    hashes.set(hashKey(functions[Number(line.encoder)], path), line.hash);
  }
  for (const job of jobs) {
    if (!hashes.has(hashKey(job.encoder.function, job.path))) {
      throw snapshotError(`${tree.description}: the encoder harness wrote no hash for ${job.path}`, [job.path]);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Diagnostic codes
// ---------------------------------------------------------------------------------------------

/** `### \`CODE\`` sections of a Markdown catalog with their Severity and Message lines. */
export function parseCatalog(text, prefix) {
  const codes = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading !== null) {
      const code = /^`([A-Z][A-Z0-9_]*)`\s*$/u.exec(heading[2]);
      current = heading[1] === '###' && code !== null && code[1].startsWith(prefix) ? code[1] : null;
      if (current !== null) {
        codes.set(current, { severity: null, message: null });
      }
      continue;
    }
    if (current === null) {
      continue;
    }
    const field = /^\*\*(Severity|Message)\*\*:\s*(.*?)\s*$/u.exec(line);
    if (field !== null) {
      codes.get(current)[field[1].toLowerCase()] = field[2];
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------------------------
// The snapshot of a tree
// ---------------------------------------------------------------------------------------------

/** The first number a parsed JSON document cannot hold exactly, as a JSON path, or null. */
function inexactNumber(value, path = '$') {
  if (typeof value === 'number') {
    // An integral value beyond 2^53 - 1 may be a rounded spelling of a different integer.
    return Number.isInteger(value) && !Number.isSafeInteger(value) ? path : null;
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [`${path}[${String(index)}]`, item])
    : typeof value === 'object' && value !== null
      ? Object.entries(value).map(([key, item]) => [`${path}.${key}`, item])
      : [];
  for (const [at, item] of entries) {
    const found = inexactNumber(item, at);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function readJson(tree, path, what) {
  const text = tree.text(path);
  if (text === null) {
    throw snapshotError(`${tree.description}: ${what} ${path} does not exist`, [path]);
  }
  let document;
  try {
    document = parseJson(text);
  } catch (error) {
    if (error instanceof ContractGateJsonError) {
      throw snapshotError(`${tree.description}: ${what} ${path} is not JSON: ${error.message}`, [path]);
    }
    throw error;
  }
  const inexact = inexactNumber(document);
  if (inexact !== null) {
    throw snapshotError(
      `${tree.description}: ${what} ${path} has a number at ${inexact} beyond 2^53 - 1, which the gate cannot compare exactly; it refuses rather than compare a rounded value`,
      [path],
    );
  }
  return document;
}

function rawDigest(tree, path) {
  const bytes = tree.bytes(path);
  return bytes === null ? null : sha256Hex(bytes);
}

function selectRustItems(itemsByFile, selectors) {
  const items = new Map();
  for (const selector of selectors) {
    for (const item of itemsByFile.get(selector.file)) {
      if (selector.select === 'reexports' && !(item.key.startsWith('use ') && item.reexportFrom?.startsWith(`${selector.from}::`))) {
        continue;
      }
      const key = items.has(item.key) ? `${item.key} (${selector.file})` : item.key;
      items.set(key, item);
    }
  }
  return items;
}

/**
 * Snapshot every contract of a tree. A superseded contract keeps only the raw digests of its
 * schema and example files; a live one gets every surface its registry entry names.
 */
export function snapshotTree(tree, contracts, cacheRoot) {
  const rustFiles = new Set();
  const typescriptPackageDirs = new Set();
  const rustExamples = [];
  for (const entry of contracts.values()) {
    if (entry.status === 'superseded') {
      continue;
    }
    if (entry.typescriptApi !== undefined) {
      typescriptPackageDirs.add(entry.typescriptApi.package);
    }
    for (const selector of entry.rustApi ?? []) {
      rustFiles.add(selector.file);
    }
    for (const source of entry.diagnostics?.sources ?? []) {
      rustFiles.add(source);
    }
    for (const example of entry.examples) {
      if (tree.bytes(example.path) === null) {
        throw snapshotError(`${tree.description}: example ${example.path} of ${entry.contract} does not exist`, [example.path]);
      }
      if (example.encoder.kind === 'rust-fn' && !rustExamples.some((job) => job.path === example.path && job.encoder.function === example.encoder.function)) {
        rustExamples.push(example);
      }
    }
  }
  const itemsByFile = rustItems(tree, [...rustFiles].sort());
  const hashes = rustHashes(tree, rustExamples, cacheRoot);
  const apis = typescriptApis(tree, [...typescriptPackageDirs].sort(), SCRIPT_REPO_ROOT);

  const snapshots = new Map();
  for (const [key, entry] of contracts) {
    snapshots.set(key, entry.typescriptApi === undefined ? snapshotContract(tree, key, entry, itemsByFile, hashes) : packageSnapshot(entry, apis));
  }
  return snapshots;
}

/** A published package's contract: its TypeScript API is its only surface. */
function packageSnapshot(entry, apis) {
  return {
    entry,
    superseded: false,
    files: new Map(),
    schema: null,
    examples: new Map(),
    diagnostics: null,
    rustApi: null,
    typescriptApi: apis.get(entry.typescriptApi.package),
  };
}

function snapshotContract(tree, key, entry, itemsByFile, hashes) {
  const files = new Map([entry.schema, ...entry.examples.map((example) => example.path)].map((path) => [path, rawDigest(tree, path)]));
  if (entry.status === 'superseded') {
    return { entry, superseded: true, files };
  }
  const schema = readJson(tree, entry.schema, `schema of ${key}`);
  const examples = new Map();
  for (const example of entry.examples) {
    const bytes = tree.bytes(example.path);
    const hash = example.encoder.kind === 'sha256-bytes' ? `sha256:${sha256Hex(bytes)}` : hashes.get(hashKey(example.encoder.function, example.path));
    let document = null;
    let parseError = null;
    try {
      document = parseJson(bytes.toString('utf8'));
    } catch (error) {
      if (!(error instanceof ContractGateJsonError)) {
        throw error;
      }
      parseError = error.message;
    }
    examples.set(example.path, { hash, document, parseError });
  }
  return {
    entry,
    superseded: false,
    files,
    schema: { document: schema, digest: sha256Hex(canonicalJson(schema)) },
    examples,
    diagnostics: entry.diagnostics === undefined ? null : diagnosticsOf(tree, entry.diagnostics, itemsByFile),
    rustApi: entry.rustApi === undefined ? null : selectRustItems(itemsByFile, entry.rustApi),
    typescriptApi: null,
  };
}

function diagnosticsOf(tree, diagnostics, itemsByFile) {
  const catalogText = tree.text(diagnostics.catalog);
  if (catalogText === null) {
    throw snapshotError(`${tree.description}: diagnostic catalog ${diagnostics.catalog} does not exist`, [diagnostics.catalog]);
  }
  const catalog = parseCatalog(catalogText, diagnostics.prefix);
  const source = new Set(
    diagnostics.sources.flatMap((file) =>
      itemsByFile
        .get(file)
        .filter((item) => item.key.startsWith('const ') && typeof item.stringValue === 'string' && item.stringValue.startsWith(diagnostics.prefix))
        .map((item) => item.stringValue),
    ),
  );
  return { catalog, source };
}

/** Change records in a tree: path → { bytes digest, text }. */
export function readRecords(tree) {
  const records = new Map();
  for (const name of tree.list(CHANGES_DIR, '.json')) {
    const path = `${CHANGES_DIR}/${name}`;
    records.set(path, { digest: rawDigest(tree, path), text: tree.text(path) });
  }
  return records;
}

export function relativeTo(root, path) {
  return relative(root, path).split(sep).join('/');
}
