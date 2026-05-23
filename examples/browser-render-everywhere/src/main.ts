import './style.css';
import {
  mountBrowserHarnessFailure,
  mountBrowserHarnessShell,
  mountRenderedFixtureCanvas,
} from './domShell.js';
import { createBrowserFetchText, renderBrowserFixture } from './browserRenderSmoke.js';
import { HELLO_PANEL_FIXTURE_ASSETS } from './fixtureAssets.js';
import { createBrowserHarnessStatus } from './harnessModel.js';

async function startBrowserHarness(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  mountBrowserHarnessShell(root, createBrowserHarnessStatus());

  const result = await renderBrowserFixture({
    assets: HELLO_PANEL_FIXTURE_ASSETS,
    fetchText: createBrowserFetchText((url) => globalThis.fetch(url)),
  });
  mountRenderedFixtureCanvas(root, result.canvas);
}

void startBrowserHarness().catch(() => {
  mountBrowserHarnessFailure(document.querySelector<HTMLElement>('#app'));
});
