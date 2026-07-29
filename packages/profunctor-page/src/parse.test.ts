import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  canonicalJsonPort,
  type JsonObject,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';
import {
  parseProfunctorPageArtifacts,
  ProfunctorPageTargetError,
  type ProfunctorPageInput,
} from './index.js';

const FIXTURE_ROOT = fileURLToPath(
  new URL('../../../fixtures/profunctor-page/project-keep/input/', import.meta.url),
);

const EXPECTED_HASHES = {
  buildManifest: 'sha256:975efc9c701cbd7a6981787150748b76d1e53fd83cd424128667bc8014687ab7',
  page: 'sha256:12b90184b4e238bc6bd7db944af8651900b830ea76ba775ab7c7ee20be051e73',
  sourceMap: 'sha256:a40e97f2fd513519092d2a131c0d7107517b92bd7e9cfd5e79df70a65a3fe044',
} as const;

type MutableJsonObject = Record<string, JsonValue | undefined>;

class ExpectedDiagnosticError extends Error {
  constructor(code: ProfunctorPageTargetError['code']) {
    super(`Expected ${code}`);
    this.name = new.target.name;
  }
}

class TestFixtureShapeError extends Error {
  constructor() {
    super('Test fixture root must be an object');
    this.name = new.target.name;
  }
}

function fixtureInput(): ProfunctorPageInput {
  return {
    buildManifest: fixtureArtifact('page.profunctor.build.json'),
    page: fixtureArtifact('page.profunctor.json'),
    sourceMap: fixtureArtifact('page.profunctor.map.json'),
  };
}

function fixtureArtifact(filename: string): {
  readonly filename: string;
  readonly source: string;
} {
  return {
    filename,
    source: readFileSync(`${FIXTURE_ROOT}${filename}`, 'utf8'),
  };
}

function sha256(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function replaceJson(
  input: ProfunctorPageInput,
  key: keyof ProfunctorPageInput,
  mutate: (value: MutableJsonObject) => void,
): ProfunctorPageInput {
  const artifact = input[key];
  const value = {
    ...requireTestObject(canonicalJsonPort.parse(artifact.source)),
  };
  mutate(value);
  return {
    ...input,
    [key]: {
      ...artifact,
      source: `${canonicalJsonPort.stringify(value)}\n`,
    },
  };
}

function expectDiagnostic(
  run: () => void,
  code: ProfunctorPageTargetError['code'],
): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ProfunctorPageTargetError);
    expect((error as ProfunctorPageTargetError).code).toBe(code);
    return;
  }
  throw new ExpectedDiagnosticError(code);
}

function requireTestObject(value: JsonValue): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TestFixtureShapeError();
  }
  return value as JsonObject;
}

describe('parseProfunctorPageArtifacts', () => {
  it('keeps the canonical website fixtures byte-identical', () => {
    const input = fixtureInput();

    expect(sha256(input.page.source)).toBe(EXPECTED_HASHES.page);
    expect(sha256(input.sourceMap.source)).toBe(EXPECTED_HASHES.sourceMap);
    expect(sha256(input.buildManifest.source)).toBe(EXPECTED_HASHES.buildManifest);
  });

  it('parses and aligns the canonical Keep artifact family', () => {
    const parsed = parseProfunctorPageArtifacts(fixtureInput());

    expect(parsed.pageId).toBe('page:project.keep');
    expect(parsed.route).toBe('/projects/keep/');
    expect(parsed.compositionRef).toBe('composition:project-page@0');
    expect(parsed.entityRef).toBe('entity:project.keep');
    expect(parsed.nodes.map((node) => node.pageNodeId)).toEqual(parsed.readingOrder);
    expect(parsed.sourceMapEntries.map((entry) => entry.sourceOccurrenceId)).toEqual([
      'source-occurrence:projectCatalog.keep#record',
      'source-occurrence:projectCatalog.keep#fact.title',
    ]);
    expect(parsed.pageHash).toBe(EXPECTED_HASHES.page);
    expect(parsed.sourceMapHash).toBe(EXPECTED_HASHES.sourceMap);
    expect(parsed.buildManifestHash).toBe(EXPECTED_HASHES.buildManifest);
  });

  it('rejects malformed JSON with a stable diagnostic', () => {
    const input = fixtureInput();
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts({
          ...input,
          page: { ...input.page, source: '{' },
        });
      },
      'GEORDI_PAGE_INPUT_JSON_INVALID',
    );
  });

  it('rejects a stale page artifact digest', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      page.overrideRefs = ['override:test-only'];
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_DIGEST_MISMATCH',
    );
  });

  it('rejects page identity drift across artifacts', () => {
    const input = replaceJson(fixtureInput(), 'sourceMap', (sourceMap) => {
      sourceMap.pageId = 'page:project.other';
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
    );
  });
});
