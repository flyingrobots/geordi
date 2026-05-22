import type { Diagnostic, SourceLocation } from '../types/index.js';
import type { GeordiErrorCodeValue } from './codes.js';
import type { JsonObject } from '../types/json.js';

export class ExternalErrorCause extends Error {
  public readonly externalName: string;

  constructor(externalName: string, externalMessage: string) {
    super(externalMessage);
    this.name = new.target.name;
    this.externalName = externalName;
  }
}

export class NonErrorThrownCause extends Error {
  public readonly valueKind: string;

  constructor(valueKind: string) {
    super('A non-error value was thrown');
    this.name = new.target.name;
    this.valueKind = valueKind;
  }
}

export type CompilerErrorCause = CompilerError | ExternalErrorCause | NonErrorThrownCause;
export type ThrownValue = object | string | number | boolean | bigint | symbol | null | undefined;

export interface CompilerErrorOptions {
  location?: SourceLocation;
  hint?: string;
  details?: JsonObject;
  cause?: CompilerErrorCause;
}

export class CompilerError extends Error {
  public readonly code: GeordiErrorCodeValue;
  public readonly location?: SourceLocation;
  public readonly hint?: string;
  public readonly details?: JsonObject;
  public override readonly cause?: CompilerErrorCause;
  public readonly severity: 'error' | 'warning' | 'info';

  constructor(
    code: GeordiErrorCodeValue,
    message: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    options: CompilerErrorOptions = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.severity = severity;
    this.location = options.location;
    this.hint = options.hint;
    this.details = options.details;
    this.cause = options.cause;
  }

  toDiagnostic(): Diagnostic {
    return {
      code: this.code,
      severity: this.severity,
      message: this.message,
      location: this.location,
      hint: this.hint,
      details: this.details,
    };
  }
}

export function normalizeCompilerErrorCause(cause: ThrownValue): CompilerErrorCause {
  if (cause instanceof CompilerError) {
    return cause;
  }

  if (cause instanceof Error) {
    return new ExternalErrorCause(cause.name, cause.message);
  }

  return new NonErrorThrownCause(cause === null ? 'null' : typeof cause);
}
