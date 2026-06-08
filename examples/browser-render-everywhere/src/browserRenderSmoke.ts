import {
  canonicalJsonPort,
  validateGeordiIr,
  type GeordiIr,
  type GeordiIrValidationIssue,
  type JsonPort,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  assertRenderFixtureStrictTextFontReferences,
  assertRenderFixtureArtifact,
  parseRenderFixtureFontPackManifest,
  parseRenderFixtureStrictTextOutlineEvidencePack,
  parseRenderFixtureStrictTextFixtureManifest,
  parseRenderFixtureManifest,
  RenderFixtureInvalidFontPackManifestError,
  RenderFixtureInvalidStrictTextEvidenceCoverageError,
  RenderFixtureInvalidStrictTextEvidenceLineBoxError,
  RenderFixtureInvalidStrictTextFontReferenceError,
  RenderFixtureInvalidStrictTextOutlineEvidencePackError,
  RenderFixtureInvalidStrictTextFixtureManifestError,
  type RenderFixtureFontPackManifestIssue,
  type RenderFixtureStrictTextFontReferenceIssue,
  type RenderFixtureManifest,
  type RenderFixtureStrictTextOutlineEvidencePackIssue,
  type RenderFixtureStrictTextFixtureManifest,
  type RenderFixtureStrictTextFixtureManifestIssue,
} from '@flyingrobots/geordi-render-fixture';
import { renderGeordiToCanvas } from '@flyingrobots/geordi-runtime-webgl';
import {
  renderStrictTextOutlineGlyphsToCanvas,
  type BrowserStrictTextOutlineRenderResult,
} from './strictTextRender.js';

export interface BrowserRenderFixtureAssets {
  readonly manifestUrl: string;
  readonly sceneUrl: string;
}

export interface BrowserStrictTextFixtureAssets {
  readonly fixtureUrl: string;
}

export interface BrowserStrictTextRenderFixtureAssets {
  readonly evidenceUrl: string;
  readonly fontPackUrl: string;
  readonly fixtureUrl: string;
}

export interface BrowserRenderFixtureResult {
  readonly canvas: HTMLCanvasElement;
  readonly ir: GeordiIr;
  readonly manifest: RenderFixtureManifest;
}

export interface BrowserStrictTextFixtureRejection {
  readonly fixtureUrl: string;
  readonly issues: readonly RenderFixtureStrictTextFixtureManifestIssue[];
  readonly rejected: true;
}

export interface BrowserStrictTextMetadataReport {
  readonly commandCount: number;
  readonly drawGlyphCount: number;
  readonly evidenceHash: string;
  readonly evidenceKind: string;
  readonly evidencePackId: string;
  readonly fixtureHash: string;
  readonly fixtureId: string;
  readonly fontPackHash: string;
  readonly fontPackPath: string;
  readonly glyphCount: number;
  readonly glyphRunHash: string;
  readonly lineBoxHash: string;
  readonly positionEncoding: string;
  readonly rendererName: string;
  readonly semanticTextAffectsPixels: false;
  readonly semanticTextLanguage: string;
  readonly semanticTextRole: 'non-rendering metadata; pixels follow glyph evidence';
  readonly semanticTextSource: string;
  readonly textProfile: string;
}

export interface BrowserStrictTextRenderFixtureResult extends BrowserStrictTextOutlineRenderResult {
  readonly metadata: BrowserStrictTextMetadataReport;
}

export interface BrowserStrictTextRenderFixtureOptions {
  readonly assets: BrowserStrictTextRenderFixtureAssets;
  readonly fetchText: BrowserHarnessFetchText;
  readonly jsonPort?: JsonPort;
}

export interface BrowserHarnessFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type BrowserHarnessFetch = (
  url: string,
) => Promise<BrowserHarnessFetchResponse>;

export type BrowserHarnessFetchText = (url: string) => Promise<string>;

export type BrowserHarnessRenderer = (ir: GeordiIr) => HTMLCanvasElement;

export type BrowserHarnessArtifactHasher = (source: string) => Promise<string>;

export interface BrowserRenderFixtureOptions {
  readonly assets: BrowserRenderFixtureAssets;
  readonly fetchText: BrowserHarnessFetchText;
  readonly hashArtifact?: BrowserHarnessArtifactHasher;
  readonly jsonPort?: JsonPort;
  readonly render?: BrowserHarnessRenderer;
}

export interface BrowserStrictTextFixtureOptions {
  readonly assets: BrowserStrictTextFixtureAssets;
  readonly fetchText: BrowserHarnessFetchText;
  readonly jsonPort?: JsonPort;
}

export class BrowserHarnessFetchError extends Error {
  public readonly status: number | undefined;
  public readonly url: string;

  constructor(url: string, status: number | undefined) {
    super('Browser harness fetch failed');
    this.name = new.target.name;
    this.status = status;
    this.url = url;
  }
}

export class BrowserHarnessArtifactHashError extends Error {
  constructor() {
    super('Browser harness artifact hash failed');
    this.name = new.target.name;
  }
}

export class BrowserHarnessInvalidIrError extends Error {
  public readonly issues: readonly GeordiIrValidationIssue[];

  constructor(issues: readonly GeordiIrValidationIssue[]) {
    super('Browser harness IR validation failed');
    this.name = new.target.name;
    this.issues = issues;
  }
}

export class BrowserHarnessStrictTextFixtureAcceptedError extends Error {
  public readonly fixtureUrl: string;

  constructor(fixtureUrl: string) {
    super('Browser harness strict text fixture was accepted');
    this.name = new.target.name;
    this.fixtureUrl = fixtureUrl;
  }
}

export class BrowserHarnessStrictTextFixtureRejectedError extends Error {
  public readonly fixtureUrl: string;
  public readonly issues: readonly RenderFixtureStrictTextFixtureManifestIssue[];
  public readonly source: RenderFixtureInvalidStrictTextFixtureManifestError;

  constructor(
    fixtureUrl: string,
    source: RenderFixtureInvalidStrictTextFixtureManifestError,
  ) {
    super('Browser harness strict text fixture was rejected');
    this.name = new.target.name;
    this.fixtureUrl = fixtureUrl;
    this.issues = source.issues;
    this.source = source;
  }
}

export class BrowserHarnessStrictTextOutlineEvidenceRejectedError extends Error {
  public readonly evidenceUrl: string;
  public readonly issues: readonly RenderFixtureStrictTextOutlineEvidencePackIssue[];
  public readonly source:
    | RenderFixtureInvalidStrictTextEvidenceCoverageError
    | RenderFixtureInvalidStrictTextEvidenceLineBoxError
    | RenderFixtureInvalidStrictTextOutlineEvidencePackError;

  constructor(
    evidenceUrl: string,
    source:
      | RenderFixtureInvalidStrictTextEvidenceCoverageError
      | RenderFixtureInvalidStrictTextEvidenceLineBoxError
      | RenderFixtureInvalidStrictTextOutlineEvidencePackError,
  ) {
    super('Browser harness strict text outline evidence was rejected');
    this.name = new.target.name;
    this.evidenceUrl = evidenceUrl;
    this.issues = source.issues;
    this.source = source;
  }
}

export class BrowserHarnessStrictTextFontPackRejectedError extends Error {
  public readonly fontPackUrl: string;
  public readonly issues: readonly RenderFixtureFontPackManifestIssue[];
  public readonly source: RenderFixtureInvalidFontPackManifestError;

  constructor(fontPackUrl: string, source: RenderFixtureInvalidFontPackManifestError) {
    super('Browser harness strict text font pack was rejected');
    this.name = new.target.name;
    this.fontPackUrl = fontPackUrl;
    this.issues = source.issues;
    this.source = source;
  }
}

export class BrowserHarnessStrictTextFontReferenceRejectedError extends Error {
  public readonly issues: readonly RenderFixtureStrictTextFontReferenceIssue[];
  public readonly source: RenderFixtureInvalidStrictTextFontReferenceError;

  constructor(source: RenderFixtureInvalidStrictTextFontReferenceError) {
    super('Browser harness strict text font references were rejected');
    this.name = new.target.name;
    this.issues = source.issues;
    this.source = source;
  }
}

export function createBrowserFetchText(
  fetcher: BrowserHarnessFetch,
): BrowserHarnessFetchText {
  return async (url: string): Promise<string> => {
    let response: BrowserHarnessFetchResponse;
    try {
      response = await fetcher(url);
    } catch {
      throw new BrowserHarnessFetchError(url, undefined);
    }

    if (!response.ok) {
      throw new BrowserHarnessFetchError(url, response.status);
    }

    try {
      return await response.text();
    } catch {
      throw new BrowserHarnessFetchError(url, response.status);
    }
  };
}

export async function loadBrowserRenderFixture(
  options: BrowserRenderFixtureOptions,
): Promise<Readonly<Omit<BrowserRenderFixtureResult, 'canvas'>>> {
  const jsonPort = options.jsonPort ?? canonicalJsonPort;
  const hashArtifact = options.hashArtifact ?? sha256ArtifactHash;
  const manifestSource = await options.fetchText(options.assets.manifestUrl);
  const manifest = parseRenderFixtureManifest(manifestSource, jsonPort);
  const sceneSource = await options.fetchText(options.assets.sceneUrl);
  const ir = assertBrowserHarnessGeordiIr(jsonPort.parse(sceneSource));
  const artifactHash = await hashArtifact(sceneSource);

  assertRenderFixtureArtifact({
    artifactHash,
    ir,
    manifest,
  });

  return { ir, manifest };
}

export async function renderBrowserFixture(
  options: BrowserRenderFixtureOptions,
): Promise<BrowserRenderFixtureResult> {
  const loaded = await loadBrowserRenderFixture(options);
  const render = options.render ?? renderGeordiToCanvas;

  return {
    ...loaded,
    canvas: render(loaded.ir),
  };
}

export async function loadBrowserStrictTextFixture(
  options: BrowserStrictTextFixtureOptions,
): Promise<RenderFixtureStrictTextFixtureManifest> {
  const jsonPort = options.jsonPort ?? canonicalJsonPort;
  const source = await options.fetchText(options.assets.fixtureUrl);

  try {
    return parseRenderFixtureStrictTextFixtureManifest(source, jsonPort);
  } catch (error) {
    if (error instanceof RenderFixtureInvalidStrictTextFixtureManifestError) {
      throw new BrowserHarnessStrictTextFixtureRejectedError(options.assets.fixtureUrl, error);
    }

    throw error;
  }
}

export async function rejectBrowserStrictTextFixture(
  options: BrowserStrictTextFixtureOptions,
): Promise<BrowserStrictTextFixtureRejection> {
  try {
    await loadBrowserStrictTextFixture(options);
  } catch (error) {
    if (error instanceof BrowserHarnessStrictTextFixtureRejectedError) {
      return {
        fixtureUrl: error.fixtureUrl,
        issues: error.issues,
        rejected: true,
      };
    }

    throw error;
  }

  throw new BrowserHarnessStrictTextFixtureAcceptedError(options.assets.fixtureUrl);
}

export async function renderBrowserStrictTextFixture(
  options: BrowserStrictTextRenderFixtureOptions,
): Promise<BrowserStrictTextRenderFixtureResult> {
  const jsonPort = options.jsonPort ?? canonicalJsonPort;
  const fixtureSource = await options.fetchText(options.assets.fixtureUrl);
  let fixture: RenderFixtureStrictTextFixtureManifest;
  try {
    fixture = parseRenderFixtureStrictTextFixtureManifest(fixtureSource, jsonPort);
  } catch (error) {
    if (error instanceof RenderFixtureInvalidStrictTextFixtureManifestError) {
      throw new BrowserHarnessStrictTextFixtureRejectedError(options.assets.fixtureUrl, error);
    }

    throw error;
  }

  const fontPackSource = await options.fetchText(options.assets.fontPackUrl);
  try {
    const fontPack = parseRenderFixtureFontPackManifest(fontPackSource, jsonPort);
    assertRenderFixtureStrictTextFontReferences({ fontPack, manifest: fixture });
  } catch (error) {
    if (error instanceof RenderFixtureInvalidFontPackManifestError) {
      throw new BrowserHarnessStrictTextFontPackRejectedError(options.assets.fontPackUrl, error);
    }

    if (error instanceof RenderFixtureInvalidStrictTextFontReferenceError) {
      throw new BrowserHarnessStrictTextFontReferenceRejectedError(error);
    }

    throw error;
  }

  const evidenceSource = await options.fetchText(options.assets.evidenceUrl);

  try {
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(evidenceSource, jsonPort);
    const result = renderStrictTextOutlineGlyphsToCanvas(fixture, evidence);
    const metadata = await createStrictTextMetadataReport({
      evidenceSource,
      fixtureSource,
      fontPackSource,
      jsonPort,
      renderReport: result.report,
    });

    return {
      ...result,
      metadata,
    };
  } catch (error) {
    if (
      error instanceof RenderFixtureInvalidStrictTextEvidenceCoverageError ||
      error instanceof RenderFixtureInvalidStrictTextEvidenceLineBoxError ||
      error instanceof RenderFixtureInvalidStrictTextOutlineEvidencePackError
    ) {
      throw new BrowserHarnessStrictTextOutlineEvidenceRejectedError(
        options.assets.evidenceUrl,
        error,
      );
    }

    throw error;
  }
}

export async function createStrictTextMetadataReport(input: {
  readonly evidenceSource: string;
  readonly fixtureSource: string;
  readonly fontPackSource: string;
  readonly jsonPort?: JsonPort;
  readonly renderReport: BrowserStrictTextOutlineRenderResult['report'];
}): Promise<BrowserStrictTextMetadataReport> {
  const jsonPort = input.jsonPort ?? canonicalJsonPort;
  const fixture = parseRenderFixtureStrictTextFixtureManifest(input.fixtureSource, jsonPort);
  return {
    commandCount: input.renderReport.commandCount,
    drawGlyphCount: input.renderReport.drawGlyphCount,
    evidenceHash: await sha256ArtifactHash(input.evidenceSource),
    evidenceKind: input.renderReport.evidenceKind,
    evidencePackId: input.renderReport.evidencePackId,
    fixtureHash: await sha256ArtifactHash(input.fixtureSource),
    fixtureId: input.renderReport.fixtureId,
    fontPackHash: await sha256ArtifactHash(input.fontPackSource),
    fontPackPath: fixture.fontPackPath,
    glyphCount: input.renderReport.glyphCount,
    glyphRunHash: await sha256CanonicalJsonHash(fixture.glyphRuns, jsonPort),
    lineBoxHash: await sha256CanonicalJsonHash(fixture.lineBoxes, jsonPort),
    positionEncoding: fixture.positionEncoding,
    rendererName: input.renderReport.rendererName,
    semanticTextAffectsPixels: fixture.semanticText.affectsPixels,
    semanticTextLanguage: fixture.semanticText.language,
    semanticTextRole: 'non-rendering metadata; pixels follow glyph evidence',
    semanticTextSource: fixture.semanticText.source,
    textProfile: input.renderReport.textProfile,
  };
}

async function sha256CanonicalJsonHash(
  value: JsonValue,
  jsonPort: JsonPort,
): Promise<string> {
  return sha256ArtifactHash(`${jsonPort.stringify(value, { space: 2 })}\n`);
}

function assertBrowserHarnessGeordiIr(value: JsonValue): GeordiIr {
  const result = validateGeordiIr(value);
  if (result.ok) {
    return value as GeordiIr;
  }

  throw new BrowserHarnessInvalidIrError(result.issues);
}

async function sha256ArtifactHash(source: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(source);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

    return `sha256:${hexFromBytes(new Uint8Array(digest))}`;
  } catch {
    throw new BrowserHarnessArtifactHashError();
  }
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
