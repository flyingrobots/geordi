import { describe, expect, it } from 'vitest';
import {
  GeordiJsonNonFiniteNumberError,
  GeordiJsonParseError,
  parseJsonValue,
  stringifyCanonicalJson,
} from './json';
import type { JsonObject } from '../domain/models/GeordiScene';

describe('canonical JSON port', () => {
  it('sorts object keys lexicographically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(stringifyCanonicalJson(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts keys in deeply nested objects', () => {
    const parsed = parseJsonValue('{"z":{"y":1,"b":2},"a":{"x":3,"c":4}}') as JsonObject;
    expect(Object.keys(parsed)).toEqual(['a', 'z']);

    const a = parsed.a as JsonObject;
    const z = parsed.z as JsonObject;
    expect(Object.keys(a)).toEqual(['c', 'x']);
    expect(Object.keys(z)).toEqual(['b', 'y']);
  });

  it('produces identical output for same object regardless of insertion order', () => {
    const a = { c: 3, a: 1, b: 2 };
    const b = { a: 1, b: 2, c: 3 };
    expect(stringifyCanonicalJson(a)).toBe(stringifyCanonicalJson(b));
  });

  it('normalizes negative zero to zero', () => {
    expect(stringifyCanonicalJson({ value: -0 })).toBe('{"value":0}');
  });

  it('rejects non-finite numbers instead of silently changing them', () => {
    expect(() => stringifyCanonicalJson({ value: Number.NaN })).toThrow(
      GeordiJsonNonFiniteNumberError,
    );
    expect(() => stringifyCanonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(
      GeordiJsonNonFiniteNumberError,
    );
    expect(() => stringifyCanonicalJson({ value: Number.NEGATIVE_INFINITY })).toThrow(
      GeordiJsonNonFiniteNumberError,
    );
  });

  it('rejects nested non-finite numbers with their JSON path', () => {
    expect(() => stringifyCanonicalJson({ nested: [{ value: Number.NaN }] })).toThrow(
      GeordiJsonNonFiniteNumberError,
    );

    let path = '';
    try {
      stringifyCanonicalJson({ nested: [{ value: Number.NaN }] });
    } catch (cause) {
      if (cause instanceof GeordiJsonNonFiniteNumberError) {
        path = cause.path;
      }
    }
    expect(path).toBe('$.nested[0].value');
  });

  it('uses deterministic ECMAScript number spelling for finite floats', () => {
    expect(stringifyCanonicalJson({ value: 5.123402 })).toBe('{"value":5.123402}');
    expect(stringifyCanonicalJson({ value: 0.000001 })).toBe('{"value":0.000001}');
  });

  it('does not round or fixed-point scale ordinary finite numbers', () => {
    expect(stringifyCanonicalJson({ value: 5123402 })).toBe('{"value":5123402}');
    expect(stringifyCanonicalJson({ value: 5.123402 })).not.toBe('{"value":5123402}');
  });

  it('preserves array order while canonicalizing nested object keys', () => {
    expect(stringifyCanonicalJson([{ z: 1, a: 2 }, { b: 3 }])).toBe(
      '[{"a":2,"z":1},{"b":3}]',
    );
  });

  it('throws a custom parse error for invalid JSON input', () => {
    expect(() => parseJsonValue('{not json')).toThrow(GeordiJsonParseError);
  });
});
