import assert from 'node:assert/strict';
import test from 'node:test';

import { findRestatedLiterals, isExempt, scanTrackedFiles } from './core-artifact-literals.mjs';

test('flags each restated core IR literal', () => {
  const text = [
    "const a = 'scene.geordi.json';",
    'const b = "scene.geordi.json.receipt";',
    'const c = `geordi-ir/1`;',
  ].join('\n');
  const violations = findRestatedLiterals('x.ts', text);
  assert.equal(violations.length, 3);
  assert.match(violations[0], /GEORDI_IR_ARTIFACT_KEY/u);
  assert.match(violations[1], /GEORDI_IR_RECEIPT_KEY/u);
  assert.match(violations[2], /GEORDI_IR_VERSION/u);
});

test('ignores fixture import paths and prose that merely mention the names', () => {
  const text = "import u from '../fixtures/a/scene.geordi.json?url'; // geordi-ir/1 is the contract";
  assert.deepEqual(findRestatedLiterals('x.ts', text), []);
});

test('tracked sources outside core and tests restate no core IR literal', () => {
  assert.deepEqual(scanTrackedFiles(), []);
});

test('a leading block comment does not hide a restated literal on the same line', () => {
  assert.equal(
    findRestatedLiterals('x.ts', "/* artifact */ const key = 'scene.geordi.json';").length,
    1,
  );
});

test('a trailing line comment that quotes a literal is not reported', () => {
  assert.deepEqual(
    findRestatedLiterals('x.ts', "const count = 1; // 'scene.geordi.json' is an example"),
    [],
  );
});

test('a // inside a string is not a comment', () => {
  const text = "const u = 'http://x'; const k = 'geordi-ir/1';";
  assert.equal(findRestatedLiterals('x.ts', text).length, 1);
});

test('a block comment spanning lines hides literals on every line it covers', () => {
  const text = "/*\n 'scene.geordi.json'\n 'geordi-ir/1' */\nconst k = 'geordi-ir/1';";
  const violations = findRestatedLiterals('x.ts', text);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /x\.ts:4:/u);
});

test('fixtures, core and test files are exempt; package source is not', () => {
  assert.equal(isExempt('fixtures/a/gen.ts'), true);
  assert.equal(isExempt('packages/x/test/__fixtures__/gen.ts'), true);
  assert.equal(isExempt('packages/core/src/a.ts'), true);
  assert.equal(isExempt('packages/x/src/a.test.ts'), true);
  assert.equal(isExempt('packages/x/src/a.ts'), false);
  assert.equal(isExempt('packages/render-fixture/src/index.ts'), false);
});
