import './style.css';
import {
  mountBunnyCanvas,
  mountBrowserHarnessFailure,
  mountBrowserHarnessShell,
  mountRenderedFixtureCanvas,
  mountStrictTextCanvas,
} from './domShell.js';
import {
  createBrowserFetchText,
  rejectBrowserStrictTextFixture,
  renderBrowserFixture,
  renderBrowserStrictTextFixture,
  type BrowserStrictTextMetadataReport,
} from './browserRenderSmoke.js';
import { STANFORD_BUNNY_ASSETS } from './bunnyAssets.js';
import {
  BUNNY_BROWSER_RENDERER_NAME,
  bunnyFrameIndexFromElapsedMs,
  renderBunnyFixtureFrame,
  renderBunnyFrameToCanvas,
  type BunnyRenderResult,
} from './bunnyRender.js';
import { HELLO_PANEL_FIXTURE_ASSETS } from './fixtureAssets.js';
import { createBrowserHarnessStatus } from './harnessModel.js';
import {
  GEORDI_STRICT_TEXT_RENDER_ASSETS,
  UNSUPPORTED_RUNTIME_SHAPING_STRICT_TEXT_ASSETS,
} from './strictTextAssets.js';

async function startBrowserHarness(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  const fetchText = createBrowserFetchText((url) => globalThis.fetch(url));
  const result = await renderBrowserFixture({
    assets: HELLO_PANEL_FIXTURE_ASSETS,
    fetchText,
  });
  await rejectBrowserStrictTextFixture({
    assets: UNSUPPORTED_RUNTIME_SHAPING_STRICT_TEXT_ASSETS,
    fetchText,
  });
  const text = await renderBrowserStrictTextFixture({
    assets: GEORDI_STRICT_TEXT_RENDER_ASSETS,
    fetchText,
  });
  const bunny = await renderBunnyFixtureFrame(STANFORD_BUNNY_ASSETS, 0, fetchText);

  const shell = mountBrowserHarnessShell(root, createBrowserHarnessStatus(result.manifest, result.ir), {
    bunnyRendererName: BUNNY_BROWSER_RENDERER_NAME,
    textRendererName: text.metadata.rendererName,
  });
  mountRenderedFixtureCanvas(shell.rectangleCanvasSlot, result.canvas);
  mountStrictTextCanvas(
    shell.textCanvasSlot,
    text.canvas,
    shell.textReport,
    strictTextReportText(text.metadata),
  );
  const bunnyReport = mountBunnyCanvas(
    shell.bunnyCanvasSlot,
    bunny.canvas,
    shell.bunnyReport,
    bunnyReportText(bunny.report),
  );
  startBunnyLiveRotation(bunny, bunnyReport);
}

function bunnyReportText(report: Awaited<ReturnType<typeof renderBunnyFixtureFrame>>['report']): string {
  return [
    report.rendererName,
    `fixtureId=${report.fixtureId}`,
    `frame=${report.frameIndex}`,
    `seconds=${report.seconds}`,
    `angleRadians=${report.angleRadians}`,
    `normalizedAxis=${report.normalizedAxis.join(',')}`,
    `transformProfile=${report.transformProfile}`,
    `vertices=${report.vertexCount}`,
    `faces=${report.faceCount}`,
    `assetHash=${report.assetHash}`,
  ].join(' ');
}

function strictTextReportText(report: BrowserStrictTextMetadataReport): string {
  return [
    report.rendererName,
    `fixtureId=${report.fixtureId}`,
    `fixtureHash=${report.fixtureHash}`,
    `fontPackPath=${report.fontPackPath}`,
    `fontPackHash=${report.fontPackHash}`,
    `glyphRunHash=${report.glyphRunHash}`,
    `lineBoxHash=${report.lineBoxHash}`,
    `evidencePackId=${report.evidencePackId}`,
    `evidenceKind=${report.evidenceKind}`,
    `evidenceHash=${report.evidenceHash}`,
    `textProfile=${report.textProfile}`,
    `positionEncoding=${report.positionEncoding}`,
    `glyphCount=${report.glyphCount}`,
    `drawGlyphCount=${report.drawGlyphCount}`,
    `commandCount=${report.commandCount}`,
    `semanticTextSource=${report.semanticTextSource}`,
    `semanticTextLanguage=${report.semanticTextLanguage}`,
    `semanticTextAffectsPixels=${report.semanticTextAffectsPixels}`,
    `semanticTextRole=${report.semanticTextRole}`,
  ].join(' ');
}

function startBunnyLiveRotation(
  bunny: BunnyRenderResult,
  reportElement: HTMLPreElement,
): void {
  let startMs: number | undefined;
  const tick = (nowMs: number): void => {
    const anchorMs = startMs ?? nowMs;
    startMs = anchorMs;
    const frameIndex = bunnyFrameIndexFromElapsedMs(
      nowMs - anchorMs,
      bunny.fixture.playback.sampleRate,
    );
    const report = renderBunnyFrameToCanvas(
      bunny.canvas,
      bunny.fixture,
      bunny.manifest,
      bunny.mesh,
      frameIndex,
    );
    reportElement.textContent = bunnyReportText(report);
    void globalThis.requestAnimationFrame(tick);
  };

  void globalThis.requestAnimationFrame(tick);
}

void startBrowserHarness().catch(() => {
  mountBrowserHarnessFailure(document.querySelector<HTMLElement>('#app'));
});
