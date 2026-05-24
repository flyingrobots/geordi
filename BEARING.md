# Geordi Bearing

**Date**: 2026-05-24
**Branch baseline**: `main` at `b9d1398`
**Current branch when refreshed**: `codex/bunny-rotation-milestone` closeout

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
- The Stanford bunny mesh milestone is implemented through slice 30:
  - the bunny PLY is described by a canonical mesh asset manifest;
  - TypeScript and Rust validate the asset hash and parse the supported ASCII PLY subset;
  - the browser harness renders a static and live rotating bunny canvas;
  - the browser harness can switch between the rectangle proof and the bunny proof with debug
    metadata hidden behind disclosure panels;
  - the native Rust harness renders static, fixed-frame, and live-window bunny paths;
  - browser and native paths expose comparable sampled-frame metadata for frames such as `0`, `15`,
    and `60`;
  - focused CI gates validate TypeScript mesh parsing, browser bunny unit coverage, native Rust
    tests, native clippy, bunny manifest validation, and native fixed-frame smoke without opening
    interactive windows;
  - the hardening pass tightened browser mesh-manifest checks, host elapsed-time validation,
    playback descriptor validation, and TypeScript/Rust PLY parser strictness.
- The completed rectangle proof is tracked in
  [`docs/design/2026-05-render-everywhere-slice-plan.md`](./docs/design/2026-05-render-everywhere-slice-plan.md).
- The completed bunny milestone checklist is
  [`docs/design/2026-05-bunny-mesh-slice-plan.md`](./docs/design/2026-05-bunny-mesh-slice-plan.md).

Still true:

- The current exact pixel-probe rendering claim is rectangle-only. The bunny proof currently claims
  shared asset identity, shared parsed mesh metadata, deterministic sampled-frame metadata, and
  coarse nonblank smoke checks, not pixel-identical 3D rasterization.
- Text rendering remains deferred. No pixel-identical text claim is allowed until font identity,
  shaping, fallback, line breaking, and measurement laws exist.
- Full IR-level geometry, vector, matrix, transform, camera, projection, depth, rasterization, and
  animation operation-order rules still need to be specified before Geordi can honestly claim broad
  graphics determinism beyond the current demo harness contracts.
- The native Rust path is currently a proof harness, not a full production runtime.
- CodeRabbit review status can be operationally noisy when review credits are exhausted; GitHub
  Actions CI remains the source of truth for repo gates unless explicitly stated otherwise.

## Next Credibility Milestone

The bunny milestone is closed for its stated claim boundary. The next credibility milestone should
be strict text and font law.

The target is not "draw some text." The target is an honest deterministic text contract:

1. Font identity is content-addressed, not runtime-selected by family name.
2. The IR or fixture descriptor declares the exact font pack and fallback order.
3. Shaping, glyph fallback, line breaking, and measurement have a normative implementation or
   fixture-level precomputed representation.
4. Browser and native harnesses reject missing fonts or unsupported text features before drawing.
5. Initial smoke tests prove metadata equality and carefully scoped pixel probes for a tiny fixed
   string, not broad typography parity.

This should start as design and harness law before it becomes a general Geordi IR feature. Text is
the highest-risk next axis because platform font stacks and shaping engines diverge by default.

## Bunny Rotation Result

The bunny milestone did not introduce a general animation system. It implemented a narrow demo
playback law:

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
- The core IR continues to represent a scene snapshot.
- Time remains isolated to the mesh demo playback profile and harness descriptor.

The first bunny proof uses `[3, 5, 2]` as the authored axis and normalizes it in the playback report.
Browser and native smoke paths now agree on frame indices, seconds, angle, normalized axis, transform
profile, mesh identity, and mesh counts.

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

Wrap the bunny branch with final docs/changelog polish, open the PR to `main`, and let CI be the
merge gate.

After the bunny PR lands, do not start text implementation by adding ad hoc canvas text. First write
the strict text/font law, then choose a deliberately tiny first fixture. Keep the same discipline as
the bunny milestone: manifest first, typed boundary parsing, custom errors, focused gates, then
browser/native render proof.

## Remaining P0 Order

1. Strict text/font design pack: font identity, font pack manifest, shaping, fallback, measurement,
   line breaking, and claim boundaries.
2. Text fixture slice checklist: define a small executable plan before implementation begins.
3. Font asset boundary: content-addressed font files, fixture-local paths, hashes, licensing, and
   failure modes.
4. Text shaping/measurement boundary: choose normative implementation or precomputed fixture data.
5. First text render-everywhere proof: one tiny fixed string, one font pack, browser and native
   gates, explicit nonclaims.

## Deferred Work

- Full animation and transition semantics.
- General shader/material extension.
- Arbitrary mesh formats beyond the chosen Stanford bunny PLY.
- Pixel-identical 3D rasterization across independent hardware backends.
- Production-grade native runtime packaging.

## Dependency Work

Open Dependabot state when this was refreshed: none known.

Manual lockfile conflict resolution should still be avoided unless Dependabot cannot regenerate a
clean branch.
