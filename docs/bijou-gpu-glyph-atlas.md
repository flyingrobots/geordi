# Bijou GPU Glyph Atlas Reference

**Package**: `@flyingrobots/geordi-bijou-gpu` (`packages/bijou-gpu`)
**Modules**: `src/glyph-atlas.ts` (core), `src/glyph-atlas-browser.ts` (browser adapter)
**ABI**: `bijou-surface-gpu/1`
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md), sections 2 to 6
**Evidence ledger**: [`bijou-gpu-glyph-atlas-test-plan.md`](./bijou-gpu-glyph-atlas-test-plan.md)

This page describes the dynamic `GlyphAtlas` on `main`: a cache that rasterizes each unseen
width-1 glyph once, at integer physical pixels, into an `rgba8uint` atlas bitmap, and hands the
[dirty-union packer](./bijou-gpu-surface-damage.md) a slot for it. The design record is normative
for the slot encoding, the cell metric domain, and the full-invalidation triggers; this page says
how the atlas exposes them.

> **Not claimed.** The atlas uploads nothing: it keeps a CPU bitmap and reports which texels
> changed. No presenter uses it yet; the WebGL2, Canvas 2D, and WebGPU presenters are tracked in
> [flyingrobots/geordi#173](https://github.com/flyingrobots/geordi/issues/173),
> [flyingrobots/geordi#174](https://github.com/flyingrobots/geordi/issues/174), and
> [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175). Glyph pixels from
> the browser adapter depend on the host's fonts and are not reproducible across hosts; bit-exact
> conformance frames use the [test glyph pack](./bijou-gpu-conformance-kit.md#test-glyph-pack).
> No timing has been measured.

## Two modules

| Module | Host API | Contents |
| --- | --- | --- |
| `glyph-atlas.ts` | None. | Slot table, slot allocator, dirty sub-rect tracker, `generation` counter, colour detection, metric snapping. |
| `glyph-atlas-browser.ts` | 2D canvas, `document.fonts`, `devicePixelRatio`, `matchMedia`, `ResizeObserver`. | A canvas rasterizer and a watcher that invalidates an atlas on font arrival and DPR change. It holds no atlas state. |

Every host object the adapter touches is typed structurally and can be injected, so the package
compiles without DOM typings.

## Core

### Creating an atlas

```ts
createGlyphAtlas({ rasterizer, atlasCols, atlasRows, metrics, strictCanonical? })
```

| Option | Meaning |
| --- | --- |
| `rasterizer` | A `GlyphRasterizer`. See [Rasterizer contract](#rasterizer-contract). |
| `atlasCols`, `atlasRows` | The slot grid. Capacity is `atlasCols * atlasRows`, at most 65536, because a slot must fit the 16-bit `glyph_payload`. |
| `metrics` | `GlyphAtlasMetrics`: `cellPxW` and `cellPxH`, integers in `1..256`, and a non-empty `fontIdentity`. |
| `strictCanonical` | Default `true`. See [Strict canonical mode](#strict-canonical-mode). |

The bitmap is `atlasCols * cellPxW` by `atlasRows * cellPxH` texels. Slot `s` occupies the cell at
column `s % atlasCols`, row `floor(s / atlasCols)`, as the design record lays the atlas out.

### `GlyphAtlas` members

| Member | Meaning |
| --- | --- |
| `resolve(grapheme, bold)` | The slot for the key, rasterized on first use. Returns `GlyphAtlasSlotRef` (`slot`, `kind`, `generation`), or `undefined` for the empty string. |
| `resolveSlot(grapheme, flags)` | `resolve` keyed by a packed `OFF_FLAGS` byte; only `FLAG_BOLD` is read. It is a `ResolveGlyphSlot` and can be passed detached. |
| `atlasGeneration()` | `generation` as a function, the shape the packer reads. |
| `generation` | Starts at 1 (`GLYPH_ATLAS_FIRST_GENERATION`) and increases by one on every reset. |
| `metrics` | The current `GlyphAtlasMetrics`. |
| `bitmap` | The live `AtlasBitmap`. Its `rgba` array is written in place and is replaced when the cell size changes, so read it again after a reset. |
| `dirtyRects` | The texel regions written since the last `takeDirtyRects()`. |
| `takeDirtyRects()` | Returns those regions and clears them. |
| `needsFullRefresh` | A reset has happened that `consumeFullRefresh()` has not yet returned. |
| `consumeFullRefresh()` | Returns `needsFullRefresh` and clears it. |
| `lastInvalidation` | `{ generation, reason }` of the most recent reset, or `null`. |
| `isCurrent(ref)` | Whether a slot reference belongs to the current generation. |
| `invalidate(metrics?, reason?)` | Reset the atlas, optionally with new metrics. See [Invalidation](#invalidation). |
| `getStats()` | See [Diagnostics](#diagnostics). |
| `getReceiptAssets()` | The atlas-owned receipt fields. See [Diagnostics](#diagnostics). |
| `toSlotMap()` | A `GlyphSlotMap` snapshot of the current generation, the form `renderReferenceRgba()` takes. |

Slots are keyed by `(grapheme, bold)` and assigned in order from 0. A key that is already cached
never reaches the rasterizer.

### Use with the packer

A `GlyphAtlas` is a valid `SurfaceDamageOptions`:

```ts
const result = packSurfaceDamage(state, current, target, atlas);
```

The packer reads `atlasGeneration()` around each pass. When a glyph overflows the atlas while a
frame is being packed, it discards the pass and lowers the whole grid again in the new
generation. `consumeFullRefresh()` is for a caller that does not give the packer
`atlasGeneration`; such a caller passes the result as `forceFullRefresh`.

### Slot encoding

`encodeAtlasGlyphWord0(ref)` returns `word0` of the prepared cell: `glyph_kind` in bits 16..19
and the slot in bits 0..15.

| `kind` | `glyph_kind` | Atlas texel |
| --- | --- | --- |
| `mono` | `1` (`GLYPH_KIND_ATLAS_MONO`) | `(255, 255, 255, coverage)`. The shader reads alpha. |
| `color` | `2` (`GLYPH_KIND_ATLAS_COLOR`) | Premultiplied sRGB RGBA, each channel `divRoundEven(channel * alpha, 255)`. |

Monochrome coverage is `divRoundEven(alpha * (r + g + b), 765)`: plain alpha for white ink with
grayscale antialiasing, and the mean of the three subpixel coverages for an LCD-antialiased
raster.

### Colour detection

`classifyGlyphPixels(rgba)` decides `mono` or `color` from a straight-alpha RGBA8 raster:

```text
sumC = Σ alpha * C          for C in R, G, B
sumA = Σ alpha
color  iff  max(sumR, sumG, sumB) - min(sumR, sumG, sumB) > 16 * sumA
```

That is: the alpha-weighted mean red, green, and blue differ by more than
`COLOR_GLYPH_DIVERGENCE_THRESHOLD` (16 of 255). The arithmetic is exact integer arithmetic.

- Transparent pixels carry no weight.
- The test compares channel totals, not single pixels. Subpixel-antialiased text has strongly
  coloured fringe pixels, but white ink deposits the same total coverage in every channel, so its
  totals balance and it stays `mono`.
- A colour glyph whose channel totals balance, such as a pure gray emoji, is classified `mono`
  and is then tinted with the cell foreground.
- A raster with no opaque pixel is `mono`.

### Dirty sub-rects

Each newly rasterized slot adds its cell rectangle, `{ x, y, width, height }` in atlas texels from
the top-left. A slot that directly follows the previous dirty slot on the same atlas row extends
that rectangle instead of adding one. After a reset the list is the single rectangle covering the
whole atlas until it is taken, because the bitmap was cleared.

### Overflow

When an unseen glyph arrives and every slot is used, the atlas resets and marks everything dirty:
`generation` increases by one, the slot table is emptied, the bitmap is zeroed, the whole atlas
becomes dirty, `needsFullRefresh` becomes `true`, and the new glyph takes slot 0. No single slot
is ever evicted, so no cell can keep a slot that now holds another glyph. `lastInvalidation.reason`
is `overflow`.

The glyph is rasterized and validated before the reset, so a rasterizer failure does not evict
anything.

### Invalidation

`invalidate(metrics?, reason?)` performs the same reset on request. `metrics` is a partial
`GlyphAtlasMetrics`; omitted fields keep their value. A new cell size reallocates the bitmap.
`reason` is one of `metrics-change`, `dpr-change`, `font-ready`, or `manual`; it defaults to
`metrics-change` when metrics are given and to `manual` otherwise. Every call starts a new
generation, including one that changes nothing, because a font can change its glyphs without
changing its metrics. Invalid metrics throw and leave the atlas as it was.

`snapCellMetrics({ cellCssW, cellCssH, dpr })` is the host-boundary conversion to integer physical
pixels: `Math.round(css * dpr)` per axis. It refuses non-finite or non-positive input and a result
outside `1..256`.

### Strict canonical mode

With `strictCanonical: true`, `resolve` accepts only text that Bijou's width-1 glyph policy
accepts (`isSafeUnitGlyph`), checked before the rasterizer is called. With `false`, any non-empty
string is rasterized into one cell and clipped to it. That is not a wide-cell layout: the ABI
defines none.

### Rasterizer contract

```ts
interface GlyphRasterizer {
  rasterize(request: GlyphRasterRequest): ArrayLike<number>;
}
```

`GlyphRasterRequest` carries `grapheme`, `bold`, `cellPxW`, `cellPxH`, and `fontIdentity`. The
result is exactly `cellPxW * cellPxH * 4` unsigned bytes of tight top-left row-major RGBA8 with
straight (non-premultiplied) alpha. Monochrome text must be drawn in opaque white on a
transparent or black ground; a colour glyph keeps its own colours.

### Diagnostics

`getStats()` returns a frozen object:

| Field | Meaning |
| --- | --- |
| `generation` | Current generation. |
| `usedSlots`, `capacity` | Slots in use and `atlasCols * atlasRows`. |
| `monoCount`, `colorEmojiCount` | Slots by kind. `usedSlots == monoCount + colorEmojiCount`. |
| `atlasCols`, `atlasRows`, `cellPxW`, `cellPxH`, `fontIdentity` | The atlas layout and metrics. |

`getReceiptAssets()` returns the same facts under the field names of
`geordi-bijou-gpu-receipt/1`: `atlasGeneration`, `atlasStats`, `fontIdentity`, and `cellPx`. They
can be spread into a receipt.

## Browser adapter

### `createCanvasGlyphRasterizer({ font, createCanvas? })`

Returns a `GlyphRasterizer` with a `font` property and `setFont(font)`.

- `font` is a `CanvasGlyphFont`: `family` (a CSS `font-family` list), `sizePx` (physical pixels),
  and optional `regularWeight` (default `400`) and `boldWeight` (default `700`).
- `createCanvas(width, height)` supplies the scratch canvas. The default uses `OffscreenCanvas`,
  then `document.createElement('canvas')`.
- Each glyph is drawn with `fillText` in `#ffffff` on a cleared, cell-sized canvas and read back
  with `getImageData`. The text origin is whole pixels: `x = Math.round((cellPxW - advance) / 2)`
  and `baseline = Math.round((cellPxH - (ascent + descent)) / 2 + ascent)`, where ascent and
  descent are the font bounding box, or 0.8 and 0.2 of `sizePx` where the host reports none.
- The canvas is created on the first glyph. A host with no canvas or no 2D context throws
  `BackendUnavailableError` for backend `canvas2d` there.
- `setFont` does not invalidate the atlas; the caller does.

### `resolveCanvasGlyphEnvironment(font, dpr)`

`font` is a `GlyphAtlasCssFont`: `family`, `sizeCssPx`, `cellCssW`, `cellCssH`, and optional
weights. The result has `dpr`, `metrics` for the atlas, and `font` for the rasterizer. The cell
goes through `snapCellMetrics`; the font size is `max(1, Math.round(sizeCssPx * dpr))`;
`fontIdentity` is `"<family> <size>px"`.

### `watchGlyphAtlasEnvironment(options)`

| Option | Meaning |
| --- | --- |
| `atlas` | The atlas to invalidate. |
| `rasterizer` | Receives `setFont` with the font resolved at each new DPR. |
| `font` | The `GlyphAtlasCssFont` to resolve. |
| `host` | A `GlyphAtlasEnvironmentHost`. Defaults to the browser globals; without them the call throws `BackendUnavailableError`. |
| `element` | Optional element to observe for DPR changes. |
| `onInvalidate` | Called after each invalidation with `{ reason, dpr, generation, metrics }`. |
| `onError` | Called when a new DPR yields metrics outside `1..256`. Without it the error is thrown from the host event listener. |

It returns `{ dpr, dispose() }`. It does not resolve the initial metrics: create the atlas and the
rasterizer from `resolveCanvasGlyphEnvironment` at the host's current DPR first.

| Event | Trigger | Effect |
| --- | --- | --- |
| DPR change | The `change` event of a `(resolution: <dpr>dppx)` media query, re-armed for the new DPR after each change. With `element`, also a `ResizeObserver` on its `device-pixel-content-box`. | If `devicePixelRatio` differs from the last value seen: resolve the font at the new DPR, call `rasterizer.setFont`, and `atlas.invalidate(metrics, 'dpr-change')`. |
| Font arrival | `document.fonts.ready` resolving, and each later `loadingdone` event. | If the atlas holds at least one glyph: `atlas.invalidate(undefined, 'font-ready')`. |

A trigger that finds the DPR unchanged does nothing. The `ResizeObserver` is only a trigger; the
DPR is always read from `devicePixelRatio`. Where the box option is unsupported the observer is
dropped and the media query remains.

## Errors

| Condition | Code |
| --- | --- |
| A width-2 grapheme in strict canonical mode | `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` |
| Other text Bijou's width-1 policy refuses, in strict canonical mode | `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` |
| Cell metrics that are not integers in `1..256`, or a non-finite or non-positive CSS size or DPR | `GEORDI_E_BIJOU_INVALID_CELL_METRICS` |
| A slot grid that is not positive integers or exceeds 65536 slots, an empty `fontIdentity`, an invalid canvas font, or a raster of the wrong length or with a non-byte value | `GEORDI_E_BIJOU_INVALID_ATLAS` |
| No canvas, no 2D context, or no browser host | `GEORDI_E_BIJOU_BACKEND_UNAVAILABLE` |

All but the last are `BijouGpuValidationError` with a `path`. Codes are listed in
[`ERROR_CODES.md`](./ERROR_CODES.md#bijou-gpu-conformance-kit-errors).
