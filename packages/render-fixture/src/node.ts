import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { canonicalJsonPort, type JsonValue } from '@flyingrobots/geordi-core';

import {
  assertRenderFixtureStrictTextFixtureReceipt,
  parseRenderFixtureFontPackManifest,
  parseRenderFixtureStrictTextFixtureManifest,
  RENDER_FIXTURE_HASH_ALGORITHM_SHA256,
  RENDER_FIXTURE_HASH_PREFIX,
  RENDER_FIXTURE_STRICT_TEXT_FIXTURE_RECEIPT_VERSION,
  RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_PRECOMPUTED,
  RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
  type RenderFixtureFontPackManifest,
  type RenderFixtureStrictTextFixtureReceipt,
} from './index.js';

export class RenderFixtureHashMismatchError extends Error {
  public readonly actual: string;
  public readonly expected: string;

  constructor(expected: string, actual: string) {
    super('Render fixture hash mismatch');
    this.name = new.target.name;
    this.actual = actual;
    this.expected = expected;
  }
}

export class RenderFixtureFontPackHashMismatchError extends Error {
  public readonly actual: string;
  public readonly expected: string;
  public readonly path: string;

  constructor(path: string, expected: string, actual: string) {
    super('Render fixture font pack asset hash mismatch');
    this.name = new.target.name;
    this.actual = actual;
    this.expected = expected;
    this.path = path;
  }
}

export class RenderFixtureFontPackAssetPathError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('Render fixture font pack asset path is outside the repository root');
    this.name = new.target.name;
    this.path = path;
  }
}

export class RenderFixtureFontPackAssetReadError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('Render fixture font pack asset read failed');
    this.name = new.target.name;
    this.path = path;
  }
}

export interface RenderFixtureFontPackHashVerification {
  readonly fontId: string;
  readonly kind: 'font' | 'license';
  readonly path: string;
  readonly sha256: string;
}

export interface RenderFixtureStrictTextFixtureReceiptBuildInput {
  readonly fixturePath: string;
  readonly generatedBy?: string;
  readonly repositoryRoot: string;
}

export function renderFixtureSha256FromBytes(bytes: Uint8Array): string {
  return `${RENDER_FIXTURE_HASH_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`;
}

export function assertRenderFixtureSha256(bytes: Uint8Array, expected: string): string {
  const actual = renderFixtureSha256FromBytes(bytes);
  if (actual !== expected) {
    throw new RenderFixtureHashMismatchError(expected, actual);
  }

  return actual;
}

export function assertRenderFixtureFontPackHashes(
  manifest: RenderFixtureFontPackManifest,
  repositoryRoot: string,
): readonly RenderFixtureFontPackHashVerification[] {
  const verifications: RenderFixtureFontPackHashVerification[] = [];

  for (const font of manifest.fonts) {
    verifications.push(
      assertRenderFixtureFontPackAssetHash({
        expected: font.sha256,
        fontId: font.id,
        kind: 'font',
        path: font.path,
        repositoryRoot,
      }),
    );
    verifications.push(
      assertRenderFixtureFontPackAssetHash({
        expected: font.license.sha256,
        fontId: font.id,
        kind: 'license',
        path: font.license.path,
        repositoryRoot,
      }),
    );
  }

  return verifications;
}

export function createRenderFixtureStrictTextFixtureReceipt(
  input: RenderFixtureStrictTextFixtureReceiptBuildInput,
): RenderFixtureStrictTextFixtureReceipt {
  const fixtureBytes = readFixtureLocalBytes(input.repositoryRoot, input.fixturePath);
  const fixtureSource = decodeUtf8(fixtureBytes);
  const manifest = parseRenderFixtureStrictTextFixtureManifest(fixtureSource);
  const fontPackBytes = readFixtureLocalBytes(input.repositoryRoot, manifest.fontPackPath);
  parseRenderFixtureFontPackManifest(decodeUtf8(fontPackBytes));

  return assertRenderFixtureStrictTextFixtureReceipt({
    fixtureHash: renderFixtureSha256FromBytes(fixtureBytes),
    fixturePath: input.fixturePath,
    fontPackHash: renderFixtureSha256FromBytes(fontPackBytes),
    fontPackPath: manifest.fontPackPath,
    generatedBy: input.generatedBy ?? RENDER_FIXTURE_TYPESCRIPT_STRICT_TEXT_RECEIPT_GENERATOR,
    glyphRunHash: renderFixtureSha256FromCanonicalJson(manifest.glyphRuns),
    hashAlgorithm: RENDER_FIXTURE_HASH_ALGORITHM_SHA256,
    lineBoxHash: renderFixtureSha256FromCanonicalJson(manifest.lineBoxes),
    positionEncodingProfile: manifest.positionEncoding,
    receiptVersion: RENDER_FIXTURE_STRICT_TEXT_FIXTURE_RECEIPT_VERSION,
    semanticTextAffectsPixels: manifest.semanticText.affectsPixels,
    semanticTextHash: renderFixtureSha256FromCanonicalJson(manifest.semanticText),
    shapingProfile: RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_PRECOMPUTED,
    textProfile: manifest.textProfile,
  });
}

export function renderFixtureSha256FromCanonicalJson(value: JsonValue): string {
  return renderFixtureSha256FromBytes(
    encodeUtf8(`${canonicalJsonPort.stringify(value, { space: 2 })}\n`),
  );
}

interface FontPackAssetHashInput {
  readonly expected: string;
  readonly fontId: string;
  readonly kind: 'font' | 'license';
  readonly path: string;
  readonly repositoryRoot: string;
}

function assertRenderFixtureFontPackAssetHash(
  input: FontPackAssetHashInput,
): RenderFixtureFontPackHashVerification {
  const bytes = readFixtureLocalBytes(input.repositoryRoot, input.path);
  const actual = renderFixtureSha256FromBytes(bytes);
  if (actual !== input.expected) {
    throw new RenderFixtureFontPackHashMismatchError(input.path, input.expected, actual);
  }

  return {
    fontId: input.fontId,
    kind: input.kind,
    path: input.path,
    sha256: actual,
  };
}

function readFixtureLocalBytes(repositoryRoot: string, fixtureLocalPath: string): Uint8Array {
  let resolvedRoot: string;
  try {
    resolvedRoot = realpathSync(resolve(repositoryRoot));
  } catch {
    throw new RenderFixtureFontPackAssetReadError(repositoryRoot);
  }

  const resolvedPath = resolve(resolvedRoot, fixtureLocalPath);
  if (!isPathWithinRoot(resolvedRoot, resolvedPath)) {
    throw new RenderFixtureFontPackAssetPathError(fixtureLocalPath);
  }

  let realPath: string;
  try {
    realPath = realpathSync(resolvedPath);
  } catch {
    throw new RenderFixtureFontPackAssetReadError(fixtureLocalPath);
  }

  if (!isPathWithinRoot(resolvedRoot, realPath)) {
    throw new RenderFixtureFontPackAssetPathError(fixtureLocalPath);
  }

  try {
    return readFileSync(realPath);
  } catch {
    throw new RenderFixtureFontPackAssetReadError(fixtureLocalPath);
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function isPathWithinRoot(resolvedRoot: string, resolvedPath: string): boolean {
  const pathFromRoot = relative(resolvedRoot, resolvedPath);
  return pathFromRoot.length > 0 && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot);
}
