# Bijou GPU WebGPU Presenter Reference

**Package**: `@flyingrobots/geordi-bijou-gpu` (`packages/bijou-gpu`)
**Modules**: `src/webgpu-presenter.ts` (presenter), `src/webgpu-types.ts` (structural WebGPU
slice), `src/presenter-host.ts` (host helpers shared by every presenter)
**ABI**: `bijou-surface-gpu/1`
**Receipt**: `geordi-bijou-gpu-receipt/1`, `backendProfile` `geordi-webgpu/1`
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md), sections 4 to 6
**Evidence ledger**: [`bijou-gpu-webgpu-presenter-test-plan.md`](./bijou-gpu-webgpu-presenter-test-plan.md)

This page describes the browser WebGPU presenter on `main`. It implements the shared
[`GpuSurfacePresenter` contract](./bijou-gpu-conformance-kit.md#presenter-contract) by running
the canonical [`bijou-surface.wgsl`](./bijou-gpu-shaders.md) verbatim, with cell records from the
[dirty-union packer](./bijou-gpu-surface-damage.md) and atlas texels from a
[`GlyphAtlas`](./bijou-gpu-glyph-atlas.md) or a fixed atlas such as the test glyph pack. The
design record is normative for every equation; this page says how the presenter applies them.

> **Not claimed.** Positive rendering evidence comes from Chrome only: Apple Metal on a developer
> Mac (`gpu-probed`) and, in CI, SwiftShader (`software-probed`). No other browser, operating
> system, or GPU vendor has been tested. Device loss is tested against a fake device, not a real
> lost GPU. No timing has been measured.

## Creating a presenter

```ts
const presenter = await createWebGPUSurfacePresenter(canvas, {
  shader: { wgsl, manifest },
  atlas,
  defaultFg: '#E6EDF3',
  defaultBg: '#0D1117',
  size: { cssWidth, cssHeight, dpr },
});
```

| Option | Meaning |
| --- | --- |
| `shader.wgsl` | The exact text of `packages/bijou-gpu/shaders/bijou-surface.wgsl`. The npm package does not publish that directory; a host loads the file itself, for example with a Vite `?raw` import. |
| `shader.manifest` | The parsed `packages/bijou-gpu/shaders/bijou-shaders.manifest.json`. The presenter reads the binding numbers, the uniform byte size and every uniform byte offset from it, and checks the WGSL against its `assembledWgslSha256`. |
| `atlas` | A `PresenterAtlasSource`. A `GlyphAtlas` is one as is; `staticAtlasSource(createTestGlyphPack())` adapts a fixed bitmap. The presenter owns its dirty rectangles: it calls `takeDirtyRects()` on every draw. Cell metrics come from `atlas.bitmap`. |
| `gpu` | Defaults to `globalThis.navigator.gpu`. |
| `defaultFg`, `defaultBg` | Uppercase `#RRGGBB`. Default to `REFERENCE_DEFAULT_FG` and `REFERENCE_DEFAULT_BG`. |
| `size` | Initial host size. Without it the canvas keeps its pixel size. |
| `clientRect` | Client rectangle for `cellFromPoint`. Defaults to `canvas.getBoundingClientRect()`. |
| `powerPreference` | Passed to `requestAdapter()`. |

`canvas` is an `HTMLCanvasElement` or an `OffscreenCanvas`. The factory returns a promise, as the
`GpuSurfacePresenterFactory` contract allows.

### Refusal versus fault

The factory checks capability first, then everything else.

| Condition | Error |
| --- | --- |
| `navigator.gpu` is undefined | `BackendUnavailableError` |
| `requestAdapter()` returns `null` or rejects | `BackendUnavailableError` |
| `requestDevice()` rejects | `BackendUnavailableError` |
| The canvas has no `webgpu` context | `BackendUnavailableError` |
| The WGSL does not hash to the manifest's `assembledWgslSha256`, or the manifest is malformed | `RendererFaultError` |
| A shader module reports a compilation error | `RendererFaultError` |
| A render pipeline rejects, or a validation, out-of-memory or internal error scope catches an error during creation | `RendererFaultError` |
| The preferred canvas format is not `bgra8unorm` or `rgba8unorm` | `RendererFaultError` |

A refusal is never reported as a fault, and a shader or pipeline bug is never reported as
unavailability. After a refusal, `createWebGpuRefusalReceipt()` records it as
[`capability-refused` evidence](#receipts).

## Frame path

### Upload

`present(current, target, ctx)` is synchronous. It packs the frame with `packSurfaceDamage()`
into the packer's retained staging buffer and then, on the GPU:

1. Writes each dirty row span to the `rgba32uint` cell texture with one `queue.writeTexture`
   per span, reading straight out of the staging buffer: origin `(0, minRow)`, size
   `widthCells × rows`, `offset = minRow * widthCells * 16`, `bytesPerRow = widthCells * 16`.
   A full refresh writes the whole grid in one call.
2. Writes the `rgba8uint` atlas texture: the whole bitmap on the first frame, after an atlas
   generation change, after the bitmap is replaced, or after device recovery; otherwise one
   write per rectangle from `takeDirtyRects()`, clipped to the bitmap.
3. Writes the 64-byte uniform buffer at the manifest's offsets.
4. Encodes two render passes and submits them.

`queue.writeTexture` places no alignment requirement on `bytesPerRow`, so uploads use the tight
stride and copy nothing. The 256-byte rule applies to buffer copies, which the presenter uses only
for readback.

The presenter passes `forceFullRefresh` to the packer on a device pixel ratio change, a cell
metric change, and the first present after device recovery, in addition to `ctx.forceFullRefresh`.
The packer itself rebuilds the grid on the first frame, a grid dimension change, and an atlas
generation change.

The cell texture is `max(1, widthCells) × max(1, heightCells)`, because a texture edge must be at
least 1; a `0 × 0` grid sets `gridCells` to zero and the shader draws only `defaultBg`. When the
grid dimensions change, the cell texture and its bind group are reallocated.

A target grid that does not fit the canvas (`widthCells * cellPxW > canvasPxW`, or the same for
height) is refused with `BijouGpuValidationError` `GEORDI_E_BIJOU_INVALID_SURFACE` before
anything is packed.

### Two passes

| Pass | Shader | Target |
| --- | --- | --- |
| Canonical | `bijou-surface.wgsl`, `vs_main` and `fs_main`, with `BIJOU_FRAG_ORIGIN_BOTTOM_LEFT` left at its default `false` | An `rgba8uint` texture of `canvasPxW × canvasPxH`. This is the canonical frame. |
| Display | `WEBGPU_DISPLAY_WGSL`, owned by the presenter | The canvas, configured with the browser's preferred format, which must be `bgra8unorm` or `rgba8unorm`, and `alphaMode: 'opaque'`. |

The display shader reads the canonical texel under each canvas pixel with `textureLoad` and
writes `(r, g, b, 255) / 255` to the normalized swapchain. Floats appear only there, after the
canonical frame is final. An `-srgb` swapchain would gamma-encode bytes that are already sRGB, so
it is refused.

The bind group layouts declare both textures with `sampleType: 'uint'`. There is no sampler.

### Readback

`captureFrame(options?)` copies the canonical `rgba8uint` texture to a buffer with
`copyTextureToBuffer` at `bytesPerRow = alignedBytesPerRow(canvasPxW * 4)` (the next multiple of
256), maps it, and strips the padding with `stripRowPadding()` into tight top-left row-major RGBA8
of exactly `canvasPxW * canvasPxH * 4` bytes. Its SHA-256 is the receipt's `frameRgbaSha256`.

| Option | Meaning |
| --- | --- |
| `probes` | Physical pixels to record in `probes`. Defaults to the four corners. |
| `inputReceiptSha256` | The SHA-256 of the `packed-bijou-cells/1` receipt the frame came from. Defaults to the SHA-256 of the presented cell bytes, because a live surface has no receipt file. |

It returns `{ rgba, receipt, bytesPerRow }` and makes that receipt the last receipt. It needs a
frame drawn at the current canvas size, and throws `RendererFaultError` otherwise or when the copy
fails.

`captureDisplay()` reads back what the display pass wrote to the canvas texture, swizzling
`bgra8unorm` to RGBA. Call it in the same task as `present()`, before the browser takes the
canvas texture. It exists to check that the display pass adds no gamma curve.

## Receipts

`getLastReceipt()` returns `null` before the first present. Every receipt passes through
`validateEndpointReceipt()` before the presenter returns it.

| Source | `evidenceLevel` | `frameRgbaSha256` | `probes` |
| --- | --- | --- | --- |
| `present()` | `unit-upload` | `null` | empty |
| `captureFrame()` | `gpu-probed` or `software-probed` | SHA-256 of the read-back frame | the requested pixels |
| `createWebGpuRefusalReceipt()` | `capability-refused` | `null` | empty |

A frame that was drawn but not read back proves only that the upload logic ran, so `present()`
claims no more than `unit-upload`.

`classifyWebGpuAdapter()` decides the probed level from `GPUAdapterInfo`. It is `gpu-probed`
only when the adapter names itself (`vendor`, `architecture`, `device` or `description` is not
empty), is not a fallback adapter, and does not name a known software rasterizer (SwiftShader,
llvmpipe, lavapipe, softpipe, WARP, Microsoft Basic Render). Everything else is
`software-probed`. `adapter.name` is the non-empty fields joined by spaces, for example
`apple metal-3`.

Digest fields:

| Field | Value |
| --- | --- |
| `assembledWgslSha256`, `shaderSha256` | The manifest's `assembledWgslSha256`, which the WGSL text was checked against |
| `generatedGlslSha256` | `null` |
| `executedArtifactSha256` | SHA-256 of both executed WGSL texts, framed like the manifest's `generatedGlslSha256`: for `bijou-surface.wgsl` then `geordi-webgpu-display.wgsl`, the name, a line feed, the decimal byte length, a line feed, and the bytes |
| `preparedBufferSha256` | SHA-256 of the little-endian staging buffer |

`createWebGpuRefusalReceipt({ error, shader, atlas, target, size, ... })` takes the
`BackendUnavailableError` itself and refuses anything else with `RendererFaultError`, so a fault
cannot be recorded as a refusal. `adapter.name` is empty because no adapter executed.

## Device loss

When `device.lost` resolves for the current device and the presenter was not disposed:

1. `status` becomes `recovering`. `present()` keeps packing into the staging buffer and touches
   no GPU object.
2. The presenter requests a new adapter and device, rebuilds both pipelines, and reconfigures the
   canvas.
3. It uploads the whole retained staging buffer and the whole atlas to the new device and redraws
   the last frame, without waiting for a new `present()`. `deviceGeneration` increases by one.
4. The next `present()` is a full refresh.

If the staging buffer may mix two frames (the packer's `pendingFullRefresh` is `recovery`), step
3 skips the upload and the next present rebuilds the grid. If no adapter or device comes back,
`status` becomes `faulted` and every later call throws the stored `BackendUnavailableError` or
`RendererFaultError`. `restored()` resolves once no recovery is in progress.

A device the presenter destroyed in `dispose()` is not recovered.

Errors that WebGPU reports asynchronously for a frame (caught by error scopes around each upload
and draw) set `status` to `faulted` with a `RendererFaultError`; the next call throws it.

## Resize and hit-testing

`resize(size)` converts the host size once with `resolvePresenterCanvasPx()`: the exact
`devicePixelContentBox` when given, otherwise `max(1, Math.round(css * dpr))` per edge. A
non-finite or non-positive `cssWidth`, `cssHeight` or `dpr`, or a device-pixel box edge outside
`1..65535`, throws `BijouGpuValidationError` `GEORDI_E_BIJOU_INVALID_SURFACE` and leaves the
canvas unchanged.

When the pixel size changes, the canvas is resized, the canonical target and the display bind
group are reallocated, and the last frame is redrawn from the cells already on the GPU if its
grid still fits.

`cellFromPoint(clientX, clientY)` applies the shared zero-based hit-test `cellFromPoint()` from
`presenter.ts` to the grid capacity of the canvas (`cols = canvasPxW / cellPxW`,
`rows = canvasPxH / cellPxH`). It returns `null` when there is no client rectangle.

`dispose()` destroys every texture and buffer, unconfigures the canvas and destroys the device.
After it, `present()`, `resize()`, `captureFrame()` and `captureDisplay()` throw
`RendererFaultError`, `getLastReceipt()` returns `null`, and a second `dispose()` does nothing.

## Shared host helpers

`src/presenter-host.ts` holds what every presenter needs and no graphics API:

| Export | Meaning |
| --- | --- |
| `resolvePresenterCanvasPx(size)` | Host-boundary canvas size ingress, as above |
| `presenterGridGeometry(canvasPx, cellPxW, cellPxH)` | Grid capacity for `cellFromPoint` |
| `PresenterAtlasSource`, `staticAtlasSource(input)` | The atlas a presenter reads, and an adapter for a fixed bitmap |
| `assemblePresenterReceipt(input)` | Builds a receipt from presenter state and validates it |

## Structural WebGPU slice

The package compiles without DOM typings, so `src/webgpu-types.ts` describes the WebGPU objects
the presenter calls structurally: a subset of each interface's members, with parameter types that
accept at least what WebGPU's do. The real `GPU`, `GPUDevice`, `GPUCanvasContext`,
`HTMLCanvasElement` and `OffscreenCanvas` types satisfy it without a cast; the harness typecheck
asserts that in `packages/bijou-gpu/harness/webgpu-dom-compat.ts`. `getContext('webgpu')` is typed
as returning an object, which `isWebGpuCanvasContext()` checks, because no single structural
signature matches the DOM overload set.

The `GPUBufferUsage`, `GPUTextureUsage`, `GPUShaderStage` and `GPUMapMode` flags the presenter
uses are spec constants in `WEBGPU_BUFFER_USAGE`, `WEBGPU_TEXTURE_USAGE`,
`WEBGPU_SHADER_STAGE_FRAGMENT` and `WEBGPU_MAP_MODE_READ`.

## Browser probe

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

The page `packages/bijou-gpu/harness/webgpu.html` runs the presenter on a real canvas with the
shader and manifest loaded verbatim, and compares every read-back frame with
`renderReferenceRgba()` run in the same page. It publishes `window.__geordiWebGpuProbe`.

The Playwright config launches Chrome with `--enable-unsafe-webgpu --enable-unsafe-swiftshader`,
so a host without a GPU can expose a SwiftShader adapter. Positive tests and the refusal test are
separate:

- On a host that refuses WebGPU, the positive tests are skipped, never passed. Set
  `GEORDI_BIJOU_GPU_REQUIRE_WEBGPU=1` to make that a failure.
- The refusal test removes `navigator.gpu` on purpose and witnesses refusal only.

Set `GEORDI_BIJOU_GPU_WITNESS_DIR=<dir>` to write the adapter and the probed receipts of each
positive run to `<dir>/webgpu-atlas-paint-erase.json` and
`<dir>/webgpu-procedural-paint-erase.json`. The same JSON is attached to the Playwright report.

## Error codes

The presenter reuses the conformance kit's codes, listed in
[`ERROR_CODES.md`](./ERROR_CODES.md#bijou-gpu-conformance-kit-errors):
`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE`, `GEORDI_E_BIJOU_RENDERER_FAULT` and
`GEORDI_E_BIJOU_INVALID_SURFACE`, plus whatever the packer and the receipt validator raise.
