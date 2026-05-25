import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { RENDER_FIXTURE_HASH_PREFIX, type RenderFixtureFontPackManifest } from './index.js';

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

function isPathWithinRoot(resolvedRoot: string, resolvedPath: string): boolean {
  const pathFromRoot = relative(resolvedRoot, resolvedPath);
  return pathFromRoot.length > 0 && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot);
}
