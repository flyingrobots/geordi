import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { ESLint } from 'eslint';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MESSAGE_PATTERN = /Set or Map inside a loop/;
const TARGETS = [
  { label: 'mjs', filePath: resolve(REPO_ROOT, 'scripts/__loop-allocation-fixture.mjs') },
  { label: 'ts', filePath: resolve(REPO_ROOT, 'packages/core/src/index.ts') },
];

const eslint = new ESLint({ cwd: REPO_ROOT });

async function loopAllocationFindings(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.filter((message) => message.fatal);
  assert.deepEqual(
    fatal.map((message) => message.message),
    [],
    `the fixture must parse: ${code}`,
  );
  const findings = result.messages.filter(
    (message) => message.ruleId === 'no-restricted-syntax' && MESSAGE_PATTERN.test(message.message),
  );
  findings.all = result.messages.map((message) => `${String(message.ruleId)}: ${message.message}`);
  return findings;
}

const MUST_REPORT = {
  'new Set in a for body': 'for (let i = 0; i < 3; i += 1) { const s = new Set(); s.add(i); }',
  'new Map in a for body': 'for (let i = 0; i < 3; i += 1) { const m = new Map(); m.set(i, i); }',
  'new Set in a for...of body': 'for (const x of [1]) { const s = new Set([x]); s.add(x); }',
  'new Map in a for...in body': 'for (const k in {}) { const m = new Map(); m.set(k, 1); }',
  'new Set in a while body': 'let i = 0; while (i < 3) { const s = new Set(); s.add(i); i += 1; }',
  'new Map in a do...while body': 'let i = 0; do { const m = new Map(); m.set(i, i); i += 1; } while (i < 3);',
  'new Set in a nested loop body':
    'for (const a of [1]) { for (const b of [2]) { const s = new Set([a, b]); s.add(a); } }',
  'new Set in a callback inside a loop body':
    'for (const a of [1]) { [a].map((x) => new Set([x])); }',
  'new Map in a while condition': 'let i = 0; while (new Map().size < 1) { i += 1; }',
  'new Set in a do...while condition': 'let i = 0; do { i += 1; } while (new Set([i]).size < 0);',
  'new Set in a for condition': 'for (let i = 0; new Set([i]).size < 1; i += 1) { i += 0; }',
  'new Set as a bare statement in a loop body': 'for (const a of [1]) new Set([a]);',
};

const MUST_NOT_REPORT = {
  'allocation before the loop':
    'const s = new Set(); for (const x of [1]) { s.add(x); } const m = new Map(); while (m.size > 0) { m.clear(); }',
  'allocation outside any loop': 'const s = new Set([1]); const m = new Map([[1, 2]]); s.add(m.size);',
  'allocation as the for...of iterable': 'for (const x of new Set([1, 2])) { void x; }',
  'allocation in a for initialiser': 'for (let s = new Set([1]); s.size < 3; s.add(s.size)) { void s; }',
  'allocation in a for...in subject': 'for (const k in new Map()) { void k; }',
  'allocation in a callback outside a loop': '[1].map((x) => new Set([x]));',
  'other constructors inside a loop': 'for (const x of [1]) { const d = new Date(x); const w = new WeakMap(); void d; void w; }',
  'a user class named Settings in a loop': 'class Settings {} for (const x of [1]) { void new Settings(); void x; }',
};

for (const { label, filePath } of TARGETS) {
  for (const [name, code] of Object.entries(MUST_REPORT)) {
    test(`reports (${label}): ${name}`, async () => {
      const findings = await loopAllocationFindings(code, filePath);
      assert.ok(
        findings.length >= 1,
        `expected a finding for: ${code}; got ${JSON.stringify(findings.all)}`,
      );
    });
  }
  for (const [name, code] of Object.entries(MUST_NOT_REPORT)) {
    test(`does not report (${label}): ${name}`, async () => {
      const findings = await loopAllocationFindings(code, filePath);
      assert.deepEqual([...findings], [], `unexpected finding for: ${code}`);
    });
  }
}
