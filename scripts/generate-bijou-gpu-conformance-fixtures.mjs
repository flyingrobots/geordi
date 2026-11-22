// Generates (or, with --check, verifies) the checked-in bijou-surface-gpu/1
// conformance fixtures under fixtures/bijou-gpu/.
//
//   node scripts/generate-bijou-gpu-conformance-fixtures.mjs --write
//   node scripts/generate-bijou-gpu-conformance-fixtures.mjs --check
//
// The packed-bijou-cells/1 frames are authored here from the cell table below.
// The golden digests in the suite manifest come from the CPU reference oracle
// in @flyingrobots/geordi-bijou-gpu, so that package must be built first.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseJsonValue, stringifyCanonicalJson } from '../packages/core/dist/index.js';
import {
  createTestGlyphPack,
  decodeProceduralGlyphTable,
  parsePackedBijouCellsReceipt,
  PROCEDURAL_GLYPH_TABLE_SHA256,
  renderReferenceRgba,
  sha256Hex,
  utf8Bytes,
} from '../packages/bijou-gpu/dist/index.js';

class BijouGpuFixtureUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

class BijouGpuFixtureDriftError extends Error {
  constructor(paths) {
    super(
      `bijou-gpu conformance fixtures are stale: ${paths.join(', ')}. ` +
        'Run: node scripts/generate-bijou-gpu-conformance-fixtures.mjs --write',
    );
    this.name = new.target.name;
    this.paths = paths;
  }
}

const FIXTURE_DIR = resolve(import.meta.dirname, '..', 'fixtures', 'bijou-gpu');

const GRID_COLS = 8;
const DEFAULT_FG = '#E6EDF3';
const DEFAULT_BG = '#0D1117';
// Three extra columns and five extra rows of physical pixels exercise the
// letterboxed remainder, which must emit solid uDefaultBg.
const CANVAS_REMAINDER_X = 3;
const CANVAS_REMAINDER_Y = 5;

const E_ACUTE = 'é';
const PRIVATE_USE = '';
const HEART = '♥';
const WARM = '#FF8040';
const NAVY = '#102030';

const MODIFIER_FLAGS = {
  bold: 0x01,
  dim: 0x02,
  strikethrough: 0x04,
  inverse: 0x08,
  underline: 0x10,
  'curly-underline': 0x20,
  'dotted-underline': 0x30,
  'dashed-underline': 0x30 | 0x40,
};
const FLAG_EMPTY = 0x80;
const FLAG_FG_SET = 0x40;
const FLAG_BG_SET = 0x80;
const SIDE_TABLE_THRESHOLD = 0xf000;

function cell(id, grapheme, options = {}) {
  return {
    id,
    grapheme,
    fg: options.fg ?? null,
    bg: options.bg ?? null,
    modifiers: options.modifiers ?? [],
    opacity: options.opacity ?? 63,
    empty: options.empty ?? false,
  };
}

const styled = (id, modifiers, extra = {}) =>
  cell(id, 'A', { fg: WARM, bg: NAVY, modifiers, ...extra });
const procedural = (id, grapheme) => cell(id, grapheme, { fg: WARM, bg: NAVY });

// Row-major, GRID_COLS cells per row.
const PAINT_CELLS = [
  // Row 0: RE-510 glyphs and colour presence bits.
  cell('glyph-ascii-a', 'A', { fg: WARM, bg: NAVY }),
  cell('glyph-decomposed-e-acute', E_ACUTE, { bg: '#203040' }),
  cell('glyph-private-use-f000', PRIVATE_USE, { fg: '#40C0FF' }),
  cell('glyph-empty', ' ', { opacity: 0, empty: true }),
  cell('color-fg-only', 'A', { fg: '#00FF00' }),
  cell('color-bg-only', ' ', { bg: '#800000' }),
  cell('color-defaults', 'A'),
  cell('glyph-color-heart', HEART, { fg: '#FFFFFF', bg: '#000040' }),
  // Row 1: one modifier each.
  styled('modifier-bold', ['bold']),
  styled('modifier-dim', ['dim']),
  styled('modifier-inverse', ['inverse']),
  styled('modifier-strikethrough', ['strikethrough']),
  styled('underline-solid', ['underline']),
  styled('underline-curly', ['curly-underline']),
  styled('underline-dotted', ['dotted-underline']),
  styled('underline-dashed', ['dashed-underline']),
  // Row 2: opacity and modifier combinations.
  styled('opacity-partial', [], { opacity: 32 }),
  styled('opacity-zero', [], { opacity: 0 }),
  styled('modifier-dim-inverse', ['dim', 'inverse']),
  cell('modifier-inverse-defaults', 'A', { modifiers: ['inverse'] }),
  cell('strikethrough-on-space', ' ', { fg: WARM, bg: NAVY, modifiers: ['strikethrough'] }),
  cell('underline-on-space', ' ', { fg: WARM, bg: NAVY, modifiers: ['underline'] }),
  cell('modifier-bold-e-acute', E_ACUTE, { fg: WARM, bg: NAVY, modifiers: ['bold'] }),
  cell('opacity-partial-full-block', '█', { fg: '#FFFFFF', bg: '#000000', opacity: 32 }),
  // Row 3: box drawing, straight and junctions.
  procedural('box-light-horizontal', '─'),
  procedural('box-light-vertical', '│'),
  procedural('box-light-down-right', '┌'),
  procedural('box-light-cross', '┼'),
  procedural('box-heavy-horizontal', '━'),
  procedural('box-heavy-cross', '╋'),
  procedural('box-double-horizontal', '═'),
  procedural('box-double-cross', '╬'),
  // Row 4: rounded arcs, diagonals, dashes.
  procedural('box-arc-down-right', '╭'),
  procedural('box-arc-down-left', '╮'),
  procedural('box-arc-up-left', '╯'),
  procedural('box-arc-up-right', '╰'),
  procedural('box-diagonal-slash', '╱'),
  procedural('box-diagonal-backslash', '╲'),
  procedural('box-diagonal-cross', '╳'),
  procedural('box-dash-triple-horizontal', '┄'),
  // Row 5: block elements and braille.
  procedural('block-upper-half', '▀'),
  procedural('block-full', '█'),
  procedural('block-shade-light', '░'),
  cell('block-shade-medium', '▒', { fg: '#FFFFFF', bg: '#000000' }),
  procedural('block-shade-dark', '▓'),
  procedural('block-quadrant-diagonal', '▚'),
  procedural('braille-all-dots', '⣿'),
  procedural('braille-dot-1', '⠁'),
  // Row 6: more procedural families.
  procedural('box-dash-quadruple-vertical', '┊'),
  procedural('box-mixed-single-double-cross', '╪'),
  procedural('box-mixed-light-heavy-tee', '┝'),
  procedural('block-left-half', '▌'),
  procedural('block-lower-eighth', '▁'),
  procedural('block-quadrant-lower-right', '▗'),
  procedural('braille-dot-7', '⡀'),
  procedural('braille-checker', '⢕'),
];

// The erase frame keeps exactly this cell and clears every other one.
const RETAINED_CELL_ID = 'glyph-ascii-a';

function parseHex(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

function modifierFlags(modifiers) {
  let flags = 0;
  for (const modifier of modifiers) {
    const flag = MODIFIER_FLAGS[modifier];
    if (flag === undefined) {
      throw new BijouGpuFixtureUsageError(`unknown modifier: ${modifier}`);
    }
    flags |= flag;
  }
  return flags;
}

function buildReceipt(frameId, cells) {
  const heightCells = cells.length / GRID_COLS;
  if (!Number.isInteger(heightCells)) {
    throw new BijouGpuFixtureUsageError('cell table must fill whole rows');
  }
  const sideTable = [];
  const bytes = [];
  for (const spec of cells) {
    let code;
    if (spec.grapheme.length === 1 && spec.grapheme.charCodeAt(0) < SIDE_TABLE_THRESHOLD) {
      code = spec.grapheme.charCodeAt(0);
    } else {
      let index = sideTable.indexOf(spec.grapheme);
      if (index < 0) {
        index = sideTable.push(spec.grapheme) - 1;
      }
      code = SIDE_TABLE_THRESHOLD + index;
    }
    const fg = spec.fg === null ? [0, 0, 0] : parseHex(spec.fg);
    const bg = spec.bg === null ? [0, 0, 0] : parseHex(spec.bg);
    const flags = modifierFlags(spec.modifiers) | (spec.empty ? FLAG_EMPTY : 0);
    const alpha =
      (spec.opacity & 0x3f) |
      (spec.fg === null ? 0 : FLAG_FG_SET) |
      (spec.bg === null ? 0 : FLAG_BG_SET);
    bytes.push(code & 0xff, code >>> 8, ...fg, ...bg, flags, alpha);
  }
  return {
    receiptVersion: 'packed-bijou-cells/1',
    widthCells: GRID_COLS,
    heightCells,
    cellFormatId: 'bijou-packed-cell-u8x10-le/1',
    glyphPolicyId: 'unicode-grapheme-side-table/1',
    bytes,
    sideTable,
    scene: {
      sceneVersion: 'ui-scene-ir/1',
      sceneHash: sha256Hex(utf8Bytes(`geordi-bijou-gpu-conformance-suite/1 ${frameId}`)),
      nodeIds: ['scene.root'],
      cellNodeIds: cells.map(() => 'scene.root'),
    },
    focus: { focusedNodeId: null, focusableNodeIds: [] },
    chroma: {
      colorSpace: 'srgb',
      channelEncoding: 'uint8',
      alphaEncoding: 'uint6',
      terminalDefaultEncoding: 'presence-bits',
    },
  };
}

// Canonical JSON with long integer arrays wrapped ten per line (one packed
// cell per line for `bytes`) instead of one integer per line.
function formatJson(value) {
  const text = stringifyCanonicalJson(value, { space: 2 });
  return (
    text.replace(/\[\n((?:\s+\d+,?\n)+)(\s*)\]/gu, (_match, body, indent) => {
      const numbers = body.match(/\d+/gu) ?? [];
      const lines = [];
      for (let index = 0; index < numbers.length; index += 10) {
        lines.push(`${indent}  ${numbers.slice(index, index + 10).join(', ')}`);
      }
      return `[\n${lines.join(',\n')}\n${indent}]`;
    }) + '\n'
  );
}

function toHexRows(rgba, bytesPerRow) {
  const rows = [];
  for (let offset = 0; offset < rgba.length; offset += bytesPerRow) {
    rows.push(
      Array.from(rgba.subarray(offset, offset + bytesPerRow), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    );
  }
  return rows;
}

function buildFixtures() {
  const pack = createTestGlyphPack();
  const { atlasBitmap } = pack;
  const files = new Map();

  const glyphPackText = formatJson({
    packVersion: pack.packVersion,
    description:
      'Bundled deterministic test glyph pack: explicit rgba8uint atlas texels, one hex string per atlas pixel row. Generated from packages/bijou-gpu/src/test-glyph-pack.ts.',
    cellPx: { width: atlasBitmap.cellPxW, height: atlasBitmap.cellPxH },
    atlasCols: atlasBitmap.atlasCols,
    atlasRows: atlasBitmap.atlasRows,
    atlasRgbaSha256: pack.atlasRgbaSha256,
    fontIdentity: pack.fontIdentity,
    slots: pack.slotMap.entries.map((entry) => ({
      slot: entry.slot,
      grapheme: entry.grapheme,
      bold: entry.bold,
      kind: entry.kind,
    })),
    atlasRgbaHexRows: toHexRows(atlasBitmap.rgba, atlasBitmap.atlasCols * atlasBitmap.cellPxW * 4),
  });
  files.set('test-glyph-pack.json', glyphPackText);

  const eraseCells = PAINT_CELLS.map((spec) =>
    spec.id === RETAINED_CELL_ID ? spec : cell(spec.id, ' ', { opacity: 0, empty: true }),
  );
  const frameSpecs = [
    { id: 'paint', path: 'width1-paint.packed-bijou-cells.json', cells: PAINT_CELLS },
    { id: 'erase', path: 'width1-erase.packed-bijou-cells.json', cells: eraseCells },
  ];

  const procedural = decodeProceduralGlyphTable(
    parseJsonValue(readFileSync(resolve(FIXTURE_DIR, 'procedural-glyphs.json'), 'utf8')),
  );
  const heightCells = PAINT_CELLS.length / GRID_COLS;
  const canvasPxW = GRID_COLS * atlasBitmap.cellPxW + CANVAS_REMAINDER_X;
  const canvasPxH = heightCells * atlasBitmap.cellPxH + CANVAS_REMAINDER_Y;

  const frames = frameSpecs.map((frame) => {
    const text = formatJson(buildReceipt(frame.id, frame.cells));
    files.set(frame.path, text);
    const receipt = parsePackedBijouCellsReceipt(parseJsonValue(text));
    const rendered = renderReferenceRgba(receipt, atlasBitmap, pack.slotMap, procedural, {
      canvasPxW,
      canvasPxH,
      defaultFg: DEFAULT_FG,
      defaultBg: DEFAULT_BG,
    });
    return {
      id: frame.id,
      path: frame.path,
      inputReceiptSha256: sha256Hex(utf8Bytes(text)),
      preparedBufferSha256: rendered.preparedBufferSha256,
      frameRgbaSha256: rendered.frameRgbaSha256,
    };
  });

  // A width-2 CJK ideograph encoded directly in a cell: canonical
  // packed-bijou-cells/1 has no wide-cell representation, so this must be
  // refused loudly rather than split or clipped.
  const negativePath = 'negative-width2.packed-bijou-cells.json';
  const negativeText = formatJson(
    buildReceipt('negative-width2', [
      cell('wide-cjk-direct', '漢', { fg: WARM, bg: NAVY }),
      cell('wide-cjk-trailing-space', ' ', { opacity: 0, empty: true }),
    ].concat(Array.from({ length: GRID_COLS - 2 }, (_unused, index) =>
      cell(`padding-${String(index)}`, ' ', { opacity: 0, empty: true }),
    ))),
  );
  files.set(negativePath, negativeText);

  files.set(
    'width1-conformance-suite.json',
    formatJson({
      suiteVersion: 'geordi-bijou-gpu-conformance-suite/1',
      gpuAbiVersion: 'bijou-surface-gpu/1',
      description:
        'Canonical width-1 packed-bijou-cells/1 conformance suite: a paint frame, an erase frame, and a width-2 negative. inputReceiptSha256 is the SHA-256 of the frame file bytes; the other digests are CPU reference oracle goldens.',
      cellPx: { width: atlasBitmap.cellPxW, height: atlasBitmap.cellPxH },
      canvasPxW,
      canvasPxH,
      defaultFg: DEFAULT_FG,
      defaultBg: DEFAULT_BG,
      glyphPack: { path: 'test-glyph-pack.json', sha256: sha256Hex(utf8Bytes(glyphPackText)) },
      proceduralTable: { path: 'procedural-glyphs.json', sha256: PROCEDURAL_GLYPH_TABLE_SHA256 },
      frames,
      negatives: [
        {
          id: 'width2-direct-cjk',
          path: negativePath,
          sha256: sha256Hex(utf8Bytes(negativeText)),
          expectedErrorCode: 'GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH',
        },
      ],
      retainedCellId: RETAINED_CELL_ID,
      cells: PAINT_CELLS.map((spec, index) => ({
        ...spec,
        col: index % GRID_COLS,
        row: Math.floor(index / GRID_COLS),
      })),
    }),
  );
  return files;
}

function emit(record) {
  process.stdout.write(`${stringifyCanonicalJson({ kind: 'bijou-gpu-fixtures', ...record })}\n`);
}

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
  throw new BijouGpuFixtureUsageError('usage: generate-bijou-gpu-conformance-fixtures.mjs --write|--check');
}

const files = buildFixtures();
const stale = [];
for (const [name, text] of files) {
  const path = resolve(FIXTURE_DIR, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === text) {
    continue;
  }
  if (mode === '--write') {
    writeFileSync(path, text);
    emit({ event: 'wrote', path: `fixtures/bijou-gpu/${name}` });
  } else {
    stale.push(`fixtures/bijou-gpu/${name}`);
  }
}

if (stale.length > 0) {
  throw new BijouGpuFixtureDriftError(stale);
}
emit({ event: 'done', mode: mode.slice(2), fileCount: files.size });
