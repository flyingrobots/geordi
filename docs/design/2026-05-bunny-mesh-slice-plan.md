# Bunny Mesh Slice Plan

**Status**: Active
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-mesh-render-everywhere.md`](./2026-05-bunny-mesh-render-everywhere.md)

This is the execution checklist for the Stanford bunny mesh milestone. Update this checklist as
slices land. A slice is not done until implementation, focused verification, documentation, and a
commit are complete.

The milestone target is:

```text
Stanford bunny PLY bytes
-> canonical mesh asset manifest
-> typed mesh parsing in TypeScript and Rust
-> static browser and native render
-> deterministic fixed-frame rotation playback
-> live browser and native rotating demos
```

Pause after slice 15 for a drift check before static rendering starts.

## Checklist

- [x] **Slice 1: Bunny design pack**
  - Refresh `BEARING.md` around the bunny mesh milestone.
  - Add design documents for mesh asset identity, transform/playback law, and demo claim
    boundaries.
  - Done: `800005b`.
  - Verification: `pnpm test:docs`, `git diff --check`.

- [x] **Slice 2: Bunny slice checklist**
  - Add this executable 30-slice checklist.
  - Wire the active design map to the bunny milestone.
  - Link the checklist from `BEARING.md`.
  - Done: `6a51001`.
  - Verification: `pnpm test:docs`, `git diff --check`.

- [x] **Slice 3: Asset manifest schema**
  - Add typed TypeScript contracts for `geordi-mesh-asset/1`.
  - Validate version, ID, profile, path, hash, counts, bounds, source, and attribution.
  - Use custom error types for all assertion failures.
  - Done: `bcc65cd`.
  - Verification: `pnpm --filter @flyingrobots/geordi-render-fixture typecheck`, `lint`, `test`.

- [x] **Slice 4: Stanford bunny manifest file**
  - Add the bunny mesh asset manifest beside the committed PLY.
  - Record SHA-256, format, profile, vertex count, face count, bounds, source, and attribution.
  - Parse the manifest through the schema validator.
  - Done: `eea32a2`.
  - Verification: `pnpm --filter @flyingrobots/geordi-render-fixture test`, `pnpm test:docs`.

- [x] **Slice 5: Mesh feature profile**
  - Add known feature requirements for mesh assets, triangle meshes, camera projection, depth,
    solid material, and deterministic playback.
  - Keep these out of the baseline emitted rectangle profile.
  - Mirror the known features in Rust.
  - Done: `869a566`.
  - Verification: `pnpm --filter @flyingrobots/geordi-core typecheck`, `test`;
    `cargo test -p geordi-ir`.

- [x] **Slice 6: Mesh fixture manifest shape**
  - Extend render fixture contracts for a bunny fixture descriptor.
  - Include asset manifest path, camera, projection, material, and playback descriptors.
  - Keep this separate from the existing rectangle `scene.geordi.json` fixture contract.
  - Done: `61335fb`.
  - Verification: `pnpm --filter @flyingrobots/geordi-render-fixture typecheck`, `lint`, `test`.

- [x] **Slice 7: TypeScript asset hash validator**
  - Add a Node-side hash helper for mesh asset bytes.
  - Assert expected `sha256:` values with a custom hash mismatch error.
  - Keep filesystem reads outside pure validators.
  - Done: `6f4e7ca`.
  - Verification: `pnpm --filter @flyingrobots/geordi-render-fixture typecheck`, `lint`, `build`,
    `test`.

- [x] **Slice 8: Rust asset hash validator**
  - Add a Rust hash helper for mesh asset bytes.
  - Assert expected `sha256:` values with a custom hash mismatch error.
  - Keep path validation fixture-local.
  - Done: `13c1ee7`.
  - Verification: `cargo test -p geordi-mesh`, `cargo clippy -p geordi-mesh --all-targets -- -D
    warnings`.

- [x] **Slice 9: TypeScript PLY boundary**
  - Parse the supported ASCII PLY subset into typed mesh data.
  - Reject unsupported headers, non-finite numbers, bad vertices, and bad faces with custom errors.
  - Do not leak raw JSON or unchecked strings beyond the parser boundary.
  - Done: `7c3b55c`.
  - Verification: `pnpm --filter @flyingrobots/geordi-render-fixture typecheck`, `lint`, `test`.

- [x] **Slice 10: Rust PLY boundary**
  - Parse the same supported ASCII PLY subset into typed Rust mesh data.
  - Reject unsupported headers, non-finite numbers, bad vertices, and bad faces with custom errors.
  - Keep parser output independent from renderer state.
  - Done: `ebbfaa2`.
  - Verification: `cargo test -p geordi-mesh`, `cargo clippy -p geordi-mesh --all-targets -- -D
    warnings`.

- [x] **Slice 11: Mesh validation tests**
  - Assert vertex count, face count, bounds, index ranges, finite numbers, and stable asset hash in
    both languages.
  - Include negative tests for malformed headers and invalid face data.
  - Done: `be6fcce`.
  - Verification: render-fixture tests and `cargo test -p geordi-mesh`.

- [x] **Slice 12: Mesh bounds normalization law**
  - Specify bounds computation, center, extent, and normalization behavior.
  - Keep parser output unnormalized.
  - Add deterministic test vectors.
  - Done: `a47d32f`.
  - Verification: `pnpm test:docs`, JSON parse check.

- [x] **Slice 13: Camera descriptor law**
  - Define eye, target, up, handedness, and view-matrix construction.
  - Reject degenerate camera descriptors.
  - Add deterministic test vectors.
  - Done: `8146a9e`.
  - Verification: `pnpm test:docs`, JSON parse check.

- [x] **Slice 14: Projection descriptor law**
  - Define vertical field of view, aspect, near/far planes, and projection-matrix construction.
  - Reject invalid projection descriptors.
  - Add deterministic test vectors.
  - Done: `76a43f5`.
  - Verification: `pnpm test:docs`, JSON parse check.

- [x] **Slice 15: Matrix/vector operation-order law**
  - Define matrix storage, vector convention, multiply order, axis normalization, and sampled
    rotation composition.
  - Add deterministic test vectors.
  - Pause for drift check after this slice.
  - Done: `cd4f7d3`.
  - Verification: `pnpm test:docs`, JSON parse check.

- [x] **Slice 16: Static browser bunny**
  - Render one fixed bunny frame in the browser harness.
  - Report asset hash, mesh counts, camera profile, and frame metadata.
  - Done: slice commit `Slice 16: Render static bunny in browser`.
  - Verification: browser render-everywhere typecheck, lint, test.

- [x] **Slice 17: Static native bunny**
  - Render the same fixed bunny frame in the Rust harness.
  - Report asset hash, mesh counts, camera profile, and frame metadata.
  - Done: slice commit `Slice 17: Render static bunny natively`.
  - Verification: `cargo fmt --check`, `cargo test -p native-render-everywhere`,
    `cargo clippy -p native-render-everywhere --all-targets -- -D warnings`.

- [x] **Slice 18: Static smoke gates**
  - Verify nonblank output, mesh metadata, and coarse visual invariants for one sampled frame.
  - Keep pixel-identical 3D claims out of scope.
  - Done: slice commit `Slice 18: Add static bunny smoke gates`.
  - Verification: browser render-everywhere browser test; native render-everywhere tests and
    clippy.

- [x] **Slice 19: Rotation playback descriptor**
  - Add fixed-rate rotation descriptor validation.
  - Include frame index, sample rate, seconds, angle, authored axis, and normalized axis.
  - Done: slice commit `Slice 19: Add rotation playback frame contract`.
  - Verification: render-fixture typecheck, lint, and tests.

- [x] **Slice 20: Browser fixed-frame rotation**
  - Render deterministic browser frames for frame 0 and at least two nonzero frames.
  - Expose frame metadata to tests.
  - Done: slice commit `Slice 20: Use shared browser bunny playback frames`.
  - Verification: browser render-everywhere typecheck, lint, tests, and build.

- [x] **Slice 21: Native fixed-frame rotation**
  - Render deterministic native frames for frame 0 and at least two nonzero frames.
  - Expose frame metadata to smoke output.
  - Done: slice commit `Slice 21: Add native bunny fixed-frame CLI`.
  - Verification: native render-everywhere tests, clippy, and sampled frame smoke command.

- [x] **Slice 22: Browser live rotation**
  - Add host-time presentation that maps elapsed time to deterministic frame indices.
  - Keep tests fixed-frame.
  - Done: slice commit `Slice 22: Add browser bunny live rotation`.
  - Verification: browser render-everywhere typecheck, lint, tests, and build.

- [ ] **Slice 23: Native live rotation**
  - Add native live presentation that maps elapsed time to deterministic frame indices.
  - Keep smoke mode fixed-frame.

- [ ] **Slice 24: Cross-runtime frame report**
  - Make browser and native reports comparable.
  - Include frame index, seconds, angle, normalized axis, asset hash, and transform profile.

- [ ] **Slice 25: Sampled-frame smoke tests**
  - Verify at least two nonzero frames in browser and native smoke paths.
  - Assert frame metadata and coarse visual invariants.

- [ ] **Slice 26: Bunny fixture documentation**
  - Document asset manifest, fixture manifest, commands, expected output, and attribution.

- [ ] **Slice 27: Demo guide update**
  - Extend render-everywhere documentation with bunny commands and claim boundaries.

- [ ] **Slice 28: CI gate wiring**
  - Add focused package and Rust gates for mesh parsing and bunny fixture validation.
  - Avoid expensive interactive windows in CI.

- [ ] **Slice 29: Code Lawyer hardening**
  - Audit mesh parsing, path safety, transform determinism, and unsupported feature failures.
  - Fix any findings one commit at a time.

- [ ] **Slice 30: Bearing refresh**
  - Mark the bunny milestone achieved or document remaining blockers.
  - Choose the next target, likely strict text/font law.

## Update Policy

When a slice lands:

- change that slice from `- [ ]` to `- [x]`;
- add commit references;
- keep later slices unchecked until implemented;
- preserve one conceptual commit per slice;
- stop after slice 15 for a drift check before render implementation begins.
