/* eslint-disable no-restricted-syntax -- Tests write and read the writer's
   private lock record directly, outside the JsonPort boundary. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { replaceGeneratedDirectory } from './lib/atomic-generated-directory.mjs';

const scratchDirectories = [];

afterEach(async () => {
  await Promise.all(
    scratchDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
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

// --- Lock recovery -------------------------------------------------------

const LOCK_SCHEMA = 'geordi.generated-directory-lock/1';
const DEAD_PID = 4_000_001;
const LOCAL_HOST = 'build-host';

test('records the identity of the lock owner while it holds the lock', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  let held;

  await replaceGeneratedDirectory(destination, outputSet('new'), {
    lock: {
      ...liveEnvironment(),
      afterAcquire: async () => {
        held = JSON.parse(await readFile(`${destination}.lock`, 'utf8'));
      },
    },
  });

  assert.equal(held.schema, LOCK_SCHEMA);
  assert.equal(held.pid, process.pid);
  assert.equal(held.hostname, LOCAL_HOST);
  assert.equal(held.processStartTime, 'start-of-this-process');
  assert.match(held.token, /^[0-9a-f-]{36}$/u);
  await assertNoLock(destination);
});

test('recovers a lock abandoned by a writer that no longer runs', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));
  await writeLock(destination, { pid: DEAD_PID });
  const clock = fakeClock();

  await replaceGeneratedDirectory(destination, outputSet('new'), {
    lock: { ...liveEnvironment(), ...clock },
  });

  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'new');
  await assertNoLock(destination);
  assert.equal(clock.elapsed(), 0, 'recovery must not wait for the timeout');
});

test('recovers a lock whose process id now belongs to a different process', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  await writeLock(destination, {
    pid: 777,
    processStartTime: 'start-of-the-crashed-writer',
  });

  await replaceGeneratedDirectory(destination, outputSet('new'), {
    lock: {
      ...liveEnvironment(),
      isProcessRunning: () => true,
      processStartTime: async () => 'start-of-an-unrelated-process',
    },
  });

  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'new');
  await assertNoLock(destination);
});

test('never removes the lock of a live writer', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));
  const lockBytes = await writeLock(destination, {
    pid: 777,
    processStartTime: 'start-of-the-live-writer',
  });

  await assertLockTimeout(destination, {
    ...liveEnvironment(),
    isProcessRunning: (pid) => pid === 777 || pid === process.pid,
    processStartTime: async (pid) =>
      pid === 777 ? 'start-of-the-live-writer' : 'start-of-this-process',
  });

  assert.equal(await readFile(`${destination}.lock`, 'utf8'), lockBytes);
  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'old');
});

test('keeps the lock when the owner is running but its start time cannot be compared', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  const lockBytes = await writeLock(destination, {
    pid: 777,
    processStartTime: null,
  });

  await assertLockTimeout(destination, {
    ...liveEnvironment(),
    isProcessRunning: () => true,
  });

  assert.equal(await readFile(`${destination}.lock`, 'utf8'), lockBytes);
});

test('keeps a lock that another host owns, even when the process id is unknown here', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  const lockBytes = await writeLock(destination, {
    pid: DEAD_PID,
    hostname: 'some-other-host',
  });

  await assertLockTimeout(destination, liveEnvironment());

  assert.equal(await readFile(`${destination}.lock`, 'utf8'), lockBytes);
});

for (const [label, content] of [
  ['non-JSON text', 'not json at all'],
  ['an empty file', ''],
  ['JSON of the wrong shape', '[]'],
  ['an unknown schema', JSON.stringify({ schema: 'other/9', pid: DEAD_PID })],
  [
    'a non-integer process id',
    JSON.stringify(lockRecord({ pid: 'seven', token: 'x' })),
  ],
  [
    'a missing token',
    JSON.stringify({ ...lockRecord({ pid: DEAD_PID }), token: undefined }),
  ],
]) {
  test(`keeps a lock with malformed metadata: ${label}`, async () => {
    const destination = join(await scratchDirectory(), 'generated');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(`${destination}.lock`, content, 'utf8');

    await assertLockTimeout(destination, liveEnvironment());

    assert.equal(await readFile(`${destination}.lock`, 'utf8'), content);
  });
}

test('keeps a lock directory left by a writer that predates owner metadata', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  await mkdir(`${destination}.lock`, { recursive: true });

  await assertLockTimeout(destination, liveEnvironment());

  assert.deepEqual(await readdir(`${destination}.lock`), []);
});

test('two writers that find the same abandoned lock both finish with one complete output set', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));
  await writeLock(destination, { pid: DEAD_PID });

  await Promise.all([
    replaceGeneratedDirectory(destination, outputSet('first'), {
      lock: liveEnvironment(),
    }),
    replaceGeneratedDirectory(destination, outputSet('second'), {
      lock: liveEnvironment(),
    }),
  ]);

  const values = await Promise.all(
    ['a.json', 'b.json'].map((name) =>
      readFile(join(destination, name), 'utf8'),
    ),
  );
  assert.equal(values[0], values[1]);
  assert.ok(['first', 'second'].includes(values[0]));
  await assertNoLock(destination);
});

test('puts back a live lock that a rival installed after the abandoned one was judged stale', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  await writeLock(destination, { pid: DEAD_PID });
  let rivalBytes;

  await assertLockTimeout(destination, {
    ...liveEnvironment(),
    beforeStaleRemoval: async () => {
      // A rival recovered the abandoned lock first and then took the lock.
      await rm(`${destination}.lock`);
      rivalBytes = await writeLock(destination, { pid: process.pid });
    },
  });

  assert.equal(await readFile(`${destination}.lock`, 'utf8'), rivalBytes);
});

test('releases only a lock that it still owns', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  let rivalBytes;

  await replaceGeneratedDirectory(destination, outputSet('new'), {
    lock: {
      ...liveEnvironment(),
      afterAcquire: async () => {
        await rm(`${destination}.lock`);
        rivalBytes = await writeLock(destination, { pid: 888 });
      },
    },
  });

  assert.equal(await readFile(`${destination}.lock`, 'utf8'), rivalBytes);
});

test('leaves no recovery debris beside the destination', async () => {
  const root = await scratchDirectory();
  const destination = join(root, 'generated');
  await writeLock(destination, { pid: DEAD_PID });

  await replaceGeneratedDirectory(destination, outputSet('new'), {
    lock: liveEnvironment(),
  });

  assert.deepEqual((await readdir(root)).toSorted(), ['generated']);
});

function liveEnvironment() {
  return {
    hostname: LOCAL_HOST,
    pid: process.pid,
    processStartTime: async () => 'start-of-this-process',
    isProcessRunning: (pid) => pid === process.pid,
  };
}

function fakeClock() {
  let elapsed = 0;
  return {
    now: () => elapsed,
    sleep: async (milliseconds) => {
      elapsed += milliseconds;
    },
    elapsed: () => elapsed,
  };
}

function lockRecord(overrides) {
  return {
    schema: LOCK_SCHEMA,
    token: randomUUID(),
    pid: process.pid,
    hostname: LOCAL_HOST,
    processStartTime: 'start-of-this-process',
    ...overrides,
  };
}

async function writeLock(destination, overrides) {
  await mkdir(dirname(destination), { recursive: true });
  const bytes = `${JSON.stringify(lockRecord(overrides))}\n`;
  await writeFile(`${destination}.lock`, bytes, 'utf8');
  return bytes;
}

async function assertLockTimeout(destination, environment) {
  const clock = fakeClock();
  await assert.rejects(
    replaceGeneratedDirectory(destination, outputSet('new'), {
      lock: { ...environment, ...clock },
    }),
    (error) => error.name === 'GeneratedDirectoryLockTimeoutError',
  );
  assert.ok(clock.elapsed() >= 10_000, 'must wait out the full timeout');
}

async function assertNoLock(destination) {
  await assert.rejects(readFile(`${destination}.lock`), { code: 'ENOENT' });
}
