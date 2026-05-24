import {
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  type GeordiIr,
} from '@flyingrobots/geordi-core';
import {
  RENDER_FIXTURE_VERSION,
  type RenderFixtureManifest,
} from '@flyingrobots/geordi-render-fixture';
import { GEORDI_WEBGL_RUNTIME_PROFILE } from '@flyingrobots/geordi-runtime-webgl';

export const BROWSER_RENDERER_NAME = 'browser-canvas' as const;

export interface BrowserHarnessStatus {
  readonly artifactHash: string;
  readonly featureRequirements: readonly string[];
  readonly fixtureId: string;
  readonly fixtureVersion: typeof RENDER_FIXTURE_VERSION;
  readonly irVersion: typeof GEORDI_IR_VERSION;
  readonly numericProfile: typeof GEORDI_NUMERIC_PROFILE;
  readonly rendererName: typeof BROWSER_RENDERER_NAME;
  readonly supportedFeatureCount: number;
}

export function createBrowserHarnessStatus(
  manifest: RenderFixtureManifest,
  ir: GeordiIr,
): BrowserHarnessStatus {
  return {
    artifactHash: manifest.artifactHash,
    featureRequirements: ir.requires,
    fixtureId: manifest.id,
    fixtureVersion: manifest.fixtureVersion,
    irVersion: ir.irVersion,
    numericProfile: ir.numericProfile,
    rendererName: BROWSER_RENDERER_NAME,
    supportedFeatureCount: GEORDI_WEBGL_RUNTIME_PROFILE.supportedFeatureRequirements.length,
  };
}
