# Bijou GPU WebGPU Presenter Test Plan

Contract ledger for [`bijou-gpu-webgpu-presenter.md`](./bijou-gpu-webgpu-presenter.md). Each row
names a requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175)
and sections 4 to 6 of the [design record](./design/2026-11-bijou-surface-gpu-abi.md). Where the
issue and the design record differ, the design record wins: the atlas is an `rgba8uint` texture,
not `rgba8unorm`.

Unit tests are in `packages/bijou-gpu/src/webgpu-presenter.test.ts`. They drive the presenter
through `packages/bijou-gpu/test/fake-webgpu.ts`, a recording fake of the WebGPU slice whose
textures keep their bytes and which records a validation error, routed to the innermost matching
error scope, for every call WebGPU would reject. Browser tests are in
`packages/bijou-gpu/e2e/webgpu-presenter.e2e.ts`.

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

Every row is implemented.

## Evidence kinds

Refusal evidence and rendering evidence are kept apart. Rows BG-WGPU-36 to BG-WGPU-40 are
positive rendering evidence: they pass only when a WebGPU adapter executed the shader, and a host
that refuses WebGPU skips them (or fails them under `GEORDI_BIJOU_GPU_REQUIRE_WEBGPU=1`). Row
BG-WGPU-41 is refusal evidence only and never closes a rendering claim.

## Shader identity

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-01 | The canonical WGSL loaded verbatim | SHA-256 of the file equals the manifest's `assembledWgslSha256`, found independently in the manifest text; bindings `0, 1, 2` in group `0`; the uniform offsets of the shader reference | `accepts the canonical assembled WGSL verbatim and reads the manifest layout` |
| BG-WGPU-02 | One extra byte, or a manifest without the shader | `RendererFaultError` | `refuses shader text that is not byte-identical to the pinned artifact` |
| BG-WGPU-03 | Executed-artifact digest | Independent framing of both WGSL texts | `pins every executed WGSL text in executedArtifactSha256` |

## Refusal versus fault

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-04 | No `navigator.gpu` | `BackendUnavailableError`, not `RendererFaultError`; code and backend | `throws BackendUnavailableError, never RendererFaultError, when navigator.gpu is absent` |
| BG-WGPU-05 | `requestAdapter()` null or rejected; `requestDevice()` rejected | `BackendUnavailableError` | `throws BackendUnavailableError when %s` (3 cases) |
| BG-WGPU-06 | Canvas without a `webgpu` context | `BackendUnavailableError`; the device is destroyed | `throws BackendUnavailableError and releases the device when the canvas has no webgpu context` |
| BG-WGPU-07 | No adapter and a broken shader | The refusal wins | `checks capability before the shader, so a refusal is never hidden behind a fault` |
| BG-WGPU-08 | Tampered WGSL, compile errors in either shader, a rejected pipeline, a scoped validation error, an `-srgb` preferred format | `RendererFaultError`, not `BackendUnavailableError`; the device is destroyed | `throws RendererFaultError, never BackendUnavailableError, on %s` (6 cases) |

## Canvas format

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-09 | Format selection | `bgra8unorm` and `rgba8unorm` kept; both `-srgb` formats refused | `keeps normalized non-sRGB formats and refuses -srgb ones (double-gamma shift)` |
| BG-WGPU-10 | Canvas configuration and pipeline targets | Canvas configured with the preferred format; canonical target `rgba8uint`, display target the canvas format | `configures the canvas with the preferred non-sRGB format and draws the display pass into it` |

## Dirty-row uploads

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-11 | Upload plan | Hand-written writes: origin, size, offset, tight `bytesPerRow` | `plans one tight full-width write per dirty row span, straight from the staging buffer` |
| BG-WGPU-12 | First frame, then paint -> erase | One whole-grid write; then exactly the row spans a separately driven `packSurfaceDamage()` reports; the bytes left in the fake cell texture equal the oracle's prepared cells for paint and then erase | `uploads the whole grid on the first frame and only the dirty spans of paint -> erase` |
| BG-WGPU-13 | A frame that changes no cell | No cell write; both passes still drawn | `writes nothing to the cells texture when a frame changes no cell` |
| BG-WGPU-14 | `ctx.forceFullRefresh` | One whole-grid write | `honours forceFullRefresh from the present context` |
| BG-WGPU-15 | Uniform buffer | Hand-written 16 words at the manifest offsets | `writes uniforms at the manifest offsets` |

## Atlas uploads

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-16 | Atlas upload plan | Whole bitmap; clipped rectangles; a rectangle outside the bitmap dropped | `plans a full upload or clipped dirty rectangles` |
| BG-WGPU-17 | Dirty rectangles, then an atlas reset | First frame uploads the whole atlas (bytes equal the pack); a dirty rectangle uploads only itself; a generation change re-uploads the whole atlas and the whole grid; the receipt carries the new generation | `uploads dirty rectangles incrementally and the whole atlas again after an atlas reset` |

## Receipts

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-18 | Receipt after `present()` | `null` before; validator accepts; `unit-upload`, no frame digest, no probes; shader digests from the manifest; prepared-buffer digest of the oracle | `records a validated unit-upload receipt with the manifest digest after present()` |
| BG-WGPU-19 | Adapter classification | Metal is `gpu-probed`; SwiftShader, llvmpipe, a fallback adapter and an unnamed adapter are `software-probed` | `classifies adapter %o as %s` (5 cases) |
| BG-WGPU-20 | Refusal receipt | Validator accepts; `capability-refused`, no frame digest, no probes, empty adapter name; manifest digest; oracle prepared-buffer digest | `records a refusal as capability-refused evidence with no frame digest and no probes` |
| BG-WGPU-21 | A fault offered as a refusal | `RendererFaultError` | `cannot be built from a renderer fault` |

## Readback

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-22 | Padding strip | Hand-written padded rows; `alignedBytesPerRow` of 268 and 256 bytes; a stride too small for the row is a fault | `strips 256-byte copy padding into tight top-left RGBA8` |
| BG-WGPU-23 | `captureFrame()` on a filled target | Copy from the `rgba8uint` target at `bytesPerRow` 512 for 67 px; tight bytes equal the target; `gpu-probed` receipt with the frame digest and probe values | `copies the rgba8uint target with an aligned stride and records a probed receipt` |
| BG-WGPU-24 | Software adapter | `software-probed` | `records software-probed evidence for a software adapter` |
| BG-WGPU-25 | Capture before a frame; a copy that raises a validation error | `RendererFaultError` | `refuses to capture before a frame is drawn`; `turns a readback validation error into RendererFaultError` |

## Device loss

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-26 | Loss, a present during recovery, recovery | Status `recovering`; no new device until the adapter request is released; the new device receives one whole-grid write whose bytes equal the oracle's erase cells, the whole atlas, and both draws, with no new present; `deviceGeneration` 2; the next present is a full refresh; no validation errors | `re-uploads the retained staging buffer to a new device without a new present` |
| BG-WGPU-27 | No adapter comes back | Status `faulted`; `present()` throws `BackendUnavailableError` | `faults with BackendUnavailableError when no adapter comes back` |
| BG-WGPU-28 | Loss caused by `dispose()` | No second device; canvas unconfigured; `present()` throws `RendererFaultError` | `does not recover a device it destroyed in dispose()` |

## Resize and geometry

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-29 | Zero, negative, NaN sizes and a zero device-pixel box | `BijouGpuValidationError`; canvas unchanged | `refuses a zero-size or non-finite resize %o and keeps the canvas` (5 cases) |
| BG-WGPU-30 | A grid larger than the canvas | `BijouGpuValidationError`; no receipt | `refuses a grid that does not fit the canvas` |
| BG-WGPU-31 | A `0 × 0` grid | A `1 × 1` cell texture, no cell write, `gridCells` zero, no validation error | `draws only defaultBg for an empty grid without creating a zero-size texture` |
| BG-WGPU-32 | Canvas grows with a DPR change | Canvas and canonical target `100 × 140`; both bind groups rebuilt; redraw into the new target; receipt geometry; the next present is a full refresh | `reallocates the canonical target and redraws when the canvas grows` |
| BG-WGPU-33 | Grid dimensions change | New `12 × 9` cell texture, the old one destroyed, a new bind group | `reallocates the cell texture and bind group when the grid dimensions change` |
| BG-WGPU-34 | `cellFromPoint` | 0-based cells, clamping, `null` for NaN and a zero-width rectangle | `hit-tests 0-based cells through the shared host-boundary law` |
| BG-WGPU-35 | 120 seeded random resizes and grid sizes | Every readback stride a multiple of 256 within 256 bytes of the row; tight length; every write's stride equals its texture row; receipts valid; zero validation errors | `keep every write and readback stride valid with zero validation errors` |

## Browser probes

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-WGPU-36 | Deterministic-atlas paint -> erase on a real adapter | `assertBitExactFrameHash` against `renderReferenceRgba()` in the page; zero differing pixels; frame, prepared-buffer and input digests equal the suite goldens; every probe equals the oracle pixel; receipt valid, evidence level and adapter name from `classifyWebGpuAdapter`; manifest digest | `deterministic-atlas paint -> erase reads back bit-exactly equal to renderReferenceRgba` |
| BG-WGPU-37 | Procedural-only paint -> erase on an empty one-slot atlas | The same bit-exact checks; no atlas slots used | `procedural-only paint -> erase with an empty atlas reads back bit-exactly` |
| BG-WGPU-38 | Display pass | Preferred format `bgra8unorm` or `rgba8unorm`; the canvas bytes equal the canonical frame in every pixel, while more than 1000 pixels per frame would change under an sRGB encode | `the display pass writes the canonical bytes to a non-sRGB canvas with no double-gamma shift` |
| BG-WGPU-39 | 24 seeded resizes with random grid sizes | Every frame hashes equal to the oracle at that canvas size; strides aligned; status `ready`, no fault | `a randomized resize sequence stays bit-exact with 256-byte aligned readback and no WebGPU errors` |
| BG-WGPU-40 | A real WGSL compile error behind a manifest that pins the broken text | `RendererFaultError` with `GEORDI_E_BIJOU_RENDERER_FAULT` | `a WGSL compile error from the real device is a RendererFaultError, not a refusal` |
| BG-WGPU-41 | `navigator.gpu` removed | Refused with reason `navigator.gpu is undefined`; valid `capability-refused` receipt with no pixels and the suite digests | `a browser without navigator.gpu refuses with a validated capability-refused receipt and no pixels` |

## Not covered

- Positive browser evidence is from Chrome on one Mac: Apple Metal, and SwiftShader forced with
  `--use-webgpu-adapter=swiftshader`. Hosted CI skips the positive browser tests as
  `capability-refused`; see the browser probe section of the reference page.
- Device loss is simulated with the fake. A real lost GPU, for example after a driver reset, is
  not tested.
- `resize()` with an exact `devicePixelContentBox` is tested only with the fake.
- No timing has been measured.
