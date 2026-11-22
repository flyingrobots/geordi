# Bijou GPU Conformance Kit Reference

**Package**: `@flyingrobots/geordi-bijou-gpu` (`packages/bijou-gpu`)
**ABI**: `bijou-surface-gpu/1`
**Receipt**: `geordi-bijou-gpu-receipt/1`
**Fixtures**: [`fixtures/bijou-gpu/`](../fixtures/bijou-gpu/)
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md)
**Evidence ledger**: [`bijou-gpu-conformance-kit-test-plan.md`](./bijou-gpu-conformance-kit-test-plan.md)

This page describes what exists on `main`: the shared presenter contract, the width-1 fixture
suite, the endpoint receipt validator, the CPU reference oracle, and the browser probe harness.
The design record is the normative source for every equation; this page says how the kit
exposes them.

> **Not claimed.** Geordi has no GPU presenter, dirty-union packer, or `GlyphAtlas`. The kit
> renders on the CPU only. The canonical shader is described in
> [`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md) and is checked against this kit's oracle. The
> remaining components are tracked in
> [flyingrobots/geordi#171](https://github.com/flyingrobots/geordi/issues/171) through
> [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175) and
> [flyingrobots/geordi#58](https://github.com/flyingrobots/geordi/issues/58).

## Ownership

Bijou owns `packed-bijou-cells/1`, the `bijou-packed-cell-u8x10-le/1` cell, and the width-1
glyph policy. The kit's validator mirrors Bijou's validator at `flyingrobots/bijou@906666f9` so
that a Geordi endpoint can refuse input with a Geordi error code. It is a mirror, not an import:
Bijou publishes no validator Geordi can depend on. It must never accept what Bijou rejects and
never defines new cell semantics. It is knowingly stricter in one place: a side-table string
containing a lone UTF-16 surrogate is refused.

Bunny owns `bunny-u32-div-round-even/1` and `bunny-u32-ellipse-classify/1`. The kit carries a
TypeScript reference of each and checks it against Bunny's own vector fixtures, vendored
byte-for-byte under [`fixtures/bijou-gpu/bunny/`](../fixtures/bijou-gpu/bunny/) and pinned by the
SHA-256 digests in the design record.

## Presenter contract

| Export | Meaning |
| --- | --- |
| `GpuSurfacePresenter` | `present(current, target, ctx)`, `resize(size)`, `cellFromPoint(clientX, clientY)`, `getLastReceipt()`, `dispose()`. |
| `GpuSurfacePresenterFactory<Options>` | `(options) => GpuSurfacePresenter \| Promise<GpuSurfacePresenter>`. WebGL2 and Canvas 2D may return synchronously; WebGPU returns a promise. |
| `createGpuSurfacePresenter(factory, options)` | Awaits either shape. |
| `GpuPackedSurface` | The structural slice of Bijou's `PackedSurface` a presenter reads: `width`, `height`, `buffer`, `sideTable`, `renderDirtyWords`. |
| `cellFromPoint(geometry, rect, clientX, clientY)` | The shared zero-based host-boundary hit-test. Returns `null` for an empty grid or non-finite or non-positive host geometry; otherwise clamps into the grid. |
| `BackendUnavailableError` | The backend cannot be created on this host. Witnesses `capability-refused`; never a pass. |
| `RendererFaultError` | An available backend failed while preparing, drawing, or reading back. |

`BackendUnavailableError` and `RendererFaultError` are unrelated classes with distinct codes, so
a refusal can never be caught as a fault or the reverse.

`GpuPresentContext` currently carries one optional field, `forceFullRefresh`. Bijou's
`SurfacePresenter` seam is still planned
([flyingrobots/bijou#791](https://github.com/flyingrobots/bijou/issues/791)); the context grows
with it.

## Width-1 fixture suite

All files are under `fixtures/bijou-gpu/`. They are written and drift-checked by
`scripts/generate-bijou-gpu-conformance-fixtures.mjs`.

| File | Content |
| --- | --- |
| `width1-paint.packed-bijou-cells.json` | Frame 0. An 8 × 7 `packed-bijou-cells/1` receipt, one labelled cell per case. |
| `width1-erase.packed-bijou-cells.json` | Frame 1. Every cell cleared to the canonical empty cell except `glyph-ascii-a`; the side table is empty. |
| `negative-width2.packed-bijou-cells.json` | A width-2 CJK ideograph (`U+6F22`) encoded directly in a cell. Must be refused. |
| `test-glyph-pack.json` | The test glyph atlas as hex rows, for hosts that cannot run TypeScript. |
| `width1-conformance-suite.json` | The manifest: cell metrics, canvas size, theme defaults, the label and attributes of every cell, the SHA-256 of each frame file (`inputReceiptSha256`), and the oracle golden digests. |
| `procedural-glyphs.json` | The procedural glyph table frozen by the design record. |
| `bunny/*.json` | Bunny's pinned vector fixtures. |

The paint frame covers the `RE-510` glyphs (`A`, decomposed `e` + `U+0301`, private-use
`U+F000`, an empty cell), foreground and background RGB, both terminal-default presence bits,
bold, dim, inverse, strikethrough, the four underline styles, partial and zero opacity, a
premultiplied colour glyph, Box-Drawing (light, heavy, double, mixed, rounded arcs, diagonals,
dashes), Block Elements (rects, shades, quadrants), and Braille.

The suite renders at 8 × 16 pixel cells on a 67 × 117 canvas. The 3 extra columns and 5 extra
rows are the letterboxed remainder, which must be solid `defaultBg`.

Regenerate after changing the cell table or the glyph pack:

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu build
node scripts/generate-bijou-gpu-conformance-fixtures.mjs --write
```

`--check` exits non-zero and names the stale files instead of writing. The package `test` script
runs it. The script prints one JSON object per line.

## Packed-cell validator

`parsePackedBijouCellsReceipt(json)` returns a typed receipt or throws
`BijouGpuValidationError` with a `code`, a JSON `path`, and a `detail`.

| Input | Code |
| --- | --- |
| A cell or side-table entry holding one terminal-safe grapheme of width 2 | `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` |
| Anything else Bijou's validator rejects | `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` |

Width is computed as Bijou computes it: one extended grapheme cluster, wide if it contains a
code point in Bijou's wide table or an emoji presentation selector (`U+FE0F`).

## CPU reference oracle

```ts
renderReferenceRgba(surface, atlasBitmap, slotMap, proceduralTable, options?)
```

| Argument | Type | Meaning |
| --- | --- | --- |
| `surface` | `ReferenceSurface` | `widthCells`, `heightCells`, `bytes` (10 per cell, row-major), `sideTable`. A parsed receipt satisfies it; `referenceSurfaceFromPackedSurface()` adapts a live `PackedSurface`. |
| `atlasBitmap` | `AtlasBitmap` | An explicit `rgba8uint` atlas: `cellPxW`, `cellPxH`, `atlasCols`, `atlasRows`, `rgba`. Cell metrics come from here and must be in `1..256`. |
| `slotMap` | `GlyphSlotMap` | Atlas slot and kind (`mono` or `color`) per `(grapheme, bold)`. Built with `createGlyphSlotMap()`. |
| `proceduralTable` | `ProceduralGlyphTable` | From `decodeProceduralGlyphTable()`. |
| `options.canvasPxW`, `options.canvasPxH` | integer | Physical canvas size. Defaults to the exact grid size. Must not be smaller than the grid. |
| `options.defaultFg`, `options.defaultBg` | `#RRGGBB` uppercase | Theme defaults. Default to `REFERENCE_DEFAULT_FG` (`#E6EDF3`) and `REFERENCE_DEFAULT_BG` (`#0D1117`). |

It returns a `ReferenceFrame`:

| Field | Meaning |
| --- | --- |
| `rgba` | Tight top-left row-major RGBA8, exactly `canvasPxW * canvasPxH * 4` bytes, alpha always 255. |
| `frameRgbaSha256` | Lowercase 64-hex SHA-256 of `rgba`. |
| `preparedCells` | The prepared `rgba32uint` cell words, four per cell. |
| `preparedBufferSha256` | SHA-256 of the little-endian bytes of `preparedCells`. |
| `canvasPxW`, `canvasPxH`, `cellPxW`, `cellPxH`, `widthCells`, `heightCells`, `defaultFg`, `defaultBg` | The inputs the frame was rendered with. |

Behaviour worth knowing:

- All arithmetic is unsigned integer and sRGB-direct. No value is gamma-converted.
- A cell is lowered to `GLYPH_KIND_EMPTY` when its code is `0`, its code is `U+0020`, or
  `FLAG_EMPTY` is set. Braille, Block Elements, and Box-Drawing code points lower to their
  procedural kinds. Every other grapheme needs a slot.
- A grapheme with no slot for its `(grapheme, bold)` key throws
  `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT`. There is no font fallback.
- The oracle is stateless. It renders one whole frame from one surface and tracks no damage, so
  an erased cell cannot keep pixels from an earlier frame.
- A `0 × 0` grid yields an empty frame, or a frame of solid `defaultBg` when a canvas size is
  given.

`prepareReferenceCells()` and `preparedBufferBytes()` expose the lowering on its own. The
dirty-union packer
([flyingrobots/geordi#171](https://github.com/flyingrobots/geordi/issues/171)) must agree with
it word-for-word.

Probe helpers: `readPixel(frame, px, py)`, `samplePixelProbes(frame, points)`,
`findPixelProbeMismatches(frame, probes)`, and `assertPixelProbes(frame, probes)`, which throws
`PixelProbeMismatchError` listing every mismatch. Comparison is exact.

`sha256Hex(bytes)` is a synchronous SHA-256 with no platform dependency, so the same digest code
runs in Node and in a browser.

### Test glyph pack

`createTestGlyphPack()` returns `atlasBitmap`, `slotMap`, `fontIdentity`, `atlasRgbaSha256`, and
`atlasStats`. It is not a font. Each of its eight slots is an explicit hand-authored 8 × 16
bitmap: `A`, decomposed `e` + acute, and `U+F000`, each in regular and bold, plus a premultiplied
colour heart (`U+2665`) under both keys. Monochrome slots use coverage values 0, 64, 128, and
255.

## Endpoint receipt validator

`validateEndpointReceipt(json)` returns `{ ok: true, receipt }` or `{ ok: false, issues }` and
never throws. Issues are listed in schema field order, so the same input always gives the same
list. `parseEndpointReceipt(json)` throws `EndpointReceiptValidationError` instead.
`serializeEndpointReceipt(receipt)` writes canonical JSON with sorted keys.

The field list is the one in the design record. Unknown fields are rejected. Beyond field shape,
the validator enforces:

| Rule | Detail |
| --- | --- |
| Pinned dependencies | `proceduralTableSha256` and `bunnyPrimitives` must equal the pinned values exactly. |
| Shader identity, `webgl2` | `assembledWgslSha256` and `generatedGlslSha256` required; `shaderSha256` equals `generatedGlslSha256`. |
| Shader identity, `webgpu` and `wgpu` | `assembledWgslSha256` required; `generatedGlslSha256` null; `shaderSha256` equals `assembledWgslSha256`. |
| Shader identity, `canvas2d` | All three shader digests null. |
| Executed artifact | `executedArtifactSha256` is required for every backend, Canvas 2D included. |
| Probed evidence | `software-probed` and `gpu-probed` require a non-null `frameRgbaSha256`, at least one probe, and a non-empty `adapter.name`. |
| Unprobed evidence | `shader-validated`, `unit-upload`, and `capability-refused` require `frameRgbaSha256: null` and no probes. A refusal that claims pixels fails. |
| Geometry | `cellPx` in `1..256`; `canvasPxW >= widthCells * cellPx.width` and likewise for height. |
| Colours | `defaultFg` and `defaultBg` are uppercase `#RRGGBB`. |
| Atlas stats | `usedSlots <= capacity` and `usedSlots == monoCount + colorEmojiCount`. |

Two things the kit defines that the design record leaves open:

- **Probe shape.** A probe is `{ "px", "py", "rgba": [r, g, b, 255] }`, with `(px, py)` inside
  the canvas.
- **`backendProfile` shape.** `geordi-<name>/<version>`, for example `geordi-webgl2/1`.

`implementationManifestSha256(receipt)` is the content-addressed implementation manifest digest:
the SHA-256 of the canonical JSON of the receipt's identity chain (ABI version, cell format,
procedural table digest, Bunny pins, the three shader digests, the executed artifact digest, the
backend profile, and the backend). It is derived from the receipt and is not a receipt field.

`assertBitExactFrameHash(receipt, oracle)` is the cross-backend parity gate. It throws
`FrameHashMismatchError` unless the receipt has a frame digest and its canvas size, prepared
buffer digest, and frame digest all equal the oracle frame's. There is no tolerance.

## Browser probe harness

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test:browser
```

This starts a Vite server for `packages/bijou-gpu/harness/` on `127.0.0.1:4174` and runs
`packages/bijou-gpu/e2e/*.e2e.ts` in Chrome through Playwright. The page loads the test glyph
pack, the paint and erase frames, and the procedural table, runs the oracle in the browser, draws
the frame on `canvas#bijou-gpu-reference`, and publishes `window.__geordiBijouGpuHarness`:

| Member | Meaning |
| --- | --- |
| `ready`, `harnessVersion` | `true` and `geordi-bijou-gpu-probe-harness/1` once booted. |
| `fontIdentity`, `atlasRgbaSha256`, `proceduralTableSha256` | Identity of the loaded assets. |
| `cellPxW`, `cellPxH`, `canvasPxW`, `canvasPxH`, `defaultFg`, `defaultBg` | Suite geometry and theme defaults. |
| `frames` | Per frame: `id`, `inputReceiptSha256`, `preparedBufferSha256`, `frameRgbaSha256`, computed in the browser. |
| `showFrame(id)` | Draw an oracle frame on the reference canvas. |
| `oraclePixel(id, px, py)` | Exact oracle RGBA. |
| `canvasPixel(px, py)` | RGBA read back from the reference canvas. |

`document.body.dataset.harness` is `ready` on success and `error` on failure, with the message in
`window.__geordiBijouGpuHarnessError`.

## Error codes

Listed in [`ERROR_CODES.md`](./ERROR_CODES.md#bijou-gpu-conformance-kit-errors).
