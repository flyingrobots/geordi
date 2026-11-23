import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const RESTATED_LITERALS = [
  { value: 'scene.geordi.json', constant: 'GEORDI_IR_ARTIFACT_KEY' },
  { value: 'scene.geordi.json.receipt', constant: 'GEORDI_IR_RECEIPT_KEY' },
  { value: 'geordi-ir/1', constant: 'GEORDI_IR_VERSION' },
];

const SCANNED_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|vue)$/u;
const EXEMPT_FILE =
  /(?:^packages\/core\/|\.test\.[a-z]+$|^scripts\/core-artifact-literals|(?:^|\/)(?:fixtures|__fixtures__)\/)/u;

/**
 * Replace comment text with spaces, keeping newlines and string contents, so a
 * comment marker inside a string (a URL) is not a comment and a block comment
 * may span lines.
 */
export function maskComments(content) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === quote || (ch === '\n' && quote !== '`')) {
        quote = null;
      }
      i += 1;
    } else if (ch === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (ch === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      const stop = end === -1 ? content.length : end + 2;
      out += content.slice(i, stop).replace(/[^\n]/gu, ' ');
      i = stop;
    } else {
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      }
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Return violations for one file's text: exact quoted restatements of core constants. */
export function findRestatedLiterals(filePath, content) {
  const violations = [];
  maskComments(content)
    .split('\n')
    .forEach((line, index) => {
      for (const { value, constant } of RESTATED_LITERALS) {
        const escaped = value.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
        if (new RegExp(`(['"\`])${escaped}\\1`, 'u').test(line)) {
          violations.push(`${filePath}:${index + 1}: use ${constant} from @flyingrobots/geordi-core`);
        }
      }
    });
  return violations;
}

export function isExempt(filePath) {
  return EXEMPT_FILE.test(filePath);
}

export function scanTrackedFiles() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f.length > 0 && SCANNED_FILE.test(f) && !isExempt(f));
  return files.flatMap((f) => findRestatedLiterals(f, readFileSync(f, 'utf8')));
}
