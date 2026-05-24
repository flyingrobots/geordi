# Native Rust Render Harness Design

**Status**: Draft
**Date**: 2026-05-23
**Parent Design**: [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md)

## Purpose

The native Rust harness proves that Geordi IR is not a TypeScript-only or browser-only artifact. It
loads the same `scene.geordi.json` used by the browser harness and renders it in a native Rust
application.

The first Rust harness should be small, strict, and honest about its supported feature subset.

## Workspace Shape

Preferred root layout:

```text
Cargo.toml
crates/
  geordi-ir/
    Cargo.toml
    src/
      lib.rs
      error.rs
      model.rs
      validate.rs
  geordi-runtime-wgpu/
    Cargo.toml
    src/
      lib.rs
      error.rs
      profile.rs
      renderer.rs
examples/
  native-render-everywhere/
    Cargo.toml
    src/
      main.rs
```

If the first renderer uses CPU rasterization into a pixel buffer, keep the crate name conservative
until `wgpu` is actually responsible for drawing. For example:

```text
geordi-runtime-native
```

If the first renderer uses `wgpu` from the beginning, use:

```text
geordi-runtime-wgpu
```

The implementation slice should decide this explicitly before code lands.

## Rust IR Boundary

The Rust IR crate owns JSON ingestion for Rust consumers.

Flow:

```text
bytes
-> serde_json boundary
-> typed GeordiIr structs
-> validation
-> renderer input
```

Rules:

- `serde_json::Value` must not escape the boundary layer.
- Renderer code consumes typed structs, not maps or dynamic values.
- Validation happens before renderer preparation.
- All validation failures use custom error enums or structs.

## MVP Supported Feature Profile

The native MVP should support only:

```text
geordi/core/1
layout.resolved
shape.rect
paint.solid
```

This matches the first shared fixture and avoids false claims about text, opacity, rounded corners,
images, or transforms.

Unsupported requirements must fail before drawing.

## Typed Model Scope

The first Rust model only needs fields used by the shared fixture and profile checks:

```text
GeordiIr
GeordiIrScene
GeordiIrNode
RectProps
RuntimeProfile
FixtureManifest
PixelProbe
```

Future fields can be added as supported feature profiles grow.

## Validation Rules

The Rust validator should check:

- `irVersion == "geordi-ir/1"`;
- `numericProfile == "geordi-finite-binary64/1"`;
- `requires` is nonempty, contains `geordi/core/1`, has no duplicates, and is supported;
- `scene.width` and `scene.height` are positive finite numbers;
- node ids are nonempty strings;
- every rendered node kind is supported;
- Rect nodes have finite `x`, `y`, `width`, `height`;
- Rect dimensions are nonnegative or positive according to the final Rect law;
- Rect `fill` is a supported solid color string.

Validation should reject unknown or unsupported feature requirements before draw preparation.

## Error Types

Suggested Rust errors:

```text
GeordiIrLoadError
GeordiIrJsonError
GeordiIrValidationError
GeordiRuntimeUnsupportedProfileError
GeordiRuntimeUnsupportedNodeKindError
GeordiRuntimeInvalidNodePropsError
GeordiRenderSurfaceError
GeordiPixelProbeError
```

The exact Rust implementation may use `thiserror`, but the public error variants must remain
specific. Do not collapse everything into a generic string error.

## Native App Flow

The native example binary should accept a fixture path:

```bash
cargo run -p geordi-native-render-everywhere -- fixtures/render-everywhere/hello-panel/fixture.json
```

Flow:

```text
read fixture manifest
read scene.geordi.json
validate manifest
validate IR
create native window
render solid rectangles
display fixture id and hash in title/logs
```

The app should print:

```text
fixture id
artifact hash
IR version
numeric profile
feature requirements
native renderer name
```

## Offscreen Smoke Mode

CI should not require an interactive desktop window.

Add a mode such as:

```bash
cargo run -p geordi-native-render-everywhere -- --smoke fixtures/render-everywhere/hello-panel/fixture.json
```

Smoke mode should:

- load the same fixture;
- render to an offscreen buffer or deterministic software buffer;
- run the same pixel probes declared by the fixture;
- exit nonzero on any mismatch.

## Renderer Strategy

There are two viable MVP routes.

### Option A: CPU Raster Into Pixel Buffer

Pros:

- Fastest to implement.
- Deterministic pixel probes are straightforward.
- Good for CI and native proof.

Cons:

- Does not prove GPU drawing.
- Must be described as native render harness, not final GPU runtime.

### Option B: `winit` plus `wgpu`

Pros:

- Aligns with the README's planned Rust `wgpu` runtime.
- Stronger platform story.
- Better foundation for future native rendering.

Cons:

- More setup and surface handling.
- Pixel readback and headless CI are more complex.

Recommendation: prefer `wgpu` if the demo claim needs to say GPU-native. Prefer CPU raster only if
the immediate goal is cross-language artifact portability.

## Test Plan

Rust tests should cover:

1. Valid shared fixture loads.
2. Invalid JSON fails at the boundary.
3. Unsupported `irVersion` fails.
4. Unsupported `numericProfile` fails.
5. Unsupported feature requirement fails.
6. Missing Rect prop fails.
7. Pixel probe mismatch reports expected and actual values.

Once the native renderer exists, CI should run:

```bash
cargo fmt --check
cargo test
cargo clippy --workspace --all-targets -- -D warnings
cargo run -p geordi-native-render-everywhere -- --smoke fixtures/render-everywhere/hello-panel/fixture.json
```

## Acceptance Criteria

- Rust workspace exists and does not disturb pnpm gates.
- Rust IR parsing is typed after the JSON boundary.
- Native runtime declares and enforces a supported feature profile.
- Native app renders the same shared fixture as the browser harness.
- Offscreen smoke mode runs pixel probes from the shared manifest.
- All errors are specific custom error types.

## Future Work

- Add Text after strict text/font profile exists.
- Add opacity, stroke, and rounded corners as separate feature-profile slices.
- Generate Rust IR structs from a formal schema once the schema is stable.
- Add WebGPU or Metal native demos after the Rust harness proves the artifact boundary.
