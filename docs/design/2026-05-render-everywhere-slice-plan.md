# Render-Everywhere Slice Plan

**Status**: Active
**Date**: 2026-05-23
**Parent Design**: [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md)

This is the execution checklist for the render-everywhere milestone. Update this checklist as
slices land. A slice is not done until its implementation, focused verification, documentation, and
commit are complete.

The milestone target is:

```text
GPVue source
-> one canonical scene.geordi.json artifact
-> browser canvas render
-> native Rust render
-> same artifact hash
-> same feature profile
-> same deterministic pixel probes
```

The first deterministic fixture is rectangle-only. Raw runtime text is excluded from the
pixel-identical browser/native claim until strict text exists.

## Checklist

- [x] **Slice 1: Render-everywhere design pack**
  - Lock the render-everywhere target into `BEARING.md`.
  - Add design docs for the shared demo contract, browser harness, native Rust harness, and GPVue
    fixture pipeline.
  - Add this slice checklist and wire repo instructions to it.
  - Done: `cbef665`; checklist closed in `380b909`.
  - Verification: `pnpm test:docs`, `git diff --cached --check`.

- [x] **Slice 2: Shared fixture root**
  - Add `fixtures/render-everywhere/hello-panel`.
  - Add `fixture.json`, `scene.geordi.json`, `scene.geordi.json.receipt`, and `README.md`.
  - Keep the scene rectangle-only and declare only the features actually used.
  - Done: `63935e2`.
  - Verification: fixture JSON parses through the core JSON port.

- [x] **Slice 3: Fixture manifest validator**
  - Add a typed TypeScript validator for `geordi-render-fixture/1`.
  - Validate fixture version, fixture id, paths, artifact hash, canvas dimensions, feature profile,
    and pixel probes.
  - Use custom error classes for every failure path.
  - Done: `7723683`.
  - Verification: unit tests for valid and invalid manifests.

- [x] **Slice 4: Pixel probe contract**
  - Add shared TypeScript probe records and probe assertion helpers.
  - Compare exact RGBA byte values at integer canvas coordinates.
  - Report fixture id, probe id, coordinate, expected RGBA, and actual RGBA on mismatch.
  - Done: `18d67de`.
  - Verification: helper tests for pass and fail paths.

- [x] **Slice 5: Browser harness scaffold**
  - Add `examples/browser-render-everywhere` with Vite, strict TypeScript, and lint/typecheck/test
    scripts.
  - Import only public workspace package entrypoints.
  - Keep the DOM shell separate from scene rendering.
  - Done: `3208234`.
  - Verification: package build, typecheck, and lint.

- [x] **Slice 6: Browser render smoke**
  - Browser harness fetches the shared fixture manifest and `scene.geordi.json`.
  - Parse JSON through the core JSON port.
  - Validate `geordi-ir/1`.
  - Call `renderGeordiToCanvas()` and mount exactly one canvas.
  - Done: `7fd5579`.
  - Verification: browser harness renders the shared fixture manually and through a test path.

- [x] **Slice 7: Browser Playwright gate**
  - Add Playwright test coverage for the browser harness.
  - Assert page load, canvas count, dimensions, nonblank output, and exact pixel probes.
  - Add a root or package script for the browser gate.
  - Done: `2125487`.
  - Verification: `pnpm --filter <browser-harness-package> test:browser`.

- [x] **Slice 8: Browser failure fixture**
  - Add an unsupported-feature fixture.
  - Prove browser harness rejects unsupported requirements before drawing.
  - Assert the thrown failure is a custom runtime or harness error.
  - Done: `c50e4c1`.
  - Verification: Playwright or Vitest failure-path test.

- [x] **Slice 9: Cargo workspace scaffold**
  - Add root `Cargo.toml` workspace support.
  - Add Rust formatting, test, and lint guidance without disturbing pnpm gates.
  - Do not claim native rendering yet.
  - Done: `08d0ae4`.
  - Verification: `cargo metadata`, `cargo fmt --check` once a crate exists.

- [x] **Slice 10: Rust IR crate**
  - Add `crates/geordi-ir`.
  - Define typed Rust structs for the rectangle-only `geordi-ir/1` subset.
  - Keep `serde_json::Value` contained at the JSON boundary.
  - Done: `5cb3aa3`.
  - Verification: unit test loads the shared fixture into typed structs.

- [x] **Slice 11: Rust IR validation**
  - Validate IR version, numeric profile, feature requirements, finite numbers, scene dimensions,
    node kinds, and Rect props.
  - Reject unsupported features before drawing.
  - Use custom Rust error types.
  - Done: `b896d3c`.
  - Verification: valid fixture plus invalid version/profile/feature/number/prop tests.

- [x] **Slice 12: Rust runtime profile**
  - Add native runtime profile declarations.
  - Support only `geordi/core/1`, `layout.resolved`, `shape.rect`, and `paint.solid` for MVP.
  - Run profile checks before renderer preparation.
  - Done: `d0a58e2`.
  - Verification: profile subset and unsupported-feature tests.

- [x] **Slice 13: Native Rust app shell**
  - Add `examples/native-render-everywhere`.
  - Accept a fixture path argument.
  - Load and validate the fixture manifest and IR.
  - Open a native window and show fixture id/hash in title or logs.
  - Done: current slice.
  - Verification: app starts and validates fixture without rendering claims beyond shell load.

- [ ] **Slice 14: Rust rectangle renderer**
  - Render solid Rect nodes from the shared IR.
  - Use explicit draw order.
  - Fail loudly on unsupported node kinds or properties.
  - Verification: visible native demo plus renderer tests where practical.

- [ ] **Slice 15: Rust offscreen smoke mode**
  - Add `--smoke` mode for CI-safe native rendering.
  - Render to an offscreen buffer.
  - Run the same pixel probes from the shared fixture manifest.
  - Verification: `cargo run -p <native-demo> -- --smoke <fixture>`.

- [ ] **Slice 16: Shared hash display**
  - Browser UI displays fixture id, artifact hash, IR version, numeric profile, feature
    requirements, and renderer name.
  - Rust app logs the same fields and includes a short hash in the window title.
  - Verification: tests assert reported hash matches manifest.

- [ ] **Slice 17: Render-everywhere README**
  - Document the demo claim, non-claims, commands, fixture path, and expected output.
  - State that text is excluded from the first deterministic proof.
  - Link browser and native harness docs.
  - Verification: `pnpm test:docs`.

- [ ] **Slice 18: GPVue fixture hook**
  - Add draft `source.gpvue` support in fixture metadata.
  - Mark GPVue source as draft or not-yet-compiled.
  - Any compile attempt before compiler support must fail with a custom error.
  - Verification: manifest and failure-path tests.

- [ ] **Slice 19: GPVue compiler MVP**
  - Add the first constrained GPVue compiler path for static rectangle-only fixtures.
  - Emit canonical `scene.geordi.json`, receipt, and source map.
  - Reject unsupported CSS, runtime layout, text, and dynamic constructs.
  - Verification: stable output hash and source map tests.

- [ ] **Slice 20: End-to-end GPVue render everywhere**
  - Compile the GPVue fixture once.
  - Render the emitted artifact in browser and native Rust.
  - Verify both report the same artifact hash and pass the same pixel probes.
  - Verification: browser gate, Rust smoke gate, and render-everywhere README command path.

## Update Policy

When a slice lands:

- change that slice from `- [ ]` to `- [x]`;
- add commit or PR references in the slice notes if useful;
- keep later slices unchecked until they are actually implemented;
- do not mark a design-only prerequisite as implemented for code-bearing slices;
- keep `BEARING.md` aligned if the plan changes materially.
