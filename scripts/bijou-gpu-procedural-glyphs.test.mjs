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
  assert.match(adr, /geordi-bijou-gpu-receipt\/1/);
  assert.match(adr, /fixtures\/bijou-gpu\/procedural-glyphs\.json/);

  const designReadme = readFileSync(DESIGN_README_PATH, 'utf8');
  assert.match(designReadme, /2026-11-bijou-surface-gpu-abi\.md/);

  // Verify every canonical hex test vector in the ADR matches the exact bit-packing specification
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

test('procedural-glyphs.json covers all 128 Box-Drawing, 32 Block Elements, and 8 Braille dots', () => {
  assert.equal(existsSync(TABLE_PATH), true, 'fixtures/bijou-gpu/procedural-glyphs.json must exist');
  const raw = readFileSync(TABLE_PATH, 'utf8');
  const data = require(TABLE_PATH);

  assert.equal(data.schemaVersion, 'bijou-procedural-glyphs/1');
  assert.equal(data.gpuAbiVersion, 'bijou-surface-gpu/1');

  // Box-Drawing U+2500..U+257F (128 entries)
  assert.equal(data.boxDrawing.startCodePoint, 0x2500);
  assert.equal(data.boxDrawing.count, 128);
  assert.equal(data.boxDrawing.entries.length, 128);
  const seenBoxPacked = new Set();
  for (let i = 0; i < 128; i++) {
    const entry = data.boxDrawing.entries[i];
    const cp = 0x2500 + i;
    assert.equal(entry.codePoint, cp, `boxDrawing[${i}] codePoint mismatch`);
    assert.equal(entry.hex, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    assert.equal(entry.char, String.fromCodePoint(cp));
    assert.equal(Number.isInteger(entry.packedU32), true);
    assert.equal(entry.packedU32 >= 0 && entry.packedU32 <= 0x3fff, true, `boxDrawing[${i}] packedU32 out of 14-bit range`);
    seenBoxPacked.add(entry.packedU32);

    const recomputed =
      (entry.left & 0x3) |
      ((entry.right & 0x3) << 2) |
      ((entry.up & 0x3) << 4) |
      ((entry.down & 0x3) << 6) |
      ((entry.dash & 0x7) << 8) |
      ((entry.rounded ? 1 : 0) << 11) |
      ((entry.diagSlash ? 1 : 0) << 12) |
      ((entry.diagBackslash ? 1 : 0) << 13);
    assert.equal(entry.packedU32, recomputed, `boxDrawing ${entry.hex} packedU32 mismatch`);
  }
  assert.equal(seenBoxPacked.size, 128, 'all 128 Box-Drawing entries must map to distinct packedU32 values');

  const byBoxHex = new Map(data.boxDrawing.entries.map((e) => [e.hex, e]));
  assert.deepEqual(
    {
      l: byBoxHex.get('U+2500').left,
      r: byBoxHex.get('U+2500').right,
      u: byBoxHex.get('U+2500').up,
      d: byBoxHex.get('U+2500').down,
    },
    { l: 1, r: 1, u: 0, d: 0 },
  );
  assert.equal(byBoxHex.get('U+256D').rounded, true);
  assert.equal(byBoxHex.get('U+2571').diagSlash, true);
  assert.equal(byBoxHex.get('U+2572').diagBackslash, true);
  assert.equal(byBoxHex.get('U+2573').diagSlash && byBoxHex.get('U+2573').diagBackslash, true);

  // Block Elements U+2580..U+259F (32 entries)
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
    assert.equal(entry.kind in kindToCode, true);

    let payload = 0;
    if (entry.kind === 'rect') {
      const [x0, y0, x1, y1] = entry.rectEighths;
      assert.equal(x0 >= 0 && x0 < x1 && x1 <= 8, true, `${entry.hex} invalid X eighths`);
      assert.equal(y0 >= 0 && y0 < y1 && y1 <= 8, true, `${entry.hex} invalid Y eighths`);
      payload = x0 | (y0 << 4) | (x1 << 8) | (y1 << 12);
    } else if (entry.kind === 'shade') {
      assert.equal(entry.shadeQuarter >= 1 && entry.shadeQuarter <= 3, true);
      payload = entry.shadeQuarter;
    } else if (entry.kind === 'quadrant') {
      assert.equal(entry.quadrantMask >= 1 && entry.quadrantMask <= 15, true);
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

  // Verify ADR records the exact SHA-256 of procedural-glyphs.json
  const digest = createHash('sha256').update(raw).digest('hex');
  const adr = readFileSync(ADR_PATH, 'utf8');
  assert.equal(adr.includes(digest), true, `ADR must pin procedural-glyphs.json sha256=${digest}`);
});
