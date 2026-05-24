# Geordi Bearing

**Date**: 2026-05-24
**Branch baseline**: `main` at `b9d1398`
**Current branch when refreshed**: `codex/bunny-rotation-milestone` at `f243bc9`

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
- The Stanford bunny mesh milestone is implemented through slice 25:
  - the bunny PLY is described by a canonical mesh asset manifest;
  - TypeScript and Rust validate the asset hash and parse the supported ASCII PLY subset;
  - the browser harness renders a static and live rotating bunny canvas;
  - the native Rust harness renders static, fixed-frame, and live-window bunny paths;
  - browser and native paths expose comparable sampled-frame metadata for frames such as `0`, `15`,
    and `60`.
- The completed rectangle proof is tracked in
  [`docs/design/2026-05-render-everywhere-slice-plan.md`](./docs/design/2026-05-render-everywhere-slice-plan.md).
- The active bunny milestone checklist is
  [`docs/design/2026-05-bunny-mesh-slice-plan.md`](./docs/design/2026-05-bunny-mesh-slice-plan.md).

Still true:

- The current exact pixel-probe rendering claim is rectangle-only. The bunny proof currently claims
  shared asset identity, shared parsed mesh metadata, deterministic sampled-frame metadata, and
  coarse nonblank smoke checks, not pixel-identical 3D rasterization.
- Text rendering remains deferred. No pixel-identical text claim is allowed until font identity,
  shaping, fallback, line breaking, and measurement laws exist.
- Multi-step geometry, vector, matrix, transform, camera, projection, depth, rasterization, and
  animation operation-order rules still need to be specified before Geordi can honestly claim broad
  graphics determinism.
- The native Rust path is currently a proof harness, not a full production runtime.
- CodeRabbit review status can be operationally noisy when review credits are exhausted; GitHub
  Actions CI remains the source of truth for repo gates unless explicitly stated otherwise.

## Next Credibility Milestone

The active goal is closing the mesh render-everywhere proof using the Stanford bunny asset already checked in at
[`fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply`](./fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply).

The demo now shows:

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

Follow the active bunny slice checklist in
[`docs/design/2026-05-bunny-mesh-slice-plan.md`](./docs/design/2026-05-bunny-mesh-slice-plan.md).
The repo is paused after slice 25. The remaining milestone work is documentation, demo-guide
alignment, CI wiring, Code Lawyer hardening, and the final bearing refresh.

Keep text rendering explicitly out of scope until after the bunny milestone lands.

## Remaining P0 Order

1. Bunny fixture documentation: document asset manifests, commands, expected output, attribution,
   and troubleshooting.
2. Demo guide update: extend the render-everywhere guide with bunny commands and claim boundaries.
3. CI gate wiring: add focused package and Rust gates for mesh parsing and bunny fixture validation
   without launching interactive windows.
4. Review hardening: run a Code Lawyer pass over mesh parsing, transform determinism, fixture path
   safety, and unsupported feature failures.
5. Bearing refresh: close this milestone or set the next target, likely strict text/font law.

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
