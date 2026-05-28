import {
  canonicalJsonPort,
  GEORDI_CORE_PROFILE,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  isGeordiFeatureRequirement,
  type GeordiIr,
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
export const RENDER_FIXTURE_MESH_ASSET_VERSION = 'geordi-mesh-asset/1' as const;
export const RENDER_FIXTURE_MESH_FIXTURE_VERSION = 'geordi-mesh-render-fixture/1' as const;
export const RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE =
  'geordi-ascii-ply-triangle-mesh/1' as const;
export const RENDER_FIXTURE_FONT_PACK_VERSION = 'geordi-font-pack/1' as const;
export const RENDER_FIXTURE_FONT_FORMAT_TTF = 'ttf' as const;
export const RENDER_FIXTURE_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE =
  'trim-trailing-ascii-whitespace/1' as const;
export const RENDER_FIXTURE_STRICT_TEXT_FIXTURE_VERSION =
  'geordi-strict-text-fixture/1' as const;
export const RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE =
  'geordi-strict-positioned-glyph-run/1' as const;
export const RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING = 'geordi-fixed-26.6/1' as const;
export const RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS =
  'text.positionedGlyphRuns' as const;
export const RENDER_FIXTURE_TEXT_FEATURE_FONT_PACK = 'text.fontPack' as const;
export const RENDER_FIXTURE_TEXT_FEATURE_LINE_BOXES = 'text.lineBoxes' as const;
const WINDOWS_DRIVE_PREFIX_PATTERN = /^[A-Za-z]:/u;
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ASCII_PLY_INTEGER_TOKEN_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const ASCII_PLY_NUMBER_TOKEN_PATTERN =
  /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?$/u;
const FONT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const GIT_COMMIT_HEX_LENGTH = 40 as const;

export interface RenderFixtureManifestIssue extends JsonObject {
  readonly path: string;
  readonly message: string;
}

export interface RenderFixtureManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureManifestIssue[];
}

export type RenderFixtureMeshAssetManifestIssue = RenderFixtureManifestIssue;

export interface RenderFixtureMeshAssetManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureMeshAssetManifestIssue[];
}

export type RenderFixtureMeshFixtureManifestIssue = RenderFixtureManifestIssue;

export interface RenderFixtureMeshFixtureManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureMeshFixtureManifestIssue[];
}

export type RenderFixtureFontPackManifestIssue = RenderFixtureManifestIssue;

export interface RenderFixtureFontPackManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureFontPackManifestIssue[];
}

export type RenderFixtureStrictTextFixtureManifestIssue = RenderFixtureManifestIssue;

export interface RenderFixtureStrictTextFixtureManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureStrictTextFixtureManifestIssue[];
}

export type RenderFixtureStrictTextFontReferenceIssue = RenderFixtureManifestIssue;

export interface RenderFixtureStrictTextFontReferenceValidationInput {
  readonly fontPack: RenderFixtureFontPackManifest;
  readonly manifest: RenderFixtureStrictTextFixtureManifest;
}

export interface RenderFixtureStrictTextFontReferenceValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureStrictTextFontReferenceIssue[];
}

export interface RenderFixtureArtifactIssue extends JsonObject {
  readonly path: string;
  readonly message: string;
}

export interface RenderFixtureArtifactValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RenderFixtureArtifactIssue[];
}

export interface RenderFixtureArtifactValidationInput {
  readonly artifactHash: string;
  readonly ir: GeordiIr;
  readonly manifest: RenderFixtureManifest;
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

export type RenderFixtureVector3 = readonly [number, number, number];

export interface RenderFixtureMeshAssetFormat extends JsonObject {
  readonly encoding: 'ascii';
  readonly kind: 'ply';
  readonly version: '1.0';
}

export interface RenderFixtureMeshAssetCounts extends JsonObject {
  readonly faces: number;
  readonly vertices: number;
}

export interface RenderFixtureMeshAssetBounds extends JsonObject {
  readonly max: RenderFixtureVector3;
  readonly min: RenderFixtureVector3;
}

export interface RenderFixtureMeshAssetSource extends JsonObject {
  readonly attribution: string;
  readonly retrieved: string;
  readonly url: string;
}

export interface RenderFixtureMeshAssetManifest extends JsonObject {
  readonly assetPath: string;
  readonly assetVersion: typeof RENDER_FIXTURE_MESH_ASSET_VERSION;
  readonly bounds: RenderFixtureMeshAssetBounds;
  readonly counts: RenderFixtureMeshAssetCounts;
  readonly faceProperty: 'vertex_indices';
  readonly format: RenderFixtureMeshAssetFormat;
  readonly id: string;
  readonly meshProfile: typeof RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE;
  readonly sha256: string;
  readonly source: RenderFixtureMeshAssetSource;
  readonly vertexProperties: readonly string[];
}

export interface RenderFixtureFontLicense extends JsonObject {
  readonly name: string;
  readonly path: string;
  readonly redistributionAllowed: boolean;
  readonly reservedFontNames: readonly string[];
  readonly sha256: string;
}

export interface RenderFixtureFontSource extends JsonObject {
  readonly commit: string;
  readonly fontSha256: string;
  readonly licenseNormalization: typeof RENDER_FIXTURE_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE;
  readonly licensePath: string;
  readonly licenseSha256: string;
  readonly path: string;
  readonly repository: string;
}

export interface RenderFixtureFontFace extends JsonObject {
  readonly faceIndex: number;
  readonly familyName: string;
  readonly format: typeof RENDER_FIXTURE_FONT_FORMAT_TTF;
  readonly id: string;
  readonly license: RenderFixtureFontLicense;
  readonly path: string;
  readonly sha256: string;
  readonly source: RenderFixtureFontSource;
  readonly styleName: string;
  readonly weight: number;
}

export interface RenderFixtureFontPackManifest extends JsonObject {
  readonly fontPackVersion: typeof RENDER_FIXTURE_FONT_PACK_VERSION;
  readonly fonts: readonly RenderFixtureFontFace[];
}

export type RenderFixtureStrictTextFeatureRequirement =
  | typeof RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS
  | typeof RENDER_FIXTURE_TEXT_FEATURE_FONT_PACK
  | typeof RENDER_FIXTURE_TEXT_FEATURE_LINE_BOXES;

export interface RenderFixtureStrictTextSemanticText extends JsonObject {
  readonly affectsPixels: false;
  readonly language: string;
  readonly source: string;
}

export interface RenderFixtureStrictTextLineBox extends JsonObject {
  readonly baselineY: number;
  readonly height: number;
  readonly id: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface RenderFixturePositionedGlyph extends JsonObject {
  readonly advance: number;
  readonly glyphId: number;
  readonly x: number;
  readonly xOffset: number;
  readonly y: number;
  readonly yOffset: number;
}

export interface RenderFixtureGlyphRun extends JsonObject {
  readonly fontId: string;
  readonly glyphs: readonly RenderFixturePositionedGlyph[];
  readonly id: string;
  readonly lineBoxId: string;
}

export interface RenderFixtureStrictTextFixtureManifest extends JsonObject {
  readonly features: readonly RenderFixtureStrictTextFeatureRequirement[];
  readonly fixtureVersion: typeof RENDER_FIXTURE_STRICT_TEXT_FIXTURE_VERSION;
  readonly fontPackPath: string;
  readonly glyphRuns: readonly RenderFixtureGlyphRun[];
  readonly id: string;
  readonly lineBoxes: readonly RenderFixtureStrictTextLineBox[];
  readonly positionEncoding: typeof RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING;
  readonly semanticText: RenderFixtureStrictTextSemanticText;
  readonly textProfile: typeof RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE;
}

export interface RenderFixturePlyVertex extends JsonObject {
  readonly position: RenderFixtureVector3;
}

export type RenderFixturePlyTriangleFace = readonly [number, number, number];

export interface RenderFixturePlyMesh extends JsonObject {
  readonly bounds: RenderFixtureMeshAssetBounds;
  readonly faces: readonly RenderFixturePlyTriangleFace[];
  readonly vertexProperties: readonly string[];
  readonly vertices: readonly RenderFixturePlyVertex[];
}

export interface RenderFixtureMeshRuntimeProfile extends JsonObject {
  readonly numericProfile: GeordiNumericProfile;
  readonly requires: readonly GeordiFeatureRequirement[];
}

export interface RenderFixtureMeshCamera extends JsonObject {
  readonly coordinateSystem: 'right-handed';
  readonly eye: RenderFixtureVector3;
  readonly target: RenderFixtureVector3;
  readonly up: RenderFixtureVector3;
}

export interface RenderFixtureMeshProjection extends JsonObject {
  readonly far: number;
  readonly kind: 'perspective';
  readonly near: number;
  readonly verticalFovRadians: number;
  readonly viewport: RenderFixtureCanvas;
}

export interface RenderFixtureMeshMaterial extends JsonObject {
  readonly backgroundColor: string;
  readonly color: string;
  readonly kind: 'solid';
}

export interface RenderFixtureMeshPlayback extends JsonObject {
  readonly axis: RenderFixtureVector3;
  readonly kind: 'fixed-rate-rotation';
  readonly radiansPerSecond: number;
  readonly sampleRate: number;
}

export interface RenderFixtureMeshPlaybackFrame extends JsonObject {
  readonly angleRadians: number;
  readonly axis: RenderFixtureVector3;
  readonly frameIndex: number;
  readonly normalizedAxis: RenderFixtureVector3;
  readonly radiansPerSecond: number;
  readonly sampleRate: number;
  readonly seconds: number;
}

export interface RenderFixtureMeshFixtureManifest extends JsonObject {
  readonly assetManifestPath: string;
  readonly camera: RenderFixtureMeshCamera;
  readonly fixtureVersion: typeof RENDER_FIXTURE_MESH_FIXTURE_VERSION;
  readonly id: string;
  readonly material: RenderFixtureMeshMaterial;
  readonly playback: RenderFixtureMeshPlayback;
  readonly projection: RenderFixtureMeshProjection;
  readonly runtimeProfile: RenderFixtureMeshRuntimeProfile;
}

export class RenderFixtureInvalidManifestError extends Error {
  public readonly issues: readonly RenderFixtureManifestIssue[];

  constructor(issues: readonly RenderFixtureManifestIssue[]) {
    super('Invalid render fixture manifest');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixtureInvalidMeshAssetManifestError extends Error {
  public readonly issues: readonly RenderFixtureMeshAssetManifestIssue[];

  constructor(issues: readonly RenderFixtureMeshAssetManifestIssue[]) {
    super('Invalid render fixture mesh asset manifest');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixtureInvalidMeshFixtureManifestError extends Error {
  public readonly issues: readonly RenderFixtureMeshFixtureManifestIssue[];

  constructor(issues: readonly RenderFixtureMeshFixtureManifestIssue[]) {
    super('Invalid render fixture mesh fixture manifest');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixtureInvalidFontPackManifestError extends Error {
  public readonly issues: readonly RenderFixtureFontPackManifestIssue[];

  constructor(issues: readonly RenderFixtureFontPackManifestIssue[]) {
    super('Invalid render fixture font pack manifest');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixtureInvalidStrictTextFixtureManifestError extends Error {
  public readonly issues: readonly RenderFixtureStrictTextFixtureManifestIssue[];

  constructor(issues: readonly RenderFixtureStrictTextFixtureManifestIssue[]) {
    super('Invalid render fixture strict text fixture manifest');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixtureInvalidStrictTextFontReferenceError extends Error {
  public readonly issues: readonly RenderFixtureStrictTextFontReferenceIssue[];

  constructor(issues: readonly RenderFixtureStrictTextFontReferenceIssue[]) {
    super('Invalid render fixture strict text font references');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class RenderFixturePlyHeaderError extends Error {
  public readonly lineNumber: number;

  constructor(lineNumber: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.lineNumber = lineNumber;
  }
}

export class RenderFixturePlyVertexError extends Error {
  public readonly lineNumber: number;

  constructor(lineNumber: number) {
    super('Invalid PLY vertex row');
    this.name = new.target.name;
    this.lineNumber = lineNumber;
  }
}

export class RenderFixturePlyFaceError extends Error {
  public readonly lineNumber: number;

  constructor(lineNumber: number) {
    super('Invalid PLY triangle face row');
    this.name = new.target.name;
    this.lineNumber = lineNumber;
  }
}

export class RenderFixtureInvalidPlaybackFrameError extends Error {
  public readonly frameIndex: number;

  constructor(frameIndex: number) {
    super('Invalid render fixture playback frame');
    this.name = new.target.name;
    this.frameIndex = frameIndex;
  }
}

export class RenderFixtureInvalidMeshPlaybackError extends Error {
  constructor() {
    super('Render fixture mesh playback is invalid');
    this.name = new.target.name;
  }
}

export class RenderFixtureArtifactValidationError extends Error {
  public readonly fixtureId: string;
  public readonly issues: readonly RenderFixtureArtifactIssue[];

  constructor(fixtureId: string, issues: readonly RenderFixtureArtifactIssue[]) {
    super('Render fixture artifact validation failed');
    this.name = new.target.name;
    this.fixtureId = fixtureId;
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

export type RenderFixturePixelSampler = (
  probe: RenderFixturePixelProbe,
) => RenderFixtureRgba;

export function parseRenderFixtureManifest(
  source: string,
  jsonPort: JsonPort = canonicalJsonPort,
): RenderFixtureManifest {
  return assertRenderFixtureManifest(jsonPort.parse(source));
}

export function parseRenderFixtureMeshAssetManifest(
  source: string,
  jsonPort: JsonPort = canonicalJsonPort,
): RenderFixtureMeshAssetManifest {
  return assertRenderFixtureMeshAssetManifest(jsonPort.parse(source));
}

export function parseRenderFixtureMeshFixtureManifest(
  source: string,
  jsonPort: JsonPort = canonicalJsonPort,
): RenderFixtureMeshFixtureManifest {
  return assertRenderFixtureMeshFixtureManifest(jsonPort.parse(source));
}

export function parseRenderFixtureFontPackManifest(
  source: string,
  jsonPort: JsonPort = canonicalJsonPort,
): RenderFixtureFontPackManifest {
  return assertRenderFixtureFontPackManifest(jsonPort.parse(source));
}

export function parseRenderFixtureStrictTextFixtureManifest(
  source: string,
  jsonPort: JsonPort = canonicalJsonPort,
): RenderFixtureStrictTextFixtureManifest {
  return assertRenderFixtureStrictTextFixtureManifest(jsonPort.parse(source));
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

export function assertRenderFixtureMeshAssetManifest(
  value: JsonValue | undefined,
): RenderFixtureMeshAssetManifest {
  const result = validateRenderFixtureMeshAssetManifest(value);
  if (result.ok && isJsonObject(value)) {
    return value as RenderFixtureMeshAssetManifest;
  }

  throw new RenderFixtureInvalidMeshAssetManifestError(result.issues);
}

export function assertRenderFixtureMeshFixtureManifest(
  value: JsonValue | undefined,
): RenderFixtureMeshFixtureManifest {
  const result = validateRenderFixtureMeshFixtureManifest(value);
  if (result.ok && isJsonObject(value)) {
    return value as RenderFixtureMeshFixtureManifest;
  }

  throw new RenderFixtureInvalidMeshFixtureManifestError(result.issues);
}

export function assertRenderFixtureFontPackManifest(
  value: JsonValue | undefined,
): RenderFixtureFontPackManifest {
  const result = validateRenderFixtureFontPackManifest(value);
  if (result.ok && isJsonObject(value)) {
    return value as RenderFixtureFontPackManifest;
  }

  throw new RenderFixtureInvalidFontPackManifestError(result.issues);
}

export function assertRenderFixtureStrictTextFixtureManifest(
  value: JsonValue | undefined,
): RenderFixtureStrictTextFixtureManifest {
  const result = validateRenderFixtureStrictTextFixtureManifest(value);
  if (result.ok && isJsonObject(value)) {
    return value as RenderFixtureStrictTextFixtureManifest;
  }

  throw new RenderFixtureInvalidStrictTextFixtureManifestError(result.issues);
}

export function assertRenderFixtureStrictTextFontReferences(
  input: RenderFixtureStrictTextFontReferenceValidationInput,
): RenderFixtureStrictTextFontReferenceValidationInput {
  const result = validateRenderFixtureStrictTextFontReferences(input);
  if (result.ok) {
    return input;
  }

  throw new RenderFixtureInvalidStrictTextFontReferenceError(result.issues);
}

export function isRenderFixtureManifest(
  value: JsonValue | undefined,
): value is RenderFixtureManifest {
  return validateRenderFixtureManifest(value).ok;
}

export function isRenderFixtureMeshAssetManifest(
  value: JsonValue | undefined,
): value is RenderFixtureMeshAssetManifest {
  return validateRenderFixtureMeshAssetManifest(value).ok;
}

export function isRenderFixtureMeshFixtureManifest(
  value: JsonValue | undefined,
): value is RenderFixtureMeshFixtureManifest {
  return validateRenderFixtureMeshFixtureManifest(value).ok;
}

export function isRenderFixtureFontPackManifest(
  value: JsonValue | undefined,
): value is RenderFixtureFontPackManifest {
  return validateRenderFixtureFontPackManifest(value).ok;
}

export function isRenderFixtureStrictTextFixtureManifest(
  value: JsonValue | undefined,
): value is RenderFixtureStrictTextFixtureManifest {
  return validateRenderFixtureStrictTextFixtureManifest(value).ok;
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

export function validateRenderFixtureMeshAssetManifest(
  value: JsonValue | undefined,
): RenderFixtureMeshAssetManifestValidationResult {
  const issues: RenderFixtureMeshAssetManifestIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, '$', 'Mesh asset manifest must be an object');
    return { ok: false, issues };
  }

  validateLiteral(
    property(value, 'assetVersion'),
    RENDER_FIXTURE_MESH_ASSET_VERSION,
    '$.assetVersion',
    'Mesh asset version',
    issues,
  );
  validateNonEmptyString(property(value, 'id'), '$.id', 'Mesh asset id', issues);
  validateLiteral(
    property(value, 'meshProfile'),
    RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE,
    '$.meshProfile',
    'Mesh profile',
    issues,
  );
  validateRelativePath(property(value, 'assetPath'), '$.assetPath', 'Mesh asset path', issues);
  validateArtifactHash(property(value, 'sha256'), '$.sha256', issues);
  validateMeshAssetFormat(property(value, 'format'), '$.format', issues);
  validateMeshAssetCounts(property(value, 'counts'), '$.counts', issues);
  validateMeshAssetBounds(property(value, 'bounds'), '$.bounds', issues);
  validateMeshAssetSource(property(value, 'source'), '$.source', issues);
  validateVertexProperties(property(value, 'vertexProperties'), '$.vertexProperties', issues);
  validateLiteral(
    property(value, 'faceProperty'),
    'vertex_indices',
    '$.faceProperty',
    'Face property',
    issues,
  );

  return { ok: issues.length === 0, issues };
}

export function validateRenderFixtureStrictTextFixtureManifest(
  value: JsonValue | undefined,
): RenderFixtureStrictTextFixtureManifestValidationResult {
  const issues: RenderFixtureStrictTextFixtureManifestIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, '$', 'Strict text fixture manifest must be an object');
    return { ok: false, issues };
  }

  validateLiteral(
    property(value, 'fixtureVersion'),
    RENDER_FIXTURE_STRICT_TEXT_FIXTURE_VERSION,
    '$.fixtureVersion',
    'Strict text fixture version',
    issues,
  );
  validateNonEmptyString(property(value, 'id'), '$.id', 'Strict text fixture id', issues);
  validateLiteral(
    property(value, 'textProfile'),
    RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE,
    '$.textProfile',
    'Strict text profile',
    issues,
  );
  validateLiteral(
    property(value, 'positionEncoding'),
    RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING,
    '$.positionEncoding',
    'Strict text position encoding',
    issues,
  );
  validateRelativePath(
    property(value, 'fontPackPath'),
    '$.fontPackPath',
    'Strict text font pack path',
    issues,
  );
  validateStrictTextFeatures(property(value, 'features'), '$.features', issues);
  validateStrictTextSemanticText(property(value, 'semanticText'), '$.semanticText', issues);
  validateStrictTextLineBoxes(property(value, 'lineBoxes'), '$.lineBoxes', issues);
  validateGlyphRuns(property(value, 'glyphRuns'), '$.glyphRuns', issues);
  validateStrictTextLinkage(
    property(value, 'lineBoxes'),
    property(value, 'glyphRuns'),
    issues,
  );

  return { ok: issues.length === 0, issues };
}

export function validateRenderFixtureFontPackManifest(
  value: JsonValue | undefined,
): RenderFixtureFontPackManifestValidationResult {
  const issues: RenderFixtureFontPackManifestIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, '$', 'Font pack manifest must be an object');
    return { ok: false, issues };
  }

  validateLiteral(
    property(value, 'fontPackVersion'),
    RENDER_FIXTURE_FONT_PACK_VERSION,
    '$.fontPackVersion',
    'Font pack version',
    issues,
  );
  validateFontFaces(property(value, 'fonts'), '$.fonts', issues);

  return { ok: issues.length === 0, issues };
}

export function validateRenderFixtureStrictTextFontReferences(
  input: RenderFixtureStrictTextFontReferenceValidationInput,
): RenderFixtureStrictTextFontReferenceValidationResult {
  const issues: RenderFixtureStrictTextFontReferenceIssue[] = [];
  const fontIds = new Set(input.fontPack.fonts.map((font) => font.id));

  for (const [index, run] of input.manifest.glyphRuns.entries()) {
    if (!fontIds.has(run.fontId)) {
      pushIssue(
        issues,
        `$.glyphRuns[${index}].fontId`,
        'Strict text glyph run font id must reference an existing font pack font',
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

export function validateRenderFixtureMeshFixtureManifest(
  value: JsonValue | undefined,
): RenderFixtureMeshFixtureManifestValidationResult {
  const issues: RenderFixtureMeshFixtureManifestIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, '$', 'Mesh fixture manifest must be an object');
    return { ok: false, issues };
  }

  validateLiteral(
    property(value, 'fixtureVersion'),
    RENDER_FIXTURE_MESH_FIXTURE_VERSION,
    '$.fixtureVersion',
    'Mesh fixture version',
    issues,
  );
  validateNonEmptyString(property(value, 'id'), '$.id', 'Mesh fixture id', issues);
  validateRelativePath(
    property(value, 'assetManifestPath'),
    '$.assetManifestPath',
    'Mesh asset manifest path',
    issues,
  );
  validateMeshRuntimeProfile(property(value, 'runtimeProfile'), '$.runtimeProfile', issues);
  validateMeshCamera(property(value, 'camera'), '$.camera', issues);
  validateMeshProjection(property(value, 'projection'), '$.projection', issues);
  validateMeshMaterial(property(value, 'material'), '$.material', issues);
  validateMeshPlayback(property(value, 'playback'), '$.playback', issues);

  return { ok: issues.length === 0, issues };
}

export function validateRenderFixtureArtifact(
  input: RenderFixtureArtifactValidationInput,
): RenderFixtureArtifactValidationResult {
  const issues: RenderFixtureArtifactIssue[] = [];
  const { artifactHash, ir, manifest } = input;

  if (artifactHash !== manifest.artifactHash) {
    pushArtifactIssue(
      issues,
      '$.artifactHash',
      'Fixture artifact hash must match the loaded scene bytes',
    );
  }

  if (!sameString(manifest.runtimeProfile.irVersion, ir.irVersion)) {
    pushArtifactIssue(
      issues,
      '$.runtimeProfile.irVersion',
      'Runtime profile IR version must match the IR artifact',
    );
  }

  if (!sameString(manifest.runtimeProfile.numericProfile, ir.numericProfile)) {
    pushArtifactIssue(
      issues,
      '$.runtimeProfile.numericProfile',
      'Runtime profile numeric profile must match the IR artifact',
    );
  }

  if (!sameRequirements(manifest.runtimeProfile.requires, ir.requires)) {
    pushArtifactIssue(
      issues,
      '$.runtimeProfile.requires',
      'Runtime profile requirements must match the IR artifact',
    );
  }

  if (!sceneDimensionMatchesCanvas(ir.scene.width, manifest.canvas.width)) {
    pushArtifactIssue(
      issues,
      '$.canvas.width',
      'Fixture canvas width must match the IR scene width',
    );
  }

  if (!sceneDimensionMatchesCanvas(ir.scene.height, manifest.canvas.height)) {
    pushArtifactIssue(
      issues,
      '$.canvas.height',
      'Fixture canvas height must match the IR scene height',
    );
  }

  return { ok: issues.length === 0, issues };
}

export function assertRenderFixtureArtifact(
  input: RenderFixtureArtifactValidationInput,
): void {
  const result = validateRenderFixtureArtifact(input);
  if (!result.ok) {
    throw new RenderFixtureArtifactValidationError(input.manifest.id, result.issues);
  }
}

export function createRenderFixtureMeshPlaybackFrame(
  playback: RenderFixtureMeshPlayback,
  frameIndex: number,
): RenderFixtureMeshPlaybackFrame {
  if (
    finiteNumber(playback.radiansPerSecond) === undefined ||
    playback.radiansPerSecond <= 0 ||
    positiveInteger(playback.sampleRate) === undefined
  ) {
    throw new RenderFixtureInvalidMeshPlaybackError();
  }

  if (nonNegativeInteger(frameIndex) === undefined) {
    throw new RenderFixtureInvalidPlaybackFrameError(frameIndex);
  }

  const normalizedAxis = normalizePlaybackAxis(playback.axis);
  if (normalizedAxis === undefined) {
    throw new RenderFixtureInvalidMeshPlaybackError();
  }

  const seconds = frameIndex / playback.sampleRate;
  return {
    angleRadians: seconds * playback.radiansPerSecond,
    axis: playback.axis,
    frameIndex,
    normalizedAxis,
    radiansPerSecond: playback.radiansPerSecond,
    sampleRate: playback.sampleRate,
    seconds,
  };
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

export function parseRenderFixtureAsciiPlyTriangleMesh(source: string): RenderFixturePlyMesh {
  const lines = source.split(/\r?\n/u);
  const header = parsePlyHeader(lines);
  const vertices = parsePlyVertices(lines, header);
  const faces = parsePlyFaces(lines, header, vertices.length);
  assertNoTrailingPlyBody(lines, header.faceStartIndex + header.faceCount);

  return {
    bounds: boundsFromVertices(vertices),
    faces,
    vertexProperties: header.vertexProperties,
    vertices,
  };
}

interface PlyHeader {
  readonly faceCount: number;
  readonly faceStartIndex: number;
  readonly vertexCount: number;
  readonly vertexProperties: readonly string[];
  readonly vertexStartIndex: number;
}

function parsePlyHeader(lines: readonly string[]): PlyHeader {
  if (lineAt(lines, 0).trim() !== 'ply') {
    throw new RenderFixturePlyHeaderError(1, 'PLY source must start with ply');
  }

  let faceCount: number | undefined;
  let vertexCount: number | undefined;
  let currentElement = '';
  let facePropertyFound = false;
  const vertexProperties: string[] = [];

  for (let index = 1; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lineAt(lines, index).trim();
    if (line === 'end_header') {
      if (vertexCount === undefined || faceCount === undefined || !facePropertyFound) {
        throw new RenderFixturePlyHeaderError(lineNumber, 'PLY header is incomplete');
      }

      assertVertexPositionProperties(vertexProperties, lineNumber);
      const vertexStartIndex = index + 1;
      return {
        faceCount,
        faceStartIndex: vertexStartIndex + vertexCount,
        vertexCount,
        vertexProperties,
        vertexStartIndex,
      };
    }

    if (line.length === 0 || line.startsWith('comment ')) {
      continue;
    }

    if (line === 'format ascii 1.0') {
      continue;
    }

    const parts = line.split(/\s+/u);
    if (parts[0] === 'element' && parts[1] === 'vertex' && parts.length === 3) {
      vertexCount = parsePositiveIntegerToken(parts[2], lineNumber);
      currentElement = 'vertex';
      continue;
    }

    if (parts[0] === 'element' && parts[1] === 'face' && parts.length === 3) {
      faceCount = parsePositiveIntegerToken(parts[2], lineNumber);
      currentElement = 'face';
      continue;
    }

    if (parts[0] === 'property' && currentElement === 'vertex') {
      if (parts.length !== 3) {
        throw new RenderFixturePlyHeaderError(lineNumber, 'PLY vertex property is unsupported');
      }
      const propertyName = parts.at(2);
      if (propertyName === undefined) {
        throw new RenderFixturePlyHeaderError(lineNumber, 'PLY vertex property is unsupported');
      }
      vertexProperties.push(propertyName);
      continue;
    }

    if (line === 'property list uchar int vertex_indices' && currentElement === 'face') {
      facePropertyFound = true;
      continue;
    }

    throw new RenderFixturePlyHeaderError(lineNumber, 'PLY header line is unsupported');
  }

  throw new RenderFixturePlyHeaderError(lines.length, 'PLY header must end with end_header');
}

function parsePlyVertices(
  lines: readonly string[],
  header: PlyHeader,
): readonly RenderFixturePlyVertex[] {
  const vertices: RenderFixturePlyVertex[] = [];
  for (let index = 0; index < header.vertexCount; index++) {
    const lineIndex = header.vertexStartIndex + index;
    const lineNumber = lineIndex + 1;
    const fields = lineAt(lines, lineIndex).trim().split(/\s+/u);
    if (fields.length !== header.vertexProperties.length) {
      throw new RenderFixturePlyVertexError(lineNumber);
    }

    const x = parseFiniteNumberToken(fields[0], lineNumber, RenderFixturePlyVertexError);
    const y = parseFiniteNumberToken(fields[1], lineNumber, RenderFixturePlyVertexError);
    const z = parseFiniteNumberToken(fields[2], lineNumber, RenderFixturePlyVertexError);
    vertices.push({ position: [x, y, z] });
  }

  return vertices;
}

function parsePlyFaces(
  lines: readonly string[],
  header: PlyHeader,
  vertexCount: number,
): readonly RenderFixturePlyTriangleFace[] {
  const faces: RenderFixturePlyTriangleFace[] = [];
  for (let index = 0; index < header.faceCount; index++) {
    const lineIndex = header.faceStartIndex + index;
    const lineNumber = lineIndex + 1;
    const fields = lineAt(lines, lineIndex).trim().split(/\s+/u);
    if (fields.length !== 4 || fields[0] !== '3') {
      throw new RenderFixturePlyFaceError(lineNumber);
    }

    const a = parseFaceIndex(fields[1], vertexCount, lineNumber);
    const b = parseFaceIndex(fields[2], vertexCount, lineNumber);
    const c = parseFaceIndex(fields[3], vertexCount, lineNumber);
    faces.push([a, b, c]);
  }

  return faces;
}

function assertVertexPositionProperties(properties: readonly string[], lineNumber: number): void {
  if (properties[0] !== 'x' || properties[1] !== 'y' || properties[2] !== 'z') {
    throw new RenderFixturePlyHeaderError(lineNumber, 'PLY vertex properties must begin x y z');
  }
}

function parsePositiveIntegerToken(value: string | undefined, lineNumber: number): number {
  if (value === undefined || !ASCII_PLY_INTEGER_TOKEN_PATTERN.test(value)) {
    throw new RenderFixturePlyHeaderError(lineNumber, 'PLY element count must be a positive integer');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RenderFixturePlyHeaderError(lineNumber, 'PLY element count must be a positive integer');
  }
  return parsed;
}

function parseFiniteNumberToken(
  value: string | undefined,
  lineNumber: number,
  ErrorClass: typeof RenderFixturePlyVertexError,
): number {
  if (value === undefined || !ASCII_PLY_NUMBER_TOKEN_PATTERN.test(value)) {
    throw new ErrorClass(lineNumber);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ErrorClass(lineNumber);
  }
  return parsed;
}

function parseFaceIndex(
  value: string | undefined,
  vertexCount: number,
  lineNumber: number,
): number {
  if (value === undefined || !ASCII_PLY_INTEGER_TOKEN_PATTERN.test(value)) {
    throw new RenderFixturePlyFaceError(lineNumber);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= vertexCount) {
    throw new RenderFixturePlyFaceError(lineNumber);
  }
  return parsed;
}

function assertNoTrailingPlyBody(lines: readonly string[], bodyEndIndex: number): void {
  for (let index = bodyEndIndex; index < lines.length; index++) {
    if (lineAt(lines, index).trim().length > 0) {
      throw new RenderFixturePlyFaceError(index + 1);
    }
  }
}

function boundsFromVertices(
  vertices: readonly RenderFixturePlyVertex[],
): RenderFixtureMeshAssetBounds {
  if (vertices.length === 0) {
    throw new RenderFixturePlyVertexError(0);
  }

  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const vertex of vertices) {
    const [x, y, z] = vertex.position;
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }

  return { max, min };
}

function lineAt(lines: readonly string[], index: number): string {
  const line = lines.at(index);
  if (line === undefined) {
    throw new RenderFixturePlyHeaderError(index + 1, 'PLY source ended unexpectedly');
  }

  return line;
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

function validateMeshAssetFormat(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh asset format must be an object');
    return;
  }

  validateLiteral(property(value, 'kind'), 'ply', `${path}.kind`, 'Mesh asset kind', issues);
  validateLiteral(
    property(value, 'encoding'),
    'ascii',
    `${path}.encoding`,
    'Mesh asset encoding',
    issues,
  );
  validateLiteral(property(value, 'version'), '1.0', `${path}.version`, 'PLY version', issues);
}

function validateMeshAssetCounts(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh asset counts must be an object');
    return;
  }

  validatePositiveInteger(property(value, 'vertices'), `${path}.vertices`, 'Vertex count', issues);
  validatePositiveInteger(property(value, 'faces'), `${path}.faces`, 'Face count', issues);
}

function validateMeshAssetBounds(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh asset bounds must be an object');
    return;
  }

  validateVector3(property(value, 'min'), `${path}.min`, 'Mesh asset bounds min', issues);
  validateVector3(property(value, 'max'), `${path}.max`, 'Mesh asset bounds max', issues);
}

function validateMeshAssetSource(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh asset source must be an object');
    return;
  }

  validateNonEmptyString(property(value, 'url'), `${path}.url`, 'Mesh asset source URL', issues);
  validateIsoDate(
    property(value, 'retrieved'),
    `${path}.retrieved`,
    'Mesh asset retrieved date',
    issues,
  );
  validateNonEmptyString(
    property(value, 'attribution'),
    `${path}.attribution`,
    'Mesh asset attribution',
    issues,
  );
}

function validateFontFaces(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureFontPackManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Font pack fonts must be an array');
    return;
  }

  if (value.length === 0) {
    pushIssue(issues, path, 'Font pack fonts must not be empty');
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    validateFontFace(item, itemPath, issues);
    if (!isJsonObject(item)) {
      continue;
    }

    const id = property(item, 'id');
    if (typeof id !== 'string') {
      continue;
    }

    if (seen.has(id)) {
      pushIssue(issues, `${itemPath}.id`, 'Font id must not be duplicated');
    }
    seen.add(id);
  }
}

function validateFontFace(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureFontPackManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Font face must be an object');
    return;
  }

  validateFontId(property(value, 'id'), `${path}.id`, issues);
  validateLiteral(
    property(value, 'format'),
    RENDER_FIXTURE_FONT_FORMAT_TTF,
    `${path}.format`,
    'Font format',
    issues,
  );
  validateRelativePath(property(value, 'path'), `${path}.path`, 'Font path', issues);
  validateArtifactHash(property(value, 'sha256'), `${path}.sha256`, issues);
  validateNonNegativeInteger(property(value, 'faceIndex'), `${path}.faceIndex`, 'Face index', issues);
  validateNonEmptyString(property(value, 'familyName'), `${path}.familyName`, 'Font family name', issues);
  validateNonEmptyString(property(value, 'styleName'), `${path}.styleName`, 'Font style name', issues);
  validateFontWeight(property(value, 'weight'), `${path}.weight`, issues);
  validateFontLicense(property(value, 'license'), `${path}.license`, issues);
  validateFontSource(property(value, 'source'), `${path}.source`, issues);
}

function validateFontLicense(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureFontPackManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Font license must be an object');
    return;
  }

  validateNonEmptyString(property(value, 'name'), `${path}.name`, 'Font license name', issues);
  validateRelativePath(property(value, 'path'), `${path}.path`, 'Font license path', issues);
  validateBoolean(
    property(value, 'redistributionAllowed'),
    `${path}.redistributionAllowed`,
    'Font license redistribution allowed',
    issues,
  );
  validateArtifactHash(property(value, 'sha256'), `${path}.sha256`, issues);
  validateReservedFontNames(property(value, 'reservedFontNames'), `${path}.reservedFontNames`, issues);
}

function validateFontSource(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureFontPackManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Font source must be an object');
    return;
  }

  validateNonEmptyString(property(value, 'repository'), `${path}.repository`, 'Font source repository', issues);
  validateGitCommit(property(value, 'commit'), `${path}.commit`, issues);
  validateNonEmptyString(property(value, 'path'), `${path}.path`, 'Font source path', issues);
  validateNonEmptyString(
    property(value, 'licensePath'),
    `${path}.licensePath`,
    'Font source license path',
    issues,
  );
  validateArtifactHash(property(value, 'fontSha256'), `${path}.fontSha256`, issues);
  validateArtifactHash(property(value, 'licenseSha256'), `${path}.licenseSha256`, issues);
  validateLiteral(
    property(value, 'licenseNormalization'),
    RENDER_FIXTURE_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE,
    `${path}.licenseNormalization`,
    'Font source license normalization',
    issues,
  );
}

function validateStrictTextFeatures(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Strict text features must be an array');
    return;
  }

  const required = [
    RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
    RENDER_FIXTURE_TEXT_FEATURE_FONT_PACK,
    RENDER_FIXTURE_TEXT_FEATURE_LINE_BOXES,
  ];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const feature = value[index];
    const itemPath = `${path}[${index}]`;
    if (typeof feature !== 'string') {
      pushIssue(issues, itemPath, 'Strict text feature must be a string');
      continue;
    }

    if (!required.includes(feature as (typeof required)[number])) {
      pushIssue(issues, itemPath, 'Strict text feature is not supported');
    }
    if (seen.has(feature)) {
      pushIssue(issues, itemPath, 'Strict text feature must not be duplicated');
    }
    seen.add(feature);
  }

  for (const feature of required) {
    if (!seen.has(feature)) {
      pushIssue(issues, path, `Strict text features must include ${feature}`);
    }
  }
}

function validateStrictTextSemanticText(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Strict text semantic text must be an object');
    return;
  }

  if (property(value, 'affectsPixels') !== false) {
    pushIssue(issues, `${path}.affectsPixels`, 'Semantic text must not affect pixels');
  }
  validateNonEmptyString(property(value, 'language'), `${path}.language`, 'Semantic text language', issues);
  validateNonEmptyString(property(value, 'source'), `${path}.source`, 'Semantic text source', issues);
}

function validateStrictTextLineBoxes(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Strict text line boxes must be an array');
    return;
  }

  if (value.length === 0) {
    pushIssue(issues, path, 'Strict text line boxes must not be empty');
    return;
  }

  for (let index = 0; index < value.length; index++) {
    validateStrictTextLineBox(value[index], `${path}[${index}]`, issues);
  }
}

function validateStrictTextLineBox(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Strict text line box must be an object');
    return;
  }

  validateNonEmptyString(property(value, 'id'), `${path}.id`, 'Strict text line box id', issues);
  validateSafeInteger(property(value, 'x'), `${path}.x`, 'Strict text line box x', issues);
  validateSafeInteger(property(value, 'y'), `${path}.y`, 'Strict text line box y', issues);
  validateSafeNonNegativeInteger(
    property(value, 'width'),
    `${path}.width`,
    'Strict text line box width',
    issues,
  );
  validateSafeNonNegativeInteger(
    property(value, 'height'),
    `${path}.height`,
    'Strict text line box height',
    issues,
  );
  validateSafeInteger(
    property(value, 'baselineY'),
    `${path}.baselineY`,
    'Strict text line box baseline y',
    issues,
  );
}

function validateGlyphRuns(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Strict text glyph runs must be an array');
    return;
  }

  if (value.length === 0) {
    pushIssue(issues, path, 'Strict text glyph runs must not be empty');
    return;
  }

  for (let index = 0; index < value.length; index++) {
    validateGlyphRun(value[index], `${path}[${index}]`, issues);
  }
}

function validateGlyphRun(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Strict text glyph run must be an object');
    return;
  }

  validateNonEmptyString(property(value, 'id'), `${path}.id`, 'Strict text glyph run id', issues);
  validateFontId(property(value, 'fontId'), `${path}.fontId`, issues);
  validateNonEmptyString(
    property(value, 'lineBoxId'),
    `${path}.lineBoxId`,
    'Strict text glyph run line box id',
    issues,
  );
  validatePositionedGlyphs(property(value, 'glyphs'), `${path}.glyphs`, issues);
}

function validateStrictTextLinkage(
  lineBoxes: JsonValue | undefined,
  glyphRuns: JsonValue | undefined,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonArray(lineBoxes) || !isJsonArray(glyphRuns)) {
    return;
  }

  const lineBoxIds = new Set<string>();
  for (let index = 0; index < lineBoxes.length; index++) {
    const lineBox = lineBoxes[index];
    if (!isJsonObject(lineBox)) {
      continue;
    }

    const id = property(lineBox, 'id');
    if (typeof id !== 'string' || id.length === 0) {
      continue;
    }

    if (lineBoxIds.has(id)) {
      pushIssue(issues, `$.lineBoxes[${index}].id`, 'Strict text line box id must not be duplicated');
      continue;
    }
    lineBoxIds.add(id);
  }

  const glyphRunIds = new Set<string>();
  for (let index = 0; index < glyphRuns.length; index++) {
    const glyphRun = glyphRuns[index];
    if (!isJsonObject(glyphRun)) {
      continue;
    }

    const id = property(glyphRun, 'id');
    if (typeof id === 'string' && id.length > 0) {
      if (glyphRunIds.has(id)) {
        pushIssue(issues, `$.glyphRuns[${index}].id`, 'Strict text glyph run id must not be duplicated');
      } else {
        glyphRunIds.add(id);
      }
    }

    const lineBoxId = property(glyphRun, 'lineBoxId');
    if (typeof lineBoxId === 'string' && lineBoxId.length > 0 && !lineBoxIds.has(lineBoxId)) {
      pushIssue(
        issues,
        `$.glyphRuns[${index}].lineBoxId`,
        'Strict text glyph run line box id must reference an existing line box',
      );
    }
  }
}

function validatePositionedGlyphs(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Strict text glyphs must be an array');
    return;
  }

  if (value.length === 0) {
    pushIssue(issues, path, 'Strict text glyphs must not be empty');
    return;
  }

  for (let index = 0; index < value.length; index++) {
    validatePositionedGlyph(value[index], `${path}[${index}]`, issues);
  }
}

function validatePositionedGlyph(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureStrictTextFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Strict text glyph must be an object');
    return;
  }

  validateSafeNonNegativeInteger(
    property(value, 'glyphId'),
    `${path}.glyphId`,
    'Strict text glyph id',
    issues,
  );
  validateSafeInteger(property(value, 'x'), `${path}.x`, 'Strict text glyph x', issues);
  validateSafeInteger(property(value, 'y'), `${path}.y`, 'Strict text glyph y', issues);
  validateSafeInteger(
    property(value, 'xOffset'),
    `${path}.xOffset`,
    'Strict text glyph x offset',
    issues,
  );
  validateSafeInteger(
    property(value, 'yOffset'),
    `${path}.yOffset`,
    'Strict text glyph y offset',
    issues,
  );
  validateSafeNonNegativeInteger(
    property(value, 'advance'),
    `${path}.advance`,
    'Strict text glyph advance',
    issues,
  );
}

function validateMeshRuntimeProfile(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh runtime profile must be an object');
    return;
  }

  validateLiteral(
    property(value, 'numericProfile'),
    GEORDI_NUMERIC_PROFILE,
    `${path}.numericProfile`,
    'Mesh numeric profile',
    issues,
  );
  validateFeatureRequirements(property(value, 'requires'), `${path}.requires`, issues);
}

function validateMeshCamera(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh camera must be an object');
    return;
  }

  validateLiteral(
    property(value, 'coordinateSystem'),
    'right-handed',
    `${path}.coordinateSystem`,
    'Camera coordinate system',
    issues,
  );
  validateVector3(property(value, 'eye'), `${path}.eye`, 'Camera eye', issues);
  validateVector3(property(value, 'target'), `${path}.target`, 'Camera target', issues);
  validateVector3(property(value, 'up'), `${path}.up`, 'Camera up', issues);
}

function validateMeshProjection(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh projection must be an object');
    return;
  }

  validateLiteral(
    property(value, 'kind'),
    'perspective',
    `${path}.kind`,
    'Projection kind',
    issues,
  );
  validatePositiveFiniteNumber(
    property(value, 'verticalFovRadians'),
    `${path}.verticalFovRadians`,
    'Projection vertical FOV',
    issues,
  );
  const near = property(value, 'near');
  const far = property(value, 'far');
  validatePositiveFiniteNumber(near, `${path}.near`, 'Projection near', issues);
  validatePositiveFiniteNumber(far, `${path}.far`, 'Projection far', issues);
  const validNear = finiteNumber(near);
  const validFar = finiteNumber(far);
  if (
    validNear !== undefined &&
    validFar !== undefined &&
    validNear > 0 &&
    validFar > 0 &&
    validNear >= validFar
  ) {
    pushIssue(issues, `${path}.near`, 'Projection near must be less than projection far');
  }
  validateCanvas(property(value, 'viewport'), `${path}.viewport`, issues);
}

function validateMeshMaterial(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh material must be an object');
    return;
  }

  validateLiteral(property(value, 'kind'), 'solid', `${path}.kind`, 'Material kind', issues);
  validateHexColor(property(value, 'color'), `${path}.color`, 'Material color', issues);
  validateHexColor(
    property(value, 'backgroundColor'),
    `${path}.backgroundColor`,
    'Material background color',
    issues,
  );
}

function validateMeshPlayback(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshFixtureManifestIssue[],
): void {
  if (!isJsonObject(value)) {
    pushIssue(issues, path, 'Mesh playback must be an object');
    return;
  }

  validateLiteral(
    property(value, 'kind'),
    'fixed-rate-rotation',
    `${path}.kind`,
    'Playback kind',
    issues,
  );
  const axisValue = property(value, 'axis');
  validateVector3(axisValue, `${path}.axis`, 'Playback axis', issues);
  const axis = vector3FromJsonValue(axisValue);
  if (axis !== undefined && vectorLength(axis) === 0) {
    pushIssue(issues, `${path}.axis`, 'Playback axis must not be the zero vector');
  }
  validatePositiveFiniteNumber(
    property(value, 'radiansPerSecond'),
    `${path}.radiansPerSecond`,
    'Playback radians per second',
    issues,
  );
  validatePositiveInteger(
    property(value, 'sampleRate'),
    `${path}.sampleRate`,
    'Playback sample rate',
    issues,
  );
}

function validateVertexProperties(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Vertex properties must be an array');
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const propertyName = value[index];
    const itemPath = `${path}[${index}]`;
    if (typeof propertyName !== 'string' || propertyName.length === 0) {
      pushIssue(issues, itemPath, 'Vertex property must be a non-empty string');
      continue;
    }

    if (seen.has(propertyName)) {
      pushIssue(issues, itemPath, 'Vertex property must not be duplicated');
    }
    seen.add(propertyName);
  }

  for (const requiredProperty of ['x', 'y', 'z']) {
    if (!seen.has(requiredProperty)) {
      pushIssue(issues, path, `Vertex properties must include "${requiredProperty}"`);
    }
  }
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

  if (!isFixtureLocalRelativePath(value)) {
    pushIssue(issues, path, `${label} must be a relative fixture-local path`);
  }
}

function isFixtureLocalRelativePath(value: string): boolean {
  return (
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('..') &&
    !WINDOWS_DRIVE_PREFIX_PATTERN.test(value) &&
    !URL_SCHEME_PATTERN.test(value)
  );
}

function validateVector3(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, `${label} must be an array`);
    return;
  }

  if (value.length !== 3) {
    pushIssue(issues, path, `${label} must contain exactly three numbers`);
    return;
  }

  for (let index = 0; index < value.length; index++) {
    if (finiteNumber(value[index]) === undefined) {
      pushIssue(issues, `${path}[${index}]`, `${label} coordinate must be finite`);
    }
  }
}

function vector3FromJsonValue(value: JsonValue | undefined): RenderFixtureVector3 | undefined {
  if (!isJsonArray(value) || value.length !== 3) {
    return undefined;
  }

  const first = finiteNumber(value[0]);
  const second = finiteNumber(value[1]);
  const third = finiteNumber(value[2]);
  if (first === undefined || second === undefined || third === undefined) {
    return undefined;
  }

  return [first, second, third];
}

function normalizePlaybackAxis(axis: RenderFixtureVector3): RenderFixtureVector3 | undefined {
  const length = vectorLength(axis);
  if (length === 0) {
    return undefined;
  }

  return [axis[0] / length, axis[1] / length, axis[2] / length];
}

function vectorLength(axis: RenderFixtureVector3): number {
  return Math.hypot(axis[0], axis[1], axis[2]);
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

function validateIsoDate(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureMeshAssetManifestIssue[],
): void {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    pushIssue(issues, path, `${label} must be an ISO date`);
  }
}

function validatePositiveFiniteNumber(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  const number = finiteNumber(value);
  if (number === undefined || number <= 0) {
    pushIssue(issues, path, `${label} must be positive and finite`);
  }
}

function validateHexColor(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/u.test(value)) {
    pushIssue(issues, path, `${label} must be lowercase #rrggbb`);
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

function validateNonNegativeInteger(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (nonNegativeInteger(value) === undefined) {
    pushIssue(issues, path, `${label} must be a non-negative integer`);
  }
}

function validateSafeNonNegativeInteger(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (safeNonNegativeInteger(value) === undefined) {
    pushIssue(issues, path, `${label} must be a safe non-negative integer`);
  }
}

function validateSafeInteger(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (safeInteger(value) === undefined) {
    pushIssue(issues, path, `${label} must be a safe integer`);
  }
}

function validateBoolean(
  value: JsonValue | undefined,
  path: string,
  label: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'boolean') {
    pushIssue(issues, path, `${label} must be a boolean`);
  }
}

function validateFontId(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'string' || !FONT_ID_PATTERN.test(value)) {
    pushIssue(issues, path, 'Font id must be lowercase kebab-case ASCII');
  }
}

function validateFontWeight(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  const weight = positiveInteger(value);
  if (weight === undefined || weight > 1000) {
    pushIssue(issues, path, 'Font weight must be an integer from 1 through 1000');
  }
}

function validateReservedFontNames(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (!isJsonArray(value)) {
    pushIssue(issues, path, 'Reserved font names must be an array');
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const name = value[index];
    const itemPath = `${path}[${index}]`;
    if (typeof name !== 'string' || name.length === 0) {
      pushIssue(issues, itemPath, 'Reserved font name must be a non-empty string');
      continue;
    }

    if (seen.has(name)) {
      pushIssue(issues, itemPath, 'Reserved font name must not be duplicated');
    }
    seen.add(name);
  }
}

function validateGitCommit(
  value: JsonValue | undefined,
  path: string,
  issues: RenderFixtureManifestIssue[],
): void {
  if (typeof value !== 'string' || value.length !== GIT_COMMIT_HEX_LENGTH || !isLowercaseHex(value)) {
    pushIssue(issues, path, 'Font source commit must be a lowercase full git commit hash');
  }
}

function positiveInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function safeNonNegativeInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function safeInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function finiteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function pushArtifactIssue(
  issues: RenderFixtureArtifactIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function sameRequirements(
  left: readonly GeordiFeatureRequirement[],
  right: readonly GeordiFeatureRequirement[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function sameString(left: string, right: string): boolean {
  return left === right;
}

function sceneDimensionMatchesCanvas(sceneDimension: number, canvasDimension: number): boolean {
  return (
    Number.isFinite(sceneDimension) &&
    Number.isInteger(sceneDimension) &&
    sceneDimension === canvasDimension
  );
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
