/* eslint-disable no-restricted-syntax -- The lock record is a private, flat
   file that must not depend on built workspace packages, which the artifact
   gate has not built yet when this writer's tests run. */
// Transactional writer for generated directories.
//
// Writers are serialized by `<destination>.lock`, a file that appears
// atomically with its owner record inside it (schema, pid, hostname, process
// start time, token): the record is written to a private file and hard-linked
// to the lock path, and `link` fails when the path exists, whatever it holds.
//
// Recovery of a lock left by a crashed writer. The main lock is removed only
// by its owner's release or by the single holder of the recovery lock
// `<destination>.lock.recovering` (same record format, same exclusive
// create). The holder re-reads the main lock under the recovery lock and
// removes it only if it still carries the token it judged abandoned and its
// owner is still provably gone: same host, and the pid is not running or runs
// with a different start time (a recycled pid). A malformed record, another
// host, a running owner and an unreadable start time are never removed;
// nothing is removed on timeout alone.
//
// A writer also checks that the lock at the path still carries its own token
// before it publishes and before it rolls back. A writer that lost the lock
// throws GeneratedDirectoryLockLostError and does not touch the destination or
// restore a backup.
//
// Known limits.
// - A lock directory left by a writer that predates owner records is never
//   removed automatically. Delete `<destination>.lock` by hand once no writer
//   runs.
// - Removing an abandoned recovery lock is not itself serialized: it moves the
//   file aside, checks its token and puts it back if it was replaced. That
//   needs a recoverer to crash inside the recovery window, then two writers to
//   remove the stale recovery lock at the same moment while a third takes the
//   recovery lock between their steps, and finally a lock holder to be
//   displaced. The writer's lock checks before publishing and before
//   rollback then turn that into GeneratedDirectoryLockLostError. A lock lost
//   in the instants between a check and the rename that follows is not
//   detected; the outcome is then two complete output sets, last rename wins,
//   or a rollback that restores the prior set. Closing this would need an
//   atomic compare-and-remove, which a file system does not offer. It is
//   accepted because it needs a crash plus three simultaneous recoverers.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const LOCK_SCHEMA = 'geordi.generated-directory-lock/1';

const LOCK_RETRY_MILLISECONDS = 25;
const LOCK_TIMEOUT_MILLISECONDS = 10_000;

class GeneratedDirectoryStageError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

class GeneratedDirectoryLockTimeoutError extends Error {
  constructor(lockPath) {
    super(`Timed out waiting for generated-directory lock: ${lockPath}`);
    this.name = new.target.name;
  }
}

class GeneratedDirectoryLockLostError extends Error {
  constructor(lockPath, options) {
    super(
      `Generated-directory lock was lost before the writer finished: ${lockPath}`,
      options,
    );
    this.name = new.target.name;
  }
}

class GeneratedDirectoryEntryError extends Error {
  constructor(name) {
    super(`Generated output must be a direct file name: ${name}`);
    this.name = new.target.name;
  }
}

export async function replaceGeneratedDirectory(
  destination,
  outputs,
  options = {},
) {
  const parent = dirname(destination);
  const destinationName = basename(destination);
  await mkdir(parent, { recursive: true });

  let staging = await mkdtemp(join(parent, `.${destinationName}.stage-`));
  try {
    await stageOutputs(staging, outputs);
    await withDirectoryLock(
      `${destination}.lock`,
      async (assertHeld) => {
        const backup = join(
          parent,
          `.${destinationName}.backup-${randomUUID()}`,
        );
        await assertHeld();
        let priorMoved = false;
        try {
          await rename(destination, backup);
          priorMoved = true;
        } catch (error) {
          if (!isErrno(error, 'ENOENT')) {
            throw error;
          }
        }
        await options.lock?.afterPriorMoved?.();

        try {
          await rename(staging, destination);
          staging = undefined;
          if (priorMoved) {
            await rm(backup, { recursive: true });
          }
        } catch (error) {
          if (priorMoved) {
            await assertHeld(error);
            await restoreBackup(backup, destination, error);
          }
          throw error;
        }
      },
      options.lock,
    );
  } finally {
    if (staging !== undefined) {
      await rm(staging, { force: true, recursive: true });
    }
  }
}

async function stageOutputs(staging, outputs) {
  const expectedNames = [...outputs.keys()].toSorted();
  for (const [name, content] of outputs) {
    assertFileName(name);
    await writeFile(join(staging, name), content, 'utf8');
  }

  const actualNames = (await readdir(staging)).toSorted();
  if (actualNames.join('\n') !== expectedNames.join('\n')) {
    throw new GeneratedDirectoryStageError(
      'Staged generated-output inventory is incomplete.',
    );
  }
  for (const [name, content] of outputs) {
    if ((await readFile(join(staging, name), 'utf8')) !== content) {
      throw new GeneratedDirectoryStageError(
        `Staged generated output is invalid: ${name}`,
      );
    }
  }
}

async function withDirectoryLock(lockPath, operation, overrides = {}) {
  const environment = { ...defaultLockEnvironment(), ...overrides };
  const record = await newLockRecord(environment);
  const serialized = serializeRecord(record);
  const deadline = environment.now() + environment.timeoutMilliseconds;

  while (!(await tryAcquire(lockPath, serialized))) {
    await recoverAbandonedLock(lockPath, environment);
    if (await tryAcquire(lockPath, serialized)) {
      break;
    }
    if (environment.now() >= deadline) {
      throw new GeneratedDirectoryLockTimeoutError(lockPath);
    }
    await environment.sleep(LOCK_RETRY_MILLISECONDS);
  }

  try {
    await environment.afterAcquire?.();
    await operation(async (cause) => {
      const held = await readLockRecord(lockPath);
      if (held?.token !== record.token) {
        throw new GeneratedDirectoryLockLostError(
          lockPath,
          cause === undefined ? undefined : { cause },
        );
      }
    });
  } finally {
    await releaseLock(lockPath, record.token);
  }
}

async function newLockRecord(environment) {
  return {
    schema: LOCK_SCHEMA,
    token: randomUUID(),
    pid: environment.pid,
    hostname: environment.hostname,
    processStartTime:
      (await environment.processStartTime(environment.pid)) ?? null,
  };
}

function serializeRecord(record) {
  return `${JSON.stringify(record)}\n`;
}

// Exclusive create: the path must be absent. The record is written to a
// private file and hard-linked to the lock path, so no lock exists without
// its record, and `link` never replaces anything.
async function tryAcquire(lockPath, serialized) {
  const candidate = `${lockPath}.acquire-${randomUUID()}`;
  await writeFile(candidate, serialized, { encoding: 'utf8', flag: 'wx' });
  try {
    await link(candidate, lockPath);
    return true;
  } catch (error) {
    if (isErrno(error, 'EEXIST')) {
      return false;
    }
    throw error;
  } finally {
    await rm(candidate, { force: true });
  }
}

// Removes the main lock only while holding the recovery lock, and only if it
// is still the lock that was judged abandoned. Otherwise it leaves the lock
// untouched and the caller goes back to waiting.
async function recoverAbandonedLock(lockPath, environment) {
  const judged = await readLockRecord(lockPath);
  if (
    judged === undefined ||
    !(await isProvablyAbandoned(judged, environment))
  ) {
    return;
  }

  await environment.beforeStaleRemoval?.();

  const recoveryPath = `${lockPath}.recovering`;
  const recovery = await newLockRecord(environment);
  if (!(await tryAcquire(recoveryPath, serializeRecord(recovery)))) {
    await removeAbandonedRecoveryLock(recoveryPath, environment);
    return;
  }
  try {
    await environment.afterRecoveryLockAcquired?.();
    const current = await readLockRecord(lockPath);
    if (
      current?.token === judged.token &&
      (await isProvablyAbandoned(current, environment))
    ) {
      await rm(lockPath, { force: true });
    }
  } finally {
    await releaseLock(recoveryPath, recovery.token);
  }
}

// Second-level removal, not serialized (see the header). The recovery lock is
// moved aside, its token is checked and it is put back if it was replaced.
async function removeAbandonedRecoveryLock(recoveryPath, environment) {
  const judged = await readLockRecord(recoveryPath);
  if (
    judged === undefined ||
    !(await isProvablyAbandoned(judged, environment))
  ) {
    return;
  }

  const claimed = `${recoveryPath}.stale-${randomUUID()}`;
  try {
    await rename(recoveryPath, claimed);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  try {
    const taken = await readLockRecord(claimed);
    if (taken?.token !== judged.token) {
      try {
        await link(claimed, recoveryPath);
      } catch (error) {
        if (!isErrno(error, 'EEXIST')) {
          throw error;
        }
      }
    }
  } finally {
    await rm(claimed, { force: true });
  }
}

async function isProvablyAbandoned(record, environment) {
  if (record.hostname !== environment.hostname) {
    return false;
  }
  if (!(await environment.isProcessRunning(record.pid))) {
    return true;
  }
  // The pid is in use. It still identifies the owner only if the process
  // started when the owner did; a different start time means a recycled pid.
  if (record.processStartTime === null) {
    return false;
  }
  const current = await environment.processStartTime(record.pid);
  return current !== undefined && current !== record.processStartTime;
}

async function releaseLock(lockPath, token) {
  const held = await readLockRecord(lockPath);
  if (held?.token === token) {
    await rm(lockPath, { force: true });
  }
}

async function readLockRecord(lockPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    parsed.schema !== LOCK_SCHEMA ||
    typeof parsed.token !== 'string' ||
    parsed.token.length === 0 ||
    !Number.isSafeInteger(parsed.pid) ||
    parsed.pid <= 0 ||
    typeof parsed.hostname !== 'string' ||
    !(
      parsed.processStartTime === null ||
      typeof parsed.processStartTime === 'string'
    )
  ) {
    return undefined;
  }
  return parsed;
}

function defaultLockEnvironment() {
  return {
    hostname: hostname(),
    pid: process.pid,
    processStartTime: readProcessStartTime,
    isProcessRunning,
    now: () => Date.now(),
    sleep: (milliseconds) => delay(milliseconds),
    timeoutMilliseconds: LOCK_TIMEOUT_MILLISECONDS,
  };
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return !isErrno(error, 'ESRCH');
  }
}

async function readProcessStartTime(pid) {
  try {
    const { stdout } = await execFileAsync(
      'ps',
      ['-o', 'lstart=', '-p', String(pid)],
      { env: { ...process.env, LC_ALL: 'C' } },
    );
    const text = stdout.trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

async function restoreBackup(backup, destination, originalError) {
  try {
    await rm(destination, { force: true, recursive: true });
    await rename(backup, destination);
  } catch (rollbackError) {
    throw new AggregateError(
      [originalError, rollbackError],
      'Generated-output commit and rollback both failed.',
    );
  }
}

function assertFileName(name) {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    basename(name) !== name
  ) {
    throw new GeneratedDirectoryEntryError(name);
  }
}

function isErrno(error, code) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
