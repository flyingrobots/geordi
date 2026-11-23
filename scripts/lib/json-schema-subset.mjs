// A JSON Schema 2020-12 validator for the subset of keywords Geordi's schemas use.
//
// It refuses a keyword it does not implement instead of ignoring it, so a schema can never
// quietly promise more than this validator checks. Used by the contract gate
// (scripts/contract-gate.mjs) and by the tests that validate real output against declared
// schemas. References resolve only within the same document (`#/...`).
//
// Numbers are JavaScript numbers: integers beyond 2^53 lose precision. The schemas that use
// this validator bound their integers to the safe range.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJson, stringifyJson } from './contract-gate/json.mjs';

export class JsonSchemaViolationError extends Error {
  constructor(path, detail) {
    super(`${path}: ${detail}`);
    this.name = new.target.name;
    this.path = path;
  }
}

export class UnsupportedJsonSchemaError extends Error {
  constructor(pointer, keyword) {
    super(`unsupported JSON Schema keyword ${keyword} at ${pointer}`);
    this.name = new.target.name;
  }
}

/** Keywords that only annotate; they never change validity. */
const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'default', '$defs']);

/** Keywords that hold subschemas; validateAt applies them after the value checks. */
const STRUCTURAL = new Set(['properties', 'additionalProperties', 'items', 'prefixItems', '$ref', 'oneOf', 'anyOf', 'allOf', 'not']);

const VALIDATORS = {
  type: checkType,
  const: (schema, value, path) => {
    if (!jsonEqual(schema.const, value)) {
      fail(path, `expected const ${stringifyJson(schema.const)}`);
    }
  },
  enum: (schema, value, path) => {
    if (!schema.enum.some((option) => jsonEqual(option, value))) {
      fail(path, `${stringifyJson(value)} is not in enum ${stringifyJson(schema.enum)}`);
    }
  },
  required: (schema, value, path) => {
    if (isObject(value)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) {
          fail(path, `missing ${key}`);
        }
      }
    }
  },
  minItems: (schema, value, path) => {
    if (Array.isArray(value) && value.length < schema.minItems) {
      fail(path, `fewer than ${String(schema.minItems)} items`);
    }
  },
  maxItems: (schema, value, path) => {
    if (Array.isArray(value) && value.length > schema.maxItems) {
      fail(path, `more than ${String(schema.maxItems)} items`);
    }
  },
  uniqueItems: (schema, value, path) => {
    if (schema.uniqueItems && Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        for (let j = i + 1; j < value.length; j += 1) {
          if (jsonEqual(value[i], value[j])) {
            fail(path, `items ${String(i)} and ${String(j)} are not unique`);
          }
        }
      }
    }
  },
  minimum: (schema, value, path) => numberBound(value, path, 'minimum', (v) => v >= schema.minimum),
  maximum: (schema, value, path) => numberBound(value, path, 'maximum', (v) => v <= schema.maximum),
  exclusiveMinimum: (schema, value, path) => numberBound(value, path, 'exclusiveMinimum', (v) => v > schema.exclusiveMinimum),
  exclusiveMaximum: (schema, value, path) => numberBound(value, path, 'exclusiveMaximum', (v) => v < schema.exclusiveMaximum),
  minLength: (schema, value, path) => {
    if (typeof value === 'string' && [...value].length < schema.minLength) {
      fail(path, `shorter than ${String(schema.minLength)}`);
    }
  },
  maxLength: (schema, value, path) => {
    if (typeof value === 'string' && [...value].length > schema.maxLength) {
      fail(path, `longer than ${String(schema.maxLength)}`);
    }
  },
  pattern: (schema, value, path) => {
    if (typeof value === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
      fail(path, `does not match pattern ${schema.pattern}`);
    }
  },
};

function fail(path, detail) {
  throw new JsonSchemaViolationError(path, detail);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberBound(value, path, keyword, holds) {
  if (typeof value === 'number' && !holds(value)) {
    fail(path, `${String(value)} violates ${keyword}`);
  }
}

function typeOf(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function checkType(schema, value, path) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = types.some((type) => {
    if (type === 'integer') {
      return typeof value === 'number' && Number.isInteger(value);
    }
    return typeOf(value) === type;
  });
  if (!matches) {
    fail(path, `expected ${types.join(' or ')}, found ${typeOf(value)}`);
  }
}

/** Structural JSON equality: object key order does not matter. */
export function jsonEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => jsonEqual(item, right[index]));
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) {
      return false;
    }
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]));
  }
  return left === right;
}

function resolveRef(root, ref, pointer) {
  if (!ref.startsWith('#')) {
    throw new UnsupportedJsonSchemaError(pointer, `$ref ${ref} (only same-document references are supported)`);
  }
  let target = root;
  for (const raw of ref.slice(1).split('/').slice(1)) {
    const segment = decodeURIComponent(raw).replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (target === null || typeof target !== 'object' || !Object.hasOwn(target, segment)) {
      throw new UnsupportedJsonSchemaError(pointer, `$ref ${ref} (unresolved)`);
    }
    target = target[segment];
  }
  return target;
}

function validateAt(root, schema, value, path, pointer) {
  if (schema === true) {
    return;
  }
  if (schema === false) {
    fail(path, 'no value is allowed here');
  }
  for (const keyword of Object.keys(schema)) {
    if (!ANNOTATIONS.has(keyword) && !STRUCTURAL.has(keyword) && !Object.hasOwn(VALIDATORS, keyword) && !keyword.startsWith('x-')) {
      throw new UnsupportedJsonSchemaError(pointer, keyword);
    }
  }
  for (const [keyword, check] of Object.entries(VALIDATORS)) {
    if (Object.hasOwn(schema, keyword)) {
      check(schema, value, path);
    }
  }
  if (schema.$ref !== undefined) {
    validateAt(root, resolveRef(root, schema.$ref, pointer), value, path, schema.$ref);
  }
  if (isObject(value)) {
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateAt(root, properties[key], item, `${path}.${key}`, `${pointer}/properties/${key}`);
      } else if (schema.additionalProperties === false) {
        fail(path, `unexpected ${key}`);
      } else if (isObject(schema.additionalProperties)) {
        validateAt(root, schema.additionalProperties, item, `${path}.${key}`, `${pointer}/additionalProperties`);
      }
    }
  }
  if (Array.isArray(value)) {
    const prefix = schema.prefixItems ?? [];
    value.forEach((item, index) => {
      if (index < prefix.length) {
        validateAt(root, prefix[index], item, `${path}[${String(index)}]`, `${pointer}/prefixItems/${String(index)}`);
      } else if (schema.items !== undefined) {
        validateAt(root, schema.items, item, `${path}[${String(index)}]`, `${pointer}/items`);
      }
    });
  }
  if (schema.allOf !== undefined) {
    schema.allOf.forEach((branch, index) => validateAt(root, branch, value, path, `${pointer}/allOf/${String(index)}`));
  }
  const passes = (branch, at) => {
    try {
      validateAt(root, branch, value, path, at);
      return true;
    } catch (error) {
      if (error instanceof JsonSchemaViolationError) {
        return false;
      }
      throw error;
    }
  };
  if (schema.anyOf !== undefined && !schema.anyOf.some((branch, index) => passes(branch, `${pointer}/anyOf/${String(index)}`))) {
    fail(path, 'matches no anyOf branch');
  }
  if (schema.oneOf !== undefined) {
    const matched = schema.oneOf.filter((branch, index) => passes(branch, `${pointer}/oneOf/${String(index)}`)).length;
    if (matched !== 1) {
      fail(path, `matches ${String(matched)} oneOf branches, not exactly one`);
    }
  }
  if (schema.not !== undefined && passes(schema.not, `${pointer}/not`)) {
    fail(path, 'matches the schema under not');
  }
}

/** Throw UnsupportedJsonSchemaError if any subschema, reached or not, uses an unknown keyword. */
export function assertSupportedKeywords(schema, pointer = '#') {
  if (typeof schema !== 'object' || schema === null) {
    return;
  }
  for (const keyword of Object.keys(schema)) {
    if (!ANNOTATIONS.has(keyword) && !STRUCTURAL.has(keyword) && !Object.hasOwn(VALIDATORS, keyword) && !keyword.startsWith('x-')) {
      throw new UnsupportedJsonSchemaError(pointer, keyword);
    }
  }
  for (const key of ['properties', '$defs']) {
    for (const [name, child] of Object.entries(schema[key] ?? {})) {
      assertSupportedKeywords(child, `${pointer}/${key}/${name}`);
    }
  }
  for (const key of ['additionalProperties', 'items', 'not']) {
    assertSupportedKeywords(schema[key], `${pointer}/${key}`);
  }
  for (const key of ['prefixItems', 'oneOf', 'anyOf', 'allOf']) {
    (schema[key] ?? []).forEach((child, index) => assertSupportedKeywords(child, `${pointer}/${key}/${String(index)}`));
  }
}

/**
 * Validate `value` against `schema`. Throws JsonSchemaViolationError naming the first
 * violation, or UnsupportedJsonSchemaError when the schema uses a keyword outside the subset.
 */
export function validateJsonSchema(schema, value) {
  validateAt(schema, schema, value, '$', '#');
}

/** Every `*.schema.json` in a directory, keyed by its `x-schema-id`. */
export function loadSchemaDirectory(dir) {
  const schemas = new Map();
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.schema.json')).sort()) {
    const schema = parseJson(readFileSync(join(dir, name), 'utf8'));
    schemas.set(schema['x-schema-id'], schema);
  }
  return schemas;
}
