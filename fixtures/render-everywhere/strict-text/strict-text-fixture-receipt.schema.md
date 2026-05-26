# Strict Text Fixture Receipt Schema

**Receipt version**: `geordi-strict-text-fixture-receipt/1`
**Slice**: S044
**Applies to**: `geordi-strict-text-fixture/1`
**Profile**: `geordi-strict-positioned-glyph-run/1`

Strict text fixture receipts record the provenance hashes needed before browser or native renderers
draw text evidence. They do not make a fixture renderable by themselves. Rendering still requires
glyph evidence packs in later slices. S052 defines the first evidence pack shape in
`outline-evidence-pack.schema.md`.

## Relationship Model

~~~mermaid
erDiagram
  STRICT_TEXT_FIXTURE ||--|| FONT_PACK : references
  STRICT_TEXT_FIXTURE ||--|{ GLYPH_RUN : contains
  STRICT_TEXT_FIXTURE ||--|{ LINE_BOX : contains
  STRICT_TEXT_FIXTURE ||--o| GLYPH_EVIDENCE_PACK : later-references
  STRICT_TEXT_FIXTURE_RECEIPT ||--|| STRICT_TEXT_FIXTURE : hashes
  STRICT_TEXT_FIXTURE_RECEIPT ||--|| FONT_PACK : hashes
  STRICT_TEXT_FIXTURE_RECEIPT ||--|{ GLYPH_RUN : hashes-canonical-array
  STRICT_TEXT_FIXTURE_RECEIPT ||--|{ LINE_BOX : hashes-canonical-array
  STRICT_TEXT_FIXTURE_RECEIPT ||--o| GLYPH_EVIDENCE_PACK : hashes-when-present
~~~

~~~mermaid
sequenceDiagram
  participant Builder as Receipt Builder
  participant Json as Canonical JSON Port
  participant Fixture as Strict Text Fixture
  participant FontPack as Font Pack
  participant Receipt as Receipt

  Builder->>Fixture: read fixture bytes
  Builder->>Json: parse and normalize fixture
  Builder->>FontPack: read fixture.fontPackPath bytes
  Builder->>Json: parse and normalize font pack
  Builder->>Json: canonicalize glyphRuns, lineBoxes, semanticText
  Builder->>Builder: hash canonical bytes with sha256
  Builder->>Receipt: emit canonical receipt JSON
~~~

## Receipt Shape

The first strict text fixture receipt shape is:

~~~json
{
  "fixtureHash": "sha256:<64 lowercase hex chars>",
  "fixturePath": "fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json",
  "fontPackHash": "sha256:<64 lowercase hex chars>",
  "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
  "generatedBy": "typescript-render-fixture/1",
  "glyphRunHash": "sha256:<64 lowercase hex chars>",
  "hashAlgorithm": "sha256",
  "lineBoxHash": "sha256:<64 lowercase hex chars>",
  "positionEncodingProfile": "geordi-fixed-26.6/1",
  "receiptVersion": "geordi-strict-text-fixture-receipt/1",
  "semanticTextAffectsPixels": false,
  "semanticTextHash": "sha256:<64 lowercase hex chars>",
  "shapingProfile": "precomputed-fixture/1",
  "textProfile": "geordi-strict-positioned-glyph-run/1"
}
~~~

When a glyph evidence pack exists, the receipt extends with:

~~~json
{
  "glyphEvidenceKind": "outlinePaths",
  "glyphEvidencePackHash": "sha256:<64 lowercase hex chars>",
  "glyphEvidencePackPath": "fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json"
}
~~~

Glyph evidence fields are omitted until the evidence pack exists. Receipts must not use placeholder
hashes for future evidence.

## Hash Inputs

All receipt hashes use SHA-256 over UTF-8 bytes and return `sha256:<64 lowercase hex chars>`.

| Field | Input | Bytes |
| --- | --- | --- |
| `fixtureHash` | Whole strict text fixture file | Exact committed fixture bytes. S043 requires these bytes to be canonical JSON plus a final newline. |
| `fontPackHash` | Referenced font-pack manifest file | Exact committed font-pack bytes. |
| `glyphRunHash` | Fixture `$.glyphRuns` value | `canonicalJsonPort.stringify(value, { space: 2 }) + "\n"`. |
| `lineBoxHash` | Fixture `$.lineBoxes` value | `canonicalJsonPort.stringify(value, { space: 2 }) + "\n"`. |
| `semanticTextHash` | Fixture `$.semanticText` value | `canonicalJsonPort.stringify(value, { space: 2 }) + "\n"`. |
| `glyphEvidencePackHash` | Future glyph evidence pack file | Exact committed evidence-pack bytes after that schema requires canonical JSON. |

`semanticTextHash` is provenance only. It does not make `semanticText.source` pixel-authoritative.

## Validation Rules

- `receiptVersion` must equal `geordi-strict-text-fixture-receipt/1`.
- `hashAlgorithm` must equal `sha256`.
- `fixturePath` must be a repository-relative POSIX path under
  `fixtures/render-everywhere/strict-text/`.
- `fixtureHash` must match the exact fixture file bytes at `fixturePath`.
- `fontPackPath` must match the fixture's `fontPackPath`.
- `fontPackHash` must match the exact font-pack manifest bytes at `fontPackPath`.
- `textProfile` must match the fixture's `textProfile`.
- `positionEncodingProfile` must match the fixture's `positionEncoding`.
- `semanticTextAffectsPixels` must equal the fixture's `semanticText.affectsPixels` and must be
  `false` for the first strict profile.
- `glyphRunHash`, `lineBoxHash`, and `semanticTextHash` must hash the canonical fragment bytes named
  above.
- `shapingProfile` must be `precomputed-fixture/1` until a Geordi-owned text-prep tool emits and
  fingerprints glyph runs.
- `generatedBy` records the boundary that emitted the receipt. It is review metadata, not a
  browser/native parity-equality field.
- `glyphEvidenceKind`, `glyphEvidencePackPath`, and `glyphEvidencePackHash` must be absent before
  glyph evidence exists. If any one is present, all three must be present and real.
- `glyphEvidenceKind`, once present, must equal `outlinePaths` for the first strict text rendering
  profile.
- `glyphEvidencePackPath`, once present, must target a committed
  `*.outline-evidence.geordi.json` file under `fixtures/render-everywhere/strict-text/`.
- `glyphEvidencePackHash`, once present, must hash the exact committed evidence pack bytes after
  canonical JSON normalization has been verified for that pack.
- No timestamp, absolute path, host font lookup, local machine path, renderer name, or platform text
  API claim may appear in the receipt.

## Known Failures For Implementation Slices

- malformed `sha256:` value;
- fixture hash mismatch;
- font pack hash mismatch;
- receipt `fontPackPath` does not match fixture `fontPackPath`;
- receipt `textProfile` does not match fixture `textProfile`;
- `semanticTextAffectsPixels` is `true`;
- glyph-run or line-box hash computed from noncanonical bytes;
- placeholder glyph evidence hash before evidence exists;
- timestamp or local path in receipt.
