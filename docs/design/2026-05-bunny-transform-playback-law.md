# Bunny Transform And Playback Law

**Status**: Draft
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-mesh-render-everywhere.md`](./2026-05-bunny-mesh-render-everywhere.md)

This document narrows the transform and playback semantics for the bunny milestone. It is not a
general animation law.

## Coordinate Convention

The bunny fixture must declare one coordinate convention:

- right-handed object space;
- positions are finite binary64 numbers at the parser boundary;
- authored mesh coordinates are not mutated by parsing;
- view/projection transforms own placement into clip or screen space.

If a renderer requires a different native convention, the conversion must be explicit in its
prepared render state and covered by tests.

## Matrix Convention

The first matrix law should define:

- 4x4 matrices;
- column vectors;
- column-major serialized arrays;
- multiplication order: `projection * view * model * position`;
- right-handed object and view space unless a descriptor says otherwise;
- finite numeric entries only.

The law should be implemented in shared tests before renderers rely on it.

## Rotation Axis

The initial authored axis should be:

```json
[3, 5, 2]
```

Rules:

- the authored axis is not required to be unit length;
- axis normalization occurs during playback descriptor preparation;
- zero-length axes are invalid;
- normalization must be deterministic and finite;
- the normalized axis should be reported by browser and native frame metadata.

## Playback Descriptor

The first playback descriptor should define:

```json
{
  "kind": "fixed-rate-rotation",
  "axis": [3, 5, 2],
  "radiansPerSecond": 0.7853981633974483,
  "sampleRate": 60
}
```

Verification must use frame indices:

```text
seconds = frameIndex / sampleRate
angle = radiansPerSecond * seconds
```

Live demos may use host time to choose a frame index, but tests must pass explicit frame indices.

## Camera And Projection

The static bunny frame should use one explicit camera descriptor:

- `eye`;
- `target`;
- `up`;
- near plane;
- far plane;
- vertical field of view;
- viewport width and height.

No renderer may invent defaults. Defaults may exist only in fixture-authoring helpers, and emitted
fixtures must contain concrete values.

## Verification Frames

At minimum, fixed-frame tests should include:

- frame 0;
- frame 15;
- frame 60.

The tests should compare metadata first:

- frame index;
- seconds;
- angle;
- authored axis;
- normalized axis;
- matrix profile.

Visual checks should remain coarse until a deterministic software rasterizer or backend-independent
raster law exists.
