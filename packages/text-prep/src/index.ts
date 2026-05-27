import { createHash } from 'node:crypto';
import { canonicalJsonPort, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

export const TEXT_PREP_INPUT_VERSION = 'geordi-text-prep-input/1' as const;
export const TEXT_PREP_BOUNDARY_PROFILE = 'geordi-text-prep-boundary/1' as const;
export const TEXT_PREP_GENERATION_PLAN_VERSION = 'geordi-text-prep-generation-plan/1' as const;
export const TEXT_PREP_GENERATION_PLAN_STATUS = 'input-validated/1' as const;
export const TEXT_PREP_GENERATION_PLAN_FILENAME = 'text-prep.generation-plan.geordi.json' as const;
export const TEXT_PREP_GENERATED_OUTPUT_VERSION = 'geordi-text-prep-generated-output/1' as const;
export const TEXT_PREP_SHAPING_FINGERPRINT_PROFILE =
  'geordi-text-prep-shaping-fingerprint/1' as const;
export const STRICT_POSITIONED_GLYPH_RUN_PROFILE = 'geordi-strict-positioned-glyph-run/1' as const;
export const FIXED_26_6_POSITION_ENCODING = 'geordi-fixed-26.6/1' as const;
export const UTF8_SOURCE_ENCODING = 'utf-8/1' as const;
export const TTF_FONT_FORMAT = 'ttf' as const;
export const OUTLINE_PATHS_EVIDENCE_KIND = 'outlinePaths' as const;

export type TextPrepDiagnosticCode =
  | 'GEORDI_TEXT_PREP_BAD_INPUT'
  | 'GEORDI_TEXT_PREP_BAD_PATH'
  | 'GEORDI_TEXT_PREP_HOST_FONT_LOOKUP'
  | 'GEORDI_TEXT_PREP_IO_ERROR'
  | 'GEORDI_TEXT_PREP_FALLBACK_REQUIRED'
  | 'GEORDI_TEXT_PREP_MISSING_FINGERPRINT'
  | 'GEORDI_TEXT_PREP_UNSUPPORTED_BIDI'
  | 'GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE'
  | 'GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES'
  | 'GEORDI_TEXT_PREP_UNSTABLE_INPUT';

export interface TextPrepDiagnostic extends JsonObject {
  readonly code: TextPrepDiagnosticCode;
  readonly message: string;
  readonly path: string;
}

export interface TextPrepInputSource extends JsonObject {
  readonly normalizationProfile: string;
  readonly semanticLanguage: string;
  readonly sourceEncoding: typeof UTF8_SOURCE_ENCODING;
  readonly sourceText: string;
  readonly sourceTextHash: string;
}

export interface TextPrepInputFont extends JsonObject {
  readonly faceIndex: number;
  readonly fontFileHash: string;
  readonly fontFormat: typeof TTF_FONT_FORMAT;
  readonly fontId: string;
  readonly fontPackHash: string;
  readonly fontPackPath: string;
}

export interface TextPrepInputShaping extends JsonObject {
  readonly direction: 'ltr';
  readonly language: string;
  readonly openTypeFeatures: readonly string[];
  readonly script: 'Latn';
  readonly shapingFingerprintHash: string;
  readonly shapingFingerprintPath: string;
  readonly shapingProfile: typeof TEXT_PREP_SHAPING_FINGERPRINT_PROFILE;
  readonly variationAxes: readonly string[];
}

export interface TextPrepInputGeometry extends JsonObject {
  readonly baselinePolicy: string;
  readonly coordinateSpace: string;
  readonly lineBoxPolicy: string;
  readonly positionEncoding: typeof FIXED_26_6_POSITION_ENCODING;
  readonly pxPerEm: number;
  readonly roundingPolicy: string;
}

export interface TextPrepInputOutput extends JsonObject {
  readonly evidenceKind: typeof OUTLINE_PATHS_EVIDENCE_KIND;
  readonly fixtureId: string;
}

export interface TextPrepInput extends JsonObject {
  readonly font: TextPrepInputFont;
  readonly geometry: TextPrepInputGeometry;
  readonly id: string;
  readonly inputVersion: typeof TEXT_PREP_INPUT_VERSION;
  readonly output: TextPrepInputOutput;
  readonly shaping: TextPrepInputShaping;
  readonly source: TextPrepInputSource;
  readonly textPrepBoundary: typeof TEXT_PREP_BOUNDARY_PROFILE;
  readonly textProfile: typeof STRICT_POSITIONED_GLYPH_RUN_PROFILE;
}

export interface TextPrepPlanSource extends JsonObject {
  readonly normalizationProfile: string;
  readonly semanticLanguage: string;
  readonly sourceEncoding: typeof UTF8_SOURCE_ENCODING;
  readonly sourceTextHash: string;
}

export interface TextPrepPlanShaping extends JsonObject {
  readonly direction: 'ltr';
  readonly language: string;
  readonly openTypeFeaturesHash: string;
  readonly script: 'Latn';
  readonly shapingFingerprintHash: string;
  readonly shapingFingerprintPath: string;
  readonly shapingProfile: typeof TEXT_PREP_SHAPING_FINGERPRINT_PROFILE;
  readonly variationAxesHash: string;
}

export interface TextPrepGenerationPlan extends JsonObject {
  readonly boundaryProfile: typeof TEXT_PREP_BOUNDARY_PROFILE;
  readonly compliance: 'not-renderer-input/1';
  readonly font: TextPrepInputFont;
  readonly generatedOutputVersion: typeof TEXT_PREP_GENERATED_OUTPUT_VERSION;
  readonly geometry: TextPrepInputGeometry;
  readonly id: string;
  readonly inputHash: string;
  readonly mayFeedStrictRenderer: false;
  readonly output: TextPrepInputOutput;
  readonly planVersion: typeof TEXT_PREP_GENERATION_PLAN_VERSION;
  readonly shaping: TextPrepPlanShaping;
  readonly source: TextPrepPlanSource;
  readonly status: typeof TEXT_PREP_GENERATION_PLAN_STATUS;
  readonly textProfile: typeof STRICT_POSITIONED_GLYPH_RUN_PROFILE;
}

export interface TextPrepValidationFailure {
  readonly diagnostics: readonly TextPrepDiagnostic[];
  readonly ok: false;
}

export interface TextPrepValidationSuccess {
  readonly input: TextPrepInput;
  readonly ok: true;
}

export type TextPrepValidationResult = TextPrepValidationFailure | TextPrepValidationSuccess;

export interface TextPrepPlanFailure {
  readonly diagnostics: readonly TextPrepDiagnostic[];
  readonly ok: false;
}

export interface TextPrepPlanSuccess {
  readonly plan: TextPrepGenerationPlan;
  readonly serializedPlan: string;
  readonly ok: true;
}

export type TextPrepPlanResult = TextPrepPlanFailure | TextPrepPlanSuccess;

export class TextPrepValidationError extends Error {
  public readonly diagnostics: readonly TextPrepDiagnostic[];

  constructor(diagnostics: readonly TextPrepDiagnostic[]) {
    super('Geordi text-prep input validation failed');
    this.name = new.target.name;
    this.diagnostics = diagnostics;
  }
}

export function validateTextPrepInput(value: JsonValue): TextPrepValidationResult {
  const diagnostics: TextPrepDiagnostic[] = [];

  if (!isJsonObject(value)) {
    return failure([
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$',
        'Text-prep input must be a JSON object.',
      ),
    ]);
  }

  const inputVersion = requireString(value, 'inputVersion', '$.inputVersion', diagnostics);
  const textPrepBoundary = requireString(
    value,
    'textPrepBoundary',
    '$.textPrepBoundary',
    diagnostics,
  );
  const textProfile = requireString(value, 'textProfile', '$.textProfile', diagnostics);
  const id = requireString(value, 'id', '$.id', diagnostics);

  if (inputVersion !== undefined && inputVersion !== TEXT_PREP_INPUT_VERSION) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$.inputVersion',
        `Expected ${TEXT_PREP_INPUT_VERSION}.`,
      ),
    );
  }
  if (textPrepBoundary !== undefined && textPrepBoundary !== TEXT_PREP_BOUNDARY_PROFILE) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$.textPrepBoundary',
        `Expected ${TEXT_PREP_BOUNDARY_PROFILE}.`,
      ),
    );
  }
  if (textProfile !== undefined && textProfile !== STRICT_POSITIONED_GLYPH_RUN_PROFILE) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$.textProfile',
        `Expected ${STRICT_POSITIONED_GLYPH_RUN_PROFILE}.`,
      ),
    );
  }

  const source = validateSource(requireObject(value, 'source', '$.source', diagnostics), diagnostics);
  const font = validateFont(requireObject(value, 'font', '$.font', diagnostics), diagnostics);
  const shaping = validateShaping(
    requireObject(value, 'shaping', '$.shaping', diagnostics),
    diagnostics,
  );
  const geometry = validateGeometry(
    requireObject(value, 'geometry', '$.geometry', diagnostics),
    diagnostics,
  );
  const output = validateOutput(requireObject(value, 'output', '$.output', diagnostics), diagnostics);

  if (
    diagnostics.length > 0 ||
    id === undefined ||
    inputVersion !== TEXT_PREP_INPUT_VERSION ||
    textPrepBoundary !== TEXT_PREP_BOUNDARY_PROFILE ||
    textProfile !== STRICT_POSITIONED_GLYPH_RUN_PROFILE ||
    source === undefined ||
    font === undefined ||
    shaping === undefined ||
    geometry === undefined ||
    output === undefined
  ) {
    return failure(diagnostics);
  }

  return {
    input: {
      font,
      geometry,
      id,
      inputVersion,
      output,
      shaping,
      source,
      textPrepBoundary,
      textProfile,
    },
    ok: true,
  };
}

export function prepareTextPrepGenerationPlan(source: string): TextPrepPlanResult {
  let parsed: JsonValue;
  try {
    parsed = canonicalJsonPort.parse(source);
  } catch {
    return failure([
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$',
        'Text-prep input must be valid canonical JSON.',
      ),
    ]);
  }

  const validation = validateTextPrepInput(parsed);
  if (!validation.ok) {
    return validation;
  }

  const plan = createTextPrepGenerationPlan(validation.input);

  return {
    ok: true,
    plan,
    serializedPlan: serializeTextPrepGenerationPlan(plan),
  };
}

export function assertTextPrepInput(value: JsonValue): TextPrepInput {
  const result = validateTextPrepInput(value);
  if (!result.ok) {
    throw new TextPrepValidationError(result.diagnostics);
  }

  return result.input;
}

export function createTextPrepGenerationPlan(input: TextPrepInput): TextPrepGenerationPlan {
  const source: TextPrepPlanSource = {
    normalizationProfile: input.source.normalizationProfile,
    semanticLanguage: input.source.semanticLanguage,
    sourceEncoding: input.source.sourceEncoding,
    sourceTextHash: input.source.sourceTextHash,
  };
  const shaping: TextPrepPlanShaping = {
    direction: input.shaping.direction,
    language: input.shaping.language,
    openTypeFeaturesHash: sha256Json(input.shaping.openTypeFeatures),
    script: input.shaping.script,
    shapingFingerprintHash: input.shaping.shapingFingerprintHash,
    shapingFingerprintPath: input.shaping.shapingFingerprintPath,
    shapingProfile: input.shaping.shapingProfile,
    variationAxesHash: sha256Json(input.shaping.variationAxes),
  };
  const inputHash = sha256Json({
    font: input.font,
    geometry: input.geometry,
    id: input.id,
    inputVersion: input.inputVersion,
    output: input.output,
    shaping,
    source,
    textPrepBoundary: input.textPrepBoundary,
    textProfile: input.textProfile,
  });

  return {
    boundaryProfile: TEXT_PREP_BOUNDARY_PROFILE,
    compliance: 'not-renderer-input/1',
    font: input.font,
    generatedOutputVersion: TEXT_PREP_GENERATED_OUTPUT_VERSION,
    geometry: input.geometry,
    id: input.id,
    inputHash,
    mayFeedStrictRenderer: false,
    output: input.output,
    planVersion: TEXT_PREP_GENERATION_PLAN_VERSION,
    shaping,
    source,
    status: TEXT_PREP_GENERATION_PLAN_STATUS,
    textProfile: STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  };
}

export function serializeTextPrepGenerationPlan(plan: TextPrepGenerationPlan): string {
  return `${canonicalJsonPort.stringify(plan, { space: 2 })}\n`;
}

export function formatTextPrepDiagnostics(diagnostics: readonly TextPrepDiagnostic[]): string {
  return `${canonicalJsonPort.stringify(
    {
      diagnostics,
      ok: false,
    },
    { space: 2 },
  )}\n`;
}

export function sha256Utf8(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function sha256Json(value: JsonValue): string {
  return sha256Utf8(canonicalJsonPort.stringify(value));
}

function validateSource(
  source: JsonObject | undefined,
  diagnostics: TextPrepDiagnostic[],
): TextPrepInputSource | undefined {
  if (source === undefined) {
    return undefined;
  }

  const sourceText = requireString(source, 'sourceText', '$.source.sourceText', diagnostics);
  const sourceTextHash = requireString(
    source,
    'sourceTextHash',
    '$.source.sourceTextHash',
    diagnostics,
  );
  const sourceEncoding = requireString(
    source,
    'sourceEncoding',
    '$.source.sourceEncoding',
    diagnostics,
  );
  const normalizationProfile = requireString(
    source,
    'normalizationProfile',
    '$.source.normalizationProfile',
    diagnostics,
  );
  const semanticLanguage = requireString(
    source,
    'semanticLanguage',
    '$.source.semanticLanguage',
    diagnostics,
  );

  if (sourceText !== undefined && /[\r\n]/u.test(sourceText)) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE',
        '$.source.sourceText',
        'The first strict text-prep profile supports one line only.',
      ),
    );
  }

  if (sourceEncoding !== undefined && sourceEncoding !== UTF8_SOURCE_ENCODING) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$.source.sourceEncoding',
        `Expected ${UTF8_SOURCE_ENCODING}.`,
      ),
    );
  }

  if (
    normalizationProfile !== undefined &&
    !normalizationProfile.startsWith('unicode-nfc/')
  ) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_UNSTABLE_INPUT',
        '$.source.normalizationProfile',
        'The first text-prep profile requires an explicit unicode-nfc normalization profile.',
      ),
    );
  }

  if (sourceText !== undefined && normalizationProfile !== undefined) {
    const normalizedSourceText = sourceText.normalize('NFC');
    if (sourceText !== normalizedSourceText) {
      diagnostics.push(
        diagnostic(
          'GEORDI_TEXT_PREP_UNSTABLE_INPUT',
          '$.source.sourceText',
          'Source text must already be normalized according to the declared profile.',
        ),
      );
    }

    if (sourceTextHash !== undefined && sourceTextHash !== sha256Utf8(normalizedSourceText)) {
      diagnostics.push(
        diagnostic(
          'GEORDI_TEXT_PREP_UNSTABLE_INPUT',
          '$.source.sourceTextHash',
          'sourceTextHash must match the normalized UTF-8 source text.',
        ),
      );
    }
  }

  if (
    sourceText === undefined ||
    sourceTextHash === undefined ||
    sourceEncoding !== UTF8_SOURCE_ENCODING ||
    normalizationProfile === undefined ||
    semanticLanguage === undefined
  ) {
    return undefined;
  }

  return {
    normalizationProfile,
    semanticLanguage,
    sourceEncoding,
    sourceText,
    sourceTextHash,
  };
}

function validateFont(
  font: JsonObject | undefined,
  diagnostics: TextPrepDiagnostic[],
): TextPrepInputFont | undefined {
  if (font === undefined) {
    return undefined;
  }

  const fontPackPath = requireString(font, 'fontPackPath', '$.font.fontPackPath', diagnostics);
  const fontPackHash = requireHash(font, 'fontPackHash', '$.font.fontPackHash', diagnostics);
  const fontId = requireString(font, 'fontId', '$.font.fontId', diagnostics);
  const fontFileHash = requireHash(font, 'fontFileHash', '$.font.fontFileHash', diagnostics);
  const faceIndex = requireInteger(font, 'faceIndex', '$.font.faceIndex', diagnostics);
  const fontFormat = requireString(font, 'fontFormat', '$.font.fontFormat', diagnostics);

  rejectHostFontLookup(font, diagnostics);
  rejectFallbackFonts(font, '$.font', diagnostics);

  if (fontPackPath !== undefined) {
    validateRepoRelativePath(fontPackPath, '$.font.fontPackPath', diagnostics);
  }
  if (fontFormat !== undefined && fontFormat !== TTF_FONT_FORMAT) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', '$.font.fontFormat', `Expected ${TTF_FONT_FORMAT}.`),
    );
  }
  if (faceIndex !== undefined && faceIndex < 0) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', '$.font.faceIndex', 'faceIndex must be >= 0.'),
    );
  }

  if (
    fontPackPath === undefined ||
    fontPackHash === undefined ||
    fontId === undefined ||
    fontFileHash === undefined ||
    faceIndex === undefined ||
    fontFormat !== TTF_FONT_FORMAT
  ) {
    return undefined;
  }

  return {
    faceIndex,
    fontFileHash,
    fontFormat,
    fontId,
    fontPackHash,
    fontPackPath,
  };
}

function validateShaping(
  shaping: JsonObject | undefined,
  diagnostics: TextPrepDiagnostic[],
): TextPrepInputShaping | undefined {
  if (shaping === undefined) {
    return undefined;
  }

  const shapingProfile = requireString(
    shaping,
    'shapingProfile',
    '$.shaping.shapingProfile',
    diagnostics,
  );
  const shapingFingerprintPath = requireString(
    shaping,
    'shapingFingerprintPath',
    '$.shaping.shapingFingerprintPath',
    diagnostics,
  );
  const shapingFingerprintHash = requireHash(
    shaping,
    'shapingFingerprintHash',
    '$.shaping.shapingFingerprintHash',
    diagnostics,
  );
  const script = requireString(shaping, 'script', '$.shaping.script', diagnostics);
  const language = requireString(shaping, 'language', '$.shaping.language', diagnostics);
  const direction = requireString(shaping, 'direction', '$.shaping.direction', diagnostics);
  const openTypeFeatures = requireStringArray(
    shaping,
    'openTypeFeatures',
    '$.shaping.openTypeFeatures',
    diagnostics,
  );
  const variationAxes = requireStringArray(
    shaping,
    'variationAxes',
    '$.shaping.variationAxes',
    diagnostics,
  );

  rejectFallbackFonts(shaping, '$.shaping', diagnostics);

  if (
    shapingProfile !== undefined &&
    shapingProfile !== TEXT_PREP_SHAPING_FINGERPRINT_PROFILE
  ) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_MISSING_FINGERPRINT',
        '$.shaping.shapingProfile',
        `Expected ${TEXT_PREP_SHAPING_FINGERPRINT_PROFILE}.`,
      ),
    );
  }
  if (shapingFingerprintPath !== undefined) {
    validateRepoRelativePath(
      shapingFingerprintPath,
      '$.shaping.shapingFingerprintPath',
      diagnostics,
    );
  }
  if (script !== undefined && script !== 'Latn') {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_UNSUPPORTED_BIDI',
        '$.shaping.script',
        'The first text-prep profile supports Latin script only.',
      ),
    );
  }
  if (direction !== undefined && direction !== 'ltr') {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_UNSUPPORTED_BIDI',
        '$.shaping.direction',
        'The first text-prep profile supports left-to-right text only.',
      ),
    );
  }
  if (variationAxes !== undefined && variationAxes.length > 0) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES',
        '$.shaping.variationAxes',
        'Variable font axes require a future axis fingerprint profile.',
      ),
    );
  }

  if (
    shapingProfile !== TEXT_PREP_SHAPING_FINGERPRINT_PROFILE ||
    shapingFingerprintPath === undefined ||
    shapingFingerprintHash === undefined ||
    script !== 'Latn' ||
    language === undefined ||
    direction !== 'ltr' ||
    openTypeFeatures === undefined ||
    variationAxes === undefined
  ) {
    return undefined;
  }

  return {
    direction,
    language,
    openTypeFeatures,
    script,
    shapingFingerprintHash,
    shapingFingerprintPath,
    shapingProfile,
    variationAxes,
  };
}

function validateGeometry(
  geometry: JsonObject | undefined,
  diagnostics: TextPrepDiagnostic[],
): TextPrepInputGeometry | undefined {
  if (geometry === undefined) {
    return undefined;
  }

  const positionEncoding = requireString(
    geometry,
    'positionEncoding',
    '$.geometry.positionEncoding',
    diagnostics,
  );
  const pxPerEm = requireFinitePositiveNumber(
    geometry,
    'pxPerEm',
    '$.geometry.pxPerEm',
    diagnostics,
  );
  const coordinateSpace = requireString(
    geometry,
    'coordinateSpace',
    '$.geometry.coordinateSpace',
    diagnostics,
  );
  const roundingPolicy = requireString(
    geometry,
    'roundingPolicy',
    '$.geometry.roundingPolicy',
    diagnostics,
  );
  const baselinePolicy = requireString(
    geometry,
    'baselinePolicy',
    '$.geometry.baselinePolicy',
    diagnostics,
  );
  const lineBoxPolicy = requireString(
    geometry,
    'lineBoxPolicy',
    '$.geometry.lineBoxPolicy',
    diagnostics,
  );

  if (positionEncoding !== undefined && positionEncoding !== FIXED_26_6_POSITION_ENCODING) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$.geometry.positionEncoding',
        `Expected ${FIXED_26_6_POSITION_ENCODING}.`,
      ),
    );
  }

  if (
    positionEncoding !== FIXED_26_6_POSITION_ENCODING ||
    pxPerEm === undefined ||
    coordinateSpace === undefined ||
    roundingPolicy === undefined ||
    baselinePolicy === undefined ||
    lineBoxPolicy === undefined
  ) {
    return undefined;
  }

  return {
    baselinePolicy,
    coordinateSpace,
    lineBoxPolicy,
    positionEncoding,
    pxPerEm,
    roundingPolicy,
  };
}

function validateOutput(
  output: JsonObject | undefined,
  diagnostics: TextPrepDiagnostic[],
): TextPrepInputOutput | undefined {
  if (output === undefined) {
    return undefined;
  }

  const fixtureId = requireString(output, 'fixtureId', '$.output.fixtureId', diagnostics);
  const evidenceKind = requireString(output, 'evidenceKind', '$.output.evidenceKind', diagnostics);

  if (evidenceKind !== undefined && evidenceKind !== OUTLINE_PATHS_EVIDENCE_KIND) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_INPUT',
        '$.output.evidenceKind',
        `Expected ${OUTLINE_PATHS_EVIDENCE_KIND}.`,
      ),
    );
  }

  if (fixtureId === undefined || evidenceKind !== OUTLINE_PATHS_EVIDENCE_KIND) {
    return undefined;
  }

  return {
    evidenceKind,
    fixtureId,
  };
}

function rejectHostFontLookup(font: JsonObject, diagnostics: TextPrepDiagnostic[]): void {
  for (const key of ['hostFontFamily', 'systemFontFamily', 'localFontName', 'hostFontPath']) {
    if (property(font, key) !== undefined) {
      diagnostics.push(
        diagnostic(
          'GEORDI_TEXT_PREP_HOST_FONT_LOOKUP',
          `$.font.${key}`,
          'Text prep must use content-addressed font pack identity, not host font lookup.',
        ),
      );
    }
  }
}

function rejectFallbackFonts(
  object: JsonObject,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): void {
  for (const key of ['fallbackFonts', 'fallbackFontIds', 'fallbackChain']) {
    const fallback = property(object, key);
    if (fallback === undefined) {
      continue;
    }
    if (!Array.isArray(fallback) || fallback.length > 0) {
      diagnostics.push(
        diagnostic(
          'GEORDI_TEXT_PREP_FALLBACK_REQUIRED',
          `${path}.${key}`,
          'The first strict text-prep profile rejects fallback chains.',
        ),
      );
    }
  }
}

function requireObject(
  object: JsonObject,
  key: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): JsonObject | undefined {
  const value = property(object, key);
  if (!isJsonObject(value)) {
    diagnostics.push(diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', path, `${path} must be an object.`));
    return undefined;
  }

  return value;
}

function requireString(
  object: JsonObject,
  key: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): string | undefined {
  const value = property(object, key);
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', path, `${path} must be a non-empty string.`),
    );
    return undefined;
  }

  return value;
}

function requireHash(
  object: JsonObject,
  key: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): string | undefined {
  const value = requireString(object, key, path, diagnostics);
  if (value === undefined) {
    return undefined;
  }

  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', path, `${path} must be a sha256 hash.`),
    );
    return undefined;
  }

  return value;
}

function requireInteger(
  object: JsonObject,
  key: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): number | undefined {
  const value = property(object, key);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    diagnostics.push(diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', path, `${path} must be an integer.`));
    return undefined;
  }

  return value;
}

function requireFinitePositiveNumber(
  object: JsonObject,
  key: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): number | undefined {
  const value = property(object, key);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', path, `${path} must be a finite positive number.`),
    );
    return undefined;
  }

  return value;
}

function requireStringArray(
  object: JsonObject,
  key: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): readonly string[] | undefined {
  const value = property(object, key);
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', path, `${path} must be an array.`));
    return undefined;
  }

  const strings: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string') {
      diagnostics.push(
        diagnostic(
          'GEORDI_TEXT_PREP_BAD_INPUT',
          `${path}[${index}]`,
          `${path}[${index}] must be a string.`,
        ),
      );
      continue;
    }
    strings.push(item);
  }

  return strings;
}

function validateRepoRelativePath(
  value: string,
  path: string,
  diagnostics: TextPrepDiagnostic[],
): void {
  const segments = value.split('/');
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes('\\') ||
    value.includes('://') ||
    segments.includes('..') ||
    segments.includes('')
  ) {
    diagnostics.push(
      diagnostic(
        'GEORDI_TEXT_PREP_BAD_PATH',
        path,
        `${path} must be a repository-relative POSIX path.`,
      ),
    );
  }
}

function failure(diagnostics: readonly TextPrepDiagnostic[]): TextPrepValidationFailure {
  return {
    diagnostics,
    ok: false,
  };
}

function diagnostic(
  code: TextPrepDiagnosticCode,
  path: string,
  message: string,
): TextPrepDiagnostic {
  return {
    code,
    message,
    path,
  };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function property(object: JsonObject, key: string): JsonValue | undefined {
  return object[key];
}
