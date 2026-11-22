import { BijouGpuValidationError } from './errors.js';

/**
 * Pure-integer numeric law for `bijou-surface-gpu/1`.
 *
 * These mirror the pinned `flyingrobots/bunny` primitives
 * `bunny-u32-div-round-even/1` and `bunny-u32-ellipse-classify/1`. Core
 * rendering uses only unsigned 32-bit integers; no value here is ever a
 * fraction.
 */
export const U32_MAX = 0xffffffff;

/** Largest operand accepted by `bunny-u32-ellipse-classify/1`. */
export const BUNNY_ELLIPSE_MAX_COORD = 46_340;

export const BUNNY_STATUS_OK = 0;
export const BUNNY_STATUS_ERROR = 1;

export const ELLIPSE_INSIDE = 0;
export const ELLIPSE_ON_BOUNDARY = 1;
export const ELLIPSE_OUTSIDE = 2;

function requireU32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_NUMERIC_DOMAIN',
      label,
      `expected an unsigned 32-bit integer, received ${String(value)}`,
    );
  }
}

/**
 * `bunny-u32-div-round-even/1`: ties-to-even division returning
 * `[quotient, status]`. A zero divisor returns `[0, 1]` (`DivisionByZero`)
 * through a branch taken before any division. The tie test compares `r` with
 * `d - r` and never forms `2 * r`, which would wrap in `u32`.
 */
export function bunnyU32DivRoundEven(n: number, d: number): readonly [number, number] {
  requireU32(n, 'divRoundEven.n');
  requireU32(d, 'divRoundEven.d');
  if (d === 0) {
    return [0, BUNNY_STATUS_ERROR];
  }
  const r = n % d;
  const q = (n - r) / d;
  const s = d - r;
  return [r > s || (r === s && q % 2 === 1) ? q + 1 : q, BUNNY_STATUS_OK];
}

/**
 * Scalar lane-0 quotient of {@link bunnyU32DivRoundEven} for call sites whose
 * divisor is statically nonzero. A zero divisor is a caller bug and fails
 * loudly instead of yielding a silent zero.
 */
export function divRoundEven(n: number, d: number): number {
  const [quotient, status] = bunnyU32DivRoundEven(n, d);
  if (status !== BUNNY_STATUS_OK) {
    throw new BijouGpuValidationError(
      'GEORDI_E_BIJOU_NUMERIC_DOMAIN',
      'divRoundEven.d',
      'division by zero',
    );
  }
  return quotient;
}

/**
 * `bunny-u32-ellipse-classify/1`: exact trichotomy of `(dx, dy)` against the
 * axis-aligned ellipse with semi-axes `(semiX, semiY)`, returning
 * `[class, status]` with `0` Inside, `1` OnBoundary, `2` Outside. Operands
 * above `46340` return `[0, 1]` (`OutOfDomain`). A zero semi-axis is handled
 * before the polynomial: only the origin is OnBoundary, everything else is
 * Outside.
 *
 * The polynomial needs 64 bits, so this reference evaluates it in `BigInt`;
 * the shader evaluates the identical integers in two `u32` limbs.
 */
export function bunnyU32EllipseClassify(
  dx: number,
  dy: number,
  semiX: number,
  semiY: number,
): readonly [number, number] {
  requireU32(dx, 'ellipseClassify.dx');
  requireU32(dy, 'ellipseClassify.dy');
  requireU32(semiX, 'ellipseClassify.semiX');
  requireU32(semiY, 'ellipseClassify.semiY');
  if (
    dx > BUNNY_ELLIPSE_MAX_COORD ||
    dy > BUNNY_ELLIPSE_MAX_COORD ||
    semiX > BUNNY_ELLIPSE_MAX_COORD ||
    semiY > BUNNY_ELLIPSE_MAX_COORD
  ) {
    return [0, BUNNY_STATUS_ERROR];
  }
  if (semiX === 0 || semiY === 0) {
    return [dx === 0 && dy === 0 ? ELLIPSE_ON_BOUNDARY : ELLIPSE_OUTSIDE, BUNNY_STATUS_OK];
  }
  const p = BigInt(dx) * BigInt(semiY);
  const q = BigInt(dy) * BigInt(semiX);
  const r = BigInt(semiX) * BigInt(semiY);
  const lhs = p * p + q * q;
  const rhs = r * r;
  if (lhs < rhs) {
    return [ELLIPSE_INSIDE, BUNNY_STATUS_OK];
  }
  return [lhs === rhs ? ELLIPSE_ON_BOUNDARY : ELLIPSE_OUTSIDE, BUNNY_STATUS_OK];
}

/** Unsigned saturating subtraction: never underflows `u32`. */
export function satSub(a: number, b: number): number {
  return a > b ? a - b : 0;
}

/** Unsigned absolute difference: never underflows `u32`. */
export function absDiff(a: number, b: number): number {
  return a >= b ? a - b : b - a;
}

/** `lerpU8(a, b, num, den) = divRoundEven(a * (den - num) + b * num, den)`. */
export function lerpU8(a: number, b: number, num: number, den: number): number {
  return divRoundEven(a * (den - num) + b * num, den);
}
