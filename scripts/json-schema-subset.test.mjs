// Tests for scripts/lib/json-schema-subset.mjs: the JSON Schema 2020-12 subset
// that the contract gate and its tests validate with. It refuses a keyword it
// does not implement instead of ignoring it, so a schema cannot quietly mean
// more than the validator checks.
//
//   node --test scripts/json-schema-subset.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JsonSchemaViolationError, UnsupportedJsonSchemaError, validateJsonSchema } from './lib/json-schema-subset.mjs';

function invalid(schema, value, pattern) {
  assert.throws(() => validateJsonSchema(schema, value), (error) => error instanceof JsonSchemaViolationError && pattern.test(error.message));
}

test('type, const and enum', () => {
  validateJsonSchema({ type: 'integer' }, 3);
  validateJsonSchema({ type: 'integer' }, 3.0);
  invalid({ type: 'integer' }, 3.5, /integer/u);
  invalid({ type: 'string' }, 1, /string/u);
  validateJsonSchema({ type: ['string', 'null'] }, null);
  invalid({ const: 'a' }, 'b', /const/u);
  validateJsonSchema({ enum: [1, 'x', null] }, 'x');
  invalid({ enum: [1, 2] }, 3, /enum/u);
  invalid({ const: { a: [1] } }, { a: [2] }, /const/u);
});

test('objects: required, properties and additionalProperties', () => {
  const schema = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { type: 'string' } } };
  validateJsonSchema(schema, { a: 'x' });
  invalid(schema, {}, /missing a/u);
  invalid(schema, { a: 'x', b: 1 }, /unexpected b/u);
  invalid(schema, { a: 1 }, /\$\.a/u);
  validateJsonSchema({ type: 'object', additionalProperties: { type: 'integer' } }, { x: 1 });
  invalid({ type: 'object', additionalProperties: { type: 'integer' } }, { x: 'no' }, /\$\.x/u);
});

test('arrays: items, prefixItems, bounds and uniqueItems', () => {
  validateJsonSchema({ type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 2 }, [1, 2]);
  invalid({ type: 'array', minItems: 1 }, [], /fewer/u);
  invalid({ type: 'array', maxItems: 1 }, [1, 2], /more/u);
  invalid({ type: 'array', items: { type: 'integer' } }, [1, 'x'], /\$\[1\]/u);
  invalid({ type: 'array', uniqueItems: true }, [{ a: 1 }, { a: 1 }], /unique/u);
  validateJsonSchema({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'integer' } }, ['a', 1, 2]);
  invalid({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'integer' } }, ['a', 'b'], /\$\[1\]/u);
});

test('numbers and strings: bounds and patterns', () => {
  invalid({ minimum: 1 }, 0, /minimum/u);
  invalid({ maximum: 1 }, 2, /maximum/u);
  invalid({ exclusiveMinimum: 1 }, 1, /exclusiveMinimum/u);
  invalid({ minLength: 2 }, 'a', /shorter/u);
  invalid({ maxLength: 1 }, 'ab', /longer/u);
  invalid({ pattern: '^a+$' }, 'ab', /pattern/u);
  // Bounds of another type do not apply.
  validateJsonSchema({ minLength: 1 }, 12);
});

test('composition and references', () => {
  const schema = {
    $defs: { a: { type: 'object', required: ['kind'], properties: { kind: { const: 'a' } } }, b: { type: 'object', required: ['kind'], properties: { kind: { const: 'b' } } } },
    oneOf: [{ $ref: '#/$defs/a' }, { $ref: '#/$defs/b' }],
  };
  validateJsonSchema(schema, { kind: 'a' });
  invalid(schema, { kind: 'c' }, /oneOf/u);
  invalid({ oneOf: [{ type: 'integer' }, { minimum: 0 }] }, 1, /oneOf/u);
  validateJsonSchema({ anyOf: [{ type: 'integer' }, { minimum: 0 }] }, 1);
  invalid({ allOf: [{ type: 'integer' }, { minimum: 2 }] }, 1, /minimum/u);
  validateJsonSchema({ not: { type: 'string' } }, 1);
  invalid({ not: { type: 'string' } }, 'x', /not/u);
});

test('annotations are ignored and unknown keywords are refused', () => {
  validateJsonSchema({ $schema: 'x', $id: 'y', title: 't', description: 'd', 'x-schema-id': 'z', $comment: 'c', examples: [] }, 1);
  assert.throws(() => validateJsonSchema({ unevaluatedProperties: false }, {}), UnsupportedJsonSchemaError);
  assert.throws(() => validateJsonSchema({ $ref: 'https://example.invalid/x' }, {}), UnsupportedJsonSchemaError);
});
