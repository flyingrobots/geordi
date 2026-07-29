import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  canonicalJsonPort,
  validateGeordiIr,
  type JsonObject,
  type JsonValue,
} from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';
import {
  lowerProfunctorPageArtifacts,
  PROFUNCTOR_PAGE_TARGET_IR_PATH,
  PROFUNCTOR_PAGE_TARGET_MAP_PATH,
  PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH,
  PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH,
  ProfunctorPageTargetError,
  validateProfunctorPageTargetIr,
  type ProfunctorPageInput,
} from './index.js';
import { renderProfunctorPageStructuralPreview } from './preview.js';

const FIXTURE_ROOT = fileURLToPath(
  new URL('../../../fixtures/profunctor-page/project-keep/input/', import.meta.url),
);

type MutableJsonObject = Record<string, JsonValue | undefined>;

class TestArtifactShapeError extends Error {
  constructor(path: string) {
    super(`Expected object at ${path}`);
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

function object(value: JsonValue | undefined, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TestArtifactShapeError(path);
  }
  return value as JsonObject;
}

function objectArray(value: JsonValue | undefined, path: string): readonly JsonObject[] {
  if (!Array.isArray(value)) {
    throw new TestArtifactShapeError(path);
  }
  return (value as readonly JsonValue[]).map((item, index) =>
    object(item, `${path}[${index}]`),
  );
}

function stringArray(value: JsonValue | undefined, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new TestArtifactShapeError(path);
  }
  const result: string[] = [];
  for (const [index, item] of (value as readonly JsonValue[]).entries()) {
    if (typeof item !== 'string') {
      throw new TestArtifactShapeError(`${path}[${index}]`);
    }
    result.push(item);
  }
  return result;
}

function mutableObject(
  value: JsonValue | undefined,
  path: string,
): MutableJsonObject {
  return object(value, path);
}

function mutablePageNode(
  page: MutableJsonObject,
  index: number,
): MutableJsonObject {
  const nodes = objectArray(page.nodes, '$page.nodes');
  return mutableObject(nodes[index], `$page.nodes[${index}]`);
}

function sha256(source: string): string {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function fixtureInputWithPageMutation(
  mutate: (page: MutableJsonObject) => void,
): ProfunctorPageInput {
  const input = fixtureInput();
  const page: MutableJsonObject = {
    ...object(canonicalJsonPort.parse(input.page.source), '$page'),
  };
  mutate(page);
  const pageSource = `${canonicalJsonPort.stringify(page)}\n`;
  const manifest: MutableJsonObject = {
    ...object(
      canonicalJsonPort.parse(input.buildManifest.source),
      '$buildManifest',
    ),
  };
  manifest.artifactDigest = sha256(pageSource);

  return {
    ...input,
    buildManifest: {
      ...input.buildManifest,
      source: `${canonicalJsonPort.stringify(manifest)}\n`,
    },
    page: {
      ...input.page,
      source: pageSource,
    },
  };
}

describe('lowerProfunctorPageArtifacts', () => {
  it('rejects inherited object properties as target token references', () => {
    const input = fixtureInputWithPageMutation((page) => {
      const root = mutablePageNode(page, 0);
      root.tokens = {
        ...object(root.tokens, '$page.nodes[0].tokens'),
        surface: 'constructor',
      };
      page.tokenRefs = stringArray(page.tokenRefs, '$page.tokenRefs').map(
        (reference) =>
          reference === 'semantic.surface' ? 'constructor' : reference,
      );
    });

    expect(() => {
      lowerProfunctorPageArtifacts(input);
    }).toThrow(
      expect.objectContaining<Partial<ProfunctorPageTargetError>>({
        code: 'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      }),
    );
  });

  it('rejects XML 1.0-invalid control characters in preview labels', () => {
    expect(() =>
      renderProfunctorPageStructuralPreview('page\u0000id', '/', []),
    ).toThrow(
      expect.objectContaining({
        code: 'GEORDI_PAGE_OUTPUT_INVALID',
        path: '$preview',
      }),
    );
  });

  it('emits deterministic Geordi target artifacts', () => {
    const first = lowerProfunctorPageArtifacts(fixtureInput());
    const second = lowerProfunctorPageArtifacts(fixtureInput());

    expect(first).toEqual(second);
    expect(first.targetProfile).toBe('geordi-profunctor-page-structural/1');
    expect(first.artifacts.ir.path).toBe(PROFUNCTOR_PAGE_TARGET_IR_PATH);
    expect(first.artifacts.map.path).toBe(PROFUNCTOR_PAGE_TARGET_MAP_PATH);
    expect(first.artifacts.preview.path).toBe(PROFUNCTOR_PAGE_TARGET_PREVIEW_PATH);
    expect(first.artifacts.receipt.path).toBe(PROFUNCTOR_PAGE_TARGET_RECEIPT_PATH);
  });

  it('maps every visible page node into valid resolved rectangle IR', () => {
    const result = lowerProfunctorPageArtifacts(fixtureInput());
    const ir = object(canonicalJsonPort.parse(result.artifacts.ir.content), '$ir');
    const nodes = objectArray(ir.nodes, '$ir.nodes');

    expect(validateGeordiIr(ir).issues).toEqual([]);
    expect(ir.irVersion).toBe('geordi-ir/1');
    expect(ir.numericProfile).toBe('geordi-finite-binary64/1');
    expect(ir.requires).toEqual([
      'geordi/core/1',
      'layout.resolved',
      'shape.rect',
      'paint.solid',
    ]);
    expect(nodes.map((node) => node.kind)).toEqual([
      'Rect',
      'Rect',
      'Rect',
      'Rect',
      'Rect',
    ]);
    expect(nodes.map((node) => node.id)).toEqual([
      'geordi-node:page-node:project.keep#project-page.root',
      'geordi-node:page-node:project.keep#project-page.hero',
      'geordi-node:page-node:project.keep#project-page.facts',
      'geordi-node:page-node:project.keep#project-page.documentation',
      'geordi-node:page-node:project.keep#project-page.related',
    ]);
  });

  it('preserves semantic, source, token, and action evidence in the target map', () => {
    const result = lowerProfunctorPageArtifacts(fixtureInput());
    const map = object(canonicalJsonPort.parse(result.artifacts.map.content), '$map');
    const entries = objectArray(map.entries, '$map.entries');
    const tokens = objectArray(map.tokenTable, '$map.tokenTable');

    expect(map.version).toBe('geordi-profunctor-page-map/1');
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map((entry) => entry.renderNodeId)).size).toBe(5);
    expect(
      entries.flatMap((entry) =>
        objectArray(entry.sources, '$map.entries[].sources').map(
          (source) => source.sourceOccurrenceId,
        ),
      ),
    ).toEqual([
      'source-occurrence:projectCatalog.keep#record',
      'source-occurrence:projectCatalog.keep#fact.title',
    ]);
    expect(tokens.map((token) => token.reference)).toEqual([
      'semantic.focus',
      'semantic.interactive',
      'semantic.inverse-line',
      'semantic.inverse-surface-alt',
      'semantic.inverse-text',
      'semantic.inverse-text-muted',
      'semantic.line-strong',
      'semantic.surface',
      'semantic.surface-tint',
      'semantic.text',
      'semantic.text-muted',
    ]);
    expect(
      entries.flatMap((entry) =>
        objectArray(entry.actions, '$map.entries[].actions').map(
          (action) => action.href,
        ),
      ),
    ).toEqual([
      'https://github.com/flyingrobots/keep#readme',
      'https://github.com/flyingrobots/keep',
      'https://github.com/flyingrobots/keep#readme',
      '/projects/bunny/',
      '/projects/geordi/',
      '/projects/nine-lives/',
    ]);
  });

  it('binds target claims and all exact bytes in the receipt', () => {
    const input = fixtureInput();
    const result = lowerProfunctorPageArtifacts(input);
    const receipt = object(
      canonicalJsonPort.parse(result.artifacts.receipt.content),
      '$receipt',
    );

    expect(receipt.version).toBe('geordi-profunctor-page-receipt/1');
    expect(receipt.upstreamClaims).toEqual([
      'browser-native-flow',
      'semantic-document-structure',
    ]);
    expect(receipt.upstreamClaimsInherited).toBe(false);
    expect(receipt.targetClaims).toEqual([
      'resolved-rectangle-geometry',
      'semantic-node-to-render-node-identity',
      'structural-preview',
    ]);
    expect(receipt.inputHashes).toEqual({
      buildManifest: sha256(input.buildManifest.source),
      page: sha256(input.page.source),
      sourceMap: sha256(input.sourceMap.source),
    });
    expect(receipt.outputHashes).toEqual({
      ir: sha256(result.artifacts.ir.content),
      map: sha256(result.artifacts.map.content),
      preview: sha256(result.artifacts.preview.content),
    });
  });

  it('labels the SVG as structural diagnostic evidence', () => {
    const result = lowerProfunctorPageArtifacts(fixtureInput());

    for (const pageNodeId of [
      'page-node:project.keep#project-page.root',
      'page-node:project.keep#project-page.hero',
      'page-node:project.keep#project-page.facts',
      'page-node:project.keep#project-page.documentation',
      'page-node:project.keep#project-page.related',
    ]) {
      expect(result.artifacts.preview.content).toContain(pageNodeId);
    }
    expect(result.artifacts.preview.content).toContain(
      'Diagnostic SVG labels use host SVG text; no Geordi text claim.',
    );
    expect(result.artifacts.preview.content).toContain(
      'No semantic HTML, native-link, accessibility-tree, or website pixel-parity claim.',
    );
  });

  it('rejects invalid emitted IR through a stable target diagnostic', () => {
    expect(() => {
      validateProfunctorPageTargetIr({
        irVersion: 'geordi-ir/unsupported',
      });
    }).toThrow(
      expect.objectContaining<Partial<ProfunctorPageTargetError>>({
        code: 'GEORDI_PAGE_OUTPUT_INVALID',
      }),
    );
  });

  it('rejects a malformed action value instead of dropping evidence', () => {
    const input = fixtureInputWithPageMutation((page) => {
      mutablePageNode(page, 1).props = {
        ...object(mutablePageNode(page, 1).props, '$page.nodes[1].props'),
        documentationUrl: 42,
      };
    });

    expect(() => {
      lowerProfunctorPageArtifacts(input);
    }).toThrow(
      expect.objectContaining<Partial<ProfunctorPageTargetError>>({
        code: 'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      }),
    );
  });

  it('rejects duplicate semantic actions instead of emitting duplicate IDs', () => {
    const input = fixtureInputWithPageMutation((page) => {
      const node = mutablePageNode(page, 4);
      const props: MutableJsonObject = {
        ...object(node.props, '$page.nodes[4].props'),
      };
      const relatedProjects = objectArray(
        props.relatedProjects,
        '$page.nodes[4].props.relatedProjects',
      );
      props.relatedProjects = [
        ...relatedProjects,
        structuredClone(relatedProjects[0]),
      ];
      node.props = props;
    });

    expect(() => {
      lowerProfunctorPageArtifacts(input);
    }).toThrow(
      expect.objectContaining<Partial<ProfunctorPageTargetError>>({
        code: 'GEORDI_PAGE_INPUT_REFERENCE_INVALID',
      }),
    );
  });
});
