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

- `fixture.json`: shared manifest with the expected hash, runtime profile, canvas size, and pixel
  probes.
- `scene.geordi.json`: canonical `geordi-ir/1` artifact consumed by every runtime.
- `scene.geordi.json.receipt`: hash and profile receipt for the scene artifact.

## Visual Shape

The fixture draws a 640 by 360 interface-like panel:

- dark background rectangle;
- light panel rectangle;
- teal accent bar;
- header and content skeleton rectangles;
- blue button rectangle;
- green status indicator rectangle.
