# Bijou GPU WebGL2 Presenter Reference

**Package**: `@flyingrobots/geordi-bijou-gpu` (`packages/bijou-gpu`)
**Modules**: `src/webgl2-presenter.ts`, `src/webgl2-gl.ts`, `src/presenter-atlas.ts`
**ABI**: `bijou-surface-gpu/1`
**Backend profile**: `geordi-webgl2/1`
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md), sections 4 to 6
**Evidence ledger**: [`bijou-gpu-webgl2-presenter-test-plan.md`](./bijou-gpu-webgl2-presenter-test-plan.md)

This page describes the WebGL2 presenter on `main`. It implements the shared
[`GpuSurfacePresenter`](./bijou-gpu-conformance-kit.md#presenter-contract) contract on a browser
canvas by executing the checked-in, naga-generated GLSL ES 3.00 stages of
[`bijou-surface`](./bijou-gpu-shaders.md). The design record is normative for every equation.

> **Not claimed.** Nothing mounts this presenter in an application yet; `@flyingrobots/bijou-web`
> is planned ([flyingrobots/bijou#792](https://github.com/flyingrobots/bijou/issues/792)). The
> Canvas 2D and WebGPU presenters are separate
> ([flyingrobots/geordi#174](https://github.com/flyingrobots/geordi/issues/174),
> [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175)). Pixels are
> checked in Chrome only. No frame-time budget is claimed.

## Creating one

Abridged from `packages/bijou-gpu/harness/webgl2.ts`, which a Vite page loads:

```ts
import fragment from '../shaders/bijou-surface.frag.glsl?raw';
import vertex from '../shaders/bijou-surface.vert.glsl?raw';
import {
  createStaticAtlasSource,
  createTestGlyphPack,
  createWebGL2SurfacePresenter,
} from '../src/index.js';

const pack = createTestGlyphPack();
const presenter = createWebGL2SurfacePresenter({
  canvas,
  shaders: { vertex, fragment },
  atlas: createStaticAtlasSource({
    bitmap: pack.atlasBitmap,
    slotMap: pack.slotMap,
    fontIdentity: pack.fontIdentity,
  }),
  defaultFg: '#E6EDF3',
  defaultBg: '#0D1117',
  canonicalReadback: true,
});
presenter.present(paint, paint, {});
```

The package build does not ship the `.glsl` files; the host passes the text of
`packages/bijou-gpu/shaders/bijou-surface.vert.glsl` and `bijou-surface.frag.glsl`, here through
Vite's `?raw` import. A live application passes a `GlyphAtlas` as `atlas` instead. The factory has
the shape of `GpuSurfacePresenterFactory<WebGL2SurfacePresenterOptions>` and returns
synchronously.

| Option | Meaning |
| --- | --- |
| `canvas` | An `HTMLCanvasElement`, or anything with the `WebGL2SurfaceCanvas` slice: `width`, `height`, `getContext('webgl2', attributes)`, `addEventListener`, `removeEventListener`, `getBoundingClientRect()`. |
| `shaders` | `{ vertex, fragment }`: the generated GLSL text, unmodified. |
| `atlas` | A `PresenterAtlasSource`. A `GlyphAtlas` is one as it is; `createStaticAtlasSource()` wraps a fixed bitmap and slot map. |
| `defaultFg`, `defaultBg` | Uppercase `#RRGGBB`. Default to `REFERENCE_DEFAULT_FG` and `REFERENCE_DEFAULT_BG`. |
| `canonicalReadback` | Read every frame back for its receipt. Default `false`. |
| `probePoints` | Probe pixels for read-back receipts. Default: the four corners and the centre. |
| `inputReceiptSha256(target)` | Receipt `inputReceiptSha256`. Default: SHA-256 of `target.buffer`. |
| `overlay` | Start with the diagnostic overlay on. Default `false`. |

### Refusals and faults

| Condition | Thrown |
| --- | --- |
| `getContext('webgl2')` returns `null`, or the context is lost at creation | `BackendUnavailableError` (`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE`), backend `webgl2`. Evidence `capability-refused`; never a pass. |
| A shader's SHA-256 differs from `WEBGL2_SURFACE_SHADER_PIN` | `RendererFaultError`, before any GL call |
| A stage fails to compile or link, a uniform block or sampler named in the pin is missing, the canonical framebuffer is incomplete | `RendererFaultError` |
| `gl.getError()` reports anything but `NO_ERROR` or `CONTEXT_LOST_WEBGL` after a frame | `RendererFaultError` |
| `drawingBufferWidth` or `drawingBufferHeight` differs from the canvas size | `DrawingBufferMismatchError` (`GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH`). Nothing is drawn. |
| The canvas is smaller than `width * cellPxW` by `height * cellPxH` | `BijouGpuValidationError` `GEORDI_E_BIJOU_INVALID_SURFACE` at `canvas` |
| A packer error: width-2 grapheme, missing slot, malformed surface | The packer's `BijouGpuValidationError`, unchanged |

A fault is never caught and turned into a fallback. Choosing another backend after a
`BackendUnavailableError` is the host's decision.

## Shader identity

`WEBGL2_SURFACE_SHADER_PIN` holds the `bijou-surface` entry of
`packages/bijou-gpu/shaders/bijou-shaders.manifest.json`: `assembledWgslSha256`,
`generatedGlslSha256`, each stage's file name and SHA-256, the `std140` uniform block name, its
64-byte size and member offsets, and the two `usampler2D` names. A unit test compares every value
with the checked-in manifest and files, so regenerating the shaders fails the tests until the pin
is updated.

`webgl2FramedGlslSha256(stages)` applies the manifest's framing rule: for each stage, the file
name, a line feed, the decimal byte length, a line feed, and the bytes.

## Context and textures

The context is requested with `alpha: false`, `antialias: false`, `depth: false`,
`stencil: false`, `premultipliedAlpha: false`, `preserveDrawingBuffer: true`, and
`drawingBufferColorSpace` is set to `'srgb'`. `DITHER`, `BLEND`, `DEPTH_TEST`, `STENCIL_TEST`,
`SCISSOR_TEST` and `CULL_FACE` are disabled before every draw.

| Texture | Format | Size | Unit |
| --- | --- | --- | --- |
| Cells | `RGBA32UI`, read with `texelFetch` | `max(1, width)` by `max(1, height)` cells | 0 |
| Atlas | `RGBA8UI` | `atlasCols * cellPxW` by `atlasRows * cellPxH` | 1 |
| Canonical target | `RGBA8UI` colour attachment of a framebuffer | `canvas.width` by `canvas.height` | 2 |
| Row mask (overlay only) | `R8UI` | 1 by `max(1, height)` | 3 |

Every texture is allocated with `texStorage2D` at one level and has `NEAREST` minification and
magnification filters and `CLAMP_TO_EDGE` wrapping. An integer texture with any other filter is
incomplete and samples as zero.

`WEBGL2_ENUMS` holds the numeric GL constants the presenter uses. The browser probe checks each
against a live context.

## One frame

`present(current, target, ctx)`:

1. Checks the canvas covers the grid and the drawing buffer matches the canvas.
2. Calls `packSurfaceDamage()` with the atlas's `resolveSlot` and `atlasGeneration`, forcing a
   full refresh when `ctx.forceFullRefresh` is set, the device pixel ratio changed since the last
   frame, or `atlas.consumeFullRefresh()` returns `true`.
3. Uploads the atlas: the whole bitmap when the generation, the `rgba` array or the texture size
   changed, otherwise each rectangle of `atlas.takeDirtyRects()` with `texSubImage2D` and
   `UNPACK_ROW_LENGTH`, `UNPACK_SKIP_PIXELS` and `UNPACK_SKIP_ROWS`.
4. Uploads the cells: the whole staging buffer on a full refresh, after a grid size change, a
   restore or a failed frame; otherwise one `texSubImage2D` per dirty row span, from
   `staging` at word offset `minRow * width * 4`.
5. Draws `gl.drawArrays(gl.TRIANGLES, 0, 3)` with the generated program into the canonical
   target.
6. Draws a second fullscreen triangle, the display pass, onto the default framebuffer.
7. Checks `gl.getError()`, reads the canonical target back if readback is on, and records the
   receipt.

`present()` is synchronous and keeps no reference to either surface.

### The display pass

The generated fragment stage writes `uvec4` to an integer target, which a canvas cannot show, and
WebGL2 cannot blit an integer framebuffer to a normalized one. The display pass is a separate
fragment stage, `WEBGL2_DISPLAY_FRAGMENT_GLSL` (`geordi-webgl2-display.frag.glsl`), linked with the
generated vertex stage. It writes `texelFetch(canonical, gl_FragCoord.xy).rgb / 255.0`, which an
`RGBA8` drawing buffer stores as the same byte. It is not a copy or an edit of the generated
shader, and the canonical frame never passes through it.

## Readback and receipts

`getLastReceipt()` returns `null` before the first drawn frame, then a
`geordi-bijou-gpu-receipt/1` receipt that `parseEndpointReceipt()` has already accepted.

| Field | Value |
| --- | --- |
| `backendProfile` | `geordi-webgl2/1` |
| `adapter` | `backend: "webgl2"`, `name`: the `WEBGL_debug_renderer_info` unmasked renderer (`RENDERER` without it), `driver`: `VERSION` |
| `assembledWgslSha256`, `generatedGlslSha256` | From the pin |
| `shaderSha256` | `generatedGlslSha256` |
| `executedArtifactSha256` | `webgl2ExecutedArtifactSha256(shaders)`: the framed digest of the generated vertex, generated fragment and display fragment stages |
| `preparedBufferSha256` | SHA-256 of the staging buffer, little-endian |
| `cellPx`, `fontIdentity`, `atlasGeneration`, `atlasStats` | `atlas.getReceiptAssets()` |
| `canvasPxW`, `canvasPxH`, `dpr` | The canvas size and the last `resize()` ratio (1 before any) |
| `evidenceLevel`, `frameRgbaSha256`, `probes` | See below |

Without readback a frame's receipt is `unit-upload`: `frameRgbaSha256: null` and no probes. With
readback the presenter binds the canonical framebuffer and reads it with
`readPixels(0, 0, w, h, RGBA_INTEGER, UNSIGNED_BYTE)` when
`IMPLEMENTATION_COLOR_READ_FORMAT` / `_TYPE` report that pair, and with `RGBA_INTEGER` /
`UNSIGNED_INT`, the pair every implementation must accept, otherwise. It flips the rows to
top-left, hashes them into `frameRgbaSha256`, and samples the probes. The receipt is then:

- `gpu-probed` when the unmasked renderer is named and does not match
  `swiftshader|llvmpipe|softpipe|software|basic render`;
- `software-probed` otherwise, including when the renderer is masked.

`readCanonicalFrame()` returns `{ canvasPxW, canvasPxH, rgba, frameRgbaSha256, readbackPath }`
for the last frame, reading it back on demand when readback is off. `setCanonicalReadback(enabled)`
switches readback from the next frame.

## Resize and hit-testing

`resize({ cssWidth, cssHeight, dpr, devicePixelContentBox })` sets the canvas to
`devicePixelContentBox` when given, else `Math.round(css * dpr)`, and redraws the retained frame
when it still fits. Non-finite or non-positive input, or a physical size outside `1..65535`,
throws `GEORDI_E_BIJOU_INVALID_SURFACE`. A ratio change forces a full refresh on the next frame.
Cell metrics come from the atlas; at a new ratio the host invalidates the atlas with new metrics,
as [`watchGlyphAtlasEnvironment()`](./bijou-gpu-glyph-atlas.md) does.

Pixels outside the grid are `defaultBg`: the shader paints them, so a shrinking grid or a
fractional-ratio remainder needs no clear.

`cellFromPoint(clientX, clientY)` is the shared zero-based `cellFromPoint()` of the conformance
kit over the presented grid, the atlas cell size, the canvas size and
`canvas.getBoundingClientRect()`. It returns `null` before the first frame and after `dispose()`.

## Context loss

The presenter listens for `webglcontextlost` and `webglcontextrestored` on the canvas.

- On loss it calls `preventDefault()`, without which the browser never restores the context, and
  drops every GL handle.
- While lost, `present()` still packs, so the staging buffer stays current, and draws nothing.
  `getLastReceipt()` keeps describing the last drawn frame.
- On restore it rebuilds every program, buffer and texture and redraws from the retained staging
  buffer and the whole atlas, without waiting for the application. If the rebuild throws, the
  message is in `getDiagnostics().restoreFault` and the next `present()` rebuilds and throws it.

## Diagnostics and the overlay

`setDiagnosticOverlay(enabled)` redraws only the display pass. With the overlay on, rows uploaded
in the last frame are tinted half-way to magenta. The canonical target, its readback and the
receipt are unchanged.

`getDiagnostics()` returns `overlay`, `canonicalReadback`, `contextLost`, `adapter`,
`probedEvidenceLevel`, `framesDrawn`, `lastDirtyRowSpans`, `lastFullRefreshReason`,
`lastCellUploads`, `lastAtlasUploads`, `atlasGeneration`, `atlasStats`, `readbackPath` and
`restoreFault`.

## Dispose

`dispose()` removes both listeners and deletes every program, vertex array, buffer, texture and
framebuffer it created. Shaders are deleted once linked. Calling it again does nothing; any other
method except `getLastReceipt()`, `getDiagnostics()` and `cellFromPoint()` then throws
`RendererFaultError`.

## Static atlas source

`createStaticAtlasSource({ bitmap, slotMap, fontIdentity })` in `src/presenter-atlas.ts` is a
`PresenterAtlasSource` whose generation is always `GLYPH_ATLAS_FIRST_GENERATION` and which reports
no dirty rectangles. Its `atlasStats` count the slot map's entries. It exists so a presenter can
draw with exactly the atlas bytes the reference oracle used, such as `createTestGlyphPack()`. It is
not WebGL2-specific.

## Running the probes

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

The browser suite opens `packages/bijou-gpu/harness/webgl2.html`. Each probe records the renderer
and evidence level as a Playwright annotation. Headless Chrome in CI renders with SwiftShader, so
CI evidence is `software-probed`.

## Error codes

Listed in [`ERROR_CODES.md`](./ERROR_CODES.md#bijou-gpu-conformance-kit-errors).
