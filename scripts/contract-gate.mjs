// Contract gate (flyingrobots/geordi#217): compare the public contracts of a pull request
// with those of its base, so that a change to a contract cannot pass by editing a pin or a
// fixture in the same pull request.
//
//   node scripts/contract-gate.mjs                         # head: working tree; base: merge base with origin/main
//   node scripts/contract-gate.mjs --base-ref origin/main  # the same, explicitly
//   node scripts/contract-gate.mjs --base <rev> --head HEAD
//   node scripts/contract-gate.mjs --base-dir <dir> --head-dir <dir>
//   node scripts/contract-gate.mjs --schema | --help [--human]
//
// The registry is contracts/registry.json; change records are contracts/changes/*.json. Each
// surface is computed from source on both trees by the same code: see
// scripts/lib/contract-gate/. Every line on stdout and stderr is one JSON object carrying
// `_schema`; the schemas are in schemas/geordi-contract-gate/. --human writes prose.
// See docs/contract-gate.md.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { compare } from './lib/contract-gate/compare.mjs';
import { ContractGateError, ERROR_EXIT, ERROR_MEANINGS, VIOLATION_MEANINGS } from './lib/contract-gate/errors.mjs';
import { stringifyJson } from './lib/contract-gate/json.mjs';
import { CHANGES_DIR, expandContracts, FORMAT_SCHEMAS, loadRegistry, readRecords, REGISTRY_PATH, snapshotTree } from './lib/contract-gate/snapshot.mjs';
import { gitTopLevel, isGitWorkTree, materialiseRevision, mergeBase, resolveRevision, Tree } from './lib/contract-gate/trees.mjs';
import { loadSchemaDirectory } from './lib/json-schema-subset.mjs';

const COMMAND = 'contract-gate';
const SCHEMA_PREFIX = 'geordi.contract_gate.';
const SCRIPT_REPO_ROOT = resolve(import.meta.dirname, '..');
const CACHE_ROOT = resolve(SCRIPT_REPO_ROOT, 'target', 'contract-gate');
const SCHEMAS = loadSchemaDirectory(resolve(SCRIPT_REPO_ROOT, 'schemas', 'geordi-contract-gate'));

const SCHEMA_STREAMS = [
  ['comparison', 'stdout'],
  ['difference', 'stdout'],
  ['contract', 'stdout'],
  ['record', 'stdout'],
  ['coverage', 'stdout'],
  ['violation', 'stdout'],
  ['result', 'stdout'],
  ['error', 'stderr'],
  ['help', 'stdout'],
  ['schema', 'stdout'],
];

const OPTIONS = [
  { flag: '--base-ref <ref>', description: 'Compare with the merge base of HEAD and <ref>. Default: origin/main.' },
  { flag: '--base <rev>', description: 'Compare with exactly <rev>, not a merge base.' },
  { flag: '--base-dir <dir>', description: 'Compare with the files in <dir> (tests and offline review).' },
  { flag: '--head <rev>', description: 'Take the head from commit <rev> instead of the working tree.' },
  { flag: '--head-dir <dir>', description: 'Take the head from the files in <dir>. Default: the working tree of --repo.' },
  { flag: '--repo <dir>', description: 'The git repository that refs name. Default: the repository that contains this script.' },
  { flag: '--schema', description: 'Print the JSON Schema of every message type and exit 0.' },
  { flag: '--help', description: 'Print this description, then the schemas of the output, violation and error lines.' },
  { flag: '--human, --humanize', description: 'Write prose instead of JSON Lines.' },
];

let human = false;

/** Each message type carries its own version: the `x-schema-version` of its schema file. */
function schemaRef(name) {
  const id = `${SCHEMA_PREFIX}${name}`;
  return { id, version: SCHEMAS.get(id)['x-schema-version'] };
}

function line(stream, kind, body) {
  const record = { _schema: schemaRef(kind), kind, ...body };
  (stream === 'stderr' ? process.stderr : process.stdout).write(`${stringifyJson(record)}\n`);
}

function prose(stream, text) {
  (stream === 'stderr' ? process.stderr : process.stdout).write(`${text}\n`);
}

function emitError(error) {
  const code = error instanceof ContractGateError ? error.code : 'GEORDI_E_CONTRACT_GATE_INTERNAL';
  const message = (error instanceof Error ? error.message : String(error)) || code;
  const paths = error instanceof ContractGateError ? error.paths : [];
  if (human) {
    prose('stderr', `error ${code}: ${message}`);
  } else {
    line('stderr', 'error', { code, message, paths });
  }
  process.exitCode = ERROR_EXIT[code] ?? 1;
}

function emitSchemas() {
  for (const [name, stream] of SCHEMA_STREAMS) {
    const schema = SCHEMAS.get(`${SCHEMA_PREFIX}${name}`);
    if (human) {
      prose('stdout', `${SCHEMA_PREFIX}${name} ${schema['x-schema-version']} (${stream}): ${schema.description}`);
    } else {
      line('stdout', 'schema', { describes: schemaRef(name), stream, schema });
    }
  }
}

function emitHelp() {
  const help = {
    command: COMMAND,
    summary:
      'Compare the public contracts of the head with those of the base (by default the merge base with origin/main), surface by surface, each computed from source on both trees by the same code: the JSON Schema, the canonical hashes of example documents, the public diagnostic codes, the public Rust items, and the public TypeScript API of each published package (read by the TypeScript compiler from the sources of each tree, with workspace packages resolved within that tree). A difference needs a change record in contracts/changes/; a breaking change to a frozen contract needs a version raise. Fails closed.',
    usage: 'node scripts/contract-gate.mjs [--base-ref <ref> | --base <rev> | --base-dir <dir>] [--head <rev> | --head-dir <dir>] [--repo <dir>] [--human] | --schema | --help',
    options: OPTIONS,
    exitCodes: [
      { code: 0, meaning: 'Every contract passes.' },
      { code: 1, meaning: 'A violation was found, or the gate could not determine the base or compute a surface.' },
      { code: 2, meaning: 'Invalid command line.' },
    ],
    errorCodes: [
      ...Object.entries(VIOLATION_MEANINGS).map(([code, meaning]) => ({ code, stream: 'stdout', meaning })),
      ...Object.entries(ERROR_MEANINGS).map(([code, meaning]) => ({ code, stream: 'stderr', meaning })),
    ],
  };
  if (human) {
    prose('stdout', `${help.command}: ${help.summary}\n\nUsage: ${help.usage}\n`);
    for (const option of OPTIONS) {
      prose('stdout', `  ${option.flag}\n      ${option.description}`);
    }
    prose('stdout', '\nCodes:');
    for (const entry of help.errorCodes) {
      prose('stdout', `  ${entry.code} (${entry.stream}): ${entry.meaning}`);
    }
    return;
  }
  line('stdout', 'help', help);
  for (const [name, stream] of SCHEMA_STREAMS.filter(([name]) => name !== 'help' && name !== 'schema')) {
    line('stdout', 'schema', { describes: schemaRef(name), stream, schema: SCHEMAS.get(`${SCHEMA_PREFIX}${name}`) });
  }
}

function parseArgs(argv) {
  const options = { mode: 'compare', base: null, head: null, repo: SCRIPT_REPO_ROOT };
  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_USAGE', `${flag} needs a value`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--human' || arg === '--humanize') {
      continue;
    } else if (arg === '--schema' || arg === '--help' || arg === '-h') {
      options.mode = arg === '--schema' ? 'schema' : 'help';
    } else if (arg === '--base-ref' || arg === '--base' || arg === '--base-dir') {
      if (options.base !== null) {
        throw new ContractGateError('GEORDI_E_CONTRACT_GATE_USAGE', 'give at most one of --base-ref, --base and --base-dir');
      }
      options.base = { kind: arg.slice(2), value: takeValue(index, arg) };
      index += 1;
    } else if (arg === '--head' || arg === '--head-dir') {
      if (options.head !== null) {
        throw new ContractGateError('GEORDI_E_CONTRACT_GATE_USAGE', 'give at most one of --head and --head-dir');
      }
      options.head = { kind: arg.slice(2), value: takeValue(index, arg) };
      index += 1;
    } else if (arg === '--repo') {
      options.repo = resolve(takeValue(index, arg));
      index += 1;
    } else {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_USAGE', `unknown argument ${arg}`);
    }
  }
  options.base ??= { kind: 'base-ref', value: 'origin/main' };
  options.head ??= { kind: 'head-dir', value: options.repo };
  return options;
}

function repoRoot(dir) {
  if (!isGitWorkTree(dir)) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_BASE', `${dir} is not a git work tree, so a git base cannot be resolved; use --base-dir`);
  }
  return gitTopLevel(dir);
}

function resolveSide(option, repo, side, headRevision = 'HEAD') {
  if (option.kind === 'base-dir' || option.kind === 'head-dir') {
    const dir = resolve(option.value);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new ContractGateError(
        side === 'base' ? 'GEORDI_E_CONTRACT_GATE_BASE' : 'GEORDI_E_CONTRACT_GATE_USAGE',
        `--${option.kind} ${option.value} is not a directory`,
      );
    }
    return { tree: new Tree(dir, `${side} (${dir})`), description: { source: 'directory', ref: null, sha: null, dir } };
  }
  const root = repoRoot(repo);
  // The merge base is taken with the head being compared, not with whatever is checked out.
  const sha = option.kind === 'base-ref' ? mergeBase(root, option.value, headRevision) : resolveRevision(root, option.value);
  const dir = materialiseRevision(root, sha, CACHE_ROOT);
  return { tree: new Tree(dir, `${side} (${sha.slice(0, 12)})`), description: { source: 'git', ref: option.value, sha, dir: null } };
}

function coverageLines(headRegistry, headContracts, headSnapshots) {
  const lines = [];
  for (const [key, entry] of headContracts) {
    const snapshot = headSnapshots.get(key);
    const surfaces = [];
    if (!snapshot.superseded) {
      if (entry.schema !== null) {
        surfaces.push('schema');
      }
      if (entry.examples.length > 0) {
        surfaces.push('example');
      }
      if (entry.diagnostics !== undefined) {
        surfaces.push('diagnostic');
      }
      if (entry.rustApi !== undefined) {
        surfaces.push('rust-api');
      }
      if (entry.typescriptApi !== undefined) {
        surfaces.push('typescript-api');
      }
    }
    lines.push({ contract: key, gated: true, status: entry.status, surfaces, notCovered: entry.notCovered ?? [], evidence: entry.statusEvidence });
  }
  for (const entry of headRegistry.ungated) {
    lines.push({ contract: entry.contract, gated: false, status: entry.status, surfaces: [], notCovered: [entry.reason], evidence: entry.statusEvidence });
  }
  return lines;
}

function humanDifference(difference) {
  const values = difference.before !== null || difference.after !== null ? ` (${String(difference.before)} -> ${String(difference.after)})` : '';
  return `  ${difference.classification === 'unknown' ? 'unknown, treated as breaking' : difference.classification}: ${difference.surface} ${difference.item} ${difference.change}: ${difference.detail}${values}`;
}

function run(options) {
  const head = resolveSide(options.head, options.repo, 'head');
  const base = resolveSide(options.base, options.repo, 'base', head.description.sha ?? 'HEAD');

  const headRegistry = loadRegistry(head.tree, 'head');
  if (headRegistry === null) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `the head has no ${REGISTRY_PATH}; the registry cannot be removed`, [REGISTRY_PATH]);
  }
  const baseRegistry = loadRegistry(base.tree, 'base');
  const mode = baseRegistry === null ? 'bootstrap' : 'compare';
  if (human) {
    prose('stdout', `contract gate: ${mode} head ${head.description.sha ?? head.description.dir} with base ${base.description.sha ?? base.description.dir}${base.description.ref === null ? '' : ` (${options.base.kind} ${base.description.ref})`}`);
  } else {
    line('stdout', 'comparison', { mode, registry: REGISTRY_PATH, base: base.description, head: head.description });
  }

  const headContracts = expandContracts(head.tree, headRegistry, 'head');
  const baseContracts = baseRegistry === null ? null : expandContracts(base.tree, baseRegistry, 'base');
  const headSnapshots = snapshotTree(head.tree, headContracts, CACHE_ROOT);
  const baseSnapshots = baseContracts === null ? null : snapshotTree(base.tree, baseContracts, CACHE_ROOT);

  const outcome = compare({
    baseSnapshots,
    headSnapshots,
    baseRecords: readRecords(base.tree),
    headRecords: readRecords(head.tree),
    headTree: head.tree,
    headContracts,
    recordSchema: FORMAT_SCHEMAS.get('geordi.contract_registry.change_record'),
    registryPath: REGISTRY_PATH,
  });

  for (const contract of outcome.contracts) {
    const { lines, ...body } = contract;
    if (human) {
      prose('stdout', `${body.verdict === 'pass' ? 'pass' : 'FAIL'} ${body.contract}: ${body.state}, ${body.classification} (${String(body.baseStatus)} -> ${String(body.headStatus)})`);
      for (const difference of lines) {
        prose('stdout', humanDifference(difference));
      }
    } else {
      for (const difference of lines) {
        line('stdout', 'difference', difference);
      }
      line('stdout', 'contract', body);
    }
  }
  for (const record of outcome.records) {
    if (human) {
      prose('stdout', `record ${record.path}: ${record.state} (${String(record.contract)}, ${String(record.change)})`);
    } else {
      line('stdout', 'record', record);
    }
  }
  for (const coverage of coverageLines(headRegistry, headContracts, headSnapshots)) {
    if (human) {
      prose('stdout', `coverage ${coverage.contract}: ${coverage.gated ? `gated (${coverage.surfaces.join(', ')})` : 'not gated'}${coverage.notCovered.length > 0 ? `; not covered: ${coverage.notCovered.join('; ')}` : ''}`);
    } else {
      line('stdout', 'coverage', coverage);
    }
  }
  for (const violation of outcome.violations) {
    if (human) {
      prose('stdout', `violation ${violation.code}${violation.contract === null ? '' : ` ${violation.contract}`}: ${violation.message}`);
    } else {
      line('stdout', 'violation', violation);
    }
  }
  const ok = outcome.violations.length === 0;
  const result = { ok, mode, contracts: outcome.contracts.length, differences: outcome.differences.length, violations: outcome.violations.length };
  if (human) {
    prose('stdout', `${ok ? 'ok' : 'failed'}: ${String(result.contracts)} contracts, ${String(result.differences)} differences, ${String(result.violations)} violations`);
  } else {
    line('stdout', 'result', result);
  }
  if (!ok) {
    throw new ContractGateError(
      'GEORDI_E_CONTRACT_GATE_FAILED',
      `${String(outcome.violations.length)} contract violation(s); see the violation lines, and add change records under ${CHANGES_DIR}/ (docs/contract-gate.md)`,
    );
  }
}

try {
  human = process.argv.includes('--human') || process.argv.includes('--humanize');
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'help') {
    emitHelp();
  } else if (options.mode === 'schema') {
    emitSchemas();
  } else {
    run(options);
  }
} catch (error) {
  emitError(error);
}
