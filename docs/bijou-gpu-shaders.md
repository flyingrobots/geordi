# Bijou GPU Shader Reference

**Shader directory**: [`packages/bijou-gpu/shaders/`](../packages/bijou-gpu/shaders/)
**Generator**: `geordi-bijou-shadergen` (`crates/geordi-bijou-shadergen`)
**ABI**: `bijou-surface-gpu/1`
**Manifest**: `geordi-bijou-gpu-shader-manifest/1`
**Kernel receipt**: `geordi-bijou-gpu-kernel-receipt/1`
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md)
**Evidence ledger**: [`bijou-gpu-shaders-test-plan.md`](./bijou-gpu-shaders-test-plan.md)

This page describes what exists on `main`: the canonical `bijou-surface.wgsl` shader, the tool
that assembles it and translates it to GLSL ES 3.00, the checked-in generated files and their
manifest, and the harness that executes the translated GLSL in WebGL2. The design record is the
normative source for every equation.

> **Not claimed.** Geordi has no GPU presenter, dirty-union packer, or `GlyphAtlas`. Nothing here
> draws to a screen. The shader's fragment stage writes exact integers to an integer target; the
> display pass that shows them belongs to the presenters, tracked in
> [flyingrobots/geordi#173](https://github.com/flyingrobots/geordi/issues/173),
> [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175) and
> [flyingrobots/geordi#58](https://github.com/flyingrobots/geordi/issues/58).

## Files

Everything is under `packages/bijou-gpu/shaders/`.

| File | Kind | Content |
| --- | --- | --- |
| `src/bijou-surface.main.wgsl` | Authored | Uniforms, bindings, the per-pixel law, and the two entry points |
| `src/bijou-kernel-conformance.main.wgsl` | Authored | Thin fragment wrappers around the Bunny helpers |
| `vendor/bunny/bunny_u32_div_round_even.wgsl` | Vendored | `bunny-u32-div-round-even/1`, exact bytes from `flyingrobots/bunny@3b7fbad` |
| `vendor/bunny/bunny_u32_ellipse_classify.wgsl` | Vendored | `bunny-u32-ellipse-classify/1`, exact bytes from `flyingrobots/bunny@292a2c3` |
| `bijou-surface.wgsl` | Generated | The complete module WebGPU and native `wgpu` compile |
| `bijou-surface.vert.glsl`, `bijou-surface.frag.glsl` | Generated | GLSL ES 3.00 stages for WebGL2 |
| `bijou-kernel-conformance.wgsl` and its four `.glsl` stages | Generated | Kernel conformance module |
| `bijou-shaders.manifest.json` | Generated | Implementation manifest |

The Bunny vector fixtures are in [`fixtures/bijou-gpu/bunny/`](../fixtures/bijou-gpu/bunny/). Bunny
is Apache-2.0, as Geordi is.

Edit only the authored files. Never edit a generated file or a vendored file: the generator
refuses a vendored file whose SHA-256 is not the one the design record pins, and the drift gate
refuses a generated file that differs from a fresh generation.

## Assembly

`bijou-surface.wgsl` is these parts, in this order:

1. A header that names the inputs and their digests.
2. The two Bunny helpers, byte for byte.
3. `const BOX_GLYPHS: array<u32, 128>` and `const BLOCK_GLYPHS: array<u32, 32>`, generated from
   the `packedU32` values of
   [`fixtures/bijou-gpu/procedural-glyphs.json`](../fixtures/bijou-gpu/procedural-glyphs.json).
4. `src/bijou-surface.main.wgsl`.

The authored section calls `bunny_u32_div_round_even` and `bunny_u32_ellipse_classify`. It does
not define rounding or ellipse arithmetic of its own.

`bijou-kernel-conformance.wgsl` is the header, the two Bunny helpers, and
`src/bijou-kernel-conformance.main.wgsl`. It has no glyph table.

## `bijou-surface.wgsl`

### Bindings

| Binding | WGSL | Content |
| --- | --- | --- |
| `@group(0) @binding(0)` | `var<uniform> surface: BijouSurfaceUniforms` | 64-byte uniform buffer |
| `@group(0) @binding(1)` | `var cells: texture_2d<u32>` | `rgba32uint` prepared cell grid, one texel per cell |
| `@group(0) @binding(2)` | `var glyph_atlas: texture_2d<u32>` | `rgba8uint` `GlyphAtlas` |

Both textures are read only with `textureLoad` at level 0. There is no sampler.

### `BijouSurfaceUniforms`

Every member is `u32`. The byte offsets are the same in WGSL and in the GLSL `std140` block.

| Member | Type | Byte offset | Meaning |
| --- | --- | --- | --- |
| `canvasPx` | `vec2<u32>` | 0 | Drawing-buffer size in physical pixels |
| `cellPx` | `vec2<u32>` | 8 | Cell size in physical pixels, each in `1..=256` |
| `gridCells` | `vec2<u32>` | 16 | Grid size in cells |
| `atlasCols` | `u32` | 24 | Cell-sized slots per atlas row |
| `defaultFg` | `vec3<u32>` | 32 | Default foreground, one sRGB byte per lane |
| `defaultBg` | `vec3<u32>` | 48 | Default background, one sRGB byte per lane |
| `flags` | `u32` | 60 | Reserved. Must be `0` |

Bytes 28 to 31 and 44 to 47 are padding.

### Entry points

| Entry point | Stage | Behavior |
| --- | --- | --- |
| `vs_main` | Vertex | Fullscreen triangle `(-1, -1)`, `(3, -1)`, `(-1, 3)` from `@builtin(vertex_index)`. No vertex buffers. Draw three vertices. |
| `fs_main` | Fragment | Returns `vec4<u32>(r, g, b, 255)` at `@location(0)` for an `rgba8uint` (WebGPU) or `RGBA8UI` (WebGL2) color attachment |

### Fragment-coordinate origin

The pixel law addresses pixels from the top-left. The module has one override:

```wgsl
override BIJOU_FRAG_ORIGIN_BOTTOM_LEFT: bool = false;
```

- WebGPU and native `wgpu` leave it at `false`: `py = u32(position.y)`.
- The generator sets it to `true` when it writes GLSL, because `gl_FragCoord.y` counts from the
  bottom: `py = (canvasPx.y - 1u) - uint(gl_FragCoord.y)`.

A WebGL2 host must therefore set `canvasPx` to the real drawing-buffer size.

### Defined behavior at the edges

- A pixel outside `gridCells`, or outside the cell texture, is `defaultBg` and never reaches
  `textureLoad`.
- A zero `cellPx` lane makes every pixel `defaultBg`.
- An atlas slot outside the atlas texture, or a zero `atlasCols`, has zero coverage.
- `glyph_kind` values `6..15` draw no glyph.
- `defaultFg`, `defaultBg` and atlas texels are masked to 8 bits before any arithmetic.

### Floating point

No function that decides a pixel holds a floating-point value. The floats in the module are the
clip-space position `vs_main` writes and the rasterizer position that `frag_px` and `frag_py`
convert to integers once.

## Generator

`geordi-bijou-shadergen` depends on exactly `naga = "=29.0.4"` with the `wgsl-in` and `glsl-out`
features. It parses each assembled module, validates it with every validation flag and no
optional capability, and writes each entry point as GLSL ES 3.00 for WebGL
(`#version 300 es`) with no writer flags, an empty binding map and the default bounds-check
policies.

Run it from the repository root:

```bash
cargo run -p geordi-bijou-shadergen -- --check
cargo run -p geordi-bijou-shadergen -- --write
```

| Flag | Behavior |
| --- | --- |
| `--check` | Compares a fresh generation with the nine checked-in files. Writes nothing. Exits 1 on any difference. |
| `--write` | Writes each generated file that differs from the file on disk. |
| `--repo-root <dir>` | Repository root. The default is the current directory. |
| `--schema` | Prints the JSON Schema of every message type and exits 0. |
| `--help` | Prints a description, then the schemas of the success and error output. |
| `--human`, `--humanize` | Writes prose instead of JSON Lines. |

Exactly one of `--check`, `--write`, `--schema` and `--help` is required.

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Generation failed, or checked-in files drifted |
| 2 | Invalid command line |

### Output

Without `--human`, every line on stdout and stderr is one JSON object. Each carries
`_schema.id` and `_schema.version`. The schemas are in
[`schemas/geordi-bijou-shadergen/`](../schemas/geordi-bijou-shadergen/), and each message type is
versioned on its own.

| `_schema.id` | Stream | When |
| --- | --- | --- |
| `geordi.bijou_shadergen.artifact` | stdout | One line per generated file, with `state` `match`, `drift` or `missing` for `--check` and `written` or `unchanged` for `--write` |
| `geordi.bijou_shadergen.result` | stdout | Last line of a successful `--check` or `--write` |
| `geordi.bijou_shadergen.error` | stderr | A failed run. `code` is one of the codes in [`ERROR_CODES.md`](./ERROR_CODES.md#bijou-gpu-shader-generator) |
| `geordi.bijou_shadergen.help` | stdout | First line of `--help` |
| `geordi.bijou_shadergen.schema` | stdout | One line per schema for `--schema`, and after the help line |

A failed `--check` writes the `artifact` lines, no `result` line, and one `error` line with code
`GEORDI_E_BIJOU_SHADERGEN_DRIFT` whose `paths` lists the files that differ.

The tool does not catch a panic inside `naga` or a signal. Either ends the process without an
`error` line.

## Implementation manifest

`bijou-shaders.manifest.json` is pretty-printed JSON with sorted keys. Its SHA-256 is the
`implementationManifestSha256` of a kernel receipt.

| Member | Content |
| --- | --- |
| `manifestVersion` | `geordi-bijou-gpu-shader-manifest/1` |
| `gpuAbiVersion` | `bijou-surface-gpu/1` |
| `generator` | Name and version of the generator crate |
| `naga` | Pinned version, features, validation settings and GLSL writer options |
| `fragmentOrigin` | The override name and the origin each output uses |
| `proceduralTablePath`, `proceduralTableSha256` | The procedural glyph table and its SHA-256 |
| `bunnyPrimitives` | Per contract: Bunny commit, upstream and vendored paths, `wgslSha256`, `vectorsSha256` |
| `generatedGlslSha256Rule` | The framing rule below, in words |
| `shaders` | One entry per assembled module |

Each `shaders` entry has:

| Member | Content |
| --- | --- |
| `id` | `bijou-surface` or `bijou-kernel-conformance` |
| `authoredSource` | Path and SHA-256 of the authored section |
| `wgslPath`, `assembledWgslSha256` | The assembled module and its SHA-256 |
| `stages` | Per entry point: `stage`, `entryPoint`, `path`, `sha256` of the GLSL file |
| `generatedGlslSha256` | One digest over all GLSL stages of the shader |
| `pipelineConstants` | Overrides the generator set for GLSL |
| `bindings` | The WGSL-binding-to-GLSL-name map |

`generatedGlslSha256` is the SHA-256 of, for each stage in `stages` order: the file name, a line
feed, the decimal byte length, a line feed, and the file bytes.

The digest members use the names of the endpoint receipt (`geordi-bijou-gpu-receipt/1`, validated
by `packages/bijou-gpu/src/receipt.ts`): `proceduralTableSha256`, `bunnyPrimitives[].contractId`,
`bunnyCommit`, `wgslSha256` and `vectorsSha256`, and, from the `bijou-surface` entry,
`assembledWgslSha256` and `generatedGlslSha256`.

### Binding map

Each `bindings` entry gives `group`, `binding`, `wgslName`, `wgslType`, `kind` and `glslNames`.
`glslNames` maps a GLSL file name to the name that file uses, or `null` when the stage does not
use the binding.

- For `kind: "uniform-buffer"`, the GLSL name is a `std140` uniform block name, for
  `getUniformBlockIndex`. The entry also has `byteSize` and `members` with `byteOffset`.
- For `kind: "texture"`, the GLSL name is a `usampler2D` uniform, for `getUniformLocation`. The
  entry also has `textureFormat`.

Read the names from the manifest. `naga` derives them from the group and binding numbers, and a
`naga` upgrade may change them.

## Kernel conformance harness

[`scripts/lib/bijou-gpu-shader-harness.mjs`](../scripts/lib/bijou-gpu-shader-harness.mjs) executes
the generated GLSL in a WebGL2 context. It is not a presenter. It imports nothing, so the same
file runs in a browser page and in Node.

`runKernelConformance(createContext, sources, kernels)`:

1. Calls `createContext()`. A `null` or `undefined` context ends the run with every step
   `not-run`.
2. Runs the transport canary: an `RGBA32UI` texture holding extreme values, mixed bytes and a
   walking bit over all 32 positions of each lane is drawn to an `RGBA32UI` framebuffer and read
   back with `readPixels(..., RGBA_INTEGER, UNSIGNED_INT, Uint32Array)`. A second row is written
   from shader constants that never passed through an upload.
3. For each kernel, uploads the vector operands as `RGBA32UI` texels, draws the kernel's
   fragment stage, and reads `(value, status, operand 0, operand 1)` back for every vector.

Each kernel reports four steps separately: `compilation`, `linking`, `transport` and
`arithmetic`. Each is `pass`, `fail` or `not-run`. If the canary fails, `arithmetic` is `not-run`.

[`scripts/lib/bijou-gpu-kernel-receipt.mjs`](../scripts/lib/bijou-gpu-kernel-receipt.mjs) turns a
report into one receipt per kernel:

| Member | Content |
| --- | --- |
| `receiptVersion` | `geordi-bijou-gpu-kernel-receipt/1` |
| `contractId` | Bunny contract of the kernel |
| `outcome` | `pass`, `fail` or `unavailable` |
| `executionClass` | `gpu-probed`, `software-probed` or `capability-refused` |
| `environment` | `backend`, `renderer`, `vendor`, `version`, `shadingLanguageVersion` |
| `steps` | The four step results |
| `vectorCount` | Number of vectors |
| `implementationManifestSha256` | SHA-256 of the manifest file |
| `executionArtifactSha256` | Digest of the vertex and fragment GLSL files executed, framed like `generatedGlslSha256` |
| `vectorsSha256` | SHA-256 of the Bunny vector fixture file |
| `expectedResultsSha256` | SHA-256 of the expected `(value, status)` words, little-endian, in fixture order |
| `actualResultsSha256` | The same over the words read back, or `null` when nothing was read |

`outcome` is `unavailable` when there was no WebGL2 context. It is `pass` only when all four
steps passed and `actualResultsSha256` equals `expectedResultsSha256`. Everything else is `fail`.

`executionClass` is `gpu-probed` only when the browser names an unmasked renderer that is not a
software rasterizer. An unnamed renderer is reported as `software-probed`.

The same module exports `createSurfaceRendererWebGl2` and `runSurfaceFrameWebGpu`. Each draws one
`bijou-surface` frame into an integer target and returns the tight top-left row-major RGBA8
bytes. The tests use them to diff the shader against reference models.

## Running the gates

```bash
pnpm test:bijou-gpu:shaders
```

This runs the generator's tests and Clippy, the `--check` drift gate, and
`scripts/bijou-gpu-shader-conformance.test.mjs`. The conformance tests start headless Chrome
through Playwright and need a WebGL2 context; without one they fail. CI also runs the generator
test that passes every generated stage to `glslangValidator`:

```bash
cargo test -p geordi-bijou-shadergen -- --include-ignored
```

The test that executes the WGSL through WebGPU is reported as skipped when the browser has no
WebGPU adapter. Set `GEORDI_BIJOU_GPU_REQUIRE_WEBGPU=1` to make that a failure.

Set `GEORDI_BIJOU_GPU_E4_EXHAUSTIVE=1` to diff the Option E4 corners at every cell size in
`[1..256]^2` instead of the listed sizes. That run draws about 4.3 billion pixels.

## Changing a shader

1. Edit an authored file under `src/`, or the procedural glyph table.
2. Run `cargo run -p geordi-bijou-shadergen -- --write`.
3. Run `pnpm test:bijou-gpu:shaders`.
4. Commit the authored change and every regenerated file together.

To adopt a new Bunny revision, replace the vendored helper and vector files, and update the
commit and digests in the design record and in `BUNNY_PRIMITIVES` in the generator. To change the
`naga` version, change the exact pin in `crates/geordi-bijou-shadergen/Cargo.toml` and
`NAGA_VERSION`, then regenerate. Both change every digest in the manifest.
