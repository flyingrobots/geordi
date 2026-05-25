# Archive Candidates

**Status**: Review list, not an archive operation
**Date**: 2026-05-25

This document identifies docs that look eligible for archive once active links are rewritten and the
team agrees on the archive layout. It does not move files. Keeping the list separate avoids hiding
historical context while the active strict text milestone is still moving quickly.

Recommended archive layout, if adopted later:

```text
docs/archive/2026-05/
```

## Keep Active

These documents should remain first-class signposts:

| Document | Reason |
| --- | --- |
| [`../README.md`](../README.md) | Repository entry point. |
| [`../VISION.md`](../VISION.md) | Product and architecture north star. |
| [`../BEARING.md`](../BEARING.md) | Current operating map and active checklist. |
| [`STATUS.md`](./STATUS.md) | Stable status summary. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Package and compiler architecture overview. |
| [`V0_DESIGN_LAWS.md`](./V0_DESIGN_LAWS.md) | Product/runtime laws. |
| [`ERROR_CODES.md`](./ERROR_CODES.md) | Stable compiler error-code taxonomy. |
| [`RUST_GATES.md`](./RUST_GATES.md) | Rust gate policy. |
| [`render-everywhere.md`](./render-everywhere.md) | Current runnable render-everywhere guide. |
| [`end-to-end.md`](./end-to-end.md) | Detailed source-to-runtime walkthrough. |
| [`design/README.md`](./design/README.md) | Design-pack index. |
| [`design/2026-05-strict-positioned-glyph-run-plan.md`](./design/2026-05-strict-positioned-glyph-run-plan.md) | Active strict text design. |
| [`design/2026-05-strict-positioned-glyph-run-dag.dot`](./design/2026-05-strict-positioned-glyph-run-dag.dot) | Active strict text DAG source. |
| [`design/2026-05-strict-positioned-glyph-run-dag.svg`](./design/2026-05-strict-positioned-glyph-run-dag.svg) | Active strict text DAG rendering. |
| [`design/2026-05-wesley-common-type-generation.md`](./design/2026-05-wesley-common-type-generation.md) | Active drift-correction plan. |
| [`design/2026-05-typescript-rust-wasm-boundary.md`](./design/2026-05-typescript-rust-wasm-boundary.md) | Active runtime boundary policy. |
| [`design/2026-05-glyph-tooling-spike.md`](./design/2026-05-glyph-tooling-spike.md) | Proposed glyph tooling plan, not executed yet. |

## Archive-Eligible Now

These are completed or superseded planning docs. They are useful historical records but should not be
the first documents a new reader reaches for.

| Document | Why it is archive-eligible | Current replacement/signpost |
| --- | --- | --- |
| [`design/2026-05-strict-text-font-profile.md`](./design/2026-05-strict-text-font-profile.md) | Historical seed for strict text. It is superseded by the strict positioned glyph-run plan and BEARING checklist. | [`design/2026-05-strict-positioned-glyph-run-plan.md`](./design/2026-05-strict-positioned-glyph-run-plan.md) |
| [`design/2026-05-render-everywhere-slice-plan.md`](./design/2026-05-render-everywhere-slice-plan.md) | Completed rectangle proof checklist. | [`render-everywhere.md`](./render-everywhere.md) |
| [`design/2026-05-render-everywhere-demo.md`](./design/2026-05-render-everywhere-demo.md) | Historical design for the completed rectangle proof. | [`render-everywhere.md`](./render-everywhere.md), [`end-to-end.md`](./end-to-end.md) |
| [`design/2026-05-browser-render-harness.md`](./design/2026-05-browser-render-harness.md) | Completed browser harness planning doc. | [`../examples/browser-render-everywhere/README.md`](../examples/browser-render-everywhere/README.md) |
| [`design/2026-05-native-rust-render-harness.md`](./design/2026-05-native-rust-render-harness.md) | Completed native harness planning doc. | [`../examples/native-render-everywhere/README.md`](../examples/native-render-everywhere/README.md), [`RUST_GATES.md`](./RUST_GATES.md) |
| [`design/2026-05-gpvue-render-fixture-pipeline.md`](./design/2026-05-gpvue-render-fixture-pipeline.md) | Completed GPVue render-fixture path planning. | [`render-everywhere.md`](./render-everywhere.md), [`end-to-end.md`](./end-to-end.md) |
| [`design/2026-05-operating-docs-and-pr-gates.md`](./design/2026-05-operating-docs-and-pr-gates.md) | Completed operating-docs gate slice. | [`../README.md`](../README.md), [`design/README.md`](./design/README.md) |
| [`design/2026-05-compiler-test-hardening.md`](./design/2026-05-compiler-test-hardening.md) | Completed test-hardening planning record. | [`STATUS.md`](./STATUS.md), package tests |
| [`design/2026-05-feature-registry-runtime-capabilities.md`](./design/2026-05-feature-registry-runtime-capabilities.md) | Completed feature registry/runtime capability planning. | [`V0_DESIGN_LAWS.md`](./V0_DESIGN_LAWS.md), [`STATUS.md`](./STATUS.md) |

## Archive-Eligible After Bunny Links Are Rewritten

These documents are completed milestone records. They remain heavily cross-linked from the design
pack today, so archive them only after the design README and any active docs point at
[`render-everywhere.md`](./render-everywhere.md) or [`end-to-end.md`](./end-to-end.md) instead.

| Document | Why it is archive-eligible | Current replacement/signpost |
| --- | --- | --- |
| [`design/2026-05-bunny-mesh-slice-plan.md`](./design/2026-05-bunny-mesh-slice-plan.md) | Completed 30-slice bunny checklist. | [`render-everywhere.md`](./render-everywhere.md) |
| [`design/2026-05-bunny-mesh-render-everywhere.md`](./design/2026-05-bunny-mesh-render-everywhere.md) | Completed bunny milestone design. | [`render-everywhere.md`](./render-everywhere.md), [`end-to-end.md`](./end-to-end.md) |
| [`design/2026-05-bunny-mesh-asset-contract.md`](./design/2026-05-bunny-mesh-asset-contract.md) | Completed bunny asset contract design. | fixture manifests under `fixtures/render-everywhere/assets/stanford-bunny/` |
| [`design/2026-05-bunny-transform-playback-law.md`](./design/2026-05-bunny-transform-playback-law.md) | Completed bunny transform/playback law. | [`render-everywhere.md`](./render-everywhere.md), fixture descriptor |
| [`design/2026-05-bunny-bounds-normalization-law.md`](./design/2026-05-bunny-bounds-normalization-law.md) | Completed bunny bounds law. | fixture manifest and parser tests |
| [`design/2026-05-bunny-camera-law.md`](./design/2026-05-bunny-camera-law.md) | Completed bunny camera law. | fixture descriptor |
| [`design/2026-05-bunny-projection-law.md`](./design/2026-05-bunny-projection-law.md) | Completed bunny projection law. | fixture descriptor |
| [`design/2026-05-bunny-matrix-vector-law.md`](./design/2026-05-bunny-matrix-vector-law.md) | Completed bunny matrix/vector law. | parser/math-vector fixtures and tests |

## Do Not Archive Yet

| Document | Reason |
| --- | --- |
| [`BACKLOG.md`](../BACKLOG.md) | Still carries active P0 and follow-up work. It needs pruning, not archival. |
| [`design/2026-05-glyph-tooling-spike.md`](./design/2026-05-glyph-tooling-spike.md) | Proposed future tooling work, not completed. |
| [`design/2026-05-wesley-common-type-generation.md`](./design/2026-05-wesley-common-type-generation.md) | Active architecture correction. |
| [`design/2026-05-typescript-rust-wasm-boundary.md`](./design/2026-05-typescript-rust-wasm-boundary.md) | Active architecture policy. |
| [`design/2026-05-strict-positioned-glyph-run-plan.md`](./design/2026-05-strict-positioned-glyph-run-plan.md) | Active milestone design. |
| [`BEARING.md`](../BEARING.md) | Active operating map. |

## Archive Preconditions

Before moving any candidate:

1. Add `docs/archive/2026-05/README.md` that explains the archive policy.
2. Rewrite active docs to point at current signposts instead of archived slice plans.
3. Preserve relative links or update them in the moved documents.
4. Run `pnpm test:docs` and `git diff --check`.
5. Move documents in a dedicated commit so archive churn is easy to review.
