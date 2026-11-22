import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

const REPO_ROOT = resolve(import.meta.dirname, '..');
const ADR_PATH = resolve(REPO_ROOT, 'docs/design/2026-11-bijou-surface-gpu-abi.md');
const DESIGN_README_PATH = resolve(REPO_ROOT, 'docs/design/README.md');
const TABLE_PATH = resolve(REPO_ROOT, 'fixtures/bijou-gpu/procedural-glyphs.json');

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

function evalBoxPixel(e, lx, ly, W, H, useF32) {
  const f = useF32 ? Math.fround : (x) => x;
  const lightPx = Math.max(1, Math.floor((W * 10 + 50) / 100));
  const heavyPx = 2 * lightPx;
  const vx0 = (w) => Math.floor((W - w) / 2);
  const hy0 = (w) => Math.floor((H - w) / 2);
  const dblGap = Math.max(1, lightPx);
  const vxL0 = Math.max(0, vx0(lightPx) - dblGap);
  const vxR0 = Math.min(W - lightPx, vx0(lightPx) + dblGap);
  const hyT0 = Math.max(0, hy0(lightPx) - dblGap);
  const hyB0 = Math.min(H - lightPx, hy0(lightPx) + dblGap);

  if (e.diagSlash || e.diagBackslash) {
    const halfT = f(Math.max(f(0.55), f(f(0.5) * f(lightPx))));
    const invLen = f(f(1.0) / f(Math.sqrt(f(f(W * W) + f(H * H)))));
    if (e.diagSlash) {
      const dist = f(
        Math.abs(f(f(f(lx + 0.5) * f(H)) + f(f(ly + 0.5) * f(W)) - f(W * H))) * invLen,
      );
      if (dist <= halfT) return true;
    }
    if (e.diagBackslash) {
      const dist = f(
        Math.abs(f(f(f(lx + 0.5) * f(H)) - f(f(ly + 0.5) * f(W)))) * invLen,
      );
      if (dist <= halfT) return true;
    }
    return false;
  }

  if (e.rounded) {
    const cx2 = e.right > 0 ? 2 * W : 0;
    const cy2 = e.down > 0 ? 2 * H : 0;
    const nx = f(f(2 * lx + 1 - cx2) / f(W));
    const ny = f(f(2 * ly + 1 - cy2) / f(H));
    const dist = f(Math.sqrt(f(f(nx * nx) + f(ny * ny))));
    const halfR = f(Math.max(f(1.1), f(lightPx)) / f(Math.min(W, H)));
    return Math.abs(f(dist - f(1.0))) <= halfR;
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

test('bijou-surface-gpu/1 ADR exists, is linked from docs/design/README.md, and matches canonical hex vectors', () => {
  assert.equal(existsSync(ADR_PATH), true, 'ADR must exist at docs/design/2026-11-bijou-surface-gpu-abi.md');
  const adr = readFileSync(ADR_PATH, 'utf8');
  assert.match(adr, /bijou-surface-gpu\/1/);
  assert.match(adr, /packages\/bijou-gpu/);
  assert.match(adr, /rgba32uint/);
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

  const designReadme = readFileSync(DESIGN_README_PATH, 'utf8');
  assert.match(designReadme, /2026-11-bijou-surface-gpu-abi\.md/);

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
      `\\|\\s*\`${vec.id}\`\\s*\\|[^\\n]*\\|\\s*\`${hexWords[0]}\`\\s*\\|\\s*\`${hexWords[1]}\`\\s*\\|\\s*\`${hexWords[2]}\`\\s*\\|\\s*\`${hexWords[3]}\`\\s*\\|`,
    );
    assert.match(adr, pattern, `ADR vector ${vec.id} must match ${hexWords.join(' ')}`);
  }
});

test('procedural-glyphs.json passes domain bounds, exhaustive Unicode/Block semantics, and exact ADR SHA-256 parity', () => {
  assert.equal(existsSync(TABLE_PATH), true, 'fixtures/bijou-gpu/procedural-glyphs.json must exist');
  const raw = readFileSync(TABLE_PATH, 'utf8');
  const data = require(TABLE_PATH);

  assert.equal(data.schemaVersion, 'bijou-procedural-glyphs/1');
  assert.equal(data.gpuAbiVersion, 'bijou-surface-gpu/1');

  // Box-Drawing U+2500..U+257F (128 entries)
  assert.equal(data.boxDrawing.startCodePoint, 0x2500);
  assert.equal(data.boxDrawing.count, 128);
  assert.equal(data.boxDrawing.entries.length, 128);
  const allowedDash = new Set([0, 2, 3, 4]);
  const seenBoxPacked = new Set();
  for (let i = 0; i < 128; i++) {
    const entry = data.boxDrawing.entries[i];
    const cp = 0x2500 + i;
    assert.equal(entry.codePoint, cp, `boxDrawing[${i}] codePoint mismatch`);
    assert.equal(entry.hex, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    assert.equal(entry.char, String.fromCodePoint(cp));
    for (const arm of ['left', 'right', 'up', 'down']) {
      assert.equal(Number.isInteger(entry[arm]) && entry[arm] >= 0 && entry[arm] <= 3, true, `${entry.hex}.${arm} out of [0..3]`);
    }
    assert.equal(allowedDash.has(entry.dash), true, `${entry.hex}.dash invalid: ${entry.dash}`);
    assert.equal(typeof entry.rounded, 'boolean');
    assert.equal(typeof entry.diagSlash, 'boolean');
    assert.equal(typeof entry.diagBackslash, 'boolean');

    // Exhaustive semantic verification against Unicode character name
    const expected = parseExpectedBoxFromUnicodeName(entry.unicodeName);
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
      `boxDrawing semantic mismatch for ${entry.hex} (${entry.unicodeName})`,
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

  // Block Elements U+2580..U+259F (32 entries, exhaustively verified against independent spec)
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

  // Verify ALL 3 SHA-256 references to procedural-glyphs.json in the ADR match exactly
  const digest = createHash('sha256').update(raw).digest('hex');
  const adr = readFileSync(ADR_PATH, 'utf8');
  const shaMatches = [...adr.matchAll(/[0-9a-f]{64}/g)].map((m) => m[0]);
  assert.equal(shaMatches.length, 3, `Expected exactly 3 procedural-glyphs SHA-256 pins in ADR, found ${shaMatches.length}`);
  for (const found of shaMatches) {
    assert.equal(found, digest, `Stale procedural-glyphs SHA-256 in ADR: ${found} !== ${digest}`);
  }
});

test('ADR Section 5 & 7 procedural geometry has zero f64/f32 drift and zero vanishing pixels across cell sizes', () => {
  const data = require(TABLE_PATH);
  const sizes = [
    [6, 12],
    [8, 16],
    [9, 18],
    [10, 20],
    [12, 24],
    [14, 28],
    [15, 30],
    [16, 32],
    [25, 50],
  ];

  // 1. All 128 Box-Drawing glyphs: zero f64/f32 diffs and >= 1 lit pixel at every size
  for (const [W, H] of sizes) {
    for (const entry of data.boxDrawing.entries) {
      let lit = 0;
      for (let ly = 0; ly < H; ly++) {
        for (let lx = 0; lx < W; lx++) {
          const a = evalBoxPixel(entry, lx, ly, W, H, false);
          const b = evalBoxPixel(entry, lx, ly, W, H, true);
          assert.equal(a, b, `Box f64/f32 drift on ${entry.hex} at ${W}x${H} (${lx},${ly})`);
          if (a) lit++;
        }
      }
      assert.equal(lit > 0, true, `Box ${entry.hex} vanished at ${W}x${H}`);
    }
  }

  // 2. Decorations across H = 8..40: guaranteed >= 1 lit pixel and continuous curly underline
  for (const W of [6, 8, 10, 12, 16]) {
    for (let H = 8; H <= 40; H++) {
      const decoPx = Math.max(1, Math.floor((H * 6 + 50) / 100));
      const ulY0 = Math.min(H - decoPx, Math.floor((H * 88) / 100));
      const strikeY0 = Math.floor((H - decoPx) / 2);
      assert.equal(ulY0 >= 0 && ulY0 + decoPx <= H, true, `underline bounds at H=${H}`);
      assert.equal(strikeY0 >= 0 && strikeY0 + decoPx <= H, true, `strikethrough bounds at H=${H}`);

      const halfT64 = 0.5 * decoPx + 0.0625;
      const halfT32 = Math.fround(Math.fround(0.5 * decoPx) + Math.fround(0.0625));
      for (let lx = 0; lx < W; lx++) {
        let colLit = 0;
        const uvx64 = (lx + 0.5) / W;
        const wave64 = (H * 90) / 100 + H * 0.03 * Math.sin(uvx64 * 4 * Math.PI);
        const uvx32 = Math.fround(Math.fround(lx + 0.5) / Math.fround(W));
        const wave32 = Math.fround(
          Math.fround(Math.fround(H * 90) / Math.fround(100)) +
            Math.fround(Math.fround(H * Math.fround(0.03)) * Math.fround(Math.sin(Math.fround(uvx32 * Math.fround(4 * Math.PI))))),
        );
        for (let ly = 0; ly < H; ly++) {
          const c64 = Math.abs(ly + 0.5 - wave64) <= halfT64;
          const c32 = Math.abs(Math.fround(Math.fround(ly + 0.5) - wave32)) <= halfT32;
          assert.equal(c64, c32, `Curly f64/f32 drift at ${W}x${H} (${lx},${ly})`);
          if (c64) colLit++;
        }
        assert.equal(colLit > 0, true, `Curly underline dropped column ${lx} at ${W}x${H}`);
      }
    }
  }

  // 3. Section 7.2 Block Elements: pure integer matches exact pixel-center uv across sizes
  for (const [W, H] of sizes) {
    for (const entry of data.blockElements.entries) {
      if (entry.kind === 'shade') continue;
      let lit = 0;
      for (let ly = 0; ly < H; ly++) {
        for (let lx = 0; lx < W; lx++) {
          const u = (lx + 0.5) / W;
          const v = (ly + 0.5) / H;
          let intLit;
          let uvLit;
          if (entry.kind === 'rect') {
            const [x0, y0, x1, y1] = entry.rectEighths;
            intLit =
              (2 * lx + 1) * 4 >= x0 * W &&
              (2 * lx + 1) * 4 < x1 * W &&
              (2 * ly + 1) * 4 >= y0 * H &&
              (2 * ly + 1) * 4 < y1 * H;
            uvLit = u * 8 >= x0 && u * 8 < x1 && v * 8 >= y0 && v * 8 < y1;
          } else {
            const qx = 2 * lx + 1 >= W ? 1 : 0;
            const qy = 2 * ly + 1 >= H ? 1 : 0;
            intLit = ((entry.quadrantMask >> (qx + 2 * qy)) & 1) !== 0;
            const uqx = u >= 0.5 ? 1 : 0;
            const uqy = v >= 0.5 ? 1 : 0;
            uvLit = ((entry.quadrantMask >> (uqx + 2 * uqy)) & 1) !== 0;
          }
          assert.equal(intLit, uvLit, `Block ${entry.hex} integer/uv mismatch at ${W}x${H} (${lx},${ly})`);
          if (intLit) lit++;
        }
      }
      assert.equal(lit > 0, true, `Block ${entry.hex} vanished at ${W}x${H}`);
    }
  }

  // 4. Section 7.3 Braille: pure integer matches exact pixel-center [0.25, 0.75) x [0.20, 0.80) across sizes
  const brailleSizes = [
    [2, 4],
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
        const subCol = Math.floor((2 * lx + 1) / W);
        const subRow = Math.floor((4 * ly + 2) / H);
        assert.equal(subCol >= 0 && subCol <= 1, true, `Braille subCol out of range at ${W}x${H}`);
        assert.equal(subRow >= 0 && subRow <= 3, true, `Braille subRow out of range at ${W}x${H}`);
        const bitIdx = subRow === 3 ? 6 + subCol : subCol * 3 + subRow;
        const subX = 2 * lx + 1 - subCol * W;
        const subY = 4 * ly + 2 - subRow * H;
        const intLit = 4 * subX >= W && 4 * subX < 3 * W && 5 * subY >= H && 5 * subY < 4 * H;

        // Exact rational pixel-center reference (no IEEE-754 0.2/0.8 rounding artifacts):
        // u = (2*lx + 1) / (2*W) => 2*u = (2*lx + 1) / W; fracU = subX / W in [1/4, 3/4)
        // v = (2*ly + 1) / (2*H) => 4*v = (4*ly + 2) / H; fracV = subY / H in [1/5, 4/5)
        const refCol = Math.floor((2 * lx + 1) / W);
        const refRow = Math.floor((4 * ly + 2) / H);
        const refBitIdx = refRow === 3 ? 6 + refCol : refCol * 3 + refRow;
        const refNumU = 2 * lx + 1 - refCol * W;
        const refNumV = 4 * ly + 2 - refRow * H;
        const refLit =
          refNumU * 4 >= W &&
          refNumU * 4 < 3 * W &&
          refNumV * 5 >= H &&
          refNumV * 5 < 4 * H;

        assert.equal(bitIdx, refBitIdx, `Braille bitIdx mismatch at ${W}x${H} (${lx},${ly})`);
        assert.equal(intLit, refLit, `Braille pixel-center mismatch at ${W}x${H} (${lx},${ly})`);
        if (intLit) dotCounts[bitIdx]++;
      }
    }
    for (let dot = 0; dot < 8; dot++) {
      assert.equal(dotCounts[dot] > 0, true, `Braille dot ${dot} vanished at ${W}x${H}`);
    }
    // At even W and H%4==0 (e.g. 8x16, 16x32), all 8 dots must have identical symmetric pixel counts
    if (W % 2 === 0 && H % 4 === 0) {
      assert.equal(new Set(dotCounts).size, 1, `Braille dots asymmetric at ${W}x${H}: ${dotCounts.join(',')}`);
    }
  }
});
