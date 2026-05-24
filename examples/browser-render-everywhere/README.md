# Browser Render-Everywhere Harness

This Vite example is the browser side of the Geordi render-everywhere proof.

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

The harness parses and validates the fixture through the shared TypeScript fixture package, parses
the scene through the core JSON port, then renders the artifact into a browser canvas.

The same browser harness also loads the Stanford bunny mesh asset from:

```text
fixtures/render-everywhere/assets/stanford-bunny
```

The bunny path validates the checked-in mesh manifest, parses the checked-in PLY bytes, computes
fixed-rate playback frames, and draws the mesh as a rotating Canvas 2D wireframe.

## Commands

Run the interactive browser harness:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere dev
```

Run unit tests:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere test
```

Run the Playwright browser gate:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere test:browser
```

The Playwright gate compiles `source.gpvue` and routes the page's `fixture.json` and
`scene.geordi.json` requests to the emitted manifest and scene artifact. When
`GEORDI_RENDER_EVERYWHERE_COMPILED_MANIFEST` and `GEORDI_RENDER_EVERYWHERE_COMPILED_SCENE` are set,
the gate uses those files instead; this is how the root render-everywhere smoke shares one temporary
fixture directory with the native Rust harness.

Run typecheck, lint, and build:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere typecheck
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere lint
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere build
```

The browser unit and Playwright gates also exercise sampled bunny frames. The interactive page uses
host time for smooth presentation; the tests use fixed frame indices so assertions remain
deterministic.

## Expected Page

The page should show:

- `Geordi Render Everywhere`
- a `Rectangles` / `Bunny` scene switcher
- the `Bunny` scene selected by default
- the Stanford bunny drawn as a rotating wireframe mesh in the visible canvas
- a collapsed `Bunny metadata` disclosure containing the wireframe renderer name, frame report,
  transform profile, mesh counts, and Stanford bunny asset hash
- a collapsed `Rectangle metadata` disclosure after switching to `Rectangles`
- the rectangle-only panel fixture after switching to `Rectangles`
- rectangle metadata including `browser-canvas`, `render-everywhere:hello-panel`, the fixture
  artifact hash, `geordi-ir/1`, `geordi-finite-binary64/1`, and
  `geordi/core/1, layout.resolved, shape.rect, paint.solid`

## Boundaries

This harness does not define its own scene. It consumes the same checked-in artifact as the native
Rust harness.

The GPVue source is a compiler input, not a browser runtime input. The interactive browser harness
renders the checked-in `scene.geordi.json` artifact directly. The root
`pnpm test:render-everywhere:gpvue` smoke command compiles GPVue into a temporary fixture directory,
then routes this browser gate to the emitted manifest and scene artifact.

The current browser implementation renders through Canvas 2D. The package remains named
`@flyingrobots/geordi-runtime-webgl` because the runtime package will grow into the WebGL path, but
this demo should not claim shader parity yet.

Text is intentionally excluded from this first deterministic browser/native proof.

The bunny mesh path does not extend the pixel-identical rectangle proof. It proves shared asset
identity, parsed mesh metadata, deterministic sampled-frame metadata, and coarse nonblank drawing in
the browser canvas.
