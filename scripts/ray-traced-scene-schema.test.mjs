// Tests for the JSON Schema of geordi-ray-traced-scene/1
// (schemas/geordi-ray-traced-scene/1/scene.schema.json, flyingrobots/geordi#217).
// Every positive fixture must validate, and every failure fixture that the Rust
// validator rejects at its shape (parse) stage must not. The schema is not the
// whole validator: the validate-stage rules it cannot express are listed below
// and in docs/ray-traced-scene-profile.md, and this test pins that boundary.
//
//   node --test scripts/ray-traced-scene-schema.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { JsonSchemaViolationError, validateJsonSchema } from './lib/json-schema-subset.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const FIXTURES = join(REPO_ROOT, 'fixtures', 'ray-traced-scene');
const SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, 'schemas', 'geordi-ray-traced-scene', '1', 'scene.schema.json'), 'utf8'));
const EXPECTED = JSON.parse(readFileSync(join(FIXTURES, 'failures', 'expected-diagnostics.json'), 'utf8'));

/**
 * Parse-stage failures that are about the JSON text, not its data: JSON Schema sees the
 * parsed value, in which `1.779033704e9` and `1779033704.0` are the integer 1779033704.
 * `-0` is the integer 0 (this fixture still fails the schema, through `film.width >= 1`).
 */
const TEXT_LEVEL = new Set([
  'json-invalid.rt-scene.geordi.json',
  'number-exponent.rt-scene.geordi.json',
  'number-fraction.rt-scene.geordi.json',
  'number-negative-zero.rt-scene.geordi.json',
]);

/** Validate-stage diagnostics that the schema also enforces (constants, ranges, patterns, shape). */
const EXPRESSED = new Set([
  'GEORDI_E_RT_ALBEDO_OUT_OF_RANGE',
  'GEORDI_E_RT_CAMERA_UNSUPPORTED',
  'GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE',
  'GEORDI_E_RT_ID_EMPTY',
  'GEORDI_E_RT_INTEGRATOR_UNSUPPORTED',
  'GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE',
  'GEORDI_E_RT_LIGHT_FIELD_INVALID',
  'GEORDI_E_RT_LIGHT_UNSUPPORTED',
  'GEORDI_E_RT_MATERIAL_UNSUPPORTED',
  'GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE',
  'GEORDI_E_RT_MESH_COUNT_INVALID',
  'GEORDI_E_RT_MESH_HASH_INVALID',
  'GEORDI_E_RT_MESH_LAYOUT_UNSUPPORTED',
  'GEORDI_E_RT_NUMERIC_PROFILE_UNSUPPORTED',
  'GEORDI_E_RT_OUTPUT_UNSUPPORTED',
  'GEORDI_E_RT_RADIANCE_OUT_OF_RANGE',
  'GEORDI_E_RT_RECONSTRUCTION_UNSUPPORTED',
  'GEORDI_E_RT_REQUIREMENT_DUPLICATE',
  'GEORDI_E_RT_REQUIREMENT_UNKNOWN',
  'GEORDI_E_RT_SAMPLER_IDENTITY_INVALID',
  'GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID',
  'GEORDI_E_RT_SCENE_VERSION_UNSUPPORTED',
  'GEORDI_E_RT_SEED_OUT_OF_RANGE',
  'GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE',
  'GEORDI_E_RT_TONE_CURVE_IDENTITY_INVALID',
]);

/**
 * Validate-stage and asset-stage diagnostics the schema does not express: cross-field rules
 * (uniqueness, references, counts of a kind, requirements implied by content), exact
 * arithmetic (camera degeneracy, normalisation, trace domain, bounds order, primitive sums),
 * the mesh path rule, and anything that reads mesh bytes.
 */
const NOT_EXPRESSED = new Set([
  'GEORDI_E_RT_CAMERA_DEGENERATE',
  'GEORDI_E_RT_DIRECTIONAL_LIGHT_COUNT',
  'GEORDI_E_RT_ID_DUPLICATE',
  'GEORDI_E_RT_MATERIAL_REFERENCE_UNKNOWN',
  'GEORDI_E_RT_MESH_BOUNDS_INVALID',
  'GEORDI_E_RT_MESH_FILE_MISSING',
  'GEORDI_E_RT_MESH_HASH_MISMATCH',
  'GEORDI_E_RT_MESH_PATH_INVALID',
  'GEORDI_E_RT_MESH_REFERENCE_UNKNOWN',
  'GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED',
  'GEORDI_E_RT_REQUIREMENT_MISSING',
  'GEORDI_E_RT_SCENE_EMPTY',
  'GEORDI_E_RT_SKY_COUNT',
  'GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED',
  'GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED',
]);

function scene(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function rejects(document) {
  try {
    validateJsonSchema(SCHEMA, document);
    return false;
  } catch (error) {
    if (error instanceof JsonSchemaViolationError) {
      return true;
    }
    throw error;
  }
}

test('every positive fixture validates against the schema', () => {
  const positives = [
    join(FIXTURES, 'reference.rt-scene.geordi.json'),
    ...readdirSync(join(FIXTURES, 'negotiation')).map((name) => join(FIXTURES, 'negotiation', name)),
  ];
  assert.ok(positives.length >= 2);
  for (const path of positives) {
    validateJsonSchema(SCHEMA, scene(path));
  }
});

test('every shape-stage failure fixture is invalid against the schema', () => {
  const shape = Object.entries(EXPECTED).filter(([name, entry]) => entry.stage === 'parse' && !TEXT_LEVEL.has(name));
  assert.ok(shape.length >= 9, String(shape.length));
  for (const [name] of shape) {
    assert.ok(rejects(scene(join(FIXTURES, 'failures', name))), `${name} validates against the schema`);
  }
});

test('the old directional light field name is refused and the new one is required', () => {
  assert.ok(rejects(scene(join(FIXTURES, 'failures', 'sun-radiance-field.rt-scene.geordi.json'))));
  assert.ok(rejects(scene(join(FIXTURES, 'failures', 'sky-irradiance-field.rt-scene.geordi.json'))));
});

test('the schema enforces exactly the validate-stage rules it is documented to express', () => {
  const later = Object.entries(EXPECTED).filter(([, entry]) => entry.stage !== 'parse');
  for (const [name, entry] of later) {
    const rejected = rejects(scene(join(FIXTURES, 'failures', name)));
    if (EXPRESSED.has(entry.code)) {
      assert.ok(rejected, `${name} (${entry.code}) should be rejected by the schema`);
    } else {
      assert.ok(NOT_EXPRESSED.has(entry.code), `${entry.code} is in neither list`);
      assert.ok(!rejected, `${name} (${entry.code}) is rejected by the schema, but the code is listed as not expressed`);
    }
  }
});

test('the schema uses only keywords the validator implements', () => {
  // validateJsonSchema refuses an unknown keyword rather than ignoring it; validating the
  // reference scene walks every branch of the schema that the reference scene reaches, and
  // this walks the rest.
  const unknown = { ...SCHEMA, properties: { ...SCHEMA.properties, id: { type: 'string', unevaluatedProperties: false } } };
  assert.throws(() => validateJsonSchema(unknown, scene(join(FIXTURES, 'reference.rt-scene.geordi.json'))), /unevaluatedProperties/u);
});
