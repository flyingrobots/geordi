# Geordi Compiler Architecture

## Overview

Geordi uses a **clean seam architecture** where the compiler core remains framework-agnostic and integrations (like Wesley) are thin adapter layers. The product north star lives in [`VISION.md`](../VISION.md).

The cross-runtime boundary is also explicit: TypeScript stays native at browser, Node, tooling, and
fixture-authoring edges; Rust stays native at the renderer and CLI core; shared serialized contracts
are generated from a common source; WASM is introduced only for hard deterministic kernels. See
[`docs/design/2026-05-typescript-rust-wasm-boundary.md`](./design/2026-05-typescript-rust-wasm-boundary.md).

## Package Responsibilities

### `@flyingrobots/geordi-compiler-core`

**Pure domain logic. Zero external framework dependencies.**

- **Types** (`src/types/`): Canonical AST, IR, compiler contracts
- **Errors** (`src/errors/`): Structured error taxonomy
- **Compile** (`src/compile/`): Orchestration, parse, validate, emit phases
- **Canonical** (`src/canonical/`): Normalization, deterministic IDs, stable ordering
- **Util** (`src/util/`): Deterministic JSON serialization, hashing helpers

**Key principle**: No Wesley types, no GraphQL AST leaks beyond parse phase.

### `@flyingrobots/geordi-schema-graphql`

**GraphQL SDL → Canonical AST adapter**

- **Directives** (`src/directives/`): Directive definitions, version validation
- **Parse** (`src/parse/`): SDL → GraphQL AST → scene/nodes extraction
- **Transform** (`src/transform/`): GraphQL AST → Canonical AST
- **Errors** (`src/errors/`): GraphQL-specific parse errors

**Key principle**: Exports pure functions that compiler-core can inject. No global state.

### `@flyingrobots/geordi-wesley-generator`

**Wesley GeneratorPlugin adapter**

- **GeordiGeneratorPlugin** (`src/GeordiGeneratorPlugin.ts`): Wesley plugin lifecycle
- **Diagnostics adapter** (`src/diagnosticsAdapter.ts`): Maps compiler diagnostics → Wesley evidence

**Key principle**: Thin transport layer. Brain lives in compiler-core.

### `@flyingrobots/geordi-text-prep`

**Pinned strict text preparation tooling**

- **CLI** (`src/cli.ts`): `geordi-text-prep prepare --input <file> --output <dir>`
- **Validation** (`src/index.ts`): `geordi-text-prep-input/1` shape, hash, path, font, shaping,
  geometry, and output-intent checks
- **Plan artifact** (`text-prep.generation-plan.geordi.json`): deterministic audit data for the
  generated strict text fixture plus future evidence pack, receipt, and bundle manifest
- **Strict fixture artifact** (`geordi.strict-text.geordi.json`): canonical generated strict text
  fixture lowered from explicitly prepared glyph-run and line-box input
- **Diagnostics**: stable `GEORDI_TEXT_PREP_*` codes for host font lookup, fallback, multiline,
  bidi/complex script, variable axes, bad paths, missing fingerprints, file IO failures, and source hash drift

**Key principle**: Tooling may validate pinned source/font/shaping intent, but renderers still
consume prepared strict artifacts only. This package is not a WASM wrapper and does not claim
runtime text shaping, font parsing, or evidence generation. It does ship comparison (drift-gate
via `geordi-text-prep compare`) and receipt generation as part of the strict text proof layer.

### `@flyingrobots/geordi-bijou-gpu`

**Conformance kit, cell packer, and glyph atlas for the `bijou-surface-gpu/1` ABI**

- **Presenter contract** (`src/presenter.ts`, `src/errors.ts`): `GpuSurfacePresenter`, the
  sync-or-async `GpuSurfacePresenterFactory`, the shared `cellFromPoint` law, and
  `BackendUnavailableError` distinct from `RendererFaultError`
- **Packed-cell validator** (`src/packed-cells.ts`): strict `packed-bijou-cells/1` width-1
  validation mirroring Bijou's
- **Reference oracle** (`src/prepare.ts`, `src/reference.ts`, `src/procedural.ts`,
  `src/numeric.ts`): lowering to the `rgba32uint` cell record and the pure-integer sRGB-direct
  rasteriser `renderReferenceRgba`
- **Receipt validator** (`src/receipt.ts`): `geordi-bijou-gpu-receipt/1`, the evidence taxonomy,
  and `assertBitExactFrameHash`
- **Dirty-union cell packer** (`src/surface-damage.ts`): `packSurfaceDamage` and
  `accumulateSurfaceDamage` lower the union damage of two `PackedSurface` buffers into a retained
  staging buffer and report changed rows; no host API, glyph slots through an injected callback
- **Glyph atlas** (`src/glyph-atlas.ts`): `createGlyphAtlas` caches glyphs by `(grapheme, bold)`
  at integer physical cell metrics, with dirty sub-rects and a `generation` that advances on
  overflow and invalidation; no host API, pixels through an injected rasterizer
- **Glyph atlas browser adapter** (`src/glyph-atlas-browser.ts`): a 2D-canvas rasterizer and a
  watcher that invalidates the atlas on font arrival and DPR change
- **WebGPU presenter** (`src/webgpu-presenter.ts`, `src/webgpu-types.ts`):
  `createWebGPUSurfacePresenter` runs `bijou-surface.wgsl` verbatim into an `rgba8uint` target,
  uploads the packer's dirty rows and the atlas, reads frames back for receipts, and recovers from
  `device.lost`; the WebGPU objects it calls are typed structurally
- **Presenter host helpers** (`src/presenter-host.ts`): canvas size ingress, grid geometry, the
  atlas source a presenter reads, and receipt assembly, shared by every presenter
- **Test glyph pack** (`src/test-glyph-pack.ts`): explicit 8 x 16 bitmaps, no font
- **Browser probe harness** (`harness/`, `e2e/`): Playwright + Vite

**Key principle**: Bijou owns cell semantics and Bunny owns the integer primitives. This package
is the CPU oracle that GPU presenters are compared against, plus the packer and glyph atlas they
share, and the browser WebGPU presenter. References:
[`bijou-gpu-conformance-kit.md`](./bijou-gpu-conformance-kit.md),
[`bijou-gpu-surface-damage.md`](./bijou-gpu-surface-damage.md),
[`bijou-gpu-glyph-atlas.md`](./bijou-gpu-glyph-atlas.md), and
[`bijou-gpu-webgpu-presenter.md`](./bijou-gpu-webgpu-presenter.md).

Its `shaders/` directory holds the canonical `bijou-surface.wgsl`, the GLSL ES 3.00 stages that
`crates/geordi-bijou-shadergen` generates from it with pinned `naga`, and their implementation
manifest. The npm package does not publish that directory. Reference:
[`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md).

### `@flyingrobots/geordi-profunctor-page`

**Bounded Profunctor Page structural target**

- **Intake** (`src/parse.ts`): validates exact `profunctor-page/0`,
  `profunctor-page-source-map/0`, and `profunctor-build-manifest/0`
  relationships
- **Profile** (`src/profile.ts`): owns supported block geometry, target token
  values, target claims, and target nonclaims
- **Lowering** (`src/lower.ts`): emits valid rectangle-only `geordi-ir/1`,
  target-map, and receipt artifacts
- **Preview** (`src/preview.ts`): emits a diagnostic SVG from the same target
  geometry

**Key principle**: The website owns page meaning. Geordi owns only the target
projection and its evidence. The target fails closed on unsupported visible
blocks and does not inherit semantic HTML claims.

## Compilation Pipeline

```text
Input (SDL or canonical JSON)
  ↓
parseInputToCanonicalAst()
  ↓
Canonical AST
  ↓
normalizeCanonicalAst() [deterministic]
  ↓
validateCanonicalAst() [semantic checks]
  ↓
emitGeordiIr() + emitTypes() + emitSchema()
  ↓
Artifacts (scene.geordi.json, scene.geordi.map.json, types.ts, etc.)
```

### Phase 1: Parse
- **Input**: SDL string or canonical AST JSON
- **Output**: Canonical AST (validated structure)
- **Errors**: Parse errors, directive errors

### Phase 2: Canonicalization
- **Input**: Canonical AST
- **Output**: Normalized Canonical AST
- **Operations**:
  - Deterministic ID assignment (hash-based)
  - Node sorting (zIndex → parentId → id)
  - Property key ordering (lexicographic)
  - Default value materialization

### Phase 3: Validation
- **Input**: Normalized Canonical AST
- **Output**: Diagnostics (errors/warnings)
- **Checks**:
  - Semantic rules (required props, valid values)
  - Graph integrity (no cycles, valid parent refs)
  - Binding targets exist
  - Style applicability

### Phase 4: Emit
- **Input**: Validated Canonical AST
- **Output**: ArtifactMap
- **Emitters**:
  - `emitGeordiIr()` → scene.geordi.json
  - source map emission → scene.geordi.map.json
  - `emitTypes()` → types.ts
  - `emitSchema()` → scene.geordi.schema.json (optional)

## Determinism

All operations are deterministic:

1. **IDs**: Hash of semantic path (sceneId + typeName + fieldName), never random UUIDs
2. **Ordering**: Stable sort (zIndex asc, parentId asc, id asc)
3. **Serialization**: `stableStringify()` with lexicographic key sort
4. **Hashing**: SHA-256 (abstract behind `hashString()` for future BLAKE3 migration)

## Error Handling

**User errors** → Diagnostics (never throw)
**Internal faults** → Throw `InternalCompilerError`

Error codes:
- `GEORDI_E_*` - Errors (compilation fails)
- `GEORDI_W_*` - Warnings (compilation succeeds unless `failOnWarnings: true`)

See [`docs/ERROR_CODES.md`](./ERROR_CODES.md) for complete taxonomy.

## Testing Strategy

1. **Golden tests**: Valid fixture → expected artifacts (snapshot)
2. **Negative tests**: Invalid fixture → expected error codes
3. **Determinism tests**: Compile twice → identical byte output
4. **Round-trip tests**: Canonical AST → IR → Canonical AST (future)

## Versioning

- **AST version**: `astVersion: "1"` (canonical AST)
- **IR version**: `irVersion: "geordi-ir/1"` (output format)
- **Source map version**: `version: "geordi-source-map/1"` (IR node ID to source location map)
- **Numeric profile**: `numericProfile: "geordi-finite-binary64/1"` (finite binary64 graphics numbers)
- **Feature profile**: `requires: ["geordi/core/1", ...]` (explicit render capabilities)
- **Directive version**: `v: "1"` (GraphQL directives)

All versions are explicit and validated. Unknown versions → hard error.

## Migration Path (v0.1 → v0.2)

Current limitations in v0.1:
- GraphQL directive args use JSON strings for complex props (ugly but pragmatic)
- Single output target (`geordi-ir`)
- No binary packer (`.geordib` format)

Planned for v0.2:
- Typed input objects for directive args
- Multiple output targets (prove abstraction)
- Binary packer as post-step
- Source maps (IR nodes → SDL line/column)
