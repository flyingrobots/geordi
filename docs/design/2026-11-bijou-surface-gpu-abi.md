# Bijou Surface GPU ABI (`bijou-surface-gpu/1`)

**Status**: Proposed (Option A selected by `@flyingrobots` on 2026-11-21; tracked in [#168](https://github.com/flyingrobots/geordi/issues/168))
**Date**: 2026-11-21
**Issue**: [#168](https://github.com/flyingrobots/geordi/issues/168)
**Downstream implementation issues**: [#169](https://github.com/flyingrobots/geordi/issues/169) (conformance kit), [#170](https://github.com/flyingrobots/geordi/issues/170) (canonical WGSL + `naga` GLSL generator), [#171](https://github.com/flyingrobots/geordi/issues/171) (dirty-union packer), [#172](https://github.com/flyingrobots/geordi/issues/172) (`GlyphAtlas`), [#173](https://github.com/flyingrobots/geordi/issues/173) (WebGL2), [#174](https://github.com/flyingrobots/geordi/issues/174) (Canvas 2D), [#175](https://github.com/flyingrobots/geordi/issues/175) (WebGPU), [#58](https://github.com/flyingrobots/geordi/issues/58) (native Rust `wgpu`)
**Upstream contracts read**: `flyingrobots/bijou` at `906666f9` (`packages/bijou/src/core/render/packed-cell.part01.ts`, `packages/bijou/src/core/packed-bijou-cells-contract.ts`, `packages/bijou/src/core/packed-bijou-cells-glyph-policy.ts`, `packages/bijou/src/ports/surface-contract.ts`, `packages/bijou/src/core/render/differ-packed.ts`, `docs/design/RE-510-geordi-native-gpu-host-for-bijou-cell-buffers.md`); `flyingrobots/bunny` (`docs/NUMERIC_CONSTITUTION.md`)
**Procedural glyph table**: [`fixtures/bijou-gpu/procedural-glyphs.json`](../../fixtures/bijou-gpu/procedural-glyphs.json) (`sha256: 7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46`)

## Reader job

This record freezes the endpoint-prepared GPU ABI (`bijou-surface-gpu/1`) that lets Geordi present Bijou's canonical `PackedSurface` (`packed-bijou-cells/1` / `bijou-packed-cell-u8x10-le/1`) across browser WebGPU, browser WebGL2, browser Canvas 2D fallback, and native Rust `wgpu` (`#58`) from one single contract, one pure-integer zero-float rendering arithmetic law, and one single procedural glyph data table.

Statements about what exists today cite the file and revision they come from. Planned contracts in Bijou or Geordi are labeled planned and linked to their issues. Nothing in `packages/bijou-gpu/` is implemented yet; this ADR defines the load-bearing ABI before any atlas, packer, shader, or presenter code lands.

## Ownership boundary

Per [`docs/design/2026-06-portable-bijou-ui-render-endpoints.md`](./2026-06-portable-bijou-ui-render-endpoints.md) and Bijou `RE-510`:

- **Bijou owns** `packed-bijou-cells/1`, `bijou-packed-cell-u8x10-le/1`, width-1 canonical glyph policy, `PackedSurface` semantics, TEA runtime state, and the planned `SurfacePresenter` seam ([`bijou#791`](https://github.com/flyingrobots/bijou/issues/791)) and planned `@flyingrobots/bijou-web` host adapters ([`bijou#792`](https://github.com/flyingrobots/bijou/issues/792)).
- **Geordi owns** `bijou-surface-gpu/1` endpoint preparation, planned `packages/bijou-gpu` (`@flyingrobots/geordi-bijou-gpu`), the procedural glyph data table, `GlyphAtlas`, canonical `bijou-surface.wgsl`, generated GLSL ES 3.00, browser and native GPU presenters, pixel probes, and endpoint receipts.

Geordi may present Bijou cells on the GPU. Geordi must not redefine Bijou cell semantics or invent canonical wide-cell rules.

## Deterministic numeric law (zero floats in core rendering)

Following `flyingrobots/bunny` (`docs/NUMERIC_CONSTITUTION.md`):

- **Zero floating-point arithmetic inside core rendering:** Every pixel evaluation in Sections 5 and 7—color blending, `DIM`, opacity, underlines, curly underlines, Box-Drawing arms/junctions/dashes/rounded arcs/diagonals, Block Elements, and Braille—uses strictly **32-bit integer and fixed-point arithmetic (`u32`/`i32`)** with explicit proven-infallible overflow bounds. No `f32`, `f64`, `sin`, `sqrt`, or platform-dependent transcendental calls may appear in core rendering math.
- **Canonical rounding (`divRoundEven`):** Matches Bunny's Banker's Rounding / ties-to-even rule for non-negative integers `n >= 0`, `d > 0`:
  ```text
  divRoundEven(n, d):
    q = n / d
    r = n % d
    return (2 * r > d || (2 * r == d && (q & 1) == 1)) ? (q + 1) : q
  ```
- **Valid physical cell domain:** `1 <= cellPxW <= 256` and `1 <= cellPxH <= 256`. Dimensions outside `[1..256]` MUST fail loudly at validation (`GEORDI_E_BIJOU_INVALID_CELL_METRICS`) so every `u32` intermediate proof below holds unconditionally.
- **Float ingress is host-edge only:** Browser CSS values (`clientX`, `rect`, `dpr`) are converted once at the DOM host boundary with explicit non-finite/non-positive rejection; core rendering operates exclusively on integers (`u8`/`u32`/`i32`). Final GPU fragment output converts the exact integer RGB triple `(r, g, b)` (`0..255`) to the swapchain at the terminal return instruction only.

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

All color channels operate on exact integer bytes `0..255` in **sRGB-direct** space (non-`-srgb` swapchains: `bgra8unorm` / `rgba8unorm` in WebGPU, `RGBA8` in WebGL2, `RGBA8` in Canvas 2D and `renderReferenceRgba()`).

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
- **`UNDERLINE_CURLY` (`0b10 << 4`, 2-cycle pure-integer triangle wave, zero `sin`):**
  ```text
  ampPx = (cellPxH >= 3) ? max(1, (cellPxH * 3 + 50) / 100) : 0
  baseY = min(cellPxH - decoPx, (cellPxH * 90) / 100)
  t     = ((2 * lx + 1) * 4) % (4 * cellPxW)
  q     = t / cellPxW
  r     = t % cellPxW
  off   = (q == 0) ?  divRoundEven(r * ampPx, cellPxW)
        : (q == 1) ?  divRoundEven((cellPxW - r) * ampPx, cellPxW)
        : (q == 2) ? -divRoundEven(r * ampPx, cellPxW)
        :            -divRoundEven((cellPxW - r) * ampPx, cellPxW)
  cy    = clamp(baseY + off, 0, cellPxH - decoPx)
  lit   = (ly >= cy && ly < cy + decoPx)
  ```
- **`FLAG_STRIKETHROUGH` (`0x04`):** `ly >= strikeY0 && ly < strikeY0 + decoPx`.

### Physical pixels, DPR host ingress, and letterboxed remainder

- Host boundary ingress converts CSS dimensions to bounded integer physical pixels:
  - `(canvasPxW, canvasPxH)` read from `ResizeObserverEntry.devicePixelContentBoxSize` when available, else `(max(1, round(cssW * dpr)), max(1, round(cssH * dpr)))`.
  - `(cellPxW, cellPxH)` snapped and validated into `[1..256] × [1..256]`.
- Grid capacity is `cols = canvasPxW / cellPxW`, `rows = canvasPxH / cellPxH` (integer floor division).
- Origin is **top-left `(0, 0)`** (`+X` right, `+Y` down).
- Any remainder pixels outside `[0, cols * cellPxW) × [0, rows * cellPxH)` bypass `textureLoad` and emit solid `uDefaultBg`.

### `cellFromPoint(clientX, clientY)` host-boundary coordinate law

Every presenter and the planned `@flyingrobots/bijou-web` input adapter ([`bijou#793`](https://github.com/flyingrobots/bijou/issues/793)) MUST implement the exact same **0-based** host-boundary hit-test:

```text
if (cols === 0 || rows === 0 || rect.width <= 0 || rect.height <= 0 || !isFinite(clientX) || !isFinite(clientY))
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

## 6. Endpoint receipt schema and evidence taxonomy

Every presenter emits a deterministic JSON receipt with `receiptVersion: "geordi-bijou-gpu-receipt/1"`:

```json
{
  "receiptVersion": "geordi-bijou-gpu-receipt/1",
  "gpuAbiVersion": "bijou-surface-gpu/1",
  "cellFormatId": "bijou-packed-cell-u8x10-le/1",
  "inputReceiptSha256": "<64-hex>",
  "preparedBufferSha256": "<64-hex>",
  "proceduralTableSha256": "7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46",
  "shaderSha256": "<64-hex-or-null-for-canvas2d>",
  "backendProfile": "geordi-webgl2/1",
  "evidenceLevel": "software-probed",
  "widthCells": 80,
  "heightCells": 24,
  "cellPx": { "width": 16, "height": 32 },
  "dpr": 2,
  "defaultFg": "#E6EDF3",
  "defaultBg": "#0D1117",
  "fontIdentity": "<font-family-and-size-or-bundled-test-font-sha256>",
  "atlasGeneration": 1,
  "atlasStats": { "usedSlots": 42, "capacity": 1024, "monoCount": 41, "colorEmojiCount": 1 },
  "probePolicy": "srgb-exact-or-declared-tolerance",
  "probes": []
}
```

`defaultFg` and `defaultBg` MUST be recorded as canonical 7-character uppercase sRGB hex strings (`#RRGGBB`) matching `uDefaultFg` and `uDefaultBg`, so pixel probes remain reproducible when theme defaults change without cell-byte changes (matching Bijou `RE-510`).

### Positive-evidence vs. capability-refusal law

`evidenceLevel` MUST be one of five distinct values, and downstream gates MUST NEVER conflate them:

| `evidenceLevel` | What it proves | Permitted to close a positive rendering claim? |
| --- | --- | --- |
| `shader-validated` | Shader text parsed and validated by pinned `naga` / `glslangValidator`. | No |
| `unit-upload` | Dirty-union packer and upload range logic matched its unit oracle. | No |
| `capability-refused` | Unavailable backend threw typed `BackendUnavailableError`; `probes` MUST be empty. | **No** (witnesses refusal only) |
| `software-probed` | Declared software rasterizer (e.g., SwiftShader, Canvas 2D) rendered the fixture and passed pixel probes. | Yes for software/Canvas 2D lanes; **no** for hardware-GPU claims |
| `gpu-probed` | Named hardware GPU adapter rendered the fixture and passed pixel probes. | Yes |

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

Closed-form pure-integer geometry at integer cell-local pixel `(lx, ly)` with `W = cellPxW`, `H = cellPxH`:

1. **Integer stroke widths (same pixel thickness in X and Y so corners balance visually):**
   ```text
   lightPx = max(1, (W * 10 + 50) / 100)
   heavyPx = 2 * lightPx
   dblGap  = max(1, lightPx)
   vx0(w)  = (W - w) / 2
   hy0(w)  = (H - w) / 2
   vxL0    = max(0, vx0(lightPx) - dblGap)
   vxR0    = min(W - lightPx, vx0(lightPx) + dblGap)
   hyT0    = max(0, hy0(lightPx) - dblGap)
   hyB0    = min(H - lightPx, hy0(lightPx) + dblGap)
   ```
2. **Pure-integer diagonals (`diagSlash == 1 || diagBackslash == 1`, `U+2571..U+2573`):**
   - Exact squared perpendicular distance check without `sqrt` or floats.
   - **Proven-infallible `u32` overflow bound for `1 <= W, H <= 256`:** `half2 = max(1, lightPx) <= 26`, `bound = half2 * (W + H) <= 13,312`. Since `W + H > hypot(W, H)`, any pixel with `d > bound` is strictly outside; whenever `d <= bound`, `d * d <= 177,209,344 < 2^32` and `rhs = half2 * half2 * (W * W + H * H) <= 88,604,672 < 2^32`.
   ```text
   half2        = max(1, lightPx)
   bound        = half2 * (W + H)
   rhs          = half2 * half2 * (W * W + H * H)
   dSlash       = abs((2 * lx + 1) * H + (2 * ly + 1) * W - 2 * W * H)
   dBack        = abs((2 * lx + 1) * H - (2 * ly + 1) * W)
   slashLit     = diagSlash     && (dSlash <= bound) && (dSlash * dSlash <= rhs)
   backslashLit = diagBackslash && (dBack  <= bound) && (dBack  * dBack  <= rhs)
   ```
3. **Pure-integer Q12 rounded quarter-ellipse arcs (`rounded == 1`, `U+256D..U+2570`):**
   - Fixed-point scale `Q12 = 4096`.
   - **Proven-infallible `u32` overflow bound for `1 <= W, H <= 256`:** `dx <= 2 * W - 1`, `dy <= 2 * H - 1` so `nx, ny <= 8,191`, `r2 = nx * nx + ny * ny <= 134,184,962 < 2^32`, and `rOut <= 8,601` so `rOut * rOut <= 73,977,201 < 2^32`.
   ```text
   cx2   = (R > 0) ? (2 * W) : 0
   cy2   = (D > 0) ? (2 * H) : 0
   dx    = abs(2 * lx + 1 - cx2)
   dy    = abs(2 * ly + 1 - cy2)
   nx    = (dx * 4096) / W
   ny    = (dy * 4096) / H
   r2    = nx * nx + ny * ny
   halfQ = (max(11, 10 * lightPx) * 4096) / (10 * min(W, H))
   rIn   = (halfQ < 4096) ? (4096 - halfQ) : 0
   rOut  = 4096 + halfQ
   lit   = (r2 >= rIn * rIn) && (r2 <= rOut * rOut)
   ```
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

- No GPU presenter, shader, atlas, or native `wgpu` implementation exists in Geordi yet.
- No performance figures or frame-time claims are made in this ABI; frame timings must be measured on named hardware and profiles after implementation lands.
- No wide (width-2) canonical glyph support in `bijou-surface-gpu/1`.
- No cursor overlay, OSC-8 hyperlink, or window-title side channels in `bijou-surface-gpu/1`.
- No GPU-side compute cell production in `bijou-surface-gpu/1`.
