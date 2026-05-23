# Browser Render Harness Design

**Status**: Draft
**Date**: 2026-05-23
**Parent Design**: [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md)

## Purpose

The browser harness proves that a canonical Geordi IR artifact can be loaded by a browser page and
rendered through the current `@flyingrobots/geordi-runtime-webgl` package.

The harness is not a marketing landing page. It is a contract test shell that happens to be visible
in a browser.

## Package Shape

Preferred location:

```text
examples/browser-render-everywhere/
  package.json
  index.html
  src/
    main.ts
    BrowserRenderHarnessError.ts
    fixtureLoader.ts
    pixelProbe.ts
  test/
    browser-render.spec.ts
```

The example should import public workspace packages, not internal source files:

```text
@flyingrobots/geordi-core
@flyingrobots/geordi-runtime-webgl
```

## Runtime Flow

```text
fetch fixture manifest
fetch scene.geordi.json
parse with core JSON port
validate as geordi-ir/1
render with renderGeordiToCanvas(ir)
append returned canvas to mount element
display fixture id, hash, profiles, and renderer name
```

The shell DOM may display metadata, but it must not participate in scene layout. The rendered scene
is only the canvas.

## Harness API

The browser harness should expose a small testable surface:

```ts
interface BrowserRenderHarness {
  readonly fixtureId: string;
  readonly artifactHash: string;
  readonly canvas: HTMLCanvasElement;
}
```

Proposed entrypoint:

```ts
async function renderFixtureToBrowser(
  fixtureUrl: string,
  mount: HTMLElement,
): Promise<BrowserRenderHarness>;
```

The entrypoint should:

- load the manifest;
- load the scene artifact;
- validate both before rendering;
- mount exactly one canvas;
- return enough metadata for Playwright assertions.

## Error Types

All harness failures use custom error classes:

```text
BrowserHarnessFixtureLoadError
BrowserHarnessInvalidManifestError
BrowserHarnessInvalidIrError
BrowserHarnessMountError
BrowserHarnessPixelProbeError
```

No function in the harness should throw a raw `Error`.

## JSON Boundary

The browser harness must use the core JSON port:

```ts
import { parseJsonValue } from '@flyingrobots/geordi-core';
```

Native `JSON.parse` is allowed only inside the core JSON port. The harness should not parse JSON
with ad hoc logic.

## Pixel Probes

Pixel probes should read from the rendered canvas after the runtime has drawn.

Rules:

- Probe coordinates are integer canvas pixels.
- Expected values are exact RGBA bytes.
- Probe coordinates should be comfortably inside filled rectangles.
- Probe failure messages should include fixture id and probe id.

The first test should not use screenshot diffs. Screenshot output can be added later for human
review, but exact probes are a better compliance gate for solid rectangles.

## Playwright Test Plan

Initial tests:

1. Page loads without console errors.
2. Exactly one canvas is mounted.
3. Canvas dimensions equal fixture dimensions.
4. Canvas has at least one nonblank pixel.
5. Every fixture pixel probe matches.
6. Unsupported-feature fixture fails before drawing and reports a custom error.

The test should fail if the canvas is missing, zero-sized, fully blank, or rendered through a
fallback path.

## Visual Page

The page should be useful without being decorative.

Suggested layout:

```text
header: fixture id, artifact hash, runtime name
main: canvas
side panel: profiles and probe status
```

Do not add a hero section, marketing copy, decorative gradients, or layout cards that distract from
the canvas. This is an engineering harness.

## Scripts

The package should expose:

```json
{
  "dev": "vite --host 127.0.0.1",
  "build": "vite build",
  "test": "vitest run",
  "test:browser": "playwright test",
  "lint": "eslint . --max-warnings 0",
  "typecheck": "tsc --noEmit"
}
```

Root scripts can be added after the package exists:

```json
{
  "demo:render-everywhere:browser": "pnpm --filter @flyingrobots/geordi-browser-render-everywhere dev",
  "test:browser": "pnpm --filter @flyingrobots/geordi-browser-render-everywhere test:browser"
}
```

## Acceptance Criteria

- Browser example imports only public package entrypoints.
- Browser page renders the shared fixture artifact.
- Playwright asserts canvas dimensions and exact pixel probes.
- Unsupported fixtures fail loudly with custom errors.
- No production JSON parsing bypasses the core JSON port.
- No DOM/CSS layout is used to render the scene itself.

## Future GPVue Integration

When GPVue exists, the browser harness should add a compile mode:

```text
source.gpvue
-> compile
-> scene.geordi.json
-> render
-> probe
```

The render mode should remain artifact-first. GPVue is an artifact producer, not a browser runtime
dependency.
