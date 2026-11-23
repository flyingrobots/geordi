# Bijou GPU Native `wgpu` Proof Reference

**Crate**: `geordi-bijou-wgpu-proof` (`crates/geordi-bijou-wgpu-proof`), library and binary
**Endpoint profile**: `geordi-wgpu-offscreen/1`
**ABI**: `bijou-surface-gpu/1`
**Receipt**: `geordi-bijou-gpu-receipt/1`
**Message schemas**: [`schemas/geordi-bijou-wgpu-proof/`](../schemas/geordi-bijou-wgpu-proof/)
**Checked-in receipts**: [`fixtures/bijou-gpu/native-wgpu/`](../fixtures/bijou-gpu/native-wgpu/)
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md)
**Evidence ledger**: [`bijou-gpu-native-wgpu-test-plan.md`](./bijou-gpu-native-wgpu-test-plan.md)

This page describes what is on `main`. The crate is a bounded offscreen proof. It reads one
`packed-bijou-cells/1` file, validates it, prepares the `rgba32uint` cell record, and renders it
with `wgpu` and the canonical `bijou-surface.wgsl` into an `rgba8uint` texture. It then reads the
pixels back and writes an endpoint receipt. The design record is the normative source for the
cell record, the pixel law and the receipt.

> **Not claimed.** The crate opens no window and has no swapchain or display pass. It has no
> `winit`, IME, clipboard or input handling, and no live Bijou host. Cells are produced on the
> CPU only: Bijou writes them and this host presents them. Glyphs come from the conformance
> kit's bundled 8 x 16 test glyph pack, not from a font. A `gpu-probed` result holds for the
> adapter named in the receipt, not for every GPU.

## Pipeline

1. **Intake.** The host reads the pinned glyph pack `fixtures/bijou-gpu/test-glyph-pack.json`
   and refuses any other file by SHA-256. It then validates the input as `packed-bijou-cells/1`.
   The checks cover receipt, format and policy versions, dimensions (`1..9999` cells per edge,
   at most 100,000 cells), the byte array, side-table relationships (at most 4,096 entries),
   colour-presence and modifier rules, scene, focus and chroma. Inputs are at most 16 MiB. The
   glyph policy is closed: `U+0020`, the procedural Box-Drawing, Block Element and Braille ranges,
   or a grapheme of the pinned pack. A width-2 grapheme gives
   `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH`. All of this happens before any `wgpu` call.
2. **Preparation.** Each canonical ten-byte cell becomes four little-endian `u32` lanes, as in
   design record section 2. Atlas graphemes resolve to their `(grapheme, bold)` slot of the
   pack. A missing weight gives `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT`. The prepared buffer's
   SHA-256 is the receipt's `preparedBufferSha256`.
3. **Frame geometry.** The canvas defaults to the grid (`widthCells * 8` by `heightCells * 16`)
   and may only grow (`--canvas`). Pixels outside the grid are the letterbox, which the shader
   fills with the default background. The grid, the atlas and the canvas must each fit in 8,192
   texels per edge (`GEORDI_E_BIJOU_WGPU_RESOURCE_LIMIT`). The host checks this before it
   requests an adapter.
4. **Shader identity.** The host never assembles or edits WGSL. It loads
   `packages/bijou-gpu/shaders/bijou-shaders.manifest.json` and checks four things. The manifest
   must be for `bijou-surface-gpu/1`. Its Bunny pins must equal those of
   `geordi-bijou-shadergen`. The procedural glyph table must hash to the manifest's
   `proceduralTableSha256`. The `bijou-surface` shader must be at
   `packages/bijou-gpu/shaders/bijou-surface.wgsl` and hash to its `assembledWgslSha256`. Any
   difference gives `GEORDI_E_BIJOU_WGPU_SHADER_IDENTITY`. The exact bytes are handed to
   `wgpu`.
5. **Render.** See [Offscreen render](#offscreen-render).
6. **Receipt.** See [Receipt](#receipt).

## Offscreen render

`wgpu` is pinned at exactly `29.0.4`. Its shader compiler is `naga 29.0.4`, the version that
`geordi-bijou-shadergen` validates and translates the same module with. The Metal, Vulkan, DX12
and GLES backends are compiled in.

- The host enumerates every adapter and tries them in this order: discrete GPU, integrated GPU,
  virtual GPU, other, CPU. The first adapter that grants a device with downlevel default limits
  renders the frame. Those limits are raised only as far as the frame's largest texture needs.
- Bindings follow the manifest. `@binding(0)` is the 64-byte `BijouSurfaceUniforms`.
  `@binding(1)` is the `rgba32uint` cell texture of `widthCells x heightCells`. `@binding(2)` is
  the `rgba8uint` atlas. The pipeline has no vertex buffers and draws one fullscreen triangle
  (`vs_main`, `fs_main`).
- The colour target is an `rgba8uint` texture of `canvasPxW x canvasPxH`. It is cleared to
  zero, including alpha, before the draw. A read-back pixel whose alpha is not 255 was not
  written by the shader, and the host treats it as `GEORDI_E_BIJOU_RENDERER_FAULT`.
- `copy_texture_to_buffer` uses a row pitch of `canvasPxW * 4` rounded up to 256 bytes. The host
  strips that padding to tight top-left row-major RGBA8 of exactly `canvasPxW * canvasPxH * 4`
  bytes, which `frameRgbaSha256` hashes.

## Evidence levels

The host classifies a run by the `wgpu` device type of the adapter that rendered it.

| Outcome | `evidenceLevel` | `hardwareGpuClaim` | Pixels |
| --- | --- | --- | --- |
| `DiscreteGpu`, `IntegratedGpu` or `VirtualGpu` adapter rendered | `gpu-probed` | `true` | read back, hashed, probed |
| `Cpu` or `Other` adapter rendered | `software-probed` | `false` | read back, hashed, probed |
| No adapter, no device granted, or `--deny-adapter` | `capability-refused` | `false` | none: `frameRgbaSha256` is `null`, `probes` is `[]` |

A `Cpu` adapter, such as llvmpipe or WARP, is software. A virtual adapter is not treated as
software for being virtual. `Other` is reported as software because nothing shows that it is
hardware. A refusal is a typed outcome (`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE`), not a pass, and
it cannot satisfy `assertBitExactFrameHash`.

No run claims GPU cell production. The `intake` line carries `cellProduction: "cpu-authored"`
and the `result` line carries `gpuCellProductionClaim: false` on every run.

## Receipt

The receipt is a `geordi-bijou-gpu-receipt/1` document with exactly the design record's 28
fields, written with sorted keys, two-space indentation and a final newline. The
`validateEndpointReceipt` function of `@flyingrobots/geordi-bijou-gpu` accepts it.

| Field | Value on this host |
| --- | --- |
| `backendProfile` | `geordi-wgpu-offscreen/1` |
| `adapter` | `backend: "wgpu"`; `name` is the adapter name; `driver` joins the `wgpu` backend, driver and driver info with `"; "`, skipping empty parts. A refusal has empty `name` and `driver`. |
| `assembledWgslSha256`, `shaderSha256`, `executedArtifactSha256` | All three are the SHA-256 of the executed `bijou-surface.wgsl` |
| `generatedGlslSha256` | `null` |
| `inputReceiptSha256` | SHA-256 of the input file bytes |
| `fontIdentity`, `atlasStats`, `atlasGeneration` | From the pinned test glyph pack: `geordi-bijou-gpu-test-glyph-pack/1 sha256:<atlas>`, 8 of 8 slots (6 monochrome, 2 colour), generation 1 |
| `dpr` | `1`: the canvas is physical pixels and there is no CSS layout |
| `probes` | The centre pixel of up to 256 cells at an even stride over the grid, then the bottom-right canvas pixel |

The `receipt` line of the command line repeats each probe as a `probeBindings` entry. Each entry
gives the cell the probe falls in, the cell's ten source bytes, and its sixteen prepared bytes,
in hexadecimal. A letterbox probe has `cell`, `sourceCellHex` and `preparedCellHex` set to
`null`.

## Command line

```bash
cargo run -p geordi-bijou-wgpu-proof -- --render fixtures/bijou-gpu/width1-paint.packed-bijou-cells.json \
  --canvas 67x117 \
  --expect-frame-sha256 2094e5febfba192401e795e1bb2e6c26bdb20e9b71ffbc51167fd49c2d21367c
```

| Flag | Meaning |
| --- | --- |
| `--render <packed-cells.json>` | The input file. Required for a render. |
| `--repo-root <dir>` | Where the glyph pack, the manifest and the shader are read from. The default is the working directory. |
| `--canvas <W>x<H>` | Physical canvas; at least the grid. |
| `--default-fg <#RRGGBB>`, `--default-bg <#RRGGBB>` | Theme defaults; uppercase hex. The defaults are `#E6EDF3` and `#0D1117`. |
| `--receipt-out <file>` | Also write the receipt to this file. |
| `--expect-frame-sha256 <hex>` | Fail with `GEORDI_E_BIJOU_FRAME_HASH_MISMATCH` unless the read-back frame has this digest. A refusal reports `frameComparison: "not-run"`. |
| `--require-gpu` | Fail unless the result is `gpu-probed` (`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE` or `GEORDI_E_BIJOU_WGPU_HARDWARE_GPU_REQUIRED`). |
| `--deny-adapter` | Do not create a `wgpu` instance; the run is `capability-refused`. |
| `--schema`, `--help` | Print the message schemas or the help, as JSON Lines. |
| `--human`, `--humanize` | Prose instead of JSON Lines. |

Every stdout and stderr line is one JSON object carrying `_schema` (`id`, `version`) and `kind`.
A render streams `intake`, `prepared`, `adapter`, `receipt` and `result`, in that order. An
error is one `error` line on stderr. Exit code 0 means the run finished: read `outcome` in the
`result` line, because `capability-refused` exits 0. Exit code 1 means the input was refused,
rendering failed, or `--require-gpu` or `--expect-frame-sha256` was not satisfied. Exit code 2
means an invalid command line.

## Checked-in receipts

| File | Input | Evidence | Frame |
| --- | --- | --- | --- |
| `width1-paint.capability-refused.receipt.json` | `width1-paint.packed-bijou-cells.json`, canvas 67 x 117 | `capability-refused` | none |
| `width1-paint.gpu-probed.receipt.json` | same | `gpu-probed` | `2094e5fe…`, the suite's oracle golden |
| `width1-erase.gpu-probed.receipt.json` | `width1-erase.packed-bijou-cells.json`, canvas 67 x 117 | `gpu-probed` | `0261afa3…`, the suite's oracle golden |
| `bijou-re036.gpu-probed.receipt.json` | `bijou/packed-bijou-cells.v1.json` (Bijou RE-036, byte-identical import), canvas 16 x 32 | `gpu-probed` | `8a6bd4ee…`, equal to `renderReferenceRgba` for the same input |

The three `gpu-probed` receipts were produced by an Apple M5 adapter (`wgpu` Metal backend,
device type `IntegratedGpu`). The refusal depends on no host, so a test reproduces its exact
bytes on every run. The other three are reproduced field for field only on a host whose
adapter renders, by the adapter tests listed in the ledger.

## Running the gates

```bash
pnpm test:bijou-gpu:native
cargo test -p geordi-bijou-wgpu-proof -- --include-ignored
pnpm --filter @flyingrobots/geordi-bijou-gpu test
```

`pnpm test:bijou-gpu:native` runs the crate tests and `clippy -D warnings`, then renders the
paint frame with `--expect-frame-sha256`. CI runs it on a hosted runner. A runner without an
adapter streams a typed `capability-refused` result. A runner with only a software adapter
reports `software-probed`, and its frame must still match the golden.

Three crate tests need an adapter and are `#[ignore]`d. On a host without one, they fail
instead of passing. A plain `cargo test` reports them as ignored, and `--include-ignored` runs
them. CI does not run them, so CI produces no `gpu-probed` evidence.

The `native-wgpu-receipts.test.ts` suite of the conformance kit uses no GPU. It validates every
checked-in receipt and recomputes each recorded frame with the CPU oracle.
