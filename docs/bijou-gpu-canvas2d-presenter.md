# Bijou GPU Canvas 2D Presenter Reference

**Package**: `@flyingrobots/geordi-bijou-gpu` (`packages/bijou-gpu`)
**Modules**: `src/canvas2d-presenter.ts` (presenter), `src/canvas2d-compose.ts` (pixel compositor)
**ABI**: `bijou-surface-gpu/1`
**Receipt profile**: `geordi-canvas2d/1`
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md), sections 4 to 7
**Evidence ledger**: [`bijou-gpu-canvas2d-presenter-test-plan.md`](./bijou-gpu-canvas2d-presenter-test-plan.md)

This page describes the Canvas 2D fallback `GpuSurfacePresenter` on `main`. It presents Bijou
`PackedSurface` frames on a 2D canvas, without WebGL or WebGPU. It reuses the
[dirty-union packer](./bijou-gpu-surface-damage.md) and the [glyph atlas](./bijou-gpu-glyph-atlas.md),
and emits a `geordi-bijou-gpu-receipt/1` that the
[conformance kit's validator](./bijou-gpu-conformance-kit.md#endpoint-receipt-validator) accepts.
The design record is normative for every equation; this page says how the presenter applies them.

> **Not claimed.** This presenter computes every pixel on the CPU; it is not a GPU presenter. The
> [WebGL2 presenter](./bijou-gpu-webgl2-presenter.md) is described separately, the WebGPU
> presenter is tracked in
> [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175), and the fallback
> selection ladder is a separate slice. Browser pixel evidence comes from Chrome only. No timing
> has been measured. The presenter does not observe the element's size itself: the host calls
> `resize()`.

## How pixels are produced

The design record pins Canvas 2D to the same frame hash as the CPU oracle: `shaderSha256` is
`null`, `executedArtifactSha256` pins the executed module, the blend law is sRGB-direct, and the
cross-backend gate is `receipt.frameRgbaSha256 === oracle.frameRgbaSha256` with zero LSB
tolerance. Canvas drawing operations cannot meet that bar. `fillText` and `drawImage`
antialias and filter, `globalAlpha` and partial-alpha `fillStyle` blend in floating point, and
the canvas stores premultiplied colour.

So the presenter uses none of them. It keeps a retained `ImageData` the size of the canvas and
writes exact `u8` channels into it with `composeCanvas2DCell()`. That function applies the design
record's integer blend law (section 5) and procedural glyph geometry (section 7) to one prepared
cell. It is written independently of the oracle's inner loop, but uses the same `lerpU8`,
`divRoundEven`, Box-Drawing, Block Element, Braille and decoration helpers. The retained frame
is copied to the canvas with `putImageData`, which writes opaque bytes unchanged. Every pixel has
alpha 255, so premultiplication loses nothing.

Every pixel of a cell is computed from that cell's prepared words and the theme defaults. The
canvas is never read during drawing, so repainting a partial-opacity cell cannot accumulate alpha.

## Creating a presenter

```ts
createCanvas2DSurfacePresenter({ canvas, atlas, proceduralTable, defaultFg?, defaultBg?, dpr?,
  probePoints?, adapter?, executedArtifactSha256? })
```

The function is a synchronous `GpuSurfacePresenterFactory<Canvas2DSurfacePresenterOptions>`.

| Option | Meaning |
| --- | --- |
| `canvas` | A `Canvas2DSurfaceCanvas`: an `HTMLCanvasElement` or `OffscreenCanvas`. Its current `width` and `height` are the physical canvas size until the first `resize()`. |
| `atlas` | A `Canvas2DGlyphAtlas`: `bitmap`, `resolveSlot`, `atlasGeneration` and `getReceiptAssets()`. A `GlyphAtlas` satisfies it. So does a fixed atlas such as the bundled test glyph pack. The cell size is the atlas's. |
| `proceduralTable` | From `decodeProceduralGlyphTable()` over `fixtures/bijou-gpu/procedural-glyphs.json`. |
| `defaultFg`, `defaultBg` | `uDefaultFg` and `uDefaultBg` as uppercase `#RRGGBB`. Default to `REFERENCE_DEFAULT_FG` and `REFERENCE_DEFAULT_BG`. |
| `dpr` | The device pixel ratio recorded until the first `resize()`. Default `1`. |
| `probePoints` | Physical pixels sampled into receipt `probes`. Default: the top-left pixel, the centre pixel, and the bottom-right pixel. |
| `adapter` | Receipt `adapter.name` (default `canvas2d-imagedata`) and `adapter.driver` (default `navigator.userAgent`, or empty where there is none). |
| `executedArtifactSha256` | A host-pinned digest, such as the SHA-256 of the shipped bundle. See [Executed artifact](#executed-artifact). |

The context is requested as `getContext('2d', { alpha: false, colorSpace: 'srgb',
willReadFrequently: true })`. No other context is requested. A canvas that returns no 2D context
throws `BackendUnavailableError` with backend `canvas2d`.

Every host object is typed structurally (`Canvas2DSurfaceCanvas`, `Canvas2DSurfaceContext`,
`Canvas2DImageData`), so the package compiles without DOM typings.

## `present(current, target, ctx)`

1. `packSurfaceDamage()` lowers the union damage of `current` and `target` into the packer's
   retained staging buffer. It reads the atlas's `resolveSlot` and `atlasGeneration`.
2. The atlas bitmap is read after packing, because an atlas reset during the pack replaces it.
3. The grid must fit the canvas: `widthCells * cellPxW <= canvas.width` and likewise for height.
   Otherwise the call throws `GEORDI_E_BIJOU_INVALID_SURFACE` and the next present redraws
   everything.
4. **Full redraw.** The presenter composites every cell and fills the letterboxed remainder with
   solid `uDefaultBg`. It then issues one `putImageData` covering the whole canvas.
5. **Incremental redraw.** Within the packer's dirty row spans, a cell is composited only when
   its prepared words differ from the words it was last drawn with. Each horizontal run of
   changed cells in a row is one `putImageData` call. The dirty rectangle is snapped to whole
   cells, so no physical pixel row or column is left between rectangles.

A frame with no changed cell issues no draw call. A single-cell update issues one
`cellPxW × cellPxH` `putImageData`. Draw calls grow with the number of changed runs, not with the
grid.

`ctx` is a `Canvas2DPresentContext`: `GpuPresentContext` plus an optional `inputReceiptSha256`
(see [Receipt](#receipt)). `present()` is synchronous. When no `inputReceiptSha256` is given, the
target's cell bytes and side table are copied before it returns.

### Full-redraw triggers

| Trigger | Source |
| --- | --- |
| First frame, grid dimension change, atlas generation change, `ctx.forceFullRefresh` | The packer's `fullRefresh` result. |
| Canvas size or DPR change through `resize()` | The presenter forces the next pack to refresh fully. |
| Atlas cell size differs from the last drawn frame | The presenter compares the bitmap's `cellPxW` and `cellPxH`. |
| `contextlost` event, or a present that threw | The next present refreshes fully. |

Theme defaults are fixed for the life of a presenter, so the theme-change trigger does not arise.

## `resize(size)`

`resize({ cssWidth, cssHeight, dpr, devicePixelContentBox? })` is the host-boundary ingress. It
rejects non-finite and non-positive `cssWidth`, `cssHeight` and `dpr` with
`GEORDI_E_BIJOU_INVALID_SURFACE`. The physical size is `devicePixelContentBox` when given, which
must be integers in `1..65535`. Otherwise it is `max(1, Math.round(css * dpr))` per axis. The
canvas `width` and `height` are assigned only when they change, because assigning clears a canvas.
The retained frame is reallocated on the next present.

The presenter does not change the atlas. A host that changes the DPR also invalidates the atlas
at the new metrics, as `watchGlyphAtlasEnvironment()` does. The next present then sees a new
generation and a new cell size.

## `cellFromPoint(clientX, clientY)`

This calls the kit's shared `cellFromPoint(geometry, rect, clientX, clientY)` with the canvas's
`getBoundingClientRect()`. The geometry is the canvas grid capacity:
`cols = floor(canvas.width / cellPxW)`, `rows = floor(canvas.height / cellPxH)`. It returns
`null` for an empty grid, for non-finite or non-positive host geometry, for a canvas without
`getBoundingClientRect`, and after `dispose()`.

## Receipt

`getLastReceipt()` returns `null` before the first frame, after a `present()` that threw, and
after `dispose()`. Otherwise it
reads the canvas back with `getImageData(0, 0, canvasPxW, canvasPxH)`. That gives the canonical
tight top-left row-major RGBA8 frame, hashed into `frameRgbaSha256`. The digests are computed on
the first call after a present and cached until the next present. The receipt is built through
`parseEndpointReceipt()`, so it always validates.

| Field | Value |
| --- | --- |
| `backendProfile` | `geordi-canvas2d/1` (`CANVAS2D_BACKEND_PROFILE`). |
| `adapter` | `{ backend: "canvas2d", name, driver }` from the options. |
| `evidenceLevel` | `software-probed`: Canvas 2D executed the frame and the readback was probed. The design record allows this level for Canvas 2D lanes, not for hardware-GPU claims. |
| `assembledWgslSha256`, `generatedGlslSha256`, `shaderSha256` | `null`. |
| `executedArtifactSha256` | See [Executed artifact](#executed-artifact). |
| `frameRgbaSha256` | SHA-256 of the canvas readback. |
| `probes` | `probePoints` sampled from the same readback. |
| `preparedBufferSha256` | SHA-256 of the little-endian bytes of the packer's staging buffer for the frame. |
| `inputReceiptSha256` | `ctx.inputReceiptSha256` when the host gave one, such as the digest of a `packed-bijou-cells/1` file. Otherwise `liveInputSha256(buffer, sideTable)` over the copy taken during `present()`: SHA-256 of the raw cell bytes followed by the UTF-8 of `stringifyCanonicalJson(sideTable)`. |
| `widthCells`, `heightCells`, `canvasPxW`, `canvasPxH`, `dpr` | Of the presented frame. |
| `cellPx`, `fontIdentity`, `atlasGeneration`, `atlasStats` | The atlas's `getReceiptAssets()`, read when the frame was presented. |
| `defaultFg`, `defaultBg` | The theme defaults. |

With the same prepared cells, theme defaults and `rgba8uint` atlas bytes,
`assertBitExactFrameHash(receipt, oracle)` passes against `renderReferenceRgba()` for the same
canvas size.

### Executed artifact

The design record requires a non-null `executedArtifactSha256` that pins the executed JavaScript
for Canvas 2D. By default it is the SHA-256 of `canvas2DExecutedArtifactSource()`. That is the
source text the engine reports through `Function.prototype.toString` for the pixel-path functions,
joined by newlines:

- `createCanvas2DSurfacePresenter`, `composeCanvas2DCell` and `fillCanvas2DRect`;
- `packSurfaceDamage`;
- `lerpU8`, `divRoundEven`, `bunnyU32DivRoundEven`, `bunnyU32EllipseClassify`, `satSub`
  and `absDiff`;
- `boxPixelLit`, `blockPixelQuarters`, `braillePixelLit` and `decorationPixelLit`.

It is the text that actually ran, so an unbundled build and a minified bundle have different
digests. Unexported helpers inside the packer and procedural modules are not part of the text. A
host that wants a whole-bundle pin passes `executedArtifactSha256`, which must be a lowercase
64-hex digest.

## Context loss

The presenter listens for `contextlost` and `contextrestored` when the canvas supports
`addEventListener`. On `contextrestored` it immediately copies the retained frame back with one
whole-canvas `putImageData`, without waiting for a new application frame. If the canvas size
changed meanwhile, it waits for the next present to redraw fully.

## `dispose()`

`dispose()` removes the listeners and drops the retained frame, the input copy and the last
receipt. It is idempotent. `present()` and `resize()` after `dispose()` throw `RendererFaultError`.

The presenter allocates no scratch canvas. Its only pixel allocation is the retained `ImageData`,
made on the first present and after a canvas size change.

## Errors

| Condition | Error |
| --- | --- |
| No 2D context | `BackendUnavailableError` (`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE`), backend `canvas2d` |
| Present or resize after dispose; `createImageData` or `getImageData` returned the wrong size | `RendererFaultError` (`GEORDI_E_BIJOU_RENDERER_FAULT`) |
| Bad resize input, grid larger than the canvas, bad `dpr`, `executedArtifactSha256` or `ctx.inputReceiptSha256` | `BijouGpuValidationError` `GEORDI_E_BIJOU_INVALID_SURFACE` |
| Bad theme colour | `GEORDI_E_BIJOU_INVALID_SURFACE`, from `parseHexColor` |
| Probe point outside the canvas | `GEORDI_E_BIJOU_INVALID_SURFACE`, from `readPixel` |
| Atlas slot outside the atlas | `GEORDI_E_BIJOU_INVALID_ATLAS` |
| Width-2 grapheme, missing glyph slot, malformed surface | The packer's errors, unchanged |

## Browser probe page

`packages/bijou-gpu/harness/canvas2d.html` runs the presenter on real canvases and publishes
`window.__geordiCanvas2DProbe`. It presents the width-1 paint and erase frames with the bundled
test glyph pack, and returns each receipt as canonical JSON next to the oracle digest computed
in the same browser. It also repaints a partial-opacity cell, resizes at DPR 2, and presents
glyphs rasterized by the browser into a live `GlyphAtlas`. `e2e/canvas2d.e2e.ts` drives it.
`document.body.dataset.canvas2dProbe` is `ready` once booted, or `error` with the message in
`window.__geordiCanvas2DProbeError`.

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```
