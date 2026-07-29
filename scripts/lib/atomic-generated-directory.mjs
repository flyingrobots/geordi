import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const LOCK_RETRY_MILLISECONDS = 25;
const LOCK_TIMEOUT_MILLISECONDS = 10_000;

class GeneratedDirectoryStageError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

class GeneratedDirectoryEntryError extends Error {
  constructor(name) {
    super(`Generated output must be a direct file name: ${name}`);
    this.name = new.target.name;
  }
}

export async function replaceGeneratedDirectory(destination, outputs) {
  const parent = dirname(destination);
  const destinationName = basename(destination);
  await mkdir(parent, { recursive: true });

  let staging = await mkdtemp(join(parent, `.${destinationName}.stage-`));
  try {
    await stageOutputs(staging, outputs);
    await withDirectoryLock(`${destination}.lock`, async () => {
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
    });
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

async function withDirectoryLock(lockPath, operation) {
  const deadline = Date.now() + LOCK_TIMEOUT_MILLISECONDS;
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (!isErrno(error, 'EEXIST') || Date.now() >= deadline) {
        throw error;
      }
      await delay(LOCK_RETRY_MILLISECONDS);
    }
  }

  try {
    await operation();
  } finally {
    await rm(lockPath, { force: true, recursive: true });
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
