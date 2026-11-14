# Ray-Traced Scene Fixtures

Validation fixtures for `geordi-ray-traced-scene/1`. The contract they exercise is described in
[`docs/ray-traced-scene-profile.md`](../../docs/ray-traced-scene-profile.md). No fixture here has
been rendered; Geordi has no ray tracer.

## Contents

| Path | Content |
| --- | --- |
| `reference.rt-scene.geordi.json` | The valid reference scene: one unit-quad mesh, two instances (a ground plane scaled by 8 and a card rotated 90 degrees about x), two diffuse materials, one sun, one sky, a 64x36 film. |
| `meshes/unit-quad.ply` | Binary little-endian PLY (`bunny-ply-binary-le-f32/1`): 4 `float x, y, z` vertices of the quad `[-1, 1] x {0} x [-1, 1]` and 2 `uchar int` triangle faces. Every coordinate is exactly representable, so the declared Q32.32 bounds are exact. |
| `failures/*.rt-scene.geordi.json` | One rejected scene per rule. Each is the reference scene with one change. |
| `failures/expected-diagnostics.json` | For each failure fixture: the stage that rejects it (`parse`, `validate` or `assets`), the diagnostic `code` and the JSON `path`. |

The reference scene names the placeholder identities `fixture-placeholder-sampler/1` and
`fixture-placeholder-tone-curve/1`, because Bunny has published no sampler or tone curve identity
yet. The scene therefore validates in Geordi but no runtime implements it.

## Rules

- The fixture root for mesh paths is this directory, for the reference scene and for every
  failure fixture.
- `reference.rt-scene.geordi.json` is stored in canonical JSON (sorted keys, two-space indentation,
  final newline), so its `sceneHash` is the SHA-256 of the file bytes.
- Each failure fixture produces exactly one diagnostic, at the recorded stage, after every earlier
  stage passes. The Rust test `every_failure_fixture_fails_with_its_recorded_diagnostic` in
  `crates/geordi-ir` checks the exact code and path for every file and fails if a fixture and its
  expectation entry do not match one to one.
- Text-level failures (`json-invalid`, `number-fraction`, `number-exponent`,
  `number-negative-zero`) are deliberately not canonical JSON.

When you change the reference scene, change each failure fixture the same way and keep the
expectations file in step; the test above reports any drift.
