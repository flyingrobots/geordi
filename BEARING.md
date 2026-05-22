# Geordi Bearing

**Date**: 2026-05-22
**Branch baseline**: `main`
**Current head when written**: `79926fb`

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

Still true:

- `geordi-ir/1` is emitted by `compiler-core`, but `core` and `runtime-webgl` still expose an
  older scene shape.
- GraphQL directive arguments still need runtime type validation at the schema adapter boundary.
- Known directives such as `geordi_bind` and `geordi_style` are declared but not lowered or
  hard-rejected.
- Adapter/compiler diagnostic transport still needs to preserve typed diagnostics and source
  locations through `compile()`.
- The graphics numeric profile is only partially defined. JSON is deterministic, but geometry,
  vectors, matrices, transforms, and runtime capability declaration are not fully specified.

## Immediate Moves

1. Finish dependency hygiene:
   - GitHub Actions Dependabot PR #10 was mergeable and has been merged.
   - Conflicting npm Dependabot PR #8 should be recreated by Dependabot before any manual lockfile
     work.
2. Keep the next feature branch focused on diagnostics and directive validation.
3. Do not start runtime migration before typed diagnostics and directive semantics are stable.

## Recommended P0 Order

1. Preserve typed diagnostics across adapter/compiler boundaries.
2. Validate GraphQL directive argument types at runtime.
3. Lower or explicitly reject every known Geordi directive.
4. Expand package contract tests from entrypoint smoke to behavior coverage.
5. Move `geordi-ir/1` into `@flyingrobots/geordi-core` as the runtime contract.
6. Define and enforce the graphics numeric profile.

## Dependency Work

Open Dependabot state when this was written:

- PR #10, GitHub Actions group: merged.
- PR #8, npm/yarn group: stale/conflicting; Dependabot has been asked to recreate it.

Manual lockfile conflict resolution should be avoided unless Dependabot cannot regenerate a clean
branch.
