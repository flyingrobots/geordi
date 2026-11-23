import assert from 'node:assert/strict';
import test from 'node:test';

import { findRestatedLiterals, scanTrackedFiles } from './core-artifact-literals.mjs';

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
