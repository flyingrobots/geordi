import type { JsonObject, JsonValue } from '../types/json.js';

export interface CanonicalJsonOptions {
  space?: number | string;
}

export interface JsonPort {
  parse(source: string): JsonValue;
  stringify(value: JsonValue, options?: CanonicalJsonOptions): string;
  normalize(value: JsonValue): JsonValue;
}

export class JsonParseError extends Error {
  constructor() {
    super('Invalid JSON input');
    this.name = new.target.name;
  }
}

export class JsonNonFiniteNumberError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('JSON numbers must be finite');
    this.name = new.target.name;
    this.path = path;
  }
}

export class JsonSerializationError extends Error {
  constructor() {
    super('Canonical JSON serialization failed');
    this.name = new.target.name;
  }
}

export const canonicalJsonPort: JsonPort = {
  parse(source: string): JsonValue {
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(source) as JsonValue;
    } catch {
      throw new JsonParseError();
    }

    return normalizeJsonValue(parsed);
  },

  stringify(value: JsonValue, options: CanonicalJsonOptions = {}): string {
    const normalized = normalizeJsonValue(value);
    return JSON.stringify(normalized, null, options.space);
  },

  normalize(value: JsonValue): JsonValue {
    return normalizeJsonValue(value);
  },
};

export function parseJsonValue(source: string): JsonValue {
  return canonicalJsonPort.parse(source);
}

export function stringifyCanonicalJson(value: JsonValue, options: CanonicalJsonOptions = {}): string {
  return canonicalJsonPort.stringify(value, options);
}

export function normalizeJsonValue(value: JsonValue, path = '$'): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new JsonNonFiniteNumberError(path);
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeJsonValue(item, `${path}[${index}]`));
  }

  const normalized: JsonObject = {};
  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const key of keys) {
    const item = value[key];
    if (item !== undefined) {
      normalized[key] = normalizeJsonValue(item, `${path}.${key}`);
    }
  }

  return normalized;
}
