# Geordi Bearing

**Date**: 2026-05-22
**Branch baseline**: `main` at `16395d0`
**Current head when written**: `16395d0`

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
- `@flyingrobots/geordi-runtime-webgl` can prepare and render typed `geordi-ir/1` through the
  existing canvas renderer.

Still true:

- `runtime-webgl` still exposes the older `GeordiScene` rendering path during migration.
- The graphics numeric profile is only partially defined. JSON is deterministic, but geometry,
  vectors, matrices, transforms, and runtime capability declaration are not fully specified.

## Immediate Moves

1. Finish dependency hygiene:
   - GitHub Actions Dependabot PR #10 was mergeable and has been merged.
   - Conflicting npm Dependabot PR #8 should be recreated by Dependabot before any manual lockfile
     work.
2. Finish the runtime-contract migration by making the public renderer API prefer `geordi-ir/1`
   and by deprecating, renaming, or internalizing the legacy scene shape.
3. Keep the graphics numeric profile explicit while migrating runtime-facing types.

## Recommended P0 Order

1. Finish making `geordi-ir/1` the public runtime contract.
2. Define and enforce the graphics numeric profile.

## Dependency Work

Open Dependabot state when this was written:

- PR #10, GitHub Actions group: merged.
- PR #8, npm/yarn group: stale/conflicting; Dependabot has been asked to recreate it.

Manual lockfile conflict resolution should be avoided unless Dependabot cannot regenerate a clean
branch.
