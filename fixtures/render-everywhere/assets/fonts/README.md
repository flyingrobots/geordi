# Render-Everywhere Font Assets

This directory holds fixture-local font assets for strict positioned glyph-run text proofs. These
assets are not host fonts and are not discovered through browser/native font lookup. A strict text
fixture may reference only files declared under this directory and recorded in its font manifest.

Directory contract:

~~~text
fixtures/render-everywhere/assets/fonts/
  README.md
  failures/
    *.font-pack.geordi.json
  <font-family-slug>/
    <upstream-font-file>.ttf
    OFL.txt
    SELECTION.md
  font-pack.geordi.json
  font-pack.geordi.json.receipt
~~~

Rules:

- Family directories use lowercase kebab-case slugs.
- Font bytes are stored exactly as downloaded from the recorded upstream source.
- License text is stored beside the font bytes.
- Selection rationale lives beside the selected font in `SELECTION.md`.
- Font manifests use repository-relative POSIX paths.
- Font identity is the tuple of font id, file path, format, face index, and `sha256:<hex>` hash.
- Renderers must reject missing files, mismatched hashes, unsupported formats, absolute paths, path
  traversal, and any attempt to use host font fallback.
- Derived subsets, glyph outlines, atlases, or SDF assets belong in later glyph evidence packs, not
  as silent mutations of the vendored source font.

The first landed asset is Lato Regular from `google/fonts/ofl/lato`. Its selection record,
vendored font bytes, vendored OFL text, and hash manifest are committed at:

~~~text
fixtures/render-everywhere/assets/fonts/lato/SELECTION.md
fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf
fixtures/render-everywhere/assets/fonts/lato/OFL.txt
fixtures/render-everywhere/assets/fonts/font-pack.geordi.json
fixtures/render-everywhere/assets/fonts/font-pack.geordi.json.receipt
~~~

Receipt contract:

- `font-pack.geordi.json.receipt` records the checked-in manifest hash and every verified font or
  license asset hash used by the strict text milestone.
- The receipt is provenance for fixture review and CI; it does not make a renderer compliant by
  itself.
- The `failures/` directory contains intentionally invalid font packs for parser and verifier
  regression tests.
