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
**Status**: Completed. Core owns versioned `geordi-ir/1` types and structural validation,
compiler-core emits/re-exports that shared contract, runtime-webgl validates and renders
`geordi-ir/1` through its primary API, and the old draw-ready scene shape is explicitly named
`PreparedGeordiScene` for runtime internals. Compatibility aliases remain during the v0.1
migration, but they are no longer the documented public renderer contract.

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
**Status**: Completed. Core owns the canonical JSON port and the v0
`geordi-finite-binary64/1` numeric profile. `geordi-ir/1` declares `numericProfile`,
compiler receipts include it, runtime-webgl declares its supported runtime profile, and runtime
rendering fails loudly when IR asks for an unsupported profile.

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

### Define the baseline feature/capability profile
**Priority**: P0
**Source**: v0 design laws, cross-runtime compliance contract
**Status**: Completed. Core owns `GEORDI_CORE_PROFILE` and `GEORDI_BASELINE_FEATURES`,
`geordi-ir/1` validates `requires`, compiler-core emits the baseline requirements in IR and
receipts, and runtime-webgl declares and enforces the same requirement set before rendering.

The numeric profile defines number semantics, but it does not say which render features a scene
requires. `geordi-ir/1` needs a small, explicit feature declaration so runtimes fail loudly instead
of approximating unsupported nodes, effects, text modes, or future layout features.

Acceptance criteria:
- `@flyingrobots/geordi-core` owns the baseline feature vocabulary and validates `ir.requires`.
- Compiler-emitted `scene.geordi.json` includes the baseline `requires` list.
- Receipts record feature requirements and a deterministic feature-requirement hash.
- Runtime profiles declare the feature requirements they support.
- Runtime rendering rejects missing or unsupported feature requirements before drawing.

---

### Define the strict text/font profile
**Priority**: P0
**Source**: v0 design laws,
[`docs/design/2026-05-strict-text-font-profile.md`](./docs/design/2026-05-strict-text-font-profile.md)
**Status**: Ready for implementation. The current baseline remains `text.raw-runtime-shaping`;
strict text features must be known to the IR contract without being emitted by default until the
compiler can lower text deterministically.

The current renderer path lets the runtime shape raw text. That is useful for v0 rendering, but it
cannot support a pixel-identical cross-runtime text claim because font lookup, glyph fallback,
shaping, line breaking, and metrics vary by platform. Strict text needs an explicit profile that
uses content-addressed fonts and precomputed glyph runs.

Acceptance criteria:
- Core owns strict text feature names for font packs, shaping profile, line-breaking profile,
  fallback chain, glyph runs, and line boxes.
- `GEORDI_BASELINE_FEATURES` continues to emit `text.raw-runtime-shaping` until strict text
  lowering exists.
- Compiler-core does not emit strict text requirements until it emits deterministic glyph runs and
  font asset references.
- Runtime profiles reject strict text requirements unless the runtime supports the full strict text
  contract.
- Receipts continue to record the exact feature requirements emitted by the compiler.

---

## Completed Stabilization Work

These P0 items were completed in the 2026-05-22 stabilization work and are retained here as
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
- Typed diagnostics are preserved across the `schema-graphql` adapter to `compiler-core` boundary;
  invalid SDL and missing scene failures no longer collapse into `GEORDI_E_INTERNAL_INVARIANT`.
- GraphQL `@geordi_scene` and `@geordi_node` directive arguments are read through typed runtime
  extractors; wrong literal types, non-finite numeric values, and invalid `props` JSON object
  payloads produce `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE`.
- Known but unlowered GraphQL directives, currently `geordi_bind` and `geordi_style`, fail loudly
  with `GEORDI_E_FEATURE_NOT_IMPLEMENTED`; unknown future `geordi_*` directives remain warnings.
- Package contract tests now exercise behavior: `wesley-generator` plans/generates artifacts from
  minimal SDL and fails with a custom error on bad SDL, while `runtime-webgl` renders the current
  scene contract against a canvas/context mock.
- `geordi-ir/1` is the runtime contract: core owns IR validation, compiler-core emits the shared
  contract, runtime-webgl validates IR at the boundary, fail-loud prop lowering rejects invalid
  drawable props, and compiler output is rendered through the runtime contract in tests.
- Graphics numeric profile is explicit: core owns `geordi-finite-binary64/1`, canonical JSON
  rejects non-finite numbers and canonicalizes `-0`, compiler IR and receipts declare the profile,
  and runtime-webgl rejects unsupported numeric profiles before rendering.
- Baseline feature profile is explicit: core owns `GEORDI_BASELINE_FEATURES`, compiler IR and
  receipts declare `requires`, receipts include `featureRequirementsHash`, and runtime-webgl
  rejects missing or unsupported feature requirements before rendering.

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
**Status**: Implemented in `codex/execute-next-hit-list`; closes when the PR merges.

`emitTypes.test.ts` shells out to `node_modules/.bin/tsc` with a hardcoded path that breaks
under PNP or hoisted workspace setups. Fix by resolving via `require.resolve('typescript/bin/tsc')`
and gate the slow typecheck behind `process.env.CI || process.env.TSC_GATE` so local runs stay fast.

---

### `emitTypes` test — Group-kind zero-props interface
**Issue**: [#6](https://github.com/flyingrobots/geordi/issues/6)
**Status**: Implemented in `codex/execute-next-hit-list`; closes when the PR merges.

No test asserts that a scene containing only `Group` nodes emits a valid `GroupNode` interface
with an empty `props` block. This is an edge case in `TypeEmitter.emitKindInterface` where
`KIND_PROP_TYPES[kind]` returns an empty array. Add a dedicated test.

---

## Schema GraphQL

### `parseInput.ts` — surface `E_INPUT_INVALID_SDL` source location to diagnostics
**Issue**: [#7](https://github.com/flyingrobots/geordi/issues/7)
**Status**: Resolved by the typed diagnostics transport P0 work. GitHub issue #7 is closed.

When `parseGraphql` throws a `ParseError` with `E_INPUT_INVALID_SDL`, `parseInput.ts` currently
catches it and converts to a diagnostic but loses the GraphQL source location (`line`, `column`)
from the original `ParseError`. Propagate the location into `Diagnostic.details` so callers can
report precise SDL error positions to users.

Open GitHub-backed backlog after this reconciliation: #2, #3, and #4 remain active after the
current PR merges.

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
**Status**: Resolved by the typed diagnostics transport P0 work.

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
**Status**: Superseded. Invalid `props` JSON now emits `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE`;
`W_UNUSED_FIELD` remains reserved for unknown `geordi_*` directives.

The earlier proposal expected malformed `props` JSON to warn as `W_UNUSED_FIELD`. That behavior
was superseded by the fail-loud directive argument rule: malformed or non-object `props` payloads
are argument errors, not unused fields.

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
**Status**: Resolved by the directive argument validation P0 work.

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
