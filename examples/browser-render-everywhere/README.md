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

Run typecheck, lint, and build:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere typecheck
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere lint
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere build
```

## Expected Page

The page should show:

- `Geordi Render Everywhere`
- `browser-canvas`
- `render-everywhere:hello-panel`
- the fixture artifact hash
- `geordi-ir/1`
- `geordi-finite-binary64/1`
- `geordi/core/1, layout.resolved, shape.rect, paint.solid`
- one canvas containing the rectangle-only panel fixture

## Boundaries

This harness does not define its own scene. It consumes the same checked-in artifact as the native
Rust harness.

The GPVue source is a compiler input, not a browser runtime input. The browser harness still renders
the checked-in `scene.geordi.json` artifact directly until the end-to-end GPVue slice wires the
compile step into the demo path.

The current browser implementation renders through Canvas 2D. The package remains named
`@flyingrobots/geordi-runtime-webgl` because the runtime package will grow into the WebGL path, but
this demo should not claim shader parity yet.

Text is intentionally excluded from this first deterministic browser/native proof.
