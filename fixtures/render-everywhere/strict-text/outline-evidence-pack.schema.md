# Strict Text Outline Evidence Pack Schema

**Evidence pack version**: `geordi-glyph-evidence-pack/1`
**Evidence kind**: `outlinePaths`
**Text profile**: `geordi-strict-positioned-glyph-run/1`
**Position encoding**: `geordi-fixed-26.6/1`
**Slice**: S052

An outline evidence pack is the first drawable glyph evidence artifact for the strict positioned
glyph-run profile. It does not shape text, select fonts, measure strings, or interpret semantic
source text. It only supplies fixture-local vector commands for font-local glyph ids that are
already positioned by a strict text fixture.

## Relationship Model

~~~mermaid
erDiagram
  STRICT_TEXT_FIXTURE ||--|| FONT_PACK : references
  FONT_PACK ||--|{ FONT_FACE_ASSET : declares
  STRICT_TEXT_FIXTURE ||--|{ GLYPH_RUN : contains
  GLYPH_RUN ||--|{ POSITIONED_GLYPH : positions
  STRICT_TEXT_FIXTURE ||--o| OUTLINE_EVIDENCE_PACK : references-when-renderable
  OUTLINE_EVIDENCE_PACK ||--|| FONT_FACE_ASSET : fingerprints
  OUTLINE_EVIDENCE_PACK ||--|{ OUTLINE_GLYPH_EVIDENCE : contains
  POSITIONED_GLYPH }o--|| OUTLINE_GLYPH_EVIDENCE : requires-fontId-glyphId
~~~

~~~mermaid
sequenceDiagram
  participant Renderer as Strict Renderer
  participant Fixture as Strict Text Fixture
  participant FontPack as Font Pack
  participant Evidence as Outline Evidence Pack
  participant Path as Geometry Path Builder

  Renderer->>Fixture: parse fixture
  Renderer->>FontPack: verify fixture.fontPackPath and font hashes
  Renderer->>Evidence: parse fixture.glyphEvidencePackPath
  Renderer->>Evidence: verify pack version, profile, font identity, and hash
  loop each positioned glyph
    Renderer->>Evidence: resolve fontId + glyphId
    Evidence-->>Renderer: bounds and commands
    Renderer->>Path: translate commands by glyph x/y + offsets
  end
  Renderer->>Renderer: fill nonzero outline geometry
~~~

## Pack Shape

The first outline evidence pack shape is:

~~~json
{
  "coordinateSpace": "glyph-origin-fixed-26.6/1",
  "evidenceKind": "outlinePaths",
  "evidencePackVersion": "geordi-glyph-evidence-pack/1",
  "faceIndex": 0,
  "fontId": "lato-regular",
  "fontSha256": "sha256:<64 lowercase hex chars>",
  "glyphs": [
    {
      "bounds": {
        "height": 2304,
        "width": 1536,
        "x": 0,
        "y": -2304
      },
      "commands": [
        {
          "op": "moveTo",
          "x": 0,
          "y": -2304
        },
        {
          "op": "lineTo",
          "x": 1536,
          "y": -2304
        },
        {
          "op": "lineTo",
          "x": 1536,
          "y": 0
        },
        {
          "op": "lineTo",
          "x": 0,
          "y": 0
        },
        {
          "op": "closePath"
        }
      ],
      "draws": true,
      "glyphId": 43
    }
  ],
  "id": "render-everywhere:strict-text:geordi:outline-evidence",
  "paint": {
    "kind": "solidFill",
    "rgba": [
      17,
      24,
      39,
      255
    ]
  },
  "positionEncoding": "geordi-fixed-26.6/1",
  "shapingProfile": "precomputed-fixture/1",
  "textProfile": "geordi-strict-positioned-glyph-run/1",
  "windingRule": "nonzero"
}
~~~

## Field Laws

- `evidencePackVersion` must equal `geordi-glyph-evidence-pack/1`.
- `evidenceKind` must equal `outlinePaths`.
- `textProfile` must equal `geordi-strict-positioned-glyph-run/1`.
- `positionEncoding` must equal `geordi-fixed-26.6/1`.
- `coordinateSpace` must equal `glyph-origin-fixed-26.6/1`.
- `shapingProfile` must equal `precomputed-fixture/1` until a Geordi-owned text preparation tool
  emits and fingerprints glyph runs.
- `id` must be a non-empty stable artifact id.
- `fontId` must resolve to one font face declared by the strict text fixture's font pack.
- `fontSha256` must equal the resolved font face asset's `sha256` value.
- `faceIndex` must equal the resolved font face asset's `faceIndex`.
- `windingRule` must equal `nonzero` in the first outline profile.
- `paint.kind` must equal `solidFill` in the first outline profile.
- `paint.rgba` must contain exactly four integer channel values in the inclusive range `0` through
  `255`.
- `glyphs` must be a non-empty array for renderable fixtures.
- `glyphs[].glyphId` must be a non-negative safe integer and must be unique within a pack.
- `glyphs[].draws` must be boolean.
- `glyphs[].bounds.x`, `glyphs[].bounds.y`, `glyphs[].bounds.width`, and
  `glyphs[].bounds.height` are signed fixed-point integers in `geordi-fixed-26.6/1` units.
- `glyphs[].bounds.width` and `glyphs[].bounds.height` must be non-negative.
- Derived bounds right and bottom edges must remain safe fixed-point integers.
- Visible glyph evidence uses `draws: true` and must contain at least one closed contour.
- Non-drawing glyph evidence, such as a space glyph, uses `draws: false`, `commands: []`, and a zero
  area bounds object.
- Committed evidence JSON files must match `canonicalJsonPort.stringify(parsed, { space: 2 })` plus
  a final newline.

## Coordinate Contract

Outline command coordinates are glyph-origin local coordinates in fixed 26.6 pixel units. They are
already scaled and oriented for Geordi scene coordinates, so renderers translate commands by the
validated positioned glyph origin and offset only. Renderers must not apply runtime font-unit
scaling, y-axis flipping, kerning, shaping, line metrics, fallback, or host font lookup while
rendering this evidence kind.

## Command Vocabulary

| Command | Required fields | Rules |
| --- | --- | --- |
| `moveTo` | `x`, `y` | Starts a contour. Must not appear twice in a row without a closing command. |
| `lineTo` | `x`, `y` | Adds a straight segment to the current contour. Requires an open contour. |
| `quadTo` | `cx`, `cy`, `x`, `y` | Adds a quadratic curve. Requires an open contour. |
| `cubicTo` | `cx1`, `cy1`, `cx2`, `cy2`, `x`, `y` | Adds a cubic curve. Requires an open contour. |
| `closePath` | none | Closes the current contour. Requires an open contour and must be followed by `moveTo` or end of commands. |

All command coordinates must be finite safe integers in `geordi-fixed-26.6/1` units. Unknown
commands, missing command fields, extra command-specific coordinate names, and coordinates outside
the shared safe integer range are hard validation failures.

S056 hardens command validation in both TypeScript and Rust:

- each command may contain only the fields allowed by its `op`;
- drawing glyph commands must start each contour with `moveTo`;
- `lineTo`, `quadTo`, and `cubicTo` require an open contour;
- `moveTo` must be the first command or must follow `closePath`;
- `closePath` requires an open contour with at least one segment;
- every opened contour must close before the command array ends.

## Fixture Linkage

S052 defines the evidence pack shape. Later implementation slices attach it to fixtures and
receipts:

- A renderable strict text fixture declares `glyphEvidencePackPath` as a repository-relative POSIX
  path under `fixtures/render-everywhere/strict-text/`.
- The path targets a committed `*.outline-evidence.geordi.json` file.
- Renderers that claim strict text rendering must reject a strict text fixture before drawing if it
  has no evidence pack path.
- Receipts must include `glyphEvidenceKind`, `glyphEvidencePackPath`, and
  `glyphEvidencePackHash` together after the evidence pack exists.
- `glyphEvidencePackHash` hashes the exact committed evidence pack bytes.
- S070 adds a coverage validator: after structural evidence validation succeeds, every positioned
  glyph referenced by the strict text fixture must have a matching evidence glyph entry before any
  browser or native renderer draws.

## Diagnostic Vocabulary

Implementation slices must use stable diagnostic identities for outline evidence validation. S054
implements the TypeScript parser with these codes, and S055 mirrors the parser in Rust. Error
message prose may differ between TypeScript and Rust, but diagnostic codes must stay stable.

| Code | Trigger |
| --- | --- |
| `GEORDI_TEXT_EVIDENCE_BAD_PACK` | The pack root or required non-profile metadata is malformed. |
| `GEORDI_TEXT_EVIDENCE_UNSUPPORTED_VERSION` | `evidencePackVersion` is missing or unsupported. |
| `GEORDI_TEXT_EVIDENCE_UNSUPPORTED_KIND` | `evidenceKind` is missing or not `outlinePaths`. |
| `GEORDI_TEXT_EVIDENCE_UNSUPPORTED_PROFILE` | Text profile, position encoding, coordinate space, or shaping profile is unsupported. |
| `GEORDI_TEXT_EVIDENCE_BAD_FONT_ID` | Pack font id does not resolve through the fixture font pack. |
| `GEORDI_TEXT_EVIDENCE_BAD_FONT_HASH` | Pack font hash does not match the resolved font face asset. |
| `GEORDI_TEXT_EVIDENCE_BAD_FACE_INDEX` | Pack face index does not match the resolved font face asset. |
| `GEORDI_TEXT_EVIDENCE_DUPLICATE_GLYPH` | A glyph id appears more than once in the pack. |
| `GEORDI_TEXT_EVIDENCE_BAD_GLYPH` | A glyph entry is malformed before command or bounds validation. |
| `GEORDI_TEXT_EVIDENCE_MISSING_GLYPH` | A positioned glyph has no matching `fontId + glyphId` evidence entry. |
| `GEORDI_TEXT_EVIDENCE_BAD_BOUNDS` | Bounds are malformed, unsafe, non-integer, or have negative dimensions. |
| `GEORDI_TEXT_EVIDENCE_BAD_COMMAND` | A command is malformed, unknown, unsafe, or invalid for the current contour state. |
| `GEORDI_TEXT_EVIDENCE_UNSUPPORTED_PAINT` | Paint is not first-profile `solidFill` RGBA. |
| `GEORDI_TEXT_EVIDENCE_UNSUPPORTED_WINDING_RULE` | Winding rule is not first-profile `nonzero`. |
| `GEORDI_TEXT_EVIDENCE_HASH_MISMATCH` | A declared receipt or fixture hash does not match committed evidence bytes. |

## Nonclaims

The outline evidence schema does not claim general text support, CSS text compatibility, runtime
shaping, font fallback, glyph extraction, font parsing, platform text rendering, anti-alias parity,
or pixel-identical rasterization. It is only the contract for fixture-local vector evidence that
later browser and native renderer slices can consume independently.
