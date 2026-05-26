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
fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json
~~~

Canonical fixture A:

~~~text
fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
~~~

The S041 fixture records the semantic text `GEORDI` using the committed Lato Regular font pack. Glyph
ids and advances were prepared outside the renderer from the checked-in font bytes and stored as
fixed `geordi-fixed-26.6/1` integers. Runtime shaping remains outside the compliant strict path.

Canonical fixture B:

~~~text
fixtures/render-everywhere/strict-text/text-0123.strict-text.geordi.json
~~~

The S042 fixture records the semantic text `text 0123` with lowercase letters, a space glyph, and
digits in the same Lato Regular font pack. It exists to catch assumptions that only uppercase word
fixtures are valid strict text evidence.
