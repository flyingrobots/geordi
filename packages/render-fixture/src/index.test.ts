import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalJsonPort,
  GEORDI_CORE_PROFILE,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  type GeordiIr,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import {
  assertRenderFixtureArtifact,
  assertRenderFixtureManifest,
  assertRenderFixtureMeshAssetManifest,
  assertRenderFixturePixelProbe,
  assertRenderFixturePixelProbes,
  isRenderFixtureMeshAssetManifest,
  isRenderFixtureManifest,
  parseRenderFixtureMeshAssetManifest,
  parseRenderFixtureManifest,
  RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE,
  RENDER_FIXTURE_MESH_ASSET_VERSION,
  RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT,
  RENDER_FIXTURE_VERSION,
  RenderFixtureArtifactValidationError,
  RenderFixtureInvalidMeshAssetManifestError,
  RenderFixtureInvalidManifestError,
  RenderFixtureInvalidPixelSampleError,
  RenderFixturePixelProbeError,
  renderFixtureRgbaFromBytes,
  validateRenderFixtureArtifact,
  validateRenderFixtureMeshAssetManifest,
  validateRenderFixtureManifest,
  type RenderFixtureManifest,
  type RenderFixtureMeshAssetManifest,
  type RenderFixturePixelProbe,
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
    source: {
      kind: RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT,
      path: 'source.gpvue',
    },
  };
}

function makeIr(): GeordiIr {
  return {
    irVersion: GEORDI_IR_VERSION,
    nodes: [
      {
        id: 'background',
        kind: 'Rect',
        props: {
          fill: '#101820',
          height: 360,
          width: 640,
          x: 0,
          y: 0,
        },
      },
    ],
    numericProfile: GEORDI_NUMERIC_PROFILE,
    requires: [GEORDI_CORE_PROFILE, 'layout.resolved', 'shape.rect', 'paint.solid'],
    scene: {
      height: 360,
      id: 'render-everywhere:hello-panel',
      units: 'px',
      width: 640,
    },
  };
}

function makeMeshAssetManifest(): RenderFixtureMeshAssetManifest {
  return {
    assetPath: 'bun_zipper_res3.ply',
    assetVersion: RENDER_FIXTURE_MESH_ASSET_VERSION,
    bounds: {
      max: [0.0609346, 0.184813, 0.0584651],
      min: [-0.0943643, 0.0334143, -0.0616721],
    },
    counts: {
      faces: 3851,
      vertices: 1889,
    },
    faceProperty: 'vertex_indices',
    format: {
      encoding: 'ascii',
      kind: 'ply',
      version: '1.0',
    },
    id: 'render-everywhere:stanford-bunny',
    meshProfile: RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE,
    sha256: 'sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6',
    source: {
      attribution: 'Stanford Computer Graphics Laboratory Stanford 3D Scanning Repository',
      retrieved: '2026-05-23',
      url: 'https://graphics.stanford.edu/pub/3Dscanrep/bunny.tar.gz',
    },
    vertexProperties: ['x', 'y', 'z', 'confidence', 'intensity'],
  };
}

function fixtureManifestSource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/hello-panel/fixture.json', import.meta.url),
    'utf8',
  );
}

class RenderFixtureTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

function makeProbe(): RenderFixturePixelProbe {
  return {
    id: 'background',
    rgba: [16, 24, 32, 255],
    x: 8,
    y: 8,
  };
}

function capturePixelProbeError(): RenderFixturePixelProbeError {
  try {
    assertRenderFixturePixelProbe('fixture:test', makeProbe(), [16, 24, 33, 255]);
  } catch (error) {
    if (error instanceof RenderFixturePixelProbeError) {
      return error;
    }
  }

  throw new RenderFixtureTestError('Expected RenderFixturePixelProbeError');
}

function captureInvalidPixelSampleError(): RenderFixtureInvalidPixelSampleError {
  try {
    renderFixtureRgbaFromBytes([1, 2, 3]);
  } catch (error) {
    if (error instanceof RenderFixtureInvalidPixelSampleError) {
      return error;
    }
  }

  throw new RenderFixtureTestError('Expected RenderFixtureInvalidPixelSampleError');
}

function captureArtifactValidationError(): RenderFixtureArtifactValidationError {
  try {
    assertRenderFixtureArtifact({
      artifactHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      ir: {
        ...makeIr(),
        requires: [GEORDI_CORE_PROFILE, 'layout.resolved'],
        scene: {
          ...makeIr().scene,
          width: 641,
        },
      },
      manifest: makeManifest(),
    });
  } catch (error) {
    if (error instanceof RenderFixtureArtifactValidationError) {
      return error;
    }
  }

  throw new RenderFixtureTestError('Expected RenderFixtureArtifactValidationError');
}

describe('render fixture manifest validation', () => {
  it('accepts the shared hello-panel fixture manifest', () => {
    const manifest = parseRenderFixtureManifest(fixtureManifestSource());

    expect(manifest.id).toBe('render-everywhere:hello-panel');
    expect(manifest.source).toEqual({
      compiler: '@flyingrobots/geordi-gpvue',
      compilerVersion: '0.1.0',
      kind: 'gpvue',
      path: 'source.gpvue',
    });
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
      receiptPath: '\\\\server\\share\\receipt',
      scenePath: 'C:\\tmp\\scene.geordi.json',
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

  it('rejects invalid source metadata', () => {
    const invalid: JsonValue = {
      ...makeManifest(),
      source: {
        compiler: '@flyingrobots/geordi-gpvue',
        kind: 'gpvue-draft',
        path: 'file://source.gpvue',
      },
    };

    const result = validateRenderFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.source.path',
      '$.source.compiler',
    ]);
  });

  it('rejects nonlocal source path forms', () => {
    const invalidPaths = [
      '../source.gpvue',
      '/tmp/source.gpvue',
      'C:\\tmp\\source.gpvue',
      '\\\\server\\share\\source.gpvue',
      'https://example.test/source.gpvue',
    ];

    for (const sourcePath of invalidPaths) {
      const invalid: JsonValue = {
        ...makeManifest(),
        source: {
          kind: RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT,
          path: sourcePath,
        },
      };

      const result = validateRenderFixtureManifest(invalid);

      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.path)).toEqual(['$.source.path']);
    }
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

describe('render fixture mesh asset manifest validation', () => {
  it('accepts a typed valid mesh asset manifest object', () => {
    const manifest = makeMeshAssetManifest();

    expect(validateRenderFixtureMeshAssetManifest(manifest)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureMeshAssetManifest(manifest)).toBe(true);
    expect(assertRenderFixtureMeshAssetManifest(manifest)).toBe(manifest);
  });

  it('parses mesh asset manifests through the canonical JSON port', () => {
    const source = canonicalJsonPort.stringify(makeMeshAssetManifest(), { space: 2 });

    const parsed = parseRenderFixtureMeshAssetManifest(source);

    expect(parsed.id).toBe('render-everywhere:stanford-bunny');
    expect(parsed.counts).toEqual({ faces: 3851, vertices: 1889 });
  });

  it('rejects invalid mesh asset manifest metadata', () => {
    const invalid: JsonValue = {
      ...makeMeshAssetManifest(),
      assetPath: 'https://example.test/bunny.ply',
      assetVersion: 'geordi-mesh-asset/2',
      bounds: {
        max: [1, 2, Number.POSITIVE_INFINITY],
        min: [0, 1],
      },
      counts: {
        faces: 0,
        vertices: -1,
      },
      faceProperty: 'triangles',
      format: {
        encoding: 'binary',
        kind: 'obj',
        version: '2.0',
      },
      meshProfile: 'geordi-obj-mesh/1',
      sha256: 'sha256:not-a-hash',
      source: {
        attribution: '',
        retrieved: 'May 23',
        url: '',
      },
      vertexProperties: ['x', 'x', 'confidence'],
    };

    const result = validateRenderFixtureMeshAssetManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.assetVersion',
      '$.meshProfile',
      '$.assetPath',
      '$.sha256',
      '$.format.kind',
      '$.format.encoding',
      '$.format.version',
      '$.counts.vertices',
      '$.counts.faces',
      '$.bounds.min',
      '$.bounds.max[2]',
      '$.source.url',
      '$.source.retrieved',
      '$.source.attribution',
      '$.vertexProperties[1]',
      '$.vertexProperties',
      '$.vertexProperties',
      '$.faceProperty',
    ]);
  });

  it('throws a custom error for invalid mesh asset manifests', () => {
    expect(() =>
      parseRenderFixtureMeshAssetManifest(
        canonicalJsonPort.stringify(
          {
            ...makeMeshAssetManifest(),
            counts: { faces: 1, vertices: 0 },
          },
          { space: 2 },
        ),
      ),
    ).toThrow(RenderFixtureInvalidMeshAssetManifestError);
  });
});

describe('render fixture artifact validation', () => {
  it('accepts matching manifest, artifact hash, and IR metadata', () => {
    expect(
      validateRenderFixtureArtifact({
        artifactHash: makeManifest().artifactHash,
        ir: makeIr(),
        manifest: makeManifest(),
      }),
    ).toEqual({ ok: true, issues: [] });
  });

  it('reports hash, runtime profile, and canvas mismatches before rendering', () => {
    const error = captureArtifactValidationError();

    expect(error.fixtureId).toBe('render-everywhere:hello-panel');
    expect(error.issues.map((issue) => issue.path)).toEqual([
      '$.artifactHash',
      '$.runtimeProfile.requires',
      '$.canvas.width',
    ]);
  });
});

describe('render fixture pixel probe assertions', () => {
  it('accepts exact RGBA matches', () => {
    expect(() =>
      {
        assertRenderFixturePixelProbe('fixture:test', makeProbe(), [16, 24, 32, 255]);
      },
    ).not.toThrow();
  });

  it('throws a custom error with fixture and coordinate context on mismatch', () => {
    const error = capturePixelProbeError();

    expect(error.fixtureId).toBe('fixture:test');
    expect(error.probeId).toBe('background');
    expect(error.x).toBe(8);
    expect(error.y).toBe(8);
    expect(error.expected).toEqual([16, 24, 32, 255]);
    expect(error.actual).toEqual([16, 24, 33, 255]);
  });

  it('checks multiple probes through a shared sampler contract', () => {
    const probe = makeProbe();

    expect(() =>
      {
        assertRenderFixturePixelProbes('fixture:test', [probe], (sampledProbe) => sampledProbe.rgba);
      },
    ).not.toThrow();
  });

  it('converts byte buffers to RGBA tuples', () => {
    expect(renderFixtureRgbaFromBytes(new Uint8ClampedArray([1, 2, 3, 4]))).toEqual([
      1,
      2,
      3,
      4,
    ]);
  });

  it('throws a custom error for invalid pixel samples', () => {
    const error = captureInvalidPixelSampleError();

    expect(error.channelIndex).toBe(3);
    expect(error.value).toBeUndefined();
  });
});
