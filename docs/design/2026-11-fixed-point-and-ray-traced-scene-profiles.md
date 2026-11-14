# Fixed-Point Numeric Profile And Ray-Traced Scene Profile

**Status**: Proposed, awaiting the maintainer's decision
**Date**: 2026-11-13
**Issue**: [#152](https://github.com/flyingrobots/geordi/issues/152)
**Implementation issue**: [#153](https://github.com/flyingrobots/geordi/issues/153) (blocked on
this decision)
**Upstream plan**: [lumen#9](https://github.com/flyingrobots/lumen/issues/9), stage
[lumen#8](https://github.com/flyingrobots/lumen/issues/8)
**Bunny revision read**: `origin/main` at `7467148`

## Reader job

This record lets the maintainer decide two Geordi contracts before any code is written:

1. a fixed-point numeric profile, the first alternative to `geordi-finite-binary64/1`; and
2. a ray-traced 3D scene profile that a deterministic ray tracer consumes.

Each decision states a recommendation, the alternatives, and the evidence that would change it.
Statements about what exists today cite the file they come from. Anything planned is labelled
planned and linked to its issue. Nothing in this document is implemented.

## Terms

- **Raw value**: the signed integer that encodes a fixed-point number. A Q32.32 number with raw
  value `r` has the exact value `r / 2^32`.
- **Q32.32**: Bunny's canonical fixed-point format, a signed 64-bit raw value with 32 fractional
  bits (`docs/NUMERIC_CONSTITUTION.md` in Bunny).
- **Trace domain**: the input bounds Bunny's ray-tracing kernels accept: ray origin and triangle
  vertex coordinates below 256 units in magnitude, ray direction components at most 1.0 in
  magnitude (`docs/topics/ray-tracing/README.md` in Bunny).
- **Lumen**: a separate repository, a Geordi runtime that implements the render contract by ray
  tracing on Bunny. On `main` today it holds only a workspace scaffold
  ([lumen#1](https://github.com/flyingrobots/lumen/issues/1), closed).
- **Pixel-affecting input**: any value whose change can change at least one output byte.
- **Algorithm identity**: a versioned name for a fixed computation (for example a sampler or a
  tone curve) whose output bits never change under that name.

## Summary of recommendations

| # | Question | Recommendation |
| --- | --- | --- |
| A1 | Profile name | `geordi-fixed-q32.32/1`. |
| A2 | Number in an artifact | A plain JSON integer holding the raw value, limited to the JavaScript safe-integer range. |
| A3 | Scale and range | Scale `2^32`; raw values in `-(2^53 - 1)..=2^53 - 1`, about ±2,097,152 units. A subset of Bunny's Q32.32. |
| A4 | Relation to Bunny | Same value set as Bunny's Q32.32 (decoding is `FixedQ32_32::from_raw`). Geordi's profile text defines the meaning itself and cites Bunny's constitution as the arithmetic consumers use; it does not depend on Bunny code. |
| A5 | Coexistence with binary64 | One numeric profile per artifact, declared in `numericProfile`. No per-field mixing. Integer counts and indices are outside any scalar profile. |
| A6 | Compiler normalization | Converting authored decimals or binary64 values to raw values is an explicit, receipted compiler step: round the exact value to the nearest raw unit, ties to even; reject out-of-range values. |
| A7 | Non-length values | Field of view as the tangent of half the vertical angle; colours and radiance as linear-light Q32.32; reflectance as a Q32.32 ratio in `[0, 1]`; rotations as affine matrix entries. No angles in version 1. |
| B1 | Artifact form | A separate artifact, `geordi-ray-traced-scene/1`, beside `geordi-ir/1`, as strict text did. Not a new IR version and not new `geordi-ir/1` node kinds. |
| B2 | Scene content | Triangle meshes by content hash with a named decode layout, instances with Q32.32 affine transforms, one pinhole camera, diffuse materials, one directional light and a uniform sky. |
| B3 | Trace-domain limit | The Geordi validator checks it conservatively from declared mesh bounds; the runtime checks it exactly after transforming vertices. Either failure is a hard rejection; nothing is clamped or dropped. |
| B4 | Render settings | Samples per pixel (a power of two), sampler identity, seed, maximum bounces, box reconstruction, tone curve identity and output encoding all live in the artifact. |
| B5 | Algorithm | The artifact names an integrator identity whose definition fixes every remaining pixel-affecting rule. The runtime profile declares which identities it implements. |
| B6 | Output | Geordi's `RenderedImage` (RGBA8, row-major, top row first), alpha 255. The image hash is SHA-256 over the RGBA bytes. PNG bytes are not part of the contract. |
| B7 | Receipt | `geordi-ray-traced-render-receipt/1`: scene hash, asset hashes, every profile and algorithm identity, runtime identity, image size, format and image hash. |
| B8 | Proof | Claim the profile only after: thread-count invariance, two machines with different CPU architectures agreeing, and a Geordi-artifact render matching lumen's built-in render. The GPU claim is a separate, later gate. |
| B9 | Shared types | Bunny owns a Q32.32 vector, a Q32.32 affine transform and the pinhole camera record as schema types. Geordi owns the scene artifact, materials, lights, render settings, runtime profile and receipt. Rays never appear in artifacts. |
| C | First slices | Geordi: Rust-only DTOs, validator, runtime profile type, receipt type and a public `RenderedImage` constructor, with fixtures. Lumen: load the artifact and reproduce the built-in image hash. |

The maintainer's open decisions are collected in [Open questions](#open-questions-for-the-maintainer).

## What exists today

The following facts were read from the named files; they constrain the design.

**Geordi** (this repository, `main` at `f68160f`):

- `geordi-ir/1` declares one numeric profile per artifact, `numericProfile:
  "geordi-finite-binary64/1"`, and the Rust validator rejects any other value
  (`crates/geordi-ir/src/lib.rs`, `validate_version`).
- The design laws anticipate a fixed-point profile: "`px * SCALE` stored as an integer under a new
  named `numericProfile`", with conversion in "compiler normalization, not hidden inside generic
  JSON serialization" (`docs/V0_DESIGN_LAWS.md`, Numeric Law). The canonical JSON port must not
  round or rescale ordinary numbers (same file, Canonical JSON).
- Geordi already stores fixed-point values as raw JSON integers: strict text positions use
  `positionEncoding: "geordi-fixed-26.6/1"`
  (`fixtures/render-everywhere/strict-text/strict-text-fixture.schema.md`), and both the Rust and
  TypeScript validators restrict them to the JavaScript safe-integer range
  (`GEORDI_JSON_SAFE_INTEGER_MAX` in `crates/geordi-ir/src/lib.rs`; `Number.isSafeInteger` checks
  in `packages/render-fixture/src/index.ts`).
- Geordi has grown new rendering claims as separate artifacts first: the strict text fixture
  "stays outside `geordi-ir/1` until browser and native runtimes prove the contract"
  (`strict-text-fixture.schema.md`), and the bunny mesh descriptor is its own
  `geordi-mesh-render-fixture/1` (`fixtures/render-everywhere/assets/stanford-bunny/bunny.fixture.json`).
- The mesh descriptor uses binary64 numbers, an `eye`/`target`/`up` camera, a vertical field of
  view in radians, sRGB hex colours, and a projection whose depth maps to `[-1, 1]`
  (`bunny.fixture.json`, `bunny.math-vectors.json`, `docs/design/2026-05-bunny-projection-law.md`).
  The mesh asset is an ASCII PLY with `x, y, z, confidence, intensity` vertex properties
  (`bunny.mesh.json`).
- The Rust runtime profile is `GeordiNativeRuntimeProfile { ir_version, numeric_profile,
  supported_requirements }`, checked by `assert_native_runtime_profile`, which fails with
  `GeordiRuntimeUnsupportedProfileError` (`crates/geordi-renderer/src/lib.rs`).
- `RenderedImage` holds RGBA8 bytes in row-major order with `width`, `height`, `rgba` and
  `pixel_at` accessors. Its constructor is private, so code outside `geordi-renderer` cannot
  create one today (`crates/geordi-renderer/src/lib.rs`).
- Geordi has no Bunny dependency (`Cargo.toml` workspace members are `geordi-ir`, `geordi-mesh`,
  `geordi-renderer` and the native example) and no `schemas/` directory. Wesley common-type
  generation is a recorded requirement, not an implementation
  (`docs/design/2026-05-wesley-common-type-generation.md`; `VISION.md` proof ladder).

**Bunny** (`origin/main` at `7467148`, read only):

- `FixedQ32_32` wraps a raw `i64`; multiplication rounds ties-to-even from a 128-bit
  intermediate; every operation declares a checked, saturating or proven-infallible overflow
  policy; equality is raw equality with no epsilon (`docs/NUMERIC_CONSTITUTION.md`).
- Float ingress `try_from_f32` rejects non-finite and out-of-range input and rounds the magnitude
  to nearest with ties to even (`crates/bunny-num/src/fixed_q32_32/conversions.rs`,
  `round_shift_right_u128` in `fixed_q32_32.rs`).
- The canonical frame is right-handed with `+Y` up; view space looks down `-Z`; NDC depth is
  `[0, 1]`; the perspective builder takes the tangent of half the vertical field of view, so no
  trigonometry is needed; viewport conversion "must explicitly name the viewport origin and `y`
  direction" (`docs/topics/coordinate-law/README.md`).
- The trace kernels `TraceRay` and `TraceTriangle` enforce the trace domain and return `None`
  outside it; the triangle test is exact and two-sided with inclusive edges; the box test is
  conservative; `closest_hit` returns the same primitive as testing every primitive, breaking
  distance ties by the lower primitive index, whatever the tree shape
  (`docs/topics/ray-tracing/README.md`).
- `FixedAffine3::checked_transform_point` transforms a point with checked Q32.32 arithmetic
  (`crates/bunny-linalg/src/fixed_affine3.rs`). `FixedAngle` stores binary angles with
  table-based sine and cosine (`crates/bunny-num/src/fixed_angle.rs`).
- `bunny-codec` parses only binary little-endian PLY with `float x, y, z` vertices and
  `uchar int` triangle faces (`crates/bunny-codec/src/ply.rs`). An ASCII PLY reader is planned
  ([bunny#247](https://github.com/flyingrobots/bunny/issues/247)).
- `bunny-mesh` defines a quantized 16-bit vertex layout and a domain-separated mesh hash
  (`bunny-mesh:v2`) over bounds, vertices and indices (`crates/bunny-mesh/src/lib.rs`).
- Bunny's schema declares `BunnyFixedQ32_32Raw` (Rust `i64`, TypeScript `bigint`), but its
  `BunnyVec3`, `BunnyRay3` and `BunnyAabb3` use the `f32` scalar
  (`schemas/bunny/v0/graphics.graphql`;
  `docs/topics/deterministic-contract-profile/README.md`). `bunny-wesley` emits DTOs only, no
  byte codecs (`docs/topics/contract-generation/README.md`).
- **Planned, not merged**: `bunny-optics` with a pinhole camera and ray generation
  ([bunny#138](https://github.com/flyingrobots/bunny/issues/138)), a counter-based sampler
  ([bunny#221](https://github.com/flyingrobots/bunny/issues/221)), pixel-value math with a tone
  curve and 8-bit output ([bunny#222](https://github.com/flyingrobots/bunny/issues/222)), and
  lighting and BRDF math ([bunny#160](https://github.com/flyingrobots/bunny/issues/160)). This
  document names what Geordi needs from them; it does not describe their APIs.

**Not verified**: the "bumpy sphere on a ground plane" scene benchmark that
[lumen#2](https://github.com/flyingrobots/lumen/issues/2) proposes as a starting scene is not on
Bunny's `main`; this document does not know whether it is made of triangles.

## Part A: the fixed-point numeric profile

### A1. Name and version

**Recommendation**: `geordi-fixed-q32.32/1`.

The name follows the existing profile pattern (`geordi-finite-binary64/1`, `geordi-fixed-26.6/1`):
a `geordi-` prefix because Geordi owns the artifact meaning, the format, and a version that
changes whenever the meaning of any accepted artifact would change.

Alternative: `bunny-q32.32/1`. Rejected because it suggests Bunny owns the artifact contract; Bunny
must stay free of Geordi concepts (`docs/design/0001-bunny-graphics-commons.md` in Bunny).

### A2. Representation in canonical JSON

**Recommendation**: a number is a plain JSON integer whose value is the raw value. `1.0` is
written `4294967296`; `0.5` is `2147483648`; `-0.25` is `-1073741824`.

| Option | Exact | One canonical form | Safe in JavaScript `JSON.parse` | Readable |
| --- | --- | --- | --- | --- |
| Raw JSON integer, safe range (recommended) | Yes | Yes | Yes | Poor |
| Raw JSON integer, full `i64` range | Yes | Yes | No: values above `2^53` lose bits | Poor |
| Raw value as a decimal string (`"4294967296"`) | Yes | Yes | Yes | Poor |
| Exact decimal string of the value (`"0.5"`) | Yes, every Q32.32 value has a finite decimal expansion of at most 32 fractional digits | Needs a rule (no trailing zeros, no exponent) | Yes | Good for simple values, poor for others (`2^-32` is 32 digits) |
| JSON decimal number (`0.5`) | Only below `2^21` units, and only when the writer prints enough digits: parsers convert to binary64, which cannot hold a Q32.32 value with more than 53 significant bits | No: many spellings parse to the same value | Lossy above `2^21` units | Good |

Reasons for the recommendation:

- **Precedent.** `geordi-fixed-26.6/1` already uses raw JSON integers in the safe range, with
  validators in both languages. A second fixed-point profile that works the same way adds no new
  parsing machinery.
- **Exactness without custom parsers.** Rust's `serde_json` deserializes an integer field exactly
  and rejects `1.0` or `1e3` for an `i64` field. JavaScript's `JSON.parse` is exact for safe
  integers; converting one to the `bigint` that Bunny's generated TypeScript uses is exact.
- **The range is enough.** The safe range covers ±2,097,152 units, far beyond the 256-unit trace
  domain (raw `2^40`), and ample for colours, ratios and tangents.
- **Readability is a tooling job.** Review tools can show `4294967296 (1.0)`. The design laws
  already treat JSON as "a debug, review, and interchange envelope", not the authoring surface.

Canonical form: digits only, an optional leading `-`, no leading zeros, no fraction, no exponent,
and `-0` normalized to `0` as the JSON port already does. Rust enforces this for free, because
`serde_json` refuses a fraction or exponent for an `i64` field. JavaScript's `JSON.parse` cannot:
`1.0` and `1` parse to the same value, and re-serializing or hashing afterwards cannot tell which
was written. A future TypeScript validator must therefore read the raw number tokens with a
token-preserving parser before converting them. Version 1 has no TypeScript validator (see
[B10](#b10-shared-types)), so this obligation falls on the later TypeScript reader.

What would change this: a real consumer that needs magnitudes above about two million units in a
Q32.32 artifact. The answer then is a second profile (for example decimal-string raw values), not a
silent widening of this one.

### A3. Scale, range and what a validator rejects

- Scale: `2^32` raw units per unit. Value = raw / `2^32`, exactly.
- Range: raw in `-(2^53 - 1)..=2^53 - 1`. This is a strict subset of Bunny's `i64` range, so every
  accepted value decodes losslessly into `FixedQ32_32`.
- Units: the profile assigns no physical unit. Lengths are in scene units, the same convention
  Bunny uses ("unitless fixed-point Bunny units", coordinate law).

A validator for this profile rejects, with a stable diagnostic and JSON path:

- a profile-governed field that is not a JSON number (strings, `null`, booleans);
- a number with a fraction or an exponent, in any spelling;
- a raw value outside the safe range;
- `NaN` and infinities (already rejected by the JSON port);
- any field-specific domain violation that the consuming profile states (for example a
  coordinate outside the trace domain, or a reflectance above 1.0).

The validator never rounds, clamps or rescales.

### A4. How the profile names Bunny without depending on Bunny's code

**Recommendation**: the profile document states the value semantics itself (signed raw integer,
32 fractional bits, exact value `raw / 2^32`) and adds one informative sentence: "Runtimes that
compute with these values are expected to use the arithmetic of Bunny's numeric constitution
(`docs/NUMERIC_CONSTITUTION.md` in flyingrobots/bunny)."

The numeric profile governs what numbers in an artifact mean. It does not govern how a runtime
computes with them. That second question belongs to the algorithm identities of the consuming
profile (see [B5](#b5-the-integrator-identity-and-everything-else-that-affects-pixels)), and those
may cite Bunny functions by name, because Bunny owns the math. This split keeps Geordi's validator
free of any Bunny dependency: checking a raw integer needs no Bunny type.

**One profile, one kernel.** Using Bunny's Q32.32 exactly, rather than a Geordi-specific scale such
as `2^24` or `10^6`, means lumen converts artifact numbers to Bunny values with no arithmetic at
all. Any other scale would put a rounding step between the artifact and the kernel, and that step
would itself have to be specified, tested and receipted.

What would change this: Bunny changing its canonical fixed-point format. That would be a Bunny
contract change under its Fidelity Rule, and Geordi would answer it with a new profile version.

### A5. Coexistence with `geordi-finite-binary64/1`

**Recommendation**: one numeric profile per artifact.

- Every artifact that carries governed numbers declares `numericProfile` at the top level, as
  `geordi-ir/1` already does. The declared profile governs every scalar field the artifact's
  schema marks as governed.
- Integer counts, indices, image dimensions, sample counts and seeds are plain integers in every
  profile. They are not scalar values and no numeric profile governs them; their schema bounds
  them. This matches today's practice for glyph ids and mesh counts.
- Mixing profiles inside one artifact (per field) is rejected. Per-field profiles would let a
  binary64 value and a Q32.32 value meet in one computation, which is exactly the ambiguity the
  profile exists to remove.
- `geordi-ir/1` keeps accepting only `geordi-finite-binary64/1`. This document does not change
  `geordi-ir/1`.

Runtime negotiation extends the existing pattern: a runtime profile lists the
`(artifact version, numeric profile)` pairs it supports, and the runtime rejects any other pair
before reading the scene body, as `assert_native_runtime_profile` does for `geordi-ir/1`.

Alternative: per-field profiles (for example binary64 for UI layout next to fixed-point geometry).
Rejected for now; it can be reconsidered if a mixed 2D/3D artifact is ever designed, and would
then need its own conversion law.

### A6. What compiler normalization owes

The design laws place conversion in compiler normalization. For this profile normalization must:

1. Take the exact value of the authored number. A binary64 value is an exact dyadic rational; a
   decimal literal is an exact decimal rational.
2. Round it to the nearest multiple of `2^-32`, ties to even, using the same rule as Bunny's
   float ingress. This is a single rounding from the exact value; normalization must not round
   through `f32` or any intermediate format.
3. Reject the value, with a source-located diagnostic, when the rounded raw value is outside the
   safe range or outside the field's domain. Never clamp.
4. Record in the compiler receipt the source numeric profile, the target profile and the identity
   of the conversion rule (proposed: `geordi-round-nearest-even-q32.32/1`).

Conversions that need a nonlinear function, such as sRGB hex colours to linear light or angles to
tangents, are also normalization steps. Each needs its own named rule identity, because two
reasonable implementations disagree in the last bit. Version 1 of the scene profile lets authors
avoid these entirely by writing linear-light values and tangents directly.

### A7. Values that are not lengths

| Quantity | Version 1 representation | Why |
| --- | --- | --- |
| Field of view | `tanHalfFovY`: Q32.32 tangent of half the vertical field of view | Bunny's perspective builder and planned camera ([bunny#138](https://github.com/flyingrobots/bunny/issues/138)) take the tangent, so no trigonometry is needed and no angle-to-tangent rule enters the contract. |
| Rotation | Entries of an affine matrix | Bunny's `FixedAffine3` takes matrix entries. Angles would need a sine and cosine rule in the contract. |
| Angles in general | Not in version 1 | Bunny's `FixedAngle` (binary angles, table-based sine and cosine) is a candidate encoding for a later version. |
| Colour of a surface | Linear-light reflectance per channel, Q32.32 in `[0, 1]` | The design laws require colour interpolation to name sRGB or linear light; shading is linear. |
| Light radiance | Linear-light radiance per channel, Q32.32, `0` to `65536` | Radiance is not bounded by 1. The cap keeps sample sums inside `i64` (see [B4](#b4-render-settings)). |
| Ratios | Q32.32 | Same profile, field-specific bounds. |

Colour primaries: linear light with sRGB (Rec. 709) primaries. The output encoding applies the
sRGB transfer function through the tone curve identity.

## Part B: the ray-traced 3D scene profile

### B1. Artifact form

**Recommendation**: a separate artifact, `geordi-ray-traced-scene/1`, stored as
`*.rt-scene.geordi.json`, with its own validator, receipt and runtime profile type.

| Option | For | Against |
| --- | --- | --- |
| Separate artifact (recommended) | Matches how strict text and the bunny mesh grew; leaves `geordi-ir/1` untouched; one numeric profile per artifact falls out naturally; can be folded into a future IR after proof | A second top-level format until it is folded in |
| New IR version `geordi-ir/2` | One artifact family | Forces a decision about 2D UI nodes, draw order and binary64 layout in the same change; every existing `geordi-ir/1` consumer is affected |
| New node kinds in `geordi-ir/1` | No new version | `geordi-ir/1` is a 2D draw-order scene with a fixed binary64 profile and a rectangle-only Rust type with `deny_unknown_fields`; 3D instances, a camera and lights do not fit its laws |

The VISION proof ladder says Geordi "grows by claims, not by wishful API surface". A separate
artifact is the smallest surface that can carry the claim.

What would change this: a need to render one artifact that mixes 2D UI and a ray-traced 3D view.
That is a later IR design, informed by both proven artifacts.

### B2. Scene content

The illustrative shape below is abridged: one mesh, one instance, one material. Raw values are
annotated in comments for the reader; comments are not valid JSON and the real artifact has none.

```jsonc
{
  "sceneVersion": "geordi-ray-traced-scene/1",
  "numericProfile": "geordi-fixed-q32.32/1",
  "id": "lumen:reference",
  "requires": [
    "geordi/ray-traced-3d/1",
    "asset.mesh",
    "mesh.triangle",
    "instance.affine3",
    "camera.pinhole",
    "material.diffuse",
    "light.directional",
    "light.uniform-sky"
  ],
  "meshes": [
    {
      "id": "ground",
      "path": "meshes/ground.ply",
      "sha256": "sha256:<64 lowercase hex>",
      "layout": "bunny-ply-binary-le-f32/1",
      "counts": { "vertices": 4, "triangles": 2 },
      "bounds": {
        "min": [-42949672960, 0, -42949672960],   // (-10, 0, -10)
        "max": [42949672960, 0, 42949672960]      // (10, 0, 10)
      }
    }
  ],
  "materials": [
    { "id": "grey", "kind": "diffuse", "albedo": [3006477107, 3006477107, 3006477107] } // 0.7
  ],
  "instances": [
    {
      "id": "ground-0",
      "mesh": "ground",
      "material": "grey",
      "worldFromMesh": {
        "linearColumnMajor": [4294967296, 0, 0, 0, 4294967296, 0, 0, 0, 4294967296], // identity
        "translation": [0, 0, 0]
      }
    }
  ],
  "camera": {
    "kind": "pinhole",
    "position": [0, 4294967296, 21474836480],   // (0, 1, 5)
    "forward": [0, 0, -4294967296],              // (0, 0, -1)
    "up": [0, 4294967296, 0],                    // (0, 1, 0)
    "tanHalfFovY": 1779033704                    // about 0.4142, tan(22.5 degrees)
  },
  "lights": [
    {
      "kind": "directional",
      "id": "sun",
      "towardLight": [2147483648, 4294967296, 1073741824], // (0.5, 1.0, 0.25), max component 1.0
      "radiance": [12884901888, 12884901888, 12884901888] // 3.0
    },
    { "kind": "uniformSky", "id": "sky", "radiance": [1288490189, 1717986918, 2576980378] }
  ],
  "film": { "width": 3840, "height": 2160 },
  "render": {
    "integrator": "geordi-rt-diffuse-path/1",
    "samplesPerPixel": 16,
    "sampler": "<Bunny sampler identity, planned in bunny#221>",
    "seed": 0,
    "maxBounces": 1,
    "reconstruction": "geordi-box-filter/1",
    "toneCurve": "<Bunny tone curve identity, planned in bunny#222>",
    "output": "geordi-rgba8-srgb-opaque/1"
  }
}
```

**Meshes.** Each mesh is referenced by a fixture-relative path and its SHA-256, exactly as
`geordi-mesh-asset/1` does today. `layout` names how bytes become Q32.32 vertices and triangle
indices, so it fixes both the container and the conversion:

- Version 1 accepts one layout, `bunny-ply-binary-le-f32/1`: the binary little-endian PLY that
  `bunny-codec`'s `parse_binary_ply` reads, with each `f32` coordinate converted by Bunny's
  `try_from_f32` (round to nearest, ties to even; non-finite input rejected).
- An ASCII PLY layout waits for [bunny#247](https://github.com/flyingrobots/bunny/issues/247) and
  must be a different identity: converting decimal text directly to Q32.32 and converting it
  through `f32` first give different raw values for most inputs.
- `counts` and `bounds` are declared so the validator can check the trace domain without reading
  mesh bytes. The runtime recomputes both from the decoded mesh and rejects a mismatch.
- A mesh coordinate is one local unit. Scale belongs to the instance transform; the layout claims
  no physical unit.

**Instances.** `worldFromMesh` is an affine transform: a 3x3 linear part in column-major order and
a translation, all Q32.32, following Bunny's `target_from_source` naming and column-vector
convention. The runtime transforms each vertex once, before building the acceleration structure,
using the vertex transform rule of the integrator identity. Normals come from the transformed
triangle, so no inverse-transpose is needed. Triangles are two-sided (Bunny's triangle test is).
Degenerate triangles are accepted; Bunny's exact test never reports a hit on them.

**Primitive order.** Bunny's `closest_hit` breaks equal-distance ties by the lower primitive
index, so the index order is pixel-affecting. The profile fixes it: instances in artifact order,
then triangles in mesh order. The primitive index is a `u32`; a scene with more than `2^32 - 1`
triangles in total is rejected.

**Camera.** A pinhole camera given by `position`, `forward` (the look direction, need not be unit
length), `up`, and `tanHalfFovY`. This matches the inputs planned for `bunny-optics`
([bunny#138](https://github.com/flyingrobots/bunny/issues/138)) and Bunny's `-Z` view convention.
It differs from the mesh descriptor's `eye`/`target` camera; normalization can convert one to the
other exactly (`forward = target - eye`). Rejected: zero `forward`, zero `up`, `up` parallel to
`forward` (checked exactly with a 128-bit cross product), and `tanHalfFovY` outside
`(0, 4]` (the upper bound is a proposal; it depends on how bunny#138 scales ray directions into the
trace domain).

**Image coordinates.** Pixel `(x, y)` covers `[x, x + 1) x [y, y + 1)` in image space; `x` grows
to the right and `y` grows downward, with row 0 at the top. Camera-space `+Y` up therefore maps to
decreasing `y`. Pixels are square: both axes are scaled by `tanHalfFovY / (height / 2)`, so no
rounded aspect ratio such as `3840 / 2160` enters the computation. This is the explicit viewport
origin and direction the coordinate law requires.

**Materials (version 1).** `diffuse` only: a Lambertian surface with per-channel linear albedo in
`[0, 1]`. Every instance names one material.

**Lights (version 1).**

- `directional`: a light at infinity with no angular size, given by `towardLight` (the direction
  from a surface to the light) and per-channel radiance. Shadows are hard. At most one directional
  light. `towardLight` need not be unit length, but its largest component magnitude must be
  exactly 1.0 (raw `2^32`). That makes it a valid trace direction with no runtime division, and it
  bounds shadow-ray distances: along the dominant axis a distance `t` moves exactly `t` units, and
  two points inside the trace domain differ by less than 512 units on any axis, so every occluder
  lies at a distance below 512. Normalization rescales an authored direction to this form.
- `uniformSky`: a constant radiance seen by every ray that leaves the scene, including camera rays
  that hit nothing. Exactly one.

This is the smallest set that makes the first Geordi-driven render honest: diffuse shading,
shadows and one indirect bounce ([lumen#3](https://github.com/flyingrobots/lumen/issues/3)) each
have a physical meaning, and nothing in the image comes from an unstated default.

**Not included in version 1**, and rejected when present: point, spot and area lights; emissive
surfaces; specular, glossy, metallic, transparent or refractive materials; textures and texture
coordinates; vertex normals and smooth shading; analytic spheres, planes or any non-triangle
primitive; environment maps; depth of field, motion blur and animation; fog and participating
media; exposure or tone-mapping parameters beyond the named tone curve; Russian roulette; more
than one bounce.

### B3. The trace-domain limit

Bunny's kernels accept only coordinates below 256 units and refuse anything else by returning
`None`. A scene that does not fit must fail loudly, never render with missing triangles.

**Recommendation**: check twice, with the runtime as the authority.

1. **Validator (early, conservative).** For each instance, transform the eight corners of the
   declared mesh bounds with exact 128-bit integer arithmetic and require every coordinate to be
   below 255 units in magnitude. The one-unit margin covers the rounding of the runtime's vertex
   transform. Also require the camera position to lie inside the domain. Because an affine map
   sends a box to the convex hull of its transformed corners, every transformed vertex lies inside
   that hull. The check therefore never accepts a scene whose vertices leave the domain. It can
   reject a scene whose vertices fit but whose transformed box corners do not (for example a
   rotated mesh near the edge); the author then moves or scales the instance.
2. **Runtime (exact).** After transforming vertices, the runtime constructs every `TraceTriangle`
   and every camera `TraceRay`. Any `None` is a hard error that names the instance and triangle.
   The runtime never clamps a coordinate, skips a triangle or rescales the scene.

Rescaling a scene to fit is a compiler normalization step that the author asks for and the
receipt records, never something a runtime does on its own.

### B4. Render settings

All of these change pixels, so all of them live in the artifact's `render` block (image size lives
in `film`):

| Setting | Version 1 domain | Notes |
| --- | --- | --- |
| `samplesPerPixel` | A power of two, `1..=1024` | A power of two makes the mean an exact shift with a stated rounding. The 4K target uses 16. |
| `sampler` | One Bunny sampler identity | Planned in [bunny#221](https://github.com/flyingrobots/bunny/issues/221). The sample value depends only on `(pixel, sample index, dimension, seed)`, so thread count and tile order cannot change it. |
| `seed` | Integer `0..=2^32 - 1` | Plain integer, not a scalar. |
| `maxBounces` | `0` or `1` | Larger values are rejected until a gate proves them. |
| `reconstruction` | `geordi-box-filter/1` | Each sample contributes only to its own pixel with equal weight; the pixel value is the per-channel sum of sample radiance divided by `samplesPerPixel`, rounded to nearest, ties to even. |
| `toneCurve` | One Bunny tone curve identity | Planned in [bunny#222](https://github.com/flyingrobots/bunny/issues/222): maps linear radiance to an 8-bit sRGB-encoded value with a stated rounding rule. |
| `output` | `geordi-rgba8-srgb-opaque/1` | RGBA8, sRGB-encoded colour, alpha always 255. |

**Why the radiance cap.** With albedo at most 1, at most one bounce and every light at most
`65536` per channel, one sample's radiance is below `2^18` units, which is `2^50` raw. A sum of
1024 samples stays below `2^60` raw, inside `i64`. Integer addition is then exact and associative,
so the sum is the same in any order: tiles, threads and GPU lanes cannot change it.

`film.width` and `film.height` are integers in `1..=16384`. The `viewport` argument of
`render(ir, viewport, assetPack, runtimeProfile)` must equal the film size; a runtime rejects any
other viewport rather than scaling.

### B5. The integrator identity and everything else that affects pixels

The settings above do not fix every bit. A ray tracer also decides how a bounce direction is drawn
from a sample, how a secondary ray avoids hitting the surface it leaves, how vertices are
transformed, and in what order shading terms are multiplied. Two runtimes that disagree on any of
these produce different bytes.

**Recommendation**: the artifact names an integrator identity, `geordi-rt-diffuse-path/1`, and
Geordi owns a short written definition of it. The definition fixes, at minimum:

- the vertex transform rule (proposed: Bunny's `FixedAffine3::checked_transform_point`, overflow
  rejected);
- camera ray generation from pixel and sub-pixel offset (Bunny, planned in bunny#138);
- closest-hit and shadow queries (Bunny's `closest_hit` and `any_hit` with `TraceRay` and
  `TraceTriangle`, the primitive order above, and shadow rays toward the sun along `towardLight`
  with `t_max` of 512 units, raw `2^41`, which covers every in-domain occluder as explained in
  [B2](#b2-scene-content); camera and bounce rays use `t_max` of `i64::MAX` raw, no distance
  limit);
- the self-intersection rule for secondary rays (proposed: exclude the primitive just hit; no
  distance epsilon);
- the facing rule for two-sided triangles (the shading normal faces the incoming ray);
- the hemisphere sampling map and Lambertian evaluation (Bunny, planned in bunny#160);
- the order and rounding of every multiplication in the shading sum;
- which sampler dimensions each decision consumes.

Each step that Bunny owns is cited by function name. Under Bunny's Fidelity Rule an existing public
function never changes its output bits, so a function name plus the Bunny release that introduced
it is a stable identity. The receipt still records the Bunny revision a runtime was built from, for
audit.

A runtime profile declares the integrator, sampler and tone curve identities it implements; a
runtime rejects an artifact that names one it does not implement. The definition is written so that
a second, independent implementation is possible; that independence is a later proof gate, not a
version 1 requirement.

**Every pixel-affecting input and where it lives**

| Input | Lives in |
| --- | --- |
| Mesh bytes | Asset pack, by SHA-256 |
| Mesh decode rule | Artifact: `meshes[].layout` |
| Instance transforms, instance order, material assignment | Artifact |
| Camera and image size | Artifact: `camera`, `film` (the viewport argument must match) |
| Materials, lights, sky | Artifact |
| Sample count, sampler, seed, bounces, reconstruction, tone curve, output encoding | Artifact: `render` |
| Algorithm (all rules listed above) | Artifact names `render.integrator`; runtime profile declares support |
| Number meaning | Artifact: `numericProfile` |

**Inputs that must not affect pixels**, and that the proof gates test: thread count, tile size and
order, acceleration-structure build choices (Bunny proves the closest hit does not depend on tree
shape), CPU architecture, operating system, compiler and optimization level, the PNG encoder, and
CPU versus GPU execution.

### B6. Output

The render result is Geordi's `RenderedImage`: RGBA8, row-major, row 0 at the top, `width * height
* 4` bytes. Alpha is 255 for every pixel in version 1.

The image hash is `sha256:` followed by the lowercase hex SHA-256 of exactly those RGBA bytes.
Width, height and format are recorded beside it in the receipt. A plain digest of the raw bytes can
be reproduced with standard tools from a raw dump.

PNG files are a lumen output convenience. PNG compression varies by encoder and settings, so a PNG
hash is not a contract value. A receipt may record it as informational only.

`RenderedImage` cannot be constructed outside `geordi-renderer` today, and lumen must return one
([lumen#6](https://github.com/flyingrobots/lumen/issues/6)). The first Geordi slice therefore adds a
public, validating constructor from width, height and RGBA bytes.

### B7. Receipt

`geordi-ray-traced-render-receipt/1`, canonical JSON, records:

- `receiptVersion`, `hashAlgorithm: "sha256"`;
- `sceneVersion`, `sceneHash` (hash of the canonical scene bytes) and `scenePath`;
- `numericProfile`;
- `assets`: one entry per mesh with `id`, `path`, `sha256` and `layout`;
- `integrator`, `sampler`, `seed`, `samplesPerPixel`, `maxBounces`, `reconstruction`, `toneCurve`,
  `output`;
- `runtime`: name, version, and the Bunny revision it was built from;
- `image`: `width`, `height`, `format: "rgba8"`, `imageHash`.

Two machines show they produced the same image when their receipts agree on every field except
`runtime` and their `imageHash` values are equal. A difference in any other field means they did
not render the same input, and the comparison is void rather than failed.

### B8. Validation and failure

A runtime, and the Geordi validator where it can see the fact, must reject loudly, before drawing:

- an unknown `sceneVersion`, `numericProfile`, requirement, integrator, sampler, tone curve,
  reconstruction or output identity, or one the runtime does not implement;
- any numeric-profile violation from [A3](#a3-scale-range-and-what-a-validator-rejects);
- unknown or missing fields (Rust DTOs use `deny_unknown_fields`, as existing Geordi DTOs do);
- duplicate ids; an instance naming a missing mesh or material;
- a mesh file that is missing, outside the fixture root, or whose hash, layout, counts or bounds
  do not match its declaration;
- a triangle index out of range;
- a scene outside the trace domain ([B3](#b3-the-trace-domain-limit));
- a degenerate camera or a `tanHalfFovY` outside its domain;
- a `towardLight` whose largest component magnitude is not exactly 1.0 (this also rejects the
  zero vector);
- an albedo outside `[0, 1]`, a radiance outside `[0, 65536]`, more than one directional light, or
  not exactly one sky;
- a `samplesPerPixel`, `seed`, `maxBounces` or film size outside its domain;
- a viewport argument that differs from the film size;
- any arithmetic overflow during vertex transform or ray construction.

No runtime approximates, clamps, drops geometry or substitutes a default for any of these.

### B9. Proof gates and non-claims

Geordi may claim `geordi/ray-traced-3d/1` only after these gates pass with recorded receipts:

1. **Validation conformance.** Golden valid and invalid scenes in Geordi produce the expected
   acceptance and diagnostic paths.
2. **Thread invariance.** Lumen renders the same scene on one thread and on all cores with equal
   image hashes (planned in [lumen#4](https://github.com/flyingrobots/lumen/issues/4)).
3. **Machine invariance.** Two machines with different CPU architectures (for example
   `aarch64` and `x86_64`) produce equal image hashes from the same receipt inputs.
4. **Artifact round trip.** Lumen's render of the Geordi artifact for its reference scene equals
   its built-in render of that scene (planned in
   [lumen#6](https://github.com/flyingrobots/lumen/issues/6)).

Later gates, each a separate claim:

- **CPU and GPU agreement**: the GPU render has the CPU image hash (planned in
  [lumen#7](https://github.com/flyingrobots/lumen/issues/7)).
- **Independent implementation**: a second implementation of `geordi-rt-diffuse-path/1`, written
  from its definition, agrees. This is the evidence that the definition, not one codebase, fixes
  the bytes.

Explicit non-claims:

- no claim of physical accuracy, unbiasedness or convergence;
- no claim of agreement with any floating-point renderer, or with the existing binary64 bunny mesh
  demo;
- no browser runtime and no browser gate in version 1;
- no claim for scenes outside the trace domain;
- no performance claim in Geordi; the 4K timing is lumen's claim
  ([lumen#5](https://github.com/flyingrobots/lumen/issues/5));
- no claim that `geordi-ir/1` or the strict text profile gains anything from this profile.

### B10. Shared types

The interop rule is "Shared primitive graphics contract -> Bunny schema; Render artifact, feature
profile, or receipt -> Geordi schema" (`docs/design/2026-06-bunny-geordi-interop.md`).

| Record | Owner | Note |
| --- | --- | --- |
| Q32.32 vector (`x, y, z` as `BunnyFixedQ32_32Raw`) | Bunny schema | New: today's `BunnyVec3` uses the `f32` scalar. |
| Q32.32 affine transform (3x3 linear plus translation) | Bunny schema | Mirrors `FixedAffine3`. |
| Pinhole camera (`position`, `forward`, `up`, `tanHalfFovY`) | Bunny schema | Mirrors the planned bunny#138 inputs; image size is not part of it. |
| Mesh layout identities and the mesh hash rule | Bunny | Named by Geordi, defined by `bunny-codec` and `bunny-mesh`. |
| Ray | Neither, in artifacts | Rays are runtime values and never appear in a scene or receipt. |
| Scene artifact, mesh references, instances, materials, lights, film, render settings | Geordi | Scene semantics. |
| Runtime profile, receipt, image hash | Geordi | Proof surface. |

Geordi has no Wesley common-type generation yet, and its rule is that serialized shapes shared by
TypeScript and Rust must be generated, not mirrored by hand. **Recommendation**: version 1 ships a
Rust-only validator with local Rust DTOs marked local-only, and no TypeScript mirror. Lumen is Rust,
so nothing needs a TypeScript copy yet. When Geordi consumes Bunny's generated DTOs, the three
Bunny-owned records move to them. Bunny's generated TypeScript represents Q32.32 as `bigint`;
a future TypeScript reader converts each safe JSON integer with `BigInt`, which is exact.

## Part C: sequencing

### First Geordi slice ([geordi#153](https://github.com/flyingrobots/geordi/issues/153))

- Constants for `geordi-fixed-q32.32/1`, `geordi-ray-traced-scene/1`, the requirement vocabulary
  and the accepted identities.
- Rust DTOs and `validate_geordi_ray_traced_scene` in `geordi-ir`, with no Bunny dependency.
  Range, domain and trace-domain checks use plain `i64` and `i128` arithmetic.
- A runtime profile type for this artifact and a negotiation function in the style of
  `assert_native_runtime_profile`.
- The receipt type and a canonical image-hash function.
- A public, validating `RenderedImage` constructor.
- One valid fixture with a small binary PLY mesh, and one failure fixture per rejection class in
  [B8](#b8-validation-and-failure).
- No renderer in Geordi.

### First lumen slice ([lumen#6](https://github.com/flyingrobots/lumen/issues/6))

- Load and validate the artifact through `geordi-ir`, verify asset hashes, decode meshes with
  `bunny-codec`, transform vertices, build the BVH and render with the declared identities.
- Return `RenderedImage` and the receipt.
- Gate: the image hash of the artifact render equals the built-in render of the same scene.

This gate needs lumen's built-in reference scene to be made only of what version 1 can express:
triangle meshes, diffuse materials, one sun and a sky. If lumen#2's scene uses an analytic sphere
or plane, it cannot round-trip, and either that scene or this profile must change.

### Issues to file after the decision (not filed)

1. Geordi: write the `geordi-rt-diffuse-path/1` integrator definition as its own design record once
   bunny#138, #221, #222 and #160 merge.
2. Geordi: add `geordi-fixed-q32.32/1` to `docs/V0_DESIGN_LAWS.md` as an accepted numeric profile.
3. Geordi: public validating `RenderedImage` constructor and image-hash helper (may fold into #153).
4. Geordi: convert a binary PLY reference mesh and record its hashes as a fixture asset.
5. Geordi: compiler normalization rule `geordi-round-nearest-even-q32.32/1` with golden vectors.
6. Bunny: schema types for a Q32.32 vector, a Q32.32 affine transform and the pinhole camera.
7. Bunny: publish stable identity strings and golden vectors for the sampler and tone curve.
8. Lumen: make the built-in reference scene triangle-only so the round-trip gate is possible.
9. Lumen: cross-architecture image-hash gate in CI.
10. Geordi: TypeScript reader for the scene artifact, after Wesley common-type generation exists.

## Quality-bar answers

The VISION quality bar asks seven questions of every new rendering claim.

| Question | Answer |
| --- | --- |
| What exact artifact is consumed? | `geordi-ray-traced-scene/1` with `numericProfile: "geordi-fixed-q32.32/1"`. |
| What feature profile does it require? | `geordi/ray-traced-3d/1` plus the requirements in [B2](#b2-scene-content). |
| What assets are needed? | Triangle meshes by SHA-256 in layout `bunny-ply-binary-le-f32/1`. |
| What validates the artifact? | `validate_geordi_ray_traced_scene` in `geordi-ir` (planned in #153), then the runtime's exact checks. |
| What fails loudly? | Everything in [B8](#b8-validation-and-failure). |
| What browser and native gates prove the behavior? | Native only: the gates in [B9](#b9-proof-gates-and-non-claims). No browser gate in version 1. |
| What is explicitly not claimed? | The non-claims in [B9](#b9-proof-gates-and-non-claims). |

## Open questions for the maintainer

1. Accept the raw-integer encoding with the safe-integer range (A2, A3), or require the full `i64`
   range with decimal-string raw values?
2. Accept a separate artifact (B1) rather than `geordi-ir/2`?
3. Accept that the integrator identity is defined by Geordi in terms of named Bunny functions (B5),
   or should Bunny own the whole integrator definition?
4. Version 1 limits: `maxBounces` at most 1, one directional light, radiance at most `65536`,
   `samplesPerPixel` a power of two up to 1024, `tanHalfFovY` in `(0, 4]`. Any to widen or narrow?
5. Should the image hash be the plain SHA-256 of the RGBA bytes (recommended) or a
   domain-separated hash that includes width, height and format?
6. Should `RenderedImage` stay in `geordi-renderer`, or move to a small crate so lumen does not
   depend on the rectangle renderer?
7. Is the cross-architecture gate (B9, gate 3) required for the first claim, or may the first
   claim rest on thread invariance and the round trip?
