// The nondeterminism rules for Geordi's canonical paths: one table of rule IDs, the Rust
// patterns, the TypeScript selectors, the canonical scopes and the waiver syntax.
//
// Rule IDs, the Rust patterns and the allowlist format are Echo's (scripts/ban-nondeterminism.sh
// and .ban-nondeterminism-allowlist in the Echo repository), so an ID means the same ban in both
// repositories. The TypeScript selectors give each Echo rule its closest meaning in a JavaScript
// host. `host-locale` is Geordi's own and is not an Echo rule. The reference is
// docs/nondeterminism-rules.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** Canonical Rust crates: every `.rs` file below these directories, tests included. */
export const CANONICAL_RUST_PATHS = ['crates/geordi-ir', 'crates/geordi-renderer'];

const CANONICAL_TS_PACKAGES = ['core', 'compiler-core', 'schema-graphql', 'wesley-generator', 'profunctor-page'];
/** The bijou-gpu modules that pack cells, hash, validate receipts and run the CPU reference oracle. */
const CANONICAL_BIJOU_GPU_MODULES = ['atlas', 'numeric', 'packed-cells', 'prepare', 'procedural', 'procedural-table', 'receipt', 'reference'];

/**
 * Canonical TypeScript: ESLint `files` globs. Test files are in scope, because a golden value
 * that depends on the clock or the environment is not a golden value.
 */
export const CANONICAL_TS_FILES = [
  ...CANONICAL_TS_PACKAGES.map((name) => `packages/${name}/src/**/*.ts`),
  `packages/bijou-gpu/src/{${CANONICAL_BIJOU_GPU_MODULES.join(',')}}{,.test}.ts`,
];

/** The test files within the canonical TypeScript scope. */
export const CANONICAL_TS_TEST_FILES = [
  ...CANONICAL_TS_PACKAGES.map((name) => `packages/${name}/src/**/*.test.ts`),
  `packages/bijou-gpu/src/{${CANONICAL_BIJOU_GPU_MODULES.join(',')}}.test.ts`,
];

/** Rust rules. Echo's patterns, translated from ripgrep to JavaScript; one entry per Echo row. */
export const RUST_PATTERNS = [
  ['time-system', String.raw`\bstd::time::SystemTime\b`],
  ['time-system', String.raw`\bSystemTime::now\b`],
  ['time-instant', String.raw`\bstd::time::Instant\b`],
  ['time-instant', String.raw`\bInstant::now\b`],
  ['thread-sleep', String.raw`\bstd::thread::sleep\b`],
  ['thread-sleep', String.raw`\b(tokio|async_std)::time::sleep\b`],
  ['host-parallelism', String.raw`\bstd::thread::available_parallelism\b`],
  ['host-parallelism', String.raw`\bavailable_parallelism\s*\(`],
  ['random', String.raw`\brand::\b`],
  ['random', String.raw`\bgetrandom::\b`],
  ['random', String.raw`\bfastrand::\b`],
  ['host-callback', String.raw`\bjs_sys::Function\b`],
  ['host-callback', String.raw`\bwasm_bindgen::closure::Closure\b`],
  ['host-callback', String.raw`\bClosure<`],
  ['network', String.raw`\bstd::net::\b`],
  ['network', String.raw`\breqwest::\b`],
  ['network', String.raw`\bureq::\b`],
  ['unordered-container', String.raw`\bstd::collections::HashMap\b`],
  ['unordered-container', String.raw`\bstd::collections::HashSet\b`],
  ['unordered-container', String.raw`\bhashbrown::HashMap\b`],
  ['unordered-container', String.raw`\bhashbrown::HashSet\b`],
  ['unordered-container', String.raw`\brustc_hash::FxHashMap\b`],
  ['unordered-container', String.raw`\brustc_hash::FxHashSet\b`],
  ['unordered-container', String.raw`\buse\s+std::collections::\{[^;]*\bHash(Map|Set)\b`],
  ['unordered-container', String.raw`\buse\s+rustc_hash::\{?[^;]*\bFxHash(Map|Set)\b`],
  ['unordered-container', String.raw`\b(HashMap|HashSet|FxHashMap|FxHashSet)\s*<`],
  ['hand-hashed-table', String.raw`[Oo]pen[- ][Aa]ddressing`],
  ['json-serialization', String.raw`\bserde_json::\b`],
  ['wasm-serde', String.raw`\bserde_wasm_bindgen::\b`],
  ['float-sentinel', String.raw`\b(f32|f64)::NAN\b`],
  ['float-sentinel', String.raw`\b(f32|f64)::INFINITY\b`],
  ['float-sentinel', String.raw`\b(f32|f64)::NEG_INFINITY\b`],
  ['float-op', String.raw`\.sin\(`],
  ['float-op', String.raw`\.cos\(`],
  ['float-op', String.raw`\.tan\(`],
  ['float-op', String.raw`\.sqrt\(`],
  ['float-op', String.raw`\.pow[f]?\(`],
  [
    'std-env',
    String.raw`\bstd::env(::|\s*[;,{])|\buse\s+std::\{[^;]*\benv\b|\benv::(args|args_os|current_dir|current_exe|home_dir|join_paths|remove_var|set_current_dir|set_var|split_paths|temp_dir|var|var_os|vars|vars_os)\b`,
  ],
  [
    'std-fs',
    String.raw`\bstd::fs(::|\s*[;,{])|\buse\s+std::\{[^;]*\bfs\b|\bfs::(canonicalize|copy|create_dir|create_dir_all|hard_link|metadata|read|read_dir|read_link|read_to_string|remove_dir|remove_dir_all|remove_file|rename|set_permissions|soft_link|symlink_metadata|write)\b`,
  ],
  [
    'std-process',
    String.raw`\bstd::process(::|\s*[;,{])|\buse\s+std::\{[^;]*\bprocess\b|\bprocess::(abort|Command|exit|id)\b`,
  ],
].map(([rule, source]) => ({ rule, source, pattern: new RegExp(source, 'u') }));

const DATE_LOCAL_GETTERS = 'getDate|getDay|getFullYear|getHours|getMilliseconds|getMinutes|getMonth|getSeconds|getTimezoneOffset|getYear';

const NODE_FS_MODULES = String.raw`^(node:)?fs(\/promises)?$`;
const NODE_NET_MODULES = '^(node:)?(http|https|http2|net|dgram|dns|tls)$';

// An identifier that is a binding or reference, not an object key or a member name.
const NOT_A_KEY = ':not(Property > Identifier.key):not(MemberExpression > Identifier.property)';

/**
 * TypeScript rules as ESLint selectors. Each rule ID is Echo's; the selector is the closest
 * JavaScript form of what the Echo rule bans. A selector may name an ID more than once.
 */
export const TS_SELECTORS = [
  // time-system: the wall clock.
  ['time-system', "MemberExpression[object.name='Date'][property.name='now']", 'Date.now reads the wall clock.'],
  ['time-system', "NewExpression[callee.name='Date'][arguments.length=0]", 'new Date() reads the wall clock.'],
  ['time-system', "CallExpression[callee.name='Date']", 'Date() reads the wall clock.'],
  ['time-system', "MemberExpression[object.name='Temporal'][property.name='Now']", 'Temporal.Now reads the wall clock.'],
  // time-instant: monotonic and frame clocks.
  ['time-instant', "MemberExpression[object.name='performance'][property.name=/^(now|timeOrigin)$/]", 'performance.now reads a monotonic clock.'],
  ['time-instant', "MemberExpression[object.name='process'][property.name=/^(hrtime|uptime|cpuUsage)$/]", 'process.hrtime and process.uptime read a monotonic clock.'],
  ['time-instant', `Identifier[name=/^(requestAnimationFrame|cancelAnimationFrame)$/]${NOT_A_KEY}`, 'requestAnimationFrame is driven by the display clock.'],
  ['time-instant', "MemberExpression[property.name=/^(requestAnimationFrame|cancelAnimationFrame)$/]", 'requestAnimationFrame is driven by the display clock.'],
  // thread-sleep: timers and blocking waits.
  ['thread-sleep', `Identifier[name=/^(setTimeout|setInterval|setImmediate)$/]${NOT_A_KEY}`, 'Timers make behaviour depend on scheduling.'],
  ['thread-sleep', "MemberExpression[property.name=/^(setTimeout|setInterval|setImmediate)$/]", 'Timers make behaviour depend on scheduling.'],
  ['thread-sleep', "MemberExpression[object.name='Atomics'][property.name='wait']", 'Atomics.wait blocks on another thread.'],
  // host-parallelism.
  ['host-parallelism', "MemberExpression[property.name=/^(hardwareConcurrency|availableParallelism)$/]", 'The host core count must not reach a result.'],
  ['host-parallelism', "NewExpression[callee.name=/^(Worker|SharedWorker)$/]", 'Workers make results depend on scheduling.'],
  // random: unseeded randomness.
  ['random', "MemberExpression[object.name='Math'][property.name='random']", 'Math.random is unseeded.'],
  ['random', "CallExpression[callee.name=/^(getRandomValues|randomUUID|randomBytes|randomInt|randomFill|randomFillSync)$/]", 'Host entropy is unseeded.'],
  [
    'random',
    "MemberExpression[property.name=/^(getRandomValues|randomUUID|randomBytes|randomInt|randomFill|randomFillSync)$/]",
    'Host entropy is unseeded.',
  ],
  // network.
  ['network', "CallExpression[callee.name='fetch']", 'fetch reaches the network.'],
  ['network', "NewExpression[callee.name=/^(XMLHttpRequest|WebSocket|EventSource)$/]", 'The network is outside the canonical result.'],
  ['network', `ImportDeclaration[source.value=/${NODE_NET_MODULES}/]`, 'The network is outside the canonical result.'],
  // unordered-container: key order of a plain object reaching output. Sorting the keys at once
  // (`Object.keys(x).sort(...)`) is the accepted form.
  [
    'unordered-container',
    "CallExpression[callee.object.name='Object'][callee.property.name=/^(keys|entries|values)$/]:not(MemberExpression[property.name=/^(sort|toSorted)$/] > CallExpression.object)",
    'Plain-object key order follows construction order. Sort the keys at once (Object.keys(x).sort(...)) or iterate an array or Map.',
  ],
  ['unordered-container', 'ForInStatement', 'for...in follows plain-object construction order. Iterate sorted keys, an array or a Map.'],
  // float-sentinel.
  ['float-sentinel', `Identifier[name=/^(NaN|Infinity)$/]${NOT_A_KEY}`, 'NaN and Infinity are float sentinels.'],
  ['float-sentinel', "MemberExpression[object.name='Number'][property.name=/^(NaN|POSITIVE_INFINITY|NEGATIVE_INFINITY)$/]", 'NaN and the infinities are float sentinels.'],
  // float-op: transcendental and rounding-implementation-defined arithmetic.
  [
    'float-op',
    "MemberExpression[object.name='Math'][property.name=/^(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|sqrt|cbrt|hypot)$/]",
    'Math functions are implementation-defined; use an exact integer algorithm.',
  ],
  // A literal base to a literal integer exponent (`2 ** 32`) is an exact constant.
  [
    'float-op',
    "BinaryExpression[operator='**']:not([left.type='Literal'][right.raw=/^[0-9_]+$/])",
    '** is Math.pow for numbers; use an exact integer algorithm, or a literal base and a literal integer exponent for a constant.',
  ],
  // std-env: ambient host state.
  [
    'std-env',
    "MemberExpression[object.name='process'][property.name=/^(env|argv|argv0|cwd|platform|arch|version|versions|execPath|execArgv|umask)$/]",
    'The process environment is host state.',
  ],
  ['std-env', "MemberExpression[object.type='MetaProperty'][property.name='env']", 'import.meta.env is host state.'],
  ['std-env', "ImportDeclaration[source.value=/^(node:)?os$/]", 'node:os reports host state.'],
  // std-fs.
  ['std-fs', `ImportDeclaration[source.value=/${NODE_FS_MODULES}/]`, 'The filesystem is host state; read input at a boundary.'],
  ['std-fs', `CallExpression[callee.name='require'][arguments.0.value=/${NODE_FS_MODULES}/]`, 'The filesystem is host state; read input at a boundary.'],
  // std-process.
  [
    'std-process',
    "MemberExpression[object.name='process'][property.name=/^(exit|exitCode|pid|ppid|kill|abort|stdin|stdout|stderr|on|once|nextTick)$/]",
    'Process control and streams are host state.',
  ],
  ['std-process', "ImportDeclaration[source.value=/^(node:)?(child_process|cluster|worker_threads)$/]", 'Spawning processes is host state.'],
  // host-locale (Geordi's own): locale and time zone dependent text.
  ['host-locale', "MemberExpression[property.name=/^(toLocaleString|toLocaleDateString|toLocaleTimeString|toLocaleUpperCase|toLocaleLowerCase|localeCompare)$/]", 'Locale-dependent text differs by host.'],
  ['host-locale', "MemberExpression[object.name='Intl']", 'Intl output differs by host and ICU version.'],
  ['host-locale', `MemberExpression[property.name=/^(${DATE_LOCAL_GETTERS})$/]`, 'Local-time getters depend on the host time zone; use the UTC getters.'],
].map(([rule, selector, message]) => ({ rule, selector, message }));

/** Every rule ID, in a stable order, with where it applies. */
export const RULE_IDS = [
  ...new Set([...RUST_PATTERNS.map((entry) => entry.rule), ...TS_SELECTORS.map((entry) => entry.rule)]),
];

/** Rule IDs that are Geordi's own rather than Echo's. */
export const GEORDI_OWN_RULE_IDS = ['host-locale'];

const WAIVER_REASON = String.raw`\s+(\S.*)$`;

function waiverPattern(kind, rule) {
  return new RegExp(`ban-nondeterminism: ${kind}\\(${rule}\\)${WAIVER_REASON}`, 'u');
}

/**
 * The 1-based line numbers of `text` on which `rule` is waived by an inline comment:
 *   ban-nondeterminism: allow(<rule>) <reason>        its own line and the next line
 *   ban-nondeterminism: allow-begin(<rule>) <reason>  every line up to allow-end(<rule>)
 * A waiver with no reason waives nothing.
 */
export function inlineWaivedLines(text, rule) {
  const allow = waiverPattern('allow', rule);
  const begin = waiverPattern('allow-begin', rule);
  const end = new RegExp(`ban-nondeterminism: allow-end\\(${rule}\\)`, 'u');
  const waived = new Set();
  let open = false;
  text.split('\n').forEach((lineText, index) => {
    const number = index + 1;
    if (begin.test(lineText)) {
      open = true;
    }
    if (open) {
      waived.add(number);
    }
    if (end.test(lineText)) {
      open = false;
    }
    if (allow.test(lineText)) {
      waived.add(number);
      waived.add(number + 1);
    }
  });
  return waived;
}

/** Parse `<rule> <path-glob> <reason>` rows. A row with no reason refuses the whole file. */
export function parseAllowlist(text, label = 'allowlist') {
  const waivers = [];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || /^\s*#/u.test(raw)) {
      continue;
    }
    const match = /^(\S+)\s+(\S+)\s+(\S.*)$/u.exec(raw.trim());
    if (match === null) {
      throw new MalformedWaiverError(label, raw);
    }
    waivers.push({ rule: match[1], glob: match[2], reason: match[3] });
  }
  return waivers;
}

export class MalformedWaiverError extends Error {
  constructor(label, row) {
    super(`malformed waiver in ${label} (need: <rule> <path> <reason>): ${row}`);
    this.name = 'MalformedWaiverError';
    this.row = row;
  }
}

/** A bash-style glob: `*` and `?` match any character, including `/`. */
export function globToRegExp(glob) {
  const body = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.');
  return new RegExp(`^${body}$`, 'u');
}

function walkRust(directory, files) {
  for (const entry of readdirSync(directory).sort()) {
    if (entry === 'target' || entry === 'node_modules' || entry.startsWith('.')) {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walkRust(path, files);
    } else if (entry.endsWith('.rs')) {
      files.push(path);
    }
  }
}

/** Scan one file's text; appends to `findings` and counts the waived hits into `waived`. */
function scanText({ repoPath, text, compiled, findings, waived }) {
  const inline = new Map();
  text.split('\n').forEach((lineText, index) => {
    // One verdict per rule per line: several patterns of a rule can match the same line.
    const rules = new Set(RUST_PATTERNS.filter(({ pattern }) => pattern.test(lineText)).map(({ rule }) => rule));
    for (const rule of rules) {
      let covered = compiled.some((waiver) => waiver.rule === rule && waiver.regexp.test(repoPath));
      if (!covered) {
        if (!inline.has(rule)) {
          inline.set(rule, inlineWaivedLines(text, rule));
        }
        covered = inline.get(rule).has(index + 1);
      }
      if (covered) {
        waived[rule] = (waived[rule] ?? 0) + 1;
      } else {
        findings.push({ rule, file: repoPath, line: index + 1, text: lineText.trim() });
      }
    }
  });
}

/**
 * Scan Rust files below `paths` (relative to `root`). Returns the findings that no allowlist row
 * and no inline comment waives, and the number that were waived, by rule.
 */
export function scanRust({ root, paths, waivers }) {
  const compiled = waivers.map((waiver) => ({ ...waiver, regexp: globToRegExp(waiver.glob) }));
  const findings = [];
  const waived = {};
  for (const path of paths) {
    const base = resolve(root, path);
    if (!existsSync(base)) {
      continue;
    }
    const files = [];
    if (statSync(base).isDirectory()) {
      walkRust(base, files);
    } else {
      files.push(base);
    }
    for (const file of files) {
      const repoPath = relative(root, file).split(sep).join('/');
      scanText({ repoPath, text: readFileSync(file, 'utf8'), compiled, findings, waived });
    }
  }
  return { findings, waived };
}
