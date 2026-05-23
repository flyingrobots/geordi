# Geordi Bearing

**Date**: 2026-05-23
**Branch baseline**: `main` at `fce5978`
**Current branch when written**: `p0/capability-profile-contract`

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
  that profile, and runtime-webgl rejects unsupported numeric profiles before rendering.
- `@flyingrobots/geordi-core` owns the baseline feature profile
  (`GEORDI_BASELINE_FEATURES`, rooted at `geordi/core/1`), `geordi-ir/1` declares `requires`,
  compiler output and receipts record those requirements, and runtime-webgl rejects missing or
  unsupported feature requirements before rendering.
- Public TypeScript API names are de-versioned for the current IR surface: use `GeordiIr`,
  `validateGeordiIr()`, `isGeordiIr()`, and compiler target `geordi-ir`; payload/profile
  identities remain explicit through values such as `irVersion: "geordi-ir/1"`.
- GitHub issue #7 was closed after confirmation that typed diagnostics transport already preserves
  invalid-SDL diagnostic location details.
- Source locations now have a canonical compiler-core model shared by AST `SourceRef` and
  diagnostics. GraphQL extraction preserves source spans and offsets.
- `scene.geordi.map.json` is emitted alongside IR JSON and receipts include `sourceMapHash`.
- Compiler-core exposes a deterministic diagnostic formatter, and the Wesley generator uses it for
  stable logging.
- Root `pnpm wesley` shells out to the installed Wesley CLI.

Still true:

- Multi-step geometry, vector, matrix, transform, and animation operation-order rules still need to
  be specified as those features are introduced.

## Immediate Moves

1. Specify deterministic operation-order rules for future vector, matrix, transform, and animation
   math before adding those features to any profile.
2. Define the next strict text/font profile beyond `text.raw-runtime-shaping` so pixel-identical
   text can become a real compliance claim.
3. Keep source-map, diagnostic formatter, and receipt behavior wired into future CLI/Wesley
   entrypoints.

## Recommended P0 Order

1. Define the next strict text/font feature profile beyond the current v0 baseline.
2. Decide whether Wesley modernization should target `wesley-cli`/`wesley-core` 0.0.5 through a
   CLI boundary, Rust workspace boundary, or future npm/WASM boundary.
3. Keep dependency hygiene clean; there are no open PRs at the time this bearing was refreshed.

## Dependency Work

Open Dependabot state when this was refreshed: none.

Manual lockfile conflict resolution should still be avoided unless Dependabot cannot regenerate a
clean branch.
