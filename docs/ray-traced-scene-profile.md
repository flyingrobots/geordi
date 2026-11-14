# Ray-Traced Scene Profile Reference

**Artifact**: `geordi-ray-traced-scene/1` (files named `*.rt-scene.geordi.json`)
**Numeric profile**: `geordi-fixed-q32.32/1`
**Receipt**: `geordi-ray-traced-render-receipt/1`
**Feature profile entry**: `geordi/ray-traced-3d/1`
**Implementation**: Rust only, in `crates/geordi-ir` (types, parser, validator, hashes, receipt)
and `crates/geordi-renderer` (runtime profile negotiation, `RenderedImage` constructor)
**Rationale**: [design record](./design/2026-11-fixed-point-and-ray-traced-scene-profiles.md)

This page describes what exists on `main`: the artifact contract, its validator, its receipt and
the runtime negotiation check. Geordi contains no ray tracer. Nothing here renders a pixel.

> **Not claimed.** Geordi does not claim `geordi/ray-traced-3d/1`. The design's proof gates
> (thread invariance, two CPU architectures agreeing, and an artifact render matching lumen's
> built-in render) have not run. The validator and fixtures exist so that a runtime, planned in
> [lumen#6](https://github.com/flyingrobots/lumen/issues/6), can consume the artifact.

## Numeric profile `geordi-fixed-q32.32/1`

A number is a plain JSON integer holding a **raw value** `r`; its exact value is `r / 2^32`.
`1.0` is written `4294967296`, `0.5` is `2147483648`, `-0.25` is `-1073741824`.

| Rule | Value |
| --- | --- |
| Raw range | `-(2^53 - 1)..=2^53 - 1` (`GEORDI_FIXED_Q32_32_RAW_MIN`, `GEORDI_FIXED_Q32_32_RAW_MAX`) |
| Scale | `2^32` raw units per unit (`GEORDI_FIXED_Q32_32_ONE_RAW`) |
| Units | None; lengths are scene units |
| Accepted spelling | Digits with an optional leading `-` |
| Rejected | Any fraction or exponent (`1.0`, `1e3`), `-0`, strings, `null`, booleans, out-of-range integers |

The Rust type is `GeordiFixedQ32_32`. It can hold only an in-range raw value
(`GeordiFixedQ32_32::from_raw` returns `None` otherwise) and deserializes only from an integer
token. Validation never rounds, clamps or rescales.

**How `1` and `1.0` are told apart.** `serde_json` reads an integer token as an integer and
any token with a fraction or exponent as a floating-point value. The parser first reads the
document as a `serde_json::Value` and rejects every floating-point number, with its JSON path.
`serde_json` also reads `-0` as a floating-point value, so `-0` is rejected rather than
normalized to `0`; canonical writers never emit it.

Every number in a ray-traced scene or receipt is an integer, including counts, film size, sample
count and seed. Those plain integers are not governed by the numeric profile; each has its own
range below. The number-token rules above apply to all of them.

Runtimes that compute with these values are expected to use the arithmetic of Bunny's numeric
constitution (`docs/NUMERIC_CONSTITUTION.md` in flyingrobots/bunny). Geordi's code does not
depend on Bunny.

## Artifact shape

The reference fixture is
[`fixtures/ray-traced-scene/reference.rt-scene.geordi.json`](../fixtures/ray-traced-scene/reference.rt-scene.geordi.json).
Its top level, abridged (arrays shortened to one element):

```json
{
  "camera": {
    "forward": [0, -1073741824, -4294967296],
    "kind": "pinhole",
    "position": [0, 8589934592, 25769803776],
    "tanHalfFovY": 1779033704,
    "up": [0, 4294967296, 0]
  },
  "film": { "height": 36, "width": 64 },
  "id": "geordi:ray-traced-scene:reference",
  "instances": [
    {
      "id": "card",
      "material": "red",
      "mesh": "unit-quad",
      "worldFromMesh": {
        "linearColumnMajor": [4294967296, 0, 0, 0, 0, 4294967296, 0, -4294967296, 0],
        "translation": [0, 4294967296, -8589934592]
      }
    }
  ],
  "lights": [
    {
      "id": "sun",
      "kind": "directional",
      "radiance": [12884901888, 12884901888, 12884901888],
      "towardLight": [2147483648, 4294967296, 1073741824]
    }
  ],
  "materials": [{ "albedo": [3435973837, 429496730, 429496730], "id": "red", "kind": "diffuse" }],
  "meshes": [
    {
      "bounds": { "max": [4294967296, 0, 4294967296], "min": [-4294967296, 0, -4294967296] },
      "counts": { "triangles": 2, "vertices": 4 },
      "id": "unit-quad",
      "layout": "bunny-ply-binary-le-f32/1",
      "path": "meshes/unit-quad.ply",
      "sha256": "sha256:caca8649845effd4c3512ff53312877856be1733554d4c7b42dc3c2b0cd35230"
    }
  ],
  "numericProfile": "geordi-fixed-q32.32/1",
  "render": {
    "integrator": "geordi-rt-diffuse-path/1",
    "maxBounces": 1,
    "output": "geordi-rgba8-srgb-opaque/1",
    "reconstruction": "geordi-box-filter/1",
    "sampler": "fixture-placeholder-sampler/1",
    "samplesPerPixel": 16,
    "seed": 0,
    "toneCurve": "fixture-placeholder-tone-curve/1"
  },
  "requires": ["geordi/ray-traced-3d/1", "asset.mesh", "mesh.triangle", "instance.affine3",
    "camera.pinhole", "material.diffuse", "light.directional", "light.uniform-sky"],
  "sceneVersion": "geordi-ray-traced-scene/1"
}
```

Unknown fields are rejected at every level. `towardLight` must be absent (not `null`) on a
`uniformSky` light.

## Field rules

Q32.32 fields are marked Q. A diagnostic code is listed for each rule; see
[Diagnostics](#diagnostics).

| Field | Rule | Code |
| --- | --- | --- |
| `sceneVersion` | Exactly `geordi-ray-traced-scene/1` | `GEORDI_E_RT_SCENE_VERSION_UNSUPPORTED` |
| `numericProfile` | Exactly `geordi-fixed-q32.32/1`; no per-field profiles | `GEORDI_E_RT_NUMERIC_PROFILE_UNSUPPORTED` |
| `id`, every `meshes[].id`, `materials[].id`, `instances[].id`, `lights[].id` | Non-empty | `GEORDI_E_RT_ID_EMPTY` |
| Ids within one collection | Unique per collection | `GEORDI_E_RT_ID_DUPLICATE` |
| `requires[]` | In the vocabulary below | `GEORDI_E_RT_REQUIREMENT_UNKNOWN` |
| `requires[]` | No duplicates | `GEORDI_E_RT_REQUIREMENT_DUPLICATE` |
| `requires` | Contains `geordi/ray-traced-3d/1` and every feature the content uses | `GEORDI_E_RT_REQUIREMENT_MISSING` |
| `meshes[].path` | Relative fixture-local POSIX path | `GEORDI_E_RT_MESH_PATH_INVALID` |
| `meshes[].sha256` | `sha256:` plus 64 lowercase hex digits | `GEORDI_E_RT_MESH_HASH_INVALID` |
| `meshes[].layout` | Exactly `bunny-ply-binary-le-f32/1` | `GEORDI_E_RT_MESH_LAYOUT_UNSUPPORTED` |
| `meshes[].counts.vertices`, `.triangles` | Integer `>= 0` | `GEORDI_E_RT_MESH_COUNT_INVALID` |
| `meshes[].bounds.min`, `.max` (Q) | `min[axis] <= max[axis]` | `GEORDI_E_RT_MESH_BOUNDS_INVALID` |
| `materials[].kind` | Exactly `diffuse` | `GEORDI_E_RT_MATERIAL_UNSUPPORTED` |
| `materials[].albedo` (Q, 3 channels) | Each in `[0, 1]`: raw `0..=4294967296` | `GEORDI_E_RT_ALBEDO_OUT_OF_RANGE` |
| `instances[].mesh` | Names a declared mesh | `GEORDI_E_RT_MESH_REFERENCE_UNKNOWN` |
| `instances[].material` | Names a declared material | `GEORDI_E_RT_MATERIAL_REFERENCE_UNKNOWN` |
| `instances[].worldFromMesh` (Q) | 9 linear entries, column-major (`column * 3 + row`), and 3 translation entries; see [trace domain](#trace-domain-check) | `GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED` |
| Sum over instances of the instanced mesh's `counts.triangles` | At most `2^32 - 1` | `GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED` |
| `camera.kind` | Exactly `pinhole` | `GEORDI_E_RT_CAMERA_UNSUPPORTED` |
| `camera.position` (Q) | Each coordinate below 256 units in magnitude | `GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED` |
| `camera.forward`, `camera.up` (Q) | Neither zero; not parallel (exact 128-bit cross product is non-zero) | `GEORDI_E_RT_CAMERA_DEGENERATE` |
| `camera.tanHalfFovY` (Q) | In `(0, 4]`: raw `1..=17179869184` | `GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE` |
| `lights[].kind` | `directional` or `uniformSky` | `GEORDI_E_RT_LIGHT_UNSUPPORTED` |
| `lights[].towardLight` (Q) | Required on `directional`; forbidden on `uniformSky` | `GEORDI_E_RT_LIGHT_FIELD_INVALID` |
| `lights[].towardLight` | Largest component magnitude exactly 1.0 (raw `4294967296`); rejects zero | `GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED` |
| `lights[].radiance` (Q, 3 channels) | Each in `[0, 65536]`: raw `0..=281474976710656` | `GEORDI_E_RT_RADIANCE_OUT_OF_RANGE` |
| `lights` | At most one `directional` | `GEORDI_E_RT_DIRECTIONAL_LIGHT_COUNT` |
| `lights` | Exactly one `uniformSky` | `GEORDI_E_RT_SKY_COUNT` |
| `film.width`, `film.height` | Integer in `1..=16384` | `GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE` |
| `render.integrator` | Exactly `geordi-rt-diffuse-path/1` | `GEORDI_E_RT_INTEGRATOR_UNSUPPORTED` |
| `render.samplesPerPixel` | Power of two in `1..=1024` | `GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID` |
| `render.sampler` | Well-formed versioned identity (see below) | `GEORDI_E_RT_SAMPLER_IDENTITY_INVALID` |
| `render.seed` | Integer in `0..=4294967295` | `GEORDI_E_RT_SEED_OUT_OF_RANGE` |
| `render.maxBounces` | `0` or `1` | `GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE` |
| `render.reconstruction` | Exactly `geordi-box-filter/1` | `GEORDI_E_RT_RECONSTRUCTION_UNSUPPORTED` |
| `render.toneCurve` | Well-formed versioned identity (see below) | `GEORDI_E_RT_TONE_CURVE_IDENTITY_INVALID` |
| `render.output` | Exactly `geordi-rgba8-srgb-opaque/1` | `GEORDI_E_RT_OUTPUT_UNSUPPORTED` |

**Requirement vocabulary** (`GEORDI_RAY_TRACED_KNOWN_REQUIREMENTS`): `geordi/ray-traced-3d/1`,
`asset.mesh`, `mesh.triangle`, `instance.affine3`, `camera.pinhole`, `material.diffuse`,
`light.directional`, `light.uniform-sky`. A scene must require `geordi/ray-traced-3d/1` and
`camera.pinhole`; `asset.mesh` and `mesh.triangle` when it has meshes; `instance.affine3` when it
has instances; `material.diffuse` when it has materials; and each light requirement when a light
of that kind is present. Declaring a feature the content does not use is accepted.

**Sampler and tone curve identities.** These identities are owned by Bunny, which has not yet
published any ([bunny#221](https://github.com/flyingrobots/bunny/issues/221),
[bunny#222](https://github.com/flyingrobots/bunny/issues/222)). Until it does, the Geordi
validator checks only their form: `name/N`, where `name` is lowercase ASCII letters, digits, `-`
and `.`, starting with a letter or digit, and `N` is a positive integer without leading zeros.
Whether an identity is implemented is decided by runtime negotiation
([below](#runtime-profile-negotiation)). The reference fixture uses
`fixture-placeholder-sampler/1` and `fixture-placeholder-tone-curve/1`, which no runtime
implements, so it cannot be rendered.

## Trace-domain check

Bunny's trace kernels accept coordinates below 256 units in magnitude. The validator checks this
conservatively from declared bounds, without reading mesh bytes:

1. For each instance, take the eight corners of the instanced mesh's declared `bounds`.
2. Transform each corner exactly in `i128`: `sum(linear[column * 3 + row] * corner[column]) +
   translation[row] * 2^32`, a value at scale `2^64`. Nothing is rounded.
3. Require every transformed coordinate to be strictly below 255 units in magnitude. The one-unit
   margin covers rounding in the runtime's vertex transform.
4. Require every camera position coordinate to be strictly below 256 units in magnitude.

An affine map sends the box to the convex hull of its transformed corners, so the check never
accepts a scene whose declared vertices leave the domain. It can reject a scene whose vertices
fit but whose transformed box corners do not (for example a rotated mesh near the edge).

The runtime remains the authority: it must transform the decoded vertices and reject any triangle
or camera ray outside the domain.

## Mesh assets

`validate_geordi_ray_traced_scene_mesh_assets(scene, fixture_root)` resolves each mesh path
against `fixture_root`, rejects a path that resolves outside it (after following symlinks), and
checks the file's SHA-256 against the declaration.

| Failure | Code |
| --- | --- |
| Path not fixture-local | `GEORDI_E_RT_MESH_PATH_INVALID` |
| File missing or unreadable | `GEORDI_E_RT_MESH_FILE_MISSING` |
| Path resolves outside `fixture_root` | `GEORDI_E_RT_MESH_FILE_OUTSIDE_ROOT` |
| Bytes do not match `sha256` | `GEORDI_E_RT_MESH_HASH_MISMATCH` |

Geordi does not decode mesh bytes. Decoding the `bunny-ply-binary-le-f32/1` layout, and checking
the decoded counts, bounds and triangle indices against the declaration, is the runtime's job.

## Hashes

| Hash | Input | Function |
| --- | --- | --- |
| `sceneHash` | Canonical JSON bytes of the scene | `geordi_ray_traced_scene_hash` |
| `imageHash` | Raw RGBA8 bytes, row-major, top row first | `geordi_ray_traced_image_hash`, `RenderedImage::image_hash` |
| Receipt hash | Canonical JSON bytes of the receipt | `geordi_ray_traced_render_receipt_hash` |

Every hash is written `sha256:` followed by 64 lowercase hex digits. **Canonical JSON** here is
the form `geordi_sha256_from_canonical_json_value` already uses: object keys sorted, two-space
indentation, `": "` between key and value, one array element per line, and a final newline. It
equals Python's `json.dumps(value, sort_keys=True, indent=2) + "\n"` for these ASCII artifacts.
Committed scene fixtures are stored in canonical form, so their `sceneHash` equals the SHA-256 of
the file bytes.

The image hash does not cover width, height, pixel format or encoding; the receipt records those,
and the receipt hash covers them. Two images of different shape with the same bytes have the same
image hash and different receipt hashes.

## Receipt `geordi-ray-traced-render-receipt/1`

`create_geordi_ray_traced_render_receipt(scene_source, scene_path, runtime, width, height,
image_hash)` parses and validates the scene, computes `sceneHash`, rejects an image size that
differs from `film` (`GEORDI_E_RT_VIEWPORT_MISMATCH`) and returns a validated
`GeordiRayTracedRenderReceipt`. Its fields:

| Field | Content |
| --- | --- |
| `receiptVersion` | `geordi-ray-traced-render-receipt/1` |
| `hashAlgorithm` | `sha256` |
| `sceneVersion`, `sceneHash`, `scenePath`, `numericProfile` | From the scene |
| `assets[]` | `id`, `path`, `sha256`, `layout` per mesh, in scene order |
| `integrator`, `sampler`, `seed`, `samplesPerPixel`, `maxBounces`, `reconstruction`, `toneCurve`, `output` | From `render` |
| `runtime` | `name`, `version`, `bunnyRevision` |
| `image` | `width`, `height`, `pixelFormat: "rgba8"`, `encoding` (equal to `output`), `imageHash` |

`parse_geordi_ray_traced_render_receipt` rejects unknown and missing fields
(`GEORDI_E_RT_RECEIPT_SHAPE`); `validate_geordi_ray_traced_render_receipt` checks every field
(`GEORDI_E_RT_RECEIPT_FIELD_INVALID`). Two receipts describe the same render when every field
except `runtime` is equal; equal `imageHash` values then mean the renders agree.

## Runtime profile negotiation

`GeordiRayTracedRuntimeProfile` (in `geordi-renderer`) is what a ray-tracing runtime declares:
the `(sceneVersion, numericProfile)` pairs it accepts, and the requirements, mesh layouts,
integrators, samplers, tone curves, reconstructions and outputs it implements.
`assert_ray_traced_runtime_profile(scene, profile)` checks the artifact pair first, then each
requirement, mesh layout and render identity, and returns `GeordiRuntimeUnsupportedProfileError`
naming the first unsupported value (for example `sampler=x/1`) and what the profile supports.
This is the same error type `assert_native_runtime_profile` returns. Geordi defines no ray-tracing
runtime profile constant, because Geordi has no ray-tracing runtime.

## `RenderedImage::from_rgba8`

`RenderedImage::from_rgba8(width, height, rgba)` builds an image from RGBA8 bytes in row-major
order, top row first. It returns `GeordiRenderedImageError` when `width * height * 4` overflows
`usize` (`expected_len()` is `None`) or differs from `rgba.len()`. Zero-area images with an empty
buffer are accepted, as the existing internal constructor allows. Existing rendering paths are
unchanged.

## Diagnostics

Parse diagnostics:

| Code | Trigger | Path |
| --- | --- | --- |
| `GEORDI_E_RT_JSON_INVALID` | Not JSON | `$` (message has line and column) |
| `GEORDI_E_RT_NUMBER_NOT_INTEGER` | A number with a fraction or exponent, or `-0` | JSON path of the number |
| `GEORDI_E_RT_NUMBER_NOT_INTEGER` | A Q32.32 field holding a string, `null`, boolean, array or object | `$` (message has line and column) |
| `GEORDI_E_RT_NUMBER_OUT_OF_RANGE` | An integer outside `-(2^53 - 1)..=2^53 - 1` | JSON path of the number |
| `GEORDI_E_RT_SCENE_SHAPE` | Unknown field, missing field, or wrong JSON type elsewhere | `$` (message has line and column) |

Validation, asset, receipt and viewport codes are listed in the tables above and in
[`ERROR_CODES.md`](./ERROR_CODES.md#ray-traced-scene-errors). Every diagnostic is a
`GeordiRayTracedSceneIssue { code, path, message }`; the code is stable and the message prose is
not. The validator reports every violation it finds, in a fixed traversal order.

## Fixtures

[`fixtures/ray-traced-scene/`](../fixtures/ray-traced-scene/README.md) holds the valid reference
scene, its binary PLY mesh, and one failure fixture per rejection rule with the expected code and
path recorded in `failures/expected-diagnostics.json`.

## Limits and nonclaims

- No renderer, no rendered image and no ray-traced output in Geordi.
- `geordi/ray-traced-3d/1` is not claimed; none of the design's proof gates has run.
- The integrator identity `geordi-rt-diffuse-path/1` is accepted by name only; its written
  definition is a later design record.
- No Bunny sampler or tone curve identity is recognized yet (see above).
- No TypeScript reader or validator; the Rust DTOs are local and not generated by Wesley.
- `geordi-ir/1` still accepts only `geordi-finite-binary64/1`; this profile changes nothing in it.
- No compiler normalization from decimals or binary64 to Q32.32 exists yet.
