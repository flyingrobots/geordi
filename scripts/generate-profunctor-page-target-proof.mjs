import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lowerProfunctorPageArtifacts,
  PROFUNCTOR_PAGE_TARGET_IR_PATH,
  PROFUNCTOR_PAGE_TARGET_MAP_PATH,
  PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH,
  PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH,
} from '../packages/profunctor-page/dist/index.js';
import { replaceGeneratedDirectory } from './lib/atomic-generated-directory.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_ROOT = join(
  REPOSITORY_ROOT,
  'fixtures',
  'profunctor-page',
  'project-keep',
);
const INPUT_ROOT = join(FIXTURE_ROOT, 'input');
const GENERATED_ROOT = join(FIXTURE_ROOT, 'generated');

const EXPECTED_OUTPUTS = [
  PROFUNCTOR_PAGE_TARGET_IR_PATH,
  PROFUNCTOR_PAGE_TARGET_MAP_PATH,
  PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH,
  PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH,
].toSorted();

class ProfunctorPageTargetFixtureDriftError extends Error {
  constructor(violations) {
    super(`Profunctor Page target fixture has ${violations.length} drift violation(s).`);
    this.name = new.target.name;
    this.violations = violations;
  }
}

class ProfunctorPageTargetFixtureModeError extends Error {
  constructor(value) {
    super(`Expected --check or --write, received ${value ?? 'no mode'}.`);
    this.name = new.target.name;
  }
}

class ProfunctorPageTargetFixtureEntryError extends Error {
  constructor(name) {
    super(`Generated target entry must be a regular file: ${name}`);
    this.name = new.target.name;
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') {
    throw new ProfunctorPageTargetFixtureModeError(mode);
  }

  const result = lowerProfunctorPageArtifacts({
    buildManifest: await inputArtifact('page.profunctor.build.json'),
    page: await inputArtifact('page.profunctor.json'),
    sourceMap: await inputArtifact('page.profunctor.map.json'),
  });
  const outputs = new Map([
    [result.artifacts.ir.path, result.artifacts.ir.content],
    [result.artifacts.map.path, result.artifacts.map.content],
    [result.artifacts.preview.path, result.artifacts.preview.content],
    [result.artifacts.receipt.path, result.artifacts.receipt.content],
  ]);

  if (mode === '--write') {
    await writeOutputs(outputs);
    process.stdout.write(
      `Wrote ${outputs.size} Profunctor Page target proof artifacts.\n`,
    );
    return;
  }

  await checkOutputs(outputs);
  process.stdout.write(
    `Verified ${outputs.size} Profunctor Page target proof artifacts.\n`,
  );
}

async function inputArtifact(filename) {
  return {
    filename,
    source: await readFile(join(INPUT_ROOT, filename), 'utf8'),
  };
}

async function writeOutputs(outputs) {
  await replaceGeneratedDirectory(GENERATED_ROOT, outputs);
}

async function checkOutputs(outputs) {
  const violations = [];
  const existing = await outputInventory();
  if (existing.join('\n') !== EXPECTED_OUTPUTS.join('\n')) {
    violations.push(
      `generated inventory: expected ${EXPECTED_OUTPUTS.join(', ')}, received ${existing.join(', ') || 'none'}`,
    );
  }

  for (const [filename, expected] of outputs) {
    let actual;
    try {
      actual = await readFile(join(GENERATED_ROOT, filename), 'utf8');
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        violations.push(`${filename}: missing`);
        continue;
      }
      throw error;
    }
    if (actual !== expected) {
      violations.push(`${filename}: stale`);
    }
  }

  if (violations.length > 0) {
    throw new ProfunctorPageTargetFixtureDriftError(violations);
  }
}

async function outputInventory() {
  try {
    const entries = await readdir(GENERATED_ROOT, { withFileTypes: true });
    return entries.map((entry) => {
      if (!entry.isFile()) {
        throw new ProfunctorPageTargetFixtureEntryError(entry.name);
      }
      return entry.name;
    }).toSorted();
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return [];
    }
    throw error;
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

await main();
