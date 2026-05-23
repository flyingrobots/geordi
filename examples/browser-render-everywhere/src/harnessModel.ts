import {
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
} from '@flyingrobots/geordi-core';
import { RENDER_FIXTURE_VERSION } from '@flyingrobots/geordi-render-fixture';
import { GEORDI_WEBGL_RUNTIME_PROFILE } from '@flyingrobots/geordi-runtime-webgl';

export interface BrowserHarnessStatus {
  readonly fixtureVersion: typeof RENDER_FIXTURE_VERSION;
  readonly irVersion: typeof GEORDI_IR_VERSION;
  readonly numericProfile: typeof GEORDI_NUMERIC_PROFILE;
  readonly rendererName: 'browser-canvas';
  readonly supportedFeatureCount: number;
}

export function createBrowserHarnessStatus(): BrowserHarnessStatus {
  return {
    fixtureVersion: RENDER_FIXTURE_VERSION,
    irVersion: GEORDI_IR_VERSION,
    numericProfile: GEORDI_WEBGL_RUNTIME_PROFILE.numericProfile,
    rendererName: 'browser-canvas',
    supportedFeatureCount: GEORDI_WEBGL_RUNTIME_PROFILE.supportedFeatureRequirements.length,
  };
}
