# Geordi Bearing

**Date**: 2026-05-22
**Branch baseline**: `main` at `c4597a6`
**Current head when written**: `c4597a6`

This file is the short-term operating map. Product rationale remains in
[`docs/V0_DESIGN_LAWS.md`](./docs/V0_DESIGN_LAWS.md); detailed work items remain in
[`BACKLOG.md`](./BACKLOG.md).

## Current Position

The repo is past the first stabilization pass.

Completed:

- CI now runs lint, typecheck, tests, package-name checks, documentation hygiene checks,
  placeholder-test checks, repo-sludge checks, and package export smoke tests.
- ESLint 10 has a root flat config and type-aware package linting.
- Public package entrypoints are smoke-tested after build.
- The compiler uses the canonical JSON port for deterministic parse/stringify boundaries.
- Canonicalization is implemented and wired into `compile()`.
- Tracked generated Turbo logs and stale nested lockfiles are gone.
- Turbo `test` outputs match command behavior.
- Placeholder package tests have been replaced with minimal public API contract tests.
- Dependabot is configured for grouped workspace and GitHub Actions updates.
- Typed adapter diagnostics survive through `compile()` without internal-invariant wrapping.
- GraphQL `@geordi_scene` and `@geordi_node` directive arguments are validated at runtime before
  values enter the canonical AST.
- Known but unlowered GraphQL directives fail loudly instead of disappearing from the pipeline.
- `wesley-generator` and `runtime-webgl` have behavior-level package contract tests, not only
  entrypoint smoke tests.
- `@flyingrobots/geordi-core` owns versioned `geordi-ir/1` constants, types, and structural
  validation.
- `@flyingrobots/geordi-compiler-core` emits/re-exports the shared core IR contract.
- `@flyingrobots/geordi-runtime-webgl` validates and renders typed `geordi-ir/1` through
  `renderGeordiToCanvas()`.
- The draw-ready runtime scene shape is explicitly named `PreparedGeordiScene`; compatibility
  aliases remain for the v0.1 migration, but `geordi-ir/1` is the documented renderer contract.
- Compiler-emitted IR is covered end to end through runtime rendering.
- `@flyingrobots/geordi-core` owns the canonical JSON port, including parse/stringify/normalize
  behavior and custom JSON error types.
- `geordi-ir/1` declares `numericProfile: "geordi-finite-binary64/1"`; compiler receipts include
  that profile, and runtime-webgl rejects unsupported profile requirements before rendering.

Still true:

- Multi-step geometry, vector, matrix, transform, and animation operation-order rules still need to
  be specified as those features are introduced.

## Immediate Moves

1. Finish dependency hygiene:
   - GitHub Actions Dependabot PR #10 was mergeable and has been merged.
   - Conflicting npm Dependabot PR #8 should be recreated by Dependabot before any manual lockfile
     work.
2. Add source maps and diagnostic UX improvements.
3. Define the next explicit feature/capability profile beyond the v0 baseline.

## Recommended P0 Order

1. Add source maps and diagnostic UX improvements.
2. Define the next feature/capability profile beyond the v0 baseline.

## Dependency Work

Open Dependabot state when this was written:

- PR #10, GitHub Actions group: merged.
- PR #8, npm/yarn group: stale/conflicting; Dependabot has been asked to recreate it.

Manual lockfile conflict resolution should be avoided unless Dependabot cannot regenerate a clean
branch.
