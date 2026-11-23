/* eslint-disable no-restricted-syntax -- The lock record is a private, flat
   file that must not depend on built workspace packages, which the artifact
   gate has not built yet when this writer's tests run. */
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
      async () => {
        const backup = join(
          parent,
          `.${destinationName}.backup-${randomUUID()}`,
        );
        let priorMoved = false;
        try {
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
          } catch (error) {
            if (priorMoved) {
              await rename(backup, destination);
              priorMoved = false;
            }
            throw error;
          }

          if (priorMoved) {
            await rm(backup, { recursive: true });
          }
        } catch (error) {
          if (priorMoved) {
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
  const record = {
    schema: LOCK_SCHEMA,
    token: randomUUID(),
    pid: environment.pid,
    hostname: environment.hostname,
    processStartTime:
      (await environment.processStartTime(environment.pid)) ?? null,
  };
  const serialized = `${JSON.stringify(record)}\n`;
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
    await operation();
  } finally {
    await releaseLock(lockPath, record.token);
  }
}

// The lock is a file that appears with its owner record already inside it:
// the record is written to a private file and hard-linked to the lock path.
// `link` fails with EEXIST when the path exists, whatever it holds, so a
// writer never replaces another lock and no lock exists without a record.
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

// Removes the lock only when its owner is provably gone. Anything that
// cannot be proven stale (malformed record, other host, running owner,
// unreadable start time) stays in place and the caller keeps waiting.
async function recoverAbandonedLock(lockPath, environment) {
  const judged = await readLockRecord(lockPath);
  if (
    judged === undefined ||
    !(await isProvablyAbandoned(judged, environment))
  ) {
    return;
  }

  await environment.beforeStaleRemoval?.();

  // Rename is atomic, so only one recoverer takes the stale lock; the others
  // see ENOENT. The lock may have been replaced after it was judged, so the
  // claimed file is checked and put back if it is not the one judged.
  const claimed = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, claimed);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  await environment.afterStaleClaimed?.();
  try {
    const taken = await readLockRecord(claimed);
    if (taken?.token !== judged.token) {
      await restoreClaimedLock(claimed, lockPath);
    }
  } finally {
    await rm(claimed, { force: true });
  }
}

async function restoreClaimedLock(claimed, lockPath) {
  try {
    await link(claimed, lockPath);
  } catch (error) {
    if (!isErrno(error, 'EEXIST')) {
      throw error;
    }
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
