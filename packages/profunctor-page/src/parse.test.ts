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
  constructor(path: string, expected: 'array' | 'object') {
    super(`Expected ${expected} at ${path}`);
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

function alignPageDigest(input: ProfunctorPageInput): ProfunctorPageInput {
  return replaceJson(input, 'buildManifest', (manifest) => {
    manifest.artifactDigest = sha256(input.page.source);
  });
}

function replaceJson(
  input: ProfunctorPageInput,
  key: keyof ProfunctorPageInput,
  mutate: (value: MutableJsonObject) => void,
): ProfunctorPageInput {
  const artifact = input[key];
  const value = {
    ...requireTestObject(canonicalJsonPort.parse(artifact.source), '$'),
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

function requireTestObject(value: JsonValue, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TestFixtureShapeError(path, 'object');
  }
  return value as JsonObject;
}

function mutableObject(
  value: JsonValue | undefined,
  path: string,
): MutableJsonObject {
  return requireTestObject(value, path);
}

function mutableArray(
  value: JsonValue | undefined,
  path: string,
): JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TestFixtureShapeError(path, 'array');
  }
  return value as JsonValue[];
}

function pageNode(
  page: MutableJsonObject,
  index: number,
): MutableJsonObject {
  const nodes = mutableArray(page.nodes, '$page.nodes');
  return mutableObject(nodes[index], `$page.nodes[${index}]`);
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
    try {
      parseProfunctorPageArtifacts({
        ...input,
        page: { ...input.page, source: '{' },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProfunctorPageTargetError);
      expect((error as ProfunctorPageTargetError).code).toBe(
        'GEORDI_PAGE_INPUT_JSON_INVALID',
      );
      expect((error as ProfunctorPageTargetError).cause).toBeInstanceOf(Error);
      return;
    }
    throw new ExpectedDiagnosticError('GEORDI_PAGE_INPUT_JSON_INVALID');
  });

  it('rejects an unsupported artifact version', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      page.artifactVersion = 'profunctor-page/1';
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_VERSION_UNSUPPORTED',
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

  it('rejects route drift across artifacts', () => {
    const input = replaceJson(fixtureInput(), 'buildManifest', (manifest) => {
      manifest.routes = ['/projects/other/'];
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_IDENTITY_MISMATCH',
    );
  });

  it('rejects duplicate page-node identity', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      pageNode(page, 1).pageNodeId = pageNode(page, 0).pageNodeId;
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
    );
  });

  it.each([
    [
      'root',
      (page: MutableJsonObject) => {
        page.rootNodeId = 'page-node:missing';
      },
    ],
    [
      'reading order',
      (page: MutableJsonObject) => {
        mutableArray(page.readingOrder, '$page.readingOrder')[1] =
          'page-node:missing';
      },
    ],
    [
      'slot',
      (page: MutableJsonObject) => {
        const slots = mutableArray(
          pageNode(page, 0).slots,
          '$page.nodes[0].slots',
        );
        mutableArray(
          mutableObject(slots[0], '$page.nodes[0].slots[0]').childPageNodeIds,
          '$page.nodes[0].slots[0].childPageNodeIds',
        )[0] = 'page-node:missing';
      },
    ],
    [
      'outline',
      (page: MutableJsonObject) => {
        const outline = mutableArray(page.outline, '$page.outline');
        mutableObject(outline[0], '$page.outline[0]').pageNodeId =
          'page-node:missing';
      },
    ],
    [
      'landmark',
      (page: MutableJsonObject) => {
        const landmarks = mutableArray(page.landmarks, '$page.landmarks');
        mutableObject(landmarks[0], '$page.landmarks[0]').pageNodeId =
          'page-node:missing';
      },
    ],
  ] as const)('rejects a dangling %s reference', (_label, mutate) => {
    const input = replaceJson(fixtureInput(), 'page', mutate);
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
    );
  });

  it('rejects a detached slot cycle that is not reachable from the root', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      const rootSlots = mutableArray(
        pageNode(page, 0).slots,
        '$page.nodes[0].slots',
      );
      pageNode(page, 0).slots = rootSlots.filter((value, index) => {
        const slot = mutableObject(value, `$page.nodes[0].slots[${index}]`);
        return slot.name !== 'facts' && slot.name !== 'related';
      });
      pageNode(page, 2).slots = [
        {
          childPageNodeIds: [
            'page-node:project.keep#project-page.related',
          ],
          name: 'detached-cycle',
        },
      ];
      pageNode(page, 4).slots = [
        {
          childPageNodeIds: [
            'page-node:project.keep#project-page.facts',
          ],
          name: 'detached-cycle',
        },
      ];
    });

    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
    );
  });

  it('rejects a missing source occurrence', () => {
    const input = replaceJson(fixtureInput(), 'sourceMap', (sourceMap) => {
      sourceMap.entries = mutableArray(
        sourceMap.entries,
        '$sourceMap.entries',
      ).slice(1);
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
    );
  });

  it('rejects a duplicate source occurrence', () => {
    const input = replaceJson(fixtureInput(), 'sourceMap', (sourceMap) => {
      const entries = mutableArray(sourceMap.entries, '$sourceMap.entries');
      entries.push(structuredClone(entries[0]));
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
    );
  });

  it('rejects one source occurrence identity reused by different nodes', () => {
    let input = replaceJson(fixtureInput(), 'page', (page) => {
      mutableObject(
        pageNode(page, 1).sourceBindings,
        '$page.nodes[1].sourceBindings',
      ).title = 'source-occurrence:projectCatalog.keep#record';
    });
    input = replaceJson(input, 'sourceMap', (sourceMap) => {
      const entries = mutableArray(sourceMap.entries, '$sourceMap.entries');
      mutableObject(
        entries[1],
        '$sourceMap.entries[1]',
      ).sourceOccurrenceId =
        'source-occurrence:projectCatalog.keep#record';
    });
    input = alignPageDigest(input);

    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
    );
  });

  it('rejects a source occurrence bound to another template node', () => {
    const input = replaceJson(fixtureInput(), 'sourceMap', (sourceMap) => {
      const entries = mutableArray(sourceMap.entries, '$sourceMap.entries');
      mutableObject(
        entries[0],
        '$sourceMap.entries[0]',
      ).templateNodeId = 'template:project-page.hero';
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS',
    );
  });

  it('rejects an unsupported visible block', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      pageNode(page, 1).blockDefinitionId = 'block:unknown';
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_BLOCK_UNSUPPORTED',
    );
  });

  it('permits an unsupported hidden block without inventing geometry', () => {
    const input = alignPageDigest(
      replaceJson(fixtureInput(), 'page', (page) => {
        const node = pageNode(page, 4);
        node.blockDefinitionId = 'block:unknown';
        node.hidden = true;
      }),
    );

    expect(parseProfunctorPageArtifacts(input).nodes[4]).toMatchObject({
      blockDefinitionId: 'block:unknown',
      hidden: true,
    });
  });

  it('rejects a declared token that no page node binds', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      const tokens = mutableObject(
        pageNode(page, 0).tokens,
        '$page.nodes[0].tokens',
      );
      delete tokens.surfaceTint;
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
    );
  });

  it('rejects a node token that the page never declares', () => {
    const input = replaceJson(fixtureInput(), 'page', (page) => {
      mutableObject(
        pageNode(page, 0).tokens,
        '$page.nodes[0].tokens',
      ).surfaceTint = 'semantic.undeclared';
    });
    expectDiagnostic(
      () => {
        parseProfunctorPageArtifacts(input);
      },
      'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
    );
  });
});
