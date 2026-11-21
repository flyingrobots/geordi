# Bijou Surface GPU ABI (`bijou-surface-gpu/1`)

**Status**: Accepted (Option A locked by `@flyingrobots` in Approval A on 2026-11-21; awaiting maintainer merge of PR #176)
**Date**: 2026-11-21
**Issue**: [#168](https://github.com/flyingrobots/geordi/issues/168)
**Downstream implementation issues**: [#169](https://github.com/flyingrobots/geordi/issues/169) (conformance kit), [#170](https://github.com/flyingrobots/geordi/issues/170) (canonical WGSL + `naga` GLSL generator), [#171](https://github.com/flyingrobots/geordi/issues/171) (dirty-union packer), [#172](https://github.com/flyingrobots/geordi/issues/172) (`GlyphAtlas`), [#173](https://github.com/flyingrobots/geordi/issues/173) (WebGL2), [#174](https://github.com/flyingrobots/geordi/issues/174) (Canvas 2D), [#175](https://github.com/flyingrobots/geordi/issues/175) (WebGPU), [#58](https://github.com/flyingrobots/geordi/issues/58) (native Rust `wgpu`)
**Upstream Bijou contracts read**: `flyingrobots/bijou` at `906666f9` (`packages/bijou/src/core/render/packed-cell.part01.ts`, `packages/bijou/src/core/packed-bijou-cells-contract.ts`, `packages/bijou/src/core/packed-bijou-cells-glyph-policy.ts`, `packages/bijou/src/ports/surface-contract.ts`, `packages/bijou/src/core/render/differ-packed.ts`, `docs/design/RE-510-geordi-native-gpu-host-for-bijou-cell-buffers.md`)
**Procedural glyph table**: [`fixtures/bijou-gpu/procedural-glyphs.json`](../../fixtures/bijou-gpu/procedural-glyphs.json) (`sha256: 7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46`)

## Reader job

This record freezes the endpoint-prepared GPU ABI (`bijou-surface-gpu/1`) that lets Geordi present Bijou's canonical `PackedSurface` (`packed-bijou-cells/1` / `bijou-packed-cell-u8x10-le/1`) across browser WebGPU, browser WebGL2, browser Canvas 2D fallback, and native Rust `wgpu` (`#58`) from one single contract and one single procedural glyph data table.

Statements about what exists today cite the file and revision they come from. Nothing in `packages/bijou-gpu/` is implemented yet; this ADR defines the load-bearing ABI before any atlas, packer, shader, or presenter code lands.

## Ownership boundary

Per [`docs/design/2026-06-portable-bijou-ui-render-endpoints.md`](./2026-06-portable-bijou-ui-render-endpoints.md) and Bijou `RE-510`:

- **Bijou owns** `packed-bijou-cells/1`, `bijou-packed-cell-u8x10-le/1`, width-1 canonical glyph policy, `PackedSurface` semantics, TEA runtime state, and `SurfacePresenter` invocation.
- **Geordi owns** `bijou-surface-gpu/1` endpoint preparation, `packages/bijou-gpu` (`@flyingrobots/geordi-bijou-gpu`), the procedural glyph data table, `GlyphAtlas`, canonical `bijou-surface.wgsl`, generated GLSL ES 3.00, browser and native GPU presenters, pixel probes, and endpoint receipts.

Geordi may present Bijou cells on the GPU. Geordi must not redefine Bijou cell semantics or invent canonical wide-cell rules.

## Options considered

| Option | Summary | Decision |
| --- | --- | --- |
| **Option A (Selected)** | **16-byte `rgba32uint` (`vec4<u32>` / `uvec4`) prepared cell texture (`textureLoad`) + procedural Braille, Block/Quadrant, and Box-Drawing driven by one checked-in per-codepoint data table compiled into a static WGSL `const` block + `packages/bijou-gpu`.** | **Accepted.** Single `textureLoad` per fragment, identical data path across WebGPU, WebGL2, and native `wgpu`, zero inter-cell box-drawing seams at any DPR, zero extra GPU texture bindings, and zero changes to Bijou's canonical 10-byte format. |
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
| `0` | `GLYPH_KIND_EMPTY` | `0` | No glyph coverage (`0.0`); still paints resolved `bg`, underlines, and strikethrough if set. Used for `CHAR_EMPTY`, `FLAG_EMPTY`, and ASCII space (`U+0020`). |
| `1` | `GLYPH_KIND_ATLAS_MONO` | Atlas slot index (`0..65535`) | Sample `GlyphAtlas` at slot `payload`; monochrome coverage = `texel.a`; tint with resolved `fg`. |
| `2` | `GLYPH_KIND_ATLAS_COLOR` | Atlas slot index (`0..65535`) | Sample `GlyphAtlas` at slot `payload`; premultiplied sRGB RGBA color glyph (do not tint with `fg`). |
| `3` | `GLYPH_KIND_BRAILLE` | `codePoint - 0x2800` (`0..255`) | Procedural 2×4 Braille dot mask directly from the 8-bit Unicode payload (zero lookup table). |
| `4` | `GLYPH_KIND_BLOCK` | `codePoint - 0x2580` (`0..31`) | Index into static `BLOCK_GLYPHS[payload]` generated from `fixtures/bijou-gpu/procedural-glyphs.json`. |
| `5` | `GLYPH_KIND_BOX` | `codePoint - 0x2500` (`0..127`) | Index into static `BOX_GLYPHS[payload]` generated from `fixtures/bijou-gpu/procedural-glyphs.json`. |

### Atlas slot indexing

The `GlyphAtlas` is an `rgba8unorm` 2D texture of `atlasCols * cellPxW` by `atlasRows * cellPxH` physical pixels sampled with nearest-neighbor addressing (`textureLoad` / `GL_NEAREST`). For any slot index `s`:

```text
slotCol = s % atlasCols
slotRow = s / atlasCols
atlasOriginPx = (slotCol * cellPxW, slotRow * cellPxH)
samplePx = atlasOriginPx + cellLocalPx
```

Atlas keys are `(grapheme, bold)` because Bijou's `OFF_FLAGS` encodes `FLAG_BOLD` (`bit 0`) and does not have an italic bit in `bijou-packed-cell-u8x10-le/1`.

### Canonical hex test vectors

Every downstream packer (`#171`), reference oracle (`#169`), and native host (`#58`) MUST agree byte-for-byte with these prepared `uvec4` test vectors:

| Vector | Source Cell Description | `word0` | `word1` | `word2` | `word3` |
| --- | --- | --- | --- | --- | --- |
| `V0` | Empty cell (`CHAR_EMPTY`, default fg/bg, `FLAG_EMPTY`, opacity `63`) | `0x00000000` | `0x80000000` | `0x3F000000` | `0x00000000` |
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

for both direct BMP codepoints and `sideTable` entries.

`bijou-surface-gpu/1` strictly obeys this width-1 contract:

- Direct single-cell graphemes (`U+0021..U+EFFF` with width 1) and canonical width-1 `sideTable` graphemes (such as decomposed `e` + combining acute accent `U+0065 U+0301` and private-use `U+F000`, matching Bijou `RE-510`) are supported.
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

## 5. Color space, blending, DPR, and `cellFromPoint` coordinate law

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
  10. Final framebuffer alpha is `1.0` (opaque swapchain).

### Underline and strikethrough geometry (normalized cell `uv` in `[0, 1] × [0, 1]`, top-left origin)

- **`UNDERLINE_SOLID` (`0b01 << 4`):** `uv.y >= 0.88 && uv.y < 0.94`.
- **`UNDERLINE_CURLY` (`0b10 << 4`):** `abs(uv.y - (0.90 + 0.03 * sin(uv.x * 2.0 * PI * 2.0))) < 0.03` (2 full wave cycles per cell so adjacent cells join continuously without phase discontinuities).
- **`UNDERLINE_DOTDASH` (`0b11 << 4`, `FLAG_DASHED == 0`, dotted):** `uv.y >= 0.88 && uv.y < 0.94 && fract(uv.x * 4.0) < 0.5`.
- **`UNDERLINE_DOTDASH | FLAG_DASHED` (`dashed`):** `uv.y >= 0.88 && uv.y < 0.94 && fract(uv.x * 2.0) < 0.6`.
- **`FLAG_STRIKETHROUGH` (`0x04`):** `uv.y >= 0.47 && uv.y < 0.53`.

### Physical pixels, fractional DPR, and letterboxed remainder

- Physical canvas dimensions `(canvasPxW, canvasPxH)` are read from `ResizeObserverEntry.devicePixelContentBoxSize` when available, falling back to `(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)))`.
- Physical cell dimensions are snapped to positive integers:
  `cellPxW = Math.max(1, Math.round(cellCssW * dpr))`
  `cellPxH = Math.max(1, Math.round(cellCssH * dpr))`
- Grid capacity is `cols = Math.floor(canvasPxW / cellPxW)`, `rows = Math.floor(canvasPxH / cellPxH)`.
- Origin is **top-left `(0, 0)`** (`+X` right, `+Y` down; WebGL2 shaders convert `gl_FragCoord.y` via `fragY = float(uCanvasPxH) - gl_FragCoord.y`).
- Any remainder pixels outside `[0, cols * cellPxW) × [0, rows * cellPxH)` bypass `textureLoad` and emit solid `uDefaultBg`.

### `cellFromPoint(clientX, clientY)` coordinate law

Every presenter and `@flyingrobots/bijou-web` input adapter MUST implement the exact same **0-based** hit-test:

```text
localCssX = clientX - rect.left
localCssY = clientY - rect.top
physX = localCssX * (canvasPxW / rect.width)
physY = localCssY * (canvasPxH / rect.height)
col = clamp(Math.floor(physX / cellPxW), 0, cols - 1)
row = clamp(Math.floor(physY / cellPxH), 0, rows - 1)
```

- Origin is `(0, 0)` at top-left.
- Cell `[col, row]` covers physical pixels `[col * cellPxW, (col + 1) * cellPxW)` × `[row * cellPxH, (row + 1) * cellPxH)` (start inclusive, end exclusive).
- Coordinates in the letterboxed remainder or outside the canvas clamp into `[0, cols - 1]` and `[0, rows - 1]`. When `cols === 0 || rows === 0`, return `null`.

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
  "fontIdentity": "<font-family-and-size-or-bundled-test-font-sha256>",
  "atlasGeneration": 1,
  "atlasStats": { "usedSlots": 42, "capacity": 1024, "monoCount": 41, "colorEmojiCount": 1 },
  "probePolicy": "srgb-exact-or-declared-tolerance",
  "probes": []
}
```

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

### Coverage and compact `u32` encoding

1. **Box-Drawing (`U+2500..U+257F`, 128 entries, 14 bits/entry):**
   - `bits 0..1` = `left`, `bits 2..3` = `right`, `bits 4..5` = `up`, `bits 6..7` = `down` (`0` none, `1` light, `2` heavy, `3` double).
   - `bits 8..10` = `dash` (`0` solid, `2` double-dash, `3` triple-dash, `4` quadruple-dash).
   - `bit 11` = `rounded` (`U+256D..U+2570` quarter-circle arcs).
   - `bit 12` = `diagSlash` (`/` lower-left to upper-right), `bit 13` = `diagBackslash` (`\` upper-left to lower-right).
   - Stroke thickness in cell UV: light stroke width `tLight = 1.0 / cellPxW` (horizontal vertical-bar thickness) and `1.0 / cellPxH` (vertical horizontal-bar thickness) scaled to at least `max(1px, round(0.10 * cellPxW))`; heavy = `2 * tLight`; double = two light strokes separated by `tLight` centered on `0.5`. Both `T2.1b`'s CPU reference oracle and `T2.1c`'s WGSL shader implement this exact thickness rule.
2. **Block Elements (`U+2580..U+259F`, 32 entries, 18 bits/entry):**
   - `bits 16..17` = `kind` (`0` rect, `1` shade, `2` quadrant).
   - `kind == 0` (`rect`): `bits 0..3 = x0`, `4..7 = y0`, `8..11 = x1`, `12..15 = y1` in integer eighths `[0..8]`, top-left origin (`uv.x * 8.0 >= x0 && uv.x * 8.0 < x1 && uv.y * 8.0 >= y0 && uv.y * 8.0 < y1`).
   - `kind == 1` (`shade`): `bits 0..1 = quarter` (`1` = `0.25`, `2` = `0.50`, `3` = `0.75` uniform coverage in `bijou-surface-gpu/1`).
   - `kind == 2` (`quadrant`): `bits 0..3 = mask` (`bit 0` TL, `bit 1` TR, `bit 2` BL, `bit 3` BR) tested against `(uv.x >= 0.5, uv.y >= 0.5)`.
3. **Braille Patterns (`U+2800..U+28FF`, 256 entries, 0 table bytes):**
   - 8-bit dot mask `m = glyph_payload & 0xFFu`.
   - 2×4 grid (`col` in `0..1`, `row` in `0..3`), dot bit mapping: `(0,0)=bit0`, `(0,1)=bit1`, `(0,2)=bit2`, `(1,0)=bit3`, `(1,1)=bit4`, `(1,2)=bit5`, `(0,3)=bit6`, `(1,3)=bit7`.
   - Inside each sub-cell `(subU, subV)` in `[0, 1] × [0, 1]`, dot is lit when `subU >= 0.25 && subU < 0.75 && subV >= 0.20 && subV < 0.80` (crisp pixel-aligned dot rect in both CPU oracle and WGSL/GLSL).

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
