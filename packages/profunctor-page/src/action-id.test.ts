import { describe, expect, it } from 'vitest';
import { deriveTargetActionId } from './lower.js';

const ROLES = ['documentation', 'feature', 'related-project', 'source'] as const;

// Small deterministic generator (mulberry32) so the property test is seeded.
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = [':', ':', 'source', 'feature', '%', 'a', 'b', '#', '/', '3', 'A', ' ', 'é', '😀'];

function randomString(next: () => number): string {
  const length = Math.floor(next() * 7);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[Math.floor(next() * ALPHABET.length)];
  }
  return out;
}

describe('deriveTargetActionId', () => {
  it('keeps ids distinct when the pageNodeId contains the delimiter', () => {
    expect(deriveTargetActionId('a:feature:x', 'source', 'y')).not.toBe(
      deriveTargetActionId('a', 'feature', 'x:source:y'),
    );
  });

  it('keeps ids distinct when href contains the delimiter', () => {
    expect(deriveTargetActionId('a', 'source', 'b:feature:c')).not.toBe(
      deriveTargetActionId('a:source:b', 'feature', 'c'),
    );
  });

  it('is deterministic', () => {
    expect(deriveTargetActionId('n', 'source', 'h')).toBe(
      deriveTargetActionId('n', 'source', 'h'),
    );
  });

  it('gives distinct tuples distinct ids over seeded random tuples', () => {
    const next = prng(55);
    const seen = new Map<string, string>();
    for (let index = 0; index < 20000; index += 1) {
      const role = ROLES[Math.floor(next() * ROLES.length)] ?? 'source';
      const tuple = JSON.stringify([randomString(next), role, randomString(next)]);
      const [pageNodeId, , href] = JSON.parse(tuple) as [string, typeof role, string];
      const id = deriveTargetActionId(pageNodeId, role, href);
      const previous = seen.get(id);
      expect(previous === undefined || previous === tuple).toBe(true);
      seen.set(id, tuple);
    }
  });
});
