# Geordi Bearing

**Date**: 2026-05-23
**Branch baseline**: `main` at `654adba`
**Current branch when written**: `codex/render-everywhere-design`

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
- The next post-capability-profile slice sequence has a formal design pack in
  [`docs/design/`](./docs/design/).
- The feature-registry split is complete: core distinguishes known features from emitted baseline
  features, runtime profiles advertise `supportedFeatureRequirements`, compiler output remains
  locked to the baseline feature set, and strict text features are known but unsupported by the
  current browser runtime.
- GitHub issues #5 and #6 are implemented in the merged feature-registry hit-list branch.

Still true:

- Multi-step geometry, vector, matrix, transform, and animation operation-order rules still need to
  be specified as those features are introduced.
- The browser demo scaffold now renders the shared fixture into a browser canvas, and the Rust
  workspace now includes a native renderer plus smoke harness for the same canonical artifact.
  The current proof remains rectangle-only until stricter text, geometry, and transform profiles
  are specified.

## Render-Everywhere Target

The next credibility milestone is a render-everywhere demo:

1. A GPVue-authored scene renders in a browser canvas.
2. The same canonical `scene.geordi.json` artifact renders in a native Rust application.

This should prove the platform boundary, not two separate demos. GPVue is the authoring frontend,
Geordi IR is the portable artifact, and browser plus Rust runtimes are interchangeable consumers of
the same bytes.

For the first version, the shared scene should use deterministic rectangle-only UI geometry. Raw
runtime text can be added as a best-effort visual follow-up, but it must not be used for a
pixel-identical cross-runtime claim until the strict text/font profile exists.

The live execution checklist is
[`docs/design/2026-05-render-everywhere-slice-plan.md`](./docs/design/2026-05-render-everywhere-slice-plan.md).
As slices land, update that checklist from `- [ ]` to `- [x]` and keep this bearing aligned when
the plan changes materially.

## Immediate Moves

1. Land the render-everywhere design pack and checklist in [`docs/design/`](./docs/design/),
   covering the shared fixture contract, browser harness, Rust native harness, and future GPVue
   compiler hook.
2. Implement a shared render fixture with one canonical `scene.geordi.json`, receipt/hash metadata,
   runtime profile declaration, and deterministic pixel probes.
3. Build the browser harness first, then the Rust IR parser/validator, then the native Rust render
   path. Do not let GPVue compiler work block the shared artifact/runtime proof.
4. Keep strict text/font and matrix/vector operation-order laws on the roadmap, but do not include
   them in the first render-everywhere demo claim.

## Recommended P0 Order

1. Render-everywhere design pack: formalize the demo contract and slice sequence.
2. Shared fixture root: add `fixtures/render-everywhere/hello-panel` with fixture manifest,
   canonical IR, and receipt/hash metadata.
3. Pixel probe contract: define typed probe records, expected RGBA values, and custom failure
   errors.
4. Browser harness scaffold: add a Vite-powered browser example that imports workspace packages.
5. Browser render smoke: load the shared IR, call `renderGeordiToCanvas()`, and mount the canvas.
6. Browser Playwright gate: assert canvas size, nonblank output, and exact rectangle color probes.
7. Browser failure fixtures: prove unsupported feature requirements fail loudly in the harness.
8. Rust workspace scaffold: add Cargo workspace support without disturbing the pnpm gates.
9. Rust IR crate: deserialize canonical `geordi-ir/1` into typed Rust structs at the JSON boundary.
10. Rust IR validation: enforce version, numeric profile, feature requirements, finite graphics
    numbers, and Rect props with custom error types.
11. Rust runtime profile: declare the native runtime's supported baseline subset.
12. Rust native app shell: open a native window and load the shared fixture artifact.
13. Rust rectangle renderer: render solid Rect nodes from the shared IR into the native surface.
14. Rust offscreen smoke mode: run deterministic pixel probes without requiring an interactive
    desktop window.
15. Shared hash display: show the same artifact hash/profile in browser UI and Rust app logs/window
    title.
16. Render-everywhere README: document the two demo commands and the claim each one proves.
17. GPVue fixture hook: add draft GPVue source fixtures and a fail-loud compiler port boundary.
18. GPVue compiler MVP: lower the first GPVue fixture to the existing canonical IR artifact.
19. End-to-end GPVue browser demo: compile GPVue, render in browser, and verify pixel probes.
20. End-to-end GPVue native demo: compile once, render the emitted artifact in Rust, and verify the
    same hash/probes.

## Dependency Work

Open Dependabot state when this was refreshed: none.

Manual lockfile conflict resolution should still be avoided unless Dependabot cannot regenerate a
clean branch.
