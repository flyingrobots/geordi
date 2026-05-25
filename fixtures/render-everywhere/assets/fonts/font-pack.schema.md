# Font Pack Manifest Schema

**Profile**: `geordi-font-pack/1`
**Slice**: S019
**Planned manifest path**: `fixtures/render-everywhere/assets/fonts/font-pack.geordi.json`

The font pack manifest is the only strict text surface that maps a logical font id to fixture-local
font bytes. Renderers and validators must treat the manifest as boundary data and reject invalid
records before drawing.

Canonical manifest shape:

~~~json
{
  "fonts": [
    {
      "faceIndex": 0,
      "familyName": "Lato",
      "format": "ttf",
      "id": "lato-regular",
      "license": {
        "name": "SIL Open Font License 1.1",
        "path": "fixtures/render-everywhere/assets/fonts/lato/OFL.txt",
        "redistributionAllowed": true,
        "reservedFontNames": ["Lato"]
      },
      "path": "fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf",
      "sha256": "sha256:<64 lowercase hex chars>",
      "source": {
        "repository": "https://github.com/google/fonts",
        "path": "ofl/lato/Lato-Regular.ttf",
        "licensePath": "ofl/lato/OFL.txt"
      },
      "styleName": "Regular",
      "weight": 400
    }
  ],
  "fontPackVersion": "geordi-font-pack/1"
}
~~~

Validation rules:

- `fontPackVersion` must equal `geordi-font-pack/1`.
- `fonts` must be a non-empty array with unique `id` values.
- `id` must be lowercase kebab-case.
- `format` must be `ttf` for the first milestone; `otf`, `woff2`, variable fonts, and collections
  are unsupported until a later slice expands the contract.
- `path` and `license.path` must be repository-relative POSIX paths under
  `fixtures/render-everywhere/assets/fonts/`.
- Absolute paths, `..`, empty path segments, and URL paths are invalid.
- `sha256` must use the exact `sha256:<64 lowercase hex chars>` form.
- `faceIndex` must be a non-negative integer and is `0` for single-face static TTF files.
- `weight`, when present, must be an integer in the OpenType CSS-compatible range `1..1000`.
- `license.redistributionAllowed` must be `true`; otherwise the font cannot be used in a vendored
  render-everywhere fixture.
- No timestamp, local machine path, host font family lookup, or environment-derived value may appear
  in the manifest.

Known rejection fixtures for later slices:

- missing font file;
- hash mismatch;
- malformed `sha256`;
- unsupported `format`;
- duplicate `id`;
- disallowed license;
- absolute path;
- path traversal;
- missing license path;
- host font lookup field.
