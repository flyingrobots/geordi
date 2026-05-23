import { parse, Source, GraphQLError, type DocumentNode } from 'graphql';
import {
  createSourceLocation,
  ParseError,
  GeordiErrorCode,
  normalizeCompilerErrorCause,
  type ThrownValue,
} from '@flyingrobots/geordi-compiler-core';

/**
 * Parse a GraphQL SDL string into a DocumentNode.
 * Wraps graphql-js parse errors into a typed ParseError.
 */
export function parseGraphql(sdl: string, filename?: string): DocumentNode {
  const effectiveName = filename ?? '<inline>';
  try {
    return parse(new Source(sdl, effectiveName));
  } catch (cause) {
    const location =
      cause instanceof GraphQLError && cause.locations?.[0]
        ? createSourceLocation({
            file: effectiveName,
            line: cause.locations[0].line,
            column: cause.locations[0].column,
          })
        : createSourceLocation({ file: effectiveName });

    throw new ParseError(
      GeordiErrorCode.E_INPUT_INVALID_SDL,
      `GraphQL SDL parse error: ${cause instanceof Error ? cause.message : 'GraphQL parser threw a non-error value'}`,
      { cause: normalizeCompilerErrorCause(cause as ThrownValue), location },
    );
  }
}
