import { describe, expect, it } from 'vitest';
import {
  createSourceLocation,
  INLINE_SOURCE_FILE,
  InvalidSourceLocationError,
} from '../src/types';

describe('source location model', () => {
  it('normalizes missing source input to the inline start location', () => {
    expect(createSourceLocation()).toEqual({
      file: INLINE_SOURCE_FILE,
      line: 1,
      column: 1,
    });
  });

  it('keeps exact file, span, and offset data when provided', () => {
    expect(
      createSourceLocation({
        file: 'scene.graphql',
        line: 3,
        column: 5,
        endLine: 3,
        endColumn: 22,
        offset: 18,
        endOffset: 35,
      }),
    ).toEqual({
      file: 'scene.graphql',
      line: 3,
      column: 5,
      endLine: 3,
      endColumn: 22,
      offset: 18,
      endOffset: 35,
    });
  });

  it('rejects invalid one-based positions with a custom error', () => {
    expect(() => createSourceLocation({ line: 0 })).toThrow(InvalidSourceLocationError);
    expect(() => createSourceLocation({ column: Number.POSITIVE_INFINITY })).toThrow(
      InvalidSourceLocationError,
    );
  });

  it('rejects incomplete or backwards spans with a custom error', () => {
    expect(() => createSourceLocation({ endLine: 1 })).toThrow(InvalidSourceLocationError);
    expect(() =>
      createSourceLocation({ line: 5, column: 10, endLine: 5, endColumn: 9 }),
    ).toThrow(InvalidSourceLocationError);
  });

  it('rejects negative or backwards offsets with a custom error', () => {
    expect(() => createSourceLocation({ offset: -1 })).toThrow(InvalidSourceLocationError);
    expect(() => createSourceLocation({ offset: 5, endOffset: 4 })).toThrow(
      InvalidSourceLocationError,
    );
  });
});
