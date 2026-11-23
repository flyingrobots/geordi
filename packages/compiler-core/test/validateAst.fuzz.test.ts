import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateCanonicalAst } from '../src/compile/validateAst';
import { GeordiErrorCode } from '../src/errors';
import type { CanonicalSceneAst, Node, NodeKind } from '../src/types/ast';
import type { JsonObject, JsonValue } from '../src/types/json';

// Deterministic in CI: a fixed seed and a bounded run count. On a failure
// fast-check prints the seed, the path and the shrunk counterexample, so the run
// is reproduced by keeping this seed (or passing `{ seed, path }` to the property).
const SEED = 20260101;
const NUM_RUNS = 200;
fc.configureGlobal({ seed: SEED, numRuns: NUM_RUNS });

// Written by hand from the validator contract, not imported from the code under test.
const REQUIRED: Record<NodeKind, readonly string[]> = {
  Rect: ['width', 'height'],
  Text: ['content'],
  Image: ['src'],
  Ellipse: ['rx', 'ry'],
  Line: ['x2', 'y2'],
  Path: ['d'],
  Group: [],
};
const KINDS = Object.keys(REQUIRED) as NodeKind[];

const kindArb = fc.constantFrom(...KINDS);
const goodDimension = fc.double({ min: 5e-324, max: 1e9, noNaN: true });
// Includes NaN, +/-Infinity, -0, 0, negatives and tiny positives.
const anyDouble = fc.double();

function ast(partial: Partial<CanonicalSceneAst>): CanonicalSceneAst {
  return {
    kind: 'Scene',
    astVersion: '1',
    scene: { id: 'scene:fuzz', width: 100, height: 100 },
    nodes: [],
    ...partial,
  };
}

function fullProps(kind: NodeKind): JsonObject {
  const props: JsonObject = {};
  for (const name of REQUIRED[kind]) props[name] = 1;
  return props;
}

/** A forest with unique ids, parents drawn only from earlier nodes, all required props present. */
const validNodesArb = fc
  .array(fc.tuple(kindArb, fc.nat(), fc.boolean()), { maxLength: 12 })
  .map((specs) =>
    specs.map(([kind, pick, hasParent], i): Node => {
      const node: Node = { id: `n${i}`, kind, props: fullProps(kind) };
      if (hasParent && i > 0) node.parentId = `n${pick % i}`;
      return node;
    }),
  );

const validAstArb = fc
  .tuple(goodDimension, goodDimension, validNodesArb, fc.array(fc.nat(), { maxLength: 4 }))
  .map(([width, height, nodes, targets]) => {
    const refs = nodes.length === 0 ? [] : targets.map((t) => nodes[t % nodes.length].id);
    return ast({
      scene: { id: 'scene:fuzz', width, height },
      nodes,
      bindings: refs.map((targetNodeId, i) => ({
        id: `b${i}`,
        targetNodeId,
        targetProp: 'props.x',
        expression: 'x',
      })),
      animations: refs.map((targetNodeId, i) => ({
        id: `a${i}`,
        targetNodeId,
        property: 'props.x',
        keyframes: [{ t: 0, value: 0 }],
      })),
    });
  });

function codes(diagnostics: readonly { code: string }[]): string[] {
  return diagnostics.map((d) => d.code);
}

describe('validateCanonicalAst properties', () => {
  it('a valid AST never produces a diagnostic', () => {
    fc.assert(fc.property(validAstArb, (value) => validateCanonicalAst(value).length === 0));
  });

  it('a scene is dimension-invalid exactly when width or height is not finite or not positive', () => {
    fc.assert(
      fc.property(fc.oneof(anyDouble, fc.constantFrom(NaN, Infinity, -Infinity, -0, 0, 5e-324)), anyDouble, (width, height) => {
        const diagnostics = validateCanonicalAst(ast({ scene: { id: 's', width, height } }));
        const bad = !(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0);
        return codes(diagnostics).includes(GeordiErrorCode.E_SCENE_DIMENSIONS_INVALID) === bad;
      }),
    );
  });

  it('each non-finite, zero, negative-zero or negative dimension is an error and a very small positive one is not', () => {
    for (const value of [NaN, Infinity, -Infinity, -0, 0, -1, -5e-324]) {
      for (const scene of [
        { id: 's', width: value, height: 10 },
        { id: 's', width: 10, height: value },
      ]) {
        expect(codes(validateCanonicalAst(ast({ scene })))).toEqual([
          GeordiErrorCode.E_SCENE_DIMENSIONS_INVALID,
        ]);
      }
    }
    expect(validateCanonicalAst(ast({ scene: { id: 's', width: 5e-324, height: 1e-300 } }))).toEqual([]);
  });

  it('a graph with unique ids reports a cycle for exactly the nodes whose parent chain loops', () => {
    const poolSize = 6;
    const graphArb = fc.array(fc.option(fc.nat({ max: poolSize - 1 }), { nil: undefined }), {
      maxLength: poolSize,
    });
    fc.assert(
      fc.property(graphArb, (parents) => {
        const nodes: Node[] = parents.map((p, i) => ({
          id: `n${i}`,
          kind: 'Group',
          props: {},
          ...(p === undefined ? {} : { parentId: `n${p}` }),
        }));
        // Parents that point past the end of the array are dangling, so they act as roots here.
        const exists = (i: number) => i < parents.length;
        const expected = new Set<string>();
        parents.forEach((_, start) => {
          const seen = new Set<number>();
          let cur: number | undefined = start;
          while (cur !== undefined && exists(cur)) {
            if (seen.has(cur)) {
              expected.add(`n${start}`);
              return;
            }
            seen.add(cur);
            const next: number | undefined = parents[cur];
            cur = next !== undefined && exists(next) ? next : undefined;
          }
        });
        const reported = new Set(
          validateCanonicalAst(ast({ nodes }))
            .filter((d) => d.code === GeordiErrorCode.E_CYCLE_DETECTED)
            .map((d) => (d.details as { nodeId: string }).nodeId),
        );
        expect([...reported].sort()).toEqual([...expected].sort());
      }),
    );
  });

  it('duplicate ids and nodes with several parents never produce a false cycle when parents always have a lower index', () => {
    const entryArb = fc.tuple(fc.nat({ max: 4 }), fc.option(fc.nat({ max: 4 }), { nil: undefined }));
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 12 }), (entries) => {
        const nodes: Node[] = entries
          .filter(([i, p]) => p === undefined || p < i)
          .map(([i, p]) => ({
            id: `n${i}`,
            kind: 'Group',
            props: {},
            ...(p === undefined ? {} : { parentId: `n${p}` }),
          }));
        const diagnostics = validateCanonicalAst(ast({ nodes }));
        expect(codes(diagnostics)).not.toContain(GeordiErrorCode.E_CYCLE_DETECTED);
      }),
    );
  });

  it('a node that is its own parent is a cycle, and so is a two-node loop', () => {
    const self = validateCanonicalAst(
      ast({ nodes: [{ id: 'a', kind: 'Group', props: {}, parentId: 'a' }] }),
    );
    expect(codes(self)).toEqual([GeordiErrorCode.E_CYCLE_DETECTED]);
    const loop = validateCanonicalAst(
      ast({
        nodes: [
          { id: 'a', kind: 'Group', props: {}, parentId: 'b' },
          { id: 'b', kind: 'Group', props: {}, parentId: 'a' },
        ],
      }),
    );
    expect(codes(loop)).toEqual([GeordiErrorCode.E_CYCLE_DETECTED, GeordiErrorCode.E_CYCLE_DETECTED]);
  });

  it('every omitted required prop yields exactly one missing-prop diagnostic and nothing else', () => {
    const nodeArb = kindArb.chain((kind) =>
      fc
        .tuple(
          fc.constant(kind),
          fc.array(fc.boolean(), {
            minLength: REQUIRED[kind].length,
            maxLength: REQUIRED[kind].length,
          }),
          fc.array(fc.constantFrom('omit', 'null', 'undefined'), {
            minLength: REQUIRED[kind].length,
            maxLength: REQUIRED[kind].length,
          }),
        ),
    );
    fc.assert(
      fc.property(fc.array(nodeArb, { maxLength: 10 }), (specs) => {
        const nodes: Node[] = [];
        const expected: string[] = [];
        specs.forEach(([kind, missing, how], i) => {
          const props: JsonObject = {};
          REQUIRED[kind].forEach((name, j) => {
            if (!missing[j]) {
              props[name] = 1;
              return;
            }
            // 'omit' leaves the key out entirely.
            if (how[j] === 'null') props[name] = null;
            else if (how[j] === 'undefined') props[name] = undefined;
            expected.push(`n${i}:${name}`);
          });
          nodes.push({ id: `n${i}`, kind, props });
        });
        const diagnostics = validateCanonicalAst(ast({ nodes }));
        expect(codes(diagnostics).every((c) => c === GeordiErrorCode.E_PROP_REQUIRED_MISSING)).toBe(true);
        const actual = diagnostics.map((d) => {
          const details = d.details as { nodeId: string; prop: string };
          return `${details.nodeId}:${details.prop}`;
        });
        expect(actual.sort()).toEqual(expected.sort());
      }),
    );
  });

  it('validation never throws on a well-typed AST with arbitrary ids, kinds, numbers and JSON props', () => {
    const idArb = fc.oneof(
      fc.string(),
      fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty', ''),
    );
    const jsonObjectArb = fc.dictionary(
      fc.oneof(fc.string(), fc.constantFrom('__proto__', 'constructor', 'width', 'd')),
      fc.jsonValue() as fc.Arbitrary<JsonValue>,
    ) as fc.Arbitrary<JsonObject>;
    const nodeArb: fc.Arbitrary<Node> = fc
      .record({
        id: idArb,
        kind: fc.oneof(kindArb, fc.string()),
        props: jsonObjectArb,
      })
      .chain((base) =>
        fc.option(idArb, { nil: undefined }).map(
          (parentId): Node => ({ ...base, ...(parentId === undefined ? {} : { parentId }) }),
        ),
      );
    fc.assert(
      fc.property(
        anyDouble,
        anyDouble,
        fc.array(nodeArb, { maxLength: 10 }),
        fc.array(idArb, { maxLength: 3 }),
        (width, height, nodes, targets) => {
          const value = ast({
            scene: { id: 's', width, height },
            nodes,
            bindings: targets.map((targetNodeId, i) => ({
              id: `b${i}`,
              targetNodeId,
              targetProp: 'p',
              expression: 'e',
            })),
          });
          const diagnostics = validateCanonicalAst(value);
          return diagnostics.every((d) => typeof d.code === 'string' && d.severity === 'error');
        },
      ),
    );
  });

  it('diagnostics are identical across repeated calls and validation does not mutate its input', () => {
    const nodeArb = fc.record({
      id: fc.constantFrom('a', 'b', 'c', 'd'),
      kind: fc.oneof(kindArb, fc.constant('Widget')),
      props: fc.dictionary(fc.constantFrom('width', 'height', 'content', 'src', 'd'), fc.constantFrom(1, null)),
      parentId: fc.option(fc.constantFrom('a', 'b', 'c', 'x'), { nil: undefined }),
    });
    fc.assert(
      fc.property(anyDouble, fc.array(nodeArb, { maxLength: 8 }), (width, nodes) => {
        const value = ast({
          scene: { id: 's', width, height: 10 },
          nodes: nodes.map((n): Node => {
            const { parentId, ...rest } = n;
            return parentId === undefined ? rest : { ...rest, parentId };
          }),
        });
        const before = structuredClone(value);
        const first = validateCanonicalAst(value);
        const second = validateCanonicalAst(value);
        expect(second).toEqual(first);
        expect(value).toEqual(before);
      }),
    );
  });
});
