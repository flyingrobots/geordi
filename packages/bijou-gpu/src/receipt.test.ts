import { parseJsonValue, type JsonValue } from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';

import {
  assertBitExactFrameHash,
  BUNNY_PRIMITIVE_PINS,
  EndpointReceiptValidationError,
  EVIDENCE_LEVELS,
  FrameHashMismatchError,
  implementationManifestSha256,
  parseEndpointReceipt,
  PROCEDURAL_GLYPH_TABLE_SHA256,
  samplePixelProbes,
  serializeEndpointReceipt,
  sha256Hex,
  validateEndpointReceipt,
  type EndpointReceipt,
  type EvidenceLevel,
  type GpuBackend,
} from './index.js';
import { mutableClone, renderSuite, suiteFrame } from '../test/support.js';

const { suite, paint, pack } = renderSuite();
const WGSL_SHA = '1'.repeat(64);
const GLSL_SHA = '2'.repeat(64);
const ARTIFACT_SHA = '3'.repeat(64);

function receiptFor(backend: GpuBackend, evidenceLevel: EvidenceLevel): EndpointReceipt {
  const probed = evidenceLevel === 'software-probed' || evidenceLevel === 'gpu-probed';
  const canvas = backend === 'canvas2d';
  const webgl = backend === 'webgl2';
  return {
    receiptVersion: 'geordi-bijou-gpu-receipt/1',
    gpuAbiVersion: 'bijou-surface-gpu/1',
    cellFormatId: 'bijou-packed-cell-u8x10-le/1',
    inputReceiptSha256: suiteFrame(suite, 'paint').inputReceiptSha256,
    preparedBufferSha256: paint.preparedBufferSha256,
    proceduralTableSha256: PROCEDURAL_GLYPH_TABLE_SHA256,
    bunnyPrimitives: BUNNY_PRIMITIVE_PINS,
    assembledWgslSha256: canvas ? null : WGSL_SHA,
    generatedGlslSha256: webgl ? GLSL_SHA : null,
    shaderSha256: canvas ? null : webgl ? GLSL_SHA : WGSL_SHA,
    executedArtifactSha256: ARTIFACT_SHA,
    backendProfile: `geordi-${backend}/1`,
    adapter: { backend, name: probed ? 'Test Adapter' : '', driver: '' },
    evidenceLevel,
    widthCells: paint.widthCells,
    heightCells: paint.heightCells,
    cellPx: { width: paint.cellPxW, height: paint.cellPxH },
    canvasPxW: paint.canvasPxW,
    canvasPxH: paint.canvasPxH,
    dpr: 2,
    defaultFg: paint.defaultFg,
    defaultBg: paint.defaultBg,
    fontIdentity: pack.fontIdentity,
    atlasGeneration: 1,
    atlasStats: pack.atlasStats,
    frameRgbaSha256: probed ? paint.frameRgbaSha256 : null,
    probePolicy: 'integer-canonical-exact',
    probes: probed
      ? samplePixelProbes(paint, [
          [3, 3],
          [0, 0],
        ])
      : [],
  };
}

function asJson(receipt: EndpointReceipt): Record<string, JsonValue> {
  return mutableClone(parseJsonValue(serializeEndpointReceipt(receipt)));
}

function issuesFor(input: JsonValue): string[] {
  const result = validateEndpointReceipt(input);
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.detail}`);
}

function edited(
  base: EndpointReceipt,
  apply: (receipt: Record<string, JsonValue>) => void,
): Record<string, JsonValue> {
  const json = asJson(base);
  apply(json);
  return json;
}

const softwareProbed = receiptFor('webgl2', 'software-probed');

describe('geordi-bijou-gpu-receipt/1 serialisation round trip', () => {
  it('validates a serialised software-probed receipt bound to the oracle frame', () => {
    const text = serializeEndpointReceipt(softwareProbed);
    const parsed = parseEndpointReceipt(parseJsonValue(text));
    expect(parsed).toEqual(softwareProbed);
    expect(serializeEndpointReceipt(parsed)).toBe(text);
    expect(parsed.inputReceiptSha256).toBe(suiteFrame(suite, 'paint').inputReceiptSha256);
    expect(parsed.preparedBufferSha256).toBe(paint.preparedBufferSha256);
    expect(parsed.fontIdentity).toBe(pack.fontIdentity);
    expect(parsed.frameRgbaSha256).toBe(paint.frameRgbaSha256);
  });

  it.each([
    ['webgl2', 'gpu-probed'],
    ['webgpu', 'gpu-probed'],
    ['wgpu', 'gpu-probed'],
    ['canvas2d', 'software-probed'],
    ['webgpu', 'capability-refused'],
    ['webgl2', 'shader-validated'],
    ['canvas2d', 'unit-upload'],
  ] as const)('accepts a well-formed %s %s receipt', (backend, evidenceLevel) => {
    const receipt = receiptFor(backend, evidenceLevel);
    expect(issuesFor(asJson(receipt))).toEqual([]);
    expect(parseEndpointReceipt(asJson(receipt)).evidenceLevel).toBe(evidenceLevel);
  });

  it('is deterministic: the same input always yields the same ordered issue list', () => {
    const broken = edited(softwareProbed, (r) => {
      r.probePolicy = 'fuzzy';
      r.defaultFg = '#e6edf3';
      r.receiptVersion = 'geordi-bijou-gpu-receipt/2';
      delete r.dpr;
    });
    const first = issuesFor(broken);
    expect(first).toEqual([
      '$.dpr: missing required field',
      '$.receiptVersion: expected "geordi-bijou-gpu-receipt/1"',
      '$.defaultFg: expected a canonical uppercase #RRGGBB colour',
      '$.probePolicy: expected "integer-canonical-exact"',
    ]);
    expect(issuesFor(broken)).toEqual(first);
    expect(() => parseEndpointReceipt(broken)).toThrow(EndpointReceiptValidationError);
  });
});

describe('evidence taxonomy: positive evidence versus capability refusal', () => {
  it('keeps the five evidence levels distinct', () => {
    expect([...EVIDENCE_LEVELS]).toEqual([
      'shader-validated',
      'unit-upload',
      'capability-refused',
      'software-probed',
      'gpu-probed',
    ]);
    const levels = EVIDENCE_LEVELS.map(
      (level) => parseEndpointReceipt(asJson(receiptFor('webgl2', level))).evidenceLevel,
    );
    expect(new Set(levels).size).toBe(5);
    expect(issuesFor(edited(softwareProbed, (r) => (r.evidenceLevel = 'probed')))).toEqual([
      '$.evidenceLevel: expected one of shader-validated, unit-upload, capability-refused, software-probed, gpu-probed',
    ]);
  });

  it('fails a capability refusal that claims a rendered frame digest', () => {
    const refusal = edited(receiptFor('webgpu', 'capability-refused'), (r) => {
      r.frameRgbaSha256 = paint.frameRgbaSha256;
    });
    expect(issuesFor(refusal)).toEqual([
      '$.frameRgbaSha256: must be null: a capability refusal cannot claim rendered pixels',
    ]);
  });

  it('fails a capability refusal that claims readback probes', () => {
    const refusal = edited(receiptFor('webgpu', 'capability-refused'), (r) => {
      r.probes = [{ px: 0, py: 0, rgba: [16, 32, 48, 255] }];
    });
    expect(issuesFor(refusal)).toEqual([
      '$.probes: must be empty: a capability refusal cannot claim rendered pixels',
    ]);
  });

  it('does not let a refusal pass as software-probed or gpu-probed evidence', () => {
    for (const level of ['software-probed', 'gpu-probed'] as const) {
      const relabelled = edited(receiptFor('webgpu', 'capability-refused'), (r) => {
        r.evidenceLevel = level;
      });
      expect(issuesFor(relabelled)).toEqual([
        `$.adapter.name: ${level} evidence must name the adapter that executed`,
        `$.frameRgbaSha256: ${level} evidence requires the frame digest`,
        `$.probes: ${level} evidence requires at least one readback probe`,
      ]);
    }
  });

  it('rejects gpu-probed evidence with zero probes', () => {
    const noProbes = edited(receiptFor('webgpu', 'gpu-probed'), (r) => (r.probes = []));
    expect(issuesFor(noProbes)).toEqual([
      '$.probes: gpu-probed evidence requires at least one readback probe',
    ]);
  });

  it.each(['shader-validated', 'unit-upload'] as const)(
    'requires a null frame digest and no probes for %s evidence',
    (level) => {
      const claimed = edited(receiptFor('webgl2', level), (r) => {
        r.frameRgbaSha256 = paint.frameRgbaSha256;
        r.probes = [{ px: 0, py: 0, rgba: [16, 32, 48, 255] }];
      });
      expect(issuesFor(claimed)).toEqual([
        `$.frameRgbaSha256: must be null: ${level} evidence reads back no pixels`,
        `$.probes: must be empty: ${level} evidence reads back no pixels`,
      ]);
    },
  );

  it('requires frameRgbaSha256 to be present even when it is null', () => {
    const missing = edited(receiptFor('webgpu', 'capability-refused'), (r) => delete r.frameRgbaSha256);
    expect(issuesFor(missing)).toEqual(['$.frameRgbaSha256: missing required field']);
  });
});

describe('dependency-to-artifact identity chain', () => {
  it('rejects a receipt missing its shader hash', () => {
    const missing = edited(softwareProbed, (r) => delete r.shaderSha256);
    expect(issuesFor(missing)).toEqual([
      '$.shaderSha256: missing required field',
      '$.shaderSha256: is required for webgl2',
    ]);
    const nulled = edited(receiptFor('webgpu', 'gpu-probed'), (r) => (r.shaderSha256 = null));
    expect(issuesFor(nulled)).toEqual(['$.shaderSha256: is required for webgpu']);
  });

  it('binds shaderSha256 to the active backend shader text', () => {
    expect(
      issuesFor(edited(softwareProbed, (r) => (r.shaderSha256 = WGSL_SHA))),
    ).toEqual(['$.shaderSha256: must equal generatedGlslSha256 for webgl2']);
    expect(
      issuesFor(edited(receiptFor('wgpu', 'gpu-probed'), (r) => (r.shaderSha256 = GLSL_SHA))),
    ).toEqual(['$.shaderSha256: must equal assembledWgslSha256 for wgpu']);
    expect(
      issuesFor(edited(receiptFor('webgpu', 'gpu-probed'), (r) => (r.generatedGlslSha256 = GLSL_SHA))),
    ).toEqual(['$.generatedGlslSha256: must be null for webgpu']);
  });

  it('pins Canvas 2D by executed artifact digest with a null shader hash', () => {
    const canvas = receiptFor('canvas2d', 'software-probed');
    expect(canvas.shaderSha256).toBeNull();
    expect(parseEndpointReceipt(asJson(canvas)).executedArtifactSha256).toBe(ARTIFACT_SHA);
    expect(issuesFor(edited(canvas, (r) => (r.shaderSha256 = WGSL_SHA)))).toEqual([
      '$.shaderSha256: must be null for canvas2d',
    ]);
    expect(issuesFor(edited(canvas, (r) => (r.executedArtifactSha256 = null)))).toEqual([
      '$.executedArtifactSha256: the executed artifact digest is required for every backend',
    ]);
  });

  it('rejects drifted Bunny primitive pins and a drifted procedural table digest', () => {
    const drifted = edited(softwareProbed, (r) => {
      r.proceduralTableSha256 = '0'.repeat(64);
      r.bunnyPrimitives = [
        { ...BUNNY_PRIMITIVE_PINS[0], bunnyCommit: 'deadbee' },
        { ...BUNNY_PRIMITIVE_PINS[1] },
      ];
    });
    expect(issuesFor(drifted)).toEqual([
      `$.proceduralTableSha256: expected "${PROCEDURAL_GLYPH_TABLE_SHA256}"`,
      '$.bunnyPrimitives[0].bunnyCommit: expected "3b7fbad"',
    ]);
    expect(issuesFor(edited(softwareProbed, (r) => (r.bunnyPrimitives = [])))).toEqual([
      '$.bunnyPrimitives: expected the 2 pinned Bunny primitives',
    ]);
  });

  it('derives a content-addressed implementation manifest digest from the identity chain', () => {
    const digest = implementationManifestSha256(softwareProbed);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(implementationManifestSha256(parseEndpointReceipt(asJson(softwareProbed)))).toBe(digest);
    // Frame content does not change the implementation identity ...
    expect(implementationManifestSha256({ ...softwareProbed, frameRgbaSha256: '9'.repeat(64) })).toBe(
      digest,
    );
    // ... but the executed artifact and the backend do.
    expect(
      implementationManifestSha256({ ...softwareProbed, executedArtifactSha256: '4'.repeat(64) }),
    ).not.toBe(digest);
    const canvas = receiptFor('canvas2d', 'software-probed');
    expect(implementationManifestSha256(canvas)).not.toBe(digest);
    expect(
      implementationManifestSha256({ ...canvas, executedArtifactSha256: '4'.repeat(64) }),
    ).not.toBe(implementationManifestSha256(canvas));
  });
});

describe('malformed receipts', () => {
  it.each([
    ['an unknown field', (r: Record<string, JsonValue>) => (r.extra = true), '$.extra: unknown field'],
    [
      'an uppercase digest',
      (r: Record<string, JsonValue>) => (r.inputReceiptSha256 = 'A'.repeat(64)),
      '$.inputReceiptSha256: expected a lowercase 64-hex SHA-256 digest',
    ],
    [
      'a wrong ABI version',
      (r: Record<string, JsonValue>) => (r.gpuAbiVersion = 'bijou-surface-gpu/2'),
      '$.gpuAbiVersion: expected "bijou-surface-gpu/1"',
    ],
    [
      'an unknown backend',
      (r: Record<string, JsonValue>) => (r.adapter = { backend: 'metal', name: 'x', driver: '' }),
      '$.adapter.backend: expected one of webgl2, webgpu, canvas2d, wgpu',
    ],
    [
      'a malformed backend profile',
      (r: Record<string, JsonValue>) => (r.backendProfile = 'webgl2'),
      '$.backendProfile: expected a profile id such as "geordi-webgl2/1"',
    ],
    [
      'cell metrics outside 1..256',
      (r: Record<string, JsonValue>) => (r.cellPx = { width: 257, height: 16 }),
      '$.cellPx.width: expected an integer in 1..256',
    ],
    [
      'a canvas narrower than the grid',
      (r: Record<string, JsonValue>) => (r.canvasPxW = 63),
      '$.canvasPxW: must be at least widthCells * cellPx.width',
    ],
    [
      'a non-finite dpr',
      (r: Record<string, JsonValue>) => (r.dpr = 0),
      '$.dpr: expected a finite positive number',
    ],
    [
      'an empty font identity',
      (r: Record<string, JsonValue>) => (r.fontIdentity = ''),
      '$.fontIdentity: expected a non-empty font identity',
    ],
    [
      'inconsistent atlas stats',
      (r: Record<string, JsonValue>) =>
        (r.atlasStats = { usedSlots: 9, capacity: 8, monoCount: 6, colorEmojiCount: 2 }),
      '$.atlasStats.usedSlots: must not exceed capacity',
    ],
    [
      'a probe outside the canvas',
      (r: Record<string, JsonValue>) => (r.probes = [{ px: 67, py: 0, rgba: [0, 0, 0, 255] }]),
      '$.probes[0].px: expected an integer in 0..66',
    ],
    [
      'a translucent probe',
      (r: Record<string, JsonValue>) => (r.probes = [{ px: 0, py: 0, rgba: [0, 0, 0, 128] }]),
      '$.probes[0].rgba[3]: canonical frames are opaque; alpha must be 255',
    ],
  ])('rejects %s', (_label, apply, expected) => {
    expect(issuesFor(edited(softwareProbed, apply))).toContain(expected);
  });

  it('rejects non-object input without throwing', () => {
    expect(issuesFor([])).toEqual(['$: expected an object']);
    expect(issuesFor(null)).toEqual(['$: expected an object']);
    expect(issuesFor('receipt')).toEqual(['$: expected an object']);
  });
});

describe('assertBitExactFrameHash', () => {
  it('accepts a receipt whose frame hashes exactly to the oracle frame', () => {
    expect(() => {
      assertBitExactFrameHash(softwareProbed, paint);
    }).not.toThrow();
  });

  it('rejects a single least-significant-bit difference', () => {
    const flipped = Uint8Array.from(paint.rgba);
    flipped[0] ^= 1;
    const receipt = { ...softwareProbed, frameRgbaSha256: sha256Hex(flipped) };
    expect(() => {
      assertBitExactFrameHash(receipt, paint);
    }).toThrow(FrameHashMismatchError);
    expect(() => {
      assertBitExactFrameHash(receipt, paint);
    }).toThrow(/GEORDI_E_BIJOU_FRAME_HASH_MISMATCH: receipt frameRgbaSha256/u);
  });

  it('rejects receipts with no frame digest, another canvas, or another prepared buffer', () => {
    expect(() => {
      assertBitExactFrameHash(receiptFor('webgpu', 'capability-refused'), paint);
    }).toThrow(/capability-refused receipt carries no frameRgbaSha256/u);
    expect(() => {
      assertBitExactFrameHash({ ...softwareProbed, canvasPxW: 64 }, paint);
    }).toThrow(/receipt canvas 64x117 differs from oracle canvas 67x117/u);
    expect(() => {
      assertBitExactFrameHash({ ...softwareProbed, preparedBufferSha256: '5'.repeat(64) }, paint);
    }).toThrow(/preparedBufferSha256/u);
  });
});
