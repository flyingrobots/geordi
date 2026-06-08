# Strict Text Fixtures

This directory holds strict positioned glyph-run fixtures for the text milestone. These artifacts
are separate from `scene.geordi.json` until the profile proves validation, evidence, browser
rendering, native rendering, and parity metadata.

The first fixture profile is:

~~~text
geordi-strict-positioned-glyph-run/1
~~~

Renderer contract:

- The renderer consumes positioned glyph evidence, not source strings.
- The renderer validates a content-addressed font pack before interpreting glyph ids.
- Glyph coordinates use `geordi-fixed-26.6/1`.
- Source or semantic text may exist only as metadata with `affectsPixels: false`.
- Runtime shaping, host font lookup, fallback, wrapping, bidi, and platform metrics are not
  compliant rendering paths.

Schema:

~~~text
fixtures/render-everywhere/strict-text/outline-evidence-pack.schema.md
fixtures/render-everywhere/strict-text/generated-shaped-output.schema.md
fixtures/render-everywhere/strict-text/strict-text-fixture.schema.md
fixtures/render-everywhere/strict-text/strict-text-fixture-receipt.schema.md
fixtures/render-everywhere/strict-text/strict-text-probe-policy.schema.md
~~~

`outline-evidence-pack.schema.md` defines `geordi-glyph-evidence-pack/1`, the fixture-local
`outlinePaths` evidence shape selected for the first visible strict text proof. Parser and renderer
support lands in later slices; this directory must not imply general text or platform text support.
`generated-shaped-output.schema.md` defines `geordi-text-prep-generated-output/1`, the future
text-prep output bundle manifest that ties source hash, font identity, shaping fingerprint,
generated strict fixture, evidence pack, and receipt hashes together. It is not a renderer input by
itself.

Failure fixtures:

~~~text
fixtures/render-everywhere/strict-text/failures/bad-outline-command.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/failures/bad-line-box.strict-text.geordi.json
fixtures/render-everywhere/strict-text/failures/missing-glyph-evidence.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/failures/unsupported-paint.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/failures/unsupported-text-paint.strict-text.geordi.json
fixtures/render-everywhere/strict-text/failures/unknown-glyph-evidence.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json
fixtures/render-everywhere/strict-text/failures/fallback-chain.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/failures/multiline.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/failures/bidi-rtl.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/failures/complex-script.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/failures/variable-axis.text-prep.input.geordi.json
~~~

`bad-outline-command.outline-evidence.geordi.json` is an S056 evidence-pack failure fixture. It
keeps top-level evidence metadata valid while violating command contour state and per-command field
rules.
`bad-line-box.strict-text.geordi.json` is an S072 fixture/evidence linkage failure fixture. It is a
valid strict text fixture by shape, but its line box is too narrow for the canonical `GEORDI`
outline evidence, so browser and native renderers must reject before drawing.
`missing-glyph-evidence.outline-evidence.geordi.json` is an S070 evidence-coverage failure fixture.
It keeps the evidence-pack shape valid while omitting glyph evidence required by
`geordi.strict-text.geordi.json`, so TypeScript, browser, native, and Rust renderer paths must
reject it before drawing.
`unsupported-paint.outline-evidence.geordi.json` and
`unsupported-text-paint.strict-text.geordi.json` are S073 paint-scope failure fixtures. They prove
that the first strict text proof supports only fill-only `solidFill` outline evidence and rejects
stroke-like text paint requests before drawing.
`unknown-glyph-evidence.outline-evidence.geordi.json` is an S071 evidence-coverage failure fixture.
It keeps every required glyph id present but adds unreferenced fixture-local glyph evidence, so
coverage validation must reject it before renderers silently ignore the extra entry.
`fallback-chain.text-prep.input.geordi.json` is an S088 text-prep failure fixture. It keeps the
generated `GEORDI` source, geometry, and prepared glyph-run/line-box data intact while adding
fallback-chain fields and `fallbackPolicy: "font-fallback-chain/1"`, so text-prep must reject it
with `GEORDI_TEXT_PREP_FALLBACK_REQUIRED` before any generated artifact is written.
`multiline.text-prep.input.geordi.json` is an S089 text-prep failure fixture. It pins the normalized
UTF-8 hash for `GEORDI\nTEXT` and otherwise keeps first-profile font, geometry, shaping, and
prepared fixture data valid, so text-prep must reject it with
`GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE`.
`bidi-rtl.text-prep.input.geordi.json` and `complex-script.text-prep.input.geordi.json` are S090
text-prep failure fixtures. The first isolates `direction: "rtl"` on Latin source text; the second
uses Arabic script/language metadata and an escaped Arabic source string. Both must remain rejected
with `GEORDI_TEXT_PREP_UNSUPPORTED_BIDI`.
`variable-axis.text-prep.input.geordi.json` is an S091 text-prep failure fixture. It isolates a
non-empty `variationAxes` list on otherwise first-profile Latin metadata, so text-prep must reject
it with `GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES`.

Canonical fixture A:

~~~text
fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/geordi.probe-policy.geordi.json
~~~

The S041 fixture records the semantic text `GEORDI` using the committed Lato Regular font pack. Glyph
ids and advances were prepared outside the renderer from the checked-in font bytes and stored as
fixed `geordi-fixed-26.6/1` integers. Runtime shaping remains outside the compliant strict path.
The S053 outline evidence pack covers glyph ids `14`, `11`, `27`, `33`, `9`, and `17` with
fixture-local `outlinePaths` geometry from the same font bytes. Its current committed byte hash is
`sha256:218890095219e9ce6753f2fef177d629a43b571ec37f01635dc31ba3601b4af3`.
The S068 probe policy defines the named coarse browser/native sample points for this fixture. It is
blocking smoke only: fill probes must match the evidence paint exactly, transparent probes must have
alpha zero, and contour-edge samples are explicitly non-stable.
S069 extends that policy with `allowedNonblankBounds=2,13..176,48`, derived from fixture glyph
origins plus outline evidence bounds. Rendered browser/native nonblank pixels must stay inside that
box, but the policy does not require every allowed pixel to be painted.

Canonical fixture B:

~~~text
fixtures/render-everywhere/strict-text/text-0123.strict-text.geordi.json
fixtures/render-everywhere/strict-text/text-0123.outline-evidence.geordi.json
~~~

The S042 fixture records the semantic text `text 0123` with lowercase letters, a space glyph, and
digits in the same Lato Regular font pack. It exists to catch assumptions that only uppercase word
fixtures are valid strict text evidence.
The S053 outline evidence pack covers glyph ids `124`, `59`, `138`, `2`, `399`, `400`, `401`, and
`402`. Glyph id `2` is the non-drawing space evidence entry with `draws: false`, empty commands,
and zero-area bounds. Its current committed byte hash is
`sha256:88f4099b3433bbbf8c4dd18e72011645b36ac84ead5357113b1d5ab43255a996`.

S053 evidence was generated from `fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf`
using simple TrueType `glyf` contours scaled to the fixture's 48px fixed 26.6 coordinate system.
The evidence files are committed artifacts. Runtime parsers and renderers must consume these files;
they must not parse the font, shape strings, or call platform text APIs while rendering strict text.

S076 keeps shaping outside the compliant runtime path. Future generated fixtures must come from a
pinned text-prep boundary with fingerprinted font, source, shaping configuration, glyph-run,
line-box, evidence, and receipt outputs. Current fixtures remain `precomputed-fixture/1` artifacts
until that generator exists.

Generated fixture A:

~~~text
fixtures/render-everywhere/strict-text/generated/geordi.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/generated/text-prep.generation-plan.geordi.json
fixtures/render-everywhere/strict-text/generated/geordi.strict-text.geordi.json
~~~

The S082 generated fixture is emitted by `geordi-text-prep prepare` from pinned prepared
glyph-run/line-box data. It reproduces the canonical `GEORDI` glyph positions under a generated
fixture id without using runtime shaping, host font lookup, fallback, wrapping, bidi, or variable
font axes. The generation plan remains audit data and explicitly declares
`mayFeedStrictRenderer: false` until generated evidence, receipts, generated output manifests, and
comparison gates land in later slices.
