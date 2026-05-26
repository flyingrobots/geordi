# Geordi Status

**Date**: 2026-05-25
**Version**: `0.1.0-dev`
**Active milestone**: Strict Positioned Glyph-Run Text
**Current operating map**: [`../BEARING.md`](../BEARING.md)

This document is a stable status signpost. It intentionally avoids fixed package test counts because
those drift quickly; use CI, the current PR checks, and the commands in [`../README.md`](../README.md)
for current gate output.

## Current Position

The repository has moved past pure compiler scaffolding. The active work is a render-everywhere proof
ladder:

1. Rectangle render-everywhere proof: complete.
2. Stanford bunny mesh proof: complete for shared asset identity and coarse browser/native rendering
   smoke, not pixel-identical 3D rasterization.
3. Strict positioned glyph-run text: active.

The current active slice is tracked in [`../BEARING.md`](../BEARING.md). At the time of this refresh,
the lowest active open node is `S067`, native coarse pixel probes, after `S066` added browser strict
text coarse pixel probes.

## Completed Capabilities

| Area | Current state |
| --- | --- |
| Compiler core | Canonical AST parse/canonicalize/validate/emit path with deterministic artifacts and diagnostics. |
| GraphQL SDL adapter | Source-located SDL extraction and typed diagnostic transport into compiler-core. |
| Core IR | `geordi-ir/1` constants, validation, numeric profile, JSON port, and feature vocabulary. |
| Runtime profile | Runtime feature support checks reject missing, malformed, unknown, or unsupported requirements. |
| Render fixture package | Shared fixture contracts, hash helpers, mesh/font/strict-text manifest validators, and Node helpers. |
| GPVue fixture compiler | Constrained GPVue source can reproduce the checked-in hello-panel render fixture. |
| Browser proof harness | Browser canvas harness renders rectangle and bunny proof paths. |
| Native Rust proof harness | Rust workspace loads, validates, and renders rectangle and bunny proof paths. |
| Mesh asset proof | Stanford bunny PLY bytes are content-addressed, parsed, bounded, and exercised by browser/native gates. |
| Strict font assets | Lato font pack and failure fixtures prove content-addressed font/license boundaries. |
| Strict text manifests | TypeScript and Rust can validate strict text manifest structure, font references, line-box geometry, both canonical checked-in fixtures, and canonical fixture JSON normalization. |
| Strict text receipts | The receipt schema defines fixture, font-pack, glyph-run, line-box, semantic-text, and future glyph-evidence hash inputs; TypeScript and Rust can build canonical receipts for both strict text fixtures. |
| Strict text outline evidence | The first `geordi-glyph-evidence-pack/1` schema and two fixture-local `outlinePaths` evidence files are committed, canonicalized, covered by glyph-id smoke tests, parsed by TypeScript/Rust DTO APIs, and guarded by command-shape failure fixtures. |
| Browser strict text renderer | Browser harness code can load a strict text fixture/evidence/font-pack asset set, validate font references, render parsed outline evidence into Canvas path geometry without calling Canvas text APIs, disclose the strict text metadata contract in the browser UI, and pass Playwright nonblank/text-API/coarse-probe smoke. |
| Native strict text renderer | Rust renderer code can validate a strict text fixture/evidence pair, lower fixed 26.6 outline evidence into software path segments, fill nonzero outline geometry into the shared RGBA8 buffer, and report native strict text renderer metadata. The native harness has `--strict-text-smoke` for offscreen fixture/evidence/font validation, rendering, browser-aligned metadata reporting, and nonblank visible-text smoke without opening a window. |
| Strict text parity | Browser and native strict text reports now compare exact fixture/font/glyph-run/line-box/evidence/profile/count/semantic metadata before any pixel parity claim. |

## Active Work

The active milestone is not "general text support." It is a strict positioned glyph-run proof.

Current rules:

- strict text starts outside `geordi-ir/1`;
- text evidence uses content-addressed font assets;
- glyph runs are explicit positioned evidence;
- source strings are semantic/debug metadata only in strict mode;
- host font lookup, CSS text, platform text APIs, runtime shaping, fallback, wrapping, bidi, and
  variable font axes are not compliant paths;
- strict text graduates into core IR only after validation, browser rendering, native rendering,
  parity metadata, and failure fixtures prove the contract.

## Active Architecture Corrections

| Correction | Policy |
| --- | --- |
| Shared DTO drift | Serialized TypeScript/Rust contract DTOs must be generated from one Wesley common schema. |
| Runtime boundary | TypeScript remains native at browser, Node, tooling, and fixture-authoring edges. Rust remains native at the renderer and CLI core. WASM is reserved for hard deterministic kernels. |
| Cross-runtime validation | Use stable diagnostic identities and shared conformance fixtures. Do not compare prose error text as contract data. |
| Strict text rendering evidence | First visible text proof uses fixture-local `outlinePaths` evidence, fixed 26.6 glyph-origin local commands, fill-only monochrome geometry, and metadata-first parity. S052 defines the schema; S053 commits evidence data; S054/S055 add independent parsers; S056 hardens command validation; S057-S061 add browser and native outline render paths. |

Primary docs:

- [`design/2026-05-wesley-common-type-generation.md`](design/2026-05-wesley-common-type-generation.md)
- [`design/2026-05-typescript-rust-wasm-boundary.md`](design/2026-05-typescript-rust-wasm-boundary.md)
- [`design/2026-05-strict-text-remaining-slices-prd-test-plan.md`](design/2026-05-strict-text-remaining-slices-prd-test-plan.md)
- [`../fixtures/render-everywhere/strict-text/outline-evidence-pack.schema.md`](../fixtures/render-everywhere/strict-text/outline-evidence-pack.schema.md)

## Current Nonclaims

Geordi does not currently claim:

- compliant general text rendering;
- platform-native text as a deterministic path;
- CSS text;
- host font fallback;
- runtime shaping in strict mode;
- pixel-identical 3D mesh rasterization;
- production WebGPU/Metal/Vulkan renderers;
- a production CLI;
- binary IR packing;
- generated common DTOs already implemented;
- a required WASM dependency for ordinary TypeScript validation.

## Gate Map

Use the narrow gate for the files changed, then run full gates before PR handoff.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:docs
pnpm test:package-names
pnpm test:repo-sludge
pnpm test:placeholders
pnpm test:exports
git diff --check
```

Rust changes should also run:

```bash
cargo fmt --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Render-everywhere proof gates:

```bash
pnpm test:render-everywhere:gpvue
pnpm test:render-everywhere:bunny
```

## Decision Log

| Decision | Current stance |
| --- | --- |
| Renderer contract | `geordi-ir/1` is the public renderer contract. Draw-ready scene preparation is runtime-internal unless separately versioned. |
| Numeric profile | v0 uses `geordi-finite-binary64/1` plus explicit fixed-point profiles where needed. |
| Feature profile | Artifacts declare required features; runtimes reject unsupported requirements loudly. |
| JSON boundary | Production JSON ingress and egress goes through explicit ports that reject non-finite values and canonicalize output. |
| Time | `geordi-ir/1` describes scene snapshots; animation profiles must be explicit. |
| Text | Strict positioned glyph evidence is the current proof path; broad text remains deferred. |
| WASM | Optional future kernel boundary, not the default TypeScript package implementation strategy. |
