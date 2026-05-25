# Font Pack Manifest Schema

**Profile**: `geordi-font-pack/1`
**Slice**: S019
**Planned manifest path**: `fixtures/render-everywhere/assets/fonts/font-pack.geordi.json`
**Receipt path**: `fixtures/render-everywhere/assets/fonts/font-pack.geordi.json.receipt`

The font pack manifest is the only strict text surface that maps a logical font id to fixture-local
font bytes. Renderers and validators must treat the manifest as boundary data and reject invalid
records before drawing.

Canonical manifest shape:

~~~json
{
  "fontPackVersion": "geordi-font-pack/1",
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
        "reservedFontNames": [
          "Lato"
        ],
        "sha256": "sha256:<64 lowercase hex chars>"
      },
      "path": "fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf",
      "sha256": "sha256:<64 lowercase hex chars>",
      "source": {
        "commit": "<40 lowercase hex chars>",
        "fontSha256": "sha256:<64 lowercase hex chars>",
        "licenseNormalization": "trim-trailing-ascii-whitespace/1",
        "licensePath": "ofl/lato/OFL.txt",
        "licenseSha256": "sha256:<64 lowercase hex chars>",
        "path": "ofl/lato/Lato-Regular.ttf",
        "repository": "https://github.com/google/fonts"
      },
      "styleName": "Regular",
      "weight": 400
    }
  ]
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
- `license.sha256` must hash the vendored license text that ships beside the font bytes.
- `source.commit` must pin the exact upstream commit used for source verification.
- `source.fontSha256` must hash the upstream font bytes at `source.commit` and must match `sha256`
  when the vendored font bytes are exact upstream bytes.
- `source.licenseSha256` must hash the upstream license bytes at `source.commit`.
- `source.licenseNormalization`, when present, must name the deterministic normalization applied to
  the vendored license text.
- `faceIndex` must be a non-negative integer and is `0` for single-face static TTF files.
- `weight`, when present, must be an integer in the OpenType CSS-compatible range `1..1000`.
- `license.redistributionAllowed` must be `true`; otherwise the font cannot be used in a vendored
  render-everywhere fixture.
- No timestamp, local machine path, host font family lookup, or environment-derived value may appear
  in the manifest.

Known rejection fixtures for later slices:

- `failures/bad-hash.font-pack.geordi.json`: hash mismatch;
- malformed `sha256`;
- `failures/unsupported-format.font-pack.geordi.json`: unsupported `format`;
- `failures/duplicate-id.font-pack.geordi.json`: duplicate `id`;
- disallowed license;
- `failures/absolute-path.font-pack.geordi.json`: absolute path;
- path traversal;
- missing font file;
- missing license path;
- host font lookup field.

Receipt shape:

~~~json
{
  "artifact": {
    "hash": "sha256:<64 lowercase hex chars>",
    "path": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json"
  },
  "fontPackVersion": "geordi-font-pack/1",
  "generatedBy": "manual-font-asset-boundary/1",
  "hashAlgorithm": "sha256",
  "profile": "geordi-strict-positioned-glyph-run/1",
  "verifications": [
    {
      "fontId": "lato-regular",
      "kind": "font",
      "path": "fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf",
      "sha256": "sha256:<64 lowercase hex chars>"
    }
  ]
}
~~~

The receipt records the manifest bytes and verifier outputs. It does not replace parser or hash
verification; it gives reviewers and CI a deterministic provenance artifact to compare.
