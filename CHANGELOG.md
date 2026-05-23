# Changelog

## Unreleased

### Dependencies

- Bump `vitest` from `^1.3.0` to `^3.2.4` across all packages; add `esbuild >=0.25.0` override (CVE fix)

### Features

- **`@flyingrobots/geordi-core`**: Add core-owned `geordi-ir/1` constants, current `GeordiIr` types,
  and structural validation for scenes, nodes, bindings, animations, keyframes, and finite
  numeric fields.
- **`@flyingrobots/geordi-compiler-core`**: Re-export IR types from
  `@flyingrobots/geordi-core` and emit the shared core IR constants for artifact keys, receipt
  keys, version, and hash algorithm.
- **`@flyingrobots/geordi-runtime-webgl`**: Add a typed `geordi-ir/1` preparation path plus
  `renderGeordiIrToCanvas()` so runtime callers can render core-owned IR through the existing
  canvas renderer while legacy scene rendering remains available during migration.
- **`@flyingrobots/geordi-runtime-webgl`**: Promote `renderGeordiToCanvas()` to the primary
  public `geordi-ir/1` rendering API, add `renderPreparedSceneToCanvas()` for the draw-ready
  runtime scene shape, and retain `renderGeordiIrToCanvas()` as a compatibility alias.
- **`@flyingrobots/geordi-core`**: Rename the draw-ready scene model at the type level with
  `PreparedGeordiScene` and `PreparedGeordiNode` aliases so the public contract is no longer
  confused with `geordi-ir/1`.
- **`@flyingrobots/geordi-core`**: Own the v0 graphics numeric profile
  (`geordi-finite-binary64/1`), graphics-number helpers, and the canonical JSON port with custom
  parse, non-finite-number, and stringify error types.
- **`@flyingrobots/geordi-compiler-core`**: Emit `numericProfile` in `scene.geordi.json` and
  `scene.geordi.json.receipt`, and re-export the core-owned canonical JSON port for compatibility.
- **`@flyingrobots/geordi-runtime-webgl`**: Add `GEORDI_WEBGL_RUNTIME_PROFILE` and fail loudly
  with `GeordiRuntimeUnsupportedProfileError` when IR requests an unsupported IR version or
  numeric profile.
- **Public API**: De-version the current IR TypeScript surface (`GeordiIr`,
  `validateGeordiIr()`, `isGeordiIr()`) and compiler target (`geordi-ir`) while preserving
  `irVersion: "geordi-ir/1"` as the serialized contract identity.
- **Root scripts**: Add `pnpm wesley` as a thin shell-out to the installed `wesley` CLI.
- **`@flyingrobots/geordi-compiler-core`**: Add a canonical source-location model shared by AST
  `SourceRef` and diagnostics, including optional spans and offsets.
- **`@flyingrobots/geordi-schema-graphql`**: Preserve GraphQL source spans and byte offsets for
  scene, node, and directive-argument diagnostics.
- **`@flyingrobots/geordi-compiler-core`**: Add a deterministic diagnostic formatter with stable
  source-span rendering and canonical JSON details.
- **`@flyingrobots/geordi-compiler-core`**: Emit `scene.geordi.map.json` source maps alongside IR
  JSON, mapping IR node IDs back to source locations and adding `sourceMapHash` to receipts.
- **`@flyingrobots/geordi-compiler-core`**: Semantic validation engine — `validateCanonicalAst()` with two-tier rule registry; Tier 1 (structural: `sceneDimensions`, `nodeKindValid`, `duplicateId`, `danglingRef`, `cycleDetection`) gates Tier 2 (semantic: `requiredProps` per NodeKind); iterative Kahn's cycle detection passes 10k-node chains without stack overflow
- **`@flyingrobots/geordi-compiler-core`**: Deterministic IR emitter — `emitGeordiIrArtifact()` replaces stub; two-phase topological sort (Kahn's on `parentId` DAG, tie-broken `zIndex ASC → kind ASC → id ASC` bytewise); strips `sourceRef` and `__typename`
- **`@flyingrobots/geordi-compiler-core`**: Determinism certificate — `emitReceiptArtifact()` emits `scene.geordi.json.receipt` alongside IR containing `comparatorVersion`, `inputHash` (SHA-256 of `input.source`), `irHash` (SHA-256 of the emitted IR), `irHashAlg` (`"sha256"`), `irVersion`, and `rulesetFingerprint` (SHA-256 of sorted rule IDs)
- **`@flyingrobots/geordi-compiler-core`**: TypeScript type emitter — `emitTypesArtifact()` replaces stub; `TypeEmitter` produces `NodeId` literal union, `SceneRoot` interface, per-kind node interfaces (`RectNode`, `TextNode`, …), and `SceneNode` discriminated union via token-based emission
- **`@flyingrobots/geordi-compiler-core`**: Identifier utilities — `toTypeIdentifier()` (NFKC normalize → PascalCase → reserved-keyword guard → invalid-start guard) and `buildIdentifierMap()` (bytewise-sorted collision resolution with `__N` suffix) in `src/util/identifiers.ts`
- **`@flyingrobots/geordi-compiler-core`**: All three stubs (`validateStub`, `emitIrStub`, `emitTypesStub`) removed from `compile.ts`; real implementations wired
- **`@flyingrobots/geordi-compiler-core`**: Add `GEORDI_E_INPUT_INVALID_JSON` and `GEORDI_E_INPUT_INVALID_SDL` error codes for invalid input (previously misclassified as `E_INTERNAL_INVARIANT`)
- **`@flyingrobots/geordi-compiler-core`**: Add `hashString()` and `deterministicId()` hashing utilities in `src/canonical/hashing.ts` with stable SHA-256 contract
- **`@flyingrobots/geordi-compiler-core`**: Export `hashString`, `deterministicId`, `HASH_ALGORITHM`, `GraphqlToCanonicalAst`, `ParseInputDeps` from package index
- **`@flyingrobots/geordi-compiler-core`**: `compile()` now accepts optional `deps?: ParseInputDeps` second argument for adapter injection
- **`@flyingrobots/geordi-compiler-core`**: IR emitter uses `stableStringify`, sorts nodes by `zIndex ASC → kind ASC → id ASC` (bytewise), strips `sourceRef` from output, adds `hashAlgorithm` to compile metadata
- **`@flyingrobots/geordi-compiler-core`**: `CompileMetadata` gains optional `hashAlgorithm` field (narrowed to `'sha256'`)
- **`@flyingrobots/geordi-schema-graphql`**: Full GraphQL SDL parser pipeline — `parseGraphql`, `extractScene`, `extractNodes`, `toCanonicalAst`
- **`@flyingrobots/geordi-schema-graphql`**: `graphqlToCanonicalAst` adapter exported from package root, satisfies `GraphqlToCanonicalAst` interface from compiler-core
- **`@flyingrobots/geordi-schema-graphql`**: Null-safe source location policy (`SourceRef` fallback to `<inline>:1:1` when `loc` absent)
- **`@flyingrobots/geordi-schema-graphql`**: `GEORDI_W_UNUSED_FIELD` warning only for unknown `geordi_*`-prefixed directives; non-`geordi_` directives silently ignored
- **`@flyingrobots/geordi-wesley-generator`**: Imports and injects `graphqlToCanonicalAst` adapter into `compile()`; adds `@flyingrobots/geordi-schema-graphql` dependency

### Tests

- **`@flyingrobots/geordi-core`**: add `geordi-ir/1` validation coverage for valid IR, version
  mismatch, non-finite numbers, and malformed node props.
- **`@flyingrobots/geordi-compiler-core`**: add a compiler-to-core contract test proving emitted
  IR parses through the canonical JSON port and validates under the core-owned IR contract.
- **`@flyingrobots/geordi-runtime-webgl`**: add coverage for rendering `geordi-ir/1` through the
  new runtime preparation path.
- **`@flyingrobots/geordi-runtime-webgl`**: add runtime-bound IR validation, fail-loud prop
  lowering, and compiler-to-runtime contract coverage that compiles canonical AST JSON, parses
  emitted IR through the canonical JSON port, validates it as `geordi-ir/1`, and renders it.
- **`@flyingrobots/geordi-core`**: add canonical JSON port coverage for stable key order,
  `-0` normalization, nested non-finite-number rejection with paths, deterministic finite float
  spelling, and no hidden fixed-point scaling.
- **`@flyingrobots/geordi-runtime-webgl`**: add runtime profile export and unsupported profile
  rejection coverage.
- **`@flyingrobots/geordi-compiler-core`**: add source-location model, diagnostic formatter, and
  source-map artifact coverage.
- **`@flyingrobots/geordi-schema-graphql`**: add exact GraphQL source-span tests and an e2e source
  map assertion from IR node ID back to SDL field location.
- **`@flyingrobots/geordi-wesley-generator`**: add behavior contract tests for `plan()`, successful SDL-to-artifacts generation, and custom failure errors on bad SDL
- **`@flyingrobots/geordi-runtime-webgl`**: add canvas/context mock behavior tests for rendering the prepared scene contract and context-unavailable failure
- **`@flyingrobots/geordi-compiler-core`**: 74 new tests across sprint 3 — first batch: `stableStringify` (22), `parseInput` table-driven (9), `determinism` (3) → 36 tests; second batch: `validateAst` (15), `emitTypes` (19), `determinism` +4, `compile.golden` +3 → total 79 tests
- **`@flyingrobots/geordi-schema-graphql`**: 42 new tests — `extractScene` (10), `extractNodes` (10), `toCanonicalAst` (14), `e2e.terminal` (8)
- Cycle detection verifies Tier 2 is suppressed when Tier 1 errors present
- 4 rotated input orderings of the same scene produce byte-identical IR (SHA-256 verified)
- Parent-before-child ordering guaranteed in topological emitter output
- Receipt `inputHash` verified against `sha256(input.source)` in golden tests; two compilations of identical input produce byte-identical receipts
- E2E Terminal SDL fixture compiles to IR with identical SHA-256 on two consecutive runs
- Whitespace-reformatted SDL variant produces identical IR hash (determinism guarantee)

### Bug Fixes

- `compiler-core/parseInput`: adapter-thrown `CompilerError` diagnostics are preserved instead of being wrapped as `GEORDI_E_INTERNAL_INVARIANT`; invalid GraphQL SDL keeps its source location through `compile()`
- `compiler-core/errors`: add `DiagnosticsError` to carry collected diagnostics across adapter boundaries without losing error codes or locations
- `schema-graphql/adapter`: missing-scene extraction now reports `GEORDI_E_SCENE_MISSING` through `compile()` without duplicate internal-invariant diagnostics
- `schema-graphql/directives`: replace unsafe directive argument casts with typed runtime readers for `@geordi_scene` and `@geordi_node`; wrong literal types, non-finite numeric literals, and invalid `props` JSON object payloads emit `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE`
- `schema-graphql/directives`: `geordi_bind` and `geordi_style` now fail loudly with `GEORDI_E_FEATURE_NOT_IMPLEMENTED` instead of being silently ignored
- `compiler-core/compile`: `emit.binaryPack: true` now fails before any artifacts are emitted, matching the hard-failure behavior of other unsupported artifact targets
- `compiler-core/compile`: removed wall-clock `elapsedMs` from `CompileMetadata`; compile results now remain deterministic for identical inputs
- `emitIr`: O(n²) `shift()`+re-sort queue replaced with `qi`-pointer dequeue and batch merge of newly-ready children — O(n log n) for tree-structured graphs
- `schema-graphql/adapter`: diagnostic message now embedded in thrown `Error` when `extractScene` fails; "see diagnostics" was a lie when caller omitted the `diagnostics` array
- `schema-graphql/extractNodes`: `knownGeordiDirs` `Set` was re-allocated inside a nested loop on every call; hoisted to module-level constant
- `schema-graphql/extractNodes`: invalid `props` JSON argument now emits a `W_UNUSED_FIELD` warning instead of silently discarding the value
- `identifiers`: `buildIdentifierMap` now throws immediately on duplicate source strings instead of silently producing a corrupt output `Map`
- `test/determinism`: rotation test loop corrected to produce 4 distinct orderings, matching its description (old loop generated 4 unique rotations but iterated 10 times)
- `emitIr`: `IR_VERSION`, `IR_ARTIFACT_KEY`, `IR_RECEIPT_KEY` exported as named constants; magic string literals removed from `compile.ts` and `emitIr.ts`
- `identifiers`: `RESERVED.has(result.toLowerCase())` removed — PascalCase output like `'Delete'` is a valid TypeScript identifier; only exact-case match is checked
- `parseGraphql`: SDL wrapped in `Source(sdl, filename)` so the returned `DocumentNode` carries filename metadata through to downstream diagnostics
- `test/determinism`: shuffle fixture aligned with `BASE_INPUT` — added `visible: true` to all nodes and `units: 'px'` to scene
- `docs/ERROR_CODES.md`: corrected `Rect` required props example — only `width` and `height` are required; `x` and `y` are optional
- `runtime-webgl`: runtime rendering now validates IR before preparing draw-ready scenes and
  throws custom runtime errors for invalid IR, unsupported node kinds, and invalid required node
  props instead of silently falling back to invisible geometry or empty content.

- Invalid JSON input no longer emits `GEORDI_E_INTERNAL_INVARIANT`; now correctly emits `GEORDI_E_INPUT_INVALID_JSON`
- Invalid GraphQL SDL input now emits `GEORDI_E_INPUT_INVALID_SDL` instead of `GEORDI_E_INTERNAL_INVARIANT`
- `NaN` scene dimensions now correctly rejected by `sceneDimensions` validation rule
- `E_CYCLE_DETECTED` no longer spuriously triggered when duplicate node IDs are present
- `NodeId` union in emitted TypeScript types is now sorted lexicographically for deterministic output
- `emit.jsonSchema: true` no longer leaves partial artifacts on error — guard runs before any emission
- `metadata.irVersion` now correctly reflects artifact presence rather than `ok` flag

### Documentation

- `docs/ERROR_CODES.md`: Added `GEORDI_E_INPUT_INVALID_JSON` and `GEORDI_E_INPUT_INVALID_SDL` entries
- `docs/ERROR_CODES.md`: Corrected `GEORDI_E_REF_TARGET_NOT_FOUND` — `refKind` detail is `"animation"` only; bindings use `GEORDI_E_BIND_TARGET_NOT_FOUND`

### Post-Sprint-3 PR Feedback (Round 5)

- `schema-graphql/extractNodes`: removed redundant `!== 'geordi_node'` guard — `geordi_node` is already in `KNOWN_GEORDI_DIRS`, so the outer check was dead code
- `schema-graphql/extractNodes`: props JSON that parses successfully but is not an object (e.g. arrays, primitives) now emits `E_DIRECTIVE_ARG_INVALID_TYPE` error — previously discarded silently
- `schema-graphql/parseGraphql`: extracted `filename ?? '<inline>'` to `effectiveName` const — eliminates triple repetition in the function body
- `errors/codes.ts`: moved `E_FEATURE_NOT_IMPLEMENTED` out of "Emit / runtime" to its own "General / cross-phase" section with a clarifying JSDoc; added `@deprecated` note on `W_BINARY_PACK_NOT_IMPLEMENTED`
- `test/validateAst`: added `validateCanonicalAst(undefined)` test + `NaN`/`Infinity` dimension tests (3 new tests, 19 total)
- `test/emitTypes`: pinned exact expected values for `toTypeIdentifier` loose assertions (`'🚀'` → `'Anonymous'`, `'type'` → `'Type'`); pinned collision winner per bytewise ordering
- `test/stableStringify`: added NaN, Infinity, -Infinity, and top-level-undefined serialization contract tests (4 new tests, 26 total)

### Post-Sprint-3 PR Feedback (Round 4)

- `emitIr`: `normalizeZIndex` now guards against `NaN`/`Infinity` via `Number.isFinite` — previously these values passed through and corrupted the topological sort comparator
- `emitIr`: `emitReceiptArtifact` parameter widened to `ReadonlyArray<string>` to match the readonly `VALIDATION_RULE_IDS` export
- `validateAst`: `VALIDATION_RULE_IDS` exported as `ReadonlyArray<string>` — prevents external mutation of the rule-ID array used in the receipt fingerprint
- `schema-graphql/extractNodes`: invalid `props` JSON now emits `E_DIRECTIVE_ARG_INVALID_TYPE` (not `W_UNUSED_FIELD`) — more precise error classification
- `schema-graphql`: extracted shared `nodeSourceRef` utility into `src/parse/sourceRef.ts` — eliminates verbatim duplication across `extractScene.ts` and `extractNodes.ts`
- `test/validateAst`: renamed misleading "deep spiral with cycle at tip" test description to "complete ring cycle" — the fixture is a fully-cyclic ring, not a spiral
- `test/e2e.terminal`: removed redundant `sha256` assertion from determinism test — string equality already implies hash equality
- `test/determinism`: parent-before-child and tie-breaking fixtures now include `visible: true` on nodes and `units: 'px'` on scene, matching `BASE_INPUT` shape
