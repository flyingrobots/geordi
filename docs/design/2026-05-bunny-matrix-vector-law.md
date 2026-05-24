# Bunny Matrix And Vector Operation-Order Law

**Status**: Draft
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-transform-playback-law.md`](./2026-05-bunny-transform-playback-law.md)

This document pins the matrix and vector rules used by the first rotating bunny milestone.

## Law

- Vectors are column vectors.
- Matrices are 4x4.
- Serialized matrices are column-major arrays of 16 finite binary64 numbers.
- Transform composition order is:

```text
clipPosition = projection * view * model * objectPosition
```

- Model rotation uses a right-handed axis-angle rotation matrix.
- Authored rotation axis is `[3, 5, 2]`.
- Axis normalization happens during playback preparation.
- Zero-length axes are invalid.
- Test verification uses fixed frame indices, not wall-clock time.

## Playback Sampling

The initial playback descriptor is:

```json
{
  "kind": "fixed-rate-rotation",
  "axis": [3, 5, 2],
  "radiansPerSecond": 0.7853981633974483,
  "sampleRate": 60
}
```

For a frame index:

```text
seconds = frameIndex / sampleRate
angle = radiansPerSecond * seconds
```

Live demos may advance the frame index using host time, but tests must pass explicit frame indices.

## Test Vectors

The deterministic test vectors include:

- normalized axis;
- frame 0 identity model matrix;
- frame 15 angle and model matrix;
- frame 60 angle and model matrix.

The vectors are recorded in
[`../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json`](../../fixtures/render-everywhere/assets/stanford-bunny/bunny.math-vectors.json).

## Drift Check

This is the halfway checkpoint. Rendering should not begin until we confirm these contracts still
match the project bearing:

- mesh identity is explicit;
- parsing is typed in TypeScript and Rust;
- transform conventions are written down;
- text remains deferred;
- exact 3D pixel parity remains out of scope.
