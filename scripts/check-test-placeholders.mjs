import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

class PlaceholderTestError extends Error {
  constructor(violations) {
    super(`Found ${violations.length} placeholder test(s).`);
    this.name = new.target.name;
  }
}

const placeholderPatterns = [
  {
    label: 'tautological true assertion',
    regex: /expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)/u,
  },
  {
    label: 'placeholder test name',
    regex: /(?:test|it)\s*\(\s*['"]it works['"]/u,
  },
];

const testFiles = execFileSync('git', ['ls-files', '-z', '*.test.ts'], { encoding: 'utf8' })
  .split('\0')
  .filter((filePath) => filePath.length > 0);

const violations = [];

for (const filePath of testFiles) {
  const content = readFileSync(filePath, 'utf8');
  for (const pattern of placeholderPatterns) {
    if (pattern.regex.test(content)) {
      violations.push(`${filePath}: ${pattern.label}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  throw new PlaceholderTestError(violations);
}
