import {
  canonicalJsonPort,
  validateGeordiIr,
  type GeordiIr,
  type GeordiIrValidationIssue,
  type JsonPort,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  assertRenderFixtureArtifact,
  parseRenderFixtureStrictTextOutlineEvidencePack,
  parseRenderFixtureStrictTextFixtureManifest,
  parseRenderFixtureManifest,
  RenderFixtureInvalidStrictTextOutlineEvidencePackError,
  RenderFixtureInvalidStrictTextFixtureManifestError,
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
  public readonly source: RenderFixtureInvalidStrictTextOutlineEvidencePackError;

  constructor(
    evidenceUrl: string,
    source: RenderFixtureInvalidStrictTextOutlineEvidencePackError,
  ) {
    super('Browser harness strict text outline evidence was rejected');
    this.name = new.target.name;
    this.evidenceUrl = evidenceUrl;
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
): Promise<BrowserStrictTextOutlineRenderResult> {
  const jsonPort = options.jsonPort ?? canonicalJsonPort;
  const fixture = await loadBrowserStrictTextFixture({
    assets: {
      fixtureUrl: options.assets.fixtureUrl,
    },
    fetchText: options.fetchText,
    jsonPort,
  });
  const evidenceSource = await options.fetchText(options.assets.evidenceUrl);

  try {
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(evidenceSource, jsonPort);
    return renderStrictTextOutlineGlyphsToCanvas(fixture, evidence);
  } catch (error) {
    if (error instanceof RenderFixtureInvalidStrictTextOutlineEvidencePackError) {
      throw new BrowserHarnessStrictTextOutlineEvidenceRejectedError(
        options.assets.evidenceUrl,
        error,
      );
    }

    throw error;
  }
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
