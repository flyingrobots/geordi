import type { JsonObject } from './json.js';

export const INLINE_SOURCE_FILE = '<inline>' as const;

export interface SourceLocation extends JsonObject {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  offset?: number;
  endOffset?: number;
}

export interface SourceLocationInput {
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  offset?: number;
  endOffset?: number;
}

export class InvalidSourceLocationError extends Error {
  public readonly field: string;

  constructor(field: string) {
    super('Invalid source location');
    this.name = new.target.name;
    this.field = field;
  }
}

export function createSourceLocation(input: SourceLocationInput = {}): SourceLocation {
  const file = input.file && input.file.length > 0 ? input.file : INLINE_SOURCE_FILE;
  const line = input.line ?? 1;
  const column = input.column ?? 1;

  requirePositiveInteger(line, 'line');
  requirePositiveInteger(column, 'column');

  const location: SourceLocation = { file, line, column };

  if (input.endLine !== undefined || input.endColumn !== undefined) {
    if (input.endLine === undefined) {
      throw new InvalidSourceLocationError('endLine');
    }
    if (input.endColumn === undefined) {
      throw new InvalidSourceLocationError('endColumn');
    }

    requirePositiveInteger(input.endLine, 'endLine');
    requirePositiveInteger(input.endColumn, 'endColumn');

    if (
      input.endLine < line ||
      (input.endLine === line && input.endColumn < column)
    ) {
      throw new InvalidSourceLocationError('endColumn');
    }

    location.endLine = input.endLine;
    location.endColumn = input.endColumn;
  }

  if (input.offset !== undefined) {
    requireNonNegativeInteger(input.offset, 'offset');
    location.offset = input.offset;
  }

  if (input.endOffset !== undefined) {
    requireNonNegativeInteger(input.endOffset, 'endOffset');
    if (input.offset !== undefined && input.endOffset < input.offset) {
      throw new InvalidSourceLocationError('endOffset');
    }
    location.endOffset = input.endOffset;
  }

  return location;
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvalidSourceLocationError(field);
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidSourceLocationError(field);
  }
}
