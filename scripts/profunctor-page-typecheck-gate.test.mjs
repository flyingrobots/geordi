import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const packageRoot = resolve(
  fileURLToPath(new URL('../packages/profunctor-page', import.meta.url)),
);

function tsc(project) {
  return spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', project], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

test('the test-source typecheck fails on an invalid type in a test file', async () => {
  // The scratch directory lives inside the package so that it resolves the
  // package's dependencies; it is removed before the test ends.
  const scratch = await mkdtemp(join(packageRoot, '.typecheck-gate-'));
  try {
    await writeFile(
      join(scratch, 'bad.test.ts'),
      "const invalid: number = 'text';\nexport { invalid };\n",
    );
    await writeFile(
      join(scratch, 'tsconfig.json'),
      [
        '{',
        '  "extends": "../tsconfig.test.json",',
        '  "compilerOptions": { "rootDir": ".." },',
        '  "include": ["./bad.test.ts"]',
        '}',
        '',
      ].join('\n'),
    );
    const bad = tsc(join(scratch, 'tsconfig.json'));
    assert.notEqual(bad.status, 0, 'invalid test source must fail the gate');
    assert.match(bad.stdout, /bad\.test\.ts.*TS2322/);
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
});

test('the build config still excludes test files from emitted output', () => {
  const files = spawnSync('pnpm', ['exec', 'tsc', '--listFilesOnly'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.equal(files.status, 0);
  const own = files.stdout.split('\n').filter((l) => l.startsWith(packageRoot) && !l.includes('node_modules'));
  assert.ok(own.length > 0);
  assert.deepEqual(own.filter((l) => l.endsWith('.test.ts')), []);
});
