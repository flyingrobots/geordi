import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';

class RepoSludgeError extends Error {
  constructor(violations) {
    super(`Found ${violations.length} process scratchpad file(s).`);
    this.name = new.target.name;
  }
}

const forbiddenFilePatterns = [
  /^CLAUDE(?:-|\.md$)/u,
  /(?:^|-)THOUGHTS\.md$/u,
  /(?:^|-)SCRATCH(?:PAD)?\.md$/u,
];

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((filePath) => filePath.length > 0);

const violations = trackedFiles.filter((filePath) => {
  const fileName = basename(filePath);
  return forbiddenFilePatterns.some((pattern) => pattern.test(fileName));
});

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  throw new RepoSludgeError(violations);
}
