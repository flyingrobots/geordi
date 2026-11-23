// Regression tests for the contract gate's encoder-crate copy (flyingrobots/geordi#225).
// A git base is extracted under `target/contract-gate/trees/`, so every absolute path of it
// contains a `target` component. The copy must skip build output inside the crate, not every
// path that has `target` anywhere above it.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { copyCrate } from './lib/contract-gate/snapshot.mjs';
import { Tree } from './lib/contract-gate/trees.mjs';

const SCRATCH = mkdtempSync(join(tmpdir(), 'geordi-contract-gate-copy-'));
after(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

const CRATE = 'crates/demo';
const FILES = {
  'Cargo.toml': '[workspace]\nmembers = ["crates/demo"]\n',
  'Cargo.lock': 'version = 4\n',
  'crates/demo/Cargo.toml': '[package]\nname = "demo"\nversion = "0.0.0"\n',
  'crates/demo/src/lib.rs': 'pub fn demo() {}\n',
  'crates/demo/target/debug/junk.txt': 'build output\n',
};

function writeTree(dir) {
  for (const [path, text] of Object.entries(FILES)) {
    const absolute = join(dir, ...path.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return new Tree(dir, 'test tree');
}

function copied(copy, path) {
  return existsSync(join(copy.dir, ...path.split('/')));
}

test('CG-COPY-01 a tree extracted under a target directory keeps its crate', () => {
  const tree = writeTree(join(SCRATCH, 'one', 'target', 'contract-gate', 'trees', 'abc'));
  const copy = copyCrate(tree, CRATE, join(SCRATCH, 'one', 'cache'));
  assert.ok(copied(copy, 'crates/demo/Cargo.toml'), 'the crate manifest is copied');
  assert.ok(copied(copy, 'crates/demo/src/lib.rs'), 'the crate source is copied');
  assert.ok(copied(copy, 'Cargo.lock'), 'the root lock is copied');
});

test('CG-COPY-02 build output inside the crate is still skipped', () => {
  const tree = writeTree(join(SCRATCH, 'two', 'target', 'contract-gate', 'trees', 'abc'));
  const copy = copyCrate(tree, CRATE, join(SCRATCH, 'two', 'cache'));
  assert.equal(copied(copy, 'crates/demo/target/debug/junk.txt'), false);
  assert.equal(copied(copy, 'crates/demo/target'), false);
});

test('CG-COPY-03 a cached copy that has its marker but no manifest is rebuilt', () => {
  const cache = join(SCRATCH, 'three', 'cache');
  const tree = writeTree(join(SCRATCH, 'three', 'tree'));
  const first = copyCrate(tree, CRATE, cache);
  // What a copy made before the fix looks like: complete by its marker, with no crate in it.
  rmSync(join(first.dir, 'crates'), { recursive: true, force: true });
  assert.ok(existsSync(join(first.dir, '.contract-gate-complete')));
  const second = copyCrate(tree, CRATE, cache);
  assert.equal(second.dir, first.dir);
  assert.ok(copied(second, 'crates/demo/Cargo.toml'), 'the empty copy is replaced');
});
