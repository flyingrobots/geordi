import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

class UnscopedPackageReferenceError extends Error {
  constructor(violations) {
    super(`Found ${violations.length} unscoped package reference(s).`);
    this.name = 'UnscopedPackageReferenceError';
  }
}

const forbiddenPackageScope = '@' + 'geordi/';
const ignoredSuffixes = new Set(['pnpm-lock.yaml']);
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((filePath) => filePath.length > 0 && !ignoredSuffixes.has(filePath));

const violations = [];

for (const filePath of trackedFiles) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (const [index, line] of lines.entries()) {
    if (line.includes(forbiddenPackageScope)) {
      violations.push(`${filePath}:${index + 1}: ${line.trim()}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  throw new UnscopedPackageReferenceError(violations);
}
