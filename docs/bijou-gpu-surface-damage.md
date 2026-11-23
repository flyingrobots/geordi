# Bijou GPU Surface Damage Packer Reference

**Package**: `@flyingrobots/geordi-bijou-gpu` (`packages/bijou-gpu`)
**Module**: `src/surface-damage.ts`
**ABI**: `bijou-surface-gpu/1`
**Rationale**: [design record](./design/2026-11-bijou-surface-gpu-abi.md), sections 2 to 4
**Evidence ledger**: [`bijou-gpu-surface-damage-test-plan.md`](./bijou-gpu-surface-damage-test-plan.md)

This page describes the dirty-union cell packer on `main`. It turns a pair of Bijou
`PackedSurface` buffers into the prepared 16-byte cell records a presenter uploads, and says which
rows changed. The design record is normative for the cell layout and the damage law; this page
says how the packer exposes them.

> **Not claimed.** The packer uploads nothing and calls no host API. No presenter uses it yet:
> the WebGL2, Canvas 2D, and WebGPU presenters are tracked in
> [flyingrobots/geordi#173](https://github.com/flyingrobots/geordi/issues/173),
> [flyingrobots/geordi#174](https://github.com/flyingrobots/geordi/issues/174), and
> [flyingrobots/geordi#175](https://github.com/flyingrobots/geordi/issues/175). It contains no
> glyph atlas; slots come from a callback, which the
> [glyph atlas](./bijou-gpu-glyph-atlas.md) can supply. No timing has been measured.

## Exports

| Export | Meaning |
| --- | --- |
| `createSurfaceDamageState()` | A state that has packed nothing. One state serves one presented grid. |
| `packSurfaceDamage(state, current, target, options)` | Lower the damage between two surfaces into the retained staging buffer. Returns a `SurfaceDamageResult`. |
| `accumulateSurfaceDamage(state, current, target)` | Record the damage of a frame that will not be presented. |
| `resolveSlotFromSlotMap(slotMap)` | Adapt the kit's `GlyphSlotMap` to a `ResolveGlyphSlot`. |
| `ResolveGlyphSlot` | `(grapheme: string, flags: number) => GlyphSlotRef \| undefined`. |
| `SurfaceDamageOptions` | `GpuPresentContext` plus `resolveSlot` and an optional `atlasGeneration`. |
| `SurfaceDamageState`, `SurfaceDamageResult`, `DirtyRowSpan`, `FullRefreshReason` | The types described below. |

`current` and `target` are `GpuPackedSurface` values: the structural slice of Bijou's
`PackedSurface` declared in the [conformance kit](./bijou-gpu-conformance-kit.md#presenter-contract).

## Calling it

An abridged presenter loop. `uploadRows` stands for the presenter's own texture upload and is not
part of this package.

```ts
import {
  createSurfaceDamageState,
  packSurfaceDamage,
  type GpuPackedSurface,
  type ResolveGlyphSlot,
} from '@flyingrobots/geordi-bijou-gpu';

declare const resolveSlot: ResolveGlyphSlot;
declare function uploadRows(words: Uint32Array, minRow: number, maxRow: number): void;

const state = createSurfaceDamageState();

function present(current: GpuPackedSurface, target: GpuPackedSurface): void {
  const result = packSurfaceDamage(state, current, target, { resolveSlot });
  for (const span of result.dirtyRowSpans) {
    uploadRows(result.staging, span.minRow, span.maxRow);
  }
}
```

`current` must be the surface the previous `packSurfaceDamage` or `accumulateSurfaceDamage` call
received as `target`. That is how Bijou's runtime swaps its two buffers. The packer keeps no
reference to either surface, so both may be reused as soon as the call returns.

## Damage

Candidate cells are the bitwise union `current.renderDirtyWords | target.renderDirtyWords`, plus
any bits recorded by `accumulateSurfaceDamage`. Bit `i` of the bitmap is cell `i` in row-major
order. Bits past the last cell are ignored.

Scanning `target.renderDirtyWords` alone would be wrong. A cell painted in one frame and left
empty in the next has its bit set only in `current`.

For each candidate cell:

1. If the cell was not touched in a coalesced frame, and `current` and `target` hold the same ten
   bytes, and (for a side-table cell) the same grapheme string behind the index, the cell is
   skipped. The resolver is not called.
2. Otherwise the target cell is lowered to four words. If they equal the staged words, nothing is
   written and the row is not reported.
3. Otherwise the words are written and the row is reported.

Step 1 compares side-table **strings**. Two surfaces can hold identical index bytes that name
different graphemes, because each surface owns its side table.

Step 2 is why a repaint that changes bytes but not the prepared record uploads nothing. Live
`CHAR_EMPTY` and ASCII space are different bytes and the same record; so is a side-table grapheme
whose index moved.

## Full refresh

The packer rebuilds every cell, ignoring dirty words, and reports the whole grid as one span:

| `fullRefreshReason` | Trigger |
| --- | --- |
| `first-frame` | The state has packed nothing. |
| `dimension-change` | `target`, `current`, and the staged grid do not all have the same width and height. Also set when a coalesced frame had other dimensions, even if a later frame restores them. |
| `recovery` | The previous pack threw. |
| `atlas-generation` | `options.atlasGeneration()` differs from its value at the previous pack, or changed while this pack ran. |
| `forced` | `options.forceFullRefresh` is `true`. |

When more than one trigger applies, the reason reported is the first in that order.

The packer cannot see a cell metric or device pixel ratio change, a theme default change, or a
context or device restoration. The presenter passes `forceFullRefresh` for those. It must also
pass it after an atlas reset when it does not supply `atlasGeneration`.

A full refresh allocates a new staging array and installs it only when the whole grid lowered
without error. Read `result.staging` after every pack instead of keeping an old reference.

### Atlas generation

`atlasGeneration` is read before and after each pass. If resolving a glyph resets the atlas
part-way through a pass, slots staged earlier in that pass are stale, so the pass is discarded
and the whole grid is lowered again. If the generation advances during two consecutive whole-grid
passes, the frame cannot fit one atlas generation and the pack throws
`GEORDI_E_BIJOU_INVALID_ATLAS` at `atlasGeneration`.

## Coalesced frames

When several application updates land between two presents, call `accumulateSurfaceDamage` for
every `(current, target)` pair except the last, and `packSurfaceDamage` for the last:

```ts
accumulateSurfaceDamage(state, frame0, frame1); // not presented
packSurfaceDamage(state, frame1, frame2, { resolveSlot }); // presented
```

Each accumulate call ORs `current.renderDirtyWords | target.renderDirtyWords` into the state. The
next pack treats those cells as candidates and compares them against the staged words, not against
`current`, because `current` and `target` can agree on a cell that changed in a skipped frame.
Packing, incrementally or in full, clears the accumulator.

Skipping a frame without accumulating it leaves stale cells in the staging buffer.

## Staging buffer

`state.staging` is a `Uint32Array` of `widthCells * heightCells * 4` words: four lanes per cell in
row-major order, laid out as the design record's section 2 defines. It is empty before the first
pack. It always holds the complete last packed frame, so a presenter can upload it again after a
context or device restoration without a new application frame. Atlas slots in it are only valid
for the atlas generation it was packed with.

`preparedBufferBytes(state.staging)` gives the canonical little-endian byte stream.

While `state.pendingFullRefresh` is `'recovery'`, the buffer may mix cells of two frames and must
not be uploaded.

## Lowering

The lowering agrees word-for-word with the kit's whole-grid `prepareReferenceCells()`. It is a
separate implementation, checked against that function by the fuzz test in the ledger.

- A cell lowers to `GLYPH_KIND_EMPTY` when its code is `0`, its code is `U+0020`, or `FLAG_EMPTY`
  is set.
- Braille (`U+2800..U+28FF`), Block Element (`U+2580..U+259F`), and Box-Drawing
  (`U+2500..U+257F`) code points lower to their procedural kinds.
- For neither of those does the packer call `resolveSlot`.
- Every other grapheme goes to `resolveSlot(grapheme, flags)`, where `flags` is the cell's whole
  flags byte. The returned `kind` selects `GLYPH_KIND_ATLAS_MONO` or `GLYPH_KIND_ATLAS_COLOR`.

## Width-1 policy

A grapheme that Bijou's width rule measures as two columns is refused with
`GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` before the resolver is called. The check runs on every
cell the packer lowers, for a canonical receipt and a live surface alike: the ABI defines no
wide-cell layout, and the packer does not invent one. There is no option that turns it off.

The packer checks width only. It is not a `packed-bijou-cells/1` validator; use
`parsePackedBijouCellsReceipt()` for that.

## Errors

All are `BijouGpuValidationError`. The `path` names `target.cells[i]`, a surface field such as
`current.renderDirtyWords`, `state`, or `atlasGeneration`.

| Condition | Code |
| --- | --- |
| A width-2 grapheme | `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` |
| `resolveSlot` returned `undefined` | `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` |
| `resolveSlot` returned a slot that is not an integer in `0..65535` | `GEORDI_E_BIJOU_INVALID_ATLAS` |
| The atlas generation advanced during two consecutive whole-grid passes | `GEORDI_E_BIJOU_INVALID_ATLAS` |
| Width or height is not an integer in `0..65535`; `buffer` is not `width * height * 10` bytes; `renderDirtyWords` has fewer than `ceil(width * height / 32)` words; a side-table index has no entry; the state was not made by `createSurfaceDamageState()` | `GEORDI_E_BIJOU_INVALID_SURFACE` |

After any throw from `packSurfaceDamage` the next pack is a full refresh. `current` is validated
only on an incremental pack, because a full refresh does not read it.

The codes are listed in [`ERROR_CODES.md`](./ERROR_CODES.md#bijou-gpu-conformance-kit-errors).
