import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { replaceGeneratedDirectory } from './lib/atomic-generated-directory.mjs';

const scratchDirectories = [];

afterEach(async () => {
  await Promise.all(
    scratchDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  );
});

test('replaces a generated directory as one complete inventory', async () => {
  const root = await scratchDirectory();
  const destination = join(root, 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));

  await Promise.all([
    replaceGeneratedDirectory(destination, outputSet('first')),
    replaceGeneratedDirectory(destination, outputSet('second')),
  ]);

  const inventory = (await readdir(destination)).toSorted();
  assert.deepEqual(inventory, ['a.json', 'b.json']);
  const values = await Promise.all(
    inventory.map((name) => readFile(join(destination, name), 'utf8')),
  );
  assert.ok(
    values.every((value) => value === 'first') ||
      values.every((value) => value === 'second'),
    `expected one complete output set, received ${values.join(', ')}`,
  );
});

test('preserves the prior generated directory when staging fails', async () => {
  const root = await scratchDirectory();
  const destination = join(root, 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));

  await assert.rejects(
    replaceGeneratedDirectory(
      destination,
      new Map([
        ['a.json', 'new'],
        ['missing/b.json', 'new'],
      ]),
    ),
  );

  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'old');
  assert.equal(await readFile(join(destination, 'b.json'), 'utf8'), 'old');
});

async function scratchDirectory() {
  const path = await mkdtemp(join(tmpdir(), 'geordi-generated-directory-'));
  scratchDirectories.push(path);
  return path;
}

function outputSet(value) {
  return new Map([
    ['a.json', value],
    ['b.json', value],
  ]);
}
