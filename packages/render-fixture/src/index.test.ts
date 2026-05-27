import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalJsonPort,
  GEORDI_CORE_PROFILE,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  type GeordiIr,
  type JsonObject,
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
  assertRenderFixtureStrictTextFontReferences,
  assertRenderFixtureStrictTextEvidenceCoverage,
  assertRenderFixtureStrictTextEvidenceLineBoxes,
  assertRenderFixtureStrictTextFixtureManifest,
  assertRenderFixtureStrictTextOutlineEvidencePack,
  assertRenderFixtureStrictTextProbePolicy,
  assertRenderFixtureStrictTextFixtureReceipt,
  createRenderFixtureMeshPlaybackFrame,
  isRenderFixtureFontPackManifest,
  isRenderFixtureMeshAssetManifest,
  isRenderFixtureMeshFixtureManifest,
  isRenderFixtureManifest,
  isRenderFixtureStrictTextFixtureManifest,
  isRenderFixtureStrictTextOutlineEvidencePack,
  isRenderFixtureStrictTextProbePolicy,
  isRenderFixtureStrictTextFixtureReceipt,
  parseRenderFixtureAsciiPlyTriangleMesh,
  parseRenderFixtureFontPackManifest,
  parseRenderFixtureMeshAssetManifest,
  parseRenderFixtureMeshFixtureManifest,
  parseRenderFixtureManifest,
  parseRenderFixtureStrictTextFixtureManifest,
  parseRenderFixtureStrictTextOutlineEvidencePack,
  parseRenderFixtureStrictTextProbePolicy,
  parseRenderFixtureStrictTextFixtureReceipt,
  RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE,
  RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING,
  RENDER_FIXTURE_FONT_FORMAT_TTF,
  RENDER_FIXTURE_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE,
  RENDER_FIXTURE_FONT_PACK_VERSION,
  RENDER_FIXTURE_HASH_ALGORITHM_SHA256,
  RENDER_FIXTURE_GLYPH_EVIDENCE_COORDINATE_SPACE_GLYPH_ORIGIN_FIXED_26_6,
  RENDER_FIXTURE_GLYPH_EVIDENCE_KIND_OUTLINE_PATHS,
  RENDER_FIXTURE_GLYPH_EVIDENCE_PACK_VERSION,
  RENDER_FIXTURE_GLYPH_EVIDENCE_PAINT_KIND_SOLID_FILL,
  RENDER_FIXTURE_GLYPH_EVIDENCE_WINDING_RULE_NONZERO,
  RENDER_FIXTURE_STRICT_TEXT_BOUNDS_SOURCE_OUTLINE_EVIDENCE,
  RENDER_FIXTURE_MESH_FIXTURE_VERSION,
  RENDER_FIXTURE_MESH_ASSET_VERSION,
  RENDER_FIXTURE_SOURCE_KIND_GPVUE_DRAFT,
  RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  RENDER_FIXTURE_STRICT_TEXT_FIXTURE_RECEIPT_VERSION,
  RENDER_FIXTURE_STRICT_TEXT_FIXTURE_VERSION,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_ANTI_ALIAS_EDGE_POLICY,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_EXPECTATION_FILL,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_EXPECTATION_TRANSPARENT,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_POLICY_VERSION,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_STABILITY_BACKGROUND_OUTSIDE_GLYPH_BOUNDS,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_STABILITY_INTERIOR_FILL_AWAY_FROM_EDGE,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_TOLERANCE_ALPHA_ZERO,
  RENDER_FIXTURE_STRICT_TEXT_PROBE_TOLERANCE_EXACT_FILL_RGBA,
  RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_PRECOMPUTED,
  RENDER_FIXTURE_TEXT_FEATURE_FONT_PACK,
  RENDER_FIXTURE_TEXT_FEATURE_LINE_BOXES,
  RENDER_FIXTURE_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
  RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
  RENDER_FIXTURE_VERSION,
  RenderFixtureArtifactValidationError,
  RenderFixtureInvalidFontPackManifestError,
  RenderFixtureInvalidMeshAssetManifestError,
  RenderFixtureInvalidMeshFixtureManifestError,
  RenderFixtureInvalidManifestError,
  RenderFixtureInvalidMeshPlaybackError,
  RenderFixtureInvalidPixelSampleError,
  RenderFixtureInvalidPlaybackFrameError,
  RenderFixtureInvalidStrictTextFontReferenceError,
  RenderFixtureInvalidStrictTextEvidenceCoverageError,
  RenderFixtureInvalidStrictTextEvidenceLineBoxError,
  RenderFixtureInvalidStrictTextFixtureManifestError,
  RenderFixtureInvalidStrictTextOutlineEvidencePackError,
  RenderFixtureInvalidStrictTextProbePolicyError,
  RenderFixtureInvalidStrictTextFixtureReceiptError,
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
  validateRenderFixtureStrictTextFontReferences,
  validateRenderFixtureStrictTextEvidenceCoverage,
  validateRenderFixtureStrictTextEvidenceLineBoxes,
  validateRenderFixtureStrictTextFixtureManifest,
  validateRenderFixtureStrictTextOutlineEvidencePack,
  validateRenderFixtureStrictTextProbePolicy,
  validateRenderFixtureStrictTextFixtureReceipt,
  type RenderFixtureFontPackManifest,
  type RenderFixtureManifest,
  type RenderFixtureMeshAssetManifest,
  type RenderFixtureMeshFixtureManifest,
  type RenderFixturePixelProbe,
  type RenderFixtureStrictTextFixtureManifest,
  type RenderFixtureStrictTextOutlineEvidencePack,
  type RenderFixtureStrictTextProbePolicy,
  type RenderFixtureStrictTextFixtureReceipt,
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

function makeStrictTextFixtureReceipt(): RenderFixtureStrictTextFixtureReceipt {
  return {
    fixtureHash: 'sha256:e3686b463296e0e7b019d7b014537a300f8fe6949a9053cf7d62067a978bf8c0',
    fixturePath: 'fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json',
    fontPackHash: 'sha256:1b7ad58b48a3ad0d1aff0736ef014783945dc0a472de1f14b48c4211eb53533d',
    fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
    generatedBy: RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
    glyphRunHash: 'sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472',
    hashAlgorithm: RENDER_FIXTURE_HASH_ALGORITHM_SHA256,
    lineBoxHash: 'sha256:6d0b4e63bd04bd33e7213240a173f86fb478f23fa4cd505514c0b8af425f1e10',
    positionEncodingProfile: RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING,
    receiptVersion: RENDER_FIXTURE_STRICT_TEXT_FIXTURE_RECEIPT_VERSION,
    semanticTextAffectsPixels: false,
    semanticTextHash: 'sha256:c1c66afeda52b1b7ef23ad22a11e631fb02d21db27ea92ad5823d2a28bca3ab3',
    shapingProfile: RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_PRECOMPUTED,
    textProfile: RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE,
  };
}

function makeStrictTextOutlineEvidencePack(): RenderFixtureStrictTextOutlineEvidencePack {
  return {
    coordinateSpace: RENDER_FIXTURE_GLYPH_EVIDENCE_COORDINATE_SPACE_GLYPH_ORIGIN_FIXED_26_6,
    evidenceKind: RENDER_FIXTURE_GLYPH_EVIDENCE_KIND_OUTLINE_PATHS,
    evidencePackVersion: RENDER_FIXTURE_GLYPH_EVIDENCE_PACK_VERSION,
    faceIndex: 0,
    fontId: 'lato-regular',
    fontSha256: 'sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251',
    glyphs: [
      {
        bounds: {
          height: 2304,
          width: 1536,
          x: 0,
          y: -2304,
        },
        commands: [
          {
            op: 'moveTo',
            x: 0,
            y: -2304,
          },
          {
            op: 'quadTo',
            cx: 768,
            cy: -2560,
            x: 1536,
            y: -2304,
          },
          {
            op: 'lineTo',
            x: 1536,
            y: 0,
          },
          {
            op: 'closePath',
          },
        ],
        draws: true,
        glyphId: 43,
      },
    ],
    id: 'render-everywhere:strict-text:unit:outline-evidence',
    paint: {
      kind: RENDER_FIXTURE_GLYPH_EVIDENCE_PAINT_KIND_SOLID_FILL,
      rgba: [17, 24, 39, 255],
    },
    positionEncoding: RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING,
    shapingProfile: RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_PRECOMPUTED,
    textProfile: RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE,
    windingRule: RENDER_FIXTURE_GLYPH_EVIDENCE_WINDING_RULE_NONZERO,
  };
}

function makeStrictTextProbePolicy(): RenderFixtureStrictTextProbePolicy {
  return {
    allowedNonblankBounds: {
      maxX: 176,
      maxY: 48,
      minX: 2,
      minY: 13,
    },
    antiAliasEdgePolicy: RENDER_FIXTURE_STRICT_TEXT_PROBE_ANTI_ALIAS_EDGE_POLICY,
    boundsSource: RENDER_FIXTURE_STRICT_TEXT_BOUNDS_SOURCE_OUTLINE_EVIDENCE,
    canvas: {
      height: 64,
      width: 192,
    },
    evidencePackId: 'render-everywhere:strict-text:geordi:outline-evidence',
    evidencePackPath: 'fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json',
    fillRgba: [17, 24, 39, 255],
    fixtureId: 'render-everywhere:strict-text:geordi',
    fixturePath: 'fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json',
    id: 'render-everywhere:strict-text:geordi:probe-policy',
    nonclaim:
      'Coarse visibility smoke only. This policy does not claim full antialiasing identity, pixel-identical rasterization, shaping support, or general text rendering.',
    probePolicyVersion: RENDER_FIXTURE_STRICT_TEXT_PROBE_POLICY_VERSION,
    probes: [
      {
        coordinateSource:
          'Manual sample from the canonical GEORDI outline evidence interior, away from the observed contour edge.',
        expectation: RENDER_FIXTURE_STRICT_TEXT_PROBE_EXPECTATION_FILL,
        id: 'text-g-fill-top',
        purpose: 'Prove an interior G fill pixel is present near the top of the glyph run.',
        stability: RENDER_FIXTURE_STRICT_TEXT_PROBE_STABILITY_INTERIOR_FILL_AWAY_FROM_EDGE,
        tolerance: RENDER_FIXTURE_STRICT_TEXT_PROBE_TOLERANCE_EXACT_FILL_RGBA,
        x: 12,
        y: 15,
      },
      {
        coordinateSource:
          'Manual sample above the canonical GEORDI outline evidence and outside the observed nonblank text bounds.',
        expectation: RENDER_FIXTURE_STRICT_TEXT_PROBE_EXPECTATION_TRANSPARENT,
        id: 'text-background-top',
        purpose: 'Prove the text canvas keeps transparent background above the glyph evidence.',
        stability: RENDER_FIXTURE_STRICT_TEXT_PROBE_STABILITY_BACKGROUND_OUTSIDE_GLYPH_BOUNDS,
        tolerance: RENDER_FIXTURE_STRICT_TEXT_PROBE_TOLERANCE_ALPHA_ZERO,
        x: 100,
        y: 5,
      },
    ],
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

function strictTextFixtureASource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json',
      import.meta.url,
    ),
    'utf8',
  );
}

function strictTextFixtureBSource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/strict-text/text-0123.strict-text.geordi.json',
      import.meta.url,
    ),
    'utf8',
  );
}

function strictTextProbePolicySource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/strict-text/geordi.probe-policy.geordi.json',
      import.meta.url,
    ),
    'utf8',
  );
}

function strictTextOutlineEvidenceSource(name: 'geordi' | 'text-0123'): string {
  return readFileSync(
    new URL(
      `../../../fixtures/render-everywhere/strict-text/${name}.outline-evidence.geordi.json`,
      import.meta.url,
    ),
    'utf8',
  );
}

function strictTextOutlineEvidenceFailureSource(name: string): string {
  return readFileSync(
    new URL(
      `../../../fixtures/render-everywhere/strict-text/failures/${name}.outline-evidence.geordi.json`,
      import.meta.url,
    ),
    'utf8',
  );
}

function strictTextFailureFixtureSource(name: string): string {
  return readFileSync(
    new URL(
      `../../../fixtures/render-everywhere/strict-text/failures/${name}.strict-text.geordi.json`,
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

function requireJsonObject(value: JsonValue, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RenderFixtureTestError(`${label} must be a JSON object`);
  }

  return value;
}

function isJsonValueArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function requireJsonArrayField(object: JsonObject, key: string, label: string): readonly JsonValue[] {
  const value = object[key];
  if (!isJsonValueArray(value)) {
    throw new RenderFixtureTestError(`${label}.${key} must be a JSON array`);
  }

  return value;
}

function requireJsonNumberField(object: JsonObject, key: string, label: string): number {
  const value = object[key];
  if (typeof value !== 'number') {
    throw new RenderFixtureTestError(`${label}.${key} must be a number`);
  }

  return value;
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

  it('keeps committed strict text fixtures canonical JSON normalized', () => {
    const sources = [strictTextFixtureASource(), strictTextFixtureBSource()];

    for (const source of sources) {
      const normalized = canonicalJsonPort.stringify(canonicalJsonPort.parse(source), {
        space: 2,
      });

      expect(source).toBe(`${normalized}\n`);
    }
  });

  it('keeps committed strict text outline evidence packs canonical JSON normalized', () => {
    const sources = [strictTextOutlineEvidenceSource('geordi'), strictTextOutlineEvidenceSource('text-0123')];

    for (const source of sources) {
      const normalized = canonicalJsonPort.stringify(canonicalJsonPort.parse(source), {
        space: 2,
      });

      expect(source).toBe(`${normalized}\n`);
    }
  });

  it('commits fixture-local outline evidence for every canonical strict text glyph id', () => {
    const fixtures = [
      {
        evidence: strictTextOutlineEvidenceSource('geordi'),
        fixture: parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureASource()),
      },
      {
        evidence: strictTextOutlineEvidenceSource('text-0123'),
        fixture: parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureBSource()),
      },
    ];

    for (const { evidence, fixture } of fixtures) {
      const pack = requireJsonObject(canonicalJsonPort.parse(evidence), 'outline evidence pack');
      const glyphEntries = requireJsonArrayField(pack, 'glyphs', 'outline evidence pack').map(
        (entry, index) => requireJsonObject(entry, `outline evidence pack glyph ${index}`),
      );
      const coveredGlyphIds = glyphEntries.map((entry) =>
        requireJsonNumberField(entry, 'glyphId', 'outline evidence pack glyph'),
      );
      const referencedGlyphIds = [
        ...new Set(fixture.glyphRuns.flatMap((run) => run.glyphs.map((glyph) => glyph.glyphId))),
      ];

      expect(pack.evidencePackVersion).toBe('geordi-glyph-evidence-pack/1');
      expect(pack.evidenceKind).toBe(RENDER_FIXTURE_GLYPH_EVIDENCE_KIND_OUTLINE_PATHS);
      expect(pack.textProfile).toBe(RENDER_FIXTURE_STRICT_POSITIONED_GLYPH_RUN_PROFILE);
      expect(pack.positionEncoding).toBe(RENDER_FIXTURE_FIXED_26_6_POSITION_ENCODING);
      expect(pack.fontId).toBe('lato-regular');
      expect(pack.fontSha256).toBe(
        'sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251',
      );
      expect(coveredGlyphIds).toEqual(referencedGlyphIds);

      for (const entry of glyphEntries) {
        const commands = requireJsonArrayField(entry, 'commands', 'outline evidence pack glyph');
        if (entry.glyphId === 2) {
          expect(entry.draws).toBe(false);
          expect(commands).toEqual([]);
        } else {
          expect(entry.draws).toBe(true);
          expect(commands.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('accepts a typed valid strict text outline evidence pack object', () => {
    const pack = makeStrictTextOutlineEvidencePack();

    expect(validateRenderFixtureStrictTextOutlineEvidencePack(pack)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureStrictTextOutlineEvidencePack(pack)).toBe(true);
    expect(assertRenderFixtureStrictTextOutlineEvidencePack(pack)).toBe(pack);
  });

  it('parses committed strict text outline evidence packs through the canonical JSON port', () => {
    const geordi = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceSource('geordi'),
    );
    const text0123 = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceSource('text-0123'),
    );

    expect(geordi.evidencePackVersion).toBe(RENDER_FIXTURE_GLYPH_EVIDENCE_PACK_VERSION);
    expect(geordi.glyphs.map((glyph) => glyph.glyphId)).toEqual([14, 11, 27, 33, 9, 17]);
    expect(geordi.glyphs[0]?.commands[0]?.op).toBe('moveTo');
    expect(text0123.glyphs.map((glyph) => glyph.glyphId)).toEqual([
      124, 59, 138, 2, 399, 400, 401, 402,
    ]);
    expect(text0123.glyphs[3]).toMatchObject({
      commands: [],
      draws: false,
      glyphId: 2,
    });
  });

  it('rejects invalid strict text outline evidence packs with stable diagnostic codes', () => {
    const invalid: JsonValue = {
      ...makeStrictTextOutlineEvidencePack(),
      coordinateSpace: 'font-units/1',
      evidenceKind: 'bitmapAtlas',
      evidencePackVersion: 'geordi-glyph-evidence-pack/2',
      faceIndex: -1,
      fontId: 'Lato Regular',
      fontSha256: 'sha256:not-a-hash',
      glyphs: [
        {
          bounds: {
            height: -1,
            width: -1,
            x: Number.MAX_SAFE_INTEGER,
            y: 0,
          },
          commands: [
            {
              op: 'arcTo',
              x: 0,
              y: 0,
            },
          ],
          draws: true,
          glyphId: 43,
        },
        {
          bounds: {
            height: 0,
            width: 0,
            x: 0,
            y: 0,
          },
          commands: [],
          draws: false,
          glyphId: 43,
        },
      ],
      paint: {
        kind: 'stroke',
        rgba: [0, 0, 0, 512],
      },
      positionEncoding: 'float-px/1',
      shapingProfile: 'runtime-shaping/1',
      textProfile: 'css-text/1',
      windingRule: 'evenodd',
    };

    const result = validateRenderFixtureStrictTextOutlineEvidencePack(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'GEORDI_TEXT_EVIDENCE_UNSUPPORTED_VERSION',
        'GEORDI_TEXT_EVIDENCE_UNSUPPORTED_KIND',
        'GEORDI_TEXT_EVIDENCE_UNSUPPORTED_PROFILE',
        'GEORDI_TEXT_EVIDENCE_BAD_FONT_ID',
        'GEORDI_TEXT_EVIDENCE_BAD_FONT_HASH',
        'GEORDI_TEXT_EVIDENCE_BAD_FACE_INDEX',
        'GEORDI_TEXT_EVIDENCE_DUPLICATE_GLYPH',
        'GEORDI_TEXT_EVIDENCE_BAD_BOUNDS',
        'GEORDI_TEXT_EVIDENCE_BAD_COMMAND',
        'GEORDI_TEXT_EVIDENCE_UNSUPPORTED_PAINT',
        'GEORDI_TEXT_EVIDENCE_UNSUPPORTED_WINDING_RULE',
      ]),
    );
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        '$.evidencePackVersion',
        '$.evidenceKind',
        '$.coordinateSpace',
        '$.fontId',
        '$.fontSha256',
        '$.faceIndex',
        '$.glyphs[1].glyphId',
        '$.glyphs[0].bounds.width',
        '$.glyphs[0].commands[0].op',
        '$.paint.kind',
        '$.windingRule',
      ]),
    );
    expect(() => assertRenderFixtureStrictTextOutlineEvidencePack(invalid)).toThrow(
      RenderFixtureInvalidStrictTextOutlineEvidencePackError,
    );
  });

  it('rejects outline evidence commands with invalid contour state or fields', () => {
    const pack = canonicalJsonPort.parse(
      strictTextOutlineEvidenceFailureSource('bad-outline-command'),
    );
    const result = validateRenderFixtureStrictTextOutlineEvidencePack(pack);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['GEORDI_TEXT_EVIDENCE_BAD_COMMAND']),
    );
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        '$.glyphs[0].commands[0].op',
        '$.glyphs[0].commands[2].op',
        '$.glyphs[0].commands[3].x',
        '$.glyphs[0].commands[3].y',
      ]),
    );
    expect(() => parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceFailureSource('bad-outline-command'),
    )).toThrow(RenderFixtureInvalidStrictTextOutlineEvidencePackError);
  });

  it('rejects unsupported strict text outline evidence paint', () => {
    const source = strictTextOutlineEvidenceFailureSource('unsupported-paint');
    const pack = canonicalJsonPort.parse(source);
    const result = validateRenderFixtureStrictTextOutlineEvidencePack(pack);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'GEORDI_TEXT_EVIDENCE_UNSUPPORTED_PAINT',
      message: 'Strict text outline evidence paint kind must be solidFill',
      path: '$.paint.kind',
    });
    expect(() => parseRenderFixtureStrictTextOutlineEvidencePack(source)).toThrow(
      RenderFixtureInvalidStrictTextOutlineEvidencePackError,
    );
  });

  it('rejects missing strict text glyph evidence coverage', () => {
    const fixture = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureASource());
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceFailureSource('missing-glyph-evidence'),
    );

    const result = validateRenderFixtureStrictTextEvidenceCoverage({ evidence, fixture });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'GEORDI_TEXT_EVIDENCE_MISSING_GLYPH',
      message: 'Strict text outline evidence is missing glyph evidence for lato-regular:11',
      path: '$.glyphRuns[0].glyphs[1].glyphId',
    });
    expect(() => assertRenderFixtureStrictTextEvidenceCoverage({ evidence, fixture })).toThrow(
      RenderFixtureInvalidStrictTextEvidenceCoverageError,
    );
  });

  it('rejects strict text evidence coverage when the evidence font id differs', () => {
    const fixture = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureASource());
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceSource('geordi'),
    );

    const result = validateRenderFixtureStrictTextEvidenceCoverage({
      evidence: { ...evidence, fontId: 'lato-bold' },
      fixture,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'GEORDI_TEXT_EVIDENCE_MISSING_GLYPH',
      message: 'Strict text outline evidence is missing glyph evidence for lato-regular:14',
      path: '$.glyphRuns[0].glyphs[0].glyphId',
    });
  });

  it('rejects unreferenced strict text glyph evidence coverage', () => {
    const fixture = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureASource());
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceFailureSource('unknown-glyph-evidence'),
    );

    const result = validateRenderFixtureStrictTextEvidenceCoverage({ evidence, fixture });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'GEORDI_TEXT_EVIDENCE_UNKNOWN_GLYPH',
      message: 'Strict text outline evidence glyph is not referenced by fixture for lato-regular:9999',
      path: '$.glyphs[6].glyphId',
    });
  });

  it('rejects strict text evidence bounds outside declared line boxes', () => {
    const fixture = parseRenderFixtureStrictTextFixtureManifest(
      strictTextFailureFixtureSource('bad-line-box'),
    );
    const evidence = parseRenderFixtureStrictTextOutlineEvidencePack(
      strictTextOutlineEvidenceSource('geordi'),
    );

    const result = validateRenderFixtureStrictTextEvidenceLineBoxes({ evidence, fixture });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'GEORDI_TEXT_EVIDENCE_OUTSIDE_LINE_BOX',
      message: 'Strict text outline evidence bounds for lato-regular:14 must stay inside line box line-0',
      path: '$.glyphs[0].bounds',
    });
    expect(() => assertRenderFixtureStrictTextEvidenceLineBoxes({ evidence, fixture })).toThrow(
      RenderFixtureInvalidStrictTextEvidenceLineBoxError,
    );
  });

  it('accepts a typed valid strict text probe policy object', () => {
    const policy = makeStrictTextProbePolicy();

    expect(validateRenderFixtureStrictTextProbePolicy(policy)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureStrictTextProbePolicy(policy)).toBe(true);
    expect(assertRenderFixtureStrictTextProbePolicy(policy)).toBe(policy);
  });

  it('loads the canonical strict text probe policy', () => {
    const source = strictTextProbePolicySource();
    const policy = parseRenderFixtureStrictTextProbePolicy(source);

    expect(`${canonicalJsonPort.stringify(policy, { space: 2 })}\n`).toBe(source);
    expect(policy.probePolicyVersion).toBe(RENDER_FIXTURE_STRICT_TEXT_PROBE_POLICY_VERSION);
    expect(policy.fixtureId).toBe('render-everywhere:strict-text:geordi');
    expect(policy.evidencePackId).toBe(
      'render-everywhere:strict-text:geordi:outline-evidence',
    );
    expect(policy.boundsSource).toBe(RENDER_FIXTURE_STRICT_TEXT_BOUNDS_SOURCE_OUTLINE_EVIDENCE);
    expect(policy.allowedNonblankBounds).toEqual({
      maxX: 176,
      maxY: 48,
      minX: 2,
      minY: 13,
    });
    expect(policy.fillRgba).toEqual([17, 24, 39, 255]);
    expect(policy.probes.map((probe) => probe.id)).toEqual([
      'text-background-top',
      'text-g-fill-top',
      'text-e-fill-mid',
      'text-o-fill-mid',
      'text-r-fill-mid',
      'text-d-fill-mid',
      'text-i-fill-mid',
      'text-background-bottom',
    ]);
  });

  it('rejects unstable strict text probe policies', () => {
    const invalid: JsonValue = {
      ...makeStrictTextProbePolicy(),
      allowedNonblankBounds: {
        maxX: 300,
        maxY: 48,
        minX: 301,
        minY: -1,
      },
      antiAliasEdgePolicy: 'edge-probes-are-blocking',
      boundsSource: 'manual-observed-pixels/1',
      fixturePath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      probePolicyVersion: 'geordi-strict-text-probe-policy/2',
      probes: [
        {
          coordinateSource: '',
          expectation: RENDER_FIXTURE_STRICT_TEXT_PROBE_EXPECTATION_FILL,
          id: 'edge-probe',
          purpose: '',
          stability: RENDER_FIXTURE_STRICT_TEXT_PROBE_STABILITY_BACKGROUND_OUTSIDE_GLYPH_BOUNDS,
          tolerance: RENDER_FIXTURE_STRICT_TEXT_PROBE_TOLERANCE_ALPHA_ZERO,
          x: 192,
          y: -1,
        },
        {
          coordinateSource: 'duplicate edge sample',
          expectation: RENDER_FIXTURE_STRICT_TEXT_PROBE_EXPECTATION_FILL,
          id: 'edge-probe',
          purpose: 'duplicate id',
          stability: RENDER_FIXTURE_STRICT_TEXT_PROBE_STABILITY_BACKGROUND_OUTSIDE_GLYPH_BOUNDS,
          tolerance: RENDER_FIXTURE_STRICT_TEXT_PROBE_TOLERANCE_ALPHA_ZERO,
          x: 12,
          y: 15,
        },
      ],
    };

    const result = validateRenderFixtureStrictTextProbePolicy(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        '$.probePolicyVersion',
        '$.fixturePath',
        '$.boundsSource',
        '$.allowedNonblankBounds',
        '$.allowedNonblankBounds.maxX',
        '$.allowedNonblankBounds.minY',
        '$.antiAliasEdgePolicy',
        '$.probes',
        '$.probes[0].x',
        '$.probes[0].y',
        '$.probes[0].purpose',
        '$.probes[0].coordinateSource',
        '$.probes[0].tolerance',
        '$.probes[0].stability',
        '$.probes[1].id',
      ]),
    );
    expect(() => assertRenderFixtureStrictTextProbePolicy(invalid)).toThrow(
      RenderFixtureInvalidStrictTextProbePolicyError,
    );
  });

  it('accepts a typed valid strict text fixture receipt object', () => {
    const receipt = makeStrictTextFixtureReceipt();

    expect(validateRenderFixtureStrictTextFixtureReceipt(receipt)).toEqual({
      ok: true,
      issues: [],
    });
    expect(isRenderFixtureStrictTextFixtureReceipt(receipt)).toBe(true);
    expect(assertRenderFixtureStrictTextFixtureReceipt(receipt)).toBe(receipt);
  });

  it('parses strict text fixture receipts through the canonical JSON port', () => {
    const source = canonicalJsonPort.stringify(makeStrictTextFixtureReceipt(), { space: 2 });

    const parsed = parseRenderFixtureStrictTextFixtureReceipt(source);

    expect(parsed.receiptVersion).toBe(RENDER_FIXTURE_STRICT_TEXT_FIXTURE_RECEIPT_VERSION);
    expect(parsed.glyphRunHash).toBe(
      'sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472',
    );
  });

  it('rejects invalid strict text fixture receipts', () => {
    const invalid: JsonValue = {
      ...makeStrictTextFixtureReceipt(),
      fixtureHash: 'sha256:not-a-hash',
      fixturePath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      glyphEvidenceKind: 'outlinePaths',
      hashAlgorithm: 'sha512',
      receiptVersion: 'geordi-strict-text-fixture-receipt/2',
      semanticTextAffectsPixels: true,
    };

    const result = validateRenderFixtureStrictTextFixtureReceipt(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        '$.receiptVersion',
        '$.hashAlgorithm',
        '$.fixturePath',
        '$.fixtureHash',
        '$.semanticTextAffectsPixels',
        '$.glyphEvidenceKind',
        '$.glyphEvidencePackHash',
        '$.glyphEvidencePackPath',
      ]),
    );
    expect(() => assertRenderFixtureStrictTextFixtureReceipt(invalid)).toThrow(
      RenderFixtureInvalidStrictTextFixtureReceiptError,
    );
  });

  it('validates strict text font references against a font pack', () => {
    const input = {
      fontPack: makeFontPackManifest(),
      manifest: makeStrictTextFixtureManifest(),
    };

    expect(validateRenderFixtureStrictTextFontReferences(input)).toEqual({
      ok: true,
      issues: [],
    });
    expect(assertRenderFixtureStrictTextFontReferences(input)).toBe(input);
  });

  it('loads canonical strict text fixture A', () => {
    const manifest = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureASource());
    const fontPack = parseRenderFixtureFontPackManifest(fontPackManifestSource());

    expect(manifest.id).toBe('render-everywhere:strict-text:geordi');
    expect(manifest.semanticText.source).toBe('GEORDI');
    expect(manifest.lineBoxes).toEqual([
      {
        baselineY: 3072,
        height: 4096,
        id: 'line-0',
        width: 12288,
        x: 0,
        y: 0,
      },
    ]);
    expect(manifest.glyphRuns[0]?.glyphs.map((glyph) => glyph.glyphId)).toEqual([
      14, 11, 27, 33, 9, 17,
    ]);
    expect(manifest.glyphRuns[0]?.glyphs.map((glyph) => glyph.x)).toEqual([
      0, 2244, 3970, 6429, 8354, 10690,
    ]);
    expect(manifest.glyphRuns[0]?.glyphs.map((glyph) => glyph.advance)).toEqual([
      2244, 1726, 2459, 1925, 2336, 860,
    ]);
    expect(validateRenderFixtureStrictTextFontReferences({ fontPack, manifest })).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('loads canonical strict text fixture B', () => {
    const manifest = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureBSource());
    const fontPack = parseRenderFixtureFontPackManifest(fontPackManifestSource());

    expect(manifest.id).toBe('render-everywhere:strict-text:text-0123');
    expect(manifest.semanticText.source).toBe('text 0123');
    expect(manifest.lineBoxes).toEqual([
      {
        baselineY: 3072,
        height: 4096,
        id: 'line-0',
        width: 14336,
        x: 0,
        y: 0,
      },
    ]);
    expect(manifest.glyphRuns[0]?.glyphs.map((glyph) => glyph.glyphId)).toEqual([
      124, 59, 138, 124, 2, 399, 400, 401, 402,
    ]);
    expect(manifest.glyphRuns[0]?.glyphs.map((glyph) => glyph.x)).toEqual([
      0, 1094, 2696, 4226, 5327, 6113, 7895, 9677, 11459,
    ]);
    expect(manifest.glyphRuns[0]?.glyphs.map((glyph) => glyph.advance)).toEqual([
      1094, 1602, 1530, 1101, 786, 1782, 1782, 1782, 1782,
    ]);
    expect(validateRenderFixtureStrictTextFontReferences({ fontPack, manifest })).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('rejects unresolved strict text font references', () => {
    const manifest = makeStrictTextFixtureManifest();
    const run = manifest.glyphRuns[0];
    const input = {
      fontPack: makeFontPackManifest(),
      manifest: {
        ...manifest,
        glyphRuns: [
          {
            ...run,
            fontId: 'missing-font',
          },
        ],
      },
    };

    const result = validateRenderFixtureStrictTextFontReferences(input);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        message: 'Strict text glyph run font id must reference an existing font pack font',
        path: '$.glyphRuns[0].fontId',
      },
    ]);
    expect(() => assertRenderFixtureStrictTextFontReferences(input)).toThrow(
      RenderFixtureInvalidStrictTextFontReferenceError,
    );
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

  it('keeps committed unsupported strict text fixture rejected', () => {
    const source = strictTextFailureFixtureSource('unsupported-runtime-shaping');
    const result = validateRenderFixtureStrictTextFixtureManifest(canonicalJsonPort.parse(source));

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      message: 'Strict text feature is not supported',
      path: '$.features[3]',
    });
    expect(() => parseRenderFixtureStrictTextFixtureManifest(source)).toThrow(
      RenderFixtureInvalidStrictTextFixtureManifestError,
    );
  });

  it('keeps committed unsupported strict text paint fixture rejected', () => {
    const source = strictTextFailureFixtureSource('unsupported-text-paint');
    const result = validateRenderFixtureStrictTextFixtureManifest(canonicalJsonPort.parse(source));

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      message: 'Strict text feature is not supported',
      path: '$.features[3]',
    });
    expect(() => parseRenderFixtureStrictTextFixtureManifest(source)).toThrow(
      RenderFixtureInvalidStrictTextFixtureManifestError,
    );
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

  it('rejects line box edges and baselines outside safe bounds', () => {
    const manifest = makeStrictTextFixtureManifest();
    const lineBox = manifest.lineBoxes[0];
    const invalid: JsonValue = {
      ...manifest,
      lineBoxes: [
        {
          ...lineBox,
          baselineY: -1,
        },
        {
          ...lineBox,
          baselineY: lineBox.y + lineBox.height + 1,
          id: 'line-1',
        },
        {
          ...lineBox,
          id: 'line-2',
          width: 1,
          x: Number.MAX_SAFE_INTEGER,
        },
        {
          ...lineBox,
          baselineY: Number.MAX_SAFE_INTEGER,
          height: 1,
          id: 'line-3',
          y: Number.MAX_SAFE_INTEGER,
        },
      ],
    };

    const result = validateRenderFixtureStrictTextFixtureManifest(invalid);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      '$.lineBoxes[0].baselineY',
      '$.lineBoxes[1].baselineY',
      '$.lineBoxes[2].width',
      '$.lineBoxes[3].height',
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
