import {
  canonicalJsonPort,
  validateGeordiIr,
  type GeordiIr,
  type GeordiIrValidationIssue,
  type JsonPort,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  parseRenderFixtureManifest,
  type RenderFixtureManifest,
} from '@flyingrobots/geordi-render-fixture';
import { renderGeordiToCanvas } from '@flyingrobots/geordi-runtime-webgl';

export interface BrowserRenderFixtureAssets {
  readonly manifestUrl: string;
  readonly sceneUrl: string;
}

export interface BrowserRenderFixtureResult {
  readonly canvas: HTMLCanvasElement;
  readonly ir: GeordiIr;
  readonly manifest: RenderFixtureManifest;
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

export interface BrowserRenderFixtureOptions {
  readonly assets: BrowserRenderFixtureAssets;
  readonly fetchText: BrowserHarnessFetchText;
  readonly jsonPort?: JsonPort;
  readonly render?: BrowserHarnessRenderer;
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

export class BrowserHarnessInvalidIrError extends Error {
  public readonly issues: readonly GeordiIrValidationIssue[];

  constructor(issues: readonly GeordiIrValidationIssue[]) {
    super('Browser harness IR validation failed');
    this.name = new.target.name;
    this.issues = issues;
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
  const manifestSource = await options.fetchText(options.assets.manifestUrl);
  const manifest = parseRenderFixtureManifest(manifestSource, jsonPort);
  const sceneSource = await options.fetchText(options.assets.sceneUrl);
  const ir = assertBrowserHarnessGeordiIr(jsonPort.parse(sceneSource));

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

function assertBrowserHarnessGeordiIr(value: JsonValue): GeordiIr {
  const result = validateGeordiIr(value);
  if (result.ok) {
    return value as GeordiIr;
  }

  throw new BrowserHarnessInvalidIrError(result.issues);
}
