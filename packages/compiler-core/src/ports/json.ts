import {
  canonicalJsonPort as coreCanonicalJsonPort,
  GeordiJsonNonFiniteNumberError,
  GeordiJsonParseError,
  GeordiJsonStringifyError,
  normalizeJsonValue as normalizeCoreJsonValue,
  parseJsonValue as parseCoreJsonValue,
  stringifyCanonicalJson as stringifyCoreCanonicalJson,
  type CanonicalJsonOptions,
} from '@flyingrobots/geordi-core';
import type { JsonValue } from '../types/json.js';

export type { CanonicalJsonOptions, JsonPort } from '@flyingrobots/geordi-core';

export {
  GeordiJsonNonFiniteNumberError,
  GeordiJsonParseError,
  GeordiJsonStringifyError,
  GeordiJsonNonFiniteNumberError as JsonNonFiniteNumberError,
  GeordiJsonParseError as JsonParseError,
  GeordiJsonStringifyError as JsonSerializationError,
  GeordiJsonStringifyError as JsonStringifyError,
};

export const canonicalJsonPort = {
  parse(source: string): JsonValue {
    return parseJsonValue(source);
  },

  stringify(value: JsonValue, options?: CanonicalJsonOptions): string {
    return stringifyCanonicalJson(value, options);
  },

  normalize(value: JsonValue): JsonValue {
    return normalizeJsonValue(value);
  },
};

export function parseJsonValue(source: string): JsonValue {
  return parseCoreJsonValue(source) as JsonValue;
}

export function stringifyCanonicalJson(
  value: JsonValue,
  options: CanonicalJsonOptions = {},
): string {
  return stringifyCoreCanonicalJson(value, options);
}

export function normalizeJsonValue(value: JsonValue, path = '$'): JsonValue {
  return normalizeCoreJsonValue(value, path) as JsonValue;
}

export const coreJsonPort = coreCanonicalJsonPort;
