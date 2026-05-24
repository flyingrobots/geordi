import { createHash } from 'node:crypto';

import { RENDER_FIXTURE_HASH_PREFIX } from './index.js';

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
