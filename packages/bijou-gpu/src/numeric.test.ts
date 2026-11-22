import { describe, expect, it } from 'vitest';

import {
  BijouGpuValidationError,
  bunnyU32DivRoundEven,
  bunnyU32EllipseClassify,
  BUNNY_PRIMITIVE_PINS,
  divRoundEven,
  lerpU8,
  satSub,
  absDiff,
  sha256Hex,
  utf8Bytes,
} from './index.js';
import { arr, int, nodeSha256, obj, readFixtureBytes, readFixtureJson, str } from '../test/support.js';

function pin(contractId: string): string {
  const found = BUNNY_PRIMITIVE_PINS.find((candidate) => candidate.contractId === contractId);
  return found?.vectorsSha256 ?? '';
}

describe('bunny-u32-div-round-even/1', () => {
  it('matches every vector in the pinned Bunny fixture, whose bytes match the ABI pin', () => {
    const name = 'bunny/u32_div_round_even_vectors.json';
    expect(nodeSha256(readFixtureBytes(name))).toBe(pin('bunny-u32-div-round-even/1'));
    const fixture = obj(readFixtureJson(name), 'div vectors');
    expect(str(fixture.contractId, 'contractId')).toBe('bunny-u32-div-round-even/1');
    const vectors = arr(fixture.vectors, 'vectors');
    expect(vectors).toHaveLength(int(fixture.vectorCount, 'vectorCount'));
    for (const vector of vectors) {
      const lanes = arr(vector, 'vector').map((v) => int(v, 'lane'));
      expect(lanes).toHaveLength(4);
      const [n, d, quotient, status] = lanes as [number, number, number, number];
      expect(bunnyU32DivRoundEven(n, d), `${String(n)} / ${String(d)}`).toEqual([
        quotient,
        status,
      ]);
    }
  });

  it('compares r with d - r and never forms 2 * r, which would wrap in u32', () => {
    expect(bunnyU32DivRoundEven(3_000_000_000, 4_000_000_000)).toEqual([1, 0]);
    expect(bunnyU32DivRoundEven(0xffffffff, 2)).toEqual([0x80000000, 0]);
  });

  it('rounds exact ties to the even quotient', () => {
    expect(divRoundEven(1, 2)).toBe(0);
    expect(divRoundEven(3, 2)).toBe(2);
    expect(divRoundEven(5, 2)).toBe(2);
    expect(divRoundEven(7, 2)).toBe(4);
    expect(lerpU8(16, 255, 1, 2)).toBe(136);
    expect(lerpU8(0, 255, 126, 252)).toBe(128);
  });

  it('reports a zero divisor as DivisionByZero and refuses it in the scalar form', () => {
    expect(bunnyU32DivRoundEven(0, 0)).toEqual([0, 1]);
    expect(bunnyU32DivRoundEven(0xffffffff, 0)).toEqual([0, 1]);
    expect(() => divRoundEven(1, 0)).toThrow(BijouGpuValidationError);
  });

  it('rejects operands that are not unsigned 32-bit integers', () => {
    for (const bad of [-1, 0.5, 0x100000000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => bunnyU32DivRoundEven(bad, 1)).toThrow(/GEORDI_E_BIJOU_NUMERIC_DOMAIN/u);
      expect(() => bunnyU32DivRoundEven(1, bad)).toThrow(/GEORDI_E_BIJOU_NUMERIC_DOMAIN/u);
    }
  });
});

describe('bunny-u32-ellipse-classify/1', () => {
  it('matches every vector in the pinned Bunny fixture, whose bytes match the ABI pin', () => {
    const name = 'bunny/u32_ellipse_classify_vectors.json';
    expect(nodeSha256(readFixtureBytes(name))).toBe(pin('bunny-u32-ellipse-classify/1'));
    const fixture = obj(readFixtureJson(name), 'ellipse vectors');
    expect(str(fixture.contractId, 'contractId')).toBe('bunny-u32-ellipse-classify/1');
    const vectors = arr(fixture.vectors, 'vectors');
    expect(vectors).toHaveLength(int(fixture.vectorCount, 'vectorCount'));
    for (const vector of vectors) {
      const lanes = arr(vector, 'vector').map((v) => int(v, 'lane'));
      expect(lanes).toHaveLength(6);
      const [dx, dy, sx, sy, cls, status] = lanes as [number, number, number, number, number, number];
      expect(
        bunnyU32EllipseClassify(dx, dy, sx, sy),
        `(${String(dx)}, ${String(dy)}) in (${String(sx)}, ${String(sy)})`,
      ).toEqual([cls, status]);
    }
  });

  it('handles degenerate semi-axes before the polynomial and reports out-of-domain operands', () => {
    expect(bunnyU32EllipseClassify(0, 0, 0, 5)).toEqual([1, 0]);
    expect(bunnyU32EllipseClassify(0, 1, 0, 5)).toEqual([2, 0]);
    expect(bunnyU32EllipseClassify(1, 0, 5, 0)).toEqual([2, 0]);
    expect(bunnyU32EllipseClassify(46_341, 0, 10, 10)).toEqual([0, 1]);
    expect(bunnyU32EllipseClassify(3, 4, 5, 5)).toEqual([1, 0]);
    expect(bunnyU32EllipseClassify(3, 3, 5, 5)).toEqual([0, 0]);
    expect(bunnyU32EllipseClassify(3, 5, 5, 5)).toEqual([2, 0]);
  });
});

describe('unsigned helpers and SHA-256', () => {
  it('saturates subtraction and takes absolute differences without underflow', () => {
    expect(satSub(3, 5)).toBe(0);
    expect(satSub(5, 3)).toBe(2);
    expect(absDiff(3, 5)).toBe(2);
    expect(absDiff(5, 3)).toBe(2);
  });

  it('pure-TypeScript sha256Hex agrees with node:crypto across block boundaries', () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 31_356]) {
      const bytes = Uint8Array.from({ length }, (_unused, index) => (index * 131 + 7) & 0xff);
      expect(sha256Hex(bytes), `length ${String(length)}`).toBe(nodeSha256(bytes));
    }
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('utf8Bytes agrees with TextEncoder for BMP, astral, and combining text', () => {
    for (const text of ['A', 'é', '', '\u{1f600}', 'café 漢']) {
      expect(Array.from(utf8Bytes(text))).toEqual(Array.from(new TextEncoder().encode(text)));
    }
  });
});
