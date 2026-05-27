# Generated Strict Text Output Schema

**Output version**: `geordi-text-prep-generated-output/1`
**Text-prep boundary**: `geordi-text-prep-boundary/1`
**Fingerprint profile**: `geordi-text-prep-shaping-fingerprint/1`
**Target fixture version**: `geordi-strict-text-fixture/1`
**Slice**: S080

This schema defines the bundle manifest emitted by a future text-prep command after shaping and
artifact generation. It is not a renderer input by itself. Browser and native renderers still load
the prepared strict text fixture, font pack, glyph evidence pack, and receipt after validation.

The manifest exists so reviewers and comparison tools can audit one generated output as a unit:
source hash, font identity, shaping fingerprint, generated glyph runs, line boxes, evidence
references, fixture hash, and receipt hash.

## Relationship Model

~~~mermaid
erDiagram
  GENERATED_TEXT_OUTPUT ||--|| SOURCE_IDENTITY : hashes
  GENERATED_TEXT_OUTPUT ||--|| FONT_PACK : references
  GENERATED_TEXT_OUTPUT ||--|| SHAPING_FINGERPRINT : hashes
  GENERATED_TEXT_OUTPUT ||--|| STRICT_TEXT_FIXTURE : emits
  GENERATED_TEXT_OUTPUT ||--|| GLYPH_EVIDENCE_PACK : references
  GENERATED_TEXT_OUTPUT ||--|| STRICT_TEXT_RECEIPT : hashes
  STRICT_TEXT_FIXTURE ||--|{ GLYPH_RUN : contains
  STRICT_TEXT_FIXTURE ||--|{ LINE_BOX : contains
~~~

## Output Shape

~~~json
{
  "outputVersion": "geordi-text-prep-generated-output/1",
  "id": "render-everywhere:strict-text:generated-geordi",
  "textPrepBoundary": "geordi-text-prep-boundary/1",
  "textProfile": "geordi-strict-positioned-glyph-run/1",
  "positionEncoding": "geordi-fixed-26.6/1",
  "source": {
    "sourceTextHash": "sha256:<64 lowercase hex chars>",
    "sourceEncoding": "utf-8/1",
    "normalizationProfile": "unicode-nfc/<version>",
    "semanticLanguage": "en"
  },
  "font": {
    "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
    "fontPackHash": "sha256:<64 lowercase hex chars>",
    "fontId": "lato-regular",
    "fontFileHash": "sha256:<64 lowercase hex chars>",
    "faceIndex": 0,
    "fontFormat": "ttf"
  },
  "shaping": {
    "shapingProfile": "geordi-text-prep-shaping-fingerprint/1",
    "shapingFingerprintPath": "fixtures/render-everywhere/strict-text/generated/geordi.shaping-fingerprint.geordi.json",
    "shapingFingerprintHash": "sha256:<64 lowercase hex chars>",
    "fallbackPolicy": "no-fallback/1"
  },
  "artifacts": {
    "strictTextFixturePath": "fixtures/render-everywhere/strict-text/generated/geordi.strict-text.geordi.json",
    "strictTextFixtureHash": "sha256:<64 lowercase hex chars>",
    "glyphEvidencePackPath": "fixtures/render-everywhere/strict-text/generated/geordi.outline-evidence.geordi.json",
    "glyphEvidencePackHash": "sha256:<64 lowercase hex chars>",
    "glyphEvidenceKind": "outlinePaths",
    "receiptPath": "fixtures/render-everywhere/strict-text/generated/geordi.strict-text.geordi.json.receipt",
    "receiptHash": "sha256:<64 lowercase hex chars>"
  },
  "hashes": {
    "glyphRunHash": "sha256:<64 lowercase hex chars>",
    "lineBoxHash": "sha256:<64 lowercase hex chars>",
    "fixtureHash": "sha256:<64 lowercase hex chars>"
  }
}
~~~

## Field Laws

- `outputVersion` must equal `geordi-text-prep-generated-output/1`.
- `textPrepBoundary` must equal `geordi-text-prep-boundary/1`.
- `textProfile` must equal `geordi-strict-positioned-glyph-run/1` for the first generated output
  schema.
- `positionEncoding` must equal `geordi-fixed-26.6/1`.
- `source.sourceTextHash` hashes the normalized source text bytes used by text prep. The manifest
  must not contain a pixel-authoritative source string.
- `source.normalizationProfile` must match the normalization profile declared by the shaping
  fingerprint.
- `font.fontPackPath`, `font.fontPackHash`, `font.fontId`, `font.fontFileHash`, `font.faceIndex`,
  and `font.fontFormat` must match the generated fixture and shaping fingerprint.
- `shaping.shapingProfile` must equal `geordi-text-prep-shaping-fingerprint/1`.
- `shaping.shapingFingerprintHash` must hash the exact canonical fingerprint bytes.
- `shaping.fallbackPolicy` must equal `no-fallback/1` for the first generated output schema.
- Artifact paths must be repository-relative POSIX paths and must not escape the repository.
- Artifact paths must not point at `spike`, `noncompliant`, or
  `geordi-text-shaping-spike-noncompliant/1` output.
- `artifacts.strictTextFixturePath` must target a generated `geordi-strict-text-fixture/1` file.
- `artifacts.glyphEvidencePackPath` must target a generated or referenced glyph evidence pack whose
  `glyphEvidenceKind` is declared in this manifest.
- `artifacts.receiptPath` must target a generated strict text fixture receipt.
- `hashes.glyphRunHash` must match the generated fixture's canonical `glyphRuns` hash.
- `hashes.lineBoxHash` must match the generated fixture's canonical `lineBoxes` hash.
- `hashes.fixtureHash` must equal `artifacts.strictTextFixtureHash`.
- The receipt must repeat the output's text profile, position encoding, font hash, glyph-run hash,
  line-box hash, glyph evidence hash, shaping profile, and shaping fingerprint hash.
- No renderer name, `rendered=true`, `smoke=passed`, host font family, fallback-chain field,
  platform metric, local absolute path, or wall-clock timestamp may appear in generated output
  manifests.

## Validation Diagnostics

Future validators should report stable diagnostic identities:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_GENERATED_OUTPUT_BAD_PROFILE` | `outputVersion`, `textPrepBoundary`, `textProfile`, or `positionEncoding` is unsupported. |
| `GEORDI_TEXT_GENERATED_OUTPUT_MISSING_ARTIFACT` | A required generated fixture, evidence pack, fingerprint, or receipt path is absent. |
| `GEORDI_TEXT_GENERATED_OUTPUT_HASH_MISMATCH` | A declared hash does not match the referenced artifact bytes or canonical fragment bytes. |
| `GEORDI_TEXT_GENERATED_OUTPUT_BAD_FONT_IDENTITY` | Font pack, font file, font id, face index, or format differs across output, fixture, receipt, and fingerprint. |
| `GEORDI_TEXT_GENERATED_OUTPUT_BAD_SOURCE_AUTHORITY` | Source text is present as pixel-authoritative runtime data instead of hash/provenance metadata. |
| `GEORDI_TEXT_GENERATED_OUTPUT_SPIKE_ARTIFACT` | A noncompliant shaping spike artifact is referenced as generated strict output. |
| `GEORDI_TEXT_GENERATED_OUTPUT_UNSTABLE_INPUT` | The manifest contains a timestamp, absolute path, host font lookup, ambient locale, or other unpinned input. |

## Nonclaims

This schema does not implement text prep, shaping, evidence generation, receipt generation, or
comparison. It defines the output bundle S081-S083 must produce and compare before generated strict
text can be treated as reproducible.
