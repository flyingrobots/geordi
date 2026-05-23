import type { JsonObject, JsonValue } from '../domain/models/GeordiScene.js';

export interface CanonicalJsonOptions {
  readonly space?: number | string;
}

export interface JsonPort {
  parse(source: string): JsonValue;
  stringify(value: JsonValue, options?: CanonicalJsonOptions): string;
  normalize(value: JsonValue): JsonValue;
}

export class GeordiJsonParseError extends Error {
  constructor() {
    super('Invalid JSON input');
    this.name = new.target.name;
  }
}

export class GeordiJsonNonFiniteNumberError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('JSON numbers must be finite');
    this.name = new.target.name;
    this.path = path;
  }
}

export class GeordiJsonStringifyError extends Error {
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
      throw new GeordiJsonParseError();
    }

    return normalizeJsonValue(parsed);
  },

  stringify(value: JsonValue, options: CanonicalJsonOptions = {}): string {
    const normalized = normalizeJsonValue(value);
    try {
      return JSON.stringify(normalized, null, options.space);
    } catch {
      throw new GeordiJsonStringifyError();
    }
  },

  normalize(value: JsonValue): JsonValue {
    return normalizeJsonValue(value);
  },
};

export function parseJsonValue(source: string): JsonValue {
  return canonicalJsonPort.parse(source);
}

export function stringifyCanonicalJson(
  value: JsonValue,
  options: CanonicalJsonOptions = {},
): string {
  return canonicalJsonPort.stringify(value, options);
}

export function normalizeJsonValue(value: JsonValue, path = '$'): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new GeordiJsonNonFiniteNumberError(path);
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (isJsonArray(value)) {
    return value.map((item, index) => normalizeJsonValue(item, `${path}[${index}]`));
  }

  const object = value;
  const normalized: Record<string, JsonValue | undefined> = {};
  const keys = Object.keys(object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const key of keys) {
    const item = property(object, key);
    if (item !== undefined) {
      normalized[key] = normalizeJsonValue(item, `${path}.${key}`);
    }
  }

  return normalized;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function property(object: JsonObject, key: string): JsonValue | undefined {
  return object[key];
}
