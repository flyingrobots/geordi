# Hello Panel Render Fixture

**Fixture id**: `render-everywhere:hello-panel`
**Fixture version**: `geordi-render-fixture/1`

This fixture is the first shared render-everywhere artifact. Browser and native runtimes must load
the same `scene.geordi.json` bytes instead of maintaining per-platform scene definitions.

## Scope

The scene is intentionally rectangle-only:

- `geordi/core/1`
- `layout.resolved`
- `shape.rect`
- `paint.solid`

Text, image, gradient, transform, opacity, rounded-corner, and animation behavior are outside this
fixture. Those features need their own explicit profiles before they can become part of a
pixel-identical browser/native claim.

## Files

- `fixture.json`: shared manifest with the expected hash, runtime profile, canvas size, pixel
  probes, and compiler-backed GPVue source metadata.
- `scene.geordi.json`: canonical `geordi-ir/1` artifact consumed by every runtime.
- `scene.geordi.json.receipt`: hash and profile receipt for the scene artifact.
- `source.gpvue`: constrained GPVue authoring fixture that compiles to `scene.geordi.json`.

## GPVue Source Status

`source.gpvue` records the authoring shape for this scene. The checked-in `scene.geordi.json`
remains the artifact consumed by the browser and native demos, and
`@flyingrobots/geordi-gpvue` must be able to reproduce that artifact from the source.

## Visual Shape

The fixture draws a 640 by 360 interface-like panel:

- dark background rectangle;
- light panel rectangle;
- teal accent bar;
- header and content skeleton rectangles;
- blue button rectangle;
- green status indicator rectangle.
