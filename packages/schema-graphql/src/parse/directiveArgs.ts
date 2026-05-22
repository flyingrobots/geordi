import { Kind, type ArgumentNode, type DirectiveNode, type ValueNode } from 'graphql';
import { GeordiErrorCode, ParseError } from '@flyingrobots/geordi-compiler-core';
import type { Diagnostic, JsonObject } from '@flyingrobots/geordi-compiler-core';
import { nodeSourceRef } from './sourceRef.js';

export interface DirectiveArgReaderContext {
  directive: DirectiveNode;
  directiveName: string;
  diagnostics: Diagnostic[];
  filename?: string;
  owner: string;
}

interface DirectiveArgValidationContext extends DirectiveArgReaderContext {
  argName: string;
}

export function readRequiredStringArg(
  context: DirectiveArgReaderContext,
  argName: string,
): string | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    pushMissingArg(context, argName);
    return undefined;
  }

  if (arg.value.kind === Kind.STRING) {
    return arg.value.value;
  }

  pushInvalidType({ ...context, argName }, 'string', arg.value);
  return undefined;
}

export function readOptionalStringArg(
  context: DirectiveArgReaderContext,
  argName: string,
): string | undefined {
  return readStringArg(context, argName);
}

export function readRequiredIntArg(
  context: DirectiveArgReaderContext,
  argName: string,
): number | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    pushMissingArg(context, argName);
    return undefined;
  }

  if (arg.value.kind === Kind.INT) {
    const value = parseSafeInteger(arg.value.value);
    if (value !== undefined) {
      return value;
    }

    pushInvalidType({ ...context, argName }, 'safe integer', arg.value, 'unsafe integer');
    return undefined;
  }

  pushInvalidType({ ...context, argName }, 'integer', arg.value);
  return undefined;
}

export function readOptionalIntArg(
  context: DirectiveArgReaderContext,
  argName: string,
): number | undefined {
  return readIntArg(context, argName);
}

export function readOptionalFloatArg(
  context: DirectiveArgReaderContext,
  argName: string,
): number | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    return undefined;
  }

  if (arg.value.kind === Kind.INT || arg.value.kind === Kind.FLOAT) {
    const value = parseFiniteNumber(arg.value.value);
    if (value !== undefined) {
      return value;
    }

    pushInvalidType({ ...context, argName }, 'finite number', arg.value, 'non-finite number');
    return undefined;
  }

  pushInvalidType({ ...context, argName }, 'number', arg.value);
  return undefined;
}

export function readOptionalBooleanArg(
  context: DirectiveArgReaderContext,
  argName: string,
): boolean | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    return undefined;
  }

  if (arg.value.kind === Kind.BOOLEAN) {
    return arg.value.value;
  }

  pushInvalidType({ ...context, argName }, 'boolean', arg.value);
  return undefined;
}

export function readRequiredEnumArg(
  context: DirectiveArgReaderContext,
  argName: string,
): string | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    pushMissingArg(context, argName);
    return undefined;
  }

  if (arg.value.kind === Kind.ENUM) {
    return arg.value.value;
  }

  pushInvalidType({ ...context, argName }, 'enum', arg.value);
  return undefined;
}

function readStringArg(
  context: DirectiveArgReaderContext,
  argName: string,
): string | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    return undefined;
  }

  if (arg.value.kind === Kind.STRING) {
    return arg.value.value;
  }

  pushInvalidType({ ...context, argName }, 'string', arg.value);
  return undefined;
}

function readIntArg(
  context: DirectiveArgReaderContext,
  argName: string,
): number | undefined {
  const arg = findArg(context, argName);
  if (!arg) {
    return undefined;
  }

  if (arg.value.kind === Kind.INT) {
    const value = parseSafeInteger(arg.value.value);
    if (value !== undefined) {
      return value;
    }

    pushInvalidType({ ...context, argName }, 'safe integer', arg.value, 'unsafe integer');
    return undefined;
  }

  pushInvalidType({ ...context, argName }, 'integer', arg.value);
  return undefined;
}

function findArg(
  context: DirectiveArgReaderContext,
  argName: string,
): ArgumentNode | undefined {
  return context.directive.arguments?.find((candidate) => candidate.name.value === argName);
}

function pushMissingArg(context: DirectiveArgReaderContext, argName: string): void {
  context.diagnostics.push(
    new ParseError(
      GeordiErrorCode.E_DIRECTIVE_ARG_MISSING,
      `${context.owner} requires @${context.directiveName} argument ${argName}`,
      {
        location: nodeSourceRef(context.directive, context.filename),
        details: directiveArgDetails(context.directiveName, argName, 'present', 'missing'),
      },
    ).toDiagnostic(),
  );
}

function pushInvalidType(
  context: DirectiveArgValidationContext,
  expected: string,
  value: ValueNode,
  actual = valueKindLabel(value),
): void {
  context.diagnostics.push(
    new ParseError(
      GeordiErrorCode.E_DIRECTIVE_ARG_INVALID_TYPE,
      `${context.owner} @${context.directiveName} argument ${context.argName} must be ${expected}`,
      {
        location: nodeSourceRef(value, context.filename),
        details: directiveArgDetails(
          context.directiveName,
          context.argName,
          expected,
          actual,
        ),
      },
    ).toDiagnostic(),
  );
}

function parseFiniteNumber(raw: string): number | undefined {
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseSafeInteger(raw: string): number | undefined {
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

function directiveArgDetails(
  directiveName: string,
  argName: string,
  expected: string,
  actual: string,
): JsonObject {
  return {
    directive: directiveName,
    argument: argName,
    expected,
    actual,
  };
}

function valueKindLabel(value: ValueNode): string {
  switch (value.kind) {
    case Kind.STRING:
      return 'string';
    case Kind.INT:
      return 'integer';
    case Kind.FLOAT:
      return 'float';
    case Kind.BOOLEAN:
      return 'boolean';
    case Kind.ENUM:
      return 'enum';
    case Kind.LIST:
      return 'list';
    case Kind.OBJECT:
      return 'object';
    case Kind.NULL:
      return 'null';
    case Kind.VARIABLE:
      return 'variable';
  }
}
