# Geordi Design Pack

**Status**: Draft
**Date**: 2026-05-25
**Baseline**: `main` at `69073ed`, after signpost refresh merge

This directory holds implementation design documents for P0 slice sequences. The design pack is
intentionally separate from [`../V0_DESIGN_LAWS.md`](../V0_DESIGN_LAWS.md): the laws define product
semantics, while these documents define implementation slices. The product north star lives in
[`../../VISION.md`](../../VISION.md), and archive candidates are tracked in
[`../ARCHIVE_CANDIDATES.md`](../ARCHIVE_CANDIDATES.md).

## Active Slice Map: Strict Positioned Glyph-Run Text

The executable checklist for this sequence lives in
[`../../BEARING.md`](../../BEARING.md). The detailed design document is
[`2026-05-strict-positioned-glyph-run-plan.md`](./2026-05-strict-positioned-glyph-run-plan.md).
The remaining-slice PRD and test plan is
[`2026-05-strict-text-remaining-slices-prd-test-plan.md`](./2026-05-strict-text-remaining-slices-prd-test-plan.md).
The dependency graph source is
[`2026-05-strict-positioned-glyph-run-dag.dot`](./2026-05-strict-positioned-glyph-run-dag.dot) and
the rendered graph is
[`2026-05-strict-positioned-glyph-run-dag.svg`](./2026-05-strict-positioned-glyph-run-dag.svg).
The matching P0 backlog item is
[`Define the strict positioned glyph-run profile`](../../BACKLOG.md#define-the-strict-positioned-glyph-run-profile).

Related planning spike:
[`2026-05-glyph-tooling-spike.md`](./2026-05-glyph-tooling-spike.md) proposes user-facing glyph
import, inspection, preview, debugging, and comparison tools. It should run after S041 unless the
font-pack import CLI is explicitly pulled forward.

Drift correction:
[`2026-05-wesley-common-type-generation.md`](./2026-05-wesley-common-type-generation.md) requires
cross-language serialized contract DTOs to be generated from one Wesley common schema rather than
hand-maintained separately in TypeScript and Rust.
[`2026-05-typescript-rust-wasm-boundary.md`](./2026-05-typescript-rust-wasm-boundary.md) defines
the matching runtime boundary: TypeScript stays native at the edges, Rust stays native at the
rendering core, contracts are generated, and WASM is reserved for hard deterministic kernels.

Use the DAG, not list order alone, to choose the next slice. A node is OPEN when all of its
dependencies are complete. After each slice, update the checklist state, update the DOT node status,
regenerate the SVG, and commit those planning-state changes with the slice.

Current OPEN node: S066.

## Completed Slice Map: Bunny Mesh Render Everywhere

The executable checklist for this sequence lives in
[`2026-05-bunny-mesh-slice-plan.md`](./2026-05-bunny-mesh-slice-plan.md). Keep that checklist
updated as slices land. Pause after slice 15 for a drift check.

| Slice | Working Title | Design Document |
| ---: | --- | --- |
| 1 | Bunny design pack | [`2026-05-bunny-mesh-render-everywhere.md`](./2026-05-bunny-mesh-render-everywhere.md) |
| 2 | Bunny slice checklist | [`2026-05-bunny-mesh-slice-plan.md`](./2026-05-bunny-mesh-slice-plan.md) |
| 3 | Asset manifest schema | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 4 | Stanford bunny manifest file | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 5 | Mesh feature profile | [`2026-05-bunny-mesh-render-everywhere.md`](./2026-05-bunny-mesh-render-everywhere.md) |
| 6 | Mesh fixture manifest shape | [`2026-05-bunny-mesh-render-everywhere.md`](./2026-05-bunny-mesh-render-everywhere.md) |
| 7 | TypeScript asset hash validator | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 8 | Rust asset hash validator | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 9 | TypeScript PLY boundary | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 10 | Rust PLY boundary | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 11 | Mesh validation tests | [`2026-05-bunny-mesh-asset-contract.md`](./2026-05-bunny-mesh-asset-contract.md) |
| 12 | Mesh bounds normalization law | [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md) |
| 13 | Camera descriptor law | [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md) |
| 14 | Projection descriptor law | [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md) |
| 15 | Matrix/vector operation-order law | [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md) |
| 16-30 | Rendering, rotation, docs, CI, hardening | [`2026-05-bunny-mesh-slice-plan.md`](./2026-05-bunny-mesh-slice-plan.md) |

## Completed Slice Map: Render Everywhere

The executable checklist for this sequence lives in
[`2026-05-render-everywhere-slice-plan.md`](./2026-05-render-everywhere-slice-plan.md).

| Slice | Working Title | Design Document |
| ---: | --- | --- |
| 1 | Render-everywhere design pack | [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md) |
| 2 | Shared fixture root | [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md) |
| 3 | Fixture manifest validator | [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md) |
| 4 | Pixel probe contract | [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md) |
| 5 | Browser harness scaffold | [`2026-05-browser-render-harness.md`](./2026-05-browser-render-harness.md) |
| 6 | Browser render smoke | [`2026-05-browser-render-harness.md`](./2026-05-browser-render-harness.md) |
| 7 | Browser Playwright gate | [`2026-05-browser-render-harness.md`](./2026-05-browser-render-harness.md) |
| 8 | Browser failure fixture | [`2026-05-browser-render-harness.md`](./2026-05-browser-render-harness.md) |
| 9 | Cargo workspace scaffold | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 10 | Rust IR crate | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 11 | Rust IR validation | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 12 | Rust runtime profile | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 13 | Native Rust app shell | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 14 | Rust rectangle renderer | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 15 | Rust offscreen smoke mode | [`2026-05-native-rust-render-harness.md`](./2026-05-native-rust-render-harness.md) |
| 16 | Shared hash display | [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md) |
| 17 | Render-everywhere README | [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md) |
| 18 | GPVue fixture hook | [`2026-05-gpvue-render-fixture-pipeline.md`](./2026-05-gpvue-render-fixture-pipeline.md) |
| 19 | GPVue compiler MVP | [`2026-05-gpvue-render-fixture-pipeline.md`](./2026-05-gpvue-render-fixture-pipeline.md) |
| 20 | End-to-end GPVue render everywhere | [`2026-05-gpvue-render-fixture-pipeline.md`](./2026-05-gpvue-render-fixture-pipeline.md) |

## Completed Slice Map: Feature Registry Hit List

| Slice | Working Title | Design Document |
| ---: | --- | --- |
| 1 | Refresh operating docs post-merge | [`2026-05-operating-docs-and-pr-gates.md`](./2026-05-operating-docs-and-pr-gates.md) |
| 2 | Backlog strict text profile seed | [`2026-05-strict-text-font-profile.md`](./2026-05-strict-text-font-profile.md) |
| 3 | Feature registry split | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 4 | Strict text feature vocabulary seed | [`2026-05-strict-text-font-profile.md`](./2026-05-strict-text-font-profile.md) |
| 5 | Runtime feature support model | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 6 | Capability subset tests | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 7 | Compiler baseline requirement lock | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 8 | Issue #6: Group zero-required-props type test | [`2026-05-compiler-test-hardening.md`](./2026-05-compiler-test-hardening.md) |
| 9 | Issue #5: CI-gated generated-type TSC check | [`2026-05-compiler-test-hardening.md`](./2026-05-compiler-test-hardening.md) |
| 10 | Final gates and PR | [`2026-05-operating-docs-and-pr-gates.md`](./2026-05-operating-docs-and-pr-gates.md) |

The older strict text/font profile document is retained as historical seed material. The active
execution source of truth is the strict positioned glyph-run design, checklist, and DAG above.

## Common Invariants

All slices must preserve these invariants:

- No rebase, amend, or force git operations.
- One concept per commit when execution starts.
- All production JSON ingress and egress remains behind the core JSON port.
- All thrown errors remain custom `Error` subclasses.
- Capability failures are hard failures, not best-effort rendering.
- Compiler emission of baseline IR requirements must not silently grow when future known features
  are added.
- Render-everywhere demos must consume the same canonical `scene.geordi.json` artifact in every
  runtime. Separate per-platform scene definitions are not proof of portability.
- Raw runtime text is not a pixel-identical cross-runtime claim. Use rectangle-only fixtures for the
  first deterministic browser/native proof.
- Local validation must include the relevant package gate plus final full gates before PR.

## Full Gate

The final slice should run:

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

After Rust workspace support exists, render-everywhere native PRs should also run:

```bash
cargo fmt --check
cargo test
cargo clippy --workspace --all-targets -- -D warnings
```

## Non-Goals

These design docs do not implement strict text shaping, matrix operation-order law, binary IR
packing, a production CLI, or the full GPVue compiler. They prepare the contracts and harnesses
that make those later changes explicit.
