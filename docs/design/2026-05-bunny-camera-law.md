# Bunny Camera Descriptor Law

**Status**: Draft
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md)

This document defines the first camera descriptor for the Stanford bunny mesh milestone.

## Descriptor

The initial camera descriptor is:

```json
{
  "coordinateSystem": "right-handed",
  "eye": [0, 0.1, 0.35],
  "target": [0, 0.1, 0],
  "up": [0, 1, 0]
}
```

## Law

- The camera is right-handed.
- The view direction is `normalize(target - eye)`.
- The right vector is `normalize(cross(forward, up))`.
- The corrected up vector is `cross(right, forward)`.
- Degenerate descriptors are invalid:
  - `eye == target`;
  - zero-length `up`;
  - `up` parallel to the view direction;
  - any non-finite component.
- Matrices are serialized column-major for column-vector math.

## Test Vector

For the initial camera, the column-major view matrix is:

```text
[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.1, -0.35, 1]
```

The same vector is recorded in
[`../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json`](../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json).

## Non-Goals

This law does not define projection, clipping, depth, or model transforms.
