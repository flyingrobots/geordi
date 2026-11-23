# Bijou GPU Glyph Atlas Test Plan

Contract ledger for [`bijou-gpu-glyph-atlas.md`](./bijou-gpu-glyph-atlas.md). Each row names a
requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from
[flyingrobots/geordi#172](https://github.com/flyingrobots/geordi/issues/172) and sections 2 to 6
of the [design record](./design/2026-11-bijou-surface-gpu-abi.md).

Test files are under `packages/bijou-gpu/`. Run them with:

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

Every row is implemented.

The core tests use a fake pixel-buffer rasterizer: white ink with a coverage pattern derived from
the request, or a flat colour for one named grapheme. The adapter unit tests use a canvas and a
host that record calls. Only the browser probe uses real fonts.

## Golden

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-01 | Slot assignment | Sequential slots per `(grapheme, bold)`; one raster per key | `assigns sequential slots keyed by (grapheme, bold) and rasterizes each unseen key once` |
| BG-ATLAS-02 | `resolveSlot` flag handling | Only `FLAG_BOLD` selects the slot | `resolveSlot keys on the BOLD bit of the packed flags byte and ignores every other flag` |
| BG-ATLAS-03 | Slot map snapshot | Entries and lookups | `snapshots its slots as a GlyphSlotMap the reference oracle accepts` |
| BG-ATLAS-04 | Texel layout | Hand-computed coverage and premultiplied texels at each slot origin | `stores monochrome coverage in alpha and premultiplied colour at each slot origin` |
| BG-ATLAS-05 | Slot flag bits | Design record vectors V1 (`0x00010007`) and V2 (`0x0002002A`) | `gives monochrome glyphs and colour emoji distinct glyph_kind bits, matching ABI vectors V1 and V2`; `refuses to encode a slot outside the 16-bit glyph payload` |
| BG-ATLAS-06 | Atlas feeds the oracle | Suite golden frame digests, with the atlas built in a different slot order from the test glyph pack | `feeds the reference oracle the suite goldens when it rasterizes the test glyph pack` |
| BG-ATLAS-07 | Dirty sub-rects | Hand-computed rectangles; every changed texel lies inside a reported rectangle | `reports exactly the newly rasterized slots, merging row-adjacent slots, and drains on take`; `covers every changed texel and nothing outside the reported rects` |
| BG-ATLAS-08 | `getStats()` | Exact object before and after glyphs and a reset | `reports slot occupancy, generation, and asset metadata through getStats()` |
| BG-ATLAS-09 | Receipt assets | `validateEndpointReceipt` accepts a receipt carrying them | `produces receipt asset fields that validate inside a geordi-bijou-gpu-receipt/1` |

## Colour detection

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-10 | Grayscale-antialiased fixtures | `mono` for white, black, and gray ink and for one-code-value round-off | `classifies grayscale-antialiased ink of any gray level as monochrome` |
| BG-ATLAS-11 | Subpixel-antialiased fixtures | `mono` for LCD fringes with coverage in RGB and in alpha | `classifies subpixel-antialiased white ink as monochrome despite coloured fringes`; `stores subpixel-antialiased ink as mean-channel coverage in a monochrome slot` |
| BG-ATLAS-12 | Chromatic glyphs | `color`, including a single faint pixel | `classifies chromatic glyphs as colour, including faint ones` |
| BG-ATLAS-13 | Threshold | Divergence of exactly 16 is `mono`, 17 is `color`; empty raster is `mono` | `applies the documented threshold exactly and treats empty rasters as monochrome` |

## Edges

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-14 | Capacity overflow | `generation + 1`, slot 0, zeroed texels, whole-atlas dirty rect, one-shot full refresh | `increments generation, restarts slots at zero, clears old texels, and flags a full refresh`; `keeps one pending full refresh across several resets before the packer runs` |
| BG-ATLAS-15 | DPR `1 -> 1.5 -> 2` | Cells `9×17`, `14×26`, `18×34`; new generation and re-raster at each | `snaps CSS cell sizes with Math.round at DPR 1, 1.5, and 2`; `re-rasterizes at each integer cell size as DPR moves 1 -> 1.5 -> 2, bumping generation each time` |
| BG-ATLAS-16 | Font-ready flush | Same key rasterized again with the new pixels | `flushes glyphs cached before a web font arrived when the font-ready invalidation fires` |
| BG-ATLAS-17 | `invalidate` arguments | Partial metrics, default reasons, refusal without state change | `accepts a partial metrics update and defaults the reason`; `rejects fractional or out-of-domain metrics and leaves the atlas untouched` |
| BG-ATLAS-18 | Empty string | `undefined`, no raster, no slot | `handles the empty string safely: no slot, no raster, no state change` |
| BG-ATLAS-19 | Strict canonical mode | Typed errors before any raster; accepted only when the mode is off | `refuses width-2 graphemes in strict canonical mode with a typed error and no state change`; `refuses text that is not one terminal-safe grapheme in strict canonical mode`; `rasterizes a width-2 grapheme into one cell only when strict canonical mode is off` |
| BG-ATLAS-20 | Bad rasterizer output and options | `GEORDI_E_BIJOU_INVALID_ATLAS` or `GEORDI_E_BIJOU_INVALID_CELL_METRICS` at the offending path; a failed raster evicts nothing | `rejects a raster of the wrong size or with non-byte values, consuming no slot`; `rejects invalid atlas options` |

## Known failure modes

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-21 | Fractional physical cell sizes | Integer result for 351 DPR values; refusal of non-finite, non-positive, and out-of-domain input | `never yields a fractional cell size for any fractional DPR`; `rejects non-finite, non-positive, and out-of-domain host metrics` |
| BG-ATLAS-22 | Stale slot IDs after a reset | The evicted glyph is rasterized again and takes a different slot; the old reference is not current | `never serves a slot from before the reset: evicted glyphs are rasterized again` |

## Fuzz and stress

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-23 | `capacity * 3` distinct graphemes | Slots in bounds, monotonic generation, unique live slots, exactly two resets | `survives capacity * 3 distinct graphemes with valid slots, monotonic generation, and no stale hits` |
| BG-ATLAS-24 | 2,000 seeded random resolves and invalidations | Zero stale hits; live slots hold their own texels; stats add up | `holds its invariants under a seeded random mix of hits, misses, and invalidations` |

## Core purity

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-25 | No browser global in the core | Source scan of `glyph-atlas.ts`; the suite runs in Node with no `document`, `window`, or `OffscreenCanvas` | `names no browser global in the core module source`; `runs where no DOM exists` |

## Packer integration

| ID | Case | Oracle | Test (`src/glyph-atlas.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-26 | The atlas is the packer's options | Type assignment to `SurfaceDamageOptions` and `ResolveGlyphSlot` | `is a SurfaceDamageOptions: resolveSlot is a ResolveGlyphSlot and atlasGeneration reads generation` |
| BG-ATLAS-27 | First frame through `packSurfaceDamage` | `prepareReferenceCells` with the atlas slot map | `packs a first frame whose words match the reference lowering, kind bits included` |
| BG-ATLAS-28 | Overflow reset mid-pack | Reference lowering in the new generation; no slot from the abandoned pass | `repacks the whole grid when the atlas overflows in the middle of a first pack`; `discards an incremental pack and repacks when one new glyph overflows the atlas` |
| BG-ATLAS-29 | Invalidation between packs | Full refresh with reason `atlas-generation` | `forces a full repack after a font-ready invalidation with no dirty cells` |
| BG-ATLAS-30 | Frame larger than one generation | `GEORDI_E_BIJOU_INVALID_ATLAS` at `atlasGeneration` | `lets the packer refuse a frame with more distinct glyphs than the atlas holds` |

## Browser adapter, with fakes

| ID | Case | Oracle | Test (`src/glyph-atlas-browser.test.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-31 | Canvas rasterizer | Exact recorded 2D calls, font strings, and integer origins | `draws white ink at an integer origin with the regular or bold font and reads the cell back`; `keeps one scratch canvas and resizes it to each requested cell`; `falls back to size-derived ascent and descent when the host reports no font bounding box`; `applies custom weights and a later setFont()` |
| BG-ATLAS-32 | Rasterizer refusals | Typed errors | `rejects an empty family or a non-finite, non-positive size`; `refuses with BackendUnavailableError when the host has no canvas or no 2D context` |
| BG-ATLAS-33 | Rasterizer into the core | Slot kinds and texels | `feeds the atlas core: canvas ink becomes a monochrome slot, colour ink a colour slot` |
| BG-ATLAS-34 | Environment resolution | Cell and font sizes at DPR 1, 1.5, 2 | `snaps cell and font sizes to integer physical pixels at DPR 1, 1.5, and 2`; `carries weights through and never yields a zero font size`; `rejects a non-finite or non-positive DPR or font size` |
| BG-ATLAS-35 | DPR watcher | Media query strings, listener counts, atlas metrics, events | `re-arms a resolution media query per DPR and invalidates at snapped metrics for 1 -> 1.5 -> 2`; `ignores a media-query change that leaves the DPR where it was`; `uses a device-pixel-content-box ResizeObserver on the element as a second DPR trigger`; `keeps working through the media query when the box option is unsupported`; `reports metrics the ABI cannot hold to onError and leaves the atlas untouched` |
| BG-ATLAS-36 | Font watcher | Generation and re-rastered texels | `flushes glyphs cached before document.fonts.ready resolved`; `does not start a generation when nothing was rasterized before the fonts were ready`; `flushes again when a later font finishes loading` |
| BG-ATLAS-37 | Watcher lifetime | Listener counts after `dispose()`; behaviour on partial and absent hosts | `dispose() releases every listener and ignores a late fonts.ready`; `works on a host with no matchMedia, fonts, or ResizeObserver`; `refuses with BackendUnavailableError where there is no browser host at all` |

## Browser probe

The page `packages/bijou-gpu/harness/glyph-atlas.html` wires the real adapter to the browser's
canvas, fonts, and device pixel ratio. Assertions are about structure (integer metrics, slot
kinds, generations, that ink arrived), never about exact glyph pixels.

| ID | Case | Oracle | Test (`e2e/glyph-atlas.e2e.ts`) |
| --- | --- | --- | --- |
| BG-ATLAS-38 | Host-font glyphs through `OffscreenCanvas` and the default canvas factory | Monochrome slots with ink; bold heavier than regular; one merged dirty rect; no page errors | `rasterizes host-font glyphs into integer-sized monochrome slots` |
| BG-ATLAS-39 | Host colour emoji through `HTMLCanvasElement` | `color` slot with premultiplied texels; a letter stays `mono` | `tags a host colour emoji as a colour slot with premultiplied texels` |
| BG-ATLAS-40 | Boot at DPR 1, 1.5, 2 | Cells `9×17`, `14×26`, `18×34`; font 14, 21, 28 px | `boots at device pixel ratio %s with integer cell metrics` (3 cases) |
| BG-ATLAS-41 | Live DPR change `1 -> 1.5 -> 2` | Two `dpr-change` events through the real media query; generation 2 then 3; snapped metrics; larger re-raster | `a live device pixel ratio change 1 -> 1.5 -> 2 invalidates the atlas at snapped metrics` |
| BG-ATLAS-42 | Web font loaded after first use | One `font-ready` event from the real `document.fonts`; generation 2; different pixels for the same key | `a web font that loads after first use flushes the fallback glyphs` |

## Not covered

- The browser probe runs in Chrome only.
- No real subpixel-antialiased raster is tested. Chrome antialiases text on a transparent canvas
  in grayscale; the subpixel cases are synthetic pixel fixtures.
- In the live DPR test each step also changes the viewport width by one pixel. Chrome's DevTools
  emulation did not re-evaluate media queries for a second scale-only override. A physical
  monitor move is not tested.
- In that emulation the `device-pixel-content-box` observer did not report the DPR change, so
  that trigger is exercised only with a fake host.
- The colour emoji case needs a colour emoji font on the host.
- No GPU texture upload is tested here. The WebGPU presenter's atlas upload is in
  [`bijou-gpu-webgpu-presenter-test-plan.md`](./bijou-gpu-webgpu-presenter-test-plan.md).
