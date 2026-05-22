# Geordi Bearing

**Date**: 2026-05-22
**Branch baseline**: `main` at `9287157`
**Current head when written**: `9287157`

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

Still true:

- `geordi-ir/1` is emitted by `compiler-core`, but `core` and `runtime-webgl` still expose an
  older scene shape.
- The graphics numeric profile is only partially defined. JSON is deterministic, but geometry,
  vectors, matrices, transforms, and runtime capability declaration are not fully specified.

## Immediate Moves

1. Finish dependency hygiene:
   - GitHub Actions Dependabot PR #10 was mergeable and has been merged.
   - Conflicting npm Dependabot PR #8 should be recreated by Dependabot before any manual lockfile
     work.
2. Next focused stabilization target: move `geordi-ir/1` into `@flyingrobots/geordi-core` as the
   runtime contract.
3. Keep the graphics numeric profile explicit while migrating runtime-facing types.

## Recommended P0 Order

1. Move `geordi-ir/1` into `@flyingrobots/geordi-core` as the runtime contract.
2. Define and enforce the graphics numeric profile.

## Dependency Work

Open Dependabot state when this was written:

- PR #10, GitHub Actions group: merged.
- PR #8, npm/yarn group: stale/conflicting; Dependabot has been asked to recreate it.

Manual lockfile conflict resolution should be avoided unless Dependabot cannot regenerate a clean
branch.
