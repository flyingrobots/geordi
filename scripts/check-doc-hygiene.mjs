import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

class DocHygieneError extends Error {
  constructor(violations) {
    super(`Found ${violations.length} documentation hygiene issue(s).`);
    this.name = new.target.name;
  }
}

const markdownFiles = execFileSync('git', ['ls-files', '-z', '*.md'], { encoding: 'utf8' })
  .split('\0')
  .filter((filePath) => filePath.length > 0);

const violations = [];
const errorCodeWarningPattern = /\b(?:GEORDI_)?E_[A-Z0-9_]+\b.*\bwarning\b/iu;

for (const filePath of markdownFiles) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  let inFence = false;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (/[ \t]$/u.test(line)) {
      violations.push(`${filePath}:${lineNumber}: trailing whitespace`);
    }

    if (errorCodeWarningPattern.test(line)) {
      violations.push(`${filePath}:${lineNumber}: E_* code described as warning`);
    }

    if (/^```/u.test(line)) {
      if (!inFence && /^```\s*$/u.test(line)) {
        violations.push(`${filePath}:${lineNumber}: fenced code block missing language`);
      }

      inFence = !inFence;
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  throw new DocHygieneError(violations);
}
