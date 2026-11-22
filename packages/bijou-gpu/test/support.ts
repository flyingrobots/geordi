import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseJsonValue, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

import {
  createTestGlyphPack,
  decodeProceduralGlyphTable,
  parsePackedBijouCellsReceipt,
  readPixel,
  renderReferenceRgba,
  type PackedBijouCellsReceipt,
  type ProceduralGlyphTable,
  type ReferenceFrame,
  type TestGlyphPack,
} from '../src/index.js';

export class TestFixtureShapeError extends Error {
  constructor(detail: string) {
    super(`Unexpected test fixture shape: ${detail}`);
    this.name = new.target.name;
  }
}

const FIXTURE_ROOT = new URL('../../../fixtures/bijou-gpu/', import.meta.url);

export function fixturePath(name: string): string {
  return fileURLToPath(new URL(name, FIXTURE_ROOT));
}

export function readFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fixturePath(name)));
}

export function readFixtureText(name: string): string {
  return readFileSync(fixturePath(name), 'utf8');
}

export function readFixtureJson(name: string): JsonValue {
  return parseJsonValue(readFixtureText(name));
}

export function nodeSha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function obj(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TestFixtureShapeError(`${label} is not an object`);
  }
  return value as JsonObject;
}

export function arr(value: JsonValue | undefined, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TestFixtureShapeError(`${label} is not an array`);
  }
  return value as readonly JsonValue[];
}

export function str(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string') {
    throw new TestFixtureShapeError(`${label} is not a string`);
  }
  return value;
}

export function int(value: JsonValue | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TestFixtureShapeError(`${label} is not an integer`);
  }
  return value;
}

/** Deep-clone a JSON object into a mutable record for negative-case edits. */
export function mutableClone(value: JsonValue): Record<string, JsonValue> {
  return structuredClone(obj(value, 'clone source')) as Record<string, JsonValue>;
}

export interface SuiteCell {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  readonly grapheme: string;
  readonly fg: string | null;
  readonly bg: string | null;
  readonly modifiers: readonly string[];
  readonly opacity: number;
  readonly empty: boolean;
}

export interface SuiteFrame {
  readonly id: string;
  readonly path: string;
  readonly inputReceiptSha256: string;
  readonly preparedBufferSha256: string;
  readonly frameRgbaSha256: string;
}

export interface Suite {
  readonly cellPxW: number;
  readonly cellPxH: number;
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
  readonly retainedCellId: string;
  readonly frames: readonly SuiteFrame[];
  readonly negativePath: string;
  readonly negativeErrorCode: string;
  readonly cells: readonly SuiteCell[];
}

function nullableStr(value: JsonValue | undefined, label: string): string | null {
  return value === null ? null : str(value, label);
}

export function loadSuite(): Suite {
  const root = obj(readFixtureJson('width1-conformance-suite.json'), 'suite');
  const cellPx = obj(root.cellPx, 'cellPx');
  const negative = obj(arr(root.negatives, 'negatives')[0], 'negatives[0]');
  return {
    cellPxW: int(cellPx.width, 'cellPx.width'),
    cellPxH: int(cellPx.height, 'cellPx.height'),
    canvasPxW: int(root.canvasPxW, 'canvasPxW'),
    canvasPxH: int(root.canvasPxH, 'canvasPxH'),
    defaultFg: str(root.defaultFg, 'defaultFg'),
    defaultBg: str(root.defaultBg, 'defaultBg'),
    retainedCellId: str(root.retainedCellId, 'retainedCellId'),
    negativePath: str(negative.path, 'negative.path'),
    negativeErrorCode: str(negative.expectedErrorCode, 'negative.expectedErrorCode'),
    frames: arr(root.frames, 'frames').map((item) => {
      const frame = obj(item, 'frame');
      return {
        id: str(frame.id, 'frame.id'),
        path: str(frame.path, 'frame.path'),
        inputReceiptSha256: str(frame.inputReceiptSha256, 'frame.inputReceiptSha256'),
        preparedBufferSha256: str(frame.preparedBufferSha256, 'frame.preparedBufferSha256'),
        frameRgbaSha256: str(frame.frameRgbaSha256, 'frame.frameRgbaSha256'),
      };
    }),
    cells: arr(root.cells, 'cells').map((item) => {
      const cell = obj(item, 'cell');
      return {
        id: str(cell.id, 'cell.id'),
        col: int(cell.col, 'cell.col'),
        row: int(cell.row, 'cell.row'),
        grapheme: str(cell.grapheme, 'cell.grapheme'),
        fg: nullableStr(cell.fg, 'cell.fg'),
        bg: nullableStr(cell.bg, 'cell.bg'),
        modifiers: arr(cell.modifiers, 'cell.modifiers').map((m) => str(m, 'modifier')),
        opacity: int(cell.opacity, 'cell.opacity'),
        empty: cell.empty === true,
      };
    }),
  };
}

export function loadProceduralTable(): ProceduralGlyphTable {
  return decodeProceduralGlyphTable(readFixtureJson('procedural-glyphs.json'));
}

export interface RenderedSuite {
  readonly suite: Suite;
  readonly pack: TestGlyphPack;
  readonly table: ProceduralGlyphTable;
  readonly paintReceipt: PackedBijouCellsReceipt;
  readonly eraseReceipt: PackedBijouCellsReceipt;
  readonly paint: ReferenceFrame;
  readonly erase: ReferenceFrame;
}

export function suiteFrame(suite: Suite, id: string): SuiteFrame {
  const frame = suite.frames.find((candidate) => candidate.id === id);
  if (frame === undefined) {
    throw new TestFixtureShapeError(`suite has no frame ${id}`);
  }
  return frame;
}

export function suiteCell(suite: Suite, id: string): SuiteCell {
  const cell = suite.cells.find((candidate) => candidate.id === id);
  if (cell === undefined) {
    throw new TestFixtureShapeError(`suite has no cell ${id}`);
  }
  return cell;
}

/** Render the checked-in paint and erase frames through the reference oracle. */
export function renderSuite(): RenderedSuite {
  const suite = loadSuite();
  const pack = createTestGlyphPack();
  const table = loadProceduralTable();
  const options = {
    canvasPxW: suite.canvasPxW,
    canvasPxH: suite.canvasPxH,
    defaultFg: suite.defaultFg,
    defaultBg: suite.defaultBg,
  };
  const paintReceipt = parsePackedBijouCellsReceipt(readFixtureJson(suiteFrame(suite, 'paint').path));
  const eraseReceipt = parsePackedBijouCellsReceipt(readFixtureJson(suiteFrame(suite, 'erase').path));
  return {
    suite,
    pack,
    table,
    paintReceipt,
    eraseReceipt,
    paint: renderReferenceRgba(paintReceipt, pack.atlasBitmap, pack.slotMap, table, options),
    erase: renderReferenceRgba(eraseReceipt, pack.atlasBitmap, pack.slotMap, table, options),
  };
}

/** RGB of one cell-local pixel of a labelled suite cell. */
export function cellPixel(
  suite: Suite,
  frame: ReferenceFrame,
  cellId: string,
  lx: number,
  ly: number,
): readonly [number, number, number] {
  const cell = suiteCell(suite, cellId);
  const [r, g, b] = readPixel(frame, cell.col * suite.cellPxW + lx, cell.row * suite.cellPxH + ly);
  return [r, g, b];
}

/** Render one cell of a labelled suite cell as a `#`/`.` bitmap of non-background pixels. */
export function cellMask(
  suite: Suite,
  frame: ReferenceFrame,
  cellId: string,
  background: readonly [number, number, number],
): string {
  const rows: string[] = [];
  for (let ly = 0; ly < suite.cellPxH; ly += 1) {
    let line = '';
    for (let lx = 0; lx < suite.cellPxW; lx += 1) {
      const pixel = cellPixel(suite, frame, cellId, lx, ly);
      line += pixel.every((channel, index) => channel === background[index]) ? '.' : '#';
    }
    rows.push(line);
  }
  return rows.join('/');
}
