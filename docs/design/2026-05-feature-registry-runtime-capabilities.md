# Feature Registry and Runtime Capabilities Design

**Status**: Draft
**Date**: 2026-05-23
**Slices Covered**: 3, 5, 6, and 7

## Problem

The current feature profile model uses `GEORDI_BASELINE_FEATURES` as both the emitted baseline and
the complete known feature vocabulary. That worked for the first capability-profile pass, but it
does not scale. The next strict text features must be known to core without being emitted by the
compiler baseline and without being accepted by runtimes that do not support them.

The model needs three separate concepts:

- features known to this IR version
- features emitted by the compiler baseline
- features supported by a runtime

## Goals

- Split known feature vocabulary from baseline emitted requirements.
- Keep compiler baseline output stable.
- Rename runtime profile semantics so the runtime advertises supported features, not required
  features.
- Add tests for subset acceptance and unsupported optional features.

## Non-Goals

- Do not add strict text rendering.
- Do not make runtime-webgl support features it cannot render.
- Do not add best-effort fallback behavior.
- Do not add version negotiation across multiple IR versions.

## Proposed Core Model

Core should expose three levels:

```ts
export const GEORDI_CORE_PROFILE = 'geordi/core/1' as const;

export const GEORDI_KNOWN_FEATURES = [
  GEORDI_CORE_PROFILE,
  'layout.resolved',
  'shape.group',
  'shape.image',
  'shape.rect',
  'shape.text',
  'paint.solid',
  'stroke.solid',
  'paint.opacity',
  'shape.cornerRadius',
  'text.fill',
  'text.raw-runtime-shaping',
  'text.fontPack',
  'text.shapingProfile',
  'text.lineBreakProfile',
  'text.fallbackChain',
  'text.glyphRuns',
  'text.lineBoxes',
] as const;

export const GEORDI_BASELINE_FEATURES = [
  GEORDI_CORE_PROFILE,
  'layout.resolved',
  'shape.group',
  'shape.image',
  'shape.rect',
  'shape.text',
  'paint.solid',
  'stroke.solid',
  'paint.opacity',
  'shape.cornerRadius',
  'text.fill',
  'text.raw-runtime-shaping',
] as const;
```

`GeordiFeatureRequirement` should derive from `GEORDI_KNOWN_FEATURES`, not from
`GEORDI_BASELINE_FEATURES`.

## Validation Law

Core validation checks whether `ir.requires` is structurally valid for this IR version:

- `requires` is an array.
- Every entry is a string.
- Every entry is in `GEORDI_KNOWN_FEATURES`.
- No duplicates exist.
- `GEORDI_CORE_PROFILE` is present.

Runtime validation checks whether the runtime supports the requested subset:

- Every entry in `ir.requires` appears in `runtimeProfile.supportedFeatureRequirements`.
- Missing, malformed, or unsupported features throw `GeordiRuntimeUnsupportedProfileError`.
- Runtime rejection happens before drawing.

This preserves a useful distinction:

- Unknown feature: invalid IR for this core version.
- Known but unsupported feature: valid IR, unsupported by this runtime.

## Runtime Profile Shape

Preferred public shape:

```ts
interface GeordiRuntimeProfile {
  readonly irVersion: typeof GEORDI_IR_VERSION;
  readonly numericProfile: GeordiNumericProfile;
  readonly supportedFeatureRequirements: readonly GeordiFeatureRequirement[];
  readonly nodeKinds: readonly GeordiRuntimeNodeKind[];
  readonly visualFeatures: readonly GeordiRuntimeVisualFeature[];
}
```

The previous name, `featureRequirements`, reads as if the runtime requires features from the IR.
The runtime actually supports a set. Because the project is still pre-v0.1, the preferred change is
a direct rename. A compatibility alias should be added only if downstream usage forces it.

## Compiler Baseline Lock

Compiler-core should continue to define:

```ts
export const FEATURE_REQUIREMENTS = GEORDI_BASELINE_FEATURES;
```

Tests must prove:

- `scene.geordi.json.requires` equals `GEORDI_BASELINE_FEATURES`.
- Receipts record exactly `GEORDI_BASELINE_FEATURES`.
- Adding known strict text features does not alter compiler output.

## Slice 3 Acceptance Criteria

- Core exports `GEORDI_KNOWN_FEATURES`.
- `GeordiFeatureRequirement` derives from known features.
- `GEORDI_BASELINE_FEATURES` remains a subset of known features.
- Core tests prove known features, baseline features, duplicate rejection, and unknown rejection.

## Slice 5 Acceptance Criteria

- Runtime profile uses `supportedFeatureRequirements`.
- Runtime-webgl profile supports the baseline feature list.
- Runtime tests cover the new field name.
- Package export smoke still passes.

## Slice 6 Acceptance Criteria

- Runtime accepts an IR whose `requires` list is a supported subset.
- Runtime rejects a valid IR that requests known strict text features not supported by runtime-webgl.
- Runtime still rejects unknown features through core validation or unsupported-profile checks,
  depending on where the invalid object enters.

## Slice 7 Acceptance Criteria

- Compiler golden tests prove emitted IR requirements stay equal to `GEORDI_BASELINE_FEATURES`.
- Receipt tests prove feature requirement hashes stay based on emitted baseline requirements.
- Tests fail if future known features accidentally leak into compiler baseline output.

## Risks

- Renaming the runtime field may break external consumers. The repo is pre-v0.1, so direct cleanup
  is still preferred.
- If core accepts every future known feature too early, schema evolution can outpace implementation.
  Only add names that have a documented failure mode.
- If compiler baseline grows accidentally, runtimes can start rejecting previously renderable IR.

## Verification

Relevant gates:

```bash
pnpm --filter @flyingrobots/geordi-core test
pnpm --filter @flyingrobots/geordi-core typecheck
pnpm --filter @flyingrobots/geordi-core lint
pnpm --filter @flyingrobots/geordi-runtime-webgl test
pnpm --filter @flyingrobots/geordi-runtime-webgl typecheck
pnpm --filter @flyingrobots/geordi-runtime-webgl lint
pnpm --filter @flyingrobots/geordi-compiler-core test
pnpm test:exports
```
