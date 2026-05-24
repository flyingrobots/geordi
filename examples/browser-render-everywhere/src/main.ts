import './style.css';
import {
  mountBunnyCanvas,
  mountBrowserHarnessFailure,
  mountBrowserHarnessShell,
  mountRenderedFixtureCanvas,
} from './domShell.js';
import { createBrowserFetchText, renderBrowserFixture } from './browserRenderSmoke.js';
import { STANFORD_BUNNY_ASSETS } from './bunnyAssets.js';
import {
  bunnyFrameIndexFromElapsedMs,
  renderBunnyFixtureFrame,
  renderBunnyFrameToCanvas,
  type BunnyRenderResult,
} from './bunnyRender.js';
import { HELLO_PANEL_FIXTURE_ASSETS } from './fixtureAssets.js';
import { createBrowserHarnessStatus } from './harnessModel.js';

async function startBrowserHarness(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  const fetchText = createBrowserFetchText((url) => globalThis.fetch(url));
  const result = await renderBrowserFixture({
    assets: HELLO_PANEL_FIXTURE_ASSETS,
    fetchText,
  });
  const bunny = await renderBunnyFixtureFrame(STANFORD_BUNNY_ASSETS, 0, fetchText);

  mountBrowserHarnessShell(root, createBrowserHarnessStatus(result.manifest, result.ir));
  mountRenderedFixtureCanvas(root, result.canvas);
  const bunnyReport = mountBunnyCanvas(root, bunny.canvas, bunnyReportText(bunny.report));
  startBunnyLiveRotation(bunny, bunnyReport);
}

function bunnyReportText(report: Awaited<ReturnType<typeof renderBunnyFixtureFrame>>['report']): string {
  return [
    report.rendererName,
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

function startBunnyLiveRotation(
  bunny: BunnyRenderResult,
  reportElement: HTMLParagraphElement,
): void {
  let startMs: number | undefined;
  const tick = (nowMs: number): void => {
    const anchorMs = startMs ?? nowMs;
    startMs = anchorMs;
    const frameIndex = bunnyFrameIndexFromElapsedMs(nowMs - anchorMs);
    const report = renderBunnyFrameToCanvas(bunny.canvas, bunny.manifest, bunny.mesh, frameIndex);
    reportElement.textContent = bunnyReportText(report);
    void globalThis.requestAnimationFrame(tick);
  };

  void globalThis.requestAnimationFrame(tick);
}

void startBrowserHarness().catch(() => {
  mountBrowserHarnessFailure(document.querySelector<HTMLElement>('#app'));
});
