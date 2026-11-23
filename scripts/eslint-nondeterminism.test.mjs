import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { ESLint } from 'eslint';

import { GEORDI_OWN_RULE_IDS, RULE_IDS, RUST_PATTERNS, TS_SELECTORS } from './lib/nondeterminism.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CANONICAL = resolve(REPO_ROOT, 'packages/core/src/index.ts');
const CANONICAL_TEST = resolve(REPO_ROOT, 'packages/core/src/ports/json.test.ts');
const BIJOU_CANONICAL = resolve(REPO_ROOT, 'packages/bijou-gpu/src/receipt.ts');
const NOT_CANONICAL = resolve(REPO_ROOT, 'packages/runtime-webgl/src/index.ts');
const BIJOU_NOT_CANONICAL = resolve(REPO_ROOT, 'packages/bijou-gpu/src/webgpu-presenter.ts');

// These cases lint in-memory snippets under the path of a real TypeScript file. When `CI` is set,
// typescript-eslint infers "single-run" mode and builds its first program for a path from the file
// on disk, not from the text it is given, so the first snippet for that path is never linted. Turn
// the inference off so the snippet is what gets linted, here and in CI alike.
process.env.TSESTREE_SINGLE_RUN = 'false';

const eslint = new ESLint({ cwd: REPO_ROOT });

/** The rule IDs reported for `code` linted as `filePath`. */
async function reportedRules(code, filePath = CANONICAL) {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.filter((message) => message.fatal);
  assert.deepEqual(
    fatal.map((message) => message.message),
    [],
    `the snippet must parse: ${code}`,
  );
  return result.messages
    .filter((message) => message.ruleId === 'nondeterminism/ban')
    .map((message) => /^\[([\w-]+)\]/u.exec(message.message)?.[1]);
}

const MUST_REPORT = {
  'time-system': ['const t = Date.now();', 'const d = new Date();', 'const d = Date();', 'const t = Temporal.Now.instant();'],
  'time-instant': ['const t = performance.now();', 'const t = process.hrtime();', 'requestAnimationFrame(f);'],
  'thread-sleep': ['setTimeout(f, 1);', 'setInterval(f, 1);', 'Atomics.wait(a, 0, 0);'],
  'host-parallelism': ['const n = navigator.hardwareConcurrency;', 'const n = os.availableParallelism();', 'const w = new Worker(u);'],
  random: ['const x = Math.random();', 'const b = crypto.getRandomValues(a);', 'const u = crypto.randomUUID();', 'const b = randomBytes(8);'],
  network: ['const r = fetch(u);', 'const s = new WebSocket(u);', "import http from 'node:http';"],
  'unordered-container': [
    'const k = Object.keys(o);',
    'const e = Object.entries(o);',
    'const v = Object.values(o);',
    'for (const k in o) { void k; }',
  ],
  'float-sentinel': ['const x = NaN;', 'const x = Infinity;', 'const x = Number.NaN;', 'const x = Number.POSITIVE_INFINITY;', 'const x = Number.NEGATIVE_INFINITY;'],
  'float-op': ['const y = Math.sin(x);', 'const y = Math.cos(x);', 'const y = Math.sqrt(x);', 'const y = Math.pow(x, 2);', 'const y = x ** 2;', 'const y = 2 ** n;', 'const y = 2 ** 0.5;'],
  'std-env': ['const v = process.env.X;', 'const a = process.argv;', 'const c = process.cwd();', "import { tmpdir } from 'node:os';"],
  'std-fs': ["import { readFileSync } from 'node:fs';", "import { readFile } from 'fs/promises';", "import fs from 'fs';", "const fs = require('node:fs');"],
  'std-process': ['process.exit(1);', 'const p = process.pid;', "import { spawn } from 'node:child_process';"],
  'host-locale': ["const s = n.toLocaleString();", "const c = a.localeCompare(b);", "const f = new Intl.NumberFormat('en');", 'const h = d.getHours();', 'const z = d.getTimezoneOffset();'],
};

const MUST_NOT_REPORT = {
  'time-system': ['const d = new Date(0);', 'const d = new Date(ms);', 'const t = d.getTime();', 'const t = d.getUTCHours();'],
  'time-instant': ['const performanceBudget = 1;', 'const t = timer.now();'],
  'thread-sleep': ['const setTimeoutName = "setTimeout";', 'const o = { setTimeout: 1 };'],
  'host-parallelism': ['const n = pool.size;'],
  random: ['const r = rng.random();', 'const x = Math.max(a, b);'],
  network: ["import { a } from './fetch.js';", 'const f = fetcher(u);'],
  'unordered-container': [
    'const k = Object.keys(o).sort();',
    'const k = Object.keys(o).sort((a, b) => (a < b ? -1 : 1));',
    'const e = Object.entries(o).toSorted();',
    'for (const k of [1, 2]) { void k; }',
    'const m = new Map(); for (const [k] of m) { void k; }',
    'const k = Object.freeze({});',
  ],
  'float-sentinel': ['const x = Number.isFinite(y);', 'const o = { NaN: 1 };', 'const x = o.Infinity;', 'const x = Number.MAX_SAFE_INTEGER;'],
  'float-op': ['const y = Math.max(a, b);', 'const y = Math.floor(a / b);', 'const y = 2 ** 32;', 'const y = 10 ** 6;', 'const y = BigInt(a) * BigInt(b);'],
  'std-env': ['const v = env.X;', "import { x } from './os.js';"],
  'std-fs': ["import { x } from './fs.js';", "import path from 'node:path';", "import { createHash } from 'node:crypto';"],
  'std-process': ['const p = processor.pid;', "import { x } from './child_process.js';"],
  'host-locale': ['const s = String(n);', 'const c = a < b ? -1 : 1;', 'const h = d.getUTCHours();', 'const i = new Intl_();'],
};

test('every TypeScript rule ID is one of Echo\'s, or declared Geordi\'s own, and has report and no-report cases', () => {
  const echo = new Set(RUST_PATTERNS.map((entry) => entry.rule));
  for (const rule of RULE_IDS) {
    assert.ok(echo.has(rule) || GEORDI_OWN_RULE_IDS.includes(rule), `${rule} is neither Echo's nor declared Geordi's own`);
  }
  const tsRules = new Set(TS_SELECTORS.map((entry) => entry.rule));
  for (const rule of tsRules) {
    assert.ok((MUST_REPORT[rule] ?? []).length > 0, `a report case for ${rule}`);
    assert.ok((MUST_NOT_REPORT[rule] ?? []).length > 0, `a no-report case for ${rule}`);
  }
  assert.deepEqual([...tsRules].sort(), Object.keys(MUST_REPORT).sort());
});

for (const [rule, snippets] of Object.entries(MUST_REPORT)) {
  for (const snippet of snippets) {
    test(`reports [${rule}]: ${snippet}`, async () => {
      const reported = await reportedRules(snippet);
      assert.ok(reported.includes(rule), `expected ${rule}; got ${reported.join(',') || 'nothing'}`);
    });
  }
}

for (const [rule, snippets] of Object.entries(MUST_NOT_REPORT)) {
  for (const snippet of snippets) {
    test(`does not report [${rule}]: ${snippet}`, async () => {
      const reported = await reportedRules(snippet);
      assert.ok(!reported.includes(rule), `${rule} reported for: ${snippet}`);
    });
  }
}

test('a rule reports once per node, with its ID first in the message', async () => {
  const [result] = await eslint.lintText('const x = Math.random();', { filePath: CANONICAL });
  const messages = result.messages.filter((message) => message.ruleId === 'nondeterminism/ban');
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /^\[random\] Math\.random is unseeded\./u);
});

test('an inline waiver with a reason waives its rule on its line and the next', async () => {
  assert.deepEqual(await reportedRules('const t = Date.now(); // ban-nondeterminism: allow(time-system) test clock'), []);
  assert.deepEqual(await reportedRules('// ban-nondeterminism: allow(time-system) test clock\nconst t = Date.now();'), []);
});

test('an inline waiver names one rule, needs a reason and does not reach two lines down', async () => {
  assert.deepEqual(await reportedRules('// ban-nondeterminism: allow(random) wrong rule\nconst t = Date.now();'), ['time-system']);
  assert.deepEqual(await reportedRules('const t = Date.now(); // ban-nondeterminism: allow(time-system)'), ['time-system']);
  assert.deepEqual(await reportedRules('// ban-nondeterminism: allow(time-system) too far\n\nconst t = Date.now();'), ['time-system']);
});

test('an allow-begin region waives its rule until allow-end', async () => {
  const code = [
    '// ban-nondeterminism: allow-begin(unordered-container) a region',
    'const a = Object.keys(o);',
    'const b = Object.keys(o);',
    '// ban-nondeterminism: allow-end(unordered-container)',
    'const c = Object.keys(o);',
  ].join('\n');
  const [result] = await eslint.lintText(code, { filePath: CANONICAL });
  assert.deepEqual(
    result.messages.filter((message) => message.ruleId === 'nondeterminism/ban').map((message) => message.line),
    [5],
  );
});

test('a canonical bijou-gpu module is in scope and a presenter is not', async () => {
  assert.ok((await reportedRules('const t = Date.now();', BIJOU_CANONICAL)).includes('time-system'));
  assert.deepEqual(await reportedRules('const t = Date.now();', BIJOU_NOT_CANONICAL), []);
});

test('a display runtime is not in scope', async () => {
  assert.deepEqual(await reportedRules('const t = Date.now(); const r = Math.random();', NOT_CANONICAL), []);
});

test('a canonical test file may build NaN and the infinities, and nothing else is exempt there', async () => {
  assert.deepEqual(await reportedRules('const x = Number.NaN; const y = Infinity;', CANONICAL_TEST), []);
  assert.deepEqual(await reportedRules('const t = Date.now();', CANONICAL_TEST), ['time-system']);
});
