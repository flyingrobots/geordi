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
runtime text shaping, font parsing, evidence generation, receipt generation, or comparison yet.

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
