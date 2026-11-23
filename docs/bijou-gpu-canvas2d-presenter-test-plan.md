# Bijou GPU Canvas 2D Presenter Test Plan

Contract ledger for [`bijou-gpu-canvas2d-presenter.md`](./bijou-gpu-canvas2d-presenter.md). Each
row names a requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from [flyingrobots/geordi#174](https://github.com/flyingrobots/geordi/issues/174)
and sections 4 to 6 of the [design record](./design/2026-11-bijou-surface-gpu-abi.md).

Unit tests are in `packages/bijou-gpu/src/canvas2d-presenter.test.ts`. They run against
`RecordingCanvas` in `packages/bijou-gpu/test/canvas2d-support.ts`, a software canvas that keeps
real opaque pixels and records every `createImageData`, `putImageData` and `getImageData` call.
Browser tests are in `packages/bijou-gpu/e2e/canvas2d.e2e.ts` and run in Chrome. Run them with:

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

Every row is implemented.

"The oracle" is `renderReferenceRgba()` with the same surface, atlas bytes, slot map, theme
defaults and canvas size. "The goldens" are the frame digests in
`fixtures/bijou-gpu/width1-conformance-suite.json`.

## Presenter contract

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-01 | Factory and interface shape | Type assertions against `GpuSurfacePresenterFactory` and `GpuSurfacePresenter`; a `GlyphAtlas` is accepted as the atlas | `is a synchronous GpuSurfacePresenterFactory and implements every GpuSurfacePresenter member` |
| BG-C2D-02 | Zero WebGL or WebGPU usage | Only `getContext('2d')` is requested; neither module's source names a GPU API | `asks the canvas for a 2d context only and names no WebGL or WebGPU API in its source` |
| BG-C2D-03 | No 2D context | `BackendUnavailableError` for `canvas2d`, never a `RendererFaultError` | `refuses with BackendUnavailableError when the canvas has no 2d context` |
| BG-C2D-04 | Dispose | Listeners removed; present throws `RendererFaultError`; receipt `null`; idempotent | `throws RendererFaultError when presenting after dispose, and dispose removes its listeners` |
| BG-C2D-05 | 0-based hit-test | The kit's shared `cellFromPoint` over the canvas grid capacity, including the letterbox and out-of-canvas clamps | `hit-tests with the shared zero-based cellFromPoint law over the canvas grid capacity` |

## Golden frames and pixel probes

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-06 | Paint frame, first present | Canvas bytes equal the oracle; frame and prepared-buffer digests equal the goldens; `assertBitExactFrameHash` | `presents the paint frame bit-exactly to the oracle and the suite golden frame digest` |
| BG-C2D-07 | Paint → erase, incremental | Erase golden; blitted area is exactly the cells whose prepared words changed, in whole-cell rects | `presents paint -> erase repainting only the union-damaged cells, bit-exactly to the erase golden` |
| BG-C2D-08 | Paint → erase in a real canvas: backgrounds, modifiers, underlines, opacity, atlas glyphs, procedural glyphs and erasure | Every pixel of every labelled cell, then the whole `getImageData` readback, equals the oracle computed in Node; digests equal the goldens and the oracle run in the browser | `presents the paint -> erase fixture bit-exactly to the CPU oracle, cell by cell and by frame hash` |
| BG-C2D-09 | Erasure in a real canvas | Erased cells match the erase oracle, and most of them differed in the paint frame | `erased cells come back as the oracle erase frame, not as leftovers of the paint frame` |
| BG-C2D-10 | Browser-rasterized glyphs | A live `GlyphAtlas` with the browser rasterizer; oracle on `atlas.bitmap` and `atlas.toSlotMap()` | `presents glyphs the browser rasterized into a live GlyphAtlas bit-exactly against the oracle on the same atlas bytes` |

## Receipt

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-11 | Receipt validates | `parseEndpointReceipt` over the canonical JSON; profile `geordi-canvas2d/1`; `software-probed`; null shader digests; probes equal oracle pixels | `emits a receipt that passes the endpoint receipt validator with profile geordi-canvas2d/1 and software-probed evidence` |
| BG-C2D-12 | Host probe points | Probes equal oracle pixels; a point outside the canvas is refused | `samples host-chosen probe points and refuses one outside the canvas` |
| BG-C2D-13 | No frame yet | `null` | `returns null before the first frame` |
| BG-C2D-14 | Executed artifact pin | Digest of `canvas2DExecutedArtifactSource()`; host digest overrides; a malformed one is refused | `pins executedArtifactSha256 to the source text of the executed pixel functions, or to a host-supplied digest` |
| BG-C2D-15 | Input binding | Host digest kept; otherwise `liveInputSha256` of the input as it was during `present`, after the caller reuses its buffers | `binds inputReceiptSha256 to the host-supplied digest, or to a copy of the live input taken during present` |
| BG-C2D-16 | Browser named | `adapter.driver` is the page's `navigator.userAgent` and names Chrome | `records the browser that produced the pixels in the receipt` |

## Draw operations

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-17 | Single-cell update on 80 × 24 | Exactly one `8 × 16` `putImageData` at the cell; canvas equals the oracle | `issues one cell-sized putImageData for a single-cell update on an 80x24 grid` |
| BG-C2D-18 | Run batching | Hand-written rects: one per horizontal run of changed cells | `batches horizontally contiguous changed cells in a row into one putImageData` |
| BG-C2D-19 | Nothing changed | No draw call | `issues no draw operation when nothing changed` |

## Edges

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-20 | Empty `0 × 0` surface | Solid `defaultBg`; receipt validates; hit-test `null` | `presents an empty 0x0 surface as solid defaultBg with a valid receipt` |
| BG-C2D-21 | Repeated partial-opacity cell (alpha accumulation) | After 21 alternating repaints, some forced in full, the frame equals one clean paint | `does not accumulate alpha when a partial-opacity cell is repainted over itself` (unit and browser) |
| BG-C2D-22 | DPR resize invalidation | Canvas resized; one reallocation; one whole-canvas blit; oracle at the new size; `devicePixelContentBox` wins; an unchanged size forces nothing | `invalidates on a DPR resize: resizes the canvas, reallocates once, and redraws the whole frame`; in Chrome: `redraws the whole frame bit-exactly after a DPR resize` |
| BG-C2D-23 | Host resize ingress | Non-finite, non-positive and non-integer inputs refused | `rejects non-finite or non-positive host resize input` |
| BG-C2D-24 | Atlas reset | One whole-canvas blit; oracle on the new generation's bytes | `redraws the whole grid after an atlas reset, bit-exactly against the new atlas bytes` |
| BG-C2D-25 | Context restoration | One whole-canvas blit from the retained frame without a present | `repaints the retained frame when a lost 2D context is restored, without a new present` |
| BG-C2D-26 | Grid larger than the canvas | Refused; the previous receipt is dropped; full redraw after the canvas grows | `refuses a grid larger than the canvas, drops the last receipt, and redraws fully once it fits` |

## Bundled procedural table

[flyingrobots/geordi#205](https://github.com/flyingrobots/geordi/issues/205). Tests are in
`packages/bijou-gpu/src/procedural-glyphs-bundled.test.ts`, `scripts/bijou-gpu-shader-sources.test.mjs`
and the packed-package smoke test `scripts/smoke-bijou-gpu-packed-package.mjs`.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-28 | No `proceduralTable` argument | Paint and erase frame digests equal the goldens, and the serialized receipts equal those of a presenter given the fixture table; in Chrome the existing paint -> erase tests run on the bundled table | `renders from only a canvas and an atlas, hashing to the suite goldens with the same receipts`; in Chrome: `presents the paint -> erase fixture bit-exactly to the CPU oracle, cell by cell and by frame hash` |
| BG-C2D-29 | Altered supplied table | `GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE` at the first differing word; no context requested | `refuses a supplied table that is not the pinned one before it asks for a context` |
| BG-C2D-30 | Bundled table is the pinned fixture | Text equals the fixture and hashes to `PROCEDURAL_GLYPH_TABLE_SHA256`; the published JSON copy equals it; decoded once to 128 and 32 words | `embeds the fixture byte for byte, at the digest the ABI pins`, `ships a published JSON copy equal to the fixture`, `loads to 128 box and 32 block words, once` |
| BG-C2D-31 | Text decoding and verification | Text off the pin (extra byte, CRLF) is refused; a table with one flipped word is refused | `decodes text only at the pinned digest`, `verifies a supplied table against the pin and refuses an altered one` |
| BG-C2D-32 | Drift gate | `--check` reports a drifted or missing published copy and writes nothing; an edited or CRLF fixture and a stale `PROCEDURAL_GLYPH_TABLE_SHA256` are refused; `--write` restores | `--check reports a drifted published table copy and a missing one, writes nothing, and --write restores it`, `refuses an edited or CRLF-converted table fixture, and a stale PROCEDURAL_GLYPH_TABLE_SHA256, writing nothing` |
| BG-C2D-33 | From the packed tarball alone | The tarball holds `procedural/procedural-glyphs.json`; a scratch consumer resolves `./procedural-glyphs.json` and `./procedural-glyphs` by package name, gets the pinned digest, builds the presenter with no table and refuses an altered one | `node scripts/smoke-bijou-gpu-packed-package.mjs` (`procedural-table`, `canvas2d-presenter` and `canvas2d-presenter-refusal` lines) |

## Fuzz and stress

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-C2D-27 | 500 alternating single-cell paint/erase updates with random glyphs, colours, opacity and flags on a letterboxed 40 × 12 grid | At most two `putImageData` calls and two cells of area per present; no allocation; listener count and context requests unchanged; oracle digest every 50 steps and at the end | `keeps draw calls bounded and leaks nothing over 500 single-cell paint/erase updates` |

## Not covered

- Browsers other than Chrome. Pixels were checked locally in Chrome 158; CI runs the same suite
  through the package's Playwright config (`channel: 'chrome'`).
- A real `contextlost` / `contextrestored` cycle. Chrome does not expose a way to trigger one, so
  restoration is tested on the recording canvas only.
- Timing, memory, and very large grids.
- Whole-bundle pinning of `executedArtifactSha256`. The default digest covers the listed
  functions' source text, not their unexported helpers.
