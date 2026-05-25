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
fixtures/render-everywhere/strict-text/strict-text-fixture.schema.md
~~~
