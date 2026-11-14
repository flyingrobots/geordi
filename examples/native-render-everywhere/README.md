# Native Render-Everywhere Harness

This Rust binary is the native side of the Geordi render-everywhere proof.

It loads the shared fixture manifest from:

```text
fixtures/render-everywhere/hello-panel/fixture.json
```

It loads the shared Geordi IR artifact from:

```text
fixtures/render-everywhere/hello-panel/scene.geordi.json
```

The same fixture also contains constrained GPVue source at:

```text
fixtures/render-everywhere/hello-panel/source.gpvue
```

The harness deserializes JSON at the Rust boundary, validates the artifact hash and receipt against
the loaded scene bytes, validates the supported rectangle-only IR profile, renders to a native image
buffer, and can either open a window or run offscreen pixel probes.

The native harness also has a unified demo window that can switch between the rectangle, bunny,
and strict-text scenes. Use `--demo` to open it and `1` / `2` / `3` or the left/right arrows to
switch scenes.

The binary also loads the Stanford bunny mesh asset from:

```text
fixtures/render-everywhere/assets/stanford-bunny
```

The bunny path validates the checked-in mesh manifest, parses the checked-in PLY bytes, computes
fixed-rate playback frames, and draws the mesh as a rotating software wireframe.

## Bunny math in the bunny path

"Bunny" names two things here: the Stanford bunny mesh, and the Bunny crates
(`bunny-num`, `bunny-linalg`, `bunny-geom`, version 0.7.1 from crates.io) that hold Geordi's
deterministic Q32.32 math. The mesh path uses the crates as follows.

| Step | Where it runs | Numbers |
| --- | --- | --- |
| Playback axis normalization and axis-angle rotation | `bunny.rs` (`rotate_around_axis`) | binary64 |
| Rotated position to Q32.32 | `bunny/q32_boundary.rs`, nearest raw unit, ties to even | exact rounding |
| Camera (`view_from_world`) | `FixedMat4::try_look_at` | Q32.32 |
| Depth range `[near, far]`, both ends kept | `FixedPlane3::classify` in view space | Q32.32 |
| Perspective and divide by `w` | `FixedMat4::try_perspective`, `checked_div` | Q32.32 |
| NDC to pixels (origin top-left, `y` down) | `Viewport::try_ndc_to_viewport` | Q32.32 |
| Snap to a pixel and draw the edge | `bunny.rs` (`rounded_pixel`, `draw_line`) | exact conversion, then binary64 rounding |

The rotation stays in binary64 because Bunny 0.7.1 has no axis-angle rotation. The tangent of half
the vertical field of view is also computed in binary64 and rounded to Q32.32, because Bunny has
no tangent; Bunny's perspective builder takes that tangent directly. An edge is skipped when either
endpoint lies outside the depth range or a checked Q32.32 step overflows, as the binary64 code
skipped non-finite or out-of-range endpoints.

Evidence that the switch did not change the picture lives in
`src/bunny/render_fidelity_tests.rs`: the binary64 camera and projection code is retained there as
the reference, every frame of a full turn draws identical RGBA bytes on both paths, every fixture
vertex on 60 frames and 32,000 generated camera and point cases stay within a derived per-position
error bound, and five frames match SHA-256 digests recorded from the binary64 renderer.

Two behaviours differ in cases the fixture does not use: a non-square viewport divides `x` by the
aspect ratio, as the projection law states, and camera or projection values that Q32.32 cannot
hold, or that Bunny refuses, are manifest validation errors.

The native harness also has a strict text rejection preflight for committed negative fixtures:

```text
fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json
```

That preflight uses the Rust strict text validator and must reject unsupported strict text fixture
requirements before any native drawing path treats them as compliant.

The native harness can also load and render the canonical strict text fixture offscreen through the
Rust outline renderer:

```text
fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json
```

The strict text smoke mode validates the fixture, font pack, font references, outline evidence, and
native render path. It does not open a window and does not claim browser/native pixel identity.

## Commands

Run the smoke gate without opening a window:

```bash
cargo run -p native-render-everywhere -- --smoke fixtures/render-everywhere/hello-panel
```

Validate load and profile data without running pixel probes:

```bash
cargo run -p native-render-everywhere -- --check fixtures/render-everywhere/hello-panel
```

Open the native window:

```bash
cargo run -p native-render-everywhere -- fixtures/render-everywhere/hello-panel
```

Open the unified native demo window:

```bash
cargo run -p native-render-everywhere -- --demo
```

Validate the bunny asset without opening a window:

```bash
cargo run -p native-render-everywhere -- --bunny-check fixtures/render-everywhere/assets/stanford-bunny
```

Run fixed-frame bunny smoke:

```bash
cargo run -p native-render-everywhere -- --bunny-smoke fixtures/render-everywhere/assets/stanford-bunny
cargo run -p native-render-everywhere -- --bunny-smoke --frame 15 fixtures/render-everywhere/assets/stanford-bunny
cargo run -p native-render-everywhere -- --bunny-smoke --frame 60 fixtures/render-everywhere/assets/stanford-bunny
```

Open the native bunny window:

```bash
cargo run -p native-render-everywhere -- --bunny-window fixtures/render-everywhere/assets/stanford-bunny
```

Run the strict text rejection preflight:

```bash
cargo run -p native-render-everywhere -- --strict-text-reject fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json
```

Run the strict text offscreen render mode:

```bash
cargo run -p native-render-everywhere -- --strict-text-smoke fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
```

Run strict text mode with an explicit outline evidence override:

```bash
cargo run -p native-render-everywhere -- --strict-text-smoke --evidence fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
```

Run tests and lints:

```bash
cargo test -p native-render-everywhere
cargo clippy -p native-render-everywhere --all-targets -- -D warnings
```

## Strict Text Native Demo

The native strict text mode is the Rust proof for `geordi-strict-positioned-glyph-run/1`. It is not
part of `geordi-ir/1` yet. The mode consumes the same canonical strict text bundle as the browser
demo:

```text
fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/geordi.probe-policy.geordi.json
fixtures/render-everywhere/assets/fonts/font-pack.geordi.json
```

Run it with:

```bash
cargo run -p native-render-everywhere -- --strict-text-smoke fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
```

The CLI resolves the fixture path inside `fixtures/render-everywhere/strict-text`, derives the
matching `.outline-evidence.geordi.json` path unless `--evidence` is supplied, verifies the font-pack
manifest and referenced font bytes, validates fixture-to-evidence glyph coverage, checks translated
outline bounds against line boxes, renders fill-only outline geometry into an offscreen RGBA8 buffer,
and samples the fixture-local probe policy.

Expected contract fields:

| Field | Expected value or source |
| --- | --- |
| Renderer | `rust-software-outline-glyphs` |
| Fixture id | `render-everywhere:strict-text:geordi` |
| Text profile | `geordi-strict-positioned-glyph-run/1` |
| Position encoding | `geordi-fixed-26.6/1` |
| Evidence kind | `outlinePaths` |
| Glyph count | `6` |
| Draw glyph count | `6` |
| Command count | `155` |
| Bounds result | `bounds=passed` |
| Smoke result | `smoke=passed` |
| Semantic text | `semanticTextAffectsPixels=false` |

The strict text smoke path treats these as hard failures before reporting success:

| Failure family | Diagnostic surface |
| --- | --- |
| Escaping fixture or evidence path | custom native CLI argument/load error |
| Unsupported strict text feature | strict text validation error before drawing |
| Missing glyph evidence | `GEORDI_TEXT_EVIDENCE_MISSING_GLYPH` |
| Unreferenced glyph evidence | `GEORDI_TEXT_EVIDENCE_UNKNOWN_GLYPH` |
| Outline outside line box | `GEORDI_TEXT_EVIDENCE_OUTSIDE_LINE_BOX` |
| Unsupported evidence paint | `GEORDI_TEXT_EVIDENCE_UNSUPPORTED_PAINT` |
| Blank rendered output | `NativeStrictTextSmokeError` |
| Probe mismatch | `NativeStrictTextProbeError` |
| Nonblank pixels outside allowed bounds | native strict text bounds error |

Current native text nonclaims:

- no OS text API path;
- no host font fallback;
- no runtime shaping, kerning, ligatures, glyph substitution, wrapping, bidi, or complex scripts;
- no variable font axes;
- no native window mode for strict text;
- no full antialiasing parity with browser;
- no broad `shape.text` support inside `geordi-ir/1`.

## Expected Smoke Output

```text
Geordi native fixture loaded
rendererName=rust-software-rectangles
fixtureId=render-everywhere:hello-panel
fixtureVersion=geordi-render-fixture/1
artifactHash=sha256:30623d6141ba69c382c14c09eca9adedd40cb02644ff4ee9621de101da6b0082
irVersion=geordi-ir/1
numericProfile=geordi-finite-binary64/1
featureRequirements=geordi/core/1, layout.resolved, shape.rect, paint.solid
canvas=640x360
scene=render-everywhere:hello-panel
shortHash=30623d6141ba
smoke=passed
```

Expected bunny smoke output includes:

```text
Geordi native bunny fixture loaded
rendererName=rust-software-wireframe-mesh
fixtureId=render-everywhere:stanford-bunny
assetHash=sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6
vertices=1889
faces=3851
frameIndex=60
seconds=1
angleRadians=0.7853981633974483
transformProfile=geordi-fixed-rate-rotation/1
smoke=passed
```

Expected strict text smoke output includes:

```text
Geordi native strict text fixture loaded
rendererName=rust-software-outline-glyphs
fixtureId=render-everywhere:strict-text:geordi
fixtureHash=sha256:e3686b463296e0e7b019d7b014537a300f8fe6949a9053cf7d62067a978bf8c0
fontPackPath=fixtures/render-everywhere/assets/fonts/font-pack.geordi.json
fontPackHash=sha256:1b7ad58b48a3ad0d1aff0736ef014783945dc0a472de1f14b48c4211eb53533d
glyphRunHash=sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472
lineBoxHash=sha256:6d0b4e63bd04bd33e7213240a173f86fb478f23fa4cd505514c0b8af425f1e10
evidencePackId=render-everywhere:strict-text:geordi:outline-evidence
evidenceKind=outlinePaths
evidenceHash=sha256:218890095219e9ce6753f2fef177d629a43b571ec37f01635dc31ba3601b4af3
textProfile=geordi-strict-positioned-glyph-run/1
positionEncoding=geordi-fixed-26.6/1
glyphCount=6
drawGlyphCount=6
commandCount=155
semanticTextSource=GEORDI
semanticTextLanguage=en
semanticTextAffectsPixels=false
semanticTextRole=non-rendering metadata; pixels follow glyph evidence
probePolicy=<repo>/fixtures/render-everywhere/strict-text/geordi.probe-policy.geordi.json
probePolicyId=render-everywhere:strict-text:geordi:probe-policy
probePolicyVersion=geordi-strict-text-probe-policy/1
probePolicyHash=sha256:af60398eef0c062a86b9ca0bffe32b782a629254177bfc2cebe3f97a270e1b33
boundsSource=fixture-glyph-origins-plus-outline-evidence-bounds-floor-ceil-inclusive/1
allowedNonblankBounds=2,13..176,48
canvas=192x64
nonblankPixels=2092
nonblankBounds=2,13..175,47
bounds=passed
probe=text-background-top expected=transparent tolerance=alpha-zero x=100 y=5 rgba=0,0,0,0
probe=text-g-fill-top expected=fill tolerance=exact-fill-rgba x=12 y=15 rgba=17,24,39,255
probe=text-e-fill-mid expected=fill tolerance=exact-fill-rgba x=40 y=30 rgba=17,24,39,255
probe=text-o-fill-mid expected=fill tolerance=exact-fill-rgba x=68 y=30 rgba=17,24,39,255
probe=text-r-fill-mid expected=fill tolerance=exact-fill-rgba x=108 y=30 rgba=17,24,39,255
probe=text-d-fill-mid expected=fill tolerance=exact-fill-rgba x=136 y=30 rgba=17,24,39,255
probe=text-i-fill-mid expected=fill tolerance=exact-fill-rgba x=172 y=30 rgba=17,24,39,255
probe=text-background-bottom expected=transparent tolerance=alpha-zero x=180 y=55 rgba=0,0,0,0
rendered=true
smoke=passed
```

## Boundaries

This harness does not call the browser renderer or translate a browser snapshot. It loads the same
IR artifact independently, validates it independently, and renders it independently.

The GPVue source is a compiler input, not a native runtime input. The native harness must not parse
or compile `source.gpvue`; it remains an artifact consumer.

The root command below compiles GPVue into a temporary fixture directory, then points this native
harness at that emitted artifact:

```bash
pnpm test:render-everywhere:gpvue
```

The native renderer currently supports the rectangle-only MVP profile for `geordi-ir/1` fixtures:

```text
geordi/core/1
layout.resolved
shape.rect
paint.solid
```

Unsupported feature requirements must fail before drawing. Strict text remains outside `geordi-ir/1`
for this milestone: the native harness can render explicit strict text outline evidence through a
separate fixture mode, but that mode is not a broad native text stack, does not use host fonts or OS
text APIs, and does not claim full browser/native antialiasing parity.

The bunny mesh path is a demo harness path, not a general mesh node inside core Geordi IR. It proves
shared asset identity, parsed mesh metadata, deterministic sampled-frame metadata, and coarse
nonblank drawing in the native renderer.
