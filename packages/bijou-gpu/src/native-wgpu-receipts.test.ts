/**
 * Cross-checks the receipts the native Rust `wgpu` host (`crates/geordi-bijou-wgpu-proof`,
 * flyingrobots/geordi#58) checked in under `fixtures/bijou-gpu/native-wgpu/` against this kit:
 * each must pass `validateEndpointReceipt`, and each read-back frame must hash to exactly the
 * frame the CPU reference oracle renders for the same input, canvas, theme and glyph pack.
 *
 * These tests run no GPU. They prove that the recorded pixels agree with the oracle, not that this
 * host has an adapter.
 */
import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  assertBitExactFrameHash,
  assertPixelProbes,
  createTestGlyphPack,
  EndpointReceiptValidationError,
  FrameHashMismatchError,
  parsePackedBijouCellsReceipt,
  renderReferenceRgba,
  validateEndpointReceipt,
  type EndpointReceipt,
} from './index.js';
import {
  arr,
  fixturePath,
  loadProceduralTable,
  nodeSha256,
  obj,
  readFixtureBytes,
  readFixtureJson,
  str,
  TestFixtureShapeError,
} from '../test/support.js';

const RECEIPT_DIR = 'native-wgpu/';

/** Input fixture of each receipt stem. */
const INPUTS: ReadonlyMap<string, string> = new Map([
  ['width1-paint', 'width1-paint.packed-bijou-cells.json'],
  ['width1-erase', 'width1-erase.packed-bijou-cells.json'],
  ['bijou-re036', 'bijou/packed-bijou-cells.v1.json'],
]);

const receiptFiles = readdirSync(fixturePath(RECEIPT_DIR))
  .filter((name) => name.endsWith('.receipt.json'))
  .sort();

function loadReceipt(name: string): EndpointReceipt {
  const validation = validateEndpointReceipt(readFixtureJson(`${RECEIPT_DIR}${name}`));
  if (!validation.ok) {
    throw new EndpointReceiptValidationError(validation.issues);
  }
  return validation.receipt;
}

function inputOf(name: string): string {
  const stem = name.split('.')[0] ?? '';
  const input = INPUTS.get(stem);
  if (input === undefined) {
    throw new TestFixtureShapeError(`${name}: no input fixture is declared for stem ${stem}`);
  }
  return input;
}

function assembledWgslSha256(): string {
  const manifest = obj(readFixtureJson('../../packages/bijou-gpu/shaders/bijou-shaders.manifest.json'), 'manifest');
  const surface = arr(manifest.shaders, 'manifest.shaders')
    .map((shader) => obj(shader, 'manifest.shaders[]'))
    .find((shader) => shader.assembledWgslSha256 !== undefined && shader.id === 'bijou-surface');
  return str(surface?.assembledWgslSha256, 'bijou-surface assembledWgslSha256');
}

describe('native wgpu receipts', () => {
  it('checks in the refusal and the three hardware frames', () => {
    expect(receiptFiles).toEqual([
      'bijou-re036.gpu-probed.receipt.json',
      'width1-erase.gpu-probed.receipt.json',
      'width1-paint.capability-refused.receipt.json',
      'width1-paint.gpu-probed.receipt.json',
    ]);
  });

  it.each(receiptFiles)('%s validates and names its evidence level in its file name', (name) => {
    const receipt = loadReceipt(name);
    expect(name.split('.')[1]).toBe(receipt.evidenceLevel);
    expect(receipt.backendProfile).toBe('geordi-wgpu-offscreen/1');
    expect(receipt.adapter.backend).toBe('wgpu');
    expect(receipt.generatedGlslSha256).toBeNull();
    expect(receipt.shaderSha256).toBe(assembledWgslSha256());
    expect(receipt.executedArtifactSha256).toBe(receipt.shaderSha256);
    expect(receipt.inputReceiptSha256).toBe(nodeSha256(readFixtureBytes(inputOf(name))));
    const pack = createTestGlyphPack();
    expect(receipt.fontIdentity).toBe(pack.fontIdentity);
    expect(receipt.atlasStats).toEqual(pack.atlasStats);
  });

  it.each(receiptFiles.filter((name) => name.includes('.gpu-probed.')))(
    '%s hashes to the CPU oracle frame with zero tolerance and its probes are oracle pixels',
    (name) => {
      const receipt = loadReceipt(name);
      const pack = createTestGlyphPack();
      const oracle = renderReferenceRgba(
        parsePackedBijouCellsReceipt(readFixtureJson(inputOf(name))),
        pack.atlasBitmap,
        pack.slotMap,
        loadProceduralTable(),
        {
          canvasPxW: receipt.canvasPxW,
          canvasPxH: receipt.canvasPxH,
          defaultFg: receipt.defaultFg,
          defaultBg: receipt.defaultBg,
        },
      );
      expect(receipt.adapter.name).not.toBe('');
      expect(receipt.probes.length).toBeGreaterThan(0);
      assertBitExactFrameHash(receipt, oracle);
      assertPixelProbes(oracle, receipt.probes);
    },
  );

  it('a capability refusal carries no pixels and cannot pass the bit-exact gate', () => {
    const receipt = loadReceipt('width1-paint.capability-refused.receipt.json');
    expect(receipt.frameRgbaSha256).toBeNull();
    expect(receipt.probes).toEqual([]);
    expect(receipt.adapter).toEqual({ backend: 'wgpu', name: '', driver: '' });
    const pack = createTestGlyphPack();
    const oracle = renderReferenceRgba(
      parsePackedBijouCellsReceipt(readFixtureJson(inputOf('width1-paint'))),
      pack.atlasBitmap,
      pack.slotMap,
      loadProceduralTable(),
      { canvasPxW: receipt.canvasPxW, canvasPxH: receipt.canvasPxH },
    );
    expect(() => {
      assertBitExactFrameHash(receipt, oracle);
    }).toThrow(FrameHashMismatchError);
  });
});
