// ESLint rule `nondeterminism/ban`: the TypeScript half of the canonical-path nondeterminism
// rules. Each selector in TS_SELECTORS reports `[<rule-id>] <message>`. A finding is waived by a
// comment that names the rule and says why, in the same form as the Rust scan:
//
//   // ban-nondeterminism: allow(std-fs) <reason>        its own line and the next line
//   // ban-nondeterminism: allow-begin(std-fs) <reason>  ... // ban-nondeterminism: allow-end(std-fs)
//
// A waiver covers only the rule it names. See docs/nondeterminism-rules.md.
import { TS_SELECTORS, inlineWaivedLines } from './lib/nondeterminism.mjs';

const ban = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { exempt: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: { banned: '[{{rule}}] {{message}} Fix it, or waive it with a reason (docs/nondeterminism-rules.md).' },
  },
  create(context) {
    const { sourceCode } = context;
    // Rule IDs a configuration block exempts by scope (for example in test files).
    const exempt = new Set(context.options[0]?.exempt ?? []);
    const waivedByRule = new Map();
    const isWaived = (rule, line) => {
      if (!waivedByRule.has(rule)) {
        waivedByRule.set(rule, inlineWaivedLines(sourceCode.text, rule));
      }
      return waivedByRule.get(rule).has(line);
    };
    // One report per rule per node, even when two selectors of a rule match it.
    const reported = new Set();
    const listeners = {};
    for (const { rule, selector, message } of TS_SELECTORS) {
      if (exempt.has(rule)) {
        continue;
      }
      const previous = listeners[selector];
      listeners[selector] = (node) => {
        if (previous !== undefined) {
          previous(node);
        }
        const key = `${rule}:${String(node.range[0])}:${String(node.range[1])}`;
        if (reported.has(key) || isWaived(rule, node.loc.start.line)) {
          return;
        }
        reported.add(key);
        context.report({ node, messageId: 'banned', data: { rule, message } });
      };
    }
    return listeners;
  },
};

export default { rules: { ban } };
