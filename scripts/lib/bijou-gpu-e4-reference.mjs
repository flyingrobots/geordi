// Option E4 rounded-corner reference model and test frames for the bijou-surface shader diff.
//
// The model follows Section 7.1, rule 3 of docs/design/2026-11-bijou-surface-gpu-abi.md. It shares
// no code with the shader: the ellipse trichotomy is evaluated directly in exact integers (every
// product stays below 2^38, far inside the exact range of a JavaScript number) instead of through
// the 2-limb u32 helper. It runs in a browser page and in Node, so it imports nothing.

// Sizes the ABI record requires for the shader diff gate, as [cellPxW, cellPxH].
export const ADR_E4_SIZES = [
  [1, 4],
  [2, 2],
  [3, 4],
  [4, 4],
  [2, 14],
  [15, 2],
  [28, 2],
  [5, 7],
  [8, 16],
  [16, 8],
  [18, 7],
];

// Further sizes: domain extremes, common terminal cells, and both stroke-width regimes.
export const EXTRA_E4_SIZES = [
  [1, 1],
  [3, 3],
  [9, 18],
  [10, 20],
  [14, 28],
  [15, 30],
  [16, 32],
  [24, 48],
  [256, 1],
  [1, 256],
  [255, 254],
  [256, 256],
];

export const E4_DEFAULT_FG = [0xe6, 0xed, 0xf3];
export const E4_DEFAULT_BG = [0x20, 0x30, 0x40];
const LIT = [255, 255, 255, 255];
const UNLIT = [0, 0, 0, 255];
// Remainder pixels to the right of and below the 2x2 grid.
const LETTERBOX = [3, 2];

const satSub = (a, b) => (a > b ? a - b : 0);
const absDiff = (a, b) => (a >= b ? a - b : b - a);

// -1 inside, 0 on the boundary, +1 outside, with the degenerate rule first.
function classify(dx, dy, semiX, semiY) {
  if (semiX === 0 || semiY === 0) {
    return dx === 0 && dy === 0 ? 0 : 1;
  }
  const lhs = (dx * semiY) ** 2 + (dy * semiX) ** 2;
  const rhs = (semiX * semiY) ** 2;
  return Math.sign(lhs - rhs);
}

/** Whether cell-local pixel (lx, ly) of a W x H rounded corner with these arms is lit. */
export function e4CornerLit(hasRight, hasDown, lx, ly, W, H) {
  const lightPx = Math.max(1, Math.floor((W * 10 + 50) / 100));
  const vxStart = Math.floor(satSub(W, lightPx) / 2);
  const vxEnd = Math.min(W, vxStart + lightPx);
  const hyStart = Math.floor(satSub(H, lightPx) / 2);
  const hyEnd = Math.min(H, hyStart + lightPx);

  const edgeX = hasRight ? W - 1 : 0;
  const edgeY = hasDown ? H - 1 : 0;
  const xIn = hasRight ? satSub(W, 1) : Math.min(1, W);
  const yIn = hasDown ? satSub(H, 1) : Math.min(1, H);

  const aOut = hasRight ? 2 * satSub(xIn, vxStart) : 2 * satSub(vxEnd, xIn);
  const aIn = hasRight ? 2 * satSub(xIn, vxEnd) : 2 * satSub(vxStart, xIn);
  const bOut = hasDown ? 2 * satSub(yIn, hyStart) : 2 * satSub(hyEnd, yIn);
  const bIn = hasDown ? 2 * satSub(yIn, hyEnd) : 2 * satSub(hyStart, yIn);
  const aMid = Math.floor((aOut + aIn) / 2);
  const bMid = Math.floor((bOut + bIn) / 2);

  const inStrX = lx >= vxStart && lx < vxEnd;
  const inStrY = ly >= hyStart && ly < hyEnd;

  if (aOut === 0 || bOut === 0) {
    const hArm = inStrY && (hasRight ? lx >= vxStart : lx < vxEnd);
    const vArm = inStrX && (hasDown ? ly >= hyStart : ly < hyEnd);
    return hArm || vArm;
  }
  if (lx === edgeX || ly === edgeY) {
    return (ly === edgeY && inStrX) || (lx === edgeX && inStrY);
  }
  const dx = absDiff(2 * lx + 1, 2 * xIn);
  const dy = absDiff(2 * ly + 1, 2 * yIn);
  const inBand = classify(dx, dy, aOut, bOut) <= 0 && classify(dx, dy, aIn, bIn) >= 0;
  const straddle = classify(dx - 1, dy - 1, aMid, bMid) <= 0 && classify(dx + 1, dy + 1, aMid, bMid) >= 0;
  return inBand || straddle;
}

/**
 * Frame with the four rounded corners in a 2x2 grid and a letterboxed remainder. `corners` is the
 * four `{ index, right, down }` table entries for U+256D..U+2570, laid out row-major.
 */
export function e4Frame(corners, W, H) {
  const words = [];
  for (const corner of corners) {
    // GLYPH_KIND_BOX, fg #FFFFFF and bg #000000 both set, opacity 63, no flags.
    words.push(0x00050000 + corner.index, 0x00ffffff, 0xff000000, 0);
  }
  return {
    uniforms: {
      canvasPx: [2 * W + LETTERBOX[0], 2 * H + LETTERBOX[1]],
      cellPx: [W, H],
      gridCells: [2, 2],
      atlasCols: 1,
      defaultFg: E4_DEFAULT_FG,
      defaultBg: E4_DEFAULT_BG,
      flags: 0,
    },
    cells: { width: 2, height: 2, words },
    atlas: { width: 1, height: 1, bytes: [0, 0, 0, 0] },
  };
}

/** Canonical tight top-left row-major RGBA8 bytes the reference model expects for `e4Frame`. */
export function e4ExpectedRgba(corners, W, H) {
  const width = 2 * W + LETTERBOX[0];
  const height = 2 * H + LETTERBOX[1];
  const rgba = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const col = Math.floor(px / W);
      const row = Math.floor(py / H);
      let pixel = [...E4_DEFAULT_BG, 255];
      if (col < 2 && row < 2) {
        const corner = corners[row * 2 + col];
        pixel = e4CornerLit(corner.right, corner.down, px - col * W, py - row * H, W, H) ? LIT : UNLIT;
      }
      rgba.set(pixel, (py * width + px) * 4);
    }
  }
  return rgba;
}

/** Number of differing pixels and the first one, as `{ count, first }`. */
export function diffRgba(actual, expected, width) {
  let count = actual.length === expected.length ? 0 : 1;
  let first = count === 0 ? null : `length ${actual.length} instead of ${expected.length}`;
  for (let at = 0; at < expected.length && at < actual.length; at += 4) {
    const same =
      actual[at] === expected[at] &&
      actual[at + 1] === expected[at + 1] &&
      actual[at + 2] === expected[at + 2] &&
      actual[at + 3] === expected[at + 3];
    if (!same) {
      count += 1;
      if (first === null) {
        const pixel = at / 4;
        first = `pixel (${pixel % width}, ${Math.floor(pixel / width)}): [${Array.from(actual.slice(at, at + 4)).join(', ')}] instead of [${Array.from(expected.slice(at, at + 4)).join(', ')}]`;
      }
    }
  }
  return { count, first };
}

/** Diffs every listed size through `render(frame)` and totals the result. */
export function diffE4Sizes(render, corners, sizes) {
  const total = { instances: 0, pixels: 0, divergentPixels: 0, first: null };
  for (const [W, H] of sizes) {
    const frame = e4Frame(corners, W, H);
    const result = render(frame);
    total.instances += corners.length;
    total.pixels += frame.uniforms.canvasPx[0] * frame.uniforms.canvasPx[1];
    if (result.rgba === null) {
      total.divergentPixels += 1;
      total.first ??= `${W}x${H}: ${result.detail}`;
      continue;
    }
    const diff = diffRgba(result.rgba, e4ExpectedRgba(corners, W, H), frame.uniforms.canvasPx[0]);
    total.divergentPixels += diff.count;
    if (diff.first !== null) {
      total.first ??= `${W}x${H}: ${diff.first}`;
    }
  }
  return total;
}
