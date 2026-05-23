# Render-Everywhere Demo Design

**Status**: Draft
**Date**: 2026-05-23
**Slices Covered**: 1 through 20

## Problem

Geordi needs a concrete proof that its IR is a real platform boundary. A browser-only demo proves
that the current TypeScript runtime can draw something. It does not prove that Geordi scenes are
portable across runtimes.

The stronger demo is:

```text
one GPVue-authored scene
-> one canonical Geordi IR artifact
-> browser canvas runtime
-> native Rust runtime
```

Both runtimes must consume the same `scene.geordi.json` bytes and report the same artifact hash.
That makes the portability claim inspectable instead of rhetorical.

## Current Repo Reality

- `@flyingrobots/geordi-runtime-webgl` can render `geordi-ir/1` to an `HTMLCanvasElement`.
- The browser runtime currently uses Canvas 2D internally, despite the `runtime-webgl` package name.
- There is no browser demo scaffold yet.
- There is no Rust workspace, Rust IR model, or native runtime scaffold yet.
- GPVue is planned in the README but does not have a compiler package yet.

The design therefore starts from a hand-authored canonical IR fixture and adds GPVue as a later
artifact producer. The first demo should not pretend that GPVue compilation exists before it does.

## Demo Claim

The first complete render-everywhere demo should be able to say:

```text
This canonical Geordi IR artifact renders in a browser and in a native Rust app.
The artifact hash, numeric profile, feature requirements, and pixel probes match.
```

The later GPVue demo should be able to say:

```text
This GPVue source compiles once to canonical Geordi IR.
The emitted artifact renders in a browser and in a native Rust app.
```

## Non-Goals

- Do not implement a full GPVue compiler in the first render-everywhere slice.
- Do not claim pixel-identical text output while text remains `text.raw-runtime-shaping`.
- Do not add CSS layout, DOM rendering, or browser layout as part of scene rendering.
- Do not add image, gradient, blur, shader, transform, animation, or hit-test requirements to the
  first shared fixture.
- Do not make the Rust runtime support feature requirements it cannot actually render.
- Do not accept best-effort fallback for unsupported feature requirements.

## Shared Artifact Contract

The central artifact is:

```text
fixtures/render-everywhere/hello-panel/scene.geordi.json
```

Both browser and Rust demos load that file. They must not maintain separate scene definitions.

The fixture directory should eventually contain:

```text
fixtures/render-everywhere/hello-panel/
  fixture.json
  scene.geordi.json
  scene.geordi.json.receipt
  scene.geordi.map.json
  source.gpvue
  README.md
```

Initial contents:

- `fixture.json`: harness metadata, expected hash, runtime profile, and pixel probes.
- `scene.geordi.json`: canonical `geordi-ir/1` artifact.
- `scene.geordi.json.receipt`: hash/profile proof for the artifact.
- `README.md`: fixture purpose and supported claims.

Later contents:

- `source.gpvue`: GPVue source once the authoring fixture is introduced.
- `scene.geordi.map.json`: source map once GPVue compilation emits source locations.

## First Fixture Scope

The first fixture should be rectangle-only.

Required features:

```text
geordi/core/1
layout.resolved
shape.rect
paint.solid
```

Reasoning:

- Rectangles are enough to prove cross-runtime artifact loading and drawing.
- Solid fills can be checked with exact pixel probes.
- Text would introduce platform font and shaping differences before strict text exists.
- Rounded corners, opacity, and strokes are useful follow-ups, but not needed for the first proof.

The scene should look like UI without relying on text:

```text
640x360 canvas
background rectangle
panel rectangle
top accent bar
content skeleton bars
button rectangle
small status indicator rectangle
```

## Fixture Manifest

`fixture.json` should be canonical JSON and validated by both harnesses.

Proposed shape:

```json
{
  "fixtureVersion": "geordi-render-fixture/1",
  "id": "render-everywhere:hello-panel",
  "scenePath": "scene.geordi.json",
  "receiptPath": "scene.geordi.json.receipt",
  "artifactHash": "sha256:<hex>",
  "runtimeProfile": {
    "irVersion": "geordi-ir/1",
    "numericProfile": "geordi-finite-binary64/1",
    "requires": [
      "geordi/core/1",
      "layout.resolved",
      "shape.rect",
      "paint.solid"
    ]
  },
  "canvas": {
    "width": 640,
    "height": 360
  },
  "pixelProbes": [
    {
      "id": "background",
      "x": 8,
      "y": 8,
      "rgba": [16, 24, 32, 255]
    }
  ]
}
```

The exact schema can change during implementation, but these concepts should remain.

## Pixel Probe Law

Pixel probes are the first deterministic visual assertion. They should be exact for the
rectangle-only fixture.

Rules:

- Probes use integer canvas coordinates.
- Expected values are RGBA bytes.
- Probes must avoid rectangle edges unless the test intentionally checks edge behavior.
- Browser and Rust probes should be run from the same fixture manifest.
- Failures must report fixture id, probe id, coordinate, expected RGBA, and actual RGBA.

Screenshot comparisons are not the first gate. They can be added later as review aids.

## Runtime Compliance Boundaries

Browser runtime:

- Loads canonical IR through the core JSON port.
- Validates `isGeordiIr()` or equivalent before rendering.
- Calls `renderGeordiToCanvas(ir)`.
- Mounts the returned canvas into the page.
- Reads pixels through Canvas 2D test APIs in Playwright.

Rust runtime:

- Loads bytes from the same `scene.geordi.json`.
- Deserializes into typed Rust structs at the JSON boundary.
- Validates the IR version, numeric profile, required feature set, finite numbers, and Rect props.
- Renders only the supported feature subset.
- Runs pixel probes either against an offscreen buffer or a native surface readback.

## Error Policy

Every failure path must use custom errors.

TypeScript harness examples:

```text
RenderFixtureLoadError
RenderFixtureInvalidManifestError
RenderFixtureInvalidIrError
RenderFixturePixelProbeError
BrowserHarnessMountError
```

Rust harness examples:

```text
GeordiIrLoadError
GeordiIrValidationError
GeordiRuntimeUnsupportedFeatureError
GeordiRenderSurfaceError
GeordiPixelProbeError
```

No raw `Error`, no unclassified string throw, and no silent fallback.

## Slice Plan

### Slice 1: Render-Everywhere Design Pack

Update `BEARING.md` and design docs with the render-everywhere target, fixture contract, browser
harness design, Rust native harness design, and GPVue hook point.

Acceptance criteria:

- `BEARING.md` names render-everywhere as the next credibility milestone.
- `docs/design/README.md` links the new design docs.
- The next 10 to 20 slices are enumerated.
- `pnpm test:docs` passes.

### Slice 2: Shared Fixture Root

Add `fixtures/render-everywhere/hello-panel`.

Acceptance criteria:

- Directory exists with `fixture.json`, `scene.geordi.json`, receipt placeholder or real receipt,
  and `README.md`.
- The scene is rectangle-only.
- The fixture declares the expected runtime profile.
- The fixture uses canonical JSON ordering through the existing JSON port.

### Slice 3: Fixture Manifest Validator

Add a TypeScript validator for `geordi-render-fixture/1`.

Acceptance criteria:

- Validator lives behind a package or script boundary, not ad hoc test parsing.
- Validator rejects malformed hashes, unsupported fixture versions, invalid probes, and non-finite
  coordinates.
- Errors are custom error classes.
- Tests cover valid and invalid manifests.

### Slice 4: Pixel Probe Contract

Add shared TypeScript probe helpers for browser tests.

Acceptance criteria:

- Probe helper reads exact RGBA bytes from canvas coordinates.
- Failure reports fixture id, probe id, coordinate, expected, and actual values.
- Tests cover pass and fail paths.

### Slice 5: Browser Harness Scaffold

Add a Vite browser example.

Acceptance criteria:

- Browser example imports workspace packages.
- `pnpm --filter` dev command starts the harness.
- Page shell has one mount target and no scene-shaping CSS.
- Build and lint pass.

### Slice 6: Browser Render Smoke

Load the shared fixture and render it in a real browser page.

Acceptance criteria:

- Harness fetches `scene.geordi.json`.
- Harness parses through the core JSON port.
- Harness validates `geordi-ir/1`.
- Harness calls `renderGeordiToCanvas()`.
- Canvas appears in the page with expected dimensions.

### Slice 7: Browser Playwright Gate

Add Playwright tests for the browser harness.

Acceptance criteria:

- Test starts or uses the Vite server.
- Test asserts canvas count, dimensions, nonblank output, and exact pixel probes.
- Test fails loudly on invalid fixture or unsupported features.
- Root or package script exposes the gate.

### Slice 8: Browser Failure Fixture

Add a fixture that requests an unsupported feature.

Acceptance criteria:

- Browser harness rejects the scene before drawing.
- Test asserts a custom runtime or harness error.
- No best-effort render path exists.

### Slice 9: Cargo Workspace Scaffold

Add Rust workspace support.

Acceptance criteria:

- Root `Cargo.toml` defines a workspace.
- Rust files do not interfere with pnpm package gates.
- Rust formatting and lint commands are documented.
- No native runtime claim is made yet.

### Slice 10: Rust IR Crate

Add a `geordi-ir` Rust crate.

Acceptance criteria:

- Crate defines typed structs for the rectangle-only subset of `geordi-ir/1`.
- JSON deserialization happens at the crate boundary.
- No `serde_json::Value` escapes into renderer code.
- Unit tests load the shared fixture.

### Slice 11: Rust IR Validation

Add Rust validation for the supported subset.

Acceptance criteria:

- Validator checks `irVersion`, `numericProfile`, `requires`, finite numbers, scene dimensions, and
  Rect props.
- Validator rejects unsupported features with custom errors.
- Tests cover valid fixture, missing profile, unsupported feature, non-finite number, and missing
  Rect props.

### Slice 12: Rust Runtime Profile

Add native runtime profile declarations.

Acceptance criteria:

- Runtime profile lists exactly the feature requirements the MVP renderer supports.
- Profile check runs before drawing.
- Profile tests mirror browser runtime subset behavior.

### Slice 13: Native Rust App Shell

Add a native demo binary that opens a window and loads the shared fixture.

Acceptance criteria:

- Binary accepts fixture path as an argument.
- Window title includes fixture id and artifact hash.
- App fails with custom errors when the fixture cannot load or validate.
- No rendering claim beyond window creation and fixture load.

### Slice 14: Rust Rectangle Renderer

Render solid Rect nodes in the native app.

Acceptance criteria:

- Renderer draws the shared fixture visibly.
- Draw order follows IR node order for the MVP.
- Unsupported node kinds fail loudly.
- Manual demo command is documented.

### Slice 15: Rust Offscreen Smoke Mode

Add CI-suitable rendering without an interactive desktop.

Acceptance criteria:

- Binary or test can render to an offscreen buffer.
- Pixel probes run against the same manifest used by the browser harness.
- CI can run the smoke without opening a native window.

### Slice 16: Shared Hash Display

Expose the same artifact hash in both demos.

Acceptance criteria:

- Browser UI displays fixture id, artifact hash, IR version, numeric profile, and renderer name.
- Rust app logs the same fields and includes a short hash in the window title.
- Tests assert the reported hash matches the manifest.

### Slice 17: Render-Everywhere README

Document the demo commands.

Acceptance criteria:

- README explains the claim, non-claims, commands, fixture path, and expected output.
- README states text is excluded from the first deterministic demo.
- README links browser and Rust harness docs.

### Slice 18: GPVue Fixture Hook

Add draft GPVue source fixture support without claiming compiler support.

Acceptance criteria:

- `source.gpvue` may exist as a design fixture.
- Harness metadata marks GPVue source as draft or not-yet-compiled.
- Any attempt to compile GPVue before the compiler exists fails with a custom error.

### Slice 19: GPVue Compiler MVP

Add the first GPVue compiler path that lowers the fixture to Geordi IR.

Acceptance criteria:

- Compiler emits the same canonical IR bytes as the checked-in fixture or intentionally updates the
  fixture and receipt.
- Compiler does not use browser CSS/layout state.
- Source map points from IR nodes back to GPVue source spans.

### Slice 20: End-to-End GPVue Render Everywhere

Compile GPVue once, then render the emitted artifact in browser and Rust.

Acceptance criteria:

- One command compiles the GPVue fixture.
- Browser harness renders the emitted artifact and passes probes.
- Rust harness renders the emitted artifact and passes probes.
- Both report the same artifact hash.

## Final Demo Gate

The first complete render-everywhere milestone should run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:docs
pnpm test:package-names
pnpm test:repo-sludge
pnpm test:placeholders
pnpm test:exports
cargo fmt --check
cargo test
cargo clippy --workspace --all-targets -- -D warnings
```

The Cargo gates only apply after the Rust workspace exists.

## Open Questions

- Should the first native Rust renderer use direct `wgpu`, or should it start with CPU rasterization
  into a GPU-presented pixel buffer?
- Should shared fixture manifests live under root `fixtures/` or inside an example package?
- Should artifact receipts be generated by compiler-core before GPVue exists, or checked in as
  static fixture metadata?
- Should browser pixel probes run in Chromium only at first, or across Chromium, Firefox, and
  WebKit?
- How much of the Rust IR model should be generated from the TypeScript/core schema once schemas
  exist?
