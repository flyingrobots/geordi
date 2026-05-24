# Bunny Bounds Normalization Law

**Status**: Draft
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md)

This document defines how the bunny mesh bounds are computed and how later renderer preparation may
derive normalization metadata. Parsing does not mutate vertex positions.

## Law

- Bounds are computed from authored vertex positions after PLY parsing.
- `min` and `max` are three-component vectors in mesh object space.
- `center = (min + max) / 2`.
- `extent = max - min`.
- `maxExtent = max(extent.x, extent.y, extent.z)`.
- Parser output remains unnormalized.
- Any future renderer normalization must be an explicit transform using `center` and `maxExtent`.
- Bounds calculations use finite binary64 numbers.

## Stanford Bunny Values

The bunny manifest declares:

```text
min = [-0.0943643, 0.0334143, -0.0616721]
max = [0.0609346, 0.184813, 0.0584651]
```

Derived values are recorded in
[`../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json`](../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json).

## Non-Goals

This law does not define camera placement, projection, or model rotation. It only defines mesh-space
metadata derived from parsed vertices.
