# Geordi Vision

**Status**: Product and architecture north star
**Date**: 2026-05-25

Geordi exists to make rich UI render artifacts portable, inspectable, and deterministic enough to
prove across runtimes.

The target is not "run web pages somewhere else." The target is a versioned scene artifact with
explicit geometry, explicit assets, explicit feature requirements, stable receipts, and fail-loud
runtime negotiation.

## Product Thesis

Modern UI stacks hide too much inside ambient platform state:

- CSS cascade;
- host font lookup;
- browser layout quirks;
- runtime text shaping;
- device-dependent raster behavior;
- implicit asset loading;
- renderer-specific fallbacks.

Those behaviors are useful for the web, but they are hostile to portable rendering proofs. Geordi's
job is to move as much rendering intent as possible into explicit, reviewable artifacts.

## North-Star Claim

Given the same Geordi artifact, the same declared assets, and a renderer that supports the artifact's
feature profile, Geordi should make cross-runtime rendering behavior explainable and testable.

The compliance shape is:

```text
pixels = render(ir, viewport, assetPack, runtimeProfile)
```

where each input is explicit, versioned, and validated.

## What Geordi Is

Geordi is:

- a canonical scene IR;
- a feature-profile and numeric-profile contract;
- a compiler output target;
- a render fixture and receipt format;
- a browser/native proof harness;
- a place to define deterministic rendering laws before broad support is claimed.

Geordi is intended to serve:

- UI framework compilers such as GPVue;
- design and tooling adapters;
- browser runtimes;
- native runtimes;
- CI proof tooling;
- humans reviewing artifacts, diffs, hashes, and receipts.

## What Geordi Is Not

Geordi is not:

- a DOM runtime;
- a CSS compatibility layer;
- a browser layout clone;
- a general text engine yet;
- a "best effort" renderer;
- a mandate that TypeScript must call Rust through WASM for ordinary validation;
- a claim that all backends are pixel-identical before explicit gates prove it.

## Proof Ladder

Geordi grows by claims, not by wishful API surface.

| Layer | Status | Claim |
| --- | --- | --- |
| Rectangle render-everywhere | Complete | One `geordi-ir/1` artifact renders through browser and native harnesses with exact rectangle pixel probes. |
| Stanford bunny mesh | Complete | One content-addressed PLY asset and descriptor load in browser and native harnesses with shared identity and sampled-frame metadata. |
| Strict positioned glyph-run text | Active | Text proof uses positioned glyph evidence and content-addressed font assets outside core IR, with browser/native validation and coarse proof gates. |
| Generated common contracts | Required drift correction | Shared serialized DTOs move from handwritten mirrors to Wesley/common-type generation. |
| Font/glyph/raster hard kernels | Future | Rust/WASM is introduced only where deterministic algorithmic reuse justifies the package cost. |

## Architecture Position

The durable architecture rule is:

```text
TypeScript-native at the edges.
Rust-native at the rendering core.
Generated at the contract boundary.
WASM-backed only for hard deterministic kernels.
```

TypeScript remains the right place for browser integration, Node helpers, docs tooling, fixture
authoring, and simple object-shaped validation. Rust remains the right place for native rendering,
CLI-grade validation, and hard binary/graphics algorithms.

Shared contracts should come from one schema and generate TypeScript and Rust DTOs. Behavior around
those DTOs may stay handwritten when it is host-specific or simple enough to prove with conformance
fixtures.

## Text Position

Strict Geordi text is not strings.

The active text milestone is `geordi-strict-positioned-glyph-run/1`:

- content-addressed font packs;
- explicit line boxes;
- fixed-point positioned glyph evidence;
- explicit semantic/source text that does not affect pixels;
- validation before rendering;
- browser/native proof before any broader text claim.

Strict mode does not allow host font fallback, platform text APIs, runtime shaping, runtime kerning,
ligature substitution, wrapping, bidi handling, complex-script support, or variable font axes.

Shaping may become a future preparation feature only behind a pinned text-prep boundary with
fingerprinted inputs and outputs. It must not become runtime shaping inside compliant renderers.

Those unsupported runtime behaviors may become future features only behind explicit profiles and
proof gates.

## Quality Bar

Geordi should prefer narrow, proven claims over broad, approximate features.

Every new rendering claim should answer:

- What exact artifact is consumed?
- What feature profile does it require?
- What assets are needed?
- What validates the artifact?
- What fails loudly?
- What browser and native gates prove the behavior?
- What is explicitly not claimed?

If the answer is unclear, the feature is not ready to become a public Geordi claim.

## Near-Term Direction

The next credible work is:

1. Finish the strict positioned glyph-run validation and rendering ladder.
2. Add stable strict text diagnostic identities.
3. Add shared TypeScript/Rust conformance fixtures.
4. Implement Wesley/common-type generation for shared serialized DTOs.
5. Keep broad text, shaping, raster, and WASM work behind explicit profiles and design documents.
