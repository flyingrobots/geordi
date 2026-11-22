import { stringifyCanonicalJson, type JsonObject, type JsonValue } from '@flyingrobots/geordi-core';

import {
  EndpointReceiptValidationError,
  FrameHashMismatchError,
  GPU_BACKENDS,
  type EndpointReceiptIssue,
  type GpuBackend,
} from './errors.js';
import { isJsonArray, isJsonObject } from './json-decode.js';
import { PACKED_BIJOU_CELL_FORMAT } from './packed-cells.js';
import { BIJOU_SURFACE_GPU_ABI, PROCEDURAL_GLYPH_TABLE_SHA256 } from './procedural-table.js';
import { isSha256Hex, sha256Hex, utf8Bytes } from './sha256.js';

export const ENDPOINT_RECEIPT_VERSION = 'geordi-bijou-gpu-receipt/1';
export const PROBE_POLICY = 'integer-canonical-exact';

/**
 * The five evidence levels of the 4-layer conformance taxonomy. They are
 * distinct and downstream gates must never conflate them.
 */
export const EVIDENCE_LEVELS = [
  'shader-validated',
  'unit-upload',
  'capability-refused',
  'software-probed',
  'gpu-probed',
] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/** Evidence levels whose receipts carry rendered pixels. */
export const PROBED_EVIDENCE_LEVELS: readonly EvidenceLevel[] = ['software-probed', 'gpu-probed'];

export interface BunnyPrimitivePin {
  readonly contractId: string;
  readonly bunnyCommit: string;
  readonly wgslSha256: string;
  readonly vectorsSha256: string;
}

/** The pinned `flyingrobots/bunny` primitive artifacts of `bijou-surface-gpu/1`. */
export const BUNNY_PRIMITIVE_PINS: readonly BunnyPrimitivePin[] = [
  {
    contractId: 'bunny-u32-div-round-even/1',
    bunnyCommit: '3b7fbad',
    wgslSha256: 'ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f',
    vectorsSha256: 'df265cc7233772e33347b04fa1f7a3e71f34566e4aa6af5cf3fecf23e2b044a6',
  },
  {
    contractId: 'bunny-u32-ellipse-classify/1',
    bunnyCommit: '292a2c3',
    wgslSha256: '1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99',
    vectorsSha256: '5f0ec6422de185e2ce7e832a7c1bce7ccde9b6f33e92b399f7c547191ef205e4',
  },
];

export interface EndpointReceiptAdapter {
  readonly backend: GpuBackend;
  readonly name: string;
  readonly driver: string;
}

export interface EndpointReceiptAtlasStats {
  readonly usedSlots: number;
  readonly capacity: number;
  readonly monoCount: number;
  readonly colorEmojiCount: number;
}

export interface EndpointReceiptProbe {
  readonly px: number;
  readonly py: number;
  readonly rgba: readonly [number, number, number, number];
}

/** A validated `geordi-bijou-gpu-receipt/1` endpoint receipt. */
export interface EndpointReceipt {
  readonly receiptVersion: typeof ENDPOINT_RECEIPT_VERSION;
  readonly gpuAbiVersion: typeof BIJOU_SURFACE_GPU_ABI;
  readonly cellFormatId: typeof PACKED_BIJOU_CELL_FORMAT;
  readonly inputReceiptSha256: string;
  readonly preparedBufferSha256: string;
  readonly proceduralTableSha256: string;
  readonly bunnyPrimitives: readonly BunnyPrimitivePin[];
  readonly assembledWgslSha256: string | null;
  readonly generatedGlslSha256: string | null;
  readonly shaderSha256: string | null;
  readonly executedArtifactSha256: string;
  readonly backendProfile: string;
  readonly adapter: EndpointReceiptAdapter;
  readonly evidenceLevel: EvidenceLevel;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly cellPx: { readonly width: number; readonly height: number };
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly dpr: number;
  readonly defaultFg: string;
  readonly defaultBg: string;
  readonly fontIdentity: string;
  readonly atlasGeneration: number;
  readonly atlasStats: EndpointReceiptAtlasStats;
  readonly frameRgbaSha256: string | null;
  readonly probePolicy: typeof PROBE_POLICY;
  readonly probes: readonly EndpointReceiptProbe[];
}

export type EndpointReceiptValidation =
  | { readonly ok: true; readonly receipt: EndpointReceipt }
  | { readonly ok: false; readonly issues: readonly EndpointReceiptIssue[] };

const RECEIPT_FIELDS = [
  'receiptVersion',
  'gpuAbiVersion',
  'cellFormatId',
  'inputReceiptSha256',
  'preparedBufferSha256',
  'proceduralTableSha256',
  'bunnyPrimitives',
  'assembledWgslSha256',
  'generatedGlslSha256',
  'shaderSha256',
  'executedArtifactSha256',
  'backendProfile',
  'adapter',
  'evidenceLevel',
  'widthCells',
  'heightCells',
  'cellPx',
  'canvasPxW',
  'canvasPxH',
  'dpr',
  'defaultFg',
  'defaultBg',
  'fontIdentity',
  'atlasGeneration',
  'atlasStats',
  'frameRgbaSha256',
  'probePolicy',
  'probes',
] as const;

const BACKEND_PROFILE_PATTERN = /^geordi-[a-z0-9]+(?:-[a-z0-9]+)*\/[1-9][0-9]*$/u;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/u;
const MAX_CANVAS_PX = 0xffff;

class IssueCollector {
  public readonly issues: EndpointReceiptIssue[] = [];

  add(path: string, detail: string): void {
    this.issues.push({ path, detail });
  }

  exactFields(value: JsonObject, path: string, fields: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!fields.includes(key)) {
        this.add(`${path}.${key}`, 'unknown field');
      }
    }
    for (const field of fields) {
      if (value[field] === undefined) {
        this.add(`${path}.${field}`, 'missing required field');
      }
    }
  }

  sha(value: JsonValue | undefined, path: string): string | null {
    if (typeof value === 'string' && isSha256Hex(value)) {
      return value;
    }
    if (value !== undefined) {
      this.add(path, 'expected a lowercase 64-hex SHA-256 digest');
    }
    return null;
  }

  nullableSha(value: JsonValue | undefined, path: string): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return this.sha(value, path);
  }

  integer(value: JsonValue | undefined, path: string, min: number, max: number): number | null {
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      !Object.is(value, -0) &&
      value >= min &&
      value <= max
    ) {
      return value;
    }
    if (value !== undefined) {
      this.add(path, `expected an integer in ${String(min)}..${String(max)}`);
    }
    return null;
  }

  literal(value: JsonValue | undefined, expected: string, path: string): void {
    if (value !== undefined && value !== expected) {
      this.add(path, `expected "${expected}"`);
    }
  }
}

function isGpuBackend(value: JsonValue | undefined): value is GpuBackend {
  return typeof value === 'string' && GPU_BACKENDS.some((backend) => backend === value);
}

function isEvidenceLevel(value: JsonValue | undefined): value is EvidenceLevel {
  return typeof value === 'string' && EVIDENCE_LEVELS.some((level) => level === value);
}

/**
 * Deterministically validate a `geordi-bijou-gpu-receipt/1` document.
 *
 * Issues are reported in schema field order, so the same input always yields
 * the same issue list. Validation never throws.
 */
export function validateEndpointReceipt(input: JsonValue): EndpointReceiptValidation {
  const c = new IssueCollector();
  if (!isJsonObject(input)) {
    return { ok: false, issues: [{ path: '$', detail: 'expected an object' }] };
  }
  c.exactFields(input, '$', RECEIPT_FIELDS);

  c.literal(input.receiptVersion, ENDPOINT_RECEIPT_VERSION, '$.receiptVersion');
  c.literal(input.gpuAbiVersion, BIJOU_SURFACE_GPU_ABI, '$.gpuAbiVersion');
  c.literal(input.cellFormatId, PACKED_BIJOU_CELL_FORMAT, '$.cellFormatId');
  const inputReceiptSha256 = c.sha(input.inputReceiptSha256, '$.inputReceiptSha256');
  const preparedBufferSha256 = c.sha(input.preparedBufferSha256, '$.preparedBufferSha256');
  c.literal(input.proceduralTableSha256, PROCEDURAL_GLYPH_TABLE_SHA256, '$.proceduralTableSha256');
  validateBunnyPrimitives(c, input.bunnyPrimitives);

  const assembledWgslSha256 = c.nullableSha(input.assembledWgslSha256, '$.assembledWgslSha256');
  const generatedGlslSha256 = c.nullableSha(input.generatedGlslSha256, '$.generatedGlslSha256');
  const shaderSha256 = c.nullableSha(input.shaderSha256, '$.shaderSha256');
  let executedArtifactSha256: string | null = null;
  if (input.executedArtifactSha256 === null) {
    c.add('$.executedArtifactSha256', 'the executed artifact digest is required for every backend');
  } else {
    executedArtifactSha256 = c.sha(input.executedArtifactSha256, '$.executedArtifactSha256');
  }

  const backendProfile = input.backendProfile;
  if (
    backendProfile !== undefined &&
    (typeof backendProfile !== 'string' || !BACKEND_PROFILE_PATTERN.test(backendProfile))
  ) {
    c.add('$.backendProfile', 'expected a profile id such as "geordi-webgl2/1"');
  }

  const adapter = validateAdapter(c, input.adapter);
  const evidenceLevelInput = input.evidenceLevel;
  const evidenceLevel = isEvidenceLevel(evidenceLevelInput) ? evidenceLevelInput : null;
  if (evidenceLevelInput !== undefined && evidenceLevel === null) {
    c.add('$.evidenceLevel', `expected one of ${EVIDENCE_LEVELS.join(', ')}`);
  }

  if (adapter !== null) {
    validateShaderIdentity(c, adapter.backend, {
      assembledWgslSha256,
      generatedGlslSha256,
      shaderSha256,
    });
    if (
      evidenceLevel !== null &&
      PROBED_EVIDENCE_LEVELS.includes(evidenceLevel) &&
      adapter.name.length === 0
    ) {
      c.add('$.adapter.name', `${evidenceLevel} evidence must name the adapter that executed`);
    }
  }

  const widthCells = c.integer(input.widthCells, '$.widthCells', 0, MAX_CANVAS_PX);
  const heightCells = c.integer(input.heightCells, '$.heightCells', 0, MAX_CANVAS_PX);
  const cellPx = validateCellPx(c, input.cellPx);
  const canvasPxW = c.integer(input.canvasPxW, '$.canvasPxW', 1, MAX_CANVAS_PX);
  const canvasPxH = c.integer(input.canvasPxH, '$.canvasPxH', 1, MAX_CANVAS_PX);
  if (cellPx !== null) {
    if (widthCells !== null && canvasPxW !== null && canvasPxW < widthCells * cellPx.width) {
      c.add('$.canvasPxW', 'must be at least widthCells * cellPx.width');
    }
    if (heightCells !== null && canvasPxH !== null && canvasPxH < heightCells * cellPx.height) {
      c.add('$.canvasPxH', 'must be at least heightCells * cellPx.height');
    }
  }

  const dpr = input.dpr;
  if (dpr !== undefined && (typeof dpr !== 'number' || !Number.isFinite(dpr) || dpr <= 0)) {
    c.add('$.dpr', 'expected a finite positive number');
  }
  for (const field of ['defaultFg', 'defaultBg'] as const) {
    const value = input[field];
    if (value !== undefined && (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value))) {
      c.add(`$.${field}`, 'expected a canonical uppercase #RRGGBB colour');
    }
  }
  const fontIdentity = input.fontIdentity;
  if (fontIdentity !== undefined && (typeof fontIdentity !== 'string' || fontIdentity.length === 0)) {
    c.add('$.fontIdentity', 'expected a non-empty font identity');
  }
  const atlasGeneration = c.integer(input.atlasGeneration, '$.atlasGeneration', 0, 0xffffffff);
  const atlasStats = validateAtlasStats(c, input.atlasStats);

  const frameInput = input.frameRgbaSha256;
  const frameRgbaSha256 = c.nullableSha(frameInput, '$.frameRgbaSha256');
  c.literal(input.probePolicy, PROBE_POLICY, '$.probePolicy');
  const probes = validateProbes(c, input.probes, canvasPxW, canvasPxH);

  if (evidenceLevel !== null && frameInput !== undefined && probes !== null) {
    validateEvidence(c, evidenceLevel, frameRgbaSha256, probes.length);
  }

  if (
    c.issues.length > 0 ||
    inputReceiptSha256 === null ||
    preparedBufferSha256 === null ||
    executedArtifactSha256 === null ||
    typeof backendProfile !== 'string' ||
    adapter === null ||
    evidenceLevel === null ||
    widthCells === null ||
    heightCells === null ||
    cellPx === null ||
    canvasPxW === null ||
    canvasPxH === null ||
    typeof dpr !== 'number' ||
    typeof input.defaultFg !== 'string' ||
    typeof input.defaultBg !== 'string' ||
    typeof fontIdentity !== 'string' ||
    atlasGeneration === null ||
    atlasStats === null ||
    probes === null
  ) {
    return { ok: false, issues: c.issues };
  }

  return {
    ok: true,
    receipt: {
      receiptVersion: ENDPOINT_RECEIPT_VERSION,
      gpuAbiVersion: BIJOU_SURFACE_GPU_ABI,
      cellFormatId: PACKED_BIJOU_CELL_FORMAT,
      inputReceiptSha256,
      preparedBufferSha256,
      proceduralTableSha256: PROCEDURAL_GLYPH_TABLE_SHA256,
      bunnyPrimitives: BUNNY_PRIMITIVE_PINS,
      assembledWgslSha256,
      generatedGlslSha256,
      shaderSha256,
      executedArtifactSha256,
      backendProfile,
      adapter,
      evidenceLevel,
      widthCells,
      heightCells,
      cellPx,
      canvasPxW,
      canvasPxH,
      dpr,
      defaultFg: input.defaultFg,
      defaultBg: input.defaultBg,
      fontIdentity,
      atlasGeneration,
      atlasStats,
      frameRgbaSha256,
      probePolicy: PROBE_POLICY,
      probes,
    },
  };
}

function validateBunnyPrimitives(c: IssueCollector, input: JsonValue | undefined): void {
  if (input === undefined) {
    return;
  }
  const path = '$.bunnyPrimitives';
  if (!isJsonArray(input) || input.length !== BUNNY_PRIMITIVE_PINS.length) {
    c.add(path, `expected the ${String(BUNNY_PRIMITIVE_PINS.length)} pinned Bunny primitives`);
    return;
  }
  BUNNY_PRIMITIVE_PINS.forEach((pin, index) => {
    const itemPath = `${path}[${String(index)}]`;
    const item = input[index];
    if (!isJsonObject(item)) {
      c.add(itemPath, 'expected an object');
      return;
    }
    const fields = ['contractId', 'bunnyCommit', 'wgslSha256', 'vectorsSha256'] as const;
    c.exactFields(item, itemPath, fields);
    for (const field of fields) {
      c.literal(item[field], pin[field], `${itemPath}.${field}`);
    }
  });
}

function validateAdapter(
  c: IssueCollector,
  input: JsonValue | undefined,
): EndpointReceiptAdapter | null {
  if (input === undefined) {
    return null;
  }
  const path = '$.adapter';
  if (!isJsonObject(input)) {
    c.add(path, 'expected an object');
    return null;
  }
  c.exactFields(input, path, ['backend', 'name', 'driver']);
  const backend = input.backend;
  const name = input.name;
  const driver = input.driver;
  if (backend !== undefined && !isGpuBackend(backend)) {
    c.add(`${path}.backend`, `expected one of ${GPU_BACKENDS.join(', ')}`);
  }
  if (name !== undefined && typeof name !== 'string') {
    c.add(`${path}.name`, 'expected a string');
  }
  if (driver !== undefined && typeof driver !== 'string') {
    c.add(`${path}.driver`, 'expected a string');
  }
  if (!isGpuBackend(backend) || typeof name !== 'string' || typeof driver !== 'string') {
    return null;
  }
  return { backend, name, driver };
}

/**
 * The dependency-to-artifact identity chain: which shader digests a backend
 * must carry, and which must be null.
 */
function validateShaderIdentity(
  c: IssueCollector,
  backend: GpuBackend,
  digests: {
    readonly assembledWgslSha256: string | null;
    readonly generatedGlslSha256: string | null;
    readonly shaderSha256: string | null;
  },
): void {
  const { assembledWgslSha256, generatedGlslSha256, shaderSha256 } = digests;
  if (backend === 'canvas2d') {
    if (assembledWgslSha256 !== null) {
      c.add('$.assembledWgslSha256', 'must be null for canvas2d');
    }
    if (generatedGlslSha256 !== null) {
      c.add('$.generatedGlslSha256', 'must be null for canvas2d');
    }
    if (shaderSha256 !== null) {
      c.add('$.shaderSha256', 'must be null for canvas2d');
    }
    return;
  }
  if (assembledWgslSha256 === null) {
    c.add('$.assembledWgslSha256', `is required for ${backend}`);
  }
  if (backend === 'webgl2') {
    if (generatedGlslSha256 === null) {
      c.add('$.generatedGlslSha256', 'is required for webgl2');
    }
    if (shaderSha256 === null) {
      c.add('$.shaderSha256', 'is required for webgl2');
    } else if (generatedGlslSha256 !== null && shaderSha256 !== generatedGlslSha256) {
      c.add('$.shaderSha256', 'must equal generatedGlslSha256 for webgl2');
    }
    return;
  }
  if (generatedGlslSha256 !== null) {
    c.add('$.generatedGlslSha256', `must be null for ${backend}`);
  }
  if (shaderSha256 === null) {
    c.add('$.shaderSha256', `is required for ${backend}`);
  } else if (assembledWgslSha256 !== null && shaderSha256 !== assembledWgslSha256) {
    c.add('$.shaderSha256', `must equal assembledWgslSha256 for ${backend}`);
  }
}

function validateCellPx(
  c: IssueCollector,
  input: JsonValue | undefined,
): { readonly width: number; readonly height: number } | null {
  if (input === undefined) {
    return null;
  }
  if (!isJsonObject(input)) {
    c.add('$.cellPx', 'expected an object');
    return null;
  }
  c.exactFields(input, '$.cellPx', ['width', 'height']);
  const width = c.integer(input.width, '$.cellPx.width', 1, 256);
  const height = c.integer(input.height, '$.cellPx.height', 1, 256);
  return width === null || height === null ? null : { width, height };
}

function validateAtlasStats(
  c: IssueCollector,
  input: JsonValue | undefined,
): EndpointReceiptAtlasStats | null {
  if (input === undefined) {
    return null;
  }
  const path = '$.atlasStats';
  if (!isJsonObject(input)) {
    c.add(path, 'expected an object');
    return null;
  }
  c.exactFields(input, path, ['usedSlots', 'capacity', 'monoCount', 'colorEmojiCount']);
  const usedSlots = c.integer(input.usedSlots, `${path}.usedSlots`, 0, 0x10000);
  const capacity = c.integer(input.capacity, `${path}.capacity`, 0, 0x10000);
  const monoCount = c.integer(input.monoCount, `${path}.monoCount`, 0, 0x10000);
  const colorEmojiCount = c.integer(input.colorEmojiCount, `${path}.colorEmojiCount`, 0, 0x10000);
  if (usedSlots === null || capacity === null || monoCount === null || colorEmojiCount === null) {
    return null;
  }
  if (usedSlots > capacity) {
    c.add(`${path}.usedSlots`, 'must not exceed capacity');
  }
  if (monoCount + colorEmojiCount !== usedSlots) {
    c.add(`${path}.usedSlots`, 'must equal monoCount + colorEmojiCount');
  }
  return { usedSlots, capacity, monoCount, colorEmojiCount };
}

function validateProbes(
  c: IssueCollector,
  input: JsonValue | undefined,
  canvasPxW: number | null,
  canvasPxH: number | null,
): EndpointReceiptProbe[] | null {
  if (input === undefined) {
    return null;
  }
  if (!isJsonArray(input)) {
    c.add('$.probes', 'expected an array');
    return null;
  }
  const probes: EndpointReceiptProbe[] = [];
  let valid = true;
  for (const [index, item] of input.entries()) {
    const path = `$.probes[${String(index)}]`;
    if (!isJsonObject(item)) {
      c.add(path, 'expected an object');
      valid = false;
      continue;
    }
    c.exactFields(item, path, ['px', 'py', 'rgba']);
    const px = c.integer(item.px, `${path}.px`, 0, (canvasPxW ?? MAX_CANVAS_PX) - 1);
    const py = c.integer(item.py, `${path}.py`, 0, (canvasPxH ?? MAX_CANVAS_PX) - 1);
    const rgba = item.rgba;
    if (!isJsonArray(rgba) || rgba.length !== 4) {
      if (rgba !== undefined) {
        c.add(`${path}.rgba`, 'expected [r, g, b, a]');
      }
      valid = false;
      continue;
    }
    const channels = rgba.map((channel, channelIndex) =>
      c.integer(channel, `${path}.rgba[${String(channelIndex)}]`, 0, 255),
    );
    const [r, g, b, a] = channels as [number | null, number | null, number | null, number | null];
    if (
      px === null ||
      py === null ||
      r === null ||
      g === null ||
      b === null ||
      a === null
    ) {
      valid = false;
      continue;
    }
    if (a !== 255) {
      c.add(`${path}.rgba[3]`, 'canonical frames are opaque; alpha must be 255');
    }
    probes.push({ px, py, rgba: [r, g, b, a] });
  }
  return valid ? probes : null;
}

/**
 * The positive-evidence versus capability-refusal law: only `software-probed`
 * and `gpu-probed` receipts may, and must, carry rendered pixels.
 */
function validateEvidence(
  c: IssueCollector,
  evidenceLevel: EvidenceLevel,
  frameRgbaSha256: string | null,
  probeCount: number,
): void {
  if (PROBED_EVIDENCE_LEVELS.includes(evidenceLevel)) {
    if (frameRgbaSha256 === null) {
      c.add('$.frameRgbaSha256', `${evidenceLevel} evidence requires the frame digest`);
    }
    if (probeCount === 0) {
      c.add('$.probes', `${evidenceLevel} evidence requires at least one readback probe`);
    }
    return;
  }
  const claim =
    evidenceLevel === 'capability-refused'
      ? 'a capability refusal cannot claim rendered pixels'
      : `${evidenceLevel} evidence reads back no pixels`;
  if (frameRgbaSha256 !== null) {
    c.add('$.frameRgbaSha256', `must be null: ${claim}`);
  }
  if (probeCount !== 0) {
    c.add('$.probes', `must be empty: ${claim}`);
  }
}

/**
 * Validate and return a receipt.
 *
 * @throws EndpointReceiptValidationError carrying every issue found.
 */
export function parseEndpointReceipt(input: JsonValue): EndpointReceipt {
  const result = validateEndpointReceipt(input);
  if (!result.ok) {
    throw new EndpointReceiptValidationError(result.issues);
  }
  return result.receipt;
}

function receiptToJson(receipt: EndpointReceipt): JsonValue {
  return {
    ...receipt,
    bunnyPrimitives: receipt.bunnyPrimitives.map((pin) => ({ ...pin })),
    adapter: { ...receipt.adapter },
    cellPx: { ...receipt.cellPx },
    atlasStats: { ...receipt.atlasStats },
    probes: receipt.probes.map((probe) => ({ px: probe.px, py: probe.py, rgba: [...probe.rgba] })),
  };
}

/** Serialise a receipt as deterministic canonical JSON (sorted keys). */
export function serializeEndpointReceipt(receipt: EndpointReceipt): string {
  return stringifyCanonicalJson(receiptToJson(receipt), { space: 2 });
}

/**
 * Content-addressed implementation manifest digest: the SHA-256 of the
 * canonical JSON of the receipt's dependency-to-artifact identity chain.
 *
 * It is derived from receipt fields and is not itself a receipt field, so two
 * receipts share a digest exactly when the same ABI, procedural table, Bunny
 * primitives, shader text, and executed artifact produced them.
 */
export function implementationManifestSha256(receipt: EndpointReceipt): string {
  const manifest: JsonValue = {
    gpuAbiVersion: receipt.gpuAbiVersion,
    cellFormatId: receipt.cellFormatId,
    proceduralTableSha256: receipt.proceduralTableSha256,
    bunnyPrimitives: receipt.bunnyPrimitives.map((pin) => ({ ...pin })),
    assembledWgslSha256: receipt.assembledWgslSha256,
    generatedGlslSha256: receipt.generatedGlslSha256,
    shaderSha256: receipt.shaderSha256,
    executedArtifactSha256: receipt.executedArtifactSha256,
    backendProfile: receipt.backendProfile,
    backend: receipt.adapter.backend,
  };
  return sha256Hex(utf8Bytes(stringifyCanonicalJson(manifest)));
}

/** The oracle fields a presenter frame is compared against. */
export interface BitExactOracleFrame {
  readonly canvasPxW: number;
  readonly canvasPxH: number;
  readonly preparedBufferSha256: string;
  readonly frameRgbaSha256: string;
}

/**
 * Cross-GPU bit-exact parity gate: assert that a presenter receipt hashes to
 * exactly the reference oracle frame, with zero LSB tolerance.
 *
 * @throws FrameHashMismatchError when the receipt carries no frame digest, was
 *   produced for a different canvas or prepared buffer, or hashes differently.
 */
export function assertBitExactFrameHash(
  receipt: Pick<
    EndpointReceipt,
    'evidenceLevel' | 'canvasPxW' | 'canvasPxH' | 'preparedBufferSha256' | 'frameRgbaSha256'
  >,
  oracle: BitExactOracleFrame,
): void {
  if (receipt.frameRgbaSha256 === null) {
    throw new FrameHashMismatchError(
      `${receipt.evidenceLevel} receipt carries no frameRgbaSha256 to compare`,
    );
  }
  if (receipt.canvasPxW !== oracle.canvasPxW || receipt.canvasPxH !== oracle.canvasPxH) {
    throw new FrameHashMismatchError(
      `receipt canvas ${String(receipt.canvasPxW)}x${String(receipt.canvasPxH)} differs from oracle canvas ${String(oracle.canvasPxW)}x${String(oracle.canvasPxH)}`,
    );
  }
  if (receipt.preparedBufferSha256 !== oracle.preparedBufferSha256) {
    throw new FrameHashMismatchError(
      `receipt preparedBufferSha256 ${receipt.preparedBufferSha256} differs from oracle ${oracle.preparedBufferSha256}`,
    );
  }
  if (receipt.frameRgbaSha256 !== oracle.frameRgbaSha256) {
    throw new FrameHashMismatchError(
      `receipt frameRgbaSha256 ${receipt.frameRgbaSha256} differs from oracle ${oracle.frameRgbaSha256}`,
    );
  }
}
