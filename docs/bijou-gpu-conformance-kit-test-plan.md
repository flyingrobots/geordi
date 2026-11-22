# Bijou GPU Conformance Kit Test Plan

Contract ledger for [`bijou-gpu-conformance-kit.md`](./bijou-gpu-conformance-kit.md). Each row
names a requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from
[flyingrobots/geordi#169](https://github.com/flyingrobots/geordi/issues/169) and the
[design record](./design/2026-11-bijou-surface-gpu-abi.md).

Test files are under `packages/bijou-gpu/`. Run them with:

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

Every row is implemented.

## Presenter contract

| ID | Case | Oracle | Test (`src/presenter.test.ts`) |
| --- | --- | --- | --- |
| BG-PRES-01 | Factory returns a presenter or a promise of one | Type equality and runtime shape | `returns GpuSurfacePresenter \| Promise<GpuSurfacePresenter>` |
| BG-PRES-02 | One caller drives sync and async backends | All five presenter methods called through both | `lets one caller await synchronous and asynchronous backends alike` |
| BG-PRES-03 | Unavailable backend is a typed refusal | `BackendUnavailableError` from a throwing and a rejecting factory | `surfaces an unavailable backend as a typed refusal from either factory shape` |
| BG-PRES-04 | Refusal and fault are distinct | Neither is an instance of the other; distinct codes | `are distinct typed errors with distinct stable codes` |
| BG-PRES-05 | `cellFromPoint` law | Hand-computed cells, clamping, and null cases | `maps client coordinates to zero-based cells with start-inclusive, end-exclusive spans`; `clamps the letterboxed remainder and points outside the canvas into the grid`; `returns null for an empty grid or non-finite or non-positive host geometry` |

## Width-1 fixtures

| ID | Case | Oracle | Test (`src/packed-cells.test.ts`) |
| --- | --- | --- | --- |
| BG-FIX-01 | Paint and erase frames validate strictly | `parsePackedBijouCellsReceipt` accepts both | `validates the checked-in paint and erase frames strictly under the width-1 glyph policy` |
| BG-FIX-02 | Frame files are pinned | SHA-256 of file bytes equals the manifest | `pins each frame file to the inputReceiptSha256 recorded in the suite manifest` |
| BG-FIX-03 | Cell bytes match their labels | Bytes re-derived from each manifest label | `encodes every labelled cell exactly as the suite manifest declares it` |
| BG-FIX-04 | `RE-510` glyphs present | `A`, `U+0065 U+0301`, `U+F000`, empty cell | `carries the RE-510 glyphs: A, decomposed e + combining acute, U+F000, and an empty cell` |
| BG-FIX-05 | Coverage of required cases | Every modifier, presence bit, partial opacity, procedural family | `covers every modifier, underline style, presence bit, partial opacity, and procedural family` |
| BG-FIX-06 | Paint → erase pair | Erased cells are the canonical empty cell | `erase frame clears every cell except the retained one and drops the side table` |
| BG-FIX-07 | Bijou's own fixture is accepted | Bijou `RE-036` receipt bytes | `accepts the byte-identical Bijou RE-036 canonical receipt` |
| BG-FIX-08 | Width-2 negative fixture | `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` at `$.bytes[0]` | `rejects the checked-in negative width-2 fixture with GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` |
| BG-FIX-09 | Width-2 side-table graphemes | Same code at the side-table path | `rejects a width-2 emoji side-table grapheme with a typed validation error`; `rejects an emoji-presentation sequence that widens a narrow base` |
| BG-FIX-10 | Malformed receipts | `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` at the offending path | `rejects %s` (19 cases); `rejects metadata that does not describe the grid`; `rejects non-object input` |
| BG-FIX-11 | Fixtures match their generator | Generated text equals checked-in text | `scripts/generate-bijou-gpu-conformance-fixtures.mjs --check` (package `test` script) |

## Test glyph pack

| ID | Case | Oracle | Test (`src/test-glyph-pack.test.ts`) |
| --- | --- | --- | --- |
| BG-PACK-01 | Checked-in pack equals the bundled pack | Byte equality of atlas, slots, digest | `is byte-identical to the checked-in fixtures/bijou-gpu/test-glyph-pack.json`; `is pinned by the suite manifest digest` |
| BG-PACK-02 | Deterministic | Same digest on every build | `builds identical bytes on every call and identifies itself by atlas digest` |
| BG-PACK-03 | Covers the suite | Every non-procedural suite cell has a slot | `covers every atlas glyph the width-1 suite needs, in regular and bold` |
| BG-PACK-04 | Exercises coverage blending | Alphas 0, 64, 128, 255; premultiplied colour | `carries full, partial, and zero coverage and premultiplied colour texels` |

## Numeric law

| ID | Case | Oracle | Test (`src/numeric.test.ts`) |
| --- | --- | --- | --- |
| BG-NUM-01 | `bunny-u32-div-round-even/1` | Bunny's pinned vectors (1,720), file digest equals the pin | `matches every vector in the pinned Bunny fixture, whose bytes match the ABI pin` (div) |
| BG-NUM-02 | No `2 * r` overflow | `3000000000 / 4000000000 = 1` | `compares r with d - r and never forms 2 * r, which would wrap in u32` |
| BG-NUM-03 | Ties to even, zero divisor, domain | Hand values | `rounds exact ties to the even quotient`; `reports a zero divisor as DivisionByZero and refuses it in the scalar form`; `rejects operands that are not unsigned 32-bit integers` |
| BG-NUM-04 | `bunny-u32-ellipse-classify/1` | Bunny's pinned vectors (1,444), file digest equals the pin | `matches every vector in the pinned Bunny fixture, whose bytes match the ABI pin` (ellipse); `handles degenerate semi-axes before the polynomial and reports out-of-domain operands` |
| BG-NUM-05 | SHA-256 | `node:crypto` | `pure-TypeScript sha256Hex agrees with node:crypto across block boundaries` |

## Procedural geometry

| ID | Case | Oracle | Test (`src/procedural.test.ts`) |
| --- | --- | --- | --- |
| BG-PROC-01 | Table identity and decode | Pinned SHA-256; packed words recomputed from fields | `is the table the ABI pins and decodes to 128 box and 32 block words`; `rejects a table whose packed word drifts from its documented fields`; `rejects a table with the wrong schema or a truncated section` |
| BG-PROC-02 | Option E4 `2×2` asymmetry | Bitmaps from the design record | `reproduces the 2x2 directional asymmetry: only the down-right arc bypasses Case 1` |
| BG-PROC-03 | Option E4 small cells | Bitmaps from the design record | `reproduces the ABI small-cell bitmaps` |
| BG-PROC-04 | Option E4 `2×14`, `28×2`, `15×2` | Pinned regression bitmaps, all four corners | `pins the 2x14, 28x2, and 15x2 regression bitmaps for all four corners` |
| BG-PROC-05 | Join sandwich gate | `stroke ⊆ edge ⊆ sharp-corner edge`, single 8-connected component, non-empty, over 409 sizes × 4 corners | `holds stroke mask <= edge mask <= sharp-corner edge mask, stays connected, and never vanishes` |
| BG-PROC-06 | Box strokes | Hand-derived rows | `draws light, heavy, double, dashed, and diagonal box strokes` |
| BG-PROC-07 | Block Elements | Hand-derived pixel-centre results | `classifies block rects, shades, and quadrants by pixel centre`; `assigns the centre column and row of an odd cell to the right and lower quadrants` |
| BG-PROC-08 | Braille | Hand-derived dot bitmaps; every dot visible at `2×5` | `lights braille dots inside each sub-cell and keeps every dot visible at 2x5` |
| BG-PROC-09 | Decorations | Hand-derived rows and wave | `places solid, dotted, dashed, and strikethrough decorations on their integer rows`; `scales decoration thickness and rows with cell height (10x50)`; `traces the two-cycle curly underline triangle wave at 16x32`; `never lets a decoration vanish for any valid cell size` |

## Reference oracle

| ID | Case | Oracle | Test (`src/reference.test.ts`) |
| --- | --- | --- | --- |
| BG-REF-01 | Prepared cell record | Design record vectors V0–V5 and the V1 byte string | `agrees byte-for-byte with the ABI canonical hex vectors V0 through V5`; `serialises V1 to the canonical little-endian 16 bytes` |
| BG-REF-02 | Empty lowering and missing slots | `GLYPH_KIND_EMPTY`; `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` | `lowers live CHAR_EMPTY, FLAG_EMPTY, and ASCII space to the empty glyph kind`; `refuses a glyph with no declared atlas slot instead of falling back to a host font` |
| BG-REF-03 | Golden frames | Manifest digests | `reproduces the suite golden digests for the paint and erase frames` |
| BG-REF-04 | Canonical buffer and digest | Length, opacity, `node:crypto` | `emits a tight top-left row-major opaque RGBA8 buffer with a lowercase 64-hex SHA-256` |
| BG-REF-05 | Letterbox | Every remainder pixel is `defaultBg` | `fills the letterboxed remainder outside the grid with solid uDefaultBg` |
| BG-REF-06 | Glyphs and colour | Hand-derived RGBA | `RE-510 glyphs: A, decomposed e + acute, U+F000, and the empty cell`; `fg/bg RGB and default presence bits`; `premultiplied colour glyph ignores fg and composites over the cell background` |
| BG-REF-07 | Every flag | Hand-derived RGBA | `bold selects the bold atlas slot`; `dim attenuates fg halfway toward bg with ties to even`; `inverse swaps resolved fg and bg, including terminal defaults`; `strikethrough lights exactly its integer row, with or without a glyph` |
| BG-REF-08 | Every underline | Hand-derived rows | `all four underline styles` |
| BG-REF-09 | Opacity | Hand-derived RGBA | `partial opacity blends the cell over the canvas backdrop in sRGB-direct space`; `blends decorations and colour glyphs through opacity, not straight to fg` |
| BG-REF-10 | Every procedural family | Hand-derived bitmaps and RGBA | `box drawing: light, heavy, double, junctions, arcs, diagonals, and dashes`; `block elements: rects, quadrants, and quarter-coverage shades`; `braille dots` |
| BG-REF-11 | Probe helper | Exact match and mismatch report | `assertPixelProbes passes exact probes and reports every mismatch` |
| BG-REF-12 | No gamma double-conversion | 50% white over black is 128 | `does not gamma-convert: a 50% shade of white over black is 128, not linear-light 188` |
| BG-REF-13 | Paint → erase | Erased cells are `defaultBg`; retained cell unchanged | `erase leaves no residual fg or bg from the paint frame in any erased cell`; `erase keeps the retained cell pixel-identical to the paint frame`; `paint -> erase changes every painted cell that had visible content` |
| BG-REF-14 | Empty grids | Empty or all-`defaultBg` frame | `handles a 0x0 grid safely, with and without a canvas`; `handles a zero-width or zero-height grid safely` |
| BG-REF-15 | Call shapes and bad input | Four-argument call; typed errors | `accepts the four-argument call and a live PackedSurface shape`; `rejects invalid cell metrics, canvases, colours, byte lengths, and atlas slots` |
| BG-REF-16 | Option E4 through the rasteriser | Regression bitmaps at `2×2`, `2×14`, `28×2`, `15×2` | `renders the Option E4 regression sizes through the full rasteriser` |
| BG-REF-17 | Other cell sizes | Curly wave at `16×32`; `256×256` bound | `renders the curly underline wave and decorations at 16x32 and at the 256x256 metric bound` |
| BG-REF-18 | Determinism | Equal SHA-256 across repeated runs of 24 random `16×8` grids | `renders random 16x8 width-1 fixtures to identical SHA-256 digests across repeated runs` |

## Endpoint receipt

| ID | Case | Oracle | Test (`src/receipt.test.ts`) |
| --- | --- | --- | --- |
| BG-RCPT-01 | Serialised receipt validates | Round trip equality | `validates a serialised software-probed receipt bound to the oracle frame`; `accepts a well-formed %s %s receipt` (7 cases) |
| BG-RCPT-02 | Deterministic | Same ordered issue list | `is deterministic: the same input always yields the same ordered issue list` |
| BG-RCPT-03 | Five distinct evidence levels | Enumeration and rejection of others | `keeps the five evidence levels distinct` |
| BG-RCPT-04 | Refusal cannot claim pixels | Issue on `frameRgbaSha256` and on `probes` | `fails a capability refusal that claims a rendered frame digest`; `fails a capability refusal that claims readback probes`; `does not let a refusal pass as software-probed or gpu-probed evidence` |
| BG-RCPT-05 | Probed evidence needs probes | Issue on `probes` | `rejects gpu-probed evidence with zero probes` |
| BG-RCPT-06 | `frameRgbaSha256` nullability | Null exactly for the three unprobed levels | `requires a null frame digest and no probes for %s evidence` (2 cases); `requires frameRgbaSha256 to be present even when it is null` |
| BG-RCPT-07 | Shader identity | Per-backend rules | `rejects a receipt missing its shader hash`; `binds shaderSha256 to the active backend shader text` |
| BG-RCPT-08 | Canvas 2D identity | Null shader digest, required executed artifact digest | `pins Canvas 2D by executed artifact digest with a null shader hash` |
| BG-RCPT-09 | Pinned dependencies | Exact Bunny pins and table digest | `rejects drifted Bunny primitive pins and a drifted procedural table digest` |
| BG-RCPT-10 | Implementation manifest digest | Stable; changes with artifact and backend only | `derives a content-addressed implementation manifest digest from the identity chain` |
| BG-RCPT-11 | Malformed receipts | Issue text | `rejects %s` (12 cases); `rejects non-object input without throwing` |
| BG-RCPT-12 | Bit-exact frame gate | Pass on equality; fail on one flipped bit | `accepts a receipt whose frame hashes exactly to the oracle frame`; `rejects a single least-significant-bit difference`; `rejects receipts with no frame digest, another canvas, or another prepared buffer` |

## Browser probe harness

| ID | Case | Oracle | Test (`e2e/harness.e2e.ts`) |
| --- | --- | --- | --- |
| BG-HARN-01 | Harness boots cleanly | No page or console errors; assets identified; in-browser digests equal the manifest | `boots cleanly with the bundled test glyph pack and reproduces the oracle goldens` |
| BG-HARN-02 | Reference canvas shows the oracle | Canvas readback equals the Node oracle | `reference canvas pixels equal the oracle for the paint and erase frames` |

## Not covered

- No GPU, WebGL2, WebGPU, or Canvas 2D presenter is tested; none exists.
- The harness runs in Chrome only.
- Bijou's validator is mirrored, not imported. Agreement is checked on Bijou's `RE-036` receipt
  and the cases above, not exhaustively.
