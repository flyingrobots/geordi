# Render-Everywhere Font Assets

This directory holds fixture-local font assets for strict positioned glyph-run text proofs. These
assets are not host fonts and are not discovered through browser/native font lookup. A strict text
fixture may reference only files declared under this directory and recorded in its font manifest.

Directory contract:

~~~text
fixtures/render-everywhere/assets/fonts/
  README.md
  <font-family-slug>/
    <upstream-font-file>.ttf
    OFL.txt
    SELECTION.md
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

The first planned asset is Lato Regular from `google/fonts/ofl/lato`, pending the S018 selection
record and the S020/S021 byte/hash commits.
