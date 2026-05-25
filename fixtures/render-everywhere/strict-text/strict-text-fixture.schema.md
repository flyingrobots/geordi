# Strict Text Fixture Schema

**Fixture version**: `geordi-strict-text-fixture/1`
**Text profile**: `geordi-strict-positioned-glyph-run/1`
**Position encoding**: `geordi-fixed-26.6/1`
**Slice**: S031

The strict text fixture is the first renderable text artifact shape. It stays outside `geordi-ir/1`
until browser and native runtimes prove the contract. The fixture references a font pack and carries
pre-positioned glyph runs plus explicit line boxes.

Fixture shape excerpt:

~~~json
{
  "fixtureVersion": "geordi-strict-text-fixture/1",
  "id": "render-everywhere:strict-text:geordi",
  "textProfile": "geordi-strict-positioned-glyph-run/1",
  "positionEncoding": "geordi-fixed-26.6/1",
  "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
  "features": [
    "text.positionedGlyphRuns",
    "text.fontPack",
    "text.lineBoxes"
  ],
  "semanticText": {
    "affectsPixels": false,
    "language": "en",
    "source": "GEORDI"
  },
  "lineBoxes": [
    {
      "baselineY": 3072,
      "height": 4096,
      "id": "line-0",
      "width": 12288,
      "x": 0,
      "y": 0
    }
  ],
  "glyphRuns": [
    {
      "fontId": "lato-regular",
      "glyphs": [
        {
          "advance": 2048,
          "glyphId": 43,
          "x": 0,
          "xOffset": 0,
          "y": 3072,
          "yOffset": 0
        }
      ],
      "id": "run-0",
      "lineBoxId": "line-0"
    }
  ]
}
~~~

Field laws:

- `fixtureVersion` must equal `geordi-strict-text-fixture/1`.
- `textProfile` must equal `geordi-strict-positioned-glyph-run/1`.
- `positionEncoding` must equal `geordi-fixed-26.6/1`.
- `fontPackPath` must be a repository-relative path to a valid font pack.
- `features` must include `text.positionedGlyphRuns`, `text.fontPack`, and `text.lineBoxes`.
- `semanticText.affectsPixels` must be `false`; strings never determine pixels in strict mode.
- `lineBoxes[].id` values must be unique.
- `glyphRuns[].id` values must be unique.
- `glyphRuns[].fontId` must resolve to an id declared in the referenced font pack.
- `glyphRuns[].lineBoxId` must resolve to a declared line box.
- `glyphs[].glyphId` must be a non-negative integer and is meaningful only relative to the font
  file hash, face index, text profile, and glyph-run schema version.
- `x`, `y`, `xOffset`, `yOffset`, `advance`, `lineBoxes[].x`, `lineBoxes[].y`,
  `lineBoxes[].width`, `lineBoxes[].height`, and `lineBoxes[].baselineY` are signed fixed-point
  integers in `geordi-fixed-26.6/1` units.
- All fixed-point integer fields must be within the inclusive shared safe integer range
  `-9007199254740991` through `9007199254740991`.
- `advance`, `lineBoxes[].width`, and `lineBoxes[].height` must be non-negative and no greater
  than `9007199254740991`.
- Derived line-box right and bottom edges must remain safe fixed-point integers.
- `lineBoxes[].baselineY` must be inside the line box's vertical bounds, inclusive.
- Renderers must not infer kerning, ligatures, fallback, line metrics, wrapping, or shaping from the
  host platform.

Known failures for later slices:

- unsupported fixture version;
- unsupported text profile;
- unsupported position encoding;
- missing required feature;
- `semanticText.affectsPixels: true`;
- negative glyph id;
- non-integer fixed-point coordinate;
- negative advance;
- negative line-box width or height;
- line-box baseline outside vertical bounds;
- unresolved `fontId`;
- unresolved `lineBoxId`;
- duplicate run id or line-box id.
