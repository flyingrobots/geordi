# Geordi Documentation

This index routes readers to current Geordi documentation. Design records
explain accepted or historical decisions; living references describe behavior
that exists on `main`.

## Start here

| Reader job | Document |
| --- | --- |
| Understand the product boundary | [`../VISION.md`](../VISION.md) |
| Find the active milestone and slice | [`../BEARING.md`](../BEARING.md) |
| Check current capabilities and nonclaims | [`STATUS.md`](./STATUS.md) |
| Understand compiler and package architecture | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Follow the complete compile-to-render path | [`end-to-end.md`](./end-to-end.md) |
| Run render-everywhere proofs | [`render-everywhere.md`](./render-everywhere.md) |
| Lower a Profunctor Page specimen | [`profunctor-page-target.md`](./profunctor-page-target.md) |
| Look up stable compiler errors | [`ERROR_CODES.md`](./ERROR_CODES.md) |
| Look up the ray-traced scene artifact, Q32.32 profile and receipt | [`ray-traced-scene-profile.md`](./ray-traced-scene-profile.md) |
| Look up the Bijou GPU presenter contract, fixtures, receipt validator and CPU reference oracle | [`bijou-gpu-conformance-kit.md`](./bijou-gpu-conformance-kit.md) |
| Find the evidence for each Bijou GPU conformance requirement | [`bijou-gpu-conformance-kit-test-plan.md`](./bijou-gpu-conformance-kit-test-plan.md) |
| Look up the canonical Bijou GPU shader, its GLSL generator, manifest and kernel harness | [`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md) |
| Find the evidence for each Bijou GPU shader requirement | [`bijou-gpu-shaders-test-plan.md`](./bijou-gpu-shaders-test-plan.md) |
| Look up the Bijou GPU dirty-union cell packer: damage law, full-refresh triggers, staging buffer and errors | [`bijou-gpu-surface-damage.md`](./bijou-gpu-surface-damage.md) |
| Find the evidence for each Bijou GPU packer requirement | [`bijou-gpu-surface-damage-test-plan.md`](./bijou-gpu-surface-damage-test-plan.md) |
| Look up the Bijou GPU glyph atlas: slots, colour detection, dirty rects, overflow and invalidation, and the browser rasterizer and font/DPR watcher | [`bijou-gpu-glyph-atlas.md`](./bijou-gpu-glyph-atlas.md) |
| Find the evidence for each Bijou GPU glyph atlas requirement | [`bijou-gpu-glyph-atlas-test-plan.md`](./bijou-gpu-glyph-atlas-test-plan.md) |
| Look up the Bijou GPU WebGPU presenter: refusal versus fault, dirty-row uploads, the two passes, readback, receipts, device loss and resize | [`bijou-gpu-webgpu-presenter.md`](./bijou-gpu-webgpu-presenter.md) |
| Find the evidence for each Bijou GPU WebGPU presenter requirement | [`bijou-gpu-webgpu-presenter-test-plan.md`](./bijou-gpu-webgpu-presenter-test-plan.md) |
| Look up the Bijou GPU Canvas 2D fallback presenter: pixel path, draw batching, full-redraw triggers and receipt | [`bijou-gpu-canvas2d-presenter.md`](./bijou-gpu-canvas2d-presenter.md) |
| Find the evidence for each Bijou GPU Canvas 2D presenter requirement | [`bijou-gpu-canvas2d-presenter-test-plan.md`](./bijou-gpu-canvas2d-presenter-test-plan.md) |
| Look up the native Rust `wgpu` offscreen proof: intake, render, evidence levels, receipts and command line | [`bijou-gpu-native-wgpu.md`](./bijou-gpu-native-wgpu.md) |
| Find the evidence for each native `wgpu` proof requirement | [`bijou-gpu-native-wgpu-test-plan.md`](./bijou-gpu-native-wgpu-test-plan.md) |
| Run Rust verification | [`RUST_GATES.md`](./RUST_GATES.md) |
| Apply documentation policy | [`DOCUMENTATION_STANDARDS.md`](./DOCUMENTATION_STANDARDS.md) |

## Current design

- [Fixed-point numeric profile and ray-traced scene profile](./design/2026-11-fixed-point-and-ray-traced-scene-profiles.md)
  (accepted; the first Rust slice, without a renderer, is described in
  [`ray-traced-scene-profile.md`](./ray-traced-scene-profile.md))
- [Profunctor Page target proof](./design/2026-07-profunctor-page-target-proof.md)
- [Portable Bijou UI render endpoints](./design/2026-06-portable-bijou-ui-render-endpoints.md)
- [TypeScript, Rust, and WASM boundary](./design/2026-05-typescript-rust-wasm-boundary.md)
- [Wesley common-type generation](./design/2026-05-wesley-common-type-generation.md)

The complete design-record index is
[`design/README.md`](./design/README.md). Archive posture is tracked in
[`ARCHIVE_CANDIDATES.md`](./ARCHIVE_CANDIDATES.md).
