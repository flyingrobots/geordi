import {
  absDiff,
  bunnyU32EllipseClassify,
  BUNNY_STATUS_OK,
  divRoundEven,
  ELLIPSE_ON_BOUNDARY,
  satSub,
} from './numeric.js';
import { BLOCK_KIND_QUADRANT, BLOCK_KIND_RECT, BLOCK_KIND_SHADE } from './procedural-table.js';

/**
 * Pure-integer procedural glyph geometry from Section 7 of the
 * `bijou-surface-gpu/1` ABI. Every function evaluates one integer cell-local
 * pixel `(lx, ly)` of a `W x H` cell with `1 <= W, H <= 256`.
 */

/** `Inside || OnBoundary`, written as the shader must write it (`res.x <= 1u`). */
function insideOrOn(dx: number, dy: number, semiX: number, semiY: number): boolean {
  const [cls, status] = bunnyU32EllipseClassify(dx, dy, semiX, semiY);
  return status === BUNNY_STATUS_OK && cls <= ELLIPSE_ON_BOUNDARY;
}

/** `OnBoundary || Outside`, written as the shader must write it (`res.x >= 1u`). */
function onOrOutside(dx: number, dy: number, semiX: number, semiY: number): boolean {
  const [cls, status] = bunnyU32EllipseClassify(dx, dy, semiX, semiY);
  return status === BUNNY_STATUS_OK && cls >= ELLIPSE_ON_BOUNDARY;
}

/** Section 7.1: Box-Drawing coverage for a packed `BOX_GLYPHS` entry. */
export function boxPixelLit(packed: number, lx: number, ly: number, W: number, H: number): boolean {
  const left = packed & 3;
  const right = (packed >>> 2) & 3;
  const up = (packed >>> 4) & 3;
  const down = (packed >>> 6) & 3;
  const dash = (packed >>> 8) & 7;
  const rounded = ((packed >>> 11) & 1) === 1;
  const diagSlash = ((packed >>> 12) & 1) === 1;
  const diagBackslash = ((packed >>> 13) & 1) === 1;

  const lightPx = Math.max(1, Math.floor((W * 10 + 50) / 100));
  const heavyPx = 2 * lightPx;
  const dblGap = Math.max(1, lightPx);
  const vx0 = (w: number): number => Math.floor(satSub(W, w) / 2);
  const hy0 = (w: number): number => Math.floor(satSub(H, w) / 2);
  const vxL0 = satSub(vx0(lightPx), dblGap);
  const vxR0 = Math.min(satSub(W, lightPx), vx0(lightPx) + dblGap);
  const hyT0 = satSub(hy0(lightPx), dblGap);
  const hyB0 = Math.min(satSub(H, lightPx), hy0(lightPx) + dblGap);

  if (diagSlash || diagBackslash) {
    const scale = lightPx === 1 ? 10 : 1;
    const halfS = lightPx === 1 ? 11 : lightPx;
    const bound = halfS * (W + H);
    const rhs = halfS * halfS * (W * W + H * H);
    if (diagSlash) {
      const d = scale * absDiff((2 * lx + 1) * H + (2 * ly + 1) * W, 2 * W * H);
      if (d <= bound && d * d <= rhs) {
        return true;
      }
    }
    if (diagBackslash) {
      const d = scale * absDiff((2 * lx + 1) * H, (2 * ly + 1) * W);
      if (d <= bound && d * d <= rhs) {
        return true;
      }
    }
    return false;
  }

  if (rounded) {
    return roundedPixelLit(right > 0, down > 0, lx, ly, W, H, vx0(lightPx), hy0(lightPx), lightPx);
  }

  if (dash > 0) {
    if (left > 0 && right > 0) {
      const w = left === 2 ? heavyPx : lightPx;
      return ly >= hy0(w) && ly < hy0(w) + w && Math.floor((lx * 2 * dash) / W) % 2 === 0;
    }
    if (up > 0 && down > 0) {
      const w = up === 2 ? heavyPx : lightPx;
      return lx >= vx0(w) && lx < vx0(w) + w && Math.floor((ly * 2 * dash) / H) % 2 === 0;
    }
  }

  const vMax = up === 2 || down === 2 ? heavyPx : lightPx;
  const hMax = left === 2 || right === 2 ? heavyPx : lightPx;
  const vDouble = up === 3 || down === 3;
  const hDouble = left === 3 || right === 3;
  const cx0 = vDouble ? vxL0 : vx0(vMax);
  const cx1 = vDouble ? vxR0 + lightPx : cx0 + vMax;
  const cy0 = hDouble ? hyT0 : hy0(hMax);
  const cy1 = hDouble ? hyB0 + lightPx : cy0 + hMax;

  const inRowBand = (w: number): boolean => ly >= hy0(w) && ly < hy0(w) + w;
  const inColBand = (w: number): boolean => lx >= vx0(w) && lx < vx0(w) + w;
  const armWidth = (style: number): number => (style === 2 ? heavyPx : lightPx);

  if ((left === 1 || left === 2) && lx < cx1 && inRowBand(armWidth(left))) {
    return true;
  }
  if ((right === 1 || right === 2) && lx >= cx0 && inRowBand(armWidth(right))) {
    return true;
  }
  if ((up === 1 || up === 2) && ly < cy1 && inColBand(armWidth(up))) {
    return true;
  }
  if ((down === 1 || down === 2) && ly >= cy0 && inColBand(armWidth(down))) {
    return true;
  }

  const onTopRail = ly >= hyT0 && ly < hyT0 + lightPx;
  const onBottomRail = ly >= hyB0 && ly < hyB0 + lightPx;
  const onLeftRail = lx >= vxL0 && lx < vxL0 + lightPx;
  const onRightRail = lx >= vxR0 && lx < vxR0 + lightPx;

  if (left === 3) {
    const xTopEnd = up === 3 ? vxL0 + lightPx : cx1;
    const xBottomEnd = down === 3 ? vxL0 + lightPx : cx1;
    if ((onTopRail && lx < xTopEnd) || (onBottomRail && lx < xBottomEnd)) {
      return true;
    }
  }
  if (right === 3) {
    const xTopStart = up === 3 ? vxR0 : cx0;
    const xBottomStart = down === 3 ? vxR0 : cx0;
    if ((onTopRail && lx >= xTopStart) || (onBottomRail && lx >= xBottomStart)) {
      return true;
    }
  }
  if (up === 3) {
    const yLeftEnd = left === 3 ? hyT0 + lightPx : cy1;
    const yRightEnd = right === 3 ? hyT0 + lightPx : cy1;
    if ((onLeftRail && ly < yLeftEnd) || (onRightRail && ly < yRightEnd)) {
      return true;
    }
  }
  if (down === 3) {
    const yLeftStart = left === 3 ? hyB0 : cy0;
    const yRightStart = right === 3 ? hyB0 : cy0;
    if ((onLeftRail && ly >= yLeftStart) || (onRightRail && ly >= yRightStart)) {
      return true;
    }
  }
  return false;
}

/**
 * Option E4 inset-corner rounded arc: an exact quarter-ellipse annulus centred
 * on the inner boundary of the 1-pixel outgoing edge stubs, unioned with a
 * pixel-square centreline straddle so the arc never disconnects.
 */
function roundedPixelLit(
  hasRight: boolean,
  hasDown: boolean,
  lx: number,
  ly: number,
  W: number,
  H: number,
  vxStart: number,
  hyStart: number,
  lightPx: number,
): boolean {
  const vxEnd = Math.min(W, vxStart + lightPx);
  const hyEnd = Math.min(H, hyStart + lightPx);

  const edgeX = hasRight ? W - 1 : 0;
  const edgeY = hasDown ? H - 1 : 0;
  const xIn = hasRight ? satSub(W, 1) : Math.min(1, W);
  const yIn = hasDown ? satSub(H, 1) : Math.min(1, H);
  const cx2 = 2 * xIn;
  const cy2 = 2 * yIn;

  const aOut = hasRight ? 2 * satSub(xIn, vxStart) : 2 * satSub(vxEnd, xIn);
  const aIn = hasRight ? 2 * satSub(xIn, vxEnd) : 2 * satSub(vxStart, xIn);
  const bOut = hasDown ? 2 * satSub(yIn, hyStart) : 2 * satSub(hyEnd, yIn);
  const bIn = hasDown ? 2 * satSub(yIn, hyEnd) : 2 * satSub(hyStart, yIn);
  const aMid = Math.floor((aOut + aIn) / 2);
  const bMid = Math.floor((bOut + bIn) / 2);

  const inStrX = lx >= vxStart && lx < vxEnd;
  const inStrY = ly >= hyStart && ly < hyEnd;

  // Case 1: the straight stroke already meets the outgoing edge.
  if (aOut === 0 || bOut === 0) {
    const hArm = inStrY && (hasRight ? lx >= vxStart : lx < vxEnd);
    const vArm = inStrX && (hasDown ? ly >= hyStart : ly < hyEnd);
    return hArm || vArm;
  }
  // Case 2: 1-pixel outgoing edge stubs (the straight-stroke join mask).
  if (lx === edgeX || ly === edgeY) {
    return (ly === edgeY && inStrX) || (lx === edgeX && inStrY);
  }
  // Case 3: strict interior.
  const dx = absDiff(2 * lx + 1, cx2);
  const dy = absDiff(2 * ly + 1, cy2);
  const inBand = insideOrOn(dx, dy, aOut, bOut) && onOrOutside(dx, dy, aIn, bIn);
  const straddle =
    insideOrOn(dx - 1, dy - 1, aMid, bMid) && onOrOutside(dx + 1, dy + 1, aMid, bMid);
  return inBand || straddle;
}

/**
 * Section 7.2: Block Element coverage for a packed `BLOCK_GLYPHS` entry, in
 * quarters. `4` is a solid hit, `1..3` is uniform shade coverage, `0` is unlit.
 */
export function blockPixelQuarters(
  packed: number,
  lx: number,
  ly: number,
  W: number,
  H: number,
): number {
  const kind = (packed >>> 16) & 3;
  if (kind === BLOCK_KIND_RECT) {
    const x0 = packed & 15;
    const y0 = (packed >>> 4) & 15;
    const x1 = (packed >>> 8) & 15;
    const y1 = (packed >>> 12) & 15;
    const cx = (2 * lx + 1) * 4;
    const cy = (2 * ly + 1) * 4;
    return cx >= x0 * W && cx < x1 * W && cy >= y0 * H && cy < y1 * H ? 4 : 0;
  }
  if (kind === BLOCK_KIND_SHADE) {
    return packed & 3;
  }
  if (kind === BLOCK_KIND_QUADRANT) {
    const mask = packed & 15;
    const qx = 2 * lx + 1 >= W ? 1 : 0;
    const qy = 2 * ly + 1 >= H ? 1 : 0;
    return ((mask >>> (qx + 2 * qy)) & 1) !== 0 ? 4 : 0;
  }
  return 0;
}

/** Section 7.3: Braille coverage for an 8-bit dot mask (`codePoint - 0x2800`). */
export function braillePixelLit(
  mask: number,
  lx: number,
  ly: number,
  W: number,
  H: number,
): boolean {
  const subCol = Math.min(1, Math.floor((2 * lx + 1) / W));
  const subRow = Math.min(3, Math.floor((4 * ly + 2) / H));
  const bitIdx = subRow === 3 ? 6 + subCol : subCol * 3 + subRow;
  const subX = 2 * lx + 1 - subCol * W;
  const subY = 4 * ly + 2 - subRow * H;
  const inX = W < 4 || (4 * subX >= W && 4 * subX < 3 * W);
  const inY = H < 8 || (5 * subY >= H && 5 * subY < 4 * H);
  return inX && inY && ((mask >>> bitIdx) & 1) !== 0;
}

/** Section 5: underline and strikethrough coverage for an `OFF_FLAGS` byte. */
export function decorationPixelLit(
  flags: number,
  lx: number,
  ly: number,
  W: number,
  H: number,
): boolean {
  const decoPx = Math.max(1, Math.floor((H * 6 + 50) / 100));
  const inBand = (y0: number): boolean => ly >= y0 && ly < y0 + decoPx;

  if ((flags & 0x04) !== 0 && inBand(Math.floor((H - decoPx) / 2))) {
    return true;
  }

  const underline = (flags >>> 4) & 3;
  if (underline === 0) {
    return false;
  }
  const ulY0 = Math.min(H - decoPx, Math.floor((H * 88) / 100));
  if (underline === 1) {
    return inBand(ulY0);
  }
  if (underline === 3) {
    const dashed = (flags & 0x40) !== 0;
    const on = dashed
      ? Math.floor((lx * 10) / W) % 5 < 3
      : Math.floor((lx * 8) / W) % 2 === 0;
    return inBand(ulY0) && on;
  }
  // Curly: a two-cycle pure-u32 triangle wave.
  const ampPx = H >= 3 ? Math.max(1, Math.floor((H * 3 + 50) / 100)) : 0;
  const baseY = Math.min(H - decoPx, Math.floor((H * 90) / 100));
  const t = ((2 * lx + 1) * 4) % (4 * W);
  const q = Math.floor(t / W);
  const r = t % W;
  const mag = divRoundEven((q === 0 || q === 2 ? r : W - r) * ampPx, W);
  const cy = q < 2 ? Math.min(H - decoPx, baseY + mag) : satSub(baseY, mag);
  return inBand(cy);
}
