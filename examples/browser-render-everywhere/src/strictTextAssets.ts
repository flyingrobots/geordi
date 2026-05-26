import geordiFontPackUrl from '../../../fixtures/render-everywhere/assets/fonts/font-pack.geordi.json?url';
import geordiOutlineEvidenceUrl from '../../../fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json?url';
import geordiStrictTextFixtureUrl from '../../../fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json?url';
import unsupportedRuntimeShapingStrictTextFixtureUrl from '../../../fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json?url';
import type {
  BrowserStrictTextFixtureAssets,
  BrowserStrictTextRenderFixtureAssets,
} from './browserRenderSmoke.js';

export const UNSUPPORTED_RUNTIME_SHAPING_STRICT_TEXT_ASSETS: BrowserStrictTextFixtureAssets = {
  fixtureUrl: unsupportedRuntimeShapingStrictTextFixtureUrl,
};

export const GEORDI_STRICT_TEXT_RENDER_ASSETS: BrowserStrictTextRenderFixtureAssets = {
  evidenceUrl: geordiOutlineEvidenceUrl,
  fontPackUrl: geordiFontPackUrl,
  fixtureUrl: geordiStrictTextFixtureUrl,
};
