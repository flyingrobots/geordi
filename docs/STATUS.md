# Geordi Compiler Status

**Date**: 2026-05-22
**Version**: 0.1.0-dev
**Milestone**: First stabilization pass merged

See [`../BEARING.md`](../BEARING.md) for the current operating map.

## Current State

The compiler architecture is in place, the repo gates are real, and the next work should focus on
semantic correctness rather than more repository scaffolding.

### Complete Packages

#### `@flyingrobots/geordi-compiler-core`

Pure, framework-agnostic compilation engine.

- Type system: canonical AST, IR, diagnostics, artifacts.
- Error taxonomy with stable `GEORDI_E_*` and `GEORDI_W_*` codes.
- Compile orchestrator with parse, canonicalize, validate, and emit phases.
- GraphQL SDL and canonical JSON input paths.
- Deterministic JSON port for canonical parse/stringify boundaries.
- Deterministic IR, receipt, and TypeScript type emission.
- Post-build public export smoke coverage.

#### `@flyingrobots/geordi-schema-graphql`

GraphQL SDL to canonical AST adapter.

- Directive definitions for v1.
- GraphQL parser wrapper with source naming.
- Scene and node extraction.
- Canonical AST transform.
- End-to-end SDL compilation coverage through compiler-core.

#### `@flyingrobots/geordi-wesley-generator`

Wesley GeneratorPlugin adapter scaffold.

- Plugin lifecycle shape: `apiVersion`, `name`, `plan`, `generate`.
- Compiler adapter injection via `graphqlToCanonicalAst`.
- Public entrypoint contract test.
- Still needs behavior coverage for `plan()` and `generate()`.

#### `@flyingrobots/geordi-core`

Core domain package.

- Current domain models and guards for the older scene shape.
- Still needs migration to own validated `geordi-ir/1` runtime contract types.

#### `@flyingrobots/geordi-runtime-webgl`

Canvas-backed WebGL-runtime scaffold.

- Basic renderer implementation.
- Public entrypoint contract test.
- Still consumes the older `GeordiScene` shape and must migrate to `geordi-ir/1`.

## Infrastructure

- pnpm workspace.
- Turbo build/test/lint/typecheck pipeline.
- GitHub Actions CI.
- Dependabot grouped updates for npm workspace dependencies and GitHub Actions.
- Strict TypeScript and type-aware ESLint.
- Root hygiene gates:
  - `pnpm test:exports`
  - `pnpm test:package-names`
  - `pnpm test:docs`
  - `pnpm test:placeholders`
  - `pnpm test:repo-sludge`

## Test Status

Latest full local gate during the stabilization merge:

| Package | Tests | Status |
| --- | ---: | --- |
| `@flyingrobots/geordi-compiler-core` | 71 | Green |
| `@flyingrobots/geordi-schema-graphql` | 42 | Green |
| `@flyingrobots/geordi-core` | 7 | Green |
| `@flyingrobots/geordi-runtime-webgl` | 1 | Green |
| `@flyingrobots/geordi-wesley-generator` | 1 | Green |
| **Total package tests** | **122** | Green |

Additional gates:

| Gate | Status |
| --- | --- |
| `pnpm lint:root` | Green |
| `pnpm exec turbo run lint --force` | Green |
| `pnpm typecheck` | Green |
| `pnpm test:exports` | Green |
| `pnpm audit --prod=false` | Green |

## What's Next

Immediate:

1. Keep dependency hygiene clean.
   - GitHub Actions Dependabot update PR #10 has been merged.
   - npm/yarn Dependabot PR #8 was stale and conflicting; Dependabot has been asked to recreate it.
2. Move versioned `geordi-ir/1` types and validation into `@flyingrobots/geordi-core`.
3. Update `runtime-webgl` to consume the `geordi-ir/1` runtime contract.

Short term:

4. Define the graphics numeric profile for geometry, vectors, matrices, transforms, and runtime
   capability requirements.
5. Add source maps and diagnostic UX improvements.
6. Create `@flyingrobots/geordi-cli` for compile, validate, pack, and watch workflows.

## Decision Log

### Architectural Decisions

1. **Seam placement**: GraphQL SDL to canonical AST to Geordi IR.
   - Why: prevents Wesley lock-in and enables multiple frontends.
   - Trade-off: extra abstraction layer.

2. **Error codes**: stable string codes.
   - Why: machine-parseable, documentation-stable, future-proof.
   - Trade-off: more verbose diagnostics.

3. **Hashing**: SHA-256 for current receipts.
   - Why: standard, available, and compatible with current tooling.
   - Trade-off: slower than future alternatives such as BLAKE3.

4. **Canonical JSON boundary**: all production JSON ingress/egress goes through the compiler-core
   JSON port.
   - Why: deterministic bytes, strict non-finite number rejection, and one place to define JSON law.
   - Trade-off: boundary code is stricter and less convenient than native `JSON.parse/stringify`.

5. **Time outside core IR**: `geordi-ir/1` describes scene snapshots.
   - Why: keeps v0 deterministic and avoids hidden frame scheduling semantics.
   - Trade-off: hosts must emit new scenes for animation until a future animation profile exists.
