import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalJsonPort,
  GEORDI_CORE_PROFILE,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  assertRenderFixtureManifest,
  isRenderFixtureManifest,
  parseRenderFixtureManifest,
  RENDER_FIXTURE_VERSION,
  RenderFixtureInvalidManifestError,
  validateRenderFixtureManifest,
  type RenderFixtureManifest,
} from './index.js';

function makeManifest(): RenderFixtureManifest {
  return {
    artifactHash: 'sha256:30623d6141ba69c382c14c09eca9adedd40cb02644ff4ee9621de101da6b0082',
    canvas: {
      height: 360,
      width: 640,
    },
    fixtureVersion: RENDER_FIXTURE_VERSION,
    id: 'render-everywhere:hello-panel',
    pixelProbes: [
      {
        id: 'background',
        rgba: [16, 24, 32, 255],
        x: 8,
        y: 8,
      },
    ],
    receiptPath: 'scene.geordi.json.receipt',
    runtimeProfile: {
      irVersion: GEORDI_IR_VERSION,
      numericProfile: GEORDI_NUMERIC_PROFILE,
      requires: [GEORDI_CORE_PROFILE, 'layout.resolved', 'shape.rect', 'paint.solid'],
    },
    scenePath: 'scene.geordi.json',
  };
}

function fixtureManifestSource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/hello-panel/fixture.json', import.meta.url),
    'utf8',
  );
}

describe('render fixture manifest validation', () => {
  it('accepts the shared hello-panel fixture manifest', () => {
    const manifest = parseRenderFixtureManifest(fixtureManifestSource());

    expect(manifest.id).toBe('render-everywhere:hello-panel');
    expect(manifest.pixelProbes.map((probe) => probe.id)).toEqual([
      'background',
      'panel',
      'accent-bar',
      'title-bar',
      'button',
      'status-indicator',
    ]);
  });

  it('accepts a typed valid manifest object', () => {
    const manifest = makeManifest();

    expect(validateRenderFixtureManifest(manifest)).toEqual({ ok: true, issues: [] });
    expect(isRenderFixtureManifest(manifest)).toBe(true);
    expect(assertRenderFixtureManifest(manifest)).toBe(manifest);
  });

  it('rejects malformed hashes, versions, and paths', () => {
    const invalid: JsonValue = {
      ...makeManifest(),
      artifactHash: 'sha256:not-a-hash',
      fixtureVersion: 'geordi-render-fixture/2',
      receiptPath: '../receipt',
      scenePath: '/scene.geordi.json',
    };

    const result = validateRenderFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.fixtureVersion',
      '$.scenePath',
      '$.receiptPath',
      '$.artifactHash',
    ]);
  });

  it('rejects invalid runtime profiles', () => {
    const invalid: JsonValue = {
      ...makeManifest(),
      runtimeProfile: {
        irVersion: 'geordi-ir/2',
        numericProfile: 'geordi-fixed-point-px6/1',
        requires: ['shape.rect', 'shape.rect', 'effect.blur/1', 1],
      },
    };

    const result = validateRenderFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.runtimeProfile.irVersion',
      '$.runtimeProfile.numericProfile',
      '$.runtimeProfile.requires[1]',
      '$.runtimeProfile.requires[2]',
      '$.runtimeProfile.requires[3]',
      '$.runtimeProfile.requires',
    ]);
  });

  it('rejects invalid probes', () => {
    const invalid: JsonValue = {
      ...makeManifest(),
      canvas: {
        height: 10,
        width: 10,
      },
      pixelProbes: [
        {
          id: 'duplicate',
          rgba: [0, 1, 2, 256],
          x: 10,
          y: 9,
        },
        {
          id: 'duplicate',
          rgba: [0, 1, 2],
          x: 1.5,
          y: -1,
        },
      ],
    };

    const result = validateRenderFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.pixelProbes[0].x',
      '$.pixelProbes[0].rgba[3]',
      '$.pixelProbes[1].id',
      '$.pixelProbes[1].x',
      '$.pixelProbes[1].y',
      '$.pixelProbes[1].rgba',
    ]);
  });

  it('throws a custom error for invalid manifests', () => {
    const invalidSource = canonicalJsonPort.stringify(
      {
        ...makeManifest(),
        artifactHash: 'sha256:nope',
      },
      { space: 2 },
    );

    expect(() => parseRenderFixtureManifest(invalidSource)).toThrow(
      RenderFixtureInvalidManifestError,
    );
  });
});
