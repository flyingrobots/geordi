import type { JsonObject, JsonValue } from '@flyingrobots/geordi-core';

/** Callback that reports a boundary failure and never returns. */
export type DecodeFail = (path: string, detail: string) => never;

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function objectAt(
  value: JsonValue | undefined,
  path: string,
  fields: readonly string[],
  fail: DecodeFail,
): JsonObject {
  if (!isJsonObject(value)) {
    return fail(path, 'expected an object');
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) {
      return fail(`${path}.${key}`, 'unknown field');
    }
  }
  for (const field of fields) {
    if (value[field] === undefined) {
      return fail(`${path}.${field}`, 'missing required field');
    }
  }
  return value;
}

export function arrayAt(
  value: JsonValue | undefined,
  path: string,
  fail: DecodeFail,
): readonly JsonValue[] {
  if (!isJsonArray(value)) {
    return fail(path, 'expected an array');
  }
  // Array.from turns holes into explicit undefined elements, so a sparse array
  // handed in by a caller fails each element check instead of being skipped by
  // map/forEach. JSON text cannot produce a hole; a programmatic caller can.
  return Array.from(value);
}

export function stringAt(value: JsonValue | undefined, path: string, fail: DecodeFail): string {
  if (typeof value !== 'string') {
    return fail(path, 'expected a string');
  }
  return value;
}

export function booleanAt(value: JsonValue | undefined, path: string, fail: DecodeFail): boolean {
  if (typeof value !== 'boolean') {
    return fail(path, 'expected a boolean');
  }
  return value;
}

export function integerAt(
  value: JsonValue | undefined,
  path: string,
  min: number,
  max: number,
  fail: DecodeFail,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    Object.is(value, -0) ||
    value < min ||
    value > max
  ) {
    return fail(path, `expected an integer in ${String(min)}..${String(max)}`);
  }
  return value;
}

export function literalAt(
  value: JsonValue | undefined,
  expected: string,
  path: string,
  fail: DecodeFail,
): void {
  if (value !== expected) {
    fail(path, `expected "${expected}"`);
  }
}
