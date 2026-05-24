import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJsonPort, type GeordiIr } from '@flyingrobots/geordi-core';
import { parseRenderFixtureManifest } from '@flyingrobots/geordi-render-fixture';
import { createBrowserHarnessStatus } from './harnessModel.js';

describe('browser render-everywhere harness model', () => {
  it('reports public runtime and loaded fixture contract values', () => {
    const manifest = parseRenderFixtureManifest(fixtureSource('fixture.json'));
    const ir = canonicalJsonPort.parse(fixtureSource('scene.geordi.json')) as GeordiIr;

    expect(createBrowserHarnessStatus(manifest, ir)).toEqual({
      artifactHash: manifest.artifactHash,
      featureRequirements: manifest.runtimeProfile.requires,
      fixtureId: manifest.id,
      fixtureVersion: manifest.fixtureVersion,
      irVersion: manifest.runtimeProfile.irVersion,
      numericProfile: manifest.runtimeProfile.numericProfile,
      rendererName: 'browser-canvas',
      supportedFeatureCount: 12,
    });
  });
});

function fixtureSource(path: string): string {
  return readFileSync(
    new URL(`../../../fixtures/render-everywhere/hello-panel/${path}`, import.meta.url),
    'utf8',
  );
}
