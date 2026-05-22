import { describe, expect, it } from 'vitest';
import {
  GEORDI_NUMERIC_PROFILE,
  GeordiInvalidGraphicsNumberError,
  isFiniteGraphicsNumber,
  requireFiniteGraphicsNumber,
} from './GeordiNumericProfile';

describe('Geordi numeric profile', () => {
  it('pins the v0 graphics numeric profile', () => {
    expect(GEORDI_NUMERIC_PROFILE).toBe('geordi-finite-binary64/1');
  });

  it('accepts only finite graphics numbers', () => {
    expect(isFiniteGraphicsNumber(5.123402)).toBe(true);
    expect(isFiniteGraphicsNumber(-0)).toBe(true);
    expect(isFiniteGraphicsNumber(Number.NaN)).toBe(false);
    expect(isFiniteGraphicsNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteGraphicsNumber('5')).toBe(false);
  });

  it('throws a custom error for invalid graphics numbers', () => {
    expect(() => requireFiniteGraphicsNumber(Number.NEGATIVE_INFINITY, '$.x')).toThrow(
      GeordiInvalidGraphicsNumberError,
    );
  });
});
