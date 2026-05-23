import { getLocation, type Source } from 'graphql';
import { createSourceLocation } from '@flyingrobots/geordi-compiler-core';
import type { SourceRef } from '@flyingrobots/geordi-compiler-core';

/**
 * Returns a SourceRef from a graphql-js AST node's loc, or a fallback.
 * Null-safe: if loc is absent, returns file/<inline>, line 1, col 1.
 */
export function nodeSourceRef(
  node: { loc?: { start: number; end: number; source: Source } },
  filename?: string,
): SourceRef {
  if (node.loc) {
    const start = getLocation(node.loc.source, node.loc.start);
    const end = getLocation(node.loc.source, node.loc.end);
    return createSourceLocation({
      file: filename ?? node.loc.source.name,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      offset: node.loc.start,
      endOffset: node.loc.end,
    });
  }
  return createSourceLocation({ file: filename });
}
