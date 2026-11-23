import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const RESTATED_LITERALS = [
  { value: 'scene.geordi.json', constant: 'GEORDI_IR_ARTIFACT_KEY' },
  { value: 'scene.geordi.json.receipt', constant: 'GEORDI_IR_RECEIPT_KEY' },
  { value: 'geordi-ir/1', constant: 'GEORDI_IR_VERSION' },
];

const SCANNED_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|vue)$/u;
const EXEMPT_FILE = /(?:^packages\/core\/|\.test\.[a-z]+$|^scripts\/core-artifact-literals)/u;

/** Return violations for one file's text: exact quoted restatements of core constants. */
export function findRestatedLiterals(filePath, content) {
  const violations = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (/^\s*(?:\*|\/\/|\/\*)/u.test(line)) {
      return;
    }
    for (const { value, constant } of RESTATED_LITERALS) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
      if (new RegExp(`(['"\`])${escaped}\\1`, 'u').test(line)) {
        violations.push(`${filePath}:${index + 1}: use ${constant} from @flyingrobots/geordi-core`);
      }
    }
  });
  return violations;
}

export function scanTrackedFiles() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f.length > 0 && SCANNED_FILE.test(f) && !EXEMPT_FILE.test(f));
  return files.flatMap((f) => findRestatedLiterals(f, readFileSync(f, 'utf8')));
}
