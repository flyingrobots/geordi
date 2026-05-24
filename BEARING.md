# Geordi Bearing

**Date**: 2026-05-24
**Branch baseline**: `main` at `b9d1398`
**Current branch when written**: `main`

This file is the short-term operating map. Product rationale remains in
[`docs/V0_DESIGN_LAWS.md`](./docs/V0_DESIGN_LAWS.md); detailed work items remain in
[`BACKLOG.md`](./BACKLOG.md).

## Current Position

The repo has cleared the first stabilization phase and the first render-everywhere proof.

Completed:

- CI runs lint, typecheck, tests, package-name checks, documentation hygiene checks,
  placeholder-test checks, repo-sludge checks, and package export smoke tests.
- ESLint 10 is configured with strict root and package linting.
- Public package entrypoints are smoke-tested after build.
- Canonical JSON handling is owned by `@flyingrobots/geordi-core` and is wired through compiler
  parse/stringify boundaries.
- `geordi-ir/1` has shared TypeScript constants, types, structural validation, feature
  requirements, and `numericProfile: "geordi-finite-binary64/1"`.
- Compiler receipts include IR version, numeric profile, feature requirements, artifact hashes, and
  source map hashes.
- Runtime profile negotiation rejects unsupported numeric profiles or feature requirements before
  rendering.
- Public TypeScript API names are de-versioned around the current IR surface while payload identity
  remains explicit through values such as `irVersion: "geordi-ir/1"`.
- Source locations have a canonical compiler-core model shared by AST nodes, diagnostics, and
  source maps.
- The first rectangle-only render-everywhere milestone is implemented:
  - a constrained GPVue source fixture compiles to one canonical `scene.geordi.json`;
  - the same artifact renders in a browser canvas;
  - the same artifact renders in a native Rust application;
  - browser and native smoke paths report the same artifact hash, feature profile, and deterministic
    pixel probes.
- The completed rectangle proof is tracked in
  [`docs/design/2026-05-render-everywhere-slice-plan.md`](./docs/design/2026-05-render-everywhere-slice-plan.md).

Still true:

- The current deterministic rendering claim is rectangle-only.
- Text rendering remains deferred. No pixel-identical text claim is allowed until font identity,
  shaping, fallback, line breaking, and measurement laws exist.
- Multi-step geometry, vector, matrix, transform, camera, projection, depth, rasterization, and
  animation operation-order rules still need to be specified before Geordi can honestly claim broad
  graphics determinism.
- The native Rust path is currently a proof harness, not a full production runtime.
- CodeRabbit review status can be operationally noisy when review credits are exhausted; GitHub
  Actions CI remains the source of truth for repo gates unless explicitly stated otherwise.

## Next Credibility Milestone

The next goal is a mesh render-everywhere proof using the Stanford bunny asset already checked in at
[`fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply`](./fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply).

The demo should show:

1. The Stanford bunny mesh loaded from one canonical asset manifest.
2. The same mesh rendered in the browser.
3. The same mesh rendered in native Rust.
4. The bunny rotating at a fixed rate about one explicitly declared arbitrary axis.
5. Browser and native demos reporting the same asset hash, mesh profile, transform schedule, and
   sampled-frame metadata.

This is intentionally harder than the rectangle proof. It introduces assets, mesh parsing,
projection, depth, transforms, time sampling, and cross-runtime rasterization differences.

## Bunny Rotation Law

The target is not a general animation system yet. The initial law should be narrow:

- A mesh demo has a deterministic playback descriptor.
- The descriptor declares:
  - asset identity by content hash;
  - coordinate-system convention;
  - camera parameters;
  - projection parameters;
  - material profile;
  - rotation axis;
  - rotation rate;
  - fixed timestep or sampled frame indices for tests.
- Live demos may advance using host time, but verification must use explicit frame indices, not
  wall-clock time.
- The core IR may continue to represent a scene snapshot. If time is introduced, it should first be
  isolated to a mesh-demo playback profile or harness descriptor rather than leaking an undeclared
  animation model into all of Geordi.

For the first bunny proof, pick one arbitrary axis and freeze it in the spec. Prefer a simple
integer vector such as `[3, 5, 2]` as the authored axis, then define exactly where normalization
occurs. Do not let each runtime silently invent math conventions.

## Claim Boundaries

The rectangle proof gave us exact pixel probes. The bunny proof must be more careful.

Allowed claims:

- same mesh bytes;
- same asset hash;
- same parsed mesh counts and bounds;
- same declared camera/projection/material/rotation profile;
- same deterministic sampled transform inputs;
- browser and native demos both visibly render and rotate the bunny;
- smoke tests can compare stable nonblank output, frame metadata, bounds, and selected coarse visual
  invariants.

Not allowed yet:

- pixel-identical 3D rasterization across browser and native backends unless we implement a shared
  deterministic software rasterizer or a stricter backend-independent raster law;
- text rendering;
- arbitrary animation curves;
- CSS-like transitions;
- general-purpose shader extensibility;
- implicit runtime fallback behavior.

## Immediate Moves

1. Write a formal bunny mesh design pack in [`docs/design/`](./docs/design/):
   - mesh asset model and manifest;
   - PLY parsing boundary;
   - mesh IR/profile shape;
   - camera and projection law;
   - rotation playback descriptor;
   - browser harness changes;
   - native Rust harness changes;
   - verification strategy and non-claims.
2. Add a new slice checklist for the bunny milestone and link it from this bearing.
3. Implement the mesh asset manifest first. Hashes, counts, bounds, source attribution, and license
   notes must be machine-checkable before rendering work begins.
4. Build parsers and validators at the boundaries:
   - TypeScript for browser/demo tooling;
   - Rust for native rendering.
5. Add transform math only after the mesh asset contract is validated in both runtimes.
6. Add static bunny rendering before adding rotation.
7. Add fixed-frame rotation verification before live animation polish.
8. Keep text rendering explicitly out of scope until after the bunny milestone lands.

## Recommended P0 Order

1. Bunny design pack: formalize the mesh, camera, transform, playback, and verification contracts.
2. Bunny slice checklist: create an executable checklist with one commit per slice.
3. Asset manifest: describe the Stanford bunny asset by hash, format, vertex count, face count,
   bounds, source, and attribution.
4. Mesh feature profile: add known feature requirements for mesh asset loading, triangle meshes,
   camera projection, depth, solid material, and deterministic playback.
5. TypeScript PLY boundary: parse the ASCII PLY into typed mesh data with custom errors and no
   unchecked values beyond the parser boundary.
6. Rust PLY boundary: parse the same PLY into typed Rust mesh data with custom errors and strict
   validation.
7. Mesh validation tests: assert counts, bounds, index ranges, finite numbers, and stable asset hash
   in both languages.
8. Mesh fixture manifest: add a render-everywhere bunny fixture that references the asset manifest
   and declares camera/material/playback requirements.
9. Static browser bunny: render one fixed frame in the browser harness.
10. Static native bunny: render the same fixed frame in the Rust harness.
11. Static smoke gates: verify nonblank output, mesh metadata, and coarse visual invariants for one
    sampled frame.
12. Transform math law: define matrix layout, multiply order, coordinate handedness, axis
    normalization, and camera/projection composition.
13. Rotation playback: add deterministic sampled-frame transforms for fixed frame indices.
14. Browser rotation demo: animate the bunny at the declared fixed rate in the browser.
15. Native rotation demo: animate the bunny at the declared fixed rate in Rust.
16. Cross-runtime frame report: both runtimes print or expose matching frame index, elapsed time,
    rotation angle, asset hash, and transform profile.
17. Verification upgrade: add sampled-frame smoke tests for at least two nonzero rotation frames.
18. Demo documentation: document commands, expected output, claim boundaries, and troubleshooting.
19. Review hardening: run a Code Lawyer pass over mesh parsing, transform determinism, and fixture
    path safety.
20. Bearing refresh: close this milestone or set the next target, likely strict text/font law.

## Deferred Work

- Strict text and font rendering.
- Full animation and transition semantics.
- General shader/material extension.
- Arbitrary mesh formats beyond the chosen Stanford bunny PLY.
- Pixel-identical 3D rasterization across independent hardware backends.
- Production-grade native runtime packaging.

## Dependency Work

Open Dependabot state when this was refreshed: none known.

Manual lockfile conflict resolution should still be avoided unless Dependabot cannot regenerate a
clean branch.
