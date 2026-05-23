# Strict Text and Font Profile Design

**Status**: Draft
**Date**: 2026-05-23
**Slices Covered**: 2 and 4

## Problem

The current baseline feature profile includes `text.raw-runtime-shaping`. That is honest for the
current renderer, but it is not enough for pixel-identical text across runtimes. Platform text
shaping, fallback, font availability, line breaking, and metrics differ across browsers and native
stacks.

Geordi needs a strict text/font profile before it can claim deterministic text rendering.

## Current State

- `GEORDI_BASELINE_FEATURES` includes `text.raw-runtime-shaping`.
- Compiler output emits the baseline requirements only.
- Runtime-webgl shapes raw text through the canvas/runtime text stack.
- `docs/V0_DESIGN_LAWS.md` already states that strict text requires explicit font resources,
  shaping behavior, glyph IDs, glyph positions, and line boxes.

## Goals

- Add a formal P0 backlog item for strict text/font determinism.
- Define the known strict text feature vocabulary without making it part of the emitted baseline.
- Keep `text.raw-runtime-shaping` as the current baseline until strict text lowering exists.
- Make future strict text requirements fail loudly in runtimes that do not support them.

## Non-Goals

- Do not implement HarfBuzz or a shaping engine in this slice.
- Do not add font asset loading.
- Do not change compiler output to glyph runs yet.
- Do not claim pixel-identical text while raw runtime shaping remains in baseline output.

## Proposed Feature Vocabulary

These features should be known to core, but not emitted by the compiler baseline yet:

| Feature | Meaning |
| --- | --- |
| `text.fontPack` | IR references concrete font resources by content identity. |
| `text.shapingProfile` | IR declares the shaping algorithm/profile used to produce glyph output. |
| `text.lineBreakProfile` | IR declares the line-breaking profile used before glyph placement. |
| `text.fallbackChain` | Font fallback is explicit and ordered in IR or the asset manifest. |
| `text.glyphRuns` | IR contains glyph IDs and positioned glyph runs instead of raw text only. |
| `text.lineBoxes` | IR contains deterministic line boxes for hit testing and layout explainability. |

The exact names may be finalized in the feature-registry slice. The important design constraint is
that strict text is a group of explicit requirements, not an implicit upgrade to `shape.text`.

## Future IR Sketch

This is illustrative, not a committed API:

```ts
interface FontResource {
  readonly id: string;
  readonly sha256: string;
  readonly format: 'otf' | 'ttf' | 'woff2';
  readonly weight?: number;
  readonly style?: 'normal' | 'italic';
}

interface GlyphRun {
  readonly fontRef: string;
  readonly shapingProfile: string;
  readonly glyphs: readonly PositionedGlyph[];
}

interface PositionedGlyph {
  readonly glyphId: number;
  readonly cluster: number;
  readonly x: number;
  readonly y: number;
  readonly advanceX: number;
}
```

Strict text rendering should consume glyph runs and font resources. Raw `content` may remain as
debug/source metadata, but not as the rendering input for strict compliance.

## Compiler Responsibilities

When strict text lowering eventually exists, compiler-core must:

- Resolve logical font names to content-addressed font resources.
- Shape text using the declared shaping profile.
- Apply the declared line-breaking profile.
- Emit glyph runs, line boxes, and fallback-chain evidence.
- Add the strict text feature requirements to `ir.requires`.
- Record relevant feature requirements in receipts.

Until then, compiler-core must keep emitting only `GEORDI_BASELINE_FEATURES`.

## Runtime Responsibilities

A runtime that supports strict text must:

- Verify every referenced font resource exists in the asset pack.
- Render from glyph IDs and positions, not ambient runtime shaping.
- Fail loudly if font resources, glyphs, shaping profiles, or fallback resources are missing.

Runtime-webgl should reject strict text requirements until it actually supports them.

## Slice 2 Acceptance Criteria

- `BACKLOG.md` contains a P0 strict text/font profile item.
- The item lists font identity, glyph runs, shaping profile, line breaking, fallback, and runtime
  rejection behavior as acceptance criteria.
- `docs/V0_DESIGN_LAWS.md` links the item back to the text law.
- `pnpm test:docs` passes.

## Slice 4 Acceptance Criteria

- Core knows strict text feature names.
- Baseline emitted features remain unchanged.
- Tests prove strict text features are known but not included in `GEORDI_BASELINE_FEATURES`.
- Runtime-webgl rejects strict text requirements unless the runtime profile explicitly supports
  them.

## Open Questions

- Which shaping profile name should Geordi standardize first?
- Should glyph positions use the current binary64 profile or a future fixed-point scalar?
- Does strict text require a packed binary font asset format before JSON IR can claim compliance?
- Should raw `content` remain in strict text IR for accessibility/debugging, or move to source maps?
