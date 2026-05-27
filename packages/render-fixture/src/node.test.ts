import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseRenderFixtureAsciiPlyTriangleMesh,
  parseRenderFixtureFontPackManifest,
  parseRenderFixtureMeshAssetManifest,
  parseRenderFixtureStrictTextFixtureManifest,
  RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_TEXT_PREP_FINGERPRINT,
  RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
} from './index.js';
import {
  assertRenderFixtureFontPackHashes,
  assertRenderFixtureSha256,
  createRenderFixtureStrictTextFixtureReceipt,
  RenderFixtureFontPackAssetPathError,
  RenderFixtureFontPackAssetReadError,
  RenderFixtureFontPackHashMismatchError,
  RenderFixtureHashMismatchError,
  renderFixtureSha256FromCanonicalJson,
  renderFixtureSha256FromBytes,
} from './node.js';

const BUNNY_HASH = 'sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6';
const STRICT_TEXT_FIXTURE_A_PATH =
  'fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json';
const STRICT_TEXT_FIXTURE_B_PATH =
  'fixtures/render-everywhere/strict-text/text-0123.strict-text.geordi.json';

function bunnyBytes(): Uint8Array {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply',
      import.meta.url,
    ),
  );
}

function bunnySource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply',
      import.meta.url,
    ),
    'utf8',
  );
}

function bunnyManifestSource(): string {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bunny.mesh.json',
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

function strictTextFixtureASource(): string {
  return readFileSync(new URL(`../../../${STRICT_TEXT_FIXTURE_A_PATH}`, import.meta.url), 'utf8');
}

function repositoryRoot(): string {
  return fileURLToPath(new URL('../../..', import.meta.url));
}

describe('Node render fixture hash helpers', () => {
  it('computes the Stanford bunny asset hash from committed bytes', () => {
    expect(renderFixtureSha256FromBytes(bunnyBytes())).toBe(BUNNY_HASH);
  });

  it('returns the expected hash when bytes match', () => {
    expect(assertRenderFixtureSha256(bunnyBytes(), BUNNY_HASH)).toBe(BUNNY_HASH);
  });

  it('throws a custom error when bytes do not match the expected hash', () => {
    expect(() =>
      assertRenderFixtureSha256(
        new Uint8Array([1, 2, 3]),
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).toThrow(RenderFixtureHashMismatchError);
  });

  it('cross-checks the bunny manifest against bytes and parsed mesh data', () => {
    const manifest = parseRenderFixtureMeshAssetManifest(bunnyManifestSource());
    const mesh = parseRenderFixtureAsciiPlyTriangleMesh(bunnySource());

    expect(renderFixtureSha256FromBytes(bunnyBytes())).toBe(manifest.sha256);
    expect(mesh.vertices).toHaveLength(manifest.counts.vertices);
    expect(mesh.faces).toHaveLength(manifest.counts.faces);
    expect(mesh.bounds).toEqual(manifest.bounds);

    for (const vertex of mesh.vertices) {
      expect(vertex.position.every(Number.isFinite)).toBe(true);
    }

    for (const face of mesh.faces) {
      for (const index of face) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(mesh.vertices.length);
      }
    }
  });

  it('verifies font pack asset and license hashes from committed bytes', () => {
    const manifest = parseRenderFixtureFontPackManifest(fontPackManifestSource());

    expect(assertRenderFixtureFontPackHashes(manifest, repositoryRoot())).toEqual([
      {
        fontId: 'lato-regular',
        kind: 'font',
        path: 'fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf',
        sha256: 'sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251',
      },
      {
        fontId: 'lato-regular',
        kind: 'license',
        path: 'fixtures/render-everywhere/assets/fonts/lato/OFL.txt',
        sha256: 'sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423',
      },
    ]);
  });

  it('builds the canonical strict text fixture A receipt', () => {
    expect(
      createRenderFixtureStrictTextFixtureReceipt({
        fixturePath: STRICT_TEXT_FIXTURE_A_PATH,
        repositoryRoot: repositoryRoot(),
      }),
    ).toEqual({
      fixtureHash: 'sha256:e3686b463296e0e7b019d7b014537a300f8fe6949a9053cf7d62067a978bf8c0',
      fixturePath: STRICT_TEXT_FIXTURE_A_PATH,
      fontPackHash: 'sha256:1b7ad58b48a3ad0d1aff0736ef014783945dc0a472de1f14b48c4211eb53533d',
      fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      generatedBy: RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
      glyphRunHash: 'sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472',
      hashAlgorithm: 'sha256',
      lineBoxHash: 'sha256:6d0b4e63bd04bd33e7213240a173f86fb478f23fa4cd505514c0b8af425f1e10',
      positionEncodingProfile: 'geordi-fixed-26.6/1',
      receiptVersion: 'geordi-strict-text-fixture-receipt/1',
      semanticTextAffectsPixels: false,
      semanticTextHash: 'sha256:c1c66afeda52b1b7ef23ad22a11e631fb02d21db27ea92ad5823d2a28bca3ab3',
      shapingProfile: 'precomputed-fixture/1',
      textProfile: 'geordi-strict-positioned-glyph-run/1',
    });
  });

  it('builds a fingerprinted text-prep strict text fixture receipt', () => {
    const receipt = createRenderFixtureStrictTextFixtureReceipt({
      fixturePath: STRICT_TEXT_FIXTURE_A_PATH,
      repositoryRoot: repositoryRoot(),
      shapingFingerprintHash:
        'sha256:4294d2f13356d55ab7a92957d5aa43b0243141eb0728428b94ee666f8c98d7db',
      shapingProfile: RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_TEXT_PREP_FINGERPRINT,
    });

    expect(receipt.shapingFingerprintHash).toBe(
      'sha256:4294d2f13356d55ab7a92957d5aa43b0243141eb0728428b94ee666f8c98d7db',
    );
    expect(receipt.shapingProfile).toBe(
      RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_TEXT_PREP_FINGERPRINT,
    );
  });

  it('builds the canonical strict text fixture B receipt', () => {
    expect(
      createRenderFixtureStrictTextFixtureReceipt({
        fixturePath: STRICT_TEXT_FIXTURE_B_PATH,
        repositoryRoot: repositoryRoot(),
      }),
    ).toEqual({
      fixtureHash: 'sha256:309eb48cbc2d2c1e0d39c87e7de86144450207734341f8cd062e170b21f4ad87',
      fixturePath: STRICT_TEXT_FIXTURE_B_PATH,
      fontPackHash: 'sha256:1b7ad58b48a3ad0d1aff0736ef014783945dc0a472de1f14b48c4211eb53533d',
      fontPackPath: 'fixtures/render-everywhere/assets/fonts/font-pack.geordi.json',
      generatedBy: RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
      glyphRunHash: 'sha256:e3ef02904931ffe7e5126820d8a04e35a366997993d970d625974ff361fc0e04',
      hashAlgorithm: 'sha256',
      lineBoxHash: 'sha256:e3b8e52a7ca8f1ab0a6ad707f94649bb4ac63465d4fdf04dde4a87d1ef0ff8a6',
      positionEncodingProfile: 'geordi-fixed-26.6/1',
      receiptVersion: 'geordi-strict-text-fixture-receipt/1',
      semanticTextAffectsPixels: false,
      semanticTextHash: 'sha256:7cdec9c596a1c82fe5c08a9c1d6fa4901bf680d14f7a86d4c64288861dc39082',
      shapingProfile: 'precomputed-fixture/1',
      textProfile: 'geordi-strict-positioned-glyph-run/1',
    });
  });

  it('hashes canonical strict text receipt fragments with stable bytes', () => {
    const fixture = parseRenderFixtureStrictTextFixtureManifest(strictTextFixtureASource());

    expect(renderFixtureSha256FromCanonicalJson(fixture.glyphRuns)).toBe(
      'sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472',
    );
  });

  it('throws a custom error when a font pack hash does not match', () => {
    const manifest = parseRenderFixtureFontPackManifest(fontPackManifestSource());

    expect(() =>
      assertRenderFixtureFontPackHashes(
        {
          ...manifest,
          fonts: [
            {
              ...manifest.fonts[0],
              sha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
            },
          ],
        },
        repositoryRoot(),
      ),
    ).toThrow(RenderFixtureFontPackHashMismatchError);
  });

  it('keeps the committed bad font hash failure fixture rejected', () => {
    const manifest = parseRenderFixtureFontPackManifest(
      fontPackFailureManifestSource('bad-hash'),
    );

    expect(() => assertRenderFixtureFontPackHashes(manifest, repositoryRoot())).toThrow(
      RenderFixtureFontPackHashMismatchError,
    );
  });

  it('throws custom errors for unreadable or escaped font pack asset paths', () => {
    const manifest = parseRenderFixtureFontPackManifest(fontPackManifestSource());
    const missingRoot = join(tmpdir(), `geordi-missing-root-${process.pid}-${Date.now()}`);

    expect(() =>
      assertRenderFixtureFontPackHashes(
        {
          ...manifest,
          fonts: [
            {
              ...manifest.fonts[0],
              path: '../Lato-Regular.ttf',
            },
          ],
        },
        repositoryRoot(),
      ),
    ).toThrow(RenderFixtureFontPackAssetPathError);

    expect(() =>
      assertRenderFixtureFontPackHashes(
        {
          ...manifest,
          fonts: [
            {
              ...manifest.fonts[0],
              path: 'fixtures/render-everywhere/assets/fonts/lato/missing.ttf',
            },
          ],
        },
        repositoryRoot(),
      ),
    ).toThrow(RenderFixtureFontPackAssetReadError);

    expect(() => assertRenderFixtureFontPackHashes(manifest, missingRoot)).toThrow(
      RenderFixtureFontPackAssetReadError,
    );
  });

  it('rejects font pack asset symlinks that resolve outside the repository root', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'geordi-font-pack-root-'));
    const externalRoot = mkdtempSync(join(tmpdir(), 'geordi-font-pack-external-'));
    try {
      const externalFontPath = join(externalRoot, 'external.ttf');
      writeFileSync(externalFontPath, new Uint8Array([1, 2, 3]));
      symlinkSync(externalFontPath, join(tempRoot, 'font.ttf'));
      writeFileSync(join(tempRoot, 'license.txt'), 'license');

      expect(() =>
        assertRenderFixtureFontPackHashes(
          {
            fontPackVersion: 'geordi-font-pack/1',
            fonts: [
              {
                faceIndex: 0,
                familyName: 'Lato',
                format: 'ttf',
                id: 'lato-regular',
                license: {
                  name: 'SIL Open Font License 1.1',
                  path: 'license.txt',
                  redistributionAllowed: true,
                  reservedFontNames: ['Lato'],
                  sha256: renderFixtureSha256FromBytes(readFileSync(join(tempRoot, 'license.txt'))),
                },
                path: 'font.ttf',
                sha256: renderFixtureSha256FromBytes(readFileSync(externalFontPath)),
                source: {
                  commit: 'c5b52261e8fde2d3b2592fa9d26ac525939c5e4c',
                  fontSha256: renderFixtureSha256FromBytes(readFileSync(externalFontPath)),
                  licenseNormalization: 'trim-trailing-ascii-whitespace/1',
                  licensePath: 'ofl/lato/OFL.txt',
                  licenseSha256: renderFixtureSha256FromBytes(
                    readFileSync(join(tempRoot, 'license.txt')),
                  ),
                  path: 'ofl/lato/Lato-Regular.ttf',
                  repository: 'https://github.com/google/fonts',
                },
                styleName: 'Regular',
                weight: 400,
              },
            ],
          },
          tempRoot,
        ),
      ).toThrow(RenderFixtureFontPackAssetPathError);
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
      rmSync(externalRoot, { force: true, recursive: true });
    }
  });
});
