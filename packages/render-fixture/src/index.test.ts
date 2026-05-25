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
  assertRenderFixtureFontPackManifest,
  assertRenderFixtureManifest,
  assertRenderFixtureMeshAssetManifest,
  assertRenderFixtureMeshFixtureManifest,
  assertRenderFixturePixelProbe,
  assertRenderFixturePixelProbes,
  assertRenderFixtureStrictTextFixtureManifest,
  createRenderFixtureMeshPlaybackFrame,
  isRenderFixtureFontPackManifest,
  isRenderFixtureMeshAssetManifest,
  isRenderFixtureMeshFixtureManifest,
  isRenderFixtureManifest,
  isRenderFixtureStrictTextFixtureManifest,
  parseRenderFixtureAsciiPlyTriangleMesh,
  parseRenderFixtureFontPackManifest,
  parseRenderFixtureMeshAssetManifest,
  parseRenderFixtureMeshFixtureManifest,
  parseRenderFixtureManifest,
  parseRenderFixtureStrictTextFixtureManifest,
  RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE,
  RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING,
  RENDER_FIXTURE_FONT_FORMAT_TTF,
  RENDER_FIXTURE_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE,
  RENDER_FIXTURE_FONT_PACK_VERSION,
  RENDER_FIXTURE_MESH_FIXTURE_VERSION,
  RENDER_FIXTURE_MESH_ASSET_VERSION,
  RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT,
  RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  RENDER_FIXTURE_STRICT_TEXT_FIXTURE_VERSION,
  RENDER_FIXTURE_TEXT_FEATURE_FONT_PACK,
  RENDER_FIXTURE_TEXT_FEATURE_LINE_BOXES,
  RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
  RENDER_FIXTURE_VERSION,
  RenderFixtureArtifactValidationError,
  RenderFixtureInvalidFontPackManifestError,
  RenderFixtureInvalidMeshAssetManifestError,
  RenderFixtureInvalidMeshFixtureManifestError,
  RenderFixtureInvalidManifestError,
  RenderFixtureInvalidMeshPlaybackError,
  RenderFixtureInvalidPixelSampleError,
  RenderFixtureInvalidPlaybackFrameError,
  RenderFixtureInvalidStrictTextFixtureManifestError,
  RenderFixturePlyFaceError,
  RenderFixturePlyHeaderError,
  RenderFixturePlyVertexError,
  RenderFixturePixelProbeError,
  renderFixtureRgbaFromBytes,
  validateRenderFixtureArtifact,
  validateRenderFixtureFontPackManifest,
  validateRenderFixtureMeshAssetManifest,
  validateRenderFixtureMeshFixtureManifest,
  validateRenderFixtureManifest,
  validateRenderFixtureStrictTextFixtureManifest,
  type RenderFixtureFontPackManifest,
  type RenderFixtureManifest,
  type RenderFixtureMeshAssetManifest,
  type RenderFixtureMeshFixtureManifest,
  type RenderFixturePixelProbe,
  type RenderFixtureStrictTextFixtureManifest,
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

function makeFontPackManifest(): RenderFixtureFontPackManifest {
  return {
    fontPackVersion: RENDER_FIXTURE_FONT_PACK_VERSION,
    fonts: [
      {
        faceIndex: 0,
        familyName: 'Lato',
        format: RENDER_FIXTURE_FONT_FORMAT_TTF,
        id: 'lato-regular',
        license: {
          name: 'SIL Open Font License 1.1',
          path: 'fixtures/render-everywhere/assets/fonts/lato/OFL.txt',
          redistributionAllowed: true,
          reservedFontNames: ['Lato'],
          sha256: 'sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423',
        },
        path: 'fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf',
        sha256: 'sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251',
        source: {
          commit: 'c5b52261e8fde2d3b2592fa9d26ac525939c5e4c',
          fontSha256:
            'sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251',
          licenseNormalization:
            RENDER_FIXTURE_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE,
          licensePath: 'ofl/lato/OFL.txt',
          licenseSha256:
            'sha256:74ba064d03f1f1c4a952da936c3eb71866c34404916734de3cae73b34357e59e',
          path: 'ofl/lato/Lato-Regular.ttf',
          repository: 'https://github.com/google/fonts',
        },
        styleName: 'Regular',
        weight: 400,
      },
    ],
  };
}

function makeStrictTextFixtureManifest(): RenderFixtureStrictTextFixtureManifest {
  return {
    features: [
      RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
      RENDER_FIXTURE_TEXT_FEATURE_FONT_PACK,
      RENDER_FIXTURE_TEXT_FEATURE_LINE_BOXES,
    ],
    fixtureVersion: RENDER_FIXTURE_STRICT_TEXT_FIXTURE_VERSION,
    fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
    glyphRuns: [
      {
        fontId: 'lato-regular',
        glyphs: [
          {
            advance: 2048,
            glyphId: 43,
            x: 0,
            xOffset: 0,
            y: 3072,
            yOffset: 0,
          },
        ],
        id: 'run-0',
        lineBoxId: 'line-0',
      },
    ],
    id: 'render-everywhere:strict-text:geordi',
    lineBoxes: [
      {
        baselineY: 3072,
        height: 4096,
        id: 'line-0',
        width: 12288,
        x: 0,
        y: 0,
      },
    ],
    positionEncoding: RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING,
    semanticText: {
      affectsPixels: false,
      language: 'en',
      source: 'GEORDI',
    },
    textProfile: RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  };
}

function makeMeshFixtureManifest(): RenderFixtureMeshFixtureManifest {
  return {
    assetManifestPath: 'bunny.mesh.json',
    camera: {
      coordinateSystem: 'right-handed',
      eye: [0, 0.1, 0.35],
      target: [0, 0.1, 0],
      up: [0, 1, 0],
    },
    fixtureVersion: RENDER_FIXTURE_MESH_FIXTURE_VERSION,
    id: 'render-everywhere:stanford-bunny',
    material: {
      backgroundColor: '#111827',
      color: '#d1d5db',
      kind: 'solid',
    },
    playback: {
      axis: [3, 5, 2],
      kind: 'fixed-rate-rotation',
      radiansPerSecond: 0.7853981633974483,
      sampleRate: 60,
    },
    projection: {
      far: 10,
      kind: 'perspective',
      near: 0.01,
      verticalFovRadians: 0.7853981633974483,
      viewport: {
        height: 512,
        width: 512,
      },
    },
    runtimeProfile: {
      numericProfile: GEORDI_NUMERIC_PROFILE,
      requires: [
        GEORDI_CORE_PROFILE,
        'asset.mesh',
        'mesh.triangle',
        'transform.matrix4',
        'camera.perspective',
        'projection.perspective',
        'depth.z-buffer',
        'material.solid',
        'playback.fixed-rate-rotation',
      ],
    },
  };
}

function fixtureManifestSource(): string {
  return readFileSync(
    new URL('../../../fixtures/render-everywhere/hello-panel/fixture.json', import.meta.url),
    'utf8',
  );
}

function bunnyMeshAssetManifestSource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bunny.mesh.json',
      import.meta.url,
    ),
    'utf8',
  );
}

function bunnyMeshFixtureManifestSource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bunny.fixture.json',
      import.meta.url,
    ),
    'utf8',
  );
}

function fontPackManifestSource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      import.meta.url,
    ),
    'utf8',
  );
}

function fontPackFailureManifestSource(name: string): string {
  return readFileSync(
    new URL(
      `../../../fixtures/render-everywhere/assets/fonts/failures/${name}.font-pack.geordi.json`,
      import.meta.url,
    ),
    'utf8',
  );
}

function bunnyPlySource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply',
      import.meta.url,
    ),
    'utf8',
  );
}

class RenderFixtureTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

function requireFirstFont(manifest: RenderFixtureFontPackManifest): RenderFixtureFontPackManifest['fonts'][number] {
  return manifest.fonts[0];
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
  it('accepts the committed Stanford bunny mesh asset manifest', () => {
    const manifest = parseRenderFixtureMeshAssetManifest(bunnyMeshAssetManifestSource());

    expect(manifest.id).toBe('render-everywhere:stanford-bunny');
    expect(manifest.assetPath).toBe('bun_zipper_res3.ply');
    expect(manifest.counts).toEqual({ faces: 3851, vertices: 1889 });
    expect(manifest.bounds.min).toEqual([-0.0943643, 0.0334143, -0.0616721]);
    expect(manifest.bounds.max).toEqual([0.0609346, 0.184813, 0.0584651]);
  });

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

describe('render fixture font pack manifest validation', () => {
  it('accepts the committed font pack manifest', () => {
    const manifest = parseRenderFixtureFontPackManifest(fontPackManifestSource());

    expect(manifest.fontPackVersion).toBe(RENDER_FIXTURE_FONT_PACK_VERSION);
    expect(manifest.fonts.map((font) => font.id)).toEqual(['lato-regular']);
    expect(manifest.fonts[0]?.sha256).toBe(
      'sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251',
    );
  });

  it('accepts a typed valid font pack manifest object', () => {
    const manifest = makeFontPackManifest();

    expect(validateRenderFixtureFontPackManifest(manifest)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureFontPackManifest(manifest)).toBe(true);
    expect(assertRenderFixtureFontPackManifest(manifest)).toBe(manifest);
  });

  it('parses font pack manifests through the canonical JSON port', () => {
    const source = canonicalJsonPort.stringify(makeFontPackManifest(), { space: 2 });

    const parsed = parseRenderFixtureFontPackManifest(source);

    expect(parsed.fonts[0]?.familyName).toBe('Lato');
  });

  it('rejects invalid font pack metadata', () => {
    const baseFont = requireFirstFont(makeFontPackManifest());
    const invalid: JsonValue = {
      ...makeFontPackManifest(),
      fontPackVersion: 'geordi-font-pack/2',
      fonts: [
        {
          ...baseFont,
          faceIndex: -1,
          format: 'woff2',
          id: 'Lato Regular',
          license: {
            ...baseFont.license,
            path: '/tmp/OFL.txt',
            redistributionAllowed: 'yes',
            reservedFontNames: ['Lato', 'Lato', ''],
            sha256: 'sha256:nope',
          },
          path: 'https://example.test/font.ttf',
          sha256: 'sha256:nope',
          source: {
            ...baseFont.source,
            commit: 'not-a-commit',
            fontSha256: 'sha256:nope',
            licenseNormalization: 'none',
            licenseSha256: 'sha256:nope',
            repository: '',
          },
          weight: 1001,
        },
      ],
    };

    const result = validateRenderFixtureFontPackManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.fontPackVersion',
      '$.fonts[0].id',
      '$.fonts[0].format',
      '$.fonts[0].path',
      '$.fonts[0].sha256',
      '$.fonts[0].faceIndex',
      '$.fonts[0].weight',
      '$.fonts[0].license.path',
      '$.fonts[0].license.redistributionAllowed',
      '$.fonts[0].license.sha256',
      '$.fonts[0].license.reservedFontNames[1]',
      '$.fonts[0].license.reservedFontNames[2]',
      '$.fonts[0].source.repository',
      '$.fonts[0].source.commit',
      '$.fonts[0].source.fontSha256',
      '$.fonts[0].source.licenseSha256',
      '$.fonts[0].source.licenseNormalization',
    ]);
  });

  it('rejects duplicate font ids', () => {
    const firstFont = requireFirstFont(makeFontPackManifest());
    const invalid: JsonValue = {
      fontPackVersion: RENDER_FIXTURE_FONT_PACK_VERSION,
      fonts: [firstFont, firstFont],
    };

    const result = validateRenderFixtureFontPackManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(['$.fonts[1].id']);
  });

  it('throws a custom error for invalid font pack manifests', () => {
    expect(() =>
      parseRenderFixtureFontPackManifest(
        canonicalJsonPort.stringify(
          {
            ...makeFontPackManifest(),
            fonts: [],
          },
          { space: 2 },
        ),
      ),
    ).toThrow(RenderFixtureInvalidFontPackManifestError);
  });

  it('keeps committed structural failure fixtures rejected', () => {
    expect(() =>
      parseRenderFixtureFontPackManifest(fontPackFailureManifestSource('absolute-path')),
    ).toThrow(RenderFixtureInvalidFontPackManifestError);
    expect(() =>
      parseRenderFixtureFontPackManifest(fontPackFailureManifestSource('duplicate-id')),
    ).toThrow(RenderFixtureInvalidFontPackManifestError);
    expect(() =>
      parseRenderFixtureFontPackManifest(fontPackFailureManifestSource('unsupported-format')),
    ).toThrow(RenderFixtureInvalidFontPackManifestError);
  });
});

describe('render fixture strict text fixture manifest validation', () => {
  it('accepts a typed valid strict text fixture manifest object', () => {
    const manifest = makeStrictTextFixtureManifest();

    expect(validateRenderFixtureStrictTextFixtureManifest(manifest)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureStrictTextFixtureManifest(manifest)).toBe(true);
    expect(assertRenderFixtureStrictTextFixtureManifest(manifest)).toBe(manifest);
  });

  it('parses strict text fixture manifests through the canonical JSON port', () => {
    const source = canonicalJsonPort.stringify(makeStrictTextFixtureManifest(), { space: 2 });

    const parsed = parseRenderFixtureStrictTextFixtureManifest(source);

    expect(parsed.textProfile).toBe(RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE);
    expect(parsed.glyphRuns[0]?.glyphs[0]?.glyphId).toBe(43);
  });

  it('rejects invalid strict text fixture metadata', () => {
    const invalid: JsonValue = {
      ...makeStrictTextFixtureManifest(),
      features: [
        RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
        RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
        'text.host-font-fallback',
      ],
      fixtureVersion: 'geordi-strict-text-fixture/2',
      fontPackPath: 'https://example.test/font-pack.geordi.json',
      glyphRuns: [
        {
          fontId: 'Lato Regular',
          glyphs: [
            {
              advance: Number.POSITIVE_INFINITY,
              glyphId: '43',
              x: 0,
              xOffset: 0,
              y: 3072,
              yOffset: 0,
            },
          ],
          id: '',
          lineBoxId: '',
        },
      ],
      lineBoxes: [
        {
          baselineY: Number.NaN,
          height: 4096,
          id: '',
          width: 12288,
          x: 0,
          y: 0,
        },
      ],
      positionEncoding: 'geordi-fixed-24.8/1',
      semanticText: {
        affectsPixels: true,
        language: '',
        source: '',
      },
      textProfile: 'geordi-css-text/1',
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.fixtureVersion',
      '$.textProfile',
      '$.positionEncoding',
      '$.fontPackPath',
      '$.features[1]',
      '$.features[2]',
      '$.features',
      '$.features',
      '$.semanticText.affectsPixels',
      '$.semanticText.language',
      '$.semanticText.source',
      '$.lineBoxes[0].id',
      '$.lineBoxes[0].baselineY',
      '$.glyphRuns[0].id',
      '$.glyphRuns[0].fontId',
      '$.glyphRuns[0].lineBoxId',
      '$.glyphRuns[0].glyphs[0].glyphId',
      '$.glyphRuns[0].glyphs[0].advance',
    ]);
  });

  it('rejects fractional, unsafe, or negative line box fields', () => {
    const manifest = makeStrictTextFixtureManifest();
    const lineBox = manifest.lineBoxes[0];
    const invalid: JsonValue = {
      ...manifest,
      lineBoxes: [
        {
          ...lineBox,
          x: 0.5,
        },
        {
          ...lineBox,
          baselineY: Number.MAX_SAFE_INTEGER + 1,
          height: -1,
          id: 'line-1',
          width: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.lineBoxes[0].x',
      '$.lineBoxes[1].width',
      '$.lineBoxes[1].height',
      '$.lineBoxes[1].baselineY',
    ]);
  });

  it('rejects duplicate strict text ids and missing line box references', () => {
    const manifest = makeStrictTextFixtureManifest();
    const lineBox = manifest.lineBoxes[0];
    const run = manifest.glyphRuns[0];
    const invalid: JsonValue = {
      ...manifest,
      glyphRuns: [
        {
          ...run,
          lineBoxId: 'missing-line',
        },
        {
          ...run,
          lineBoxId: lineBox.id,
        },
      ],
      lineBoxes: [
        lineBox,
        {
          ...lineBox,
        },
      ],
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.lineBoxes[1].id',
      '$.glyphRuns[0].lineBoxId',
      '$.glyphRuns[1].id',
    ]);
  });

  it('throws a custom error for invalid strict text fixture manifests', () => {
    expect(() =>
      parseRenderFixtureStrictTextFixtureManifest(
        canonicalJsonPort.stringify(
          {
            ...makeStrictTextFixtureManifest(),
            glyphRuns: [],
          },
          { space: 2 },
        ),
      ),
    ).toThrow(RenderFixtureInvalidStrictTextFixtureManifestError);
  });

  it('rejects negative or unsafe glyph ids', () => {
    const manifest = makeStrictTextFixtureManifest();
    const run = manifest.glyphRuns[0];
    const glyph = run.glyphs[0];
    const invalid: JsonValue = {
      ...manifest,
      glyphRuns: [
        {
          ...run,
          glyphs: [
            {
              ...glyph,
              glyphId: -1,
            },
            {
              ...glyph,
              glyphId: Number.MAX_SAFE_INTEGER + 1,
            },
          ],
        },
      ],
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.glyphRuns[0].glyphs[0].glyphId',
      '$.glyphRuns[0].glyphs[1].glyphId',
    ]);
  });

  it('rejects fractional or unsafe glyph positions', () => {
    const manifest = makeStrictTextFixtureManifest();
    const run = manifest.glyphRuns[0];
    const glyph = run.glyphs[0];
    const invalid: JsonValue = {
      ...manifest,
      glyphRuns: [
        {
          ...run,
          glyphs: [
            {
              ...glyph,
              x: 0.5,
            },
            {
              ...glyph,
              y: Number.MAX_SAFE_INTEGER + 1,
            },
          ],
        },
      ],
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.glyphRuns[0].glyphs[0].x',
      '$.glyphRuns[0].glyphs[1].y',
    ]);
  });

  it('rejects fractional offsets and negative advances', () => {
    const manifest = makeStrictTextFixtureManifest();
    const run = manifest.glyphRuns[0];
    const glyph = run.glyphs[0];
    const invalid: JsonValue = {
      ...manifest,
      glyphRuns: [
        {
          ...run,
          glyphs: [
            {
              ...glyph,
              xOffset: 0.25,
            },
            {
              ...glyph,
              yOffset: Number.MAX_SAFE_INTEGER + 1,
            },
            {
              ...glyph,
              advance: -1,
            },
          ],
        },
      ],
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.glyphRuns[0].glyphs[0].xOffset',
      '$.glyphRuns[0].glyphs[1].yOffset',
      '$.glyphRuns[0].glyphs[2].advance',
    ]);
  });
});

describe('render fixture mesh fixture manifest validation', () => {
  it('accepts a typed valid mesh fixture manifest object', () => {
    const manifest = makeMeshFixtureManifest();

    expect(validateRenderFixtureMeshFixtureManifest(manifest)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureMeshFixtureManifest(manifest)).toBe(true);
    expect(assertRenderFixtureMeshFixtureManifest(manifest)).toBe(manifest);
  });

  it('parses mesh fixture manifests through the canonical JSON port', () => {
    const source = canonicalJsonPort.stringify(makeMeshFixtureManifest(), { space: 2 });

    const parsed = parseRenderFixtureMeshFixtureManifest(source);

    expect(parsed.id).toBe('render-everywhere:stanford-bunny');
    expect(parsed.playback.axis).toEqual([3, 5, 2]);
  });

  it('parses the committed Stanford bunny mesh fixture descriptor', () => {
    const parsed = parseRenderFixtureMeshFixtureManifest(bunnyMeshFixtureManifestSource());

    expect(parsed.assetManifestPath).toBe('bunny.mesh.json');
    expect(parsed.id).toBe('render-everywhere:stanford-bunny');
    expect(parsed.material.backgroundColor).toBe('#111827');
    expect(parsed.playback.radiansPerSecond).toBe(0.7853981633974483);
  });

  it('derives deterministic fixed-rate playback frame metadata', () => {
    const frame = createRenderFixtureMeshPlaybackFrame(makeMeshFixtureManifest().playback, 15);

    expect(frame.axis).toEqual([3, 5, 2]);
    expect(frame.normalizedAxis[0]).toBeCloseTo(0.4866642633922876);
    expect(frame.normalizedAxis[1]).toBeCloseTo(0.8111071056538126);
    expect(frame.normalizedAxis[2]).toBeCloseTo(0.32444284226152503);
    expect(frame.frameIndex).toBe(15);
    expect(frame.sampleRate).toBe(60);
    expect(frame.seconds).toBe(0.25);
    expect(frame.radiansPerSecond).toBe(0.7853981633974483);
    expect(frame.angleRadians).toBeCloseTo(Math.PI / 16);
  });

  it('rejects invalid fixed-rate playback frames with a custom error', () => {
    expect(() =>
      createRenderFixtureMeshPlaybackFrame(makeMeshFixtureManifest().playback, -1),
    ).toThrow(RenderFixtureInvalidPlaybackFrameError);
  });

  it('rejects invalid fixed-rate playback descriptors with a custom error', () => {
    expect(() =>
      createRenderFixtureMeshPlaybackFrame(
        {
          ...makeMeshFixtureManifest().playback,
          sampleRate: 0,
        },
        0,
      ),
    ).toThrow(RenderFixtureInvalidMeshPlaybackError);

    expect(() =>
      createRenderFixtureMeshPlaybackFrame(
        {
          ...makeMeshFixtureManifest().playback,
          axis: [0, 0, 0],
        },
        0,
      ),
    ).toThrow(RenderFixtureInvalidMeshPlaybackError);
  });

  it('rejects zero playback axes', () => {
    const invalid: JsonValue = {
      ...makeMeshFixtureManifest(),
      playback: {
        ...makeMeshFixtureManifest().playback,
        axis: [0, 0, 0],
      },
    };

    const result = validateRenderFixtureMeshFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(['$.playback.axis']);
  });

  it('rejects mesh projections whose near plane is not before the far plane', () => {
    const invalid: JsonValue = {
      ...makeMeshFixtureManifest(),
      projection: {
        ...makeMeshFixtureManifest().projection,
        far: 1,
        near: 1,
      },
    };

    const result = validateRenderFixtureMeshFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(['$.projection.near']);
  });

  it('rejects invalid mesh fixture descriptor metadata', () => {
    const invalid: JsonValue = {
      ...makeMeshFixtureManifest(),
      assetManifestPath: '../bunny.mesh.json',
      camera: {
        coordinateSystem: 'left-handed',
        eye: [0, 0, Number.NaN],
        target: [0, 0],
        up: [0, 1, 0],
      },
      fixtureVersion: 'geordi-mesh-render-fixture/2',
      material: {
        backgroundColor: '#11182g',
        color: '#D1D5DB',
        kind: 'shader',
      },
      playback: {
        axis: [0, 1],
        kind: 'timeline',
        radiansPerSecond: -1,
        sampleRate: 0,
      },
      projection: {
        far: 0,
        kind: 'orthographic',
        near: Number.POSITIVE_INFINITY,
        verticalFovRadians: 0,
        viewport: {
          height: 0,
          width: -1,
        },
      },
      runtimeProfile: {
        numericProfile: 'geordi-float-anything/1',
        requires: ['asset.mesh', 'mesh.triangle', 'effect.blur/1'],
      },
    };

    const result = validateRenderFixtureMeshFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.fixtureVersion',
      '$.assetManifestPath',
      '$.runtimeProfile.numericProfile',
      '$.runtimeProfile.requires[2]',
      '$.runtimeProfile.requires',
      '$.camera.coordinateSystem',
      '$.camera.eye[2]',
      '$.camera.target',
      '$.projection.kind',
      '$.projection.verticalFovRadians',
      '$.projection.near',
      '$.projection.far',
      '$.projection.viewport.width',
      '$.projection.viewport.height',
      '$.material.kind',
      '$.material.color',
      '$.material.backgroundColor',
      '$.playback.kind',
      '$.playback.axis',
      '$.playback.radiansPerSecond',
      '$.playback.sampleRate',
    ]);
  });

  it('throws a custom error for invalid mesh fixture manifests', () => {
    expect(() =>
      parseRenderFixtureMeshFixtureManifest(
        canonicalJsonPort.stringify(
          {
            ...makeMeshFixtureManifest(),
            playback: {
              ...makeMeshFixtureManifest().playback,
              sampleRate: 0,
            },
          },
          { space: 2 },
        ),
      ),
    ).toThrow(RenderFixtureInvalidMeshFixtureManifestError);
  });
});

describe('render fixture ASCII PLY triangle mesh parser', () => {
  it('parses the committed Stanford bunny PLY into typed mesh data', () => {
    const mesh = parseRenderFixtureAsciiPlyTriangleMesh(bunnyPlySource());

    expect(mesh.vertexProperties).toEqual(['x', 'y', 'z', 'confidence', 'intensity']);
    expect(mesh.vertices).toHaveLength(1889);
    expect(mesh.faces).toHaveLength(3851);
    expect(mesh.bounds.min).toEqual([-0.0943643, 0.0334143, -0.0616721]);
    expect(mesh.bounds.max).toEqual([0.0609346, 0.184813, 0.0584651]);
    expect(mesh.faces[0]).toEqual([4, 132, 80]);
  });

  it('rejects unsupported PLY headers with a custom error', () => {
    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format binary_little_endian 1.0
element vertex 1
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
3 0 0 0
`),
    ).toThrow(RenderFixturePlyHeaderError);
  });

  it('rejects malformed vertex rows with a custom error', () => {
    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 NaN 0
3 0 0 0
`),
    ).toThrow(RenderFixturePlyVertexError);
  });

  it('rejects non-triangle or out-of-range faces with a custom error', () => {
    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
4 0 0 0 0
`),
    ).toThrow(RenderFixturePlyFaceError);
  });

  it('rejects noncanonical PLY element lines with a custom error', () => {
    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format ascii 1.0
element vertex 1 extra
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
3 0 0 0
`),
    ).toThrow(RenderFixturePlyHeaderError);
  });

  it('rejects nondecimal PLY numeric tokens with a custom error', () => {
    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0x1 0 0
3 0 0 0
`),
    ).toThrow(RenderFixturePlyVertexError);

    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
3 0x0 0 0
`),
    ).toThrow(RenderFixturePlyFaceError);
  });

  it('rejects trailing nonempty PLY body lines with a custom error', () => {
    expect(() =>
      parseRenderFixtureAsciiPlyTriangleMesh(`ply
format ascii 1.0
element vertex 1
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
3 0 0 0
not-part-of-the-declared-body
`),
    ).toThrow(RenderFixturePlyFaceError);
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
