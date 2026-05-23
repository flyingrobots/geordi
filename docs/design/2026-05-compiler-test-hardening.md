# Compiler Test Hardening Design

**Status**: Draft
**Date**: 2026-05-23
**Slices Covered**: 8 and 9
**GitHub Issues**: #6 and #5

## Problem

The next small compiler slices are not feature work. They harden type-emission tests and remove
test-environment assumptions that can make CI or local runs misleading.

The live backlog items are:

- Issue #6: add coverage for the `Group` node type-emission edge case.
- Issue #5: resolve the emitted-type `tsc` gate in a package-manager-safe way and gate the slow
  check behind CI or an explicit local env var.

## Current Evidence

`TypeEmitter` emits per-kind interfaces from `KIND_PROP_TYPES`. `Group` currently has no required
props, but it does have optional geometry and opacity props. The design issue should therefore be
treated as the "zero required props" edge, not necessarily an empty `props` object.

`emitTypes.test.ts` already resolves TypeScript through `require.resolve('typescript/bin/tsc')`.
The remaining work for issue #5 is to add the CI/local opt-in gate while preserving CI coverage.

## Goals

- Pin `GroupNode` emitted shape with a dedicated test.
- Ensure generated TypeScript typechecking still runs in CI.
- Keep local unit tests fast unless `TSC_GATE` is set.
- Avoid hardcoded `node_modules/.bin` paths.

## Non-Goals

- Do not redesign the type emitter.
- Do not change emitted type semantics unless the new tests expose a real bug.
- Do not remove generated-type compile coverage from CI.
- Do not add a new package runner dependency.

## Slice 8 Design: Group Zero-Required-Props Type Test

### Test Shape

Add a test in `packages/compiler-core/test/emitTypes.test.ts` that builds a scene with only a
`Group` node:

```ts
const ast = makeAst({
  nodes: [{ id: 'group', kind: 'Group', props: {} }],
});
```

The test should assert:

- `export interface GroupNode` exists.
- `kind: "Group"` exists.
- `props` is emitted as a valid object block.
- The generated `SceneNode` union is exactly `GroupNode`.
- No unrelated node interfaces are emitted.

Because current `Group` props are optional rather than empty, the expected output should be pinned
to the current contract:

```ts
export interface GroupNode {
  id: string;
  kind: "Group";
  props: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    opacity?: number;
  };
}
```

If implementation chooses to make `Group` truly zero-prop later, that should be a separate
behavioral change and should update this design.

### Acceptance Criteria

- Dedicated `Group`-only type-emission test exists.
- Test pins the exact expected `GroupNode` block.
- Test proves `SceneNode = GroupNode`.
- Compiler-core tests pass.

## Slice 9 Design: CI-Gated Generated-Type TSC Check

### Gate Policy

Generated TypeScript should be compiled by `tsc --noEmit` when:

- `process.env.CI === 'true'`
- or `process.env.TSC_GATE === '1'`

Local default test runs may skip the slow `tsc` subprocess, but they should still execute all
pure emitter assertions.

### Proposed Helper

```ts
function shouldRunGeneratedTypesTsc(): boolean {
  return process.env.CI === 'true' || process.env.TSC_GATE === '1';
}
```

The existing `require.resolve('typescript/bin/tsc')` resolution should remain. If ESM constraints
make `require.resolve` unavailable in the test runtime, use `createRequire(import.meta.url)` and
call `require.resolve` from that created require.

### Test Behavior

The generated-type compile test should:

- Return early when the gate is disabled.
- Write the generated `types.ts` and `tsconfig.json` to a temp directory when enabled.
- Run the resolved TypeScript binary from the temp directory.
- Throw `GeneratedTypesTypecheckError` with stdout/stderr if the subprocess fails.
- Remove the temp directory in `finally`.

### CI Requirement

GitHub Actions should keep running the gate because `CI=true` is set in GitHub Actions by default.
If that assumption is ever false, CI must set `TSC_GATE=1` explicitly.

### Acceptance Criteria

- No test shells out to `node_modules/.bin/tsc`.
- Generated-type TSC check is skipped locally unless `TSC_GATE=1`.
- Generated-type TSC check runs in CI.
- Compiler-core tests pass locally.
- PR CI proves the gated path remains covered.

## Verification

Local slice gates:

```bash
pnpm --filter @flyingrobots/geordi-compiler-core test
pnpm --filter @flyingrobots/geordi-compiler-core typecheck
pnpm --filter @flyingrobots/geordi-compiler-core lint
```

Explicit local slow gate:

```bash
TSC_GATE=1 pnpm --filter @flyingrobots/geordi-compiler-core test
```

Full PR gate remains the standard repository gate from
[`2026-05-operating-docs-and-pr-gates.md`](./2026-05-operating-docs-and-pr-gates.md).
