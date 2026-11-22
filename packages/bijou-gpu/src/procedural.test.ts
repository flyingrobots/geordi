import { describe, expect, it } from 'vitest';

import {
  blockPixelQuarters,
  boxPixelLit,
  braillePixelLit,
  decodeProceduralGlyphTable,
  decorationPixelLit,
  FLAG_DASHED,
  FLAG_STRIKETHROUGH,
  PROCEDURAL_GLYPH_TABLE_SHA256,
  UNDERLINE_CURLY,
  UNDERLINE_DOTDASH,
  UNDERLINE_SOLID,
} from './index.js';
import {
  arr,
  loadProceduralTable,
  mutableClone,
  nodeSha256,
  obj,
  readFixtureBytes,
  readFixtureJson,
} from '../test/support.js';

const table = loadProceduralTable();
const ARC_DOWN_RIGHT = 0x256d;
const ARC_DOWN_LEFT = 0x256e;
const ARC_UP_LEFT = 0x256f;
const ARC_UP_RIGHT = 0x2570;

function boxEntry(codePoint: number): number {
  return table.boxGlyphs[codePoint - 0x2500] ?? 0;
}

function blockEntry(codePoint: number): number {
  return table.blockGlyphs[codePoint - 0x2580] ?? 0;
}

function grid(W: number, H: number, lit: (lx: number, ly: number) => boolean): string {
  const rows: string[] = [];
  for (let ly = 0; ly < H; ly += 1) {
    let line = '';
    for (let lx = 0; lx < W; lx += 1) {
      line += lit(lx, ly) ? '#' : '.';
    }
    rows.push(line);
  }
  return rows.join('/');
}

function boxGrid(codePoint: number, W: number, H: number): string {
  return grid(W, H, (lx, ly) => boxPixelLit(boxEntry(codePoint), lx, ly, W, H));
}

describe('procedural glyph table', () => {
  it('is the table the ABI pins and decodes to 128 box and 32 block words', () => {
    expect(nodeSha256(readFixtureBytes('procedural-glyphs.json'))).toBe(PROCEDURAL_GLYPH_TABLE_SHA256);
    expect(table.boxGlyphs).toHaveLength(128);
    expect(table.blockGlyphs).toHaveLength(32);
    expect(boxEntry(0x2500)).toBe(5);
    expect(boxEntry(ARC_DOWN_RIGHT)).toBe(2116);
    expect(blockEntry(0x2580)).toBe(18_432);
  });

  it('rejects a table whose packed word drifts from its documented fields', () => {
    const drifted = mutableClone(readFixtureJson('procedural-glyphs.json'));
    const box = mutableClone(drifted.boxDrawing ?? null);
    const entries = [...arr(box.entries, 'entries')];
    const first = mutableClone(entries[0] ?? null);
    first.packedU32 = 6;
    entries[0] = first;
    box.entries = entries;
    drifted.boxDrawing = box;
    expect(() => decodeProceduralGlyphTable(drifted)).toThrow(
      /GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE at \$\.boxDrawing\.entries\[0\]\.packedU32/u,
    );
  });

  it('rejects a table with the wrong schema or a truncated section', () => {
    const wrongSchema = mutableClone(readFixtureJson('procedural-glyphs.json'));
    wrongSchema.schemaVersion = 'bijou-procedural-glyphs/2';
    expect(() => decodeProceduralGlyphTable(wrongSchema)).toThrow(/\$\.schemaVersion/u);

    const truncated = mutableClone(readFixtureJson('procedural-glyphs.json'));
    const block = mutableClone(truncated.blockElements ?? null);
    block.entries = arr(obj(block, 'block').entries, 'entries').slice(0, 31);
    truncated.blockElements = block;
    expect(() => decodeProceduralGlyphTable(truncated)).toThrow(/\$\.blockElements\.entries/u);
  });
});

describe('Option E4 inset-corner rounded arcs', () => {
  it('reproduces the 2x2 directional asymmetry: only the down-right arc bypasses Case 1', () => {
    expect(boxGrid(ARC_DOWN_RIGHT, 2, 2)).toBe('##/#.');
    expect(boxGrid(ARC_DOWN_LEFT, 2, 2)).toBe('#./#.');
    expect(boxGrid(ARC_UP_RIGHT, 2, 2)).toBe('##/..');
    expect(boxGrid(ARC_UP_LEFT, 2, 2)).toBe('#./..');
  });

  it('reproduces the ABI small-cell bitmaps', () => {
    expect(boxGrid(ARC_DOWN_RIGHT, 1, 4)).toBe('./#/#/#');
    expect(boxGrid(ARC_DOWN_RIGHT, 3, 3)).toBe('.../.##/.#.');
    expect(boxGrid(ARC_DOWN_RIGHT, 4, 4)).toBe('..../.###/.#../.#..');
    expect(boxGrid(ARC_DOWN_RIGHT, 5, 7)).toBe('...../...../...../...##/..##./..#../..#..');
    expect(boxGrid(ARC_DOWN_LEFT, 5, 7)).toBe('...../...../...../##.../.##../..#../..#..');
    expect(boxGrid(ARC_UP_RIGHT, 5, 7)).toBe('..#../..#../..##./...##/...../...../.....');
    expect(boxGrid(ARC_UP_LEFT, 5, 7)).toBe('..#../..#../.##../##.../...../...../.....');
  });

  it('pins the 2x14, 28x2, and 15x2 regression bitmaps for all four corners', () => {
    expect(boxGrid(ARC_DOWN_RIGHT, 2, 14)).toBe('../../../../../../##/#./#./#./#./#./#./#.');
    expect(boxGrid(ARC_DOWN_LEFT, 2, 14)).toBe('../../../../../../#./#./#./#./#./#./#./#.');
    expect(boxGrid(ARC_UP_LEFT, 2, 14)).toBe('#./#./#./#./#./#./#./../../../../../../..');
    expect(boxGrid(ARC_UP_RIGHT, 2, 14)).toBe('#./#./#./#./#./#./##/../../../../../../..');

    expect(boxGrid(ARC_DOWN_RIGHT, 28, 2)).toBe(
      '.............###############/............###............#',
    );
    expect(boxGrid(ARC_DOWN_LEFT, 28, 2)).toBe(
      '##############............../#...........###.............',
    );
    expect(boxGrid(ARC_UP_LEFT, 28, 2)).toBe(
      '#...........###............./##############..............',
    );
    expect(boxGrid(ARC_UP_RIGHT, 28, 2)).toBe(
      '............###............#/.............###############',
    );

    expect(boxGrid(ARC_DOWN_RIGHT, 15, 2)).toBe('......#########/......##......#');
    expect(boxGrid(ARC_DOWN_LEFT, 15, 2)).toBe('########......./#.....##.......');
    expect(boxGrid(ARC_UP_LEFT, 15, 2)).toBe('#.....##......./########.......');
    expect(boxGrid(ARC_UP_RIGHT, 15, 2)).toBe('......##......#/......#########');
  });

  it('holds stroke mask <= edge mask <= sharp-corner edge mask, stays connected, and never vanishes', () => {
    const sizes: (readonly [number, number])[] = [
      [2, 14],
      [28, 2],
      [15, 2],
      [2, 2],
      [8, 16],
      [16, 32],
      [256, 256],
      [1, 256],
      [256, 1],
    ];
    for (let W = 1; W <= 20; W += 1) {
      for (let H = 1; H <= 20; H += 1) {
        sizes.push([W, H]);
      }
    }
    const corners = [
      { arc: ARC_DOWN_RIGHT, hasRight: true, hasDown: true },
      { arc: ARC_DOWN_LEFT, hasRight: false, hasDown: true },
      { arc: ARC_UP_LEFT, hasRight: false, hasDown: false },
      { arc: ARC_UP_RIGHT, hasRight: true, hasDown: false },
    ];
    for (const [W, H] of sizes) {
      const lightPx = Math.max(1, Math.floor((W * 10 + 50) / 100));
      const vx0 = Math.floor(Math.max(0, W - lightPx) / 2);
      const vx1 = Math.min(W, vx0 + lightPx);
      const hy0 = Math.floor(Math.max(0, H - lightPx) / 2);
      const hy1 = Math.min(H, hy0 + lightPx);
      for (const { arc, hasRight, hasDown } of corners) {
        const label = `U+${arc.toString(16)} ${String(W)}x${String(H)}`;
        const lit = new Set<number>();
        for (let ly = 0; ly < H; ly += 1) {
          for (let lx = 0; lx < W; lx += 1) {
            if (boxPixelLit(boxEntry(arc), lx, ly, W, H)) {
              lit.add(ly * W + lx);
            }
          }
        }
        expect(lit.size, `${label} vanished`).toBeGreaterThan(0);

        const seed = Math.min(...lit);
        const visited = new Set<number>([seed]);
        const queue = [seed];
        while (queue.length > 0) {
          const key = queue.pop() ?? 0;
          const cx = key % W;
          const cy = Math.floor(key / W);
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
                continue;
              }
              const next = ny * W + nx;
              if (lit.has(next) && !visited.has(next)) {
                visited.add(next);
                queue.push(next);
              }
            }
          }
        }
        expect(visited.size, `${label} disconnected`).toBe(lit.size);

        const edgeX = hasRight ? W - 1 : 0;
        const edgeY = hasDown ? H - 1 : 0;
        const sharp = (lx: number, ly: number): boolean =>
          (ly >= hy0 && ly < hy1 && (hasRight ? lx >= vx0 : lx < vx1)) ||
          (lx >= vx0 && lx < vx1 && (hasDown ? ly >= hy0 : ly < hy1));
        const violations: string[] = [];
        for (let ly = 0; ly < H; ly += 1) {
          const inEdge = lit.has(ly * W + edgeX);
          if (ly >= hy0 && ly < hy1 && !inEdge) {
            violations.push(`stroke<=edge x-edge y=${String(ly)}`);
          }
          if (inEdge && !sharp(edgeX, ly)) {
            violations.push(`edge<=sharp x-edge y=${String(ly)}`);
          }
        }
        for (let lx = 0; lx < W; lx += 1) {
          const inEdge = lit.has(edgeY * W + lx);
          if (lx >= vx0 && lx < vx1 && !inEdge) {
            violations.push(`stroke<=edge y-edge x=${String(lx)}`);
          }
          if (inEdge && !sharp(lx, edgeY)) {
            violations.push(`edge<=sharp y-edge x=${String(lx)}`);
          }
        }
        expect(violations, label).toEqual([]);
      }
    }
  });
});

describe('box drawing, block elements, braille, and decorations at 8x16', () => {
  it('draws light, heavy, double, dashed, and diagonal box strokes', () => {
    const row = (codePoint: number, ly: number): string =>
      grid(8, 1, (lx) => boxPixelLit(boxEntry(codePoint), lx, ly, 8, 16));
    expect(row(0x2500, 7)).toBe('########');
    expect(row(0x2500, 6)).toBe('........');
    expect(row(0x2502, 0)).toBe('...#....');
    expect([6, 7, 8, 9].map((ly) => row(0x2501, ly))).toEqual([
      '........',
      '########',
      '########',
      '........',
    ]);
    expect([5, 6, 7, 8, 9].map((ly) => row(0x2550, ly))).toEqual([
      '........',
      '########',
      '........',
      '########',
      '........',
    ]);
    expect(row(0x2504, 7)).toBe('##.#..#.');
    expect([5, 6, 7, 8, 9].map((ly) => row(0x256c, ly))).toEqual([
      '..#.#...',
      '###.####',
      '........',
      '###.####',
      '..#.#...',
    ]);
    expect(boxGrid(0x2571, 8, 16)).toBe(
      '.......#/.......#/......#./......#./.....#../.....#../....#.../....#.../...#..../...#..../..#...../..#...../.#....../.#....../#......./#.......',
    );
    expect(boxGrid(0x2573, 4, 4)).toBe('#..#/.##./.##./#..#');
  });

  it('classifies block rects, shades, and quadrants by pixel centre', () => {
    const quarters = (codePoint: number, lx: number, ly: number): number =>
      blockPixelQuarters(blockEntry(codePoint), lx, ly, 8, 16);
    expect([quarters(0x2580, 0, 7), quarters(0x2580, 0, 8)]).toEqual([4, 0]);
    expect([quarters(0x258c, 3, 0), quarters(0x258c, 4, 0)]).toEqual([4, 0]);
    expect([quarters(0x2581, 0, 13), quarters(0x2581, 0, 14)]).toEqual([0, 4]);
    expect([0x2591, 0x2592, 0x2593].map((cp) => quarters(cp, 5, 9))).toEqual([1, 2, 3]);
    expect([quarters(0x259a, 0, 0), quarters(0x259a, 7, 0), quarters(0x259a, 0, 15), quarters(0x259a, 7, 15)]).toEqual([4, 0, 0, 4]);
  });

  it('lights braille dots inside each sub-cell and keeps every dot visible at 2x5', () => {
    expect(grid(8, 4, (lx, ly) => braillePixelLit(0xff, lx, ly, 8, 16))).toBe(
      '......../.##..##./.##..##./........',
    );
    expect(grid(8, 16, (lx, ly) => braillePixelLit(0x01, lx, ly, 8, 16))).toBe(
      `......../.##...../.##...../${Array.from({ length: 13 }, () => '........').join('/')}`,
    );
    for (let bit = 0; bit < 8; bit += 1) {
      let count = 0;
      for (let ly = 0; ly < 5; ly += 1) {
        for (let lx = 0; lx < 2; lx += 1) {
          count += braillePixelLit(1 << bit, lx, ly, 2, 5) ? 1 : 0;
        }
      }
      expect(count, `dot bit ${String(bit)} at 2x5`).toBeGreaterThan(0);
    }
  });

  it('places solid, dotted, dashed, and strikethrough decorations on their integer rows', () => {
    const row = (flags: number, ly: number): string =>
      grid(8, 1, (lx) => decorationPixelLit(flags, lx, ly, 8, 16));
    expect([13, 14, 15].map((ly) => row(UNDERLINE_SOLID, ly))).toEqual([
      '........',
      '########',
      '........',
    ]);
    expect(row(UNDERLINE_DOTDASH, 14)).toBe('#.#.#.#.');
    expect(row(UNDERLINE_DOTDASH | FLAG_DASHED, 14)).toBe('###.###.');
    expect([6, 7, 8].map((ly) => row(FLAG_STRIKETHROUGH, ly))).toEqual([
      '........',
      '########',
      '........',
    ]);
    expect(row(0, 14)).toBe('........');
  });

  it('traces the two-cycle curly underline triangle wave at 16x32', () => {
    const top = (lx: number): number => {
      for (let ly = 0; ly < 32; ly += 1) {
        if (decorationPixelLit(UNDERLINE_CURLY, lx, ly, 16, 32)) {
          return ly;
        }
      }
      return -1;
    };
    const cycle = [28, 29, 29, 28, 28, 27, 27, 28];
    expect(Array.from({ length: 16 }, (_unused, lx) => top(lx))).toEqual([...cycle, ...cycle]);
    // Each lit column is exactly decoPx = 2 pixels tall.
    for (let lx = 0; lx < 16; lx += 1) {
      let count = 0;
      for (let ly = 0; ly < 32; ly += 1) {
        count += decorationPixelLit(UNDERLINE_CURLY, lx, ly, 16, 32) ? 1 : 0;
      }
      expect(count).toBe(2);
    }
  });

  it('never lets a decoration vanish for any valid cell size', () => {
    for (const [W, H] of [
      [1, 1],
      [1, 2],
      [2, 3],
      [256, 256],
      [7, 13],
    ] as const) {
      for (const flags of [UNDERLINE_SOLID, UNDERLINE_CURLY, FLAG_STRIKETHROUGH]) {
        for (let lx = 0; lx < W; lx += 1) {
          let count = 0;
          for (let ly = 0; ly < H; ly += 1) {
            count += decorationPixelLit(flags, lx, ly, W, H) ? 1 : 0;
          }
          expect(count, `${String(W)}x${String(H)} flags ${String(flags)}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
