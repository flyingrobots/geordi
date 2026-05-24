# Native Render-Everywhere Harness

This Rust binary is the native side of the Geordi render-everywhere proof.

It loads the shared fixture manifest from:

```text
fixtures/render-everywhere/hello-panel/fixture.json
```

It loads the shared Geordi IR artifact from:

```text
fixtures/render-everywhere/hello-panel/scene.geordi.json
```

The same fixture also contains constrained GPVue source at:

```text
fixtures/render-everywhere/hello-panel/source.gpvue
```

The harness deserializes JSON at the Rust boundary, validates the supported rectangle-only IR
profile, renders to a native image buffer, and can either open a window or run offscreen pixel
probes.

## Commands

Run the smoke gate without opening a window:

```bash
cargo run -p native-render-everywhere -- --smoke fixtures/render-everywhere/hello-panel
```

Validate load and profile data without running pixel probes:

```bash
cargo run -p native-render-everywhere -- --check fixtures/render-everywhere/hello-panel
```

Open the native window:

```bash
cargo run -p native-render-everywhere -- fixtures/render-everywhere/hello-panel
```

Run tests and lints:

```bash
cargo test -p native-render-everywhere
cargo clippy -p native-render-everywhere --all-targets -- -D warnings
```

## Expected Smoke Output

```text
Geordi native fixture loaded
rendererName=rust-software-rectangles
fixtureId=render-everywhere:hello-panel
fixtureVersion=geordi-render-fixture/1
artifactHash=sha256:30623d6141ba69c382c14c09eca9adedd40cb02644ff4ee9621de101da6b0082
irVersion=geordi-ir/1
numericProfile=geordi-finite-binary64/1
featureRequirements=geordi/core/1, layout.resolved, shape.rect, paint.solid
canvas=640x360
scene=render-everywhere:hello-panel
shortHash=30623d6141ba
smoke=passed
```

## Boundaries

This harness does not call the browser renderer or translate a browser snapshot. It loads the same
IR artifact independently, validates it independently, and renders it independently.

The GPVue source is a compiler input, not a native runtime input. The native harness must not parse
or compile `source.gpvue`; it remains an artifact consumer.

The native renderer currently supports the rectangle-only MVP profile:

```text
geordi/core/1
layout.resolved
shape.rect
paint.solid
```

Unsupported feature requirements must fail before drawing. Text is intentionally excluded from this
first deterministic browser/native proof.
