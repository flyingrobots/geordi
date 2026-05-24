import {
  canonicalJsonPort,
  GEORDI_CORE_PROFILE,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  isGeordiFeatureRequirement,
  type GeordiFeatureRequirement,
  type GeordiNumericProfile,
  type JsonObject,
  type JsonPort,
  type JsonValue,
} from '@flyingrobots/geordi-core';

export const RENDER_FIXTURE_VERSION = 'geordi-render-fixture/1' as const;
export const RENDER_FIXTURE_HASH_PREFIX = 'sha256:' as const;
export const RENDER_FIXTURE_HASH_HEX_LENGTH = 64 as const;
export const RENDER_FIXTURE_SOURCE_KIND_NONE = 'none' as const;
export const RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT = 'gpvue-draft' as const;
export const RENDER_FIXTURE_SOURCE_KIND_GPVUE = 'gpvue' as const;

export interface RenderFixtureManifestIssue extends JsonObject {
  readonly path: string;
  readonly message: string;
}

export interface RenderFixtureManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureManifestIssue[];
}

export interface RenderFixtureCanvas extends JsonObject {
  readonly height: number;
  readonly width: number;
}

export type RenderFixtureRgba = readonly [number, number, number, number];

export interface RenderFixturePixelProbe extends JsonObject {
  readonly id: string;
  readonly rgba: RenderFixtureRgba;
  readonly x: number;
  readonly y: number;
}

export interface RenderFixtureRuntimeProfile extends JsonObject {
  readonly irVersion: typeof GEORDI_IR_VERSION;
  readonly numericProfile: GeordiNumericProfile;
  readonly requires: readonly GeordiFeatureRequirement[];
}

export type RenderFixtureSourceKind =
  | typeof RENDER_FIXTURE_SOURCE_KIND_NONE
  | typeof RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT
  | typeof RENDER_FIXTURE_SOURCE_KIND_GPVUE;

export interface RenderFixtureNoSource extends JsonObject {
  readonly kind: typeof RENDER_FIXTURE_SOURCE_KIND_NONE;
}

export interface RenderFixtureGpvueDraftSource extends JsonObject {
  readonly kind: typeof RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT;
  readonly path: string;
}

export interface RenderFixtureGpvueSource extends JsonObject {
  readonly compiler: string;
  readonly compilerVersion: string;
  readonly kind: typeof RENDER_FIXTURE_SOURCE_KIND_GPVUE;
  readonly path: string;
}

export type RenderFixtureSource =
  | RenderFixtureNoSource
  | RenderFixtureGpvueDraftSource
  | RenderFixtureGpvueSource;

export interface RenderFixtureManifest extends JsonObject {
  readonly artifactHash: string;
  readonly canvas: RenderFixtureCanvas;
  readonly fixtureVersion: typeof RENDER_FIXTURE_VERSION;
  readonly id: string;
  readonly pixelProbes: readonly RenderFixturePixelProbe[];
  readonly receiptPath: string;
  readonly runtimeProfile: RenderFixtureRuntimeProfile;
  readonly scenePath: string;
  readonly source: RenderFixtureSource;
}

export class RenderFixtureInvalidManifestError extends Error {
  public readonly issues: readonly RenderFixtureManifestIssue[];

  constructor(issues: readonly RenderFixtureManifestIssue[]) {
    super('Invalid render fixture manifest');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixturePixelProbeError extends Error {
  public readonly actual: RenderFixtureRgba;
  public readonly expected: RenderFixtureRgba;
  public readonly fixtureId: string;
  public readonly probeId: string;
  public readonly x: number;
  public readonly y: number;

  constructor(fixtureId: string, probe: RenderFixturePixelProbe, actual: RenderFixtureRgba) {
    super('Render fixture pixel probe failed');
    this.name = new.target.name;
    this.actual = actual;
    this.expected = probe.rgba;
    this.fixtureId = fixtureId;
    this.probeId = probe.id;
    this.x = probe.x;
    this.y = probe.y;
  }
}

export class RenderFixtureInvalidPixelSampleError extends Error {
  public readonly channelIndex: number;
  public readonly value: number | undefined;

  constructor(channelIndex: number, value: number | undefined) {
    super('Invalid render fixture pixel sample');
    this.name = new.target.name;
    this.channelIndex = channelIndex;
    this.value = value;
  }
}

export class RenderFixtureSourceCompileUnavailableError extends Error {
  public readonly fixtureId: string;
  public readonly sourceKind: RenderFixtureSourceKind;
  public readonly sourcePath: string | undefined;

  constructor(fixtureId: string, source: RenderFixtureSource) {
    super('Render fixture source compile unavailable');
    this.name = new.target.name;
    this.fixtureId = fixtureId;
    this.sourceKind = source.kind;
    this.sourcePath = source.kind === RENDER_FIXTURE_SOURCE_KIND_NONE ? undefined : source.path;
  }
}

export type RenderFixturePixelSampler = (
  probe: RenderFixturePixelProbe,
) => RenderFixtureRgba;

export function parseRenderFixtureManifest(
  source: string,
  jsonPort: JsonPort = canonicalJsonPort,
): RenderFixtureManifest {
  return assertRenderFixtureManifest(jsonPort.parse(source));
}

export function assertRenderFixtureManifest(
  value: JsonValue | undefined,
): RenderFixtureManifest {
  const result = validateRenderFixtureManifest(value);
  if (result.ok && isJsonObject(value)) {
    return value as RenderFixtureManifest;
  }

  throw new RenderFixtureInvalidManifestError(result.issues);
}

export function isRenderFixtureManifest(
  value: JsonValue | undefined,
): value is RenderFixtureManifest {
  return validateRenderFixtureManifest(value).ok;
}

export function validateRenderFixtureManifest(
  value: JsonValue | undefined,
): RenderFixtureManifestValidationResult {
  const issues: RenderFixtureManifestIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, '$', 'Fixture manifest must be an object');
    return { ok: false, issues };
  }

  validateLiteral(
    property(value, 'fixtureVersion'),
    RENDER_FIXTURE_VERSION,
    '$.fixtureVersion',
    'Fixture version',
    issues,
  );
  validateNonEmptyString(property(value, 'id'), '$.id', 'Fixture id', issues);
  validateRelativePath(property(value, 'scenePath'), '$.scenePath', 'Scene path', issues);
  validateRelativePath(
    property(value, 'receiptPath'),
    '$.receiptPath',
    'Receipt path',
    issues,
  );
  validateArtifactHash(property(value, 'artifactHash'), '$.artifactHash', issues);
  validateSource(property(value, 'source'), '$.source', issues);

  const canvas = property(value, 'canvas');
  validateCanvas(canvas, '$.canvas', issues);
  validateRuntimeProfile(property(value, 'runtimeProfile'), '$.runtimeProfile', issues);
  validatePixelProbes(property(value, 'pixelProbes'), canvas, '$.pixelProbes', issues);

  return { ok: issues.length === 0, issues };
}

export function assertRenderFixturePixelProbe(
  fixtureId: string,
  probe: RenderFixturePixelProbe,
  actual: RenderFixtureRgba,
): void {
  if (!sameRgba(probe.rgba, actual)) {
    throw new RenderFixturePixelProbeError(fixtureId, probe, actual);
  }
}

export function assertRenderFixturePixelProbes(
  fixtureId: string,
  probes: readonly RenderFixturePixelProbe[],
  sample: RenderFixturePixelSampler,
): void {
  for (const probe of probes) {
    assertRenderFixturePixelProbe(fixtureId, probe, sample(probe));
  }
}

export function renderFixtureRgbaFromBytes(bytes: ArrayLike<number>): RenderFixtureRgba {
  return [
    requireByteChannel(bytes, 0),
    requireByteChannel(bytes, 1),
    requireByteChannel(bytes, 2),
    requireByteChannel(bytes, 3),
  ];
}

export function compileRenderFixtureSource(manifest: RenderFixtureManifest): never {
  throw new RenderFixtureSourceCompileUnavailableError(manifest.id, manifest.source);
}

function validateCanvas(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Fixture canvas must be an object');
    return;
  }

  validatePositiveInteger(property(value, 'width'), `${path}.width`, 'Canvas width', issues);
  validatePositiveInteger(property(value, 'height'), `${path}.height`, 'Canvas height', issues);
}

function validateRuntimeProfile(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Runtime profile must be an object');
    return;
  }

  validateLiteral(
    property(value, 'irVersion'),
    GEORDI_IR_VERSION,
    `${path}.irVersion`,
    'IR version',
    issues,
  );
  validateLiteral(
    property(value, 'numericProfile'),
    GEORDI_NUMERIC_PROFILE,
    `${path}.numericProfile`,
    'Numeric profile',
    issues,
  );
  validateFeatureRequirements(property(value, 'requires'), `${path}.requires`, issues);
}

function validateSource(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Fixture source must be an object');
    return;
  }

  const kind = property(value, 'kind');
  if (kind === RENDER_FIXTURE_SOURCE_KIND_NONE) {
    rejectPresent(property(value, 'path'), `${path}.path`, 'No-source path', issues);
    rejectPresent(property(value, 'compiler'), `${path}.compiler`, 'No-source compiler', issues);
    rejectPresent(
      property(value, 'compilerVersion'),
      `${path}.compilerVersion`,
      'No-source compiler version',
      issues,
    );
    return;
  }

  if (kind === RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT) {
    validateRelativePath(
      property(value, 'path'),
      `${path}.path`,
      'GPVue draft source path',
      issues,
    );
    rejectPresent(
      property(value, 'compiler'),
      `${path}.compiler`,
      'GPVue draft compiler',
      issues,
    );
    rejectPresent(
      property(value, 'compilerVersion'),
      `${path}.compilerVersion`,
      'GPVue draft compiler version',
      issues,
    );
    return;
  }

  if (kind === RENDER_FIXTURE_SOURCE_KIND_GPVUE) {
    validateRelativePath(property(value, 'path'), `${path}.path`, 'GPVue source path', issues);
    validateNonEmptyString(
      property(value, 'compiler'),
      `${path}.compiler`,
      'GPVue compiler',
      issues,
    );
    validateNonEmptyString(
      property(value, 'compilerVersion'),
      `${path}.compilerVersion`,
      'GPVue compiler version',
      issues,
    );
    return;
  }

  pushIssue(issues, `${path}.kind`, 'Fixture source kind is not supported');
}

function validateFeatureRequirements(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Runtime profile requirements must be an array');
    return;
  }

  const seen = new Set<string>();
  let includesCoreProfile = false;

  for (let index = 0; index < value.length; index++) {
    const requirement = value[index];
    const itemPath = `${path}[${index}]`;

    if (typeof requirement !== 'string') {
      pushIssue(issues, itemPath, 'Runtime profile requirement must be a string');
      continue;
    }

    if (!isGeordiFeatureRequirement(requirement)) {
      pushIssue(issues, itemPath, 'Runtime profile requirement is not known');
    }

    if (seen.has(requirement)) {
      pushIssue(issues, itemPath, 'Runtime profile requirement must not be duplicated');
    }
    seen.add(requirement);

    if (requirement === GEORDI_CORE_PROFILE) {
      includesCoreProfile = true;
    }
  }

  if (!includesCoreProfile) {
    pushIssue(issues, path, `Runtime profile requirements must include "${GEORDI_CORE_PROFILE}"`);
  }
}

function validatePixelProbes(
  value: JsonValue | undefined,
  canvas: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Pixel probes must be an array');
    return;
  }

  if (value.length === 0) {
    pushIssue(issues, path, 'Pixel probes must not be empty');
  }

  const canvasWidth = isJsonObject(canvas) ? positiveInteger(property(canvas, 'width')) : undefined;
  const canvasHeight = isJsonObject(canvas) ? positiveInteger(property(canvas, 'height')) : undefined;
  const seen = new Set<string>();

  for (let index = 0; index < value.length; index++) {
    const probe = value[index];
    const itemPath = `${path}[${index}]`;

    if (!isJsonObject(probe)) {
      pushIssue(issues, itemPath, 'Pixel probe must be an object');
      continue;
    }

    const id = property(probe, 'id');
    validateNonEmptyString(id, `${itemPath}.id`, 'Pixel probe id', issues);
    if (typeof id === 'string') {
      if (seen.has(id)) {
        pushIssue(issues, `${itemPath}.id`, 'Pixel probe id must not be duplicated');
      }
      seen.add(id);
    }

    validateProbeCoordinate(
      property(probe, 'x'),
      canvasWidth,
      `${itemPath}.x`,
      'Pixel probe x coordinate',
      issues,
    );
    validateProbeCoordinate(
      property(probe, 'y'),
      canvasHeight,
      `${itemPath}.y`,
      'Pixel probe y coordinate',
      issues,
    );
    validateRgba(property(probe, 'rgba'), `${itemPath}.rgba`, issues);
  }
}

function validateProbeCoordinate(
  value: JsonValue | undefined,
  exclusiveMaximum: number | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  const coordinate = nonNegativeInteger(value);
  if (coordinate === undefined) {
    pushIssue(issues, path, `${label} must be a non-negative integer`);
    return;
  }

  if (exclusiveMaximum !== undefined && coordinate >= exclusiveMaximum) {
    pushIssue(issues, path, `${label} must be inside the canvas`);
  }
}

function validateRgba(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Pixel probe RGBA value must be an array');
    return;
  }

  if (value.length !== 4) {
    pushIssue(issues, path, 'Pixel probe RGBA value must contain exactly four channels');
    return;
  }

  for (let index = 0; index < value.length; index++) {
    const channel = value[index];
    if (byte(channel) === undefined) {
      pushIssue(issues, `${path}[${index}]`, 'Pixel probe RGBA channel must be an integer byte');
    }
  }
}

function validateArtifactHash(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'string') {
    pushIssue(issues, path, 'Artifact hash must be a string');
    return;
  }

  const hex = value.startsWith(RENDER_FIXTURE_HASH_PREFIX)
    ? value.slice(RENDER_FIXTURE_HASH_PREFIX.length)
    : '';
  if (hex.length !== RENDER_FIXTURE_HASH_HEX_LENGTH || !isLowercaseHex(hex)) {
    pushIssue(issues, path, 'Artifact hash must be a lowercase sha256 hex digest');
  }
}

function validateRelativePath(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    pushIssue(issues, path, `${label} must be a non-empty string`);
    return;
  }

  if (value.startsWith('/') || value.includes('..')) {
    pushIssue(issues, path, `${label} must be a relative fixture-local path`);
  }
}

function rejectPresent(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (value !== undefined) {
    pushIssue(issues, path, `${label} must not be present`);
  }
}

function validateNonEmptyString(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    pushIssue(issues, path, `${label} must be a non-empty string`);
  }
}

function validateLiteral(
  value: JsonValue | undefined,
  expected: string,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (value !== expected) {
    pushIssue(issues, path, `${label} must be "${expected}"`);
  }
}

function validatePositiveInteger(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (positiveInteger(value) === undefined) {
    pushIssue(issues, path, `${label} must be a positive integer`);
  }
}

function positiveInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function byte(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
    ? value
    : undefined;
}

function isLowercaseHex(value: string): boolean {
  return /^[0-9a-f]+$/u.test(value);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function property(object: JsonObject, key: string): JsonValue | undefined {
  return object[key];
}

function pushIssue(
  issues: RenderFixtureManifestIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function sameRgba(left: RenderFixtureRgba, right: RenderFixtureRgba): boolean {
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

function requireByteChannel(bytes: ArrayLike<number>, index: number): number {
  const value = index < bytes.length ? bytes[index] : undefined;
  const checked = byte(value);
  if (checked === undefined) {
    throw new RenderFixtureInvalidPixelSampleError(index, value);
  }

  return checked;
}
