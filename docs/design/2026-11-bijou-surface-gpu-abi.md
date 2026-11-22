# Bijou Surface GPU ABI (`bijou-surface-gpu/1`)

**Status**: Proposed (Option A selected by `@flyingrobots` on 2026-11-21; Bunny primitive split + Option E4 rounded-corner geometry approved on 2026-11-22; tracked in [#168](https://github.com/flyingrobots/geordi/issues/168))
**Date**: 2026-11-21 (amended 2026-11-22)
**Issue**: [#168](https://github.com/flyingrobots/geordi/issues/168)
**Downstream implementation issues**: [#169](https://github.com/flyingrobots/geordi/issues/169) (conformance kit), [#170](https://github.com/flyingrobots/geordi/issues/170) (canonical WGSL + `naga` GLSL generator), [#171](https://github.com/flyingrobots/geordi/issues/171) (dirty-union packer), [#172](https://github.com/flyingrobots/geordi/issues/172) (`GlyphAtlas`), [#173](https://github.com/flyingrobots/geordi/issues/173) (WebGL2), [#174](https://github.com/flyingrobots/geordi/issues/174) (Canvas 2D), [#175](https://github.com/flyingrobots/geordi/issues/175) (WebGPU), [#58](https://github.com/flyingrobots/geordi/issues/58) (native Rust `wgpu`)
**Upstream contracts read**: `flyingrobots/bijou` at `906666f9` (`packages/bijou/src/core/render/packed-cell.part01.ts`, `packages/bijou/src/core/packed-bijou-cells-contract.ts`, `packages/bijou/src/core/packed-bijou-cells-glyph-policy.ts`, `packages/bijou/src/ports/surface-contract.ts`, `packages/bijou/src/core/render/differ-packed.ts`, `docs/design/RE-510-geordi-native-gpu-host-for-bijou-cell-buffers.md`); `flyingrobots/bunny` (`docs/NUMERIC_CONSTITUTION.md`, `docs/design/0005-gpu-compute-backend.md` Amendment 1 in [`bunny#429`](https://github.com/flyingrobots/bunny/pull/429), `bunny-u32-div-round-even/1` in [`bunny#431`](https://github.com/flyingrobots/bunny/pull/431) at `3b7fbad`, `bunny-u32-ellipse-classify/1` in [`bunny#432`](https://github.com/flyingrobots/bunny/pull/432) at `292a2c3`)
**Procedural glyph table**: [`fixtures/bijou-gpu/procedural-glyphs.json`](../../fixtures/bijou-gpu/procedural-glyphs.json) (`sha256: 7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46`)

## Reader job

This record freezes the endpoint-prepared GPU ABI (`bijou-surface-gpu/1`) that lets Geordi present Bijou's canonical `PackedSurface` (`packed-bijou-cells/1` / `bijou-packed-cell-u8x10-le/1`) across browser WebGPU, browser WebGL2, browser Canvas 2D fallback, and native Rust `wgpu` (`#58`) from one single contract, one pure-integer zero-float rendering arithmetic law backed by pinned `flyingrobots/bunny` GPU math primitives, and one single procedural glyph data table.

Statements about what exists today cite the file and revision they come from. Planned contracts in Bijou or Geordi are labeled planned and linked to their issues. `packages/bijou-gpu/` holds the conformance kit ([#169](https://github.com/flyingrobots/geordi/issues/169): presenter contract, fixtures, receipt validator, CPU reference oracle), described in [`../bijou-gpu-conformance-kit.md`](../bijou-gpu-conformance-kit.md), and the dirty-union packer ([#171](https://github.com/flyingrobots/geordi/issues/171)), described in [`../bijou-gpu-surface-damage.md`](../bijou-gpu-surface-damage.md), and the `GlyphAtlas` ([#172](https://github.com/flyingrobots/geordi/issues/172)), described in [`../bijou-gpu-glyph-atlas.md`](../bijou-gpu-glyph-atlas.md). No shader or presenter is implemented yet; this ADR defines the load-bearing ABI before that code lands.

## Ownership boundary

Per [`docs/design/2026-06-portable-bijou-ui-render-endpoints.md`](./2026-06-portable-bijou-ui-render-endpoints.md) and Bijou `RE-510`:

- **Bijou owns** `packed-bijou-cells/1`, `bijou-packed-cell-u8x10-le/1`, width-1 canonical glyph policy, `PackedSurface` semantics, TEA runtime state, and the planned `SurfacePresenter` seam ([`bijou#791`](https://github.com/flyingrobots/bijou/issues/791)) and planned `@flyingrobots/bijou-web` host adapters ([`bijou#792`](https://github.com/flyingrobots/bijou/issues/792)).
- **Bunny owns** reusable deterministic GPU math primitives (`bunny-u32-div-round-even/1` in [`bunny#427`](https://github.com/flyingrobots/bunny/issues/427)/[`#428`](https://github.com/flyingrobots/bunny/issues/428) and `bunny-u32-ellipse-classify/1` in [`bunny#430`](https://github.com/flyingrobots/bunny/issues/430)), their pure CPU references in `crates/bunny-num`, portable WGSL helpers, checked-in ordered vector fixtures, and `wgpu` equivalence harnesses in `crates/bunny-gpu`.
- **Geordi owns** `bijou-surface-gpu/1` endpoint preparation, terminal glyph geometry (stroke widths, Option E4 inset-corner arcs and outgoing-edge join masks, Block Elements, Braille), planned `packages/bijou-gpu` (`@flyingrobots/geordi-bijou-gpu`), the procedural glyph data table, `GlyphAtlas`, canonical `bijou-surface.wgsl`, generated GLSL ES 3.00, browser and native GPU presenters, exact integer canonical pixel readback, and endpoint receipts.

Geordi may present Bijou cells on the GPU. Geordi must not redefine Bijou cell semantics, invent canonical wide-cell rules, or fork Bunny's deterministic numeric primitives.

## Deterministic numeric law (zero floats in core rendering)

Following `flyingrobots/bunny` (`docs/NUMERIC_CONSTITUTION.md` and `docs/design/0005-gpu-compute-backend.md` Amendment 1):

- **Zero floating-point arithmetic inside core rendering:** Every pixel evaluation in Sections 5 and 7—color blending, `DIM`, opacity, underlines, curly underlines, Box-Drawing arms/junctions/dashes/rounded arcs/diagonals, Block Elements, and Braille—uses strictly **unsigned 32-bit integer arithmetic (`u32`)** (with portable 2-limb `u32` unsigned 64-bit arithmetic in `bunny-u32-ellipse-classify/1`) and explicit proven-infallible overflow bounds. No `f32`, `f64`, `sin`, `sqrt`, or platform-dependent transcendental calls may appear in core rendering math.
- **Canonical rounding (`bunny-u32-div-round-even/1`):** Adopts Bunny's overflow-safe unsigned 32-bit ties-to-even division contract over `n, d ∈ [0..=4,294,967,295]`. Zero divisor (`d == 0`, including `0 / 0`) MUST be handled by a control-flow branch before `/` or `%` and return `[0, 1]` (`DivisionByZero`); valid divisors return `[q_rounded, 0]` using the overflow-safe complement comparison `s = d - r` (never `2 * r`, which wraps in `u32` on adversarial inputs such as `n = 3,000,000,000, d = 4,000,000,000`, whose exact rounded result is `1`):
  ```text
  divRoundEven(n, d):
    if (d == 0) return [0, 1]   // DivisionByZero
    q = n / d
    r = n % d
    s = d - r
    return [(r > s || (r == s && (q & 1) == 1)) ? (q + 1) : q, 0]
  ```
  *(In Sections 5 and 7, where denominators such as `2`, `63`, `252`, `16065`, and validated `cellPxW >= 1` are statically nonzero, `divRoundEven(n, d)` denotes the scalar lane-0 quotient `bunny_u32_div_round_even(n, d).x` with `status == 0`.)*
- **Exact ellipse classification (`bunny-u32-ellipse-classify/1`):** Adopts Bunny's exact unsigned 64-bit ellipse trichotomy predicate over `dx, dy, semi_x, semi_y ∈ [0..=46,340]` (implemented in portable 2-limb `u32` WGSL with zero floats, zero 64-bit extensions, zero divisions, and zero subtractions). Out-of-domain operands (`> 46,340`) return `[0, 1]` (`OutOfDomain`); degenerate zero-semiaxis inputs (`semi_x == 0 || semi_y == 0`) are handled by an explicit branch **before** the raw polynomial (`(0, 0) -> OnBoundary`, all other points -> `Outside`).
- **Pinned Bunny primitive artifacts consumed by Geordi:**

| Contract ID | Bunny Issue / PR | Bunny Commit | Artifact Path | SHA-256 |
| --- | --- | --- | --- | --- |
| `bunny-u32-div-round-even/1` | [`bunny#427`](https://github.com/flyingrobots/bunny/issues/427), [`#428`](https://github.com/flyingrobots/bunny/issues/428) / [`PR #431`](https://github.com/flyingrobots/bunny/pull/431) | `3b7fbad` | `crates/bunny-gpu/shaders/bunny_u32_div_round_even.wgsl` | `ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f` |
| `bunny-u32-div-round-even/1` | [`bunny#428`](https://github.com/flyingrobots/bunny/issues/428) / [`PR #431`](https://github.com/flyingrobots/bunny/pull/431) | `3b7fbad` | `crates/bunny-gpu/fixtures/u32_div_round_even_vectors.json` | `df265cc7233772e33347b04fa1f7a3e71f34566e4aa6af5cf3fecf23e2b044a6` |
| `bunny-u32-ellipse-classify/1` | [`bunny#430`](https://github.com/flyingrobots/bunny/issues/430) / [`PR #432`](https://github.com/flyingrobots/bunny/pull/432) | `292a2c3` | `crates/bunny-gpu/shaders/bunny_u32_ellipse_classify.wgsl` | `1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99` |
| `bunny-u32-ellipse-classify/1` | [`bunny#430`](https://github.com/flyingrobots/bunny/issues/430) / [`PR #432`](https://github.com/flyingrobots/bunny/pull/432) | `292a2c3` | `crates/bunny-gpu/fixtures/u32_ellipse_classify_vectors.json` | `5f0ec6422de185e2ce7e832a7c1bce7ccde9b6f33e92b399f7c547191ef205e4` |

- **Explicit Q32.32 non-equivalence:** Adopting `bunny-u32-div-round-even/1` and `bunny-u32-ellipse-classify/1` covers bounded unsigned integer terminal math only and makes **no claim** of full `FixedQ32_32` GPU conformance; neither primitive depends on the rest of Bunny's Q32.32 GPU compute roadmap.
- **Valid physical cell domain:** `1 <= cellPxW <= 256` and `1 <= cellPxH <= 256`. Dimensions outside `[1..256]` MUST fail loudly at validation (`GEORDI_E_BIJOU_INVALID_CELL_METRICS`) so every `u32` and 2-limb intermediate bound below holds unconditionally.
- **Float ingress and display presentation are edge-only:** Browser CSS values (`clientX`, `rect`, `dpr`) are converted once at the DOM host boundary with explicit non-finite/non-positive rejection; core rendering operates exclusively on integers (`u8`/`u32`). Canonical bit-exact readback uses exact integer offscreen targets (`rgba8uint` / `RGBA8UI`, Section 6); normalized swapchain conversion occurs only in the separate display presentation pass.

## Options considered

| Option | Summary | Decision |
| --- | --- | --- |
| **Option A (Selected)** | **16-byte `rgba32uint` (`vec4<u32>` / `uvec4`) prepared cell texture (`textureLoad`) + pure-integer procedural Braille, Block/Quadrant, and Box-Drawing driven by one checked-in per-codepoint data table compiled into a static WGSL `const` block + `packages/bijou-gpu`.** | **Selected.** Single `textureLoad` per fragment, identical zero-float integer data path across WebGPU, WebGL2, and native `wgpu`, zero inter-cell box-drawing seams at any DPR, zero extra GPU texture bindings, and zero changes to Bijou's canonical 10-byte format. |
| **Option B (Rejected)** | Raw 10-byte `rg8ui` texture upload with zero CPU repack. | Rejected. Requires five `texelFetch` reads per pixel plus a per-fragment `charCode -> atlasSlot` indirection table lookup on every pixel. |
| **Option C (Rejected)** | Per-cell instanced quad vertex buffers (two triangles per cell). | Rejected. Adds vertex-buffer lifecycle complexity and forfeits single fullscreen-triangle screen-space shader composition. |
| **Option D (Rejected)** | 16-byte `rgba32uint` texture with CPU-rasterized box, block, and Braille glyphs baked into the atlas (Kitty/Ghostty/WezTerm style). | Rejected for v1. Eliminates shader geometry branches and unifies Canvas 2D pixels, but requires building and maintaining a separate deterministic Rust box/block/Braille rasterizer for native `#58`. May be revisited in `bijou-surface-gpu/2` if GPU shader complexity ever outweighs a shared Rust/TS rasterizer. |

## 1. Package location

All TypeScript browser GPU cell-presentation code lives in a dedicated Geordi workspace package:

- **Directory**: `packages/bijou-gpu`
- **Package name**: `@flyingrobots/geordi-bijou-gpu`
- **Shared static shader directory**: `packages/bijou-gpu/shaders/` (also read directly by Rust crates in `crates/` for `naga` generation and `#58`)
- **Shared fixture directory**: `fixtures/bijou-gpu/`

Keeping `@flyingrobots/geordi-bijou-gpu` separate from `@flyingrobots/geordi-runtime-webgl` keeps the existing `geordi-ir/1` rectangle and strict-text proof harnesses untouched.

## 2. Prepared GPU cell record (`rgba32uint`, 16 bytes/cell, little-endian)

Each terminal cell at `(col, row)` in a `widthCells × heightCells` grid is prepared into **four unsigned 32-bit lanes (`[word0, word1, word2, word3]`, 16 bytes)** stored in row-major order (`index = row * widthCells + col`) and uploaded to an **`rgba32uint`** 2D texture of dimensions `(widthCells, heightCells)` sampled strictly with **`textureLoad` / `texelFetch` at LOD 0** (no filtering, no mipmaps).

### Canonical byte order (little-endian)

All binary serializations, GPU texture uploads, and `preparedBufferSha256` digests MUST encode each `u32` lane in **little-endian byte order** (least-significant byte first: `[w & 0xFF, (w >> 8) & 0xFF, (w >> 16) & 0xFF, (w >> 24) & 0xFF]`, matching `u32::to_le_bytes()` in Rust and `DataView.setUint32(byteOffset, w, true)` in TypeScript):

- Bytes `0..3`: `word0` (little-endian)
- Bytes `4..7`: `word1` (little-endian) — byte `4` = `fg_r`, byte `5` = `fg_g`, byte `6` = `fg_b`, byte `7` = `flags`
- Bytes `8..11`: `word2` (little-endian) — byte `8` = `bg_r`, byte `9` = `bg_g`, byte `10` = `bg_b`, byte `11` = `alpha_byte`
- Bytes `12..15`: `word3` (little-endian) — `00 00 00 00`

Using `rgba32uint` + `textureLoad` on WebGPU, WebGL2, and native `wgpu` keeps one identical data path across every GPU target and avoids fragment-stage storage-buffer limits on downlevel WebGPU adapters.

### Bit layout

| Lane | Field | Bits | Mask | Meaning |
| --- | --- | --- | --- | --- |
| `word0` | `glyph_payload` | `0..15` | `0x0000FFFF` | Interpretation depends on `glyph_kind` (see below). |
| `word0` | `glyph_kind` | `16..19` | `0x000F0000` | `0` empty, `1` atlas monochrome, `2` atlas color emoji, `3` procedural Braille, `4` procedural Block Element, `5` procedural Box-Drawing. Values `6..15` are invalid and rejected by validators. |
| `word0` | `reserved_w0` | `20..31` | `0xFFF00000` | Reserved; MUST be `0` in `bijou-surface-gpu/1`. |
| `word1` | `fg_r` | `0..7` | `0x000000FF` | Foreground red channel (`0..255`; MUST be `0` when `FLAG_FG_SET == 0`). |
| `word1` | `fg_g` | `8..15` | `0x0000FF00` | Foreground green channel (`0..255`; MUST be `0` when `FLAG_FG_SET == 0`). |
| `word1` | `fg_b` | `16..23` | `0x00FF0000` | Foreground blue channel (`0..255`; MUST be `0` when `FLAG_FG_SET == 0`). |
| `word1` | `flags` | `24..31` | `0xFF000000` | Exact `OFF_FLAGS` byte from Bijou (`packed-cell.part01.ts`): bit 0 `BOLD` (`0x01`), bit 1 `DIM` (`0x02`), bit 2 `STRIKETHROUGH` (`0x04`), bit 3 `INVERSE` (`0x08`), bits 4..5 `UNDERLINE` (`00` none, `01` solid, `10` curly, `11` dotdash), bit 6 `FLAG_DASHED` (`0x40`), bit 7 `FLAG_EMPTY` (`0x80`). |
| `word2` | `bg_r` | `0..7` | `0x000000FF` | Background red channel (`0..255`; MUST be `0` when `FLAG_BG_SET == 0`). |
| `word2` | `bg_g` | `8..15` | `0x0000FF00` | Background green channel (`0..255`; MUST be `0` when `FLAG_BG_SET == 0`). |
| `word2` | `bg_b` | `16..23` | `0x00FF0000` | Background blue channel (`0..255`; MUST be `0` when `FLAG_BG_SET == 0`). |
| `word2` | `alpha_byte` | `24..31` | `0xFF000000` | Exact `OFF_ALPHA` byte from Bijou (`packed-cell.part01.ts`): bits 0..5 quantized opacity (`0..63`), bit 6 `FLAG_FG_SET` (`0x40`), bit 7 `FLAG_BG_SET` (`0x80`). |
| `word3` | `reserved_w3` | `0..31` | `0xFFFFFFFF` | Reserved; MUST be `0x00000000` in `bijou-surface-gpu/1`. |

### `glyph_kind` and `glyph_payload`

| `glyph_kind` | Constant Name | `glyph_payload` (`word0 & 0xFFFFu`) | Shader Behavior |
| --- | --- | --- | --- |
| `0` | `GLYPH_KIND_EMPTY` | `0` | No glyph coverage (`0`); still paints resolved `bg`, underlines, and strikethrough if set. Used for `CHAR_EMPTY` (live `PackedSurface`), `FLAG_EMPTY`, and ASCII space (`U+0020`, canonical `packed-bijou-cells/1` empty cell). |
| `1` | `GLYPH_KIND_ATLAS_MONO` | Atlas slot index (`0..65535`) | Load `GlyphAtlas` integer texel at slot `payload`; monochrome coverage = `texel.a` (`0..255`); tint with resolved `fg`. |
| `2` | `GLYPH_KIND_ATLAS_COLOR` | Atlas slot index (`0..65535`) | Load `GlyphAtlas` integer texel at slot `payload`; premultiplied sRGB `u8` RGBA color glyph (do not tint with `fg`). |
| `3` | `GLYPH_KIND_BRAILLE` | `codePoint - 0x2800` (`0..255`) | Procedural 2×4 Braille dot mask directly from the 8-bit Unicode payload (zero lookup table). |
| `4` | `GLYPH_KIND_BLOCK` | `codePoint - 0x2580` (`0..31`) | Index into static `BLOCK_GLYPHS[payload]` generated from `fixtures/bijou-gpu/procedural-glyphs.json`. |
| `5` | `GLYPH_KIND_BOX` | `codePoint - 0x2500` (`0..127`) | Index into static `BOX_GLYPHS[payload]` generated from `fixtures/bijou-gpu/procedural-glyphs.json`. |

### Pixel, cell-local, and atlas coordinates (integer)

For every integer physical output pixel `(px, py)` with `0 <= px < cols * cellPxW` and `0 <= py < rows * cellPxH` (origin `(0, 0)` at top-left, `+X` right, `+Y` down; `/` is integer floor division):

```text
col = px / cellPxW
row = py / cellPxH
cellLocalPx = (lx, ly) = (px - col * cellPxW, py - row * cellPxH)
```

Pixel centers correspond mathematically to exact rationals `(2 * lx + 1) / (2 * cellPxW)` and `(2 * ly + 1) / (2 * cellPxH)`, evaluated without floats by integer cross-multiplication.

In fragment shaders (converting hardware rasterizer position once to integer `(px, py)`):
- **WebGPU / native `wgpu`**: `@builtin(position).xy` is at top-left pixel centers `(px + 0.5, py + 0.5)`, so `(px, py) = (u32(pos.x), u32(pos.y))`.
- **WebGL2**: `gl_FragCoord.y` has bottom-left origin (`0.5 .. canvasPxH - 0.5`), so `px = uint(gl_FragCoord.x)` and `py = (uCanvasPxH - 1u) - uint(gl_FragCoord.y)`.

The `GlyphAtlas` is an **`rgba8uint`** (`texture_2d<u32>` / `usampler2D`) 2D texture of `atlasCols * cellPxW` by `atlasRows * cellPxH` physical pixels sampled strictly with exact integer texel loads (`textureLoad` / `texelFetch` at LOD 0), returning exact `u8` channel values in `0..255` with zero floating-point normalization round-trip. For any slot index `s`:

```text
slotCol = s % atlasCols
slotRow = s / atlasCols
atlasOriginPx = (slotCol * cellPxW, slotRow * cellPxH)
samplePx = (atlasOriginPx.x + lx, atlasOriginPx.y + ly)
```

Atlas keys are `(grapheme, bold)` because Bijou's `OFF_FLAGS` encodes `FLAG_BOLD` (`bit 0`) and does not have an italic bit in `bijou-packed-cell-u8x10-le/1`.

### Canonical hex test vectors

Every downstream packer (`#171`), reference oracle (`#169`), and native host (`#58`) MUST agree byte-for-byte with these prepared `uvec4` test vectors:

| Vector | Source Cell Description | `word0` | `word1` | `word2` | `word3` |
| --- | --- | --- | --- | --- | --- |
| `V0` | Empty cell (`U+0020` or live `CHAR_EMPTY`, default fg/bg, `FLAG_EMPTY`, opacity `63`) | `0x00000000` | `0x80000000` | `0x3F000000` | `0x00000000` |
| `V1` | `'A'` at mono atlas slot `7`, `fg=#FF8040`, `bg=#102030`, `BOLD \| UNDERLINE_SOLID`, opacity `63` | `0x00010007` | `0x114080FF` | `0xFF302010` | `0x00000000` |
| `V2` | Color emoji at color atlas slot `42`, default fg, `bg=#000000`, no flags, opacity `63` | `0x0002002A` | `0x00000000` | `0xBF000000` | `0x00000000` |
| `V3` | Braille `⣿` (`U+28FF`, mask `0xFF`), `fg=#00FFAA`, default bg, `DIM \| INVERSE`, opacity `32` | `0x000300FF` | `0x0AAAFF00` | `0x60000000` | `0x00000000` |
| `V4` | Block `▀` (`U+2580`, index `0`), `fg=#FFFFFF`, `bg=#223344`, `UNDERLINE_CURLY`, opacity `63` | `0x00040000` | `0x20FFFFFF` | `0xFF443322` | `0x00000000` |
| `V5` | Box `╭` (`U+256D`, index `109`), `fg=#AA55CC`, default bg, `STRIKETHROUGH \| UNDERLINE_DOTDASH \| FLAG_DASHED`, opacity `63` | `0x0005006D` | `0x74CC55AA` | `0x7F000000` | `0x00000000` |

**Complete little-endian 16-byte serialized vector for `V1`** (used for uploads and `preparedBufferSha256`):

```text
07 00 01 00 FF 80 40 11 10 20 30 FF 00 00 00 00
```

## 3. Width-1 canonical glyph policy boundary

Bijou's canonical `packed-bijou-cells/1` validator (`packages/bijou/src/core/packed-bijou-cells-glyph-policy.ts`, `isSafeUnitGlyph`) enforces:

```text
segmentGraphemes(value).length === 1 && graphemeClusterWidth(value) === 1
```

along with Bijou's control-character, surrogate, unsafe-format, and visible-base checks (`packed-bijou-cells-glyph-policy.ts#L18-L30`, `packed-bijou-cells-validate-glyphs.ts#L76-L88`) for both direct BMP codepoints and `sideTable` entries.

`bijou-surface-gpu/1` strictly obeys this width-1 contract:

- Direct single-cell graphemes accepted by `isSafeUnitGlyph` (with `U+0020` lowered to `GLYPH_KIND_EMPTY`) and canonical width-1 `sideTable` graphemes (such as decomposed `e` + combining acute accent `U+0065 U+0301` and private-use `U+F000`, matching Bijou `RE-510`) are supported.
- **Wide (width-2) graphemes** (such as CJK ideographs or width-2 emoji) are **explicitly rejected** in strict canonical receipt mode with a typed error (`GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH`).
- Wide-cell continuation rules, left/right glyph splitting, and rightmost-column clipping are **out of scope for `bijou-surface-gpu/1`** and belong to a future Bijou-owned `packed-bijou-cells/2` or separately declared live-surface contract. Geordi must never silently invent canonical wide-cell layout semantics.

## 4. Frame damage, erasure, and buffer lifetime law

Per Bijou's `PackedSurface` contract (`packages/bijou/src/ports/surface-contract.ts` and `packages/bijou/src/core/render/differ-packed.ts`):

1. **Front|back union damage:** Candidate changed cells between `current` (previously presented) and `target` (newly painted) are the **bitwise union** `current.renderDirtyWords[w] | target.renderDirtyWords[w]`. Scanning only `target.renderDirtyWords` is forbidden because cells painted on frame `N` and cleared on frame `N+1` have bit `0` in `target.renderDirtyWords` and bit `1` in `current.renderDirtyWords`.
2. **Semantic `sideTable` comparison:** When `current.sideTable.length > 0 || target.sideTable.length > 0`, cell equality MUST resolve side-table indices (`charCode >= 0xF000`) to their underlying grapheme strings rather than comparing raw index bytes alone.
3. **Coalesced frame accumulation:** When multiple TEA updates occur between `requestAnimationFrame` ticks, the presenter accumulates dirty words via bitwise OR (`accumulated[w] |= incoming[w]`) until presented.
4. **Full-invalidation triggers (`forceFullRefresh`):** The packer MUST rebuild and re-upload the entire grid (ignoring incremental dirty words) on any of:
   - First presented frame.
   - Grid dimension change (`widthCells` or `heightCells`).
   - `GlyphAtlas` generation increment (reset-and-mark-all-dirty overflow eviction, font change, or `document.fonts.ready` flush).
   - DPR or integer physical cell metric change (`cellPxW`, `cellPxH`).
   - Default theme color uniform change (`uDefaultFg`, `uDefaultBg`).
   - Graphics context or device restoration (`webglcontextrestored`, WebGPU `device.lost` recovery).
5. **Retained CPU staging buffer:** Every presenter retains its full little-endian `Uint32Array(widthCells * heightCells * 4)` staging buffer so context/device restoration can re-upload the complete frame without waiting for a new application render.
6. **Synchronous `present()` lifetime:** `present(current, target, ctx)` is synchronous. Callers must consume, pack, or copy every required byte and side-table string before `present()` returns because `bijou-tui`'s `RuntimeFramebuffers.adoptTarget()` immediately swaps/reuses the surface buffers in the `Output` stage.

## 5. Pure-integer color blending, decorations, DPR, and `cellFromPoint` law

### Exact integer color blending (`sRGB-direct`, zero floats)

All color channels operate on exact integer bytes `0..255` in **sRGB-direct** space. Canonical bit-exact rendering targets exact integer offscreen attachments (`rgba8uint` in WebGPU/native `wgpu`, `RGBA8UI` in WebGL2, integer `ImageData` in Canvas 2D and `renderReferenceRgba()`), strictly separate from non-`-srgb` normalized swapchain display presentation (`bgra8unorm` / `rgba8unorm` / default `RGBA8`).

Define exact integer interpolation using `divRoundEven` (all intermediates fit comfortably in `u32`, max `<= 8,193,150 < 2^32`):

```text
lerpU8(a, b, num, den) = divRoundEven(a * (den - num) + b * num, den)
```

Channel resolution order (per RGB channel in `0..255`):
1. `fg = (alpha_byte & 0x40) != 0 ? rgb(word1) : uDefaultFg`
2. `bg = (alpha_byte & 0x80) != 0 ? rgb(word2) : uDefaultBg`
3. If `(flags & FLAG_INVERSE) != 0`, swap `fg` and `bg`.
4. If `(flags & FLAG_DIM) != 0`, `fg = lerpU8(bg, fg, 1, 2)` (50% attenuation toward resolved `bg`, ties-to-even).
5. `op = alpha_byte & 0x3F` (integer in `0..63`).
6. Resolved cell background over canvas backdrop: `baseBg = lerpU8(uDefaultBg, bg, op, 63)`.
7. Glyph compositing:
   - Solid procedural hit (`lit == 1`): `out = lerpU8(baseBg, fg, op, 63)`.
   - Procedural Block Element shade (`q ∈ {1, 2, 3}` quarter coverage): `out = lerpU8(baseBg, fg, q * op, 252)` (`252 = 4 * 63`).
   - Monochrome atlas texel (`covU8 = texel.a` in `0..255`): `out = lerpU8(baseBg, fg, covU8 * op, 16065)` (`16065 = 255 * 63`).
   - Premultiplied color emoji texel `(emojiRgbU8, emojiAU8)` (`GLYPH_KIND_ATLAS_COLOR`):
     `out = min(255, divRoundEven(emojiRgbU8 * op * 255 + baseBg * (16065 - emojiAU8 * op), 16065))`.
   - Empty / unlit pixel: `out = baseBg`.
8. Decorations (`decoLit ∈ {0, 1}`): if `decoLit == 1`, `out = lerpU8(out, fg, op, 63)`.
9. Final RGBA8 pixel: `(out.r, out.g, out.b, 255)`.

### Pure-integer underline and strikethrough geometry (zero floats, guaranteed non-vanishing)

Every decoration uses pure integer arithmetic (`/` is integer floor division) and is guaranteed to light `decoPx >= 1` pixels on every lit column for all `1 <= cellPxW, cellPxH <= 256`:

```text
decoPx   = max(1, (cellPxH * 6 + 50) / 100)
ulY0     = min(cellPxH - decoPx, (cellPxH * 88) / 100)
strikeY0 = (cellPxH - decoPx) / 2
```

- **`UNDERLINE_SOLID` (`0b01 << 4`):** `ly >= ulY0 && ly < ulY0 + decoPx`.
- **`UNDERLINE_DOTDASH` (`0b11 << 4`, `FLAG_DASHED == 0`, dotted):** `ly >= ulY0 && ly < ulY0 + decoPx && ((lx * 8) / cellPxW) % 2 == 0`.
- **`UNDERLINE_DOTDASH | FLAG_DASHED` (`dashed`):** `ly >= ulY0 && ly < ulY0 + decoPx && ((lx * 10) / cellPxW) % 5 < 3`.
- **`UNDERLINE_CURLY` (`0b10 << 4`, 2-cycle pure-`u32` triangle wave, zero `sin`, zero signed intermediates):**
  ```text
  ampPx = (cellPxH >= 3) ? max(1, (cellPxH * 3 + 50) / 100) : 0
  baseY = min(cellPxH - decoPx, (cellPxH * 90) / 100)
  t     = ((2 * lx + 1) * 4) % (4 * cellPxW)
  q     = t / cellPxW
  r     = t % cellPxW
  mag   = divRoundEven(((q == 0 || q == 2) ? r : (cellPxW - r)) * ampPx, cellPxW)
  cy    = (q < 2) ? min(cellPxH - decoPx, baseY + mag) : satSub(baseY, mag)
  lit   = (ly >= cy && ly < cy + decoPx)
  ```
  *(where `satSub(a, b) = (a > b) ? (a - b) : 0` is unsigned saturating subtraction, so `cy` never underflows `u32`.)*
- **`FLAG_STRIKETHROUGH` (`0x04`):** `ly >= strikeY0 && ly < strikeY0 + decoPx`.

### Physical pixels, DPR host ingress, and letterboxed remainder

- Host boundary ingress MUST reject non-finite or non-positive (`!Number.isFinite(v) || v <= 0`) `cssW`, `cssH`, or `dpr` before converting CSS dimensions to bounded integer physical pixels:
  - `(canvasPxW, canvasPxH)` read from `ResizeObserverEntry.devicePixelContentBoxSize` when available, else `(max(1, Math.round(cssW * dpr)), max(1, Math.round(cssH * dpr)))` (explicit host-boundary JS half-towards-`+∞` quantization into `u32 >= 1`; core rendering consumes only the resulting integers).
  - `(cellPxW, cellPxH)` snapped and validated into `[1..256] × [1..256]`.
- Grid capacity is `cols = canvasPxW / cellPxW`, `rows = canvasPxH / cellPxH` (integer floor division).
- Origin is **top-left `(0, 0)`** (`+X` right, `+Y` down).
- Any remainder pixels outside `[0, cols * cellPxW) × [0, rows * cellPxH)` bypass `textureLoad` and emit solid `uDefaultBg`.

### `cellFromPoint(clientX, clientY)` host-boundary coordinate law

Every presenter and the planned `@flyingrobots/bijou-web` input adapter ([`bijou#793`](https://github.com/flyingrobots/bijou/issues/793)) MUST implement the exact same **0-based** host-boundary hit-test:

```text
if (
  cols === 0 || rows === 0 ||
  !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
  !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
  rect.width <= 0 || rect.height <= 0 ||
  !Number.isFinite(clientX) || !Number.isFinite(clientY)
)
  return null
localCssX = clientX - rect.left
localCssY = clientY - rect.top
physX = localCssX * (canvasPxW / rect.width)
physY = localCssY * (canvasPxH / rect.height)
col = clamp(Math.floor(physX / cellPxW), 0, cols - 1)
row = clamp(Math.floor(physY / cellPxH), 0, rows - 1)
```

- Origin is `(0, 0)` at top-left.
- Cell `[col, row]` covers physical pixels `[col * cellPxW, (col + 1) * cellPxW)` × `[row * cellPxH, (row + 1) * cellPxH)` (start inclusive, end exclusive).
- Coordinates in the letterboxed remainder or outside the canvas clamp into `[0, cols - 1]` and `[0, rows - 1]`.

## 6. Endpoint receipt schema, artifact identity, and 4-layer evidence taxonomy

Every presenter emits a deterministic JSON receipt with `receiptVersion: "geordi-bijou-gpu-receipt/1"` connecting the pinned upstream Bunny primitive artifacts to Geordi's assembled shader (or Canvas 2D presenter module) and runtime execution environment:

```json
{
  "receiptVersion": "geordi-bijou-gpu-receipt/1",
  "gpuAbiVersion": "bijou-surface-gpu/1",
  "cellFormatId": "bijou-packed-cell-u8x10-le/1",
  "inputReceiptSha256": "<64-hex>",
  "preparedBufferSha256": "<64-hex>",
  "proceduralTableSha256": "7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46",
  "bunnyPrimitives": [
    {
      "contractId": "bunny-u32-div-round-even/1",
      "bunnyCommit": "3b7fbad",
      "wgslSha256": "ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f",
      "vectorsSha256": "df265cc7233772e33347b04fa1f7a3e71f34566e4aa6af5cf3fecf23e2b044a6"
    },
    {
      "contractId": "bunny-u32-ellipse-classify/1",
      "bunnyCommit": "292a2c3",
      "wgslSha256": "1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99",
      "vectorsSha256": "5f0ec6422de185e2ce7e832a7c1bce7ccde9b6f33e92b399f7c547191ef205e4"
    }
  ],
  "assembledWgslSha256": "<64-hex-or-null-for-canvas2d>",
  "generatedGlslSha256": "<64-hex-or-null-when-not-webgl2>",
  "shaderSha256": "<64-hex-matching-active-backend-shader-or-null-for-canvas2d>",
  "executedArtifactSha256": "<64-hex-required-for-all-backends-including-canvas2d>",
  "backendProfile": "geordi-webgl2/1",
  "adapter": { "backend": "webgl2", "name": "<renderer-or-adapter-name>", "driver": "<version-or-empty>" },
  "evidenceLevel": "software-probed",
  "widthCells": 80,
  "heightCells": 24,
  "cellPx": { "width": 16, "height": 32 },
  "canvasPxW": 1280,
  "canvasPxH": 768,
  "dpr": 2,
  "defaultFg": "#E6EDF3",
  "defaultBg": "#0D1117",
  "fontIdentity": "<font-family-and-size-or-bundled-test-font-sha256>",
  "atlasGeneration": 1,
  "atlasStats": { "usedSlots": 42, "capacity": 1024, "monoCount": 41, "colorEmojiCount": 1 },
  "frameRgbaSha256": "<64-hex-or-null-when-not-read-back>",
  "probePolicy": "integer-canonical-exact",
  "probes": []
}
```

- **Dependency-to-artifact identity chain:** `bunnyPrimitives` pins the exact upstream Bunny revision and helper/vector SHA-256 digests baked into Geordi; `assembledWgslSha256` pins Geordi's final assembled `bijou-surface.wgsl`; `generatedGlslSha256` pins the pinned-`naga`-translated GLSL ES 3.00 source (`null` on WebGPU/native/Canvas 2D); `shaderSha256` pins the active GPU shader text (`assembledWgslSha256` for WebGPU/`wgpu`, `generatedGlslSha256` for WebGL2, and `null` for Canvas 2D); `executedArtifactSha256` is **always non-null** and pins the executed presenter artifact (for Canvas 2D, the SHA-256 of the deterministic JS presenter module/bundle so `shaderSha256: null` never leaves Canvas 2D unpinned).
- **Physical canvas dimensions (`canvasPxW`, `canvasPxH`):** Receipts MUST record the exact integer physical canvas dimensions used to produce the frame (`canvasPxW >= widthCells * cellPx.width`, `canvasPxH >= heightCells * cellPx.height`) so consumers can distinguish canvases that have identical cell counts (`widthCells × heightCells`) but different letterboxed remainder pixels (e.g., `1280` vs. `1295` physical pixels wide at `16 px` cell width).
- `defaultFg` and `defaultBg` MUST be recorded as canonical 7-character uppercase sRGB hex strings (`#RRGGBB`) matching `uDefaultFg` and `uDefaultBg`, so pixel probes remain reproducible when theme defaults change without cell-byte changes (matching Bijou `RE-510`).

### Exact integer canonical readback vs. display presentation (cross-GPU bit-exact hash law)

Canonical bit-exact pixel parity MUST NOT be measured through normalized swapchain egress (`RGBA8` / `rgba8unorm` / `bgra8unorm`), because OpenGL ES enables `GL_DITHER` by default and permits implementation-dependent fixed-point rounding during normalized conversion. Every backend MUST separate **exact integer canonical readback** from **display presentation**:

Every backend that reads back rendered pixels MUST produce a **canonical tight top-left row-major RGBA8 byte buffer** of exact length `canvasPxW * canvasPxH * 4` bytes (`offset = (py * canvasPxW + px) * 4`, channels `[R, G, B, 255]`) and hash that exact byte stream into `frameRgbaSha256` (lowercase 64-hex SHA-256; MUST be `null` when `evidenceLevel` is `shader-validated`, `unit-upload`, or `capability-refused`):

- **CPU reference oracle (`#169`):** Writes tight top-left row-major RGBA8 directly and computes `oracle.frameRgbaSha256`.
- **WebGPU (`#175`) & native Rust `wgpu` (`#58`):** Fragment origin is top-left `(0, 0)`. Canonical probe readback renders to an **`rgba8uint`** offscreen color attachment (`vec4<u32>` fragment output emitting exact `(r, g, b, 255)`), copies via `copyTextureToBuffer`, and strips any 256-byte `bytesPerRow` alignment padding before hashing. Presentation to the browser/window `bgra8unorm` or `rgba8unorm` swapchain is a separate terminal display pass converting exact `u8` channels at presentation only.
- **WebGL2 (`#173` & `#170`):**
  - **Mandatory drawing-buffer validation:** Before rendering, Y-flipping, or calling `readPixels`, WebGL2 presenters and probe harnesses MUST verify `gl.drawingBufferWidth === canvasPxW && gl.drawingBufferHeight === canvasPxH` and fail loudly with `GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH` if the browser clamped or altered the backing buffer size.
  - **Canonical frame readback (`RGBA8UI` FBO):** Probe contexts MUST be created with `alpha: false`, `antialias: false`, `premultipliedAlpha: false`, `preserveDrawingBuffer: true`, `gl.drawingBufferColorSpace = "srgb"`, and MUST call `gl.disable(gl.DITHER)`. GLSL ES 3.00 MUST normalize `py = (canvasPxH - 1u) - uint(gl_FragCoord.y)` so cell addressing matches WebGPU's top-left origin. Canonical probe frames render to an offscreen **`gl.RGBA8UI`** FBO attachment (`uvec4` fragment output emitting exact `(r, g, b, 255)`), read back via `gl.readPixels(0, 0, canvasPxW, canvasPxH, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, buf)`, and flip rows from bottom-up to top-left before hashing. Display presentation onto the default swapchain is a separate terminal display pass.
  - **32-bit kernel conformance readback (`RGBA32UI` FBO + transport canary):** When `#170`/`#173` validate Bunny's 32-bit primitives (`bunny-u32-div-round-even/1`, `bunny-u32-ellipse-classify/1`) in translated GLSL ES 3.00, the test harness MUST execute an actual WebGL2 draw targeting an offscreen **`gl.RGBA32UI`** FBO, read back via `gl.readPixels(..., gl.RGBA_INTEGER, gl.UNSIGNED_INT, buf)`, and pass a known-pattern transport canary proving uncorrupted 32-bit unsigned integer readback alongside every kernel equivalence run.
- **Canvas 2D deterministic probe path (`#174`):** Pure-integer `ImageData` compositing over the same deterministic `rgba8uint` atlas hashes the tight top-left `ImageData.data` bytes directly (`shaderSha256: null`, `executedArtifactSha256` pinned to the executed module).
- **Cross-GPU bit-exact parity test requirement:** Given identical `preparedBuffer`, identical integer uniforms, and identical `rgba8uint` `GlyphAtlas` bytes (or procedural-only cells with no atlas), every presenter test suite (`#173` WebGL2, `#174` Canvas 2D deterministic path, `#175` WebGPU, `#58` native Rust `wgpu`) MUST explicitly assert `receipt.frameRgbaSha256 === oracle.frameRgbaSha256` with **zero LSB tolerance**, proving bit-identical cryptographic frame hashes through exact integer readback regardless of GPU vendor or OS.

### 4-layer conformance & positive-evidence vs. capability-refusal law

Compilation/linking, CPU unit testing, kernel equivalence, and full-frame rendered equivalence are **four separate verification layers**. Neither static WGSL/GLSL compilation nor linking proves runtime output equivalence, and a missing WebGPU or WebGL2 path MUST be reported as `capability-refused` / `Unavailable`—never as a pass.

`evidenceLevel` MUST be one of five distinct values, and downstream gates MUST NEVER conflate them:

| `evidenceLevel` | Layer & What it proves | Permitted to close a positive rendering claim? |
| --- | --- | --- |
| `shader-validated` | **Layer 1 (Static):** Shader text parsed, translated, and validated by pinned `naga` / `glslangValidator`. | No |
| `unit-upload` | **Layer 2 (CPU/Unit):** Dirty-union packer, CPU reference oracle, and upload range logic matched their unit oracle. | No |
| `capability-refused` | **Refusal:** Unavailable backend threw typed `BackendUnavailableError` (or reported `Unavailable`); `probes` MUST be empty and `frameRgbaSha256` MUST be `null`. | **No** (witnesses refusal only) |
| `software-probed` | **Layers 3–4 (Software Execution):** Named software rasterizer (e.g., SwiftShader, Canvas 2D) executed kernel/frame draws and passed exact integer readback probes. | Yes for software/Canvas 2D lanes; **no** for hardware-GPU claims |
| `gpu-probed` | **Layers 3–4 (Hardware GPU Execution):** Named hardware GPU adapter executed kernel/frame draws and passed exact integer readback probes. | Yes |

## 7. Procedural glyph data table and WGSL delivery decision

The single source of truth for all 416 procedural terminal glyphs is checked in at:

- **File**: [`fixtures/bijou-gpu/procedural-glyphs.json`](../../fixtures/bijou-gpu/procedural-glyphs.json)
- **Schema**: `bijou-procedural-glyphs/1`
- **SHA-256**: `7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46`

Both `#169` (TypeScript CPU reference oracle) and `#170` (canonical WGSL shader + `naga` GLSL ES 3.00 generator) MUST implement the exact **zero-float, 32-bit integer** rules below for all valid `1 <= W, H <= 256`. Integer `/` denotes floor division.

### 7.1 Box-Drawing (`U+2500..U+257F`, 128 entries, 14 bits/entry)

Bit layout per entry in `BOX_GLYPHS[codePoint - 0x2500]`:
- `bits 0..1` = `L` (`left`), `bits 2..3` = `R` (`right`), `bits 4..5` = `U` (`up`), `bits 6..7` = `D` (`down`), each in `{0=none, 1=light, 2=heavy, 3=double}`.
- `bits 8..10` = `dash` in `{0=solid, 2=double-dash, 3=triple-dash, 4=quadruple-dash}`.
- `bit 11` = `rounded` (`1` for `U+256D..U+2570`).
- `bit 12` = `diagSlash` (`/` lower-left to upper-right), `bit 13` = `diagBackslash` (`\` upper-left to lower-right).

Closed-form pure-`u32` integer geometry at integer cell-local pixel `(lx, ly)` with `W = cellPxW`, `H = cellPxH`, using two unsigned helpers that never underflow `u32`:

```text
satSub(a, b)  = (a > b)  ? (a - b) : 0
absDiff(a, b) = (a >= b) ? (a - b) : (b - a)
```

1. **Integer stroke widths (same pixel thickness in X and Y so corners balance visually; `satSub` guarantees zero `u32` underflow for all `1 <= W, H <= 256`):**
   ```text
   lightPx = max(1, (W * 10 + 50) / 100)
   heavyPx = 2 * lightPx
   dblGap  = max(1, lightPx)
   vx0(w)  = satSub(W, w) / 2
   hy0(w)  = satSub(H, w) / 2
   vxL0    = satSub(vx0(lightPx), dblGap)
   vxR0    = min(satSub(W, lightPx), vx0(lightPx) + dblGap)
   hyT0    = satSub(hy0(lightPx), dblGap)
   hyB0    = min(satSub(H, lightPx), hy0(lightPx) + dblGap)
   ```
2. **Pure-`u32` diagonals (`diagSlash == 1 || diagBackslash == 1`, `U+2571..U+2573`):**
   - Exact squared perpendicular distance check without `sqrt`, floats, or signed subtraction, preserving the exact `0.55` (`11/20`) minimum half-thickness when `lightPx == 1` (`1 <= W <= 14`, matching rounded arcs below) and `0.5 * lightPx` when `lightPx >= 2` (`15 <= W <= 256`).
   - **Proven-infallible `u32`/`i32` overflow bound for `1 <= W, H <= 256`:**
     - When `lightPx == 1` (`W <= 14`): `scale = 10`, `halfS = 11`, `(2 * lx + 1) * H + (2 * ly + 1) * W <= 14,066`, `dSlashS, dBackS <= 10 * 6,898 = 68,980 < 2^31`, `bound = 11 * (W + H) <= 2,970`, `bound * bound <= 8,820,900 < 2^31`, `rhs = 121 * (W * W + H * H) <= 7,953,572 < 2^31`.
     - When `lightPx >= 2` (`15 <= W <= 256`): `scale = 1`, `halfS = lightPx <= 26`, `(2 * lx + 1) * H + (2 * ly + 1) * W <= 261,632`, `dSlashS, dBackS <= 130,560 < 2^31`, `bound = lightPx * (W + H) <= 13,312`, `bound * bound <= 177,209,344 < 2^31`, `rhs = lightPx * lightPx * (W * W + H * H) <= 88,604,672 < 2^31`.
   ```text
   scale        = (lightPx == 1) ? 10 : 1
   halfS        = (lightPx == 1) ? 11 : lightPx
   bound        = halfS * (W + H)
   rhs          = halfS * halfS * (W * W + H * H)
   dSlashS      = scale * absDiff((2 * lx + 1) * H + (2 * ly + 1) * W, 2 * W * H)
   dBackS       = scale * absDiff((2 * lx + 1) * H, (2 * ly + 1) * W)
   slashLit     = diagSlash     && (dSlashS <= bound) && (dSlashS * dSlashS <= rhs)
   backslashLit = diagBackslash && (dBackS  <= bound) && (dBackS  * dBackS  <= rhs)
   ```
3. **Option E4 rounded quarter-ellipse arcs (`rounded == 1`, `U+256D..U+2570`, consuming `bunny-u32-ellipse-classify/1`):**
   - **Q12 disposition (rejected):** The earlier Q12 fixed-point truncation rule (`nx = (dx * 4096) / W`, `ny = (dy * 4096) / H`) was evaluated against an independent exact-rational reference over `[1..256]^2` and rejected due to **179,000 changed pixels** (26,183 false inclusions, 152,817 false exclusions) and **240 dropped exact boundary ties** (152 inner, 88 outer).
   - **Approved geometry (Option E4 — Inset-Corner Exact Ellipse + 1-px Outgoing Edge Stubs):** Reserves the 1-pixel outgoing edge column/row strictly for the straight-stroke stub, places the quarter-ellipse center on the inner boundary of those stubs (`xIn`, `yIn`), and evaluates exact interior annulus + closed pixel-square centerline straddle via `bunny-u32-ellipse-classify/1`. Bunny returns `res = bunny_u32_ellipse_classify(dx, dy, a, b) = vec2<u32>(class, status)` with `status == 0u` (`Ok`) and unsigned class bijection `0u (Inside) <-> -1`, `1u (OnBoundary) <-> 0`, `2u (Outside) <-> +1`. In pure-`u32` WGSL/GLSL, `classify(...) <= 0` (`Inside || OnBoundary`) MUST be written `res.x <= 1u` (never `res.x <= 0u`) and `classify(...) >= 0` (`OnBoundary || Outside`) MUST be written `res.x >= 1u` (with `res.y == 0u`).
   - **Proven-infallible unsigned 64-bit bound over `[1..256]^2`:** In Case 3, `dx, dy` are odd integers `1 <= dx, dy <= 511`, `dx + 1, dy + 1 <= 512`, and `aOut, aIn, bOut, bIn, aMid, bMid <= 512 <= 46,340`. Even with the straddle `+1` corners, the conservative algebraic bounding box is `2 * (512 * 512)^2 = 137,438,953,472 = 2^37 << 2^64` (realized Option E4 maximum over `[1..256]^2 × 4` is `40,623,900,800`).
   - **Normative equations for all four corners (`╭` `R,D`; `╮` `L,D`; `╰` `R,U`; `╯` `L,U`):**
   ```text
   vxStart = vx0(lightPx)
   vxEnd   = min(W, vxStart + lightPx)
   hyStart = hy0(lightPx)
   hyEnd   = min(H, hyStart + lightPx)

   edgeX = (R > 0) ? (W - 1) : 0
   edgeY = (D > 0) ? (H - 1) : 0
   xIn   = (R > 0) ? satSub(W, 1) : min(1, W)
   yIn   = (D > 0) ? satSub(H, 1) : min(1, H)
   cx2   = 2 * xIn
   cy2   = 2 * yIn

   aOut  = (R > 0) ? (2 * satSub(xIn, vxStart)) : (2 * satSub(vxEnd, xIn))
   aIn   = (R > 0) ? (2 * satSub(xIn, vxEnd))   : (2 * satSub(vxStart, xIn))
   bOut  = (D > 0) ? (2 * satSub(yIn, hyStart)) : (2 * satSub(hyEnd, yIn))
   bIn   = (D > 0) ? (2 * satSub(yIn, hyEnd))   : (2 * satSub(hyStart, yIn))
   aMid  = (aOut + aIn) / 2
   bMid  = (bOut + bIn) / 2

   inStrX = (lx >= vxStart && lx < vxEnd)
   inStrY = (ly >= hyStart && ly < hyEnd)

   // Case 1: Degenerate 1-px thin cells or straight stroke already meets outgoing edge
   if (aOut == 0 || bOut == 0):
     hArm = inStrY && ((R > 0) ? (lx >= vxStart) : (lx < vxEnd))
     vArm = inStrX && ((D > 0) ? (ly >= hyStart) : (ly < hyEnd))
     lit  = hArm || vArm

   // Case 2: Outgoing 1-pixel edge stubs (exact straight-stroke join mask by construction)
   else if (lx == edgeX || ly == edgeY):
     lit  = (ly == edgeY && inStrX) || (lx == edgeX && inStrY)

   // Case 3: Strict interior (exact Bunny ellipse annulus OR pixel-square centerline straddle)
   else:
     dx       = absDiff(2 * lx + 1, cx2)
     dy       = absDiff(2 * ly + 1, cy2)
     inBand   = (classify(dx, dy, aOut, bOut) <= 0) && (classify(dx, dy, aIn, bIn) >= 0)
     straddle = (classify(dx - 1, dy - 1, aMid, bMid) <= 0) && (classify(dx + 1, dy + 1, aMid, bMid) >= 0)
     lit      = inBand || straddle
   ```
   - **Exhaustive `[1..256]^2 × 4` (`262,144` instances) acceptance invariants:**
     - **Non-vanishing:** `0` empty rasters.
     - **Single-component 8-connectivity:** `0` disconnected rasters across all `262,144` instances (whereas inset `inBand` without `straddle` disconnects on `11,557` instances, first at `2×24 ╭`).
     - **Pinned outgoing-edge join sandwich gate:** **`stroke mask ⊆ edge mask ⊆ sharp-corner edge mask`** holds with `0 / 262,144` failures on both bounds. (Strict equality `edge mask == stroke mask` carries `15,254` benign perpendicular-arm extras at extreme aspect ratios `~7.5:1` or wider: `2,570` in Case 1 where the stroke lies on the outgoing edge itself such as `1×4 ╭`, and `12,684` in Case 2 starting at `15×2` where `hyEnd == H` puts the horizontal stub corner pixel on the bottom edge.)
     - **Documented small-cell behavior:** At `W == 2`, `vxStart = floor((2 - 1) / 2) = 0` places the vertical stroke on column `0`, sending `╮` and `╯` into Case 1 via `aOut == 0`; symmetrically at `H == 2`, `hyStart = 0` sends `╰` and `╯` into Case 1 via `bOut == 0`. Thus at `2×2`, only `╭` bypasses Case 1 (`╭` = `##/#.`, `╮` = `#./#.`, `╰` = `##/..`, `╯` = `#./..`). At `4×4`, the 1-px stub inset consumes one pixel of radius so `4×4 ╭` renders effectively square (`.... / .### / .#.. / .#..`).
     - **Shader diff gate (`#170`):** Executed WGSL and `naga`-translated GLSL ES 3.00 outputs MUST be diffed pixel-for-pixel against this Option E4 CPU reference across standard and adversarial cell sizes (`1×4`, `2×2`, `3×4`, `4×4`, `2×14`, `15×2`, `28×2`, `5×7`, `8×16`, `16×8`, `18×7`).
4. **Pure-integer dashed lines (`dash ∈ {2, 3, 4}`, `U+2504..U+250B`, `U+254C..U+254F`):**
   - Horizontal (`L > 0 && R > 0`): `w = (L == 2) ? heavyPx : lightPx`; lit iff `ly >= hy0(w) && ly < hy0(w) + w && ((lx * 2 * dash) / W) % 2 == 0`.
   - Vertical (`U > 0 && D > 0`): `w = (U == 2) ? heavyPx : lightPx`; lit iff `lx >= vx0(w) && lx < vx0(w) + w && ((ly * 2 * dash) / H) % 2 == 0`.
5. **Pure-integer solid single, heavy, mixed, and mitered double-line arms and junctions (`dash == 0 && rounded == 0 && !diag`):**
   ```text
   vMax = (U == 2 || D == 2) ? heavyPx : lightPx
   hMax = (L == 2 || R == 2) ? heavyPx : lightPx
   cx0  = (U == 3 || D == 3) ? vxL0            : vx0(vMax)
   cx1  = (U == 3 || D == 3) ? (vxR0 + lightPx): (cx0 + vMax)
   cy0  = (L == 3 || R == 3) ? hyT0            : hy0(hMax)
   cy1  = (L == 3 || R == 3) ? (hyB0 + lightPx): (cy0 + hMax)
   ```
   - Single/heavy arm (`style ∈ {1, 2}`, `w = (style == 2) ? heavyPx : lightPx`):
     - `L ∈ {1, 2}`: `lx < cx1  && ly >= hy0(w) && ly < hy0(w) + w`
     - `R ∈ {1, 2}`: `lx >= cx0 && ly >= hy0(w) && ly < hy0(w) + w`
     - `U ∈ {1, 2}`: `ly < cy1  && lx >= vx0(w) && lx < vx0(w) + w`
     - `D ∈ {1, 2}`: `ly >= cy0 && lx >= vx0(w) && lx < vx0(w) + w`
   - Double arm (`style == 3`; outer rail meets outer perpendicular rail, inner rail terminates cleanly at inner perpendicular rail):
     - `L == 3`: `(ly >= hyT0 && ly < hyT0 + lightPx && lx < (U == 3 ? vxL0 + lightPx : cx1)) || (ly >= hyB0 && ly < hyB0 + lightPx && lx < (D == 3 ? vxL0 + lightPx : cx1))`
     - `R == 3`: `(ly >= hyT0 && ly < hyT0 + lightPx && lx >= (U == 3 ? vxR0 : cx0)) || (ly >= hyB0 && ly < hyB0 + lightPx && lx >= (D == 3 ? vxR0 : cx0))`
     - `U == 3`: `(lx >= vxL0 && lx < vxL0 + lightPx && ly < (L == 3 ? hyT0 + lightPx : cy1)) || (lx >= vxR0 && lx < vxR0 + lightPx && ly < (R == 3 ? hyT0 + lightPx : cy1))`
     - `D == 3`: `(lx >= vxL0 && lx < vxL0 + lightPx && ly >= (L == 3 ? hyB0 : cy0)) || (lx >= vxR0 && lx < vxR0 + lightPx && ly >= (R == 3 ? hyB0 : cy0))`

### 7.2 Block Elements (`U+2580..U+259F`, 32 entries, 18 bits/entry)

Bit layout per entry in `BLOCK_GLYPHS[codePoint - 0x2580]`:
- `bits 16..17` = `kind` (`0` rect, `1` shade, `2` quadrant).
- `kind == 0` (`rect`): `x0 = b & 15`, `y0 = (b >> 4) & 15`, `x1 = (b >> 8) & 15`, `y1 = (b >> 12) & 15` in integer eighths `[0..8]`. Pure integer pixel-center test:
  `lit = (2 * lx + 1) * 4 >= x0 * W && (2 * lx + 1) * 4 < x1 * W && (2 * ly + 1) * 4 >= y0 * H && (2 * ly + 1) * 4 < y1 * H`.
- `kind == 1` (`shade`): `q = b & 3` (`1` = `1/4`, `2` = `2/4`, `3` = `3/4` uniform coverage via `lerpU8(baseBg, fg, q * op, 252)`).
- `kind == 2` (`quadrant`): `mask = b & 15` (`bit 0` TL, `bit 1` TR, `bit 2` BL, `bit 3` BR). Pure integer pixel-center quadrant test:
  `qx = ((2 * lx + 1) >= W) ? 1 : 0`, `qy = ((2 * ly + 1) >= H) ? 1 : 0`, `lit = ((mask >> (qx + 2 * qy)) & 1) != 0`.

### 7.3 Braille Patterns (`U+2800..U+28FF`, 256 entries, 0 table bytes)

8-bit dot mask `m = glyph_payload & 0xFFu` over a 2×4 grid (`col ∈ {0,1}`, `row ∈ {0,1,2,3}`), bit mapping `(0,0)=0`, `(0,1)=1`, `(0,2)=2`, `(1,0)=3`, `(1,1)=4`, `(1,2)=5`, `(0,3)=6`, `(1,3)=7`.

Pure integer sub-cell test (exact pixel-center `[1/4, 3/4) × [1/5, 4/5)` when `W >= 4` / `H >= 8`; fills sub-cell axis when `W < 4` or `H < 8` so every set dot lights at least 1 pixel for all `W >= 2, H >= 4`, including `2×5`):

```text
subCol = min(1, (2 * lx + 1) / W)
subRow = min(3, (4 * ly + 2) / H)
bitIdx = (subRow == 3) ? (6 + subCol) : (subCol * 3 + subRow)
subX   = (2 * lx + 1) - subCol * W
subY   = (4 * ly + 2) - subRow * H
inX    = (W < 4) || (4 * subX >= W && 4 * subX < 3 * W)
inY    = (H < 8) || (5 * subY >= H && 5 * subY < 4 * H)
lit    = inX && inY && (((m >> bitIdx) & 1) != 0)
```

*(Note: 8 spatially distinct Braille dots physically require at least `2 × 4` pixels (`W >= 2, H >= 4`). Below that, clamping `subCol`/`subRow` keeps indices in bounds without out-of-range shifts.)*

### Delivery into `bijou-surface.wgsl` (Decision: Generated Checked-In `const` Block)

`fixtures/bijou-gpu/procedural-glyphs.json` reaches `bijou-surface.wgsl` as a **deterministically generated, checked-in WGSL `const` block** (`const BOX_GLYPHS: array<u32, 128>` and `const BLOCK_GLYPHS: array<u32, 32>`) enforced by `#170`'s `--check` CI drift gate—**not** as a third GPU texture binding.

- **GPU bind group stays minimal (3 bindings total):**
  - `@binding(0)`: uniform buffer `BijouSurfaceUniforms` (`canvasPx`, `cellPx`, `gridCells`, `atlasCols`, `defaultFg`, `defaultBg`, `flags`, all `u32`).
  - `@binding(1)`: `texture_2d<u32>` (`rgba32uint` cell grid).
  - `@binding(2)`: `texture_2d<u32>` (`rgba8uint` `GlyphAtlas`).
- **Zero edits required to `#170`, `#173`, or `#175`:** Downstream shader and presenter cards stay strictly aligned on these exact bindings.

## Nonclaims

- No GPU presenter, shader, or native `wgpu` implementation exists in Geordi yet. The CPU reference oracle in `packages/bijou-gpu` is the only renderer of this ABI; the dirty-union packer and the `GlyphAtlas` beside it prepare cell records and atlas texels and render nothing.
- No performance figures or frame-time claims are made in this ABI; frame timings must be measured on named hardware and profiles after implementation lands.
- No wide (width-2) canonical glyph support in `bijou-surface-gpu/1`.
- No cursor overlay, OSC-8 hyperlink, or window-title side channels in `bijou-surface-gpu/1`.
- No GPU-side compute cell production in `bijou-surface-gpu/1`.
