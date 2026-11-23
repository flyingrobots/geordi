# Bijou GPU WebGL2 Presenter Test Plan

Contract ledger for [`bijou-gpu-webgl2-presenter.md`](./bijou-gpu-webgl2-presenter.md). Each row
names a requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from
[flyingrobots/geordi#173](https://github.com/flyingrobots/geordi/issues/173),
[flyingrobots/geordi#185](https://github.com/flyingrobots/geordi/issues/185) (shader source port)
and sections 4 to 6
of the [design record](./design/2026-11-bijou-surface-gpu-abi.md).

Test files are under `packages/bijou-gpu/`. Run them with:

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

Every row is implemented.

Unit tests (`src/webgl2-presenter.test.ts`, `src/presenter-atlas.test.ts`) drive a recording fake
WebGL2 context, `test/webgl2-fake.ts`: they prove calls, uploads, refusals and receipts, never
pixels. Browser tests (`e2e/webgl2-presenter.e2e.ts`) render in Chrome through
`harness/webgl2.html`, whose presenters take no shader argument and so run the bundled adapter,
and compare with `renderReferenceRgba()` at zero tolerance.

## Evidence levels

Every browser test records the renderer that drew its pixels as a Playwright `evidence`
annotation. A pass is evidence only at the level it names.

| Where | Renderer | Level |
| --- | --- | --- |
| CI (`ubuntu-24.04`, headless Chrome, no GPU) | SwiftShader is expected; the level is computed from the renderer string the run reports, not assumed | `software-probed` |
| A local run, 2026-11-22, headless Chrome on macOS | `ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)` | `gpu-probed` |
| The same machine, Chrome launched with `--use-angle=swiftshader` | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)` | `software-probed` |

All twelve browser tests passed in both local runs. Both renderers reported
`RGBA_INTEGER` / `UNSIGNED_BYTE` as their implementation read pair, so the
`rgba-integer-unsigned-int` readback path ran only against the fake context.

## Shader identity

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-01 | Pin equals the manifest | Every digest, stage file, uniform offset and sampler name of the checked-in `bijou-shaders.manifest.json`, and the SHA-256 of the files on disk | `pins exactly the checked-in naga-generated GLSL ES 3.00 stages, digests and binding map of the manifest` |
| BG-WEBGL2-02 | Generated GLSL compiled unmodified | The exact file text, from the bundled adapter, reaches `shaderSource`; the only other stage is the display stage | `compiles the bundled generated GLSL text unmodified, with zero hand-edited forks` |
| BG-WEBGL2-03 | Edited GLSL refused | An extra byte, an edited token or CRLF line endings from a port: `RendererFaultError` naming SHA-256, no GL object created | `refuses GLSL whose bytes differ from the manifest pin with a RendererFaultError, before touching GL` |
| BG-WEBGL2-36 | Port missing a stage | A port without the vertex or fragment stage: `RendererFaultError` `has no bijou-surface.(vert\|frag).glsl`, no GL object created | `refuses a shader source that is missing a stage with a RendererFaultError, before touching GL` |
| BG-WEBGL2-37 | No shader argument | `createWebGL2SurfacePresenter({ canvas, atlas })` presents; the receipt's `assembledWgslSha256`, `generatedGlslSha256`, `shaderSha256` equal the manifest and `executedArtifactSha256` equals the digest over the files on disk | `creates a presenter with only a canvas and an atlas, and its receipt reports the manifest digests` |
| BG-WEBGL2-38 | Any port | The core over `createFileShaderSource()` compiles the same texts as the default wiring | `takes any ShaderSourcePort: the core over the file adapter compiles the same bytes as the default` |
| BG-WEBGL2-39 | Core boundary | The import graph of `webgl2-presenter.ts` reaches no `node:` module, no `?raw` specifier, no generated module and no adapter; the browser harness imports no shader file | `src/shader-source.test.ts`: `the core module %s reaches no node: module, no ?raw specifier and no embedded shader text`, `the browser harness %s imports no shader file from the repository` |
| BG-WEBGL2-04 | Enum table | Every `WEBGL2_ENUMS` value equals the live context's constant | Chrome: `pins WebGL2 enums that equal the live context and creates the canonical context` |

## Capability refusal and faults

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-05 | No `webgl2` context | `BackendUnavailableError`, backend `webgl2`, not a `RendererFaultError` | `throws BackendUnavailableError, never a fault, when the canvas has no webgl2 context`; Chrome, on a canvas that already holds a 2D context: `refuses with BackendUnavailableError, not a fault, when the canvas has no webgl2 context` |
| BG-WEBGL2-06 | Context lost at creation | `BackendUnavailableError` | `throws BackendUnavailableError when the context is already lost at creation` |
| BG-WEBGL2-07 | Compile, link, binding or framebuffer failure | `RendererFaultError`, never `BackendUnavailableError` | `throws RendererFaultError, never a capability refusal, on a shader compile or link failure` |
| BG-WEBGL2-08 | GL error after a frame | `RendererFaultError` naming the error | `turns a GL error after a frame into a RendererFaultError instead of masking it` |
| BG-WEBGL2-09 | Clamped drawing buffer | `DrawingBufferMismatchError` `GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH`, no draw | `fails loudly with GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH when the browser clamps the drawing buffer` |
| BG-WEBGL2-10 | Canvas smaller than the grid | `GEORDI_E_BIJOU_INVALID_SURFACE` | `refuses a canvas smaller than the grid instead of emitting an invalid receipt` |

## Context, textures and uploads

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-11 | Context attributes | `alpha`, `antialias`, `premultipliedAlpha` false, `preserveDrawingBuffer` true, `drawingBufferColorSpace` `srgb` | `requests the exact canonical context attributes and an sRGB drawing buffer`; Chrome, from `getContextAttributes()`: `pins WebGL2 enums that equal the live context and creates the canonical context` |
| BG-WEBGL2-12 | Integer textures complete | `RGBA32UI` cells, `RGBA8UI` atlas and target, one level, `NEAREST` min and mag filters on every texture | `allocates an RGBA32UI cell texture and an RGBA8UI atlas texture with NEAREST filters and no mipmaps` |
| BG-WEBGL2-13 | One fullscreen triangle | `drawArrays(TRIANGLES, 0, 3)` for the canonical frame, once more for the display pass; `DITHER` disabled | `draws one fullscreen triangle for the canonical frame and one for the display pass` |
| BG-WEBGL2-14 | Dirty row spans only | Whole buffer on frame 1; one `texSubImage2D` per disjoint span at word offset `minRow * width * 4`; none when nothing changed | `uploads the whole staging buffer on the first frame and only the dirty row spans after it` |
| BG-WEBGL2-15 | Full re-upload triggers | Whole buffer on `forceFullRefresh`; new texture and whole buffer on a grid resize | `re-uploads the whole staging buffer on forceFullRefresh and on a grid resize` |
| BG-WEBGL2-16 | Atlas sub-rects and reset | Only the new slot's rectangle with `UNPACK_ROW_LENGTH`; whole atlas and grid after an overflow reset; row length reset before cell uploads | `uploads atlas dirty sub-rects with texSubImage2D and re-uploads everything after an atlas reset` |
| BG-WEBGL2-17 | Atlas reset in Chrome | A manual `invalidate()` with an unchanged surface: `atlas-generation` full refresh, one whole-atlas and one whole-grid upload, frame bit-exact before and after | Chrome: `an atlas reset re-uploads the whole atlas and grid and still matches the oracle` |

## Pixels

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-18 | Paint -> erase | Suite golden `frameRgbaSha256` for both frames from canonical `RGBA8UI` readback and from `readPixels(RGBA, UNSIGNED_BYTE)` of the display; `assertBitExactFrameHash` passes; every pixel of every labelled suite cell (flags, underlines, procedural glyphs, default-colour fallbacks) equals the Node oracle; the erase frame takes the incremental path | Chrome: `renders the paint -> erase fixture bit-exactly against renderReferenceRgba through canonical and display readback` |
| BG-WEBGL2-19 | Letterbox at fractional DPR | Canvas `Math.round(css * dpr)` at DPR 1.25 and 1.5; frame equals the oracle at that canvas size, whose remainder is solid `defaultBg`; shrinking the grid to 3 x 2 clears the rest | Chrome: `clears letterboxed remainder pixels to defaultBg at fractional DPR 1.25`, `clears letterboxed remainder pixels to defaultBg at fractional DPR 1.5` |
| BG-WEBGL2-20 | DPR 2 frame | With a 2x nearest-upscaled test atlas (16 x 32 cells) the frame equals the oracle at 134 x 234 | Chrome: `hit-tests real pointer events with cellFromPoint at DPR 2` |

## Receipts

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-21 | Unprobed receipt | `null` before frame 1; then `validateEndpointReceipt` accepts it; profile, shader digests, executed artifact, prepared buffer, atlas stats and generation, geometry; `unit-upload` with no frame digest and no readback | `returns null before the first frame and a schema-valid unit-upload receipt pinning shader, atlas and profile after it` |
| BG-WEBGL2-22 | Evidence label | SwiftShader, llvmpipe and a masked renderer give `software-probed`; a named hardware renderer gives `gpu-probed` | `labels canonical readback software-probed on SwiftShader and gpu-probed only on a named hardware renderer` |
| BG-WEBGL2-23 | Readback call | One `readPixels(0, 0, w, h, RGBA_INTEGER, type)` with the implementation's read type, rows flipped, digest equal to the receipt's | `reads the canonical RGBA8UI target back with RGBA_INTEGER and the implementation read type, flipping rows to top-left` |
| BG-WEBGL2-24 | Receipts in Chrome | Every probed frame of the browser suite validates and carries the evidence level of its renderer; the paint and erase receipts carry the suite `inputReceiptSha256` and `preparedBufferSha256` | Chrome: `renders the paint -> erase fixture bit-exactly against renderReferenceRgba through canonical and display readback` |

## Resize and hit-testing

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-25 | `cellFromPoint` | Zero-based cells at DPR 1 and 2, clamped, `null` before a grid and for `NaN` | `maps client points to 0-based cells at DPR 1 and DPR 2, and returns null before any grid` |
| BG-WEBGL2-26 | Real pointer events | `pointerdown` client coordinates map to the expected cells at DPR 1 and 2, including the letterboxed remainder | Chrome: `hit-tests real pointer events with cellFromPoint at DPR 1`, `hit-tests real pointer events with cellFromPoint at DPR 2` |
| BG-WEBGL2-27 | Resize input | `devicePixelContentBox` wins; non-finite or non-positive input refused | `sizes the drawing buffer from devicePixelContentBox when given and rejects non-finite input` |
| BG-WEBGL2-28 | Redraw on resize | Both passes redrawn with a whole-buffer upload; receipt has the new canvas size and DPR | `redraws the retained frame after a resize and records the new DPR in the receipt` |

## Context loss and dispose

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-29 | Loss and restore | `preventDefault()` on loss; packing continues and nothing is drawn while lost; restore rebuilds both programs, uploads the whole staging buffer and atlas, and redraws | `prevents the default on webglcontextlost, keeps packing while lost, and restores the full surface from the retained staging buffer` |
| BG-WEBGL2-30 | `WEBGL_lose_context` in Chrome | After lose -> restore the frame equals the paint golden; presenting the erase frame while lost restores to the erase golden; one whole-buffer upload | Chrome: `recovers the full surface from the retained staging buffer after WEBGL_lose_context lose -> restore`, `recovers the full surface from the retained staging buffer after WEBGL_lose_context lose -> restore, presenting while lost` |
| BG-WEBGL2-31 | Dispose | Every object created after the last restore is deleted, both listeners removed, later frames refused, second call a no-op | `deletes every GL object it created, removes its listeners, and refuses later frames`; `deletes every object of a presenter that never lost its context` |

## Diagnostics and stress

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WEBGL2-32 | Overlay | Only the display pass redraws; receipt unchanged; diagnostics report atlas stats and generation | `toggles a dirty-row tint in the display pass only, without touching the canonical frame or its receipt` |
| BG-WEBGL2-33 | Overlay in Chrome | Canonical digest unchanged; display tinted in the one uploaded row only; off restores the oracle frame | Chrome: `the diagnostic overlay tints only the uploaded rows of the display pass and never the canonical frame` |
| BG-WEBGL2-34 | 120 animated frames at 160 x 48 | 120 presents, `gl.getError()` zero after each, every receipt valid, last frame bit-exact against the oracle | Chrome: `presents 120 consecutive animated frames at 160 x 48 with zero GL errors and valid receipts` |
| BG-WEBGL2-35 | Static atlas source | One generation, no dirty rects, receipt assets counted from the slot map; empty identity and bad bitmap refused | `serves a fixed bitmap and slot map with one generation, no dirty rects, and receipt assets counted from the slot map`; `refuses an empty font identity and a malformed bitmap` |

## Not covered

- Browsers other than Chrome.
- A real GPU driver that clamps the drawing buffer; BG-WEBGL2-09 uses the fake context.
- A context lost in the middle of a frame rather than between frames.
- Frame time. The stress test records its duration as an annotation and asserts nothing about it.
