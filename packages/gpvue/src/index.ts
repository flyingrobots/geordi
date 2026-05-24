import { createHash } from 'node:crypto';
import {
  canonicalJsonPort,
  GEORDI_CORE_PROFILE,
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
  type GeordiFeatureRequirement,
  type JsonObject,
} from '@flyingrobots/geordi-core';

const GPVUE_SOURCE_FORMAT = 'gpvue' as const;
const SOURCE_MAP_VERSION = 'geordi-source-map/1' as const;
const SCENE_ARTIFACT_PATH = 'scene.geordi.json' as const;
const RECEIPT_ARTIFACT_PATH = 'scene.geordi.json.receipt' as const;
const SOURCE_MAP_ARTIFACT_PATH = 'scene.geordi.map.json' as const;
const RENDER_FIXTURE_VERSION = 'geordi-render-fixture/1' as const;
const HASH_PREFIX = 'sha256:' as const;
const HASH_ALGORITHM = 'sha256' as const;

const RECTANGLE_FEATURE_REQUIREMENTS = [
  GEORDI_CORE_PROFILE,
  'layout.resolved',
  'shape.rect',
  'paint.solid',
] as const satisfies readonly GeordiFeatureRequirement[];

const NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/u;
const ATTRIBUTE_PATTERN = /(:?[A-Za-z][A-Za-z0-9-]*)="([^"]*)"/gu;

export interface GpvueCompileInput {
  readonly filename: string;
  readonly source: string;
}

export interface GpvueArtifact {
  readonly content: string;
  readonly encoding: 'utf8';
  readonly mediaType: 'application/json';
  readonly path: string;
}

export interface GpvueCompileArtifacts {
  readonly ir: GpvueArtifact;
  readonly receipt: GpvueArtifact;
  readonly sourceMap: GpvueArtifact;
}

export interface GpvueCompileResult {
  readonly artifactHash: string;
  readonly artifacts: GpvueCompileArtifacts;
}

interface GpvueSourceLocation extends JsonObject {
  readonly column: number;
  readonly endColumn: number;
  readonly endLine: number;
  readonly endOffset: number;
  readonly file: string;
  readonly line: number;
  readonly offset: number;
}

interface ParsedRect {
  readonly fill: string;
  readonly height: number;
  readonly id: string;
  readonly source: GpvueSourceLocation;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface ParsedScene {
  readonly height: number;
  readonly id: string;
  readonly rects: readonly ParsedRect[];
  readonly width: number;
}

interface TagMatch {
  readonly attrs: string;
  readonly end: number;
  readonly source: string;
  readonly start: number;
}

interface OffsetPosition {
  readonly column: number;
  readonly line: number;
}

export class GpvueParseError extends Error {
  public readonly detail: string;
  public readonly filename: string;

  constructor(filename: string, detail: string) {
    super('GPVue parse failed');
    this.name = new.target.name;
    this.detail = detail;
    this.filename = filename;
  }
}

export class GpvueUnsupportedConstructError extends Error {
  public readonly construct: string;
  public readonly filename: string;

  constructor(filename: string, construct: string) {
    super('GPVue source contains an unsupported construct');
    this.name = new.target.name;
    this.construct = construct;
    this.filename = filename;
  }
}

export class GpvueDuplicateAttributeError extends Error {
  public readonly attribute: string;
  public readonly filename: string;
  public readonly tagName: string;

  constructor(filename: string, tagName: string, attribute: string) {
    super('GPVue tag contains a duplicate attribute');
    this.name = new.target.name;
    this.attribute = attribute;
    this.filename = filename;
    this.tagName = tagName;
  }
}

export class GpvueMissingAttributeError extends Error {
  public readonly attribute: string;
  public readonly filename: string;
  public readonly tagName: string;

  constructor(filename: string, tagName: string, attribute: string) {
    super('GPVue tag is missing a required attribute');
    this.name = new.target.name;
    this.attribute = attribute;
    this.filename = filename;
    this.tagName = tagName;
  }
}

export class GpvueInvalidNumberError extends Error {
  public readonly attribute: string;
  public readonly filename: string;
  public readonly tagName: string;
  public readonly value: string;

  constructor(filename: string, tagName: string, attribute: string, value: string) {
    super('GPVue numeric attribute is invalid');
    this.name = new.target.name;
    this.attribute = attribute;
    this.filename = filename;
    this.tagName = tagName;
    this.value = value;
  }
}

export class GpvueInvalidColorError extends Error {
  public readonly attribute: string;
  public readonly filename: string;
  public readonly tagName: string;
  public readonly value: string;

  constructor(filename: string, tagName: string, attribute: string, value: string) {
    super('GPVue color attribute is invalid');
    this.name = new.target.name;
    this.attribute = attribute;
    this.filename = filename;
    this.tagName = tagName;
    this.value = value;
  }
}

export class GpvueDuplicateNodeIdError extends Error {
  public readonly filename: string;
  public readonly nodeId: string;

  constructor(filename: string, nodeId: string) {
    super('GPVue source contains a duplicate node id');
    this.name = new.target.name;
    this.filename = filename;
    this.nodeId = nodeId;
  }
}

export function compileGpvueSource(input: GpvueCompileInput): GpvueCompileResult {
  const parsed = parseGpvueSource(input);
  const irContent = withTrailingNewline(
    canonicalJsonPort.stringify(geordiIrFromScene(parsed), { space: 2 }),
  );
  const artifactHash = `${HASH_PREFIX}${hashString(irContent)}`;
  const receiptContent = withTrailingNewline(
    canonicalJsonPort.stringify(receiptFromScene(parsed, artifactHash), {
      space: 2,
    }),
  );
  const sourceMapContent = withTrailingNewline(
    canonicalJsonPort.stringify(sourceMapFromScene(parsed), { space: 2 }),
  );

  return {
    artifactHash,
    artifacts: {
      ir: artifact(SCENE_ARTIFACT_PATH, irContent),
      receipt: artifact(RECEIPT_ARTIFACT_PATH, receiptContent),
      sourceMap: artifact(SOURCE_MAP_ARTIFACT_PATH, sourceMapContent),
    },
  };
}

function parseGpvueSource(input: GpvueCompileInput): ParsedScene {
  rejectUnsupportedConstructs(input);

  const templateBody = templateBodyFor(input);
  const sceneTag = requiredTag(input, templateBody.body, templateBody.offset, 'GeordiScene');
  const sceneClose = templateBody.body.indexOf('</GeordiScene>', sceneTag.end - templateBody.offset);
  if (sceneClose < 0) {
    throw new GpvueParseError(input.filename, 'Missing closing GeordiScene tag');
  }

  const beforeScene = templateBody.body.slice(0, sceneTag.start - templateBody.offset);
  const afterScene = templateBody.body.slice(sceneClose + '</GeordiScene>'.length);
  if (beforeScene.trim().length > 0 || afterScene.trim().length > 0) {
    throw new GpvueUnsupportedConstructError(input.filename, 'template sibling content');
  }

  const sceneAttrs = parseAttributes(input.filename, 'GeordiScene', sceneTag.attrs);
  rejectUnsupportedAttributes(input.filename, 'GeordiScene', sceneAttrs, [
    'id',
    ':width',
    ':height',
  ]);

  const sceneContentStart = sceneTag.end;
  const sceneContentEnd = templateBody.offset + sceneClose;
  const sceneBody = input.source.slice(sceneContentStart, sceneContentEnd);

  return {
    height: positiveNumberAttribute(input.filename, 'GeordiScene', sceneAttrs, ':height'),
    id: requiredAttribute(input.filename, 'GeordiScene', sceneAttrs, 'id'),
    rects: parseRects(input, sceneBody, sceneContentStart),
    width: positiveNumberAttribute(input.filename, 'GeordiScene', sceneAttrs, ':width'),
  };
}

function rejectUnsupportedConstructs(input: GpvueCompileInput): void {
  const checks: readonly [RegExp, string][] = [
    [/<script\b/iu, 'script block'],
    [/<style\b/iu, 'style block'],
    [/<Text\b/iu, 'text node'],
    [/\{\{/u, 'template interpolation'],
    [/\sv-[A-Za-z0-9-]+=/u, 'Vue directive'],
    [/\s@[A-Za-z0-9:-]+=/u, 'event binding'],
    [/\s:style=/u, 'dynamic style binding'],
    [/\sclass=/u, 'class attribute'],
  ];

  for (const [pattern, construct] of checks) {
    if (pattern.test(input.source)) {
      throw new GpvueUnsupportedConstructError(input.filename, construct);
    }
  }
}

function templateBodyFor(input: GpvueCompileInput): {
  readonly body: string;
  readonly offset: number;
} {
  const open = '<template>';
  const close = '</template>';
  const openIndex = input.source.indexOf(open);
  const closeIndex = input.source.indexOf(close);

  if (openIndex < 0 || closeIndex < 0 || closeIndex <= openIndex) {
    throw new GpvueParseError(input.filename, 'Expected one template root');
  }

  if (input.source.includes(open, openIndex + open.length)) {
    throw new GpvueUnsupportedConstructError(input.filename, 'multiple template roots');
  }

  if (input.source.slice(0, openIndex).trim().length > 0) {
    throw new GpvueUnsupportedConstructError(input.filename, 'content before template');
  }

  if (input.source.slice(closeIndex + close.length).trim().length > 0) {
    throw new GpvueUnsupportedConstructError(input.filename, 'content after template');
  }

  return {
    body: input.source.slice(openIndex + open.length, closeIndex),
    offset: openIndex + open.length,
  };
}

function requiredTag(
  input: GpvueCompileInput,
  body: string,
  bodyOffset: number,
  tagName: string,
): TagMatch {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'u');
  const match = pattern.exec(body);
  if (match === null) {
    throw new GpvueParseError(input.filename, `Missing ${tagName} tag`);
  }

  const source = requiredCapture(match, 0);
  const attrs = requiredCapture(match, 1);
  const start = bodyOffset + match.index;

  return {
    attrs,
    end: start + source.length,
    source,
    start,
  };
}

function parseRects(
  input: GpvueCompileInput,
  sceneBody: string,
  sceneBodyOffset: number,
): readonly ParsedRect[] {
  const rects: ParsedRect[] = [];
  const ids = new Set<string>();
  const lineStarts = lineStartsFor(input.source);
  const pattern = /<Rect\b([^>]*)\/>/gu;
  let cursor = 0;
  let match = pattern.exec(sceneBody);

  while (match !== null) {
    if (sceneBody.slice(cursor, match.index).trim().length > 0) {
      throw new GpvueUnsupportedConstructError(input.filename, 'non-rect scene content');
    }

    const tagSource = requiredCapture(match, 0);
    const attrs = parseAttributes(
      input.filename,
      'Rect',
      requiredCapture(match, 1),
    );
    rejectUnsupportedAttributes(input.filename, 'Rect', attrs, [
      'id',
      ':x',
      ':y',
      ':width',
      ':height',
      'fill',
    ]);

    const id = requiredAttribute(input.filename, 'Rect', attrs, 'id');
    if (ids.has(id)) {
      throw new GpvueDuplicateNodeIdError(input.filename, id);
    }
    ids.add(id);

    const start = sceneBodyOffset + match.index;
    const end = start + tagSource.length;
    rects.push({
      fill: colorAttribute(input.filename, 'Rect', attrs, 'fill'),
      height: positiveNumberAttribute(input.filename, 'Rect', attrs, ':height'),
      id,
      source: sourceLocation(input.filename, lineStarts, start, end),
      width: positiveNumberAttribute(input.filename, 'Rect', attrs, ':width'),
      x: nonNegativeNumberAttribute(input.filename, 'Rect', attrs, ':x'),
      y: nonNegativeNumberAttribute(input.filename, 'Rect', attrs, ':y'),
    });

    cursor = match.index + tagSource.length;
    match = pattern.exec(sceneBody);
  }

  if (sceneBody.slice(cursor).trim().length > 0) {
    throw new GpvueUnsupportedConstructError(input.filename, 'non-rect scene content');
  }

  if (rects.length === 0) {
    throw new GpvueParseError(input.filename, 'GeordiScene must contain at least one Rect');
  }

  return rects;
}

function parseAttributes(filename: string, tagName: string, source: string): ReadonlyMap<string, string> {
  const attrs = new Map<string, string>();
  let cursor = 0;
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match = ATTRIBUTE_PATTERN.exec(source);

  while (match !== null) {
    if (source.slice(cursor, match.index).trim().length > 0) {
      throw new GpvueParseError(filename, `Invalid attribute syntax in ${tagName}`);
    }

    const key = requiredCapture(match, 1);
    const value = requiredCapture(match, 2);
    if (attrs.has(key)) {
      throw new GpvueDuplicateAttributeError(filename, tagName, key);
    }
    attrs.set(key, value);
    cursor = match.index + requiredCapture(match, 0).length;
    match = ATTRIBUTE_PATTERN.exec(source);
  }

  if (source.slice(cursor).trim().length > 0) {
    throw new GpvueParseError(filename, `Invalid attribute syntax in ${tagName}`);
  }

  return attrs;
}

function rejectUnsupportedAttributes(
  filename: string,
  tagName: string,
  attrs: ReadonlyMap<string, string>,
  allowed: readonly string[],
): void {
  for (const key of attrs.keys()) {
    if (!allowed.includes(key)) {
      throw new GpvueUnsupportedConstructError(filename, `${tagName}.${key}`);
    }
  }
}

function requiredAttribute(
  filename: string,
  tagName: string,
  attrs: ReadonlyMap<string, string>,
  key: string,
): string {
  const value = attrs.get(key);
  if (value === undefined || value.length === 0) {
    throw new GpvueMissingAttributeError(filename, tagName, key);
  }

  return value;
}

function positiveNumberAttribute(
  filename: string,
  tagName: string,
  attrs: ReadonlyMap<string, string>,
  key: string,
): number {
  const value = numberAttribute(filename, tagName, attrs, key);
  if (value <= 0) {
    throw new GpvueInvalidNumberError(filename, tagName, key, String(value));
  }

  return value;
}

function nonNegativeNumberAttribute(
  filename: string,
  tagName: string,
  attrs: ReadonlyMap<string, string>,
  key: string,
): number {
  const value = numberAttribute(filename, tagName, attrs, key);
  if (value < 0) {
    throw new GpvueInvalidNumberError(filename, tagName, key, String(value));
  }

  return value;
}

function numberAttribute(
  filename: string,
  tagName: string,
  attrs: ReadonlyMap<string, string>,
  key: string,
): number {
  const raw = requiredAttribute(filename, tagName, attrs, key);
  if (!NUMBER_PATTERN.test(raw)) {
    throw new GpvueInvalidNumberError(filename, tagName, key, raw);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new GpvueInvalidNumberError(filename, tagName, key, raw);
  }

  return value;
}

function colorAttribute(
  filename: string,
  tagName: string,
  attrs: ReadonlyMap<string, string>,
  key: string,
): string {
  const value = requiredAttribute(filename, tagName, attrs, key);
  if (!COLOR_PATTERN.test(value)) {
    throw new GpvueInvalidColorError(filename, tagName, key, value);
  }

  return value;
}

function geordiIrFromScene(scene: ParsedScene): JsonObject {
  return {
    irVersion: GEORDI_IR_VERSION,
    nodes: scene.rects.map((rect) => ({
      id: rect.id,
      kind: 'Rect',
      props: {
        fill: rect.fill,
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      },
    })),
    numericProfile: GEORDI_NUMERIC_PROFILE,
    requires: [...RECTANGLE_FEATURE_REQUIREMENTS],
    scene: {
      height: scene.height,
      id: scene.id,
      units: 'px',
      width: scene.width,
    },
  };
}

function receiptFromScene(scene: ParsedScene, artifactHash: string): JsonObject {
  return {
    artifactHash,
    artifactHashAlg: HASH_ALGORITHM,
    artifactPath: SCENE_ARTIFACT_PATH,
    fixtureId: scene.id,
    fixtureVersion: RENDER_FIXTURE_VERSION,
    irVersion: GEORDI_IR_VERSION,
    numericProfile: GEORDI_NUMERIC_PROFILE,
    requires: [...RECTANGLE_FEATURE_REQUIREMENTS],
  };
}

function sourceMapFromScene(scene: ParsedScene): JsonObject {
  return {
    irVersion: GEORDI_IR_VERSION,
    nodes: scene.rects.map((rect) => ({
      id: rect.id,
      source: rect.source,
    })),
    sourceFormat: GPVUE_SOURCE_FORMAT,
    version: SOURCE_MAP_VERSION,
  };
}

function sourceLocation(
  filename: string,
  lineStarts: readonly number[],
  start: number,
  end: number,
): GpvueSourceLocation {
  const startPosition = offsetPosition(lineStarts, start);
  const endPosition = offsetPosition(lineStarts, end);

  return {
    column: startPosition.column,
    endColumn: endPosition.column,
    endLine: endPosition.line,
    endOffset: end,
    file: filename,
    line: startPosition.line,
    offset: start,
  };
}

function lineStartsFor(source: string): readonly number[] {
  const starts: number[] = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function offsetPosition(lineStarts: readonly number[], offset: number): OffsetPosition {
  let lineIndex = 0;
  for (let index = 0; index < lineStarts.length; index++) {
    const nextIndex = index + 1;
    if (nextIndex >= lineStarts.length || offset < lineStarts[nextIndex]) {
      lineIndex = index;
      break;
    }
  }

  const lineStart = lineStarts[lineIndex];
  return {
    column: offset - lineStart + 1,
    line: lineIndex + 1,
  };
}

function artifact(path: string, content: string): GpvueArtifact {
  return {
    content,
    encoding: 'utf8',
    mediaType: 'application/json',
    path,
  };
}

function hashString(source: string): string {
  return createHash(HASH_ALGORITHM).update(source).digest('hex');
}

function withTrailingNewline(source: string): string {
  return source.endsWith('\n') ? source : `${source}\n`;
}

function requiredCapture(match: RegExpExecArray, index: number): string {
  return match[index];
}
