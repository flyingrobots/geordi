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
  mountBunnyCanvas(root, bunny.canvas, bunnyReportText(bunny.report));
  startBunnyLiveRotation(bunny);
}

function bunnyReportText(report: Awaited<ReturnType<typeof renderBunnyFixtureFrame>>['report']): string {
  return [
    report.rendererName,
    `frame=${report.frameIndex}`,
    `vertices=${report.vertexCount}`,
    `faces=${report.faceCount}`,
    `asset=${report.assetHash}`,
  ].join(' ');
}

function startBunnyLiveRotation(bunny: BunnyRenderResult): void {
  const startMs = globalThis.performance.now();
  const tick = (nowMs: number): void => {
    const frameIndex = bunnyFrameIndexFromElapsedMs(nowMs - startMs);
    renderBunnyFrameToCanvas(bunny.canvas, bunny.manifest, bunny.mesh, frameIndex);
    void globalThis.requestAnimationFrame(tick);
  };

  void globalThis.requestAnimationFrame(tick);
}

void startBrowserHarness().catch(() => {
  mountBrowserHarnessFailure(document.querySelector<HTMLElement>('#app'));
});
