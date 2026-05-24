import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertRenderFixtureSha256,
  RenderFixtureHashMismatchError,
  renderFixtureSha256FromBytes,
} from './node.js';

const BUNNY_HASH = 'sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6';

function bunnyBytes(): Uint8Array {
  return readFileSync(
    new URL(
      '../../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply',
      import.meta.url,
    ),
  );
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
});
