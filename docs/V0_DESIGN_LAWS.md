# Geordi v0 Design Laws and P0 Stabilization

**Status**: Draft
**Date**: 2026-05-22
**Scope**: Product semantics and implementation direction for the next P0 stabilization pass.

This document answers the early design question exposed by the repo audit:

> Should renderers accept `geordi-ir/1` directly, or should `geordi-ir/1` be adapted into a separate draw-ready runtime model?

It also defines the v0 design laws that keep Geordi from becoming a generic scene graph or a partial CSS clone.

## Executive Decision

`geordi-ir/1` is the public renderer contract.

`@flyingrobots/geordi-core` owns the versioned IR types, validation, canonical JSON rules, numeric profile, and compatibility constants. `@flyingrobots/geordi-compiler-core` emits `geordi-ir/1`. Renderers such as `@flyingrobots/geordi-runtime-webgl` accept validated `geordi-ir/1` directly and declare the runtime profile they support.

A renderer may lower IR into an internal draw-ready cache, GPU command list, packed binary, atlas plan, or scene acceleration structure. That lowering is an implementation detail. It must not become a second public scene format unless it has its own version, validator, and explicit reason to exist.

### Rationale

- The README says Geordi IR is the universal compile target and renderers are swappable.
- A public adapter layer between compiler IR and runtime scene model would create two competing truths.
- Runtime import smoke tests become simple: compile IR, validate IR, render IR.
- Tooling, schema validation, diffs, diagnostics, and capability checks can all point at one artifact.

### Consequences

- The draw-ready runtime scene model with `version`, `canvas`, lowercase `type`, `bounds`, and `style` is internal and named `PreparedGeordiScene`.
- Runtime APIs should consume `GeordiIrV1`; `runtime-webgl` uses `renderGeordiToCanvas(ir)`.
- Canonical AST remains a compiler-facing interchange shape, not the runtime contract.
- Renderers must fail loudly when IR requires unsupported features.
- If a runtime needs preprocessing, expose it as `prepare(ir)` or an internal cache, not as a separate public input format.

## Core Compliance Law

A Geordi-compliant renderer is a pure implementation of:

```text
pixels = render(ir, viewport, assetPack, runtimeProfile)
```

where:

- `ir` is valid canonical `geordi-ir/1`.
- `viewport` is explicit and numeric.
- `assetPack` contains every external font, image, icon, and binary resource referenced by content hash.
- `runtimeProfile` declares the renderer's supported features and numeric/compositing profile.

If any input is missing, invalid, unsupported, or ambiguous, the renderer returns a hard diagnostic. It does not silently approximate.

## IR Shape Principles

The v0 IR should be small, explicit, and renderable:

- It contains resolved draw order.
- It contains resolved or deterministically resolvable geometry.
- It references assets by stable identity.
- It declares required feature capabilities.
- It has stable canonical JSON serialization for diffs and receipts.
- It does not contain CSS selectors, cascade, browser layout inheritance, or runtime parser dependencies.

Recommended top-level direction:

```ts
interface GeordiIrV1 {
  irVersion: 'geordi-ir/1';
  numericProfile: 'geordi-finite-binary64/1';
  requires: string[];
  scene: SceneFrame;
  assets?: AssetManifest;
  nodes: RenderNode[];
  diagnostics?: IrDiagnosticTrace[];
}
```

The current repo shape can evolve toward this without breaking the core idea. The important v0 law is that renderers consume `GeordiIrV1`, not a separate legacy scene graph.

## Numeric Law

Graphics numbers are part of the rendering contract, not incidental JSON details.

v0 defines `geordi-finite-binary64/1` as the current graphics numeric profile:

- JSON is only a debug, review, and interchange envelope.
- The JSON port must canonicalize object order, normalize `-0` to `0`, and reject `NaN` and infinities.
- The JSON port must not silently rescale or round ordinary numbers, because that changes author intent.
- Geometry, vectors, matrices, transforms, and animation values use finite JavaScript/IEEE-754 binary64 numbers in v0, with deterministic operation order still to be specified where multi-step math is introduced.
- `geordi-ir/1` declares `numericProfile`, compiler receipts include it, and runtimes fail loudly when the requested profile is unsupported.

An explicit fixed-point IR scalar can be added later for layout-critical geometry, for example `px * SCALE` stored as an integer under a new named `numericProfile`. A value such as `5.123402px` may lower to `5123402` only if the IR says the field is fixed-point with `scale = 1_000_000`. That conversion belongs in compiler normalization, not hidden inside generic JSON serialization.

Matrix and shader-adjacent math may require a separate profile, such as deterministic binary64 with a fixed operation order or a packed binary representation. This should be specified as a renderer compliance profile before v0 locks the IR schema.

## 1. Layout Law

### v0 Stance

Geordi v0 supports:

- Absolute positioning.
- Flex containers.
- Simple intrinsic sizing.

Everything else, including grid, general flow layout, floats, table layout, and CSS-like auto placement, is a compile-time error unless added behind an explicit feature profile.

### Deterministic Algorithm

Layout is a pure function:

```text
layoutTree = layout(inputTree, viewport, measurementProviders)
```

Rules:

- Parents own constraints.
- Children may report intrinsic preferences: preferred, min, and max size.
- Constraints flow downward.
- Intrinsic preferences flow upward.
- Children do not mutate parent constraints.
- Layout never consults ambient platform state.
- Layout output is concrete boxes: `x`, `y`, `width`, `height`.

This keeps Geordi deterministic without copying the DOM's historical layout behavior.

### Measurement

Measurement providers are explicit and profile-bound:

- Text measurement requires a specified font pack and shaping profile.
- Image measurement requires known intrinsic dimensions or an explicit size.
- Custom content measurement is not part of v0 baseline.

If a node needs a measurement provider that is unavailable, compilation or rendering fails.

### Reflow Triggers

Only these causes can dirty layout:

- Viewport size change.
- A layout-affecting node property change.
- Asset pack change that affects intrinsic size.
- Font pack change that affects text metrics.
- Host replacement of a subtree.

External platform changes, such as late font fallback or browser font substitution, are not valid hidden reflow triggers in deterministic mode.

### Implementation Note

For v0, compiler output may contain already resolved boxes. That is still compatible with the law. If runtime subtree relayout is added, the same core layout algorithm should live in `@flyingrobots/geordi-core` so compiler and runtimes do not diverge.

## 2. Text and Font Law

Text is deterministic only when the font set and shaping behavior are explicit.

### v0 Stance

There are two text modes:

- **Strict deterministic text**: IR contains a font resource hash, shaping profile, glyph ids, glyph positions, advances, and line boxes.
- **Best-effort raw text**: IR contains content and font intent, and the runtime shapes it. This is allowed only outside pixel-identical compliance.

The baseline Geordi compliance claim should be based on strict deterministic text.

### Font Identity

Fonts are referenced by content identity, not ambient family name:

```text
fontRef = { id, sha256, format, weight, style }
```

Logical names such as `Body` or `Mono` may exist in authoring layers, but compiler output must resolve them to concrete font resources for strict profiles.

### Shaping and Line Breaking

Strict text requires:

- A declared shaping profile, such as HarfBuzz-compatible shaping with a versioned profile name.
- A declared line-breaking profile.
- Stable glyph ids and positioned glyph runs in IR.

Raw `content: "hello"` is not enough to claim pixel-identical cross-runtime text.

### Fallback

Font fallback is explicit:

- The asset manifest declares the fallback chain.
- Missing glyph behavior is specified.
- Runtime-specific fallback is not allowed in strict deterministic mode.

If fallback resources are missing, rendering fails.

## 3. Visual and Compositing Law

### v0 Baseline Effects

The baseline visual feature set is intentionally small:

- Solid fills.
- Solid strokes.
- Rectangles and rounded rectangles.
- Text glyph runs.
- Images with explicit dimensions.
- Opacity.
- Rectangular clipping.
- Source-over compositing.

Deferred features:

- Shadows.
- Blur.
- Filters.
- Masks.
- Arbitrary clip paths.
- Blend modes beyond baseline source-over.
- Runtime-defined shaders.

Deferred features must be rejected with capability diagnostics, not approximated silently.

### Color and Alpha

v0 should define a single compositor profile:

- Colors are encoded as sRGB values.
- Rendering uses premultiplied alpha.
- Baseline compositing is Porter-Duff source-over.
- Any color interpolation must declare whether it is sRGB or linear-light.

If a backend cannot meet the selected compositor profile, it should advertise a different runtime profile and fail strict compliance checks.

### Draw Order

Runtime draw order is the IR node order.

`zIndex` may exist in canonical AST or debug metadata, but renderers should not implement DOM-like stacking contexts. The compiler is responsible for resolving authoring order, hierarchy, and z hints into a single canonical draw order.

Hierarchy may still matter for layout, transforms, clipping, grouping, and hit paths. It does not create implicit CSS stacking behavior.

## 4. Interaction and Hit Testing Law

Geordi IR is not a DOM event system.

### v0 Stance

The renderer provides hit testing over the rendered IR. Higher-level SDKs own event routing, state, and callbacks.

### Hit Testing Semantics

Hit testing is deterministic:

- It uses the same resolved geometry and transforms as rendering.
- It respects `visible: false`.
- It respects explicit hit-test policy such as `hitTest: "none"`.
- It respects clipping.
- Opacity alone does not remove a node from hit testing.
- Draw order decides tie-breaking; topmost eligible node wins.

The result should include at least:

```ts
interface HitTestResult {
  nodeId: string;
  path: string[];
}
```

### Interaction State

Hover, pressed, focus, selection, and active state live above Geordi v0. Hosts produce new IR snapshots for each visual state.

Variants may be added later, but they should be explicit render-state variants, not a hidden event model.

## 5. Time and Animation Law

Geordi v0 IR is a scene snapshot, not an animation engine.

### v0 Stance

Time is outside the core IR. Hosts express time by producing new scene snapshots.

This means:

- Frame scheduling belongs to the host/runtime.
- Vsync belongs to the host/runtime.
- Transition orchestration belongs to the host or SDK layer.
- `geordi-ir/1` describes what to render now.

### Future Animation

If declarative animation returns later, it must define:

- Interpolation rules.
- Easing profiles.
- Color interpolation space.
- Discrete property behavior.
- Time origin and sampling behavior.
- Capability requirements.

Until then, animation fields should either be removed from the baseline IR or treated as feature-gated and rejected by renderers that do not support them.

## 6. Asset Law

All non-primitive content is explicit and content-addressed.

### Images

Images are referenced by asset id plus content hash:

```text
imageRef = { id, sha256, mediaType, width, height }
```

URLs may be used as fetch hints, but not as identity in strict deterministic mode.

### Icons and Vector Sub-Scenes

For v0, symbols, icons, and vector components should be flattened at compile time into render nodes.

This keeps renderer semantics simple. Symbol retention can be added later for tooling or binary packing, but it must not change pixel output.

### Materials and Shaders

v0 exposes a fixed material model:

- Solid color.
- Image fill.
- Text glyph fill.

Custom shaders are out of scope for v0 baseline. A future shader system must be feature-gated and deterministic by construction.

## 7. Feature Profile Law

Every IR declares what it requires. Every runtime declares what it supports.

### Baseline Profile

Recommended baseline profile:

```text
geordi/core-v0
```

Baseline features:

- `shape.rect`
- `shape.roundRect`
- `paint.solid`
- `stroke.solid`
- `clip.rect`
- `composite.sourceOver`
- `alpha.premultiplied`
- `text.glyphRuns`
- `image.rgba8`
- `layout.resolved`
- `hit.geometry`

Optional profiles can extend this, for example:

- `layout.flex-v0`
- `text.raw-runtime-shaping`
- `effect.shadow-v1`
- `effect.blur-v1`
- `animation.keyframes-v1`

### Failure Mode

If `ir.requires` contains a feature unsupported by the renderer, rendering fails before drawing.

No feature downgrade is allowed in strict mode. Best-effort mode may exist for development, but it must mark output as non-compliant.

## 8. Tooling and Introspection Law

Geordi should be inspectable like a compiler artifact, not opaque like a canvas command stream.

### Validation

IR validation should include:

- JSON schema validation.
- Semantic validation.
- Capability validation.
- Asset manifest validation.
- Source-located diagnostics where source maps exist.

Diagnostics should use stable error codes.

### Canonical JSON

Canonical JSON is the v0 debug and review format, not the whole graphics fidelity story. The
canonical JSON port lives in `@flyingrobots/geordi-core`; other packages use or re-export that
boundary instead of calling `JSON.parse` or `JSON.stringify` directly:

- Stable key order.
- Stable node order.
- Stable whitespace profile for emitted artifacts.
- Stable receipts containing input hash, IR hash, rule fingerprints, and profile information.
- Finite-number-only input, with `-0` normalized to `0`.
- No hidden rounding or fixed-point scaling inside the JSON port.

A separate text IR can be considered later. A packed binary IR or explicit fixed-point numeric layer should be considered before claiming pixel-identical behavior for vector, matrix, or shader-heavy scenes.

### Explainability

The IR should be structured so future tools can answer:

- Why is this node at this position?
- Which parent constraint determined this size?
- Which source directive produced this node?
- Which asset or font affected this glyph run?
- Which feature profile requires this renderer capability?

This implies source references, layout traces, and diagnostic details should be preserved through compiler phases.

## P0 Stabilization Implications

These implementation items were derived from the design laws and repo audit. Current backlog state
is tracked in [`../BACKLOG.md`](../BACKLOG.md), and current operating order is tracked in
[`../BEARING.md`](../BEARING.md).

### P0: Make Node ESM package exports importable after build

Public package entrypoints must work under Node ESM after `pnpm build`. Add smoke tests that import every package through its public export path.

**Status**: Completed in the first stabilization pass.

### P0: Restore ESLint 10 as a real CI gate

Add a root flat ESLint config or downgrade intentionally. CI currently runs lint, so lint must either work or be removed from CI until it is real.

**Status**: Completed in the first stabilization pass.

### P0: Make `geordi-ir/1` the runtime contract

Move versioned IR types and validation into `@flyingrobots/geordi-core`. Update `runtime-webgl` to accept validated IR directly or expose only an internal preparation step.

**Status**: Completed. `@flyingrobots/geordi-core` owns `geordi-ir/1` constants, types, and
structural validation. `compiler-core` emits/re-exports the shared contract. `runtime-webgl`
validates IR at the boundary, renders it through the primary `renderGeordiToCanvas()` API, and
names the draw-ready runtime shape `PreparedGeordiScene`. Compatibility aliases remain during the
v0.1 migration, but they are no longer the documented public renderer contract.

### P0: Implement or remove canonicalization

`canonicalize` is part of the public compiler options and docs, but the current compiler does not execute a normalization phase. Implement `normalizeCanonicalAst()` or remove the option and update docs.

**Status**: Completed in the first stabilization pass.

### P0: Define the graphics numeric profile

Canonical JSON alone is not enough for a graphics library. Define the v0 scalar law for geometry, vectors, matrices, transforms, and animation values. Decide which fields lower to fixed-point integers, which may remain deterministic binary64, and how the profile is declared in IR and runtime capabilities.

**Status**: Completed. `geordi-ir/1` declares `numericProfile: "geordi-finite-binary64/1"`,
compiler receipts include the profile, runtime-webgl declares and checks its supported profile,
and the core JSON port rejects non-finite numbers, canonicalizes `-0`, and does not round or
fixed-point scale ordinary finite values.

### P0: Validate GraphQL directive argument types at runtime

Replace unsafe directive argument casts with typed extractors that emit source-located `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE` diagnostics.

**Status**: Completed. `@geordi_scene` and `@geordi_node` arguments now cross the schema boundary through typed runtime readers; wrong literal types, non-finite numeric values, and invalid `props` JSON object payloads fail with source-located diagnostics.

### P0: Lower or explicitly reject every known Geordi directive

Known directives such as `geordi_bind` and `geordi_style` must either lower into canonical AST/IR or produce explicit unsupported-feature diagnostics. Silent drops are not allowed.

**Status**: Completed. `geordi_bind` and `geordi_style` now emit source-located
`GEORDI_E_FEATURE_NOT_IMPLEMENTED` diagnostics until they are deliberately lowered.

### P0: Preserve typed diagnostics across adapter/compiler boundaries

Adapter failures should preserve `GEORDI_E_INPUT_INVALID_SDL`, `GEORDI_E_SCENE_MISSING`, directive errors, and source locations through `compile()`. Plain `Error` wrapping should be replaced with typed diagnostic transport.

**Status**: Completed. Adapter-thrown compiler errors are preserved, and `DiagnosticsError` carries already-collected diagnostics across the `schema-graphql` to `compiler-core` boundary.

### P0: Replace placeholder tests with package contract tests

`runtime-webgl` and `wesley-generator` need tests that exercise public behavior, not placeholder assertions. Include post-build import smoke tests and at least one SDL-to-artifacts integration path.

**Status**: Completed. Placeholder assertions are blocked by CI, package entrypoints are
smoke-tested, and `runtime-webgl` plus `wesley-generator` now have behavior-level contract tests.

### P0: Remove tracked generated logs and stale nested lockfiles

Tracked `.turbo` logs and package-level stale lockfiles should be removed. Verification commands should not dirty the working tree.

**Status**: Completed in the first stabilization pass.

### P0: Align Turbo task outputs with command behavior

Plain `test` does not emit coverage, so `turbo.json` should not declare coverage output for `test`. Keep coverage outputs on `test:coverage`.

**Status**: Completed in the first stabilization pass.

## Open Questions

These should be answered before locking the v0 IR schema:

- Should v0 IR include raw text at all, or should raw text remain only in canonical AST and authoring layers?
- Should v0 IR use `props.x/y/width/height` temporarily, or should it introduce an explicit `box` field before more runtimes exist?
- Should `zIndex` remain in emitted IR as debug metadata, or be removed after draw order is resolved?
- Should layout intent appear in renderable IR, or should renderable IR always contain resolved boxes and optional layout traces?
- What exact compositor profile should `geordi/core-v0` require for WebGL and future native backends?

## Recommended Next Step

The first stabilization pass is merged. Continue in this order:

1. Preserve typed diagnostics across adapter/compiler boundaries.
2. Validate GraphQL directive argument types at runtime.
3. Lower or explicitly reject every known Geordi directive.
4. Expand package behavior tests beyond public entrypoint smoke.
5. Add source maps and diagnostic UX improvements.
6. Define the next feature/capability profile beyond the v0 baseline.
