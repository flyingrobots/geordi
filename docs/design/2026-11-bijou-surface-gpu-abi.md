# Bijou Surface GPU ABI (`bijou-surface-gpu/1`)

**Status**: Proposed (Option A selected by `@flyingrobots` on 2026-11-21; tracked in [#168](https://github.com/flyingrobots/geordi/issues/168))
**Date**: 2026-11-21
**Issue**: [#168](https://github.com/flyingrobots/geordi/issues/168)
**Downstream implementation issues**: [#169](https://github.com/flyingrobots/geordi/issues/169) (conformance kit), [#170](https://github.com/flyingrobots/geordi/issues/170) (canonical WGSL + `naga` GLSL generator), [#171](https://github.com/flyingrobots/geordi/issues/171) (dirty-union packer), [#172](https://github.com/flyingrobots/geordi/issues/172) (`GlyphAtlas`), [#173](https://github.com/flyingrobots/geordi/issues/173) (WebGL2), [#174](https://github.com/flyingrobots/geordi/issues/174) (Canvas 2D), [#175](https://github.com/flyingrobots/geordi/issues/175) (WebGPU), [#58](https://github.com/flyingrobots/geordi/issues/58) (native Rust `wgpu`)
**Upstream Bijou contracts read**: `flyingrobots/bijou` at `906666f9` (`packages/bijou/src/core/render/packed-cell.part01.ts`, `packages/bijou/src/core/packed-bijou-cells-contract.ts`, `packages/bijou/src/core/packed-bijou-cells-glyph-policy.ts`, `packages/bijou/src/ports/surface-contract.ts`, `packages/bijou/src/core/render/differ-packed.ts`, `docs/design/RE-510-geordi-native-gpu-host-for-bijou-cell-buffers.md`)
**Procedural glyph table**: [`fixtures/bijou-gpu/procedural-glyphs.json`](../../fixtures/bijou-gpu/procedural-glyphs.json) (`sha256: 7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46`)

## Reader job

This record freezes the endpoint-prepared GPU ABI (`bijou-surface-gpu/1`) that lets Geordi present Bijou's canonical `PackedSurface` (`packed-bijou-cells/1` / `bijou-packed-cell-u8x10-le/1`) across browser WebGPU, browser WebGL2, browser Canvas 2D fallback, and native Rust `wgpu` (`#58`) from one single contract and one single procedural glyph data table.

Statements about what exists today cite the file and revision they come from. Planned contracts in Bijou or Geordi are labeled planned and linked to their issues. Nothing in `packages/bijou-gpu/` is implemented yet; this ADR defines the load-bearing ABI before any atlas, packer, shader, or presenter code lands.

## Ownership boundary

Per [`docs/design/2026-06-portable-bijou-ui-render-endpoints.md`](./2026-06-portable-bijou-ui-render-endpoints.md) and Bijou `RE-510`:

- **Bijou owns** `packed-bijou-cells/1`, `bijou-packed-cell-u8x10-le/1`, width-1 canonical glyph policy, `PackedSurface` semantics, TEA runtime state, and the planned `SurfacePresenter` seam ([`bijou#791`](https://github.com/flyingrobots/bijou/issues/791)) and planned `@flyingrobots/bijou-web` host adapters ([`bijou#792`](https://github.com/flyingrobots/bijou/issues/792)).
- **Geordi owns** `bijou-surface-gpu/1` endpoint preparation, planned `packages/bijou-gpu` (`@flyingrobots/geordi-bijou-gpu`), the procedural glyph data table, `GlyphAtlas`, canonical `bijou-surface.wgsl`, generated GLSL ES 3.00, browser and native GPU presenters, pixel probes, and endpoint receipts.

Geordi may present Bijou cells on the GPU. Geordi must not redefine Bijou cell semantics or invent canonical wide-cell rules.

## Options considered

| Option | Summary | Decision |
| --- | --- | --- |
| **Option A (Selected)** | **16-byte `rgba32uint` (`vec4<u32>` / `uvec4`) prepared cell texture (`textureLoad`) + procedural Braille, Block/Quadrant, and Box-Drawing driven by one checked-in per-codepoint data table compiled into a static WGSL `const` block + `packages/bijou-gpu`.** | **Selected.** Single `textureLoad` per fragment, identical data path across WebGPU, WebGL2, and native `wgpu`, zero inter-cell box-drawing seams at any DPR, zero extra GPU texture bindings, and zero changes to Bijou's canonical 10-byte format. |
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

## 2. Prepared GPU cell record (`rgba32uint`, 16 bytes/cell)

Each terminal cell at `(col, row)` in a `widthCells × heightCells` grid is prepared into **four `u32` lanes (`[word0, word1, word2, word3]`, 16 bytes)** stored in row-major order (`index = row * widthCells + col`) and uploaded to an **`rgba32uint`** 2D texture of dimensions `(widthCells, heightCells)` sampled strictly with **`textureLoad` / `texelFetch` at LOD 0** (no filtering, no mipmaps).

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
| `0` | `GLYPH_KIND_EMPTY` | `0` | No glyph coverage (`0.0`); still paints resolved `bg`, underlines, and strikethrough if set. Used for `CHAR_EMPTY` (live `PackedSurface`), `FLAG_EMPTY`, and ASCII space (`U+0020`, canonical `packed-bijou-cells/1` empty cell). |
| `1` | `GLYPH_KIND_ATLAS_MONO` | Atlas slot index (`0..65535`) | Sample `GlyphAtlas` at slot `payload`; monochrome coverage = `texel.a`; tint with resolved `fg`. |
| `2` | `GLYPH_KIND_ATLAS_COLOR` | Atlas slot index (`0..65535`) | Sample `GlyphAtlas` at slot `payload`; premultiplied sRGB RGBA color glyph (do not tint with `fg`). |
| `3` | `GLYPH_KIND_BRAILLE` | `codePoint - 0x2800` (`0..255`) | Procedural 2×4 Braille dot mask directly from the 8-bit Unicode payload (zero lookup table). |
| `4` | `GLYPH_KIND_BLOCK` | `codePoint - 0x2580` (`0..31`) | Index into static `BLOCK_GLYPHS[payload]` generated from `fixtures/bijou-gpu/procedural-glyphs.json`. |
| `5` | `GLYPH_KIND_BOX` | `codePoint - 0x2500` (`0..127`) | Index into static `BOX_GLYPHS[payload]` generated from `fixtures/bijou-gpu/procedural-glyphs.json`. |

### Pixel, cell-local, and atlas coordinates

For every integer physical output pixel `(px, py)` with `0 <= px < cols * cellPxW` and `0 <= py < rows * cellPxH` (origin `(0, 0)` at top-left, `+X` right, `+Y` down):

```text
col = floor(px / cellPxW)
row = floor(py / cellPxH)
cellLocalPx = (lx, ly) = (px - col * cellPxW, py - row * cellPxH)
uv = ((lx + 0.5) / cellPxW, (ly + 0.5) / cellPxH)
```

In fragment shaders:
- **WebGPU / native `wgpu`**: `@builtin(position).xy` is already at top-left pixel centers `(px + 0.5, py + 0.5)`, so `(px, py) = (u32(floor(pos.x)), u32(floor(pos.y)))`.
- **WebGL2**: `gl_FragCoord.y` has bottom-left origin, so convert `fragY = float(uCanvasPxH) - gl_FragCoord.y` and compute `(px, py) = (u32(floor(gl_FragCoord.x)), u32(floor(fragY)))`.

The `GlyphAtlas` is an `rgba8unorm` 2D texture of `atlasCols * cellPxW` by `atlasRows * cellPxH` physical pixels sampled with exact integer texel loads (`textureLoad` / `texelFetch` at LOD 0). For any slot index `s`:

```text
slotCol = s % atlasCols
slotRow = floor(s / atlasCols)
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
5. **Retained CPU staging buffer:** Every presenter retains its full `Uint32Array(widthCells * heightCells * 4)` staging buffer so context/device restoration can re-upload the complete frame without waiting for a new application render.
6. **Synchronous `present()` lifetime:** `present(current, target, ctx)` is synchronous. Callers must consume, pack, or copy every required byte and side-table string before `present()` returns because `bijou-tui`'s `RuntimeFramebuffers.adoptTarget()` immediately swaps/reuses the surface buffers in the `Output` stage.

## 5. Color space, blending, decorations, DPR, and `cellFromPoint` coordinate law

### Color space and swapchain format

- **Blend space:** **sRGB-direct** (operating directly on `[0..255] / 255.0` sRGB channel values with no hardware linear-to-sRGB or sRGB-to-linear conversion). This ensures terminal RGB bytes, WebGPU (`bgra8unorm` / `rgba8unorm`, never `-srgb`), WebGL2 (`RGBA8` default framebuffer), Canvas 2D, and `renderReferenceRgba()` produce matching sRGB hex values.
- **Channel resolution order:**
  1. `fg = (alpha_byte & 0x40) != 0 ? rgb(word1) : uDefaultFg`
  2. `bg = (alpha_byte & 0x80) != 0 ? rgb(word2) : uDefaultBg`
  3. If `(flags & FLAG_INVERSE) != 0`, swap `fg` and `bg`.
  4. If `(flags & FLAG_DIM) != 0`, `fg = mix(bg, fg, 0.5)` (50% attenuation toward resolved `bg`, staying legible on both dark and light themes).
  5. `cellOpacity = float(alpha_byte & 0x3Fu) / 63.0`.
  6. Resolved cell background over canvas backdrop: `baseBg = mix(uDefaultBg, bg, cellOpacity)`.
  7. For monochrome or procedural coverage `cov` in `[0, 1]`: `outRgb = mix(baseBg, fg, cov * cellOpacity)`.
  8. For premultiplied color-emoji sample `(emojiRgb, emojiA)` (`GLYPH_KIND_ATLAS_COLOR`): `outRgb = emojiRgb * cellOpacity + baseBg * (1.0 - emojiA * cellOpacity)`.
  9. Underlines and strikethrough evaluate after glyph compositing using `fg` with `cellOpacity` (`outRgb = mix(outRgb, fg, decoCov * cellOpacity)`).
  10. Final framebuffer alpha is `1.0` (opaque swapchain). In `renderReferenceRgba()`, each output channel `c` is quantized to `uint8` via `floor(clamp(c, 0.0, 1.0) * 255.0 + 0.5)`.

### Underline and strikethrough geometry (integer pixel rows, guaranteed non-vanishing)

To guarantee every decoration lights at least 1 physical pixel at all `cellPxH >= 1` (including 1x DPR `8×16` where fixed `0.06` UV bands vanish) with zero `f64`/`f32` tie divergence, define in pure integer arithmetic (`/` is integer floor division):

```text
decoPx   = max(1, (cellPxH * 6 + 50) / 100)
ulY0     = min(cellPxH - decoPx, (cellPxH * 88) / 100)
strikeY0 = (cellPxH - decoPx) / 2
```

- **`UNDERLINE_SOLID` (`0b01 << 4`):** `ly >= ulY0 && ly < ulY0 + decoPx`.
- **`UNDERLINE_DOTDASH` (`0b11 << 4`, `FLAG_DASHED == 0`, dotted):** `ly >= ulY0 && ly < ulY0 + decoPx && ((lx * 8) / cellPxW) % 2 == 0`.
- **`UNDERLINE_DOTDASH | FLAG_DASHED` (`dashed`):** `ly >= ulY0 && ly < ulY0 + decoPx && ((lx * 10) / cellPxW) % 5 < 3`.
- **`UNDERLINE_CURLY` (`0b10 << 4`):** `waveY = (cellPxH * 90) / 100.0 + (cellPxH * 0.03) * sin(uv.x * 4.0 * PI)`, `halfT = 0.5 * decoPx + 0.0625`; lit when `abs((ly + 0.5) - waveY) <= halfT` (since `0.0625 = 1/16` is exact in both IEEE-754 `f32` and `f64`, `halfT >= 0.5625 > 0.5` px guarantees every column `lx` hits at least one integer row `ly` without exact half-integer boundary ties).
- **`FLAG_STRIKETHROUGH` (`0x04`):** `ly >= strikeY0 && ly < strikeY0 + decoPx`.

### Physical pixels, fractional DPR, and letterboxed remainder

- Physical canvas dimensions `(canvasPxW, canvasPxH)` are read from `ResizeObserverEntry.devicePixelContentBoxSize` when available, falling back to `(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)))`.
- Physical cell dimensions are snapped to positive integers:
  `cellPxW = Math.max(1, Math.round(cellCssW * dpr))`
  `cellPxH = Math.max(1, Math.round(cellCssH * dpr))`
- Grid capacity is `cols = Math.floor(canvasPxW / cellPxW)`, `rows = Math.floor(canvasPxH / cellPxH)`.
- Origin is **top-left `(0, 0)`** (`+X` right, `+Y` down).
- Any remainder pixels outside `[0, cols * cellPxW) × [0, rows * cellPxH)` bypass `textureLoad` and emit solid `uDefaultBg`.

### `cellFromPoint(clientX, clientY)` coordinate law

Every presenter and the planned `@flyingrobots/bijou-web` input adapter ([`bijou#793`](https://github.com/flyingrobots/bijou/issues/793)) MUST implement the exact same **0-based** hit-test:

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

Both `#169` (TypeScript CPU reference oracle) and `#170` (canonical WGSL shader + `naga` GLSL ES 3.00 generator) MUST implement the exact closed-form rules below so `f64` (TypeScript) and `f32`/`i32` (WGSL/GLSL/Rust) match with zero pixel drift. Integer `/` denotes floor division.

### 7.1 Box-Drawing (`U+2500..U+257F`, 128 entries, 14 bits/entry)

Bit layout per entry in `BOX_GLYPHS[codePoint - 0x2500]`:
- `bits 0..1` = `L` (`left`), `bits 2..3` = `R` (`right`), `bits 4..5` = `U` (`up`), `bits 6..7` = `D` (`down`), each in `{0=none, 1=light, 2=heavy, 3=double}`.
- `bits 8..10` = `dash` in `{0=solid, 2=double-dash, 3=triple-dash, 4=quadruple-dash}`.
- `bit 11` = `rounded` (`1` for `U+256D..U+2570`).
- `bit 12` = `diagSlash` (`/` lower-left to upper-right), `bit 13` = `diagBackslash` (`\` upper-left to lower-right).

Closed-form geometry at integer cell-local pixel `(lx, ly)` with `W = cellPxW`, `H = cellPxH`:

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
2. **Diagonals (`diagSlash == 1 || diagBackslash == 1`, `U+2571..U+2573`):**
   ```text
   halfT  = max(0.55, 0.5 * float(lightPx))
   invLen = 1.0 / sqrt(float(W * W + H * H))
   slashLit     = diagSlash     && abs((float(lx) + 0.5) * float(H) + (float(ly) + 0.5) * float(W) - float(W * H)) * invLen <= halfT
   backslashLit = diagBackslash && abs((float(lx) + 0.5) * float(H) - (float(ly) + 0.5) * float(W)) * invLen <= halfT
   ```
3. **Rounded quarter-ellipse arcs (`rounded == 1`, `U+256D..U+2570`):**
   ```text
   cx2   = (R > 0) ? (2 * W) : 0
   cy2   = (D > 0) ? (2 * H) : 0
   nx    = float(2 * lx + 1 - cx2) / float(W)
   ny    = float(2 * ly + 1 - cy2) / float(H)
   dist  = sqrt(nx * nx + ny * ny)
   halfR = max(1.10, float(lightPx)) / float(min(W, H))
   lit   = abs(dist - 1.0) <= halfR
   ```
4. **Dashed lines (`dash ∈ {2, 3, 4}`, `U+2504..U+250B`, `U+254C..U+254F`):**
   - Horizontal (`L > 0 && R > 0`): `w = (L == 2) ? heavyPx : lightPx`; lit iff `ly >= hy0(w) && ly < hy0(w) + w && ((lx * 2 * dash) / W) % 2 == 0`.
   - Vertical (`U > 0 && D > 0`): `w = (U == 2) ? heavyPx : lightPx`; lit iff `lx >= vx0(w) && lx < vx0(w) + w && ((ly * 2 * dash) / H) % 2 == 0`.
5. **Solid single, heavy, mixed, and mitered double-line arms and junctions (`dash == 0 && rounded == 0 && !diag`):**
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
  `lit = (2 * lx + 1) * 4 >= x0 * W && (2 * lx + 1) * 4 < x1 * W && (2 * ly + 1) * 4 >= y0 * H && (2 * ly + 1) * 4 < y1 * H` (coverage `1.0` if lit else `0.0`).
- `kind == 1` (`shade`): `q = b & 3` (`1` = `0.25`, `2` = `0.50`, `3` = `0.75` uniform coverage across the cell).
- `kind == 2` (`quadrant`): `mask = b & 15` (`bit 0` TL, `bit 1` TR, `bit 2` BL, `bit 3` BR). Pure integer pixel-center quadrant test:
  `qx = ((2 * lx + 1) >= W) ? 1 : 0`, `qy = ((2 * ly + 1) >= H) ? 1 : 0`, `lit = ((mask >> (qx + 2 * qy)) & 1) != 0`.

### 7.3 Braille Patterns (`U+2800..U+28FF`, 256 entries, 0 table bytes)

8-bit dot mask `m = glyph_payload & 0xFFu` over a 2×4 grid (`col ∈ {0,1}`, `row ∈ {0,1,2,3}`), bit mapping `(0,0)=0`, `(0,1)=1`, `(0,2)=2`, `(1,0)=3`, `(1,1)=4`, `(1,2)=5`, `(0,3)=6`, `(1,3)=7`. Pure integer sub-cell test (exact pixel-center `[0.25, 0.75) × [0.20, 0.80)`):

```text
subCol = (2 * lx + 1) / W
subRow = (4 * ly + 2) / H
bitIdx = (subRow == 3) ? (6 + subCol) : (subCol * 3 + subRow)
subX   = (2 * lx + 1) - subCol * W
subY   = (4 * ly + 2) - subRow * H
inDot  = 4 * subX >= W && 4 * subX < 3 * W
      && 5 * subY >= H && 5 * subY < 4 * H
lit    = inDot && (((m >> bitIdx) & 1) != 0)
```

### Delivery into `bijou-surface.wgsl` (Decision: Generated Checked-In `const` Block)

`fixtures/bijou-gpu/procedural-glyphs.json` reaches `bijou-surface.wgsl` as a **deterministically generated, checked-in WGSL `const` block** (`const BOX_GLYPHS: array<u32, 128>` and `const BLOCK_GLYPHS: array<u32, 32>`) enforced by `#170`'s `--check` CI drift gate—**not** as a third GPU texture binding.

- **GPU bind group stays minimal (3 bindings total):**
  - `@binding(0)`: uniform buffer `BijouSurfaceUniforms` (`canvasPx`, `cellPx`, `gridCells`, `atlasCols`, `defaultFg`, `defaultBg`, `flags`).
  - `@binding(1)`: `texture_2d<u32>` (`rgba32uint` cell grid).
  - `@binding(2)`: `texture_2d<f32>` (`rgba8unorm` `GlyphAtlas`).
- **Zero edits required to `#170`, `#173`, or `#175`:** Downstream shader and presenter cards stay strictly aligned on these exact bindings.

## Nonclaims

- No GPU presenter, shader, atlas, or native `wgpu` implementation exists in Geordi yet.
- No performance figures or frame-time claims are made in this ABI; frame timings must be measured on named hardware and profiles after implementation lands.
- No wide (width-2) canonical glyph support in `bijou-surface-gpu/1`.
- No cursor overlay, OSC-8 hyperlink, or window-title side channels in `bijou-surface-gpu/1`.
- No GPU-side compute cell production in `bijou-surface-gpu/1`.
