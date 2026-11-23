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

test('leaves a live lock alone that a rival installed after the abandoned one was judged stale', async () => {
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
      afterPriorMoved: async () => {
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

async function writeLock(destination, overrides, suffix = '.lock') {
  await mkdir(dirname(destination), { recursive: true });
  const bytes = `${JSON.stringify(lockRecord(overrides))}\n`;
  await writeFile(`${destination}${suffix}`, bytes, 'utf8');
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

test('a recoverer cannot let a newer publisher lose its output to an older one', async () => {
  // Interleaving: A judges lock L0 abandoned; B recovers it and takes the
  // lock; A, holding the recovery lock, looks at the lock path; C wants the
  // lock too. A must leave B's lock alone, so B and C publish one after the
  // other and C's output, published last, survives.
  const destination = join(await scratchDirectory(), 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));
  await writeLock(destination, { pid: DEAD_PID });
  const bHolds = gate();
  const releaseB = gate();
  const bFinished = gate();
  let bDone;
  let cDone;

  const writerB = () =>
    replaceGeneratedDirectory(destination, outputSet('B'), {
      lock: {
        ...liveEnvironment(),
        ...fakeClock(),
        afterAcquire: async () => {
          bHolds.open();
          await releaseB.promise;
        },
      },
    });
  const writerC = () =>
    replaceGeneratedDirectory(destination, outputSet('C'), {
      lock: {
        ...liveEnvironment(),
        now: () => 0,
        sleep: async () => {
          await bFinished.promise;
        },
      },
    });

  const writerA = replaceGeneratedDirectory(destination, outputSet('A'), {
    lock: {
      ...liveEnvironment(),
      ...fakeClock(),
      beforeStaleRemoval: async () => {
        bDone = settle(writerB());
        await bHolds.promise;
      },
      afterRecoveryLockAcquired: async () => {
        cDone = settle(writerC());
      },
    },
  });
  const aOutcome = await settle(writerA);
  assert.equal(aOutcome.error?.name, 'GeneratedDirectoryLockTimeoutError');
  assert.equal(
    JSON.parse(await readFile(`${destination}.lock`, 'utf8')).pid,
    process.pid,
    "B's lock must still be in place",
  );

  releaseB.open();
  const bOutcome = await bDone;
  bFinished.open();
  const cOutcome = await cDone;

  assert.equal(bOutcome.ok, true, 'B publishes');
  assert.equal(cOutcome.ok, true, 'C publishes after B');
  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'C');
  await assertNoLock(destination);
});

test('waits while a live recoverer holds the recovery lock', async () => {
  const destination = join(await scratchDirectory(), 'generated');
  const lockBytes = await writeLock(destination, { pid: DEAD_PID });
  const recoveryBytes = await writeLock(destination, {}, '.lock.recovering');

  await assertLockTimeout(destination, liveEnvironment());

  assert.equal(await readFile(`${destination}.lock`, 'utf8'), lockBytes);
  assert.equal(
    await readFile(`${destination}.lock.recovering`, 'utf8'),
    recoveryBytes,
  );
});

test('removes a recovery lock abandoned by a crashed recoverer, then recovers the lock', async () => {
  const root = await scratchDirectory();
  const destination = join(root, 'generated');
  await writeLock(destination, { pid: DEAD_PID });
  await writeLock(destination, { pid: DEAD_PID }, '.lock.recovering');

  await replaceGeneratedDirectory(destination, outputSet('new'), {
    lock: liveEnvironment(),
  });

  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'new');
  assert.deepEqual((await readdir(root)).toSorted(), ['generated']);
});

for (const [label, overrides, content] of [
  ['another host owns it', { pid: DEAD_PID, hostname: 'some-other-host' }],
  ['its record is malformed', undefined, 'not json at all'],
]) {
  test(`keeps a recovery lock when ${label}`, async () => {
    const destination = join(await scratchDirectory(), 'generated');
    await writeLock(destination, { pid: DEAD_PID });
    let recoveryBytes = content;
    if (content === undefined) {
      recoveryBytes = await writeLock(
        destination,
        overrides,
        '.lock.recovering',
      );
    } else {
      await writeFile(`${destination}.lock.recovering`, content, 'utf8');
    }

    await assertLockTimeout(destination, liveEnvironment());

    assert.equal(
      await readFile(`${destination}.lock.recovering`, 'utf8'),
      recoveryBytes,
    );
  });
}

test('aborts before publishing when the lock was lost, leaving the destination alone', async () => {
  const root = await scratchDirectory();
  const destination = join(root, 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));
  let rivalBytes;

  await assert.rejects(
    replaceGeneratedDirectory(destination, outputSet('new'), {
      lock: {
        ...liveEnvironment(),
        afterAcquire: async () => {
          await rm(`${destination}.lock`);
          rivalBytes = await writeLock(destination, { pid: 888 });
        },
      },
    }),
    (error) => error.name === 'GeneratedDirectoryLockLostError',
  );

  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'old');
  assert.equal(await readFile(`${destination}.lock`, 'utf8'), rivalBytes);
});

test('does not restore a backup over the destination when the lock was lost before rollback', async () => {
  const root = await scratchDirectory();
  const destination = join(root, 'generated');
  await replaceGeneratedDirectory(destination, outputSet('old'));
  let rivalBytes;

  await assert.rejects(
    replaceGeneratedDirectory(destination, outputSet('new'), {
      lock: {
        ...liveEnvironment(),
        afterPriorMoved: async () => {
          // The lock is lost and the staged directory disappears, so the
          // publish fails and a rollback would normally run.
          await rm(`${destination}.lock`);
          rivalBytes = await writeLock(destination, { pid: 888 });
          const staged = (await readdir(root)).find((name) =>
            name.startsWith('.generated.stage-'),
          );
          await rm(join(root, staged), { recursive: true });
          // The rival publishes its own output in the meantime.
          await mkdir(destination);
          await writeFile(join(destination, 'a.json'), 'rival', 'utf8');
        },
      },
    }),
    (error) => error.name === 'GeneratedDirectoryLockLostError',
  );

  assert.equal(await readFile(join(destination, 'a.json'), 'utf8'), 'rival');
  assert.equal(await readFile(`${destination}.lock`, 'utf8'), rivalBytes);
});

function gate() {
  let open;
  const promise = new Promise((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

async function settle(promise) {
  try {
    await promise;
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
