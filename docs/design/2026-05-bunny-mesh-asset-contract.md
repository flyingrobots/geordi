# Bunny Mesh Asset Contract

**Status**: Draft
**Date**: 2026-05-24
**Parent Design**: [`2026-05-bunny-mesh-render-everywhere.md`](./2026-05-bunny-mesh-render-everywhere.md)

This document defines the mesh asset boundary for the Stanford bunny milestone.

## Asset Identity

The committed asset is:

```text
fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply
```

The asset manifest must identify the exact bytes with:

- `assetVersion`;
- `id`;
- fixture-local or repo-relative asset path;
- `sha256:` hash;
- source URL;
- retrieved date;
- attribution text;
- mesh profile;
- declared counts and bounds.

The manifest is not allowed to reference remote URLs for runtime loading. Remote source metadata is
documentation only.

## Mesh Profile

The first supported profile is:

```text
geordi-ascii-ply-triangle-mesh/1
```

Allowed PLY subset:

- ASCII PLY 1.0;
- one vertex element;
- one face element;
- vertex properties include at least `x`, `y`, and `z`;
- additional vertex properties may be parsed or ignored only if the manifest declares them;
- face property is `property list uchar int vertex_indices`;
- every face must have exactly three indices;
- every index must reference an existing vertex.

Unsupported PLY structures are hard errors:

- binary PLY;
- quad or polygonal faces;
- missing `x`, `y`, or `z`;
- negative indices;
- non-finite numeric values;
- multiple vertex or face element blocks.

## Bounds

Bounds are part of the asset contract. They should be computed from parsed vertex positions and
stored as:

```json
{
  "min": [x, y, z],
  "max": [x, y, z]
}
```

For this milestone, bounds are metadata for validation and camera setup. Do not normalize vertices
silently during parsing. Any normalization must happen in a later transform stage with an explicit
profile.

## Validation

Both TypeScript and Rust validators must check:

- hash string shape;
- actual file hash;
- version/profile literals;
- non-empty IDs and attribution;
- fixture-local paths;
- declared counts match parsed counts;
- declared bounds match parsed bounds exactly enough for the chosen numeric policy;
- all vertex components are finite;
- all face indices are integers in range;
- there are no unsupported PLY features.

## Error Policy

Use custom error types for:

- invalid asset manifest;
- failed asset load;
- asset hash mismatch;
- unsupported PLY header;
- malformed PLY vertex;
- malformed PLY face;
- mesh validation failure.

Do not throw raw strings. Do not collapse parser and validator errors into one generic error.
