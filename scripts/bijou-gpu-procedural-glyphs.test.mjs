import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

const REPO_ROOT = resolve(import.meta.dirname, '..');
const ADR_PATH = resolve(REPO_ROOT, 'docs/design/2026-11-bijou-surface-gpu-abi.md');
const DESIGN_README_PATH = resolve(REPO_ROOT, 'docs/design/README.md');
const TABLE_PATH = resolve(REPO_ROOT, 'fixtures/bijou-gpu/procedural-glyphs.json');

const PINNED_BOX_DRAWING_NAMES = {
  0x2500: 'BOX DRAWINGS LIGHT HORIZONTAL',
  0x2501: 'BOX DRAWINGS HEAVY HORIZONTAL',
  0x2502: 'BOX DRAWINGS LIGHT VERTICAL',
  0x2503: 'BOX DRAWINGS HEAVY VERTICAL',
  0x2504: 'BOX DRAWINGS LIGHT TRIPLE DASH HORIZONTAL',
  0x2505: 'BOX DRAWINGS HEAVY TRIPLE DASH HORIZONTAL',
  0x2506: 'BOX DRAWINGS LIGHT TRIPLE DASH VERTICAL',
  0x2507: 'BOX DRAWINGS HEAVY TRIPLE DASH VERTICAL',
  0x2508: 'BOX DRAWINGS LIGHT QUADRUPLE DASH HORIZONTAL',
  0x2509: 'BOX DRAWINGS HEAVY QUADRUPLE DASH HORIZONTAL',
  0x250a: 'BOX DRAWINGS LIGHT QUADRUPLE DASH VERTICAL',
  0x250b: 'BOX DRAWINGS HEAVY QUADRUPLE DASH VERTICAL',
  0x250c: 'BOX DRAWINGS LIGHT DOWN AND RIGHT',
  0x250d: 'BOX DRAWINGS DOWN LIGHT AND RIGHT HEAVY',
  0x250e: 'BOX DRAWINGS DOWN HEAVY AND RIGHT LIGHT',
  0x250f: 'BOX DRAWINGS HEAVY DOWN AND RIGHT',
  0x2510: 'BOX DRAWINGS LIGHT DOWN AND LEFT',
  0x2511: 'BOX DRAWINGS DOWN LIGHT AND LEFT HEAVY',
  0x2512: 'BOX DRAWINGS DOWN HEAVY AND LEFT LIGHT',
  0x2513: 'BOX DRAWINGS HEAVY DOWN AND LEFT',
  0x2514: 'BOX DRAWINGS LIGHT UP AND RIGHT',
  0x2515: 'BOX DRAWINGS UP LIGHT AND RIGHT HEAVY',
  0x2516: 'BOX DRAWINGS UP HEAVY AND RIGHT LIGHT',
  0x2517: 'BOX DRAWINGS HEAVY UP AND RIGHT',
  0x2518: 'BOX DRAWINGS LIGHT UP AND LEFT',
  0x2519: 'BOX DRAWINGS UP LIGHT AND LEFT HEAVY',
  0x251a: 'BOX DRAWINGS UP HEAVY AND LEFT LIGHT',
  0x251b: 'BOX DRAWINGS HEAVY UP AND LEFT',
  0x251c: 'BOX DRAWINGS LIGHT VERTICAL AND RIGHT',
  0x251d: 'BOX DRAWINGS VERTICAL LIGHT AND RIGHT HEAVY',
  0x251e: 'BOX DRAWINGS UP HEAVY AND RIGHT DOWN LIGHT',
  0x251f: 'BOX DRAWINGS DOWN HEAVY AND RIGHT UP LIGHT',
  0x2520: 'BOX DRAWINGS VERTICAL HEAVY AND RIGHT LIGHT',
  0x2521: 'BOX DRAWINGS DOWN LIGHT AND RIGHT UP HEAVY',
  0x2522: 'BOX DRAWINGS UP LIGHT AND RIGHT DOWN HEAVY',
  0x2523: 'BOX DRAWINGS HEAVY VERTICAL AND RIGHT',
  0x2524: 'BOX DRAWINGS LIGHT VERTICAL AND LEFT',
  0x2525: 'BOX DRAWINGS VERTICAL LIGHT AND LEFT HEAVY',
  0x2526: 'BOX DRAWINGS UP HEAVY AND LEFT DOWN LIGHT',
  0x2527: 'BOX DRAWINGS DOWN HEAVY AND LEFT UP LIGHT',
  0x2528: 'BOX DRAWINGS VERTICAL HEAVY AND LEFT LIGHT',
  0x2529: 'BOX DRAWINGS DOWN LIGHT AND LEFT UP HEAVY',
  0x252a: 'BOX DRAWINGS UP LIGHT AND LEFT DOWN HEAVY',
  0x252b: 'BOX DRAWINGS HEAVY VERTICAL AND LEFT',
  0x252c: 'BOX DRAWINGS LIGHT DOWN AND HORIZONTAL',
  0x252d: 'BOX DRAWINGS LEFT HEAVY AND RIGHT DOWN LIGHT',
  0x252e: 'BOX DRAWINGS RIGHT HEAVY AND LEFT DOWN LIGHT',
  0x252f: 'BOX DRAWINGS DOWN LIGHT AND HORIZONTAL HEAVY',
  0x2530: 'BOX DRAWINGS DOWN HEAVY AND HORIZONTAL LIGHT',
  0x2531: 'BOX DRAWINGS RIGHT LIGHT AND LEFT DOWN HEAVY',
  0x2532: 'BOX DRAWINGS LEFT LIGHT AND RIGHT DOWN HEAVY',
  0x2533: 'BOX DRAWINGS HEAVY DOWN AND HORIZONTAL',
  0x2534: 'BOX DRAWINGS LIGHT UP AND HORIZONTAL',
  0x2535: 'BOX DRAWINGS LEFT HEAVY AND RIGHT UP LIGHT',
  0x2536: 'BOX DRAWINGS RIGHT HEAVY AND LEFT UP LIGHT',
  0x2537: 'BOX DRAWINGS UP LIGHT AND HORIZONTAL HEAVY',
  0x2538: 'BOX DRAWINGS UP HEAVY AND HORIZONTAL LIGHT',
  0x2539: 'BOX DRAWINGS RIGHT LIGHT AND LEFT UP HEAVY',
  0x253a: 'BOX DRAWINGS LEFT LIGHT AND RIGHT UP HEAVY',
  0x253b: 'BOX DRAWINGS HEAVY UP AND HORIZONTAL',
  0x253c: 'BOX DRAWINGS LIGHT VERTICAL AND HORIZONTAL',
  0x253d: 'BOX DRAWINGS LEFT HEAVY AND RIGHT VERTICAL LIGHT',
  0x253e: 'BOX DRAWINGS RIGHT HEAVY AND LEFT VERTICAL LIGHT',
  0x253f: 'BOX DRAWINGS VERTICAL LIGHT AND HORIZONTAL HEAVY',
  0x2540: 'BOX DRAWINGS UP HEAVY AND DOWN HORIZONTAL LIGHT',
  0x2541: 'BOX DRAWINGS DOWN HEAVY AND UP HORIZONTAL LIGHT',
  0x2542: 'BOX DRAWINGS VERTICAL HEAVY AND HORIZONTAL LIGHT',
  0x2543: 'BOX DRAWINGS LEFT UP HEAVY AND RIGHT DOWN LIGHT',
  0x2544: 'BOX DRAWINGS RIGHT UP HEAVY AND LEFT DOWN LIGHT',
  0x2545: 'BOX DRAWINGS LEFT DOWN HEAVY AND RIGHT UP LIGHT',
  0x2546: 'BOX DRAWINGS RIGHT DOWN HEAVY AND LEFT UP LIGHT',
  0x2547: 'BOX DRAWINGS DOWN LIGHT AND UP HORIZONTAL HEAVY',
  0x2548: 'BOX DRAWINGS UP LIGHT AND DOWN HORIZONTAL HEAVY',
  0x2549: 'BOX DRAWINGS RIGHT LIGHT AND LEFT VERTICAL HEAVY',
  0x254a: 'BOX DRAWINGS LEFT LIGHT AND RIGHT VERTICAL HEAVY',
  0x254b: 'BOX DRAWINGS HEAVY VERTICAL AND HORIZONTAL',
  0x254c: 'BOX DRAWINGS LIGHT DOUBLE DASH HORIZONTAL',
  0x254d: 'BOX DRAWINGS HEAVY DOUBLE DASH HORIZONTAL',
  0x254e: 'BOX DRAWINGS LIGHT DOUBLE DASH VERTICAL',
  0x254f: 'BOX DRAWINGS HEAVY DOUBLE DASH VERTICAL',
  0x2550: 'BOX DRAWINGS DOUBLE HORIZONTAL',
  0x2551: 'BOX DRAWINGS DOUBLE VERTICAL',
  0x2552: 'BOX DRAWINGS DOWN SINGLE AND RIGHT DOUBLE',
  0x2553: 'BOX DRAWINGS DOWN DOUBLE AND RIGHT SINGLE',
  0x2554: 'BOX DRAWINGS DOUBLE DOWN AND RIGHT',
  0x2555: 'BOX DRAWINGS DOWN SINGLE AND LEFT DOUBLE',
  0x2556: 'BOX DRAWINGS DOWN DOUBLE AND LEFT SINGLE',
  0x2557: 'BOX DRAWINGS DOUBLE DOWN AND LEFT',
  0x2558: 'BOX DRAWINGS UP SINGLE AND RIGHT DOUBLE',
  0x2559: 'BOX DRAWINGS UP DOUBLE AND RIGHT SINGLE',
  0x255a: 'BOX DRAWINGS DOUBLE UP AND RIGHT',
  0x255b: 'BOX DRAWINGS UP SINGLE AND LEFT DOUBLE',
  0x255c: 'BOX DRAWINGS UP DOUBLE AND LEFT SINGLE',
  0x255d: 'BOX DRAWINGS DOUBLE UP AND LEFT',
  0x255e: 'BOX DRAWINGS VERTICAL SINGLE AND RIGHT DOUBLE',
  0x255f: 'BOX DRAWINGS VERTICAL DOUBLE AND RIGHT SINGLE',
  0x2560: 'BOX DRAWINGS DOUBLE VERTICAL AND RIGHT',
  0x2561: 'BOX DRAWINGS VERTICAL SINGLE AND LEFT DOUBLE',
  0x2562: 'BOX DRAWINGS VERTICAL DOUBLE AND LEFT SINGLE',
  0x2563: 'BOX DRAWINGS DOUBLE VERTICAL AND LEFT',
  0x2564: 'BOX DRAWINGS DOWN SINGLE AND HORIZONTAL DOUBLE',
  0x2565: 'BOX DRAWINGS DOWN DOUBLE AND HORIZONTAL SINGLE',
  0x2566: 'BOX DRAWINGS DOUBLE DOWN AND HORIZONTAL',
  0x2567: 'BOX DRAWINGS UP SINGLE AND HORIZONTAL DOUBLE',
  0x2568: 'BOX DRAWINGS UP DOUBLE AND HORIZONTAL SINGLE',
  0x2569: 'BOX DRAWINGS DOUBLE UP AND HORIZONTAL',
  0x256a: 'BOX DRAWINGS VERTICAL SINGLE AND HORIZONTAL DOUBLE',
  0x256b: 'BOX DRAWINGS VERTICAL DOUBLE AND HORIZONTAL SINGLE',
  0x256c: 'BOX DRAWINGS DOUBLE VERTICAL AND HORIZONTAL',
  0x256d: 'BOX DRAWINGS LIGHT ARC DOWN AND RIGHT',
  0x256e: 'BOX DRAWINGS LIGHT ARC DOWN AND LEFT',
  0x256f: 'BOX DRAWINGS LIGHT ARC UP AND LEFT',
  0x2570: 'BOX DRAWINGS LIGHT ARC UP AND RIGHT',
  0x2571: 'BOX DRAWINGS LIGHT DIAGONAL UPPER RIGHT TO LOWER LEFT',
  0x2572: 'BOX DRAWINGS LIGHT DIAGONAL UPPER LEFT TO LOWER RIGHT',
  0x2573: 'BOX DRAWINGS LIGHT DIAGONAL CROSS',
  0x2574: 'BOX DRAWINGS LIGHT LEFT',
  0x2575: 'BOX DRAWINGS LIGHT UP',
  0x2576: 'BOX DRAWINGS LIGHT RIGHT',
  0x2577: 'BOX DRAWINGS LIGHT DOWN',
  0x2578: 'BOX DRAWINGS HEAVY LEFT',
  0x2579: 'BOX DRAWINGS HEAVY UP',
  0x257a: 'BOX DRAWINGS HEAVY RIGHT',
  0x257b: 'BOX DRAWINGS HEAVY DOWN',
  0x257c: 'BOX DRAWINGS LIGHT LEFT AND HEAVY RIGHT',
  0x257d: 'BOX DRAWINGS LIGHT UP AND HEAVY DOWN',
  0x257e: 'BOX DRAWINGS HEAVY LEFT AND LIGHT RIGHT',
  0x257f: 'BOX DRAWINGS HEAVY UP AND LIGHT DOWN',
};

const EXPECTED_BLOCK_SPECS = {
  0x2580: ['rect', [0, 0, 8, 4]],
  0x2581: ['rect', [0, 7, 8, 8]],
  0x2582: ['rect', [0, 6, 8, 8]],
  0x2583: ['rect', [0, 5, 8, 8]],
  0x2584: ['rect', [0, 4, 8, 8]],
  0x2585: ['rect', [0, 3, 8, 8]],
  0x2586: ['rect', [0, 2, 8, 8]],
  0x2587: ['rect', [0, 1, 8, 8]],
  0x2588: ['rect', [0, 0, 8, 8]],
  0x2589: ['rect', [0, 0, 7, 8]],
  0x258a: ['rect', [0, 0, 6, 8]],
  0x258b: ['rect', [0, 0, 5, 8]],
  0x258c: ['rect', [0, 0, 4, 8]],
  0x258d: ['rect', [0, 0, 3, 8]],
  0x258e: ['rect', [0, 0, 2, 8]],
  0x258f: ['rect', [0, 0, 1, 8]],
  0x2590: ['rect', [4, 0, 8, 8]],
  0x2591: ['shade', 1],
  0x2592: ['shade', 2],
  0x2593: ['shade', 3],
  0x2594: ['rect', [0, 0, 8, 1]],
  0x2595: ['rect', [7, 0, 8, 8]],
  0x2596: ['quadrant', 0b0100],
  0x2597: ['quadrant', 0b1000],
  0x2598: ['quadrant', 0b0001],
  0x2599: ['quadrant', 0b1101],
  0x259a: ['quadrant', 0b1001],
  0x259b: ['quadrant', 0b0111],
  0x259c: ['quadrant', 0b1011],
  0x259d: ['quadrant', 0b0010],
  0x259e: ['quadrant', 0b0110],
  0x259f: ['quadrant', 0b1110],
};

function divRoundEven(n, d) {
  assert.equal(Number.isInteger(n) && n >= 0 && n < 0x100000000, true, `divRoundEven numerator out of u32: ${n}`);
  assert.equal(Number.isInteger(d) && d > 0 && d < 0x100000000, true, `divRoundEven denominator out of u32: ${d}`);
  const q = Math.floor(n / d);
  const r = n % d;
  const r2 = 2 * r;
  if (r2 > d || (r2 === d && (q & 1) === 1)) return q + 1;
  return q;
}

function lerpU8(a, b, num, den) {
  return divRoundEven(a * (den - num) + b * num, den);
}

function satSub(a, b) {
  return a > b ? a - b : 0;
}

function absDiff(a, b) {
  return a >= b ? a - b : b - a;
}

function u32Check(val, label) {
  assert.equal(
    Number.isInteger(val) && val >= 0 && val < 0x100000000,
    true,
    `u32 invariant violated (${label}): ${val}`,
  );
  return val;
}

function packGpuCell({
  glyphKind,
  glyphPayload,
  fgR = 0,
  fgG = 0,
  fgB = 0,
  fgSet = false,
  bgR = 0,
  bgG = 0,
  bgB = 0,
  bgSet = false,
  flags = 0,
  opacity = 63,
}) {
  const word0 = ((glyphKind & 0xf) << 16) | (glyphPayload & 0xffff);
  const word1 =
    (((flags & 0xff) << 24) |
      ((fgB & 0xff) << 16) |
      ((fgG & 0xff) << 8) |
      (fgR & 0xff)) >>>
    0;
  const alphaByte =
    (opacity & 0x3f) | (fgSet ? 0x40 : 0) | (bgSet ? 0x80 : 0);
  const word2 =
    (((alphaByte & 0xff) << 24) |
      ((bgB & 0xff) << 16) |
      ((bgG & 0xff) << 8) |
      (bgR & 0xff)) >>>
    0;
  return [word0 >>> 0, word1, word2, 0];
}

function wordsToLeHexBytes(words) {
  const bytes = [];
  for (const w of words) {
    bytes.push(
      (w & 0xff).toString(16).toUpperCase().padStart(2, '0'),
      ((w >>> 8) & 0xff).toString(16).toUpperCase().padStart(2, '0'),
      ((w >>> 16) & 0xff).toString(16).toUpperCase().padStart(2, '0'),
      ((w >>> 24) & 0xff).toString(16).toUpperCase().padStart(2, '0'),
    );
  }
  return bytes.join(' ');
}

function hex32(value) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function parseExpectedBoxFromUnicodeName(unicodeName) {
  assert.equal(unicodeName.startsWith('BOX DRAWINGS '), true, `Unexpected name: ${unicodeName}`);
  const rest = unicodeName.slice('BOX DRAWINGS '.length);
  const out = {
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    dash: 0,
    rounded: false,
    diagSlash: false,
    diagBackslash: false,
  };
  if (rest === 'LIGHT DIAGONAL UPPER RIGHT TO LOWER LEFT') {
    out.diagSlash = true;
    return out;
  }
  if (rest === 'LIGHT DIAGONAL UPPER LEFT TO LOWER RIGHT') {
    out.diagBackslash = true;
    return out;
  }
  if (rest === 'LIGHT DIAGONAL CROSS') {
    out.diagSlash = true;
    out.diagBackslash = true;
    return out;
  }
  if (rest.startsWith('LIGHT ARC ')) {
    out.rounded = true;
    for (const dir of ['LEFT', 'RIGHT', 'UP', 'DOWN']) {
      if (rest.includes(dir)) out[dir.toLowerCase()] = 1;
    }
    return out;
  }
  const dashMatch = /^(LIGHT|HEAVY) (DOUBLE|TRIPLE|QUADRUPLE) DASH (HORIZONTAL|VERTICAL)$/.exec(rest);
  if (dashMatch) {
    const w = dashMatch[1] === 'HEAVY' ? 2 : 1;
    out.dash = { DOUBLE: 2, TRIPLE: 3, QUADRUPLE: 4 }[dashMatch[2]];
    if (dashMatch[3] === 'HORIZONTAL') {
      out.left = w;
      out.right = w;
    } else {
      out.up = w;
      out.down = w;
    }
    return out;
  }
  const weightWords = { LIGHT: 1, SINGLE: 1, HEAVY: 2, DOUBLE: 3 };
  const dirWords = new Set(['LEFT', 'RIGHT', 'UP', 'DOWN', 'HORIZONTAL', 'VERTICAL']);
  const parts = rest.split(' AND ');
  let propagatedWeight = null;
  for (let i = 0; i < parts.length; i++) {
    const words = parts[i].split(' ');
    const ws = words.filter((w) => w in weightWords).map((w) => weightWords[w]);
    const ds = words.filter((w) => dirWords.has(w));
    assert.equal(ws.length <= 1, true, `Ambiguous weights in ${rest}`);
    let w;
    if (ws.length === 1) {
      w = ws[0];
      if (i === 0 && words[0] in weightWords) propagatedWeight = w;
    } else {
      assert.notEqual(propagatedWeight, null, `Missing weight in ${rest}`);
      w = propagatedWeight;
    }
    for (const d of ds) {
      if (d === 'HORIZONTAL') {
        out.left = w;
        out.right = w;
      } else if (d === 'VERTICAL') {
        out.up = w;
        out.down = w;
      } else {
        out[d.toLowerCase()] = w;
      }
    }
  }
  return out;
}

function evalBoxPixelInt(e, lx, ly, W, H) {
  const lightPx = Math.max(1, Math.floor((W * 10 + 50) / 100));
  const heavyPx = 2 * lightPx;
  const vx0 = (w) => Math.floor(satSub(W, w) / 2);
  const hy0 = (w) => Math.floor(satSub(H, w) / 2);
  const dblGap = Math.max(1, lightPx);
  const vxL0 = satSub(vx0(lightPx), dblGap);
  const vxR0 = Math.min(satSub(W, lightPx), vx0(lightPx) + dblGap);
  const hyT0 = satSub(hy0(lightPx), dblGap);
  const hyB0 = Math.min(satSub(H, lightPx), hy0(lightPx) + dblGap);

  if (e.diagSlash || e.diagBackslash) {
    const half2 = Math.max(1, lightPx);
    const bound = u32Check(half2 * (W + H), 'diag bound');
    const rhs = u32Check(half2 * half2 * (W * W + H * H), 'diag rhs');
    if (e.diagSlash) {
      const d = absDiff((2 * lx + 1) * H + (2 * ly + 1) * W, 2 * W * H);
      if (d <= bound && u32Check(d * d, 'diag dSlash^2') <= rhs) return true;
    }
    if (e.diagBackslash) {
      const d = absDiff((2 * lx + 1) * H, (2 * ly + 1) * W);
      if (d <= bound && u32Check(d * d, 'diag dBack^2') <= rhs) return true;
    }
    return false;
  }

  if (e.rounded) {
    const cx2 = e.right > 0 ? 2 * W : 0;
    const cy2 = e.down > 0 ? 2 * H : 0;
    const dx = absDiff(2 * lx + 1, cx2);
    const dy = absDiff(2 * ly + 1, cy2);
    const nx = Math.floor(u32Check(dx * 4096, 'arc dx*4096') / W);
    const ny = Math.floor(u32Check(dy * 4096, 'arc dy*4096') / H);
    const r2 = u32Check(nx * nx + ny * ny, 'arc r2');
    const halfQ = Math.min(
      8192,
      Math.floor(u32Check(Math.max(11, 10 * lightPx) * 4096, 'arc halfQ num') / (10 * Math.min(W, H))),
    );
    const rIn = satSub(4096, halfQ);
    const rOut = 4096 + halfQ;
    return r2 >= u32Check(rIn * rIn, 'arc rIn^2') && r2 <= u32Check(rOut * rOut, 'arc rOut^2');
  }

  if (e.dash > 0) {
    const k = e.dash;
    if (e.left > 0 && e.right > 0) {
      const w = e.left === 2 ? heavyPx : lightPx;
      return ly >= hy0(w) && ly < hy0(w) + w && Math.floor((lx * 2 * k) / W) % 2 === 0;
    }
    if (e.up > 0 && e.down > 0) {
      const w = e.up === 2 ? heavyPx : lightPx;
      return lx >= vx0(w) && lx < vx0(w) + w && Math.floor((ly * 2 * k) / H) % 2 === 0;
    }
  }

  const vMax = e.up === 2 || e.down === 2 ? heavyPx : lightPx;
  const hMax = e.left === 2 || e.right === 2 ? heavyPx : lightPx;
  const cx0 = e.up === 3 || e.down === 3 ? vxL0 : vx0(vMax);
  const cx1 = e.up === 3 || e.down === 3 ? vxR0 + lightPx : cx0 + vMax;
  const cy0 = e.left === 3 || e.right === 3 ? hyT0 : hy0(hMax);
  const cy1 = e.left === 3 || e.right === 3 ? hyB0 + lightPx : cy0 + hMax;

  if ((e.left === 1 || e.left === 2) && lx < cx1) {
    const w = e.left === 2 ? heavyPx : lightPx;
    if (ly >= hy0(w) && ly < hy0(w) + w) return true;
  }
  if ((e.right === 1 || e.right === 2) && lx >= cx0) {
    const w = e.right === 2 ? heavyPx : lightPx;
    if (ly >= hy0(w) && ly < hy0(w) + w) return true;
  }
  if ((e.up === 1 || e.up === 2) && ly < cy1) {
    const w = e.up === 2 ? heavyPx : lightPx;
    if (lx >= vx0(w) && lx < vx0(w) + w) return true;
  }
  if ((e.down === 1 || e.down === 2) && ly >= cy0) {
    const w = e.down === 2 ? heavyPx : lightPx;
    if (lx >= vx0(w) && lx < vx0(w) + w) return true;
  }
  if (e.left === 3) {
    const xTopEnd = e.up === 3 ? vxL0 + lightPx : cx1;
    const xBotEnd = e.down === 3 ? vxL0 + lightPx : cx1;
    if (
      (ly >= hyT0 && ly < hyT0 + lightPx && lx < xTopEnd) ||
      (ly >= hyB0 && ly < hyB0 + lightPx && lx < xBotEnd)
    ) {
      return true;
    }
  }
  if (e.right === 3) {
    const xTopStart = e.up === 3 ? vxR0 : cx0;
    const xBotStart = e.down === 3 ? vxR0 : cx0;
    if (
      (ly >= hyT0 && ly < hyT0 + lightPx && lx >= xTopStart) ||
      (ly >= hyB0 && ly < hyB0 + lightPx && lx >= xBotStart)
    ) {
      return true;
    }
  }
  if (e.up === 3) {
    const yLeftEnd = e.left === 3 ? hyT0 + lightPx : cy1;
    const yRightEnd = e.right === 3 ? hyT0 + lightPx : cy1;
    if (
      (lx >= vxL0 && lx < vxL0 + lightPx && ly < yLeftEnd) ||
      (lx >= vxR0 && lx < vxR0 + lightPx && ly < yRightEnd)
    ) {
      return true;
    }
  }
  if (e.down === 3) {
    const yLeftStart = e.left === 3 ? hyB0 : cy0;
    const yRightStart = e.right === 3 ? hyB0 : cy0;
    if (
      (lx >= vxL0 && lx < vxL0 + lightPx && ly >= yLeftStart) ||
      (lx >= vxR0 && lx < vxR0 + lightPx && ly >= yRightStart)
    ) {
      return true;
    }
  }
  return false;
}

test('bijou-surface-gpu/1 ADR defines zero-float integer ABI, LE byte order, valid link destination, and canonical hex vectors', () => {
  assert.equal(existsSync(ADR_PATH), true, 'ADR must exist at docs/design/2026-11-bijou-surface-gpu-abi.md');
  const adr = readFileSync(ADR_PATH, 'utf8');
  assert.match(adr, /bijou-surface-gpu\/1/);
  assert.match(adr, /packages\/bijou-gpu/);
  assert.match(adr, /rgba32uint/);
  assert.match(adr, /little-endian/i);
  assert.match(adr, /divRoundEven/);
  assert.match(adr, /Option A/);
  assert.match(adr, /Option D/);
  assert.match(adr, /renderDirtyWords/);
  assert.match(adr, /cellFromPoint/);
  assert.match(adr, /defaultFg/);
  assert.match(adr, /defaultBg/);
  assert.match(adr, /geordi-bijou-gpu-receipt\/1/);
  assert.match(adr, /fixtures\/bijou-gpu\/procedural-glyphs\.json/);
  assert.doesNotMatch(adr, /awaiting maintainer merge/i);
  assert.doesNotMatch(adr, /\bT2\.1[bc]\b/);

  // Zero-float enforcement in core rendering math (Sections 5 & 7 must use pure integer/fixed-point math, no float/sin/sqrt)
  const sec5And7 = adr.split('## 5.')[1] ?? '';
  assert.doesNotMatch(sec5And7, /\bsin\s*\(/, 'Section 5/7 must not use floating-point sin()');
  assert.doesNotMatch(sec5And7, /\bsqrt\s*\(/, 'Section 5/7 must not use floating-point sqrt()');
  assert.doesNotMatch(sec5And7, /\bfloat\s*\(|\b(?:f32|f64)\b/, 'Section 5/7 must not use float/f32/f64');

  // R-1, R-2, R-4 ADR contract assertions: u32-safe satSub/absDiff, clamped Q12 arc halfQ, and full finite rect/dpr guards
  assert.match(adr, /satSub\s*\(/, 'ADR must define u32-safe satSub() to prevent unsigned underflow');
  assert.match(adr, /absDiff\s*\(/, 'ADR must define u32-safe absDiff() for unsigned differences');
  assert.match(
    adr,
    /halfQ\s*=\s*min\(\s*8192\s*,/,
    'ADR Section 7.1 must clamp Q12 arc halfQ at 8192 to prevent rOut*rOut u32 overflow over [1..256]^2',
  );
  assert.match(adr, /!Number\.isFinite\(rect\.left\)/, 'ADR cellFromPoint must reject non-finite rect.left');
  assert.match(adr, /!Number\.isFinite\(rect\.top\)/, 'ADR cellFromPoint must reject non-finite rect.top');
  assert.match(adr, /!Number\.isFinite\(rect\.width\)/, 'ADR cellFromPoint must reject non-finite rect.width');
  assert.match(adr, /!Number\.isFinite\(rect\.height\)/, 'ADR cellFromPoint must reject non-finite rect.height');
  assert.match(
    adr,
    /!Number\.isFinite\(dpr\)|non-finite or non-positive.*dpr/i,
    'ADR DPR ingress must reject non-finite/non-positive dpr',
  );

  // Verify Markdown link destination in docs/design/README.md actually resolves to ADR_PATH
  const designReadme = readFileSync(DESIGN_README_PATH, 'utf8');
  const linkDestinations = [
    ...designReadme.matchAll(/\[[^\]]+\]\(\s*<?([^)#\s>]+)>?(?:#[^)\s]*)?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g),
  ].map((m) => m[1]);
  const designDir = dirname(DESIGN_README_PATH);
  const resolvedTargets = linkDestinations
    .filter((dest) => !/^[a-z]+:\/\//i.test(dest))
    .map((dest) => resolve(designDir, dest));
  assert.equal(
    resolvedTargets.includes(ADR_PATH),
    true,
    'docs/design/README.md must contain a Markdown link whose destination resolves to ADR_PATH',
  );

  // Verify canonical hex test vectors and explicit little-endian serialized byte vector for V1
  const expectedVectors = [
    {
      id: 'V0',
      words: packGpuCell({ glyphKind: 0, glyphPayload: 0, flags: 0x80, opacity: 63 }),
    },
    {
      id: 'V1',
      words: packGpuCell({
        glyphKind: 1,
        glyphPayload: 7,
        fgR: 0xff,
        fgG: 0x80,
        fgB: 0x40,
        fgSet: true,
        bgR: 0x10,
        bgG: 0x20,
        bgB: 0x30,
        bgSet: true,
        flags: 0x01 | (0b01 << 4),
        opacity: 63,
      }),
    },
    {
      id: 'V2',
      words: packGpuCell({
        glyphKind: 2,
        glyphPayload: 42,
        bgR: 0x00,
        bgG: 0x00,
        bgB: 0x00,
        bgSet: true,
        flags: 0,
        opacity: 63,
      }),
    },
    {
      id: 'V3',
      words: packGpuCell({
        glyphKind: 3,
        glyphPayload: 0xff,
        fgR: 0x00,
        fgG: 0xff,
        fgB: 0xaa,
        fgSet: true,
        flags: 0x02 | 0x08,
        opacity: 32,
      }),
    },
    {
      id: 'V4',
      words: packGpuCell({
        glyphKind: 4,
        glyphPayload: 0,
        fgR: 0xff,
        fgG: 0xff,
        fgB: 0xff,
        fgSet: true,
        bgR: 0x22,
        bgG: 0x33,
        bgB: 0x44,
        bgSet: true,
        flags: 0b10 << 4,
        opacity: 63,
      }),
    },
    {
      id: 'V5',
      words: packGpuCell({
        glyphKind: 5,
        glyphPayload: 0x256d - 0x2500,
        fgR: 0xaa,
        fgG: 0x55,
        fgB: 0xcc,
        fgSet: true,
        flags: 0x04 | (0b11 << 4) | 0x40,
        opacity: 63,
      }),
    },
  ];

  for (const vec of expectedVectors) {
    const hexWords = vec.words.map(hex32);
    const pattern = new RegExp(
      String.raw`\|\s*\`${vec.id}\`\s*\|[^\n]*\|\s*\`${hexWords[0]}\`\s*\|\s*\`${hexWords[1]}\`\s*\|\s*\`${hexWords[2]}\`\s*\|\s*\`${hexWords[3]}\`\s*\|`,
    );
    assert.equal(pattern.test(''), false, `Vector regex for ${vec.id} must not be vacuous`);
    assert.equal(
      pattern.test(`| \`${vec.id}\` | bad | \`0xDEADBEEF\` | \`0xDEADBEEF\` | \`0xDEADBEEF\` | \`0xDEADBEEF\` |`),
      false,
      `Vector regex for ${vec.id} must reject corrupted hex words`,
    );
    assert.match(adr, pattern, `ADR vector ${vec.id} must match ${hexWords.join(' ')}`);
  }

  const v1LeBytes = wordsToLeHexBytes(expectedVectors[1].words);
  assert.equal(
    adr.includes(v1LeBytes),
    true,
    `ADR must include complete little-endian 16-byte serialized vector for V1: ${v1LeBytes}`,
  );
});

test('procedural-glyphs.json passes domain bounds, independent pinned Unicode semantics, and targeted 3-pin ADR SHA-256 verification', () => {
  assert.equal(existsSync(TABLE_PATH), true, 'fixtures/bijou-gpu/procedural-glyphs.json must exist');
  const raw = readFileSync(TABLE_PATH, 'utf8');
  const data = require(TABLE_PATH);

  assert.equal(data.schemaVersion, 'bijou-procedural-glyphs/1');
  assert.equal(data.gpuAbiVersion, 'bijou-surface-gpu/1');

  // Box-Drawing U+2500..U+257F verified against independent PINNED_BOX_DRAWING_NAMES
  assert.equal(data.boxDrawing.startCodePoint, 0x2500);
  assert.equal(data.boxDrawing.count, 128);
  assert.equal(data.boxDrawing.entries.length, 128);
  const allowedDash = new Set([0, 2, 3, 4]);
  const seenBoxPacked = new Set();
  for (let i = 0; i < 128; i++) {
    const entry = data.boxDrawing.entries[i];
    const cp = 0x2500 + i;
    const pinnedName = PINNED_BOX_DRAWING_NAMES[cp];
    assert.equal(typeof pinnedName, 'string', `Missing pinned name for 0x${cp.toString(16)}`);
    assert.equal(entry.codePoint, cp, `boxDrawing[${i}] codePoint mismatch`);
    assert.equal(entry.hex, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    assert.equal(entry.char, String.fromCodePoint(cp));
    assert.equal(entry.unicodeName, pinnedName, `boxDrawing ${entry.hex} unicodeName tampered`);
    for (const arm of ['left', 'right', 'up', 'down']) {
      assert.equal(Number.isInteger(entry[arm]) && entry[arm] >= 0 && entry[arm] <= 3, true, `${entry.hex}.${arm} out of [0..3]`);
    }
    assert.equal(allowedDash.has(entry.dash), true, `${entry.hex}.dash invalid: ${entry.dash}`);
    assert.equal(typeof entry.rounded, 'boolean');
    assert.equal(typeof entry.diagSlash, 'boolean');
    assert.equal(typeof entry.diagBackslash, 'boolean');

    const expected = parseExpectedBoxFromUnicodeName(pinnedName);
    assert.deepEqual(
      {
        left: entry.left,
        right: entry.right,
        up: entry.up,
        down: entry.down,
        dash: entry.dash,
        rounded: entry.rounded,
        diagSlash: entry.diagSlash,
        diagBackslash: entry.diagBackslash,
      },
      expected,
      `boxDrawing semantic mismatch for ${entry.hex} (${pinnedName})`,
    );

    const recomputed =
      entry.left |
      (entry.right << 2) |
      (entry.up << 4) |
      (entry.down << 6) |
      (entry.dash << 8) |
      ((entry.rounded ? 1 : 0) << 11) |
      ((entry.diagSlash ? 1 : 0) << 12) |
      ((entry.diagBackslash ? 1 : 0) << 13);
    assert.equal(entry.packedU32, recomputed, `boxDrawing ${entry.hex} packedU32 mismatch`);
    seenBoxPacked.add(entry.packedU32);
  }
  assert.equal(seenBoxPacked.size, 128, 'all 128 Box-Drawing entries must map to distinct packedU32 values');

  // Block Elements U+2580..U+259F verified against independent EXPECTED_BLOCK_SPECS
  assert.equal(data.blockElements.startCodePoint, 0x2580);
  assert.equal(data.blockElements.count, 32);
  assert.equal(data.blockElements.entries.length, 32);
  const kindToCode = { rect: 0, shade: 1, quadrant: 2 };
  const seenBlockPacked = new Set();
  for (let i = 0; i < 32; i++) {
    const entry = data.blockElements.entries[i];
    const cp = 0x2580 + i;
    assert.equal(entry.codePoint, cp, `blockElements[${i}] codePoint mismatch`);
    assert.equal(entry.hex, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    assert.equal(entry.char, String.fromCodePoint(cp));
    const [expectedKind, expectedVal] = EXPECTED_BLOCK_SPECS[cp];
    assert.equal(entry.kind, expectedKind, `${entry.hex} kind mismatch`);

    let payload = 0;
    if (entry.kind === 'rect') {
      assert.deepEqual(entry.rectEighths, expectedVal, `${entry.hex} rectEighths mismatch`);
      const [x0, y0, x1, y1] = entry.rectEighths;
      payload = x0 | (y0 << 4) | (x1 << 8) | (y1 << 12);
    } else if (entry.kind === 'shade') {
      assert.equal(entry.shadeQuarter, expectedVal, `${entry.hex} shadeQuarter mismatch`);
      payload = entry.shadeQuarter;
    } else if (entry.kind === 'quadrant') {
      assert.equal(entry.quadrantMask, expectedVal, `${entry.hex} quadrantMask mismatch`);
      payload = entry.quadrantMask;
    }
    const recomputed = payload | (kindToCode[entry.kind] << 16);
    assert.equal(entry.packedU32, recomputed, `blockElements ${entry.hex} packedU32 mismatch`);
    seenBlockPacked.add(entry.packedU32);
  }
  assert.equal(seenBlockPacked.size, 32, 'all 32 Block Element entries must map to distinct packedU32 values');

  // Braille U+2800..U+28FF dot bit mapping
  assert.equal(data.braille.startCodePoint, 0x2800);
  assert.equal(data.braille.count, 256);
  assert.equal(data.braille.dotBits.length, 8);
  assert.deepEqual(
    data.braille.dotBits.map((d) => [d.bit, d.col, d.row]),
    [
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 2],
      [3, 1, 0],
      [4, 1, 1],
      [5, 1, 2],
      [6, 0, 3],
      [7, 1, 3],
    ],
  );

  // Targeted extraction of the 3 named fixture digest pins in ADR (ignoring unrelated hashes)
  const digest = createHash('sha256').update(raw).digest('hex');
  const adr = readFileSync(ADR_PATH, 'utf8');
  const headerPin = /^\*\*Procedural glyph table\*\*:.*?\(`sha256:\s*([0-9a-f]{64})`\)/m.exec(adr);
  const receiptPin = /"proceduralTableSha256":\s*"([0-9a-f]{64})"/.exec(adr);
  const sec7Block = (adr.split(/^## 7\./m)[1] ?? '').split(/^## /m)[0] ?? '';
  const sec7Pin = /^- \*\*SHA-256\*\*:\s*`([0-9a-f]{64})`/m.exec(sec7Block);
  assert.notEqual(headerPin, null, 'ADR header procedural glyph table SHA-256 pin missing');
  assert.notEqual(receiptPin, null, 'ADR receipt proceduralTableSha256 pin missing');
  assert.notEqual(sec7Pin, null, 'ADR Section 7 procedural glyph table SHA-256 pin missing');
  assert.equal(headerPin[1], digest, 'ADR header SHA-256 pin drift');
  assert.equal(receiptPin[1], digest, 'ADR receipt proceduralTableSha256 pin drift');
  assert.equal(sec7Pin[1], digest, 'ADR Section 7 SHA-256 pin drift');
});

test('zero-float integer geometry passes Box-Drawing, diagonal boundary, Block Elements, Braille (incl 2x5), and curly wave', () => {
  const data = require(TABLE_PATH);
  const sizes = [
    [1, 1],
    [1, 2],
    [2, 4],
    [2, 5],
    [3, 5],
    [4, 8],
    [6, 12],
    [8, 16],
    [9, 18],
    [10, 20],
    [12, 24],
    [15, 1],
    [15, 30],
    [16, 32],
    [25, 50],
    [145, 1],
    [256, 1],
  ];

  // 0. Bunny NUMERIC_CONSTITUTION divRoundEven & lerpU8 ties-to-even + max emoji numerator tests
  assert.equal(divRoundEven(1, 4), 0); // < half
  assert.equal(divRoundEven(3, 4), 1); // > half
  assert.equal(divRoundEven(1, 2), 0); // exact half -> even (0)
  assert.equal(divRoundEven(3, 2), 2); // exact half -> even (2)
  assert.equal(divRoundEven(5, 2), 2); // exact half -> even (2)
  assert.equal(divRoundEven(7, 2), 4); // exact half -> even (4)
  assert.equal(lerpU8(0, 255, 0, 63), 0);
  assert.equal(lerpU8(0, 255, 63, 63), 255);
  assert.equal(lerpU8(10, 11, 1, 2), 10); // 21/2 -> 10 (even)
  assert.equal(lerpU8(11, 12, 1, 2), 12); // 23/2 -> 12 (even)
  assert.equal(divRoundEven(255 * 63 * 255 + 255 * 16065, 16065), 510); // max premul emoji numerator 8,193,150 < 2^31

  // 1. Exhaustive [1..256]^2 Q12 arc u32/i32 overflow proof (R-1)
  for (let W = 1; W <= 256; W++) {
    const lightPx = Math.max(1, Math.floor((W * 10 + 50) / 100));
    const num = u32Check(Math.max(11, 10 * lightPx) * 4096, 'arc halfQ num');
    for (let H = 1; H <= 256; H++) {
      const halfQ = Math.min(8192, Math.floor(num / (10 * Math.min(W, H))));
      const rIn = satSub(4096, halfQ);
      const rOut = 4096 + halfQ;
      assert.equal(rOut * rOut < 0x80000000, true, `Q12 arc rOut^2 exceeded i32 at ${W}x${H}`);
      assert.equal(rIn * rIn < 0x80000000, true, `Q12 arc rIn^2 exceeded i32 at ${W}x${H}`);
    }
  }

  // 2. All 128 Box-Drawing glyphs: pure u32 integer rules never underflow, overflow, or vanish across [1..256]^2 extremes
  for (const [W, H] of sizes) {
    for (const entry of data.boxDrawing.entries) {
      let lit = 0;
      for (let ly = 0; ly < H; ly++) {
        for (let lx = 0; lx < W; lx++) {
          if (evalBoxPixelInt(entry, lx, ly, W, H)) lit++;
        }
      }
      assert.equal(lit > 0, true, `Box ${entry.hex} vanished at ${W}x${H}`);
    }
  }

  // CodeRabbit boundary regression: U+2572 at W=72, H=96, lx=5, ly=1 must be strictly included in pure u32 integer math
  const u2572 = data.boxDrawing.entries[0x2572 - 0x2500];
  assert.equal(evalBoxPixelInt(u2572, 5, 1, 72, 96), true, 'U+2572 boundary (5,1) at 72x96 must be lit');
  assert.equal(evalBoxPixelInt(u2572, 71, 0, 72, 96), false, 'U+2572 far exterior (71,0) at 72x96 must be unlit');
  // Proven u32 ceiling at max cell size 256x256
  const maxLight = Math.max(1, Math.floor((256 * 10 + 50) / 100));
  const maxBound = maxLight * (256 + 256);
  assert.equal(maxBound * maxBound < 0x100000000, true, 'Diagonal bound^2 must stay within u32');
  assert.equal(maxLight * maxLight * (256 * 256 + 256 * 256) < 0x100000000, true, 'Diagonal RHS must stay within u32');

  // 2. Pure-integer decorations across H = 1..60, W = 1..32 (including curly integer triangle wave)
  for (const W of [1, 2, 6, 8, 10, 12, 16, 25]) {
    for (let H = 1; H <= 60; H++) {
      const decoPx = Math.max(1, Math.floor((H * 6 + 50) / 100));
      const ulY0 = Math.min(H - decoPx, Math.floor((H * 88) / 100));
      const strikeY0 = Math.floor((H - decoPx) / 2);
      assert.equal(ulY0 >= 0 && ulY0 + decoPx <= H, true, `underline bounds at H=${H}`);
      assert.equal(strikeY0 >= 0 && strikeY0 + decoPx <= H, true, `strikethrough bounds at H=${H}`);

      const ampPx = H >= 3 ? Math.max(1, Math.floor((H * 3 + 50) / 100)) : 0;
      const baseY = Math.min(H - decoPx, Math.floor((H * 90) / 100));
      for (let lx = 0; lx < W; lx++) {
        const t = ((2 * lx + 1) * 4) % (4 * W);
        const q = Math.floor(t / W);
        const r = t % W;
        const mag = divRoundEven((q === 0 || q === 2 ? r : W - r) * ampPx, W);
        const cy = q < 2 ? Math.min(H - decoPx, baseY + mag) : satSub(baseY, mag);
        let colLit = 0;
        for (let ly = 0; ly < H; ly++) {
          if (ly >= cy && ly < cy + decoPx) colLit++;
        }
        assert.equal(colLit, decoPx, `Curly integer triangle wave dropped column ${lx} at ${W}x${H}`);
      }
    }
  }

  // 3. Section 7.2 Block Elements: pure integer matches whole-cell rational pixel-center intervals
  for (const [W, H] of sizes) {
    for (const entry of data.blockElements.entries) {
      if (entry.kind === 'shade') continue;
      let lit = 0;
      for (let ly = 0; ly < H; ly++) {
        for (let lx = 0; lx < W; lx++) {
          const px2 = 2 * lx + 1;
          const py2 = 2 * ly + 1;
          let intLit;
          let wholeCellLit;
          if (entry.kind === 'rect') {
            const [x0, y0, x1, y1] = entry.rectEighths;
            intLit = px2 * 4 >= x0 * W && px2 * 4 < x1 * W && py2 * 4 >= y0 * H && py2 * 4 < y1 * H;
            // Whole-cell rational check: px2/(2W) in [x0/8, x1/8) <=> 8*px2 in [2*x0*W, 2*x1*W)
            wholeCellLit = 8 * px2 >= 2 * x0 * W && 8 * px2 < 2 * x1 * W && 8 * py2 >= 2 * y0 * H && 8 * py2 < 2 * y1 * H;
          } else {
            const qx = px2 >= W ? 1 : 0;
            const qy = py2 >= H ? 1 : 0;
            intLit = ((entry.quadrantMask >> (qx + 2 * qy)) & 1) !== 0;
            // Direct whole-cell quadrant test against top/bottom and left/right halves
            const isRight = px2 >= W;
            const isBottom = py2 >= H;
            const bit = (!isRight && !isBottom) ? 0 : (isRight && !isBottom) ? 1 : (!isRight && isBottom) ? 2 : 3;
            wholeCellLit = ((entry.quadrantMask >> bit) & 1) !== 0;
          }
          assert.equal(intLit, wholeCellLit, `Block ${entry.hex} mismatch at ${W}x${H} (${lx},${ly})`);
          if (intLit) lit++;
        }
      }
      if (W >= 6 && H >= 12) {
        assert.equal(lit > 0, true, `Block ${entry.hex} vanished at ${W}x${H}`);
      }
    }
  }

  // 4. Section 7.3 Braille: independent whole-cell dot-rectangle oracle + full sweep including [2, 5]
  const adr = readFileSync(ADR_PATH, 'utf8');
  assert.match(adr, /W\s*<\s*4/, 'ADR Section 7.3 must guard sub-cell horizontal margin for W < 4');
  assert.match(adr, /H\s*<\s*8/, 'ADR Section 7.3 must guard sub-cell vertical margin for H < 8 (e.g. 2x5)');

  const brailleSizes = [
    [2, 4],
    [2, 5],
    [2, 6],
    [2, 7],
    [3, 5],
    [4, 8],
    [6, 12],
    [7, 14],
    [8, 16],
    [9, 18],
    [10, 20],
    [12, 24],
    [16, 32],
    [25, 50],
  ];
  for (const [W, H] of brailleSizes) {
    const dotCounts = new Array(8).fill(0);
    for (let ly = 0; ly < H; ly++) {
      for (let lx = 0; lx < W; lx++) {
        // Formula under test (Section 7.3)
        const subCol = Math.floor((2 * lx + 1) / W);
        const subRow = Math.floor((4 * ly + 2) / H);
        const bitIdx = subRow === 3 ? 6 + subCol : subCol * 3 + subRow;
        const subX = 2 * lx + 1 - subCol * W;
        const subY = 4 * ly + 2 - subRow * H;
        const inX = W < 4 || (4 * subX >= W && 4 * subX < 3 * W);
        const inY = H < 8 || (5 * subY >= H && 5 * subY < 4 * H);
        const formulaBit = inX && inY ? bitIdx : -1;

        // Independent whole-cell dot-rectangle oracle driven directly by data.braille.dotBits
        // Pixel center is (u, v) = ((2*lx + 1)/(2*W), (2*ly + 1)/(2*H)).
        // For each dot (col, row):
        //   X rect: W < 4 ? [col/2, (col+1)/2) : [(4*col + 1)/8, (4*col + 3)/8)
        //   Y rect: H < 8 ? [row/4, (row+1)/4) : [(5*row + 1)/20, (5*row + 4)/20)
        const px2 = 2 * lx + 1;
        const py2 = 2 * ly + 1;
        let oracleBit = -1;
        for (const dot of data.braille.dotBits) {
          const hitX =
            W < 4
              ? px2 >= dot.col * W && px2 < (dot.col + 1) * W
              : 4 * px2 >= (4 * dot.col + 1) * W && 4 * px2 < (4 * dot.col + 3) * W;
          const hitY =
            H < 8
              ? 2 * py2 >= dot.row * H && 2 * py2 < (dot.row + 1) * H
              : 10 * py2 >= (5 * dot.row + 1) * H && 10 * py2 < (5 * dot.row + 4) * H;
          if (hitX && hitY) {
            assert.equal(oracleBit, -1, `Overlapping Braille dot rects at ${W}x${H} (${lx},${ly})`);
            oracleBit = dot.bit;
          }
        }

        assert.equal(formulaBit, oracleBit, `Braille whole-cell oracle mismatch at ${W}x${H} (${lx},${ly})`);
        if (formulaBit >= 0) dotCounts[formulaBit]++;
      }
    }
    for (let dot = 0; dot < 8; dot++) {
      assert.equal(dotCounts[dot] > 0, true, `Braille dot ${dot} vanished at ${W}x${H}`);
    }
    if (W % 2 === 0 && H % 4 === 0) {
      assert.equal(new Set(dotCounts).size, 1, `Braille dots asymmetric at ${W}x${H}: ${dotCounts.join(',')}`);
    }
  }
});
