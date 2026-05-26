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
fixtures/render-everywhere/strict-text/strict-text-fixture.schema.md
fixtures/render-everywhere/strict-text/strict-text-fixture-receipt.schema.md
~~~

`outline-evidence-pack.schema.md` defines `geordi-glyph-evidence-pack/1`, the fixture-local
`outlinePaths` evidence shape selected for the first visible strict text proof. Parser and renderer
support lands in later slices; this directory must not imply general text or platform text support.

Failure fixtures:

~~~text
fixtures/render-everywhere/strict-text/failures/bad-outline-command.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json
~~~

`bad-outline-command.outline-evidence.geordi.json` is an S056 evidence-pack failure fixture. It
keeps top-level evidence metadata valid while violating command contour state and per-command field
rules.

Canonical fixture A:

~~~text
fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json
~~~

The S041 fixture records the semantic text `GEORDI` using the committed Lato Regular font pack. Glyph
ids and advances were prepared outside the renderer from the checked-in font bytes and stored as
fixed `geordi-fixed-26.6/1` integers. Runtime shaping remains outside the compliant strict path.
The S053 outline evidence pack covers glyph ids `14`, `11`, `27`, `33`, `9`, and `17` with
fixture-local `outlinePaths` geometry from the same font bytes. Its current committed byte hash is
`sha256:218890095219e9ce6753f2fef177d629a43b571ec37f01635dc31ba3601b4af3`.

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
