# Bunny Projection Descriptor Law

**Status**: Draft
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md)

This document defines the first projection descriptor for the Stanford bunny milestone.

## Descriptor

The initial projection descriptor is:

```json
{
  "kind": "perspective",
  "verticalFovRadians": 0.7853981633974483,
  "near": 0.01,
  "far": 10,
  "viewport": {
    "width": 512,
    "height": 512
  }
}
```

## Law

- Projection kind is `perspective`.
- Aspect ratio is `viewport.width / viewport.height`.
- Vertical field of view, near, far, width, and height are finite and positive.
- `near < far`.
- The projection matrix is right-handed and maps forward camera space through the chosen
  column-vector convention.
- Matrices are serialized column-major.

## Test Vector

For the initial descriptor, the column-major projection matrix is:

```text
[2.414213562373095, 0, 0, 0, 0, 2.414213562373095, 0, 0, 0, 0,
-1.002002002002002, -1, 0, 0, -0.02002002002002002, 0]
```

The same vector is recorded in
[`../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json`](../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json).

## Non-Goals

This law does not define viewport rasterization, depth precision, or clipping behavior beyond the
projection descriptor.
