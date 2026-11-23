/* eslint-disable no-restricted-syntax -- This command writes its own JSON Lines (one object per
   line, keys in a fixed order) and reads its own schemas; it runs before and without the core
   package, so the JsonPort boundary is not available to it. */
// Bans nondeterminism in Geordi's canonical Rust crates, with Echo's rule IDs and Echo's allowlist
// format. The TypeScript half of the same rules is an ESLint rule (eslint.config.mjs). The rules,
// scopes and how to waive one are in docs/nondeterminism-rules.md.
//
//   node scripts/ban-nondeterminism.mjs
//   node scripts/ban-nondeterminism.mjs --paths crates/geordi-ir --allowlist .ban-nondeterminism-allowlist
//   node scripts/ban-nondeterminism.mjs --schema
//   node scripts/ban-nondeterminism.mjs --help
//
// Environment, as in Echo: DETERMINISM_PATHS (space separated) and DETERMINISM_ALLOWLIST.
// Every line on stdout and stderr is one JSON object carrying `_schema`; the schemas are in
// schemas/geordi-ban-nondeterminism/. --human writes prose. Exit 0 when clean, 1 on findings,
// 2 on a usage error or a malformed allowlist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CANONICAL_RUST_PATHS,
  MalformedWaiverError,
  parseAllowlist,
  scanRust,
} from './lib/nondeterminism.mjs';

const SCHEMA_VERSION = '1.0.0';
const SCHEMA_PREFIX = 'geordi.ban_nondeterminism.';
const SCRIPT_ROOT = resolve(import.meta.dirname, '..');
const SCHEMA_DIR = join(SCRIPT_ROOT, 'schemas', 'geordi-ban-nondeterminism');
const DEFAULT_ALLOWLIST = '.ban-nondeterminism-allowlist';

const ERROR_CODES = [
  'GEORDI_E_BAN_NONDETERMINISM_USAGE',
  'GEORDI_E_BAN_NONDETERMINISM_MALFORMED_WAIVER',
  'GEORDI_E_BAN_NONDETERMINISM_INTERNAL',
];

class UsageError extends Error {}

let human = false;

function schemaRef(name) {
  return { id: `${SCHEMA_PREFIX}${name}`, version: SCHEMA_VERSION };
}

function write(stream, record, prose) {
  const target = stream === 'stderr' ? process.stderr : process.stdout;
  target.write(human ? `${prose}\n` : `${JSON.stringify(record)}\n`);
}

function loadSchemas() {
  return readdirSync(SCHEMA_DIR)
    .filter((file) => file.endsWith('.schema.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')));
}

function parseArguments(argv) {
  const options = {
    allowlist: process.env.DETERMINISM_ALLOWLIST || DEFAULT_ALLOWLIST,
    help: false,
    paths: (process.env.DETERMINISM_PATHS ?? '').split(/\s+/u).filter((path) => path !== ''),
    root: SCRIPT_ROOT,
    schema: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      index += 1;
      if (argv[index] === undefined) {
        throw new UsageError(`${argument} needs a value`);
      }
      return argv[index];
    };
    if (argument === '--human' || argument === '--humanize') {
      human = true;
    } else if (argument === '--help') {
      options.help = true;
    } else if (argument === '--schema') {
      options.schema = true;
    } else if (argument === '--paths') {
      options.paths = value().split(',').filter((path) => path !== '');
    } else if (argument === '--allowlist') {
      options.allowlist = value();
    } else if (argument === '--root') {
      options.root = resolve(value());
    } else {
      throw new UsageError(`unknown argument ${argument}`);
    }
  }
  if (options.paths.length === 0) {
    options.paths = CANONICAL_RUST_PATHS;
  }
  return options;
}

function emitSchemas(stream) {
  for (const schema of loadSchemas()) {
    write(
      stream,
      {
        _schema: schemaRef('schema'),
        kind: 'schema',
        describes: { id: schema['x-schema-id'], version: schema['x-schema-version'] },
        stream: schema['x-stream'],
        schema,
      },
      `schema ${schema['x-schema-id']}`,
    );
  }
}

function emitHelp() {
  write(
    'stdout',
    {
      _schema: schemaRef('help'),
      kind: 'help',
      command: 'ban-nondeterminism',
      summary:
        "Scan Geordi's canonical Rust crates for nondeterministic APIs under Echo's rule IDs. One finding line per hit, then one result line. Exit 0 clean, 1 findings, 2 usage or malformed allowlist.",
      options: ['--paths <a,b>', '--allowlist <file>', '--root <dir>', '--schema', '--human', '--help'],
      errors: ERROR_CODES,
    },
    'ban-nondeterminism: scan the canonical Rust crates for nondeterministic APIs',
  );
  emitSchemas('stdout');
}

function run(options) {
  const allowlistPath = resolve(options.root, options.allowlist);
  const waivers = existsSync(allowlistPath)
    ? parseAllowlist(readFileSync(allowlistPath, 'utf8'), options.allowlist)
    : [];
  const { findings, waived } = scanRust({ root: options.root, paths: options.paths, waivers });
  for (const finding of findings) {
    write(
      'stdout',
      { _schema: schemaRef('finding'), kind: 'finding', ...finding },
      `${finding.file}:${String(finding.line)} [${finding.rule}] ${finding.text}`,
    );
  }
  const passed = findings.length === 0;
  write(
    'stdout',
    {
      _schema: schemaRef('result'),
      kind: 'result',
      status: passed ? 'passed' : 'failed',
      paths: options.paths,
      findings: findings.length,
      waived: Object.keys(waived)
        .sort()
        .map((rule) => ({ rule, count: waived[rule] })),
    },
    passed
      ? 'ban-nondeterminism: PASSED.'
      : `ban-nondeterminism: FAILED (${String(findings.length)} finding(s)). Fix the code or justify a waiver (docs/nondeterminism-rules.md).`,
  );
  return passed ? 0 : 1;
}

function fail(code, message) {
  write('stderr', { _schema: schemaRef('error'), kind: 'error', code, message }, `${code}: ${message}`);
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      emitHelp();
      return 0;
    }
    if (options.schema) {
      emitSchemas('stdout');
      return 0;
    }
    return run(options);
  } catch (error) {
    if (error instanceof UsageError) {
      fail('GEORDI_E_BAN_NONDETERMINISM_USAGE', error.message);
      return 2;
    }
    if (error instanceof MalformedWaiverError) {
      fail('GEORDI_E_BAN_NONDETERMINISM_MALFORMED_WAIVER', error.message);
      return 2;
    }
    fail('GEORDI_E_BAN_NONDETERMINISM_INTERNAL', error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = main();
