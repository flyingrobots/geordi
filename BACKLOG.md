# Geordi Backlog

Items are grouped by priority and readiness.

- **P0 Stabilization**: release-blocking or repo-trust work needed before v0.1 can be considered shippable.
- **Other sections**: scoped follow-up work that is not yet scheduled for a sprint.

When a P0 item groups an existing lower-priority note, the lower entry remains as historical detail
until the work is resolved.

---

## P0 Stabilization

These open items come from the repo audit and the v0 design pass. See
[`BEARING.md`](./BEARING.md) for the current operating map and
[`docs/V0_DESIGN_LAWS.md`](./docs/V0_DESIGN_LAWS.md) for the product and runtime-contract rationale.

---

### Make `geordi-ir/1` the runtime contract
**Priority**: P0
**Source**: v0 design laws, repo audit

`@flyingrobots/geordi-compiler-core` emits `geordi-ir/1`, while `@flyingrobots/geordi-core` and
`@flyingrobots/geordi-runtime-webgl` still model/render an older `version`/`canvas`/`type`/`bounds`
scene shape. Per the v0 design decision, `geordi-ir/1` should be the public renderer contract.
Any draw-ready lowering should be an internal runtime cache or preparation step, not a second
public scene format.

Acceptance criteria:
- `@flyingrobots/geordi-core` owns versioned `geordi-ir/1` types and validation.
- `@flyingrobots/geordi-runtime-webgl` accepts validated `geordi-ir/1` directly, or exposes only an
  internal `prepare(ir)` path before rendering.
- At least one integration test proves compiler output can be accepted by the runtime contract.
- Legacy scene-model types are migrated, deprecated, or explicitly renamed before v0.1 release.

---

### Define the graphics numeric profile
**Priority**: P0
**Source**: v0 design laws, graphics determinism discussion

Canonical JSON can make bytes deterministic, but it cannot by itself define graphics fidelity for
floats, vectors, matrix math, transforms, and shader-adjacent values. The IR needs an explicit
numeric profile before Geordi can claim pixel-identical cross-runtime rendering.

Acceptance criteria:
- The JSON port is the only production JSON ingress/egress path and rejects non-finite numbers.
- `-0` canonicalizes to `0`; no generic JSON layer silently rounds or rescales author values.
- Layout-critical geometry fields either use a named fixed-point scalar, such as `px * scale`, or a
  documented deterministic float profile.
- Matrix/vector/transform values have an explicit representation and operation-order rule.
- `geordi-ir/1` declares the numeric profile required by the scene, and runtimes fail loudly when
  they do not support it.

---

### Validate GraphQL directive argument types at runtime
**Priority**: P0
**Source**: Repo audit, existing Post-Sprint 3 feedback

`schema-graphql/extractNodes.ts` casts directive values with `as number`, `as boolean`, and
`as string` after parsing SDL. Since this path does not perform GraphQL schema validation, wrong
argument types can corrupt geometry and props. Replace unsafe casts with typed extractors that emit
source-located diagnostics.

Acceptance criteria:
- Numeric, boolean, string, enum, and JSON-object directive arguments are validated at runtime.
- Wrong directive argument types emit `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE` with source location and
  useful details.
- Invalid geometry/id/parent/visibility args cause `compile().ok === false`.
- Existing lower backlog item `schema-graphql/extractNodes - runtime type validation for directive
  argument values` is resolved or updated.

---

### Lower or explicitly reject every known Geordi directive
**Priority**: P0
**Source**: Repo audit, fail-loud principle

`geordi_bind` and `geordi_style` are declared and treated as known directives, but they are not
lowered into canonical AST or IR. Known directives must not be silently dropped.

Acceptance criteria:
- `geordi_bind` lowers into `bindings[]`, or returns an explicit unsupported-feature diagnostic.
- `geordi_style` lowers into node style data, or returns an explicit unsupported-feature diagnostic.
- Unknown `geordi_*` directives still produce the intended warning behavior.
- No known Geordi directive is ignored without a diagnostic.

---

### Preserve typed diagnostics across adapter/compiler boundaries
**Priority**: P0
**Source**: Repo audit, existing Post-Sprint 3 feedback

`parseGraphql()` can produce typed parse errors with source locations, but adapter exceptions can be
wrapped as `GEORDI_E_INTERNAL_INVARIANT` by `parseInputToCanonicalAst()`. Add typed diagnostic
transport so user-facing parse and directive errors survive the `schema-graphql` to `compiler-core`
boundary.

Acceptance criteria:
- Add a `DiagnosticsError` or equivalent typed diagnostic transport.
- Invalid SDL through `compile()` reports `GEORDI_E_INPUT_INVALID_SDL`, not an internal invariant.
- Missing scene through `compile()` reports `GEORDI_E_SCENE_MISSING`, without a duplicate internal
  error.
- Source locations survive through `compile()`.
- Existing lower backlog items for `parseInput.ts` SDL locations and `DiagnosticsError` are resolved
  or updated.

---

### Expand package contract tests beyond smoke coverage
**Priority**: P0
**Source**: Repo audit

`@flyingrobots/geordi-runtime-webgl` and `@flyingrobots/geordi-wesley-generator` now have public
entrypoint contract tests, and the repo has a placeholder-test guard. They still need behavior tests
that prove the runtime and generator contracts rather than only import shape.

Acceptance criteria:
- `wesley-generator` tests plan/generate on minimal SDL and asserts emitted artifacts.
- `runtime-webgl` tests the selected IR input contract, with a canvas/context mock if needed.
- Keep the post-build package import smoke test in CI.

---

## Completed Stabilization Work

These P0 items were completed in the 2026-05-22 stabilization merge and are retained here as
historical context.

- Node ESM package exports are importable after build; `pnpm test:exports` imports every public
  package entrypoint after `pnpm build`.
- ESLint 10 is a real CI gate through root flat config plus package lint tasks.
- Canonicalization is implemented through `normalizeCanonicalAst()` and wired behind
  `canonicalize: true`.
- Tracked generated Turbo logs and stale nested lockfiles were removed.
- Turbo task outputs are aligned with command behavior: plain `test` has no coverage output, and
  `test:coverage` owns coverage output.
- Placeholder-only tests were removed, and `pnpm test:placeholders` prevents reintroduction.
- Package name drift is guarded by `pnpm test:package-names`.
- Documentation hygiene is guarded by `pnpm test:docs`.
- Process scratchpad files are guarded by `pnpm test:repo-sludge`.

---

## Compiler Core

### `buildIdentifierMap` — add `deduplicate` option
**Issue**: [#2](https://github.com/flyingrobots/geordi/issues/2)

`buildIdentifierMap(sources, opts)` currently accepts duplicate source strings but the
`Map<string, string>` return type can only hold one value per key, making the behaviour on
duplicates implicit. Add a `deduplicate?: boolean` option that, when `false` (default),
documents and tests the per-occurrence uniqueness guarantee explicitly.

---

### `emitReceiptArtifact` — move to artifact builder method
**Issue**: [#3](https://github.com/flyingrobots/geordi/issues/3)

`emitReceiptArtifact(input, irContent, ruleIds)` receives the IR content as a raw string,
creating an implicit coupling between caller and callee on string type correctness. Consider
an `ArtifactBuilder` class or builder pattern so IR content never crosses a function boundary
as an untyped string — the builder holds the IR artifact and computes the receipt internally.

---

### `validateAst` — property-based fuzz tests (fast-check)
**Issue**: [#4](https://github.com/flyingrobots/geordi/issues/4)

Add fuzz coverage via `fast-check` for:
- `detectCycles`: arbitrary DAGs with random parent assignments including cycles, duplicate IDs, and disconnected subgraphs
- `sceneDimensions`: numeric edge cases (`NaN`, `Infinity`, `-0`, `Number.MIN_VALUE`)
- `requiredProps`: randomly missing props across all NodeKinds

Target package: `@flyingrobots/geordi-compiler-core`. Add `fast-check` as a dev dependency.

---

### `emitTypes` test — CI-gated TSC typecheck
**Issue**: [#5](https://github.com/flyingrobots/geordi/issues/5)

`emitTypes.test.ts` shells out to `node_modules/.bin/tsc` with a hardcoded path that breaks
under PNP or hoisted workspace setups. Fix by resolving via `require.resolve('typescript/bin/tsc')`
and gate the slow typecheck behind `process.env.CI || process.env.TSC_GATE` so local runs stay fast.

---

### `emitTypes` test — Group-kind zero-props interface
**Issue**: [#6](https://github.com/flyingrobots/geordi/issues/6)

No test asserts that a scene containing only `Group` nodes emits a valid `GroupNode` interface
with an empty `props` block. This is an edge case in `TypeEmitter.emitKindInterface` where
`KIND_PROP_TYPES[kind]` returns an empty array. Add a dedicated test.

---

## Schema GraphQL

### `parseInput.ts` — surface `E_INPUT_INVALID_SDL` source location to diagnostics
**Issue**: [#7](https://github.com/flyingrobots/geordi/issues/7)

When `parseGraphql` throws a `ParseError` with `E_INPUT_INVALID_SDL`, `parseInput.ts` currently
catches it and converts to a diagnostic but loses the GraphQL source location (`line`, `column`)
from the original `ParseError`. Propagate the location into `Diagnostic.details` so callers can
report precise SDL error positions to users.

---

## Post-Sprint 3 PR Feedback (Round 2)

### ESLint — add no-new-in-loops rule for Set/Map allocations
**Source**: PR #1 review retrospective

`new Set([...])` was allocated inside a nested loop in `extractNodes.ts` on every directive of
every field. A custom ESLint rule (or `no-restricted-syntax` selector) that flags `new Set(` /
`new Map(` inside loop bodies would catch this class of issue automatically during development.

---

### `DiagnosticsError` — attach diagnostics array to thrown Errors
**Source**: PR #1 review retrospective

When `adapter.ts` throws on `extractScene` failure, the thrown `Error` said "see diagnostics"
but the diagnostics were in a local array invisible to the caller. Introduce a `DiagnosticsError`
class in `@flyingrobots/geordi-compiler-core` that carries a `diagnostics: Diagnostic[]` field. Any throw site
that has collected diagnostics should use this class so callers can always inspect the reason.

---

### `buildIdentifierMap` — property-based tests (fast-check)
**Source**: PR #1 review retrospective

A latent bug in `buildIdentifierMap` for duplicate source strings was discovered during code
review — the output `Map` silently overwrote earlier entries. Property-based testing with
`fast-check` (arbitrary string arrays, including duplicates) would have caught this. Extend the
existing `fast-check` backlog item (#4) or add a dedicated suite for `identifiers.ts`.

---

### `extractNodes` — add test: `W_UNUSED_FIELD` emitted for malformed `props` JSON
**Source**: PR #1 review retrospective

`extractNodes.ts` now emits `W_UNUSED_FIELD` when the `props` directive argument contains
invalid JSON. Add a test in `extractNodes.test.ts` asserting that a field with `props: "bad json"`
produces exactly one `W_UNUSED_FIELD` warning with the expected message.

---

### `identifiers` — add test: `buildIdentifierMap` throws on duplicate sources
**Source**: PR #1 review retrospective

`buildIdentifierMap` now throws `Error('buildIdentifierMap: duplicate source strings are not
supported')` when given duplicate inputs. Add a unit test asserting this throw, and a
complementary test that unique inputs with the same `toTypeIdentifier` result (collision)
still produce the correct `__N`-suffixed output.

---

## Post-Sprint 3 PR Feedback (Round 3)

### `compiler-core` — extract a `constants.ts` barrel for all artifact path strings
**Source**: PR #1 review retrospective

`'scene.geordi.json'`, `'scene.geordi.json.receipt'`, and `'geordi-ir/1'` were used as string
literals in multiple files before being extracted as named constants in round 3. A single
`src/constants.ts` barrel (or equivalent) for all artifact paths, IR version strings, and other
shared literals would prevent this class of issue from recurring across future sprints.

---

### CI — add markdownlint for CHANGELOG and docs validation
**Source**: PR #1 review retrospective

The CHANGELOG had duplicate `### Features` and `### Tests` headings, a missing `kind ASC`
tie-breaker in a sort order description, and descending test count bullets — all caught in code
review, not CI. Add `markdownlint` (with `MD024` for duplicate headings) to the CI pipeline and
enforce it on `CHANGELOG.md` and `docs/`. Consider a custom rule or script to detect
contradictory/descending test count totals.

---

### `CONTRIBUTING.md` — document the artifact path constants convention
**Source**: PR #1 review retrospective

Add a `CONTRIBUTING.md` section (or expand an existing one) that states: "Never use string
literals for artifact paths, IR versions, or other shared protocol strings. Import and use the
exported constants from `src/constants.ts` (or the relevant module). Inline string literals that
duplicate a constant will be rejected in code review."

---

### `buildIdentifierMap` — resolve API contract: `Map<string,string>` vs `string[]`
**Source**: PR #1 review retrospective (raised in rounds 2 and 3)

CodeRabbit flagged in two consecutive reviews that `Map<string,string>` collapses duplicate
source strings and suggested returning `string[]` (parallel to input) instead. The current
implementation throws on duplicates as a guard. Decide the definitive API contract in a focused
PR: either keep `Map<string,string>` with the throw guard (and document it clearly), or change
the return type to `string[]` and update all callers and tests accordingly.

---

### `schema-graphql/extractNodes` — runtime type validation for directive argument values
**Source**: PR #1 review retrospective (raised in rounds 2–5, deferred)

`getDirectiveArgValue` returns `string | number | boolean | undefined`, but the call sites at
lines 102–109 in `extractNodes.ts` cast results with `as number | undefined`, `as boolean | undefined`,
etc., without any runtime type assertion. If a user writes `@geordi_node(x: "oops")`, the string
`"oops"` silently passes through as a `number` at the type level, corrupting geometry downstream.

Fix: replace the unsafe `as` casts with runtime type guards that emit `E_DIRECTIVE_ARG_INVALID_TYPE`
when the actual value type doesn't match the expected type (e.g. `typeof val === 'number'` for
numeric args). Only `kind` (enum string) and `props` (special JSON parse) need special treatment.

---

### `schema-graphql` e2e — add explicit tie-breaking assertion for same-zIndex nodes
**Source**: PR #1 review retrospective (rounds 3–5)

The Terminal SDL e2e test (`e2e.terminal.test.ts`) verifies that nodes are sorted by `zIndex`
in the IR output but does not verify the within-zIndex tie-breaker: `kind ASC → id ASC` (bytewise).
The Terminal fixture has three nodes all at `zIndex: 0` (none specified), so the output order is
entirely determined by the tie-breaker. Add an assertion that pins the exact node order
(e.g. `expect(ir.nodes.map(n => n.id)).toEqual(['expected', 'order', 'here'])`) to verify
the tie-breaking contract end-to-end.

---

### `compiler-core/types/compiler.ts` — clarify receipt auto-emission coupling
**Source**: PR #1 review round 5

`emit.irJson: true` silently co-emits the receipt artifact with no public API knob to disable it.
Add a JSDoc comment on the `irJson` field explaining that the receipt is always co-emitted when
`irJson` is enabled. Alternatively, expose a `receipt?: boolean` field in the emit options
(defaulting to `true` when `irJson` is enabled) to make the coupling explicit in the public API.

---
