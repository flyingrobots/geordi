# Bijou GPU Surface Damage Packer Test Plan

Contract ledger for [`bijou-gpu-surface-damage.md`](./bijou-gpu-surface-damage.md). Each row names
a requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from
[flyingrobots/geordi#171](https://github.com/flyingrobots/geordi/issues/171) and sections 2 to 4
of the [design record](./design/2026-11-bijou-surface-gpu-abi.md).

Every test is in `packages/bijou-gpu/src/surface-damage.test.ts`. Run them with:

```bash
pnpm --filter @flyingrobots/geordi-bijou-gpu test
```

Every row is implemented.

The "brute-force packer" below is the conformance kit's whole-grid lowering,
`prepareReferenceCells()`, which tracks no damage.

## Golden

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-01 | Paint frame of the width-1 fixture, first pack | Brute-force words; `preparedBufferSha256` of the suite manifest; whole-grid span | `packs the paint frame to the suite prepared-buffer digest on the first frame` |
| BG-DMG-02 | Paint → erase pair, erased cells dirty in `current` only | Hand-written words for all 56 cells; manifest digest; span and changed-cell count | `packs the paint -> erase pair to the exact erase words although the erased cells have clear target dirty bits` |
| BG-DMG-03 | Prepared cell record | Design record vectors V0–V5 and the V1 byte string | `agrees word-for-word with the ABI canonical hex vectors V0 through V5` |

## Union damage and row spans

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-04 | Empty target after a non-empty front buffer | Brute-force words; every painted cell is the empty record | `erases every painted cell when an empty target follows a non-empty front buffer` |
| BG-DMG-05 | Dirty but unchanged cells | No span; resolver never called | `skips dirty cells whose bytes and side-table graphemes are both unchanged` |
| BG-DMG-06 | Row spans are minimal | Hand-written disjoint spans | `reports disjoint minimal row spans and leaves untouched rows out`; `does not report a row whose repainted cells lower to the words already staged` |
| BG-DMG-07 | Cell count not a multiple of 32 (`17 × 13`) | Every dirty bit set, including the three past the last cell, directly and through the accumulator | `ignores dirty bits past the last cell of a grid whose cell count is not a multiple of 32` |

## Semantic side-table comparison

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-08 | Same index bytes, different grapheme | Buffers asserted byte-equal; cell repacked to the new slot | `detects a changed side-table grapheme behind identical side-table index bytes` |
| BG-DMG-09 | Different index bytes, same grapheme | No span; brute-force words | `treats a moved side-table index that names the same grapheme as a change of bytes only` |

## Full invalidation and the staging buffer

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-10 | `forceFullRefresh` after an atlas generation increment | Every cell re-slotted with no dirty bit set; whole-grid span | `rebuilds the whole grid when forceFullRefresh follows an atlas generation increment` |
| BG-DMG-11 | Injected `atlasGeneration` advances between packs | Reason `atlas-generation` without the flag | `forces the full refresh itself when the injected atlas generation has advanced` |
| BG-DMG-12 | Atlas resets during a pack | Unchanged cell re-slotted; an atlas that resets on every lookup is refused | `repacks the whole grid when the atlas generation advances during a pack, and refuses a frame that never settles` |
| BG-DMG-13 | Retained buffer is complete | Brute-force words after an incremental pack; identical bytes on a forced refresh | `retains a complete staging buffer that can be re-uploaded without a new frame` |
| BG-DMG-14 | First frame and empty grids | Empty buffer before the first pack; `first-frame`; no span for `0 × 0`, `0 × 4`, `4 × 0` | `has an empty staging buffer before the first frame and treats that frame as a full refresh`; `packs a grid with no cells to an empty buffer and no row spans` |

## Coalesced frames

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-15 | Two partial updates, one present | Brute-force words; the erased cell is dirty in neither presented surface | `coalesces two partial updates into one present by OR-accumulating their dirty words` |
| BG-DMG-16 | The test is sensitive to accumulation | Without the accumulate call the erased cell stays staged | `leaves a ghost cell when a skipped frame is not accumulated, which is why accumulation exists` |
| BG-DMG-17 | Cell changed in a skipped frame, equal in the presented pair | Brute-force words | `repacks a cell that changed in a skipped frame even though current and target now agree` |
| BG-DMG-18 | Several skipped frames; accumulator cleared by a present | Hand-written spans; resolver not called on the next steady frame | `accumulates across more than one skipped frame and clears the accumulator once presented` |
| BG-DMG-19 | Accumulating before the first frame | `first-frame`; brute-force words | `accumulating before the first frame still yields a first-frame full refresh` |

## Dimension changes

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-20 | Grid dimensions change | `dimension-change`; new buffer length; brute-force words | `rebuilds and reallocates the staging buffer when the grid dimensions change`; `treats a transposed grid with the same cell count as a dimension change`; `forces a full refresh when current and target disagree on dimensions` |
| BG-DMG-21 | Dirty bits do not leak across a resize | Glyphs on the cells the old grid accumulated are not lowered again | `does not leak accumulated dirty bits across a dimension resize` |
| BG-DMG-22 | Skipped frame resizes, later frame restores | `dimension-change`; brute-force words although no bit covers the stale cell | `forces a full refresh when a skipped frame resized the grid and a later one restored it` |

## Width-1 policy and refusals

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-23 | Width-2 grapheme | `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` for a direct CJK code, a side-table emoji, an emoji-presentation sequence, and the checked-in negative fixture | `refuses a width-2 grapheme, encoded directly or through the side table`; `refuses the bytes of the checked-in negative width-2 fixture` |
| BG-DMG-24 | Procedural and empty cells skip the atlas | Resolver call list is empty; hand-written `word0` | `never asks the resolver for procedural or empty cells` |
| BG-DMG-25 | Resolver arguments | Grapheme and whole flags byte | `passes the grapheme and the whole flags byte to the resolver` |
| BG-DMG-26 | Bad resolver results and surfaces | Typed error code and path | `refuses a glyph the resolver has no slot for, a slot outside 0..65535, and a missing side-table entry`; `refuses surfaces whose buffer or dirty words do not cover the grid` (also a state not made by `createSurfaceDamageState()`) |
| BG-DMG-27 | Recovery after a refused pack | `recovery`; brute-force words although no bit covers the half-written cells | `recovers from a refused frame with a full refresh of the next one` |

## Purity

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-28 | No browser globals | Source text names none of `window`, `document`, `OffscreenCanvas`, and seven more; every import is a sibling module. The suite runs in Vitest's `node` environment. | `names no browser global and imports only sibling kit modules` |

## Fuzz

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BG-DMG-29 | 1,000 seeded random frames of paint, erase, resize, coalescing, atlas resets, and forced refreshes | Staging words and little-endian bytes equal the brute-force packer after every pack; incremental spans equal the rows whose words changed | `produces staging bytes identical to the brute-force packer over 1,000 randomized paint/erase/resize frame pairs` |

The fuzz grids are `17 × 13`, `81 × 25`, `13 × 17`, `7 × 5`, `31 × 1`, `32 × 1`, `33 × 1`,
`1 × 37`, and `1 × 1`. The run asserts its own coverage: more than 600 packs, 400 incremental
packs, 150 coalesced frames, 20 resizes, 1,000 erased cells, 5 forced refreshes, and 10 atlas
resets.

## Not covered

- No presenter calls the packer, so no upload of the reported rows is tested.
- The injected resolver is a test double. The real `GlyphAtlas`
  ([flyingrobots/geordi#172](https://github.com/flyingrobots/geordi/issues/172)) is not
  exercised.
- The surfaces are a model of how Bijou sets and clears dirty bits, not Bijou's own
  `PackedSurface`. Bijou is not a dependency of this package.
- Timing and allocation are not measured.
