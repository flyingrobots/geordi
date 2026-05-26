# Strict Positioned Glyph-Run Text Plan

**Status**: Draft execution plan
**Date**: 2026-05-25
**Parent Bearing**: [../../BEARING.md](../../BEARING.md)
**Remaining Slice PRD/Test Plan**:
[2026-05-strict-text-remaining-slices-prd-test-plan.md](./2026-05-strict-text-remaining-slices-prd-test-plan.md)
**Profile under design**: <code>geordi-strict-positioned-glyph-run/1</code>

This document locks the next Geordi credibility milestone: strict positioned glyph-run text. It is not a general text feature. It is a deterministic text evidence profile that proves browser and native renderers can consume explicit glyph evidence backed by content-addressed font assets.

The short version:

~~~text
Strict Geordi text is not strings.
Strict Geordi text is positioned glyph evidence backed by content-addressed font assets.
~~~

Strings may remain in source maps, debug metadata, and accessibility metadata. They do not determine pixels in strict mode. Pixels are determined by validated positioned glyph runs, explicit line boxes, font identity, and glyph evidence packs.

## Why This Exists

Text is the hardest common UI primitive to make portable. Platform stacks disagree about shaping, font fallback, line metrics, hinting, antialiasing, gamma, subpixel positioning, variation axes, OpenType features, script handling, bidirectional ordering, and late font loading. A browser canvas and a native Rust renderer may both render legible text while disagreeing in almost every detail that matters to a deterministic rendering contract.

Geordi therefore treats strict text as evidence, not intention. Source text is intention. Positioned glyph evidence is the render contract.

## Claim Boundary

Allowed after this milestone completes:

- One or more strict fixtures declare content-addressed font assets.
- Each strict fixture declares positioned glyph runs, line boxes, and glyph evidence packs.
- Browser and native renderers validate the same font hashes, glyph evidence hashes, line boxes, and text profile before drawing.
- Browser and native renderers render visible text from glyph evidence without platform text APIs.
- Metadata equality is exact. Visual probes are modest and explicit.
- The first strict text proof exists as a separate render-everywhere fixture artifact before it is integrated into `scene.geordi.json`.

Not allowed after this milestone unless separate future profiles prove it:

- General Unicode text rendering.
- CSS text compatibility.
- Runtime shaping as a strict render path.
- Runtime kerning, ligature substitution, glyph substitution, wrapping, or fallback.
- Host font fallback.
- Font family lookup by ambient platform name.
- Multiline wrapping.
- Bidirectional or complex-script layout.
- Variable font axes.
- Text editing, caret, selection, or accessibility tree semantics.
- Full antialiasing pixel identity across independent rasterizers.

## Profile Name And Feature Vocabulary

The first strict text profile is:

~~~text
geordi-strict-positioned-glyph-run/1
~~~

This name is intentionally specific. The strict guarantee is not "text" and not merely "glyph
runs." The guarantee is that renderers receive positioned glyph evidence with explicit font identity
and line metrics.

Initial artifact and subprofile names:

| Name | Meaning |
| --- | --- |
| `geordi-strict-text-fixture/1` | Fixture artifact envelope used before `geordi-ir/1` integration. |
| `geordi-strict-positioned-glyph-run/1` | Text profile for positioned, font-local glyph evidence. |
| `geordi-font-pack/1` | Content-addressed font asset manifest. |
| `geordi-glyph-evidence-pack/1` | Drawable glyph evidence manifest. |
| `geordi-fixed-26.6/1` | Initial fixed-point coordinate subprofile for glyph positions. |
| `precomputed-fixture/1` | Shaping provenance value when no shaper ran inside Geordi tooling. |

Initial required feature vocabulary:

| Feature | Requirement |
| --- | --- |
| `text.fontPack` | Fixture declares concrete font bytes by content hash. |
| `text.positionedGlyphRuns` | Fixture declares font-local glyph ids and positions. |
| `text.lineBoxes` | Fixture declares explicit line boxes and baselines. |
| `text.positionEncoding.fixed26Dot6` | Fixture declares 26.6 fixed-point px positions. |
| `glyphEvidence.outlinePaths` | Fixture declares outline path evidence for every referenced glyph. |
| `text.receiptProvenance` | Receipts include text-specific provenance hashes. |

Initial rejected feature vocabulary:

| Feature | Failure |
| --- | --- |
| `text.raw-runtime-shaping` | Runtime shaping is not a strict path. |
| `text.platform-font-metrics` | Host metrics are not part of the deterministic contract. |
| `text.host-font-fallback` | Host fallback is forbidden. |
| `text.dynamic-user-text` | Dynamic strings require a new prepared artifact. |
| `text.css-line-breaking` | CSS line breaking is not implemented. |
| `text.runtime-kerning` | Kerning must already be reflected in positions. |
| `text.runtime-ligatures` | Ligatures must already be reflected as glyph ids. |

## Source Text Versus Render Evidence Law

Strict text separates authoring intention from rendering evidence.

Source text is allowed in strict fixtures only as non-rendering metadata:

~~~json
{
  "semanticText": {
    "language": "en",
    "source": "GEORDI",
    "purpose": "debug-accessibility-only",
    "affectsPixels": false
  }
}
~~~

Rules:

- `semanticText.affectsPixels` must be `false` in strict fixtures.
- `semanticText.source` may support debugging, review, accessibility experiments, search indexing,
  or source maps.
- `semanticText.source` must not be read by renderers while producing pixels.
- If `semanticText.source` disagrees with glyph evidence, the renderer still follows glyph evidence.
- Tools may report the disagreement as a diagnostic, but the strict rendering path is unchanged.
- If a fixture needs source strings to determine glyphs at runtime, it is not a strict positioned
  glyph-run fixture.

The renderer consumes:

~~~text
font pack + positioned glyph runs + line boxes + glyph evidence pack
~~~

The renderer ignores for pixel purposes:

~~~text
source strings + logical font names + authoring aliases + accessibility descriptions
~~~

This law keeps future dynamic text possible without making runtime text APIs part of the strict
renderer contract. A host can accept user input, run text preparation, and emit a new deterministic
artifact. The renderer still consumes only the prepared artifact.

## Unsupported Raw And Platform Text Rejection Law

Strict text failures are capability failures, not rendering warnings. A runtime that receives any
unsupported text requirement must fail before drawing.

Rejected requirements for the first strict profile:

| Rejected requirement | Reason |
| --- | --- |
| `text.raw-runtime-shaping` | Runtime shaping makes glyph identity and positions runtime-dependent. |
| `text.platform-font-metrics` | Host metrics differ across browsers, OSes, and font stacks. |
| `text.host-font-fallback` | Host fallback silently changes font bytes and glyph ids. |
| `text.dynamic-user-text` | Dynamic strings require a new prepared artifact. |
| `text.css-line-breaking` | CSS line breaking is outside the first profile. |
| `text.runtime-kerning` | Kerning must already be reflected in positioned glyph data. |
| `text.runtime-ligatures` | Ligature substitution must already be reflected in glyph ids. |
| `text.runtime-glyph-substitution` | Substitution is shaping and is not a renderer responsibility. |

Failure behavior:

- The runtime validates `features` and `textProfile` before loading font or glyph evidence.
- The failure names the unsupported requirement.
- The failure uses a custom error type in implementation slices.
- The runtime must not partially render supported nodes from a strict text fixture after rejecting
  a required text feature.
- Best-effort fallbacks may exist only behind a separately named noncompliant demo profile.

The known-failure fixture family should include one fixture per rejected requirement so future
contributors cannot accidentally make platform text look compliant.

## Font Asset Checkpoint

S030 closes the font-asset arc. The checkpoint is deliberately narrow:

- `geordi-font-pack/1` identifies fixture-local font assets by content hash, format, face index,
  license proof, and upstream source proof.
- TypeScript and Rust both parse the manifest through typed boundary APIs and custom error types.
- TypeScript and Rust both verify vendored font and license bytes against declared `sha256:` hashes.
- Failure fixtures prove absolute paths, duplicate ids, unsupported formats, and mismatched bytes
  remain rejected.
- `font-pack.geordi.json.receipt` records the manifest bytes and hash-verification outputs for
  review.

The checkpoint does not support text rendering. It gives later glyph-run slices a trustworthy font
identity surface. Glyph IDs remain meaningless unless interpreted relative to this font pack,
specific face index, strict text profile, and glyph-run schema version.

## End-To-End Pipeline

~~~mermaid
flowchart TD
  A[Authoring source<br/>GPVue, fixtures, or future SDK] --> B[Source text metadata<br/>semantic/debug/a11y only]
  A --> C[Text preparation boundary]
  C --> D[Font pack manifest<br/>content-addressed font bytes]
  C --> E[Positioned glyph-run fixture<br/>glyph IDs, offsets, advances]
  C --> F[Line boxes<br/>baseline, ascent, descent, bounds]
  C --> G[Glyph evidence pack<br/>outline paths for first profile]
  D --> H[Canonical strict text artifact]
  E --> H
  F --> H
  G --> H
  H --> I[Canonical JSON port<br/>stable keys, finite numbers]
  I --> J[Receipt<br/>fontPackHash, glyphRunHash, lineBoxHash, evidenceHash]
  I --> K[Browser harness]
  I --> L[Native Rust harness]
  K --> M[Validate feature profile]
  L --> N[Validate feature profile]
  M --> O[Render glyph evidence to canvas]
  N --> P[Render glyph evidence to native buffer/window]
  O --> Q[Browser metadata and probes]
  P --> R[Native metadata and probes]
  Q --> S[Parity report]
  R --> S
~~~

### The Unconventional Part

Most UI systems say: here is a string and a font family; please make text. Geordi strict text says: here is a verified font asset, a verified sequence of font-local glyph ids, exact glyph positions, exact line boxes, and a verified evidence pack for drawing those glyphs. Render this, or fail before drawing.

That is less convenient but much more honest. It turns the hardest platform-dependent part into a compiler/tooling concern and leaves runtimes with a strict, checkable contract.

## Runtime Sequence

~~~mermaid
sequenceDiagram
  participant Author as Author/SDK
  participant Prep as Text Prep
  participant Core as Geordi Core
  participant Receipt as Receipt Builder
  participant Browser as Browser Runtime
  participant Native as Native Runtime
  participant Gate as Parity Gate

  Author->>Prep: source text plus font intent
  Prep->>Prep: resolve font bytes and face index
  Prep->>Prep: produce positioned glyph runs
  Prep->>Prep: produce line boxes
  Prep->>Prep: produce glyph evidence pack
  Prep->>Core: canonical strict text artifact
  Core->>Core: validate profile, hashes, finite positions
  Core->>Receipt: emit text provenance hashes
  Core->>Browser: load artifact
  Core->>Native: load artifact
  Browser->>Browser: reject unsupported text.raw-runtime-shaping
  Native->>Native: reject unsupported text.raw-runtime-shaping
  Browser->>Browser: render glyph evidence
  Native->>Native: render glyph evidence
  Browser->>Gate: metadata, probes, output hash where valid
  Native->>Gate: metadata, probes, output hash where valid
  Gate->>Gate: compare exact metadata and scoped visual probes
~~~

## Domain Model

~~~mermaid
classDiagram
  class StrictTextFixture {
    +version: geordi-strict-text-fixture/1
    +textProfile: geordi-strict-positioned-glyph-run/1
    +positionEncoding: PositionEncoding
    +features: FeatureRequirement[]
    +fontPack: FontPackManifest
    +glyphRuns: PositionedGlyphRun[]
    +lineBoxes: LineBox[]
    +glyphEvidencePack: GlyphEvidencePack
    +semanticText?: SemanticText
  }
  class FontPackManifest {
    +fontPackVersion: geordi-font-pack/1
    +fonts: FontFaceAsset[]
    +sha256: string
  }
  class FontFaceAsset {
    +id: string
    +sha256: sha256 hex
    +format: ttf | otf | woff2
    +faceIndex: integer
    +familyName: string
    +styleName: string
    +weight?: integer
    +stretch?: string
    +sourcePath: string
    +license: FontLicense
  }
  class PositionedGlyphRun {
    +runId: string
    +fontRef: string
    +fontSizePx: fixed
    +baselineX: fixed
    +baselineY: fixed
    +direction: ltr
    +glyphs: PositionedGlyph[]
  }
  class PositionedGlyph {
    +glyphId: integer
    +xOffset: fixed
    +yOffset: fixed
    +advance: fixed
    +evidenceRef: string
  }
  class LineBox {
    +lineId: string
    +x: fixed
    +y: fixed
    +width: fixed
    +height: fixed
    +baselineY: fixed
    +ascent: fixed
    +descent: fixed
  }
  class GlyphEvidencePack {
    +version: geordi-glyph-evidence-pack/1
    +fontRef: string
    +fontHash: string
    +kind: outlinePaths
    +windingRule: nonzero
    +glyphs: GlyphEvidence[]
  }
  class PositionEncoding {
    +profile: geordi-fixed-26.6/1
    +scale: 64
    +unit: px
  }
  StrictTextFixture --> PositionEncoding
  StrictTextFixture --> FontPackManifest
  StrictTextFixture --> PositionedGlyphRun
  StrictTextFixture --> LineBox
  StrictTextFixture --> GlyphEvidencePack
  FontPackManifest --> FontFaceAsset
  PositionedGlyphRun --> PositionedGlyph
  GlyphEvidencePack --> GlyphEvidence
~~~

## Entity Relationship

~~~mermaid
erDiagram
  STRICT_TEXT_FIXTURE ||--|| FONT_PACK : declares
  STRICT_TEXT_FIXTURE ||--o{ GLYPH_RUN : contains
  STRICT_TEXT_FIXTURE ||--o{ LINE_BOX : contains
  STRICT_TEXT_FIXTURE ||--|| GLYPH_EVIDENCE_PACK : declares
  FONT_PACK ||--o{ FONT_FACE : contains
  FONT_FACE ||--|| FONT_LICENSE : records
  GLYPH_RUN ||--o{ POSITIONED_GLYPH : contains
  POSITIONED_GLYPH }o--|| FONT_FACE : uses_font_local_glyph_id
  POSITIONED_GLYPH }o--|| GLYPH_EVIDENCE : references
  GLYPH_EVIDENCE_PACK ||--o{ GLYPH_EVIDENCE : contains
  LINE_BOX ||--o{ GLYPH_RUN : bounds
  STRICT_TEXT_FIXTURE ||--o| SEMANTIC_TEXT : may_include_non_rendering_text
~~~

## Failure State Machine

~~~mermaid
stateDiagram-v2
  [*] --> LoadFixture
  LoadFixture --> RejectMalformedJson: parse failure
  LoadFixture --> ValidateProfile: parse ok
  ValidateProfile --> RejectUnsupportedProfile: unsupported feature
  ValidateProfile --> ValidateFontPack: profile supported
  ValidateFontPack --> RejectFontAsset: missing/bad hash/license/path
  ValidateFontPack --> ValidateGlyphRuns: font pack ok
  ValidateGlyphRuns --> RejectGlyphRun: unsafe id/bad position/unresolved font
  ValidateGlyphRuns --> ValidateEvidence: glyph runs ok
  ValidateEvidence --> RejectEvidence: missing glyph/path/bounds/hash
  ValidateEvidence --> Render: evidence ok
  Render --> Report: draw complete
  Report --> [*]
~~~

## Coordinate And Numeric Law

The strict text profile must not hide numeric behavior behind renderer choices.

Initial law:

- Scene units are CSS-like px for fixture readability.
- Glyph positions use the first text numeric subprofile, `geordi-fixed-26.6/1`.
- `geordi-fixed-26.6/1` stores fixed-point px values with scale `64`; one stored integer step is `1 / 64px`.
- JSON fixtures may expose these values as structured integers or as review-friendly numbers only if the `positionEncoding` object still declares the profile, scale, and unit.
- Origin is top-left scene origin.
- Positive x advances right.
- Positive y moves down.
- Baseline is explicit. Renderers do not infer baseline from font APIs.
- Line boxes are explicit. Renderers do not query platform line metrics.
- Renderer rounding is not allowed to alter fixture semantics. Any raster-stage rounding must be named by the evidence/raster profile.

The fixture-level declaration is:

~~~json
{
  "positionEncoding": {
    "profile": "geordi-fixed-26.6/1",
    "scale": 64,
    "unit": "px"
  }
}
~~~

Storage rules:

- Canonical strict fixtures store fixed positions as integers unless a later review-profile format
  explicitly permits decimal display values.
- The integer value is `round(px * 64)` only inside text preparation. Renderers do not rescale source
  decimals.
- Renderers convert fixed values to px by dividing by `64` after validation.
- `-0` is rejected or normalized to `0` at the JSON boundary.
- `NaN`, infinities, unsafe integers, and values outside the declared fixed-point bounds are hard
  failures.
- A renderer must not apply hidden snapping before layout, line-box comparison, or metadata
  reporting.

Coordinate rules:

| Field | Meaning |
| --- | --- |
| `baselineX` | Fixed-point x coordinate of the run origin in scene px. |
| `baselineY` | Fixed-point y coordinate of the text baseline in scene px. |
| `xOffset` | Fixed-point glyph offset from `baselineX`. |
| `yOffset` | Fixed-point glyph offset from `baselineY`; positive values move down. |
| `advance` | Fixed-point horizontal advance already computed by text preparation. |

Renderer math for the first profile:

~~~text
glyphOriginX = baselineX + xOffset
glyphOriginY = baselineY + yOffset
nextPenX = currentPenX + advance
~~~

The renderer may use floating-point internally after decoding fixed values, but the fixture,
metadata reports, receipts, and parity checks use the fixed-point integer representation as the
source of truth.

## Line Box And Baseline Law

Line boxes are explicit evidence. They are not measured by the renderer.

Initial line box shape:

~~~json
{
  "lineId": "line-0",
  "x": 0,
  "y": 0,
  "width": 11520,
  "height": 4096,
  "baselineY": 3072,
  "ascent": 2816,
  "descent": 768
}
~~~

All numeric fields use the fixture's `positionEncoding`.

Rules:

- `baselineY` is the y coordinate used by glyph runs that belong to the line.
- `ascent` is the non-negative distance from baseline upward to the line's ascent edge.
- `descent` is the non-negative distance from baseline downward to the line's descent edge.
- `height` must be at least `ascent + descent`.
- `width` and `height` must be non-negative.
- Derived right and bottom edges must remain safe fixed-point integers.
- `baselineY` must be inside the line box's vertical bounds, inclusive.
- A glyph run references exactly one line box in the first profile.
- Line boxes are used for metadata, hit-test planning, clipping decisions, and explainability.
- Line boxes are not used to ask the platform for metrics.

The renderer may reject glyph evidence whose bounds fall outside its declared line box unless the
fixture explicitly declares overflow behavior in a future profile. For the first profile, overflow is
a known-failure case, not a best-effort clipping rule.

## Font Identity Law

Font identity is not a family name. It is a concrete content-addressed asset plus face metadata.

~~~ts
interface FontFaceAsset {
  readonly id: string;
  readonly sha256: 'sha256:<hex>';
  readonly format: 'ttf' | 'otf' | 'woff2';
  readonly faceIndex: number;
  readonly familyName: string;
  readonly styleName: string;
  readonly weight?: number;
  readonly stretch?: string;
  readonly sourcePath: string;
  readonly license: {
    readonly name: string;
    readonly path: string;
    readonly redistributionAllowed: boolean;
  };
}
~~~

A glyph id is only meaningful relative to:

~~~text
font file hash + face index + shaping profile + glyph-run schema version
~~~

## Font-Local Glyph Identity Law

Glyph ids are never global identifiers. A glyph id is a compact pointer into one concrete font face.
The same integer can mean different outlines in different fonts, different faces in the same font
collection, or different generated subsets.

Strict glyph identity is the tuple:

~~~text
fontSha256
faceIndex
fontFormat
textProfile
glyphRunSchemaVersion
shapingProfile
glyphId
~~~

Rules:

- `glyphId` must be a non-negative safe integer.
- `glyphId` must resolve through the fixture's declared `fontRef`.
- `fontRef` must resolve to exactly one `FontFaceAsset`.
- `FontFaceAsset.sha256` must match the bytes loaded from `sourcePath`.
- `faceIndex` is mandatory even when it is `0`.
- Font subsetting must produce a new font hash. A glyph id from the original font is not assumed to
  survive subsetting unless the evidence pack declares that relationship.
- Glyph evidence must carry the same `fontHash` and `fontRef` as the glyph run it satisfies.

Invalid examples:

~~~json
{ "glyphId": 43 }
~~~

The example is invalid by itself because it has no font-local context.

~~~json
{
  "fontRef": "body",
  "glyphId": 43
}
~~~

This example is still insufficient unless `body` resolves to a content-addressed font face and the
fixture declares the profile and schema versions that make the glyph id meaningful.

## Glyph Evidence Pack

A positioned glyph run says which glyph goes where. It does not by itself say how to draw the glyph. The first strict profile uses an explicit glyph evidence pack. The first evidence kind should be outline paths because it keeps text close to Geordi's explicit geometry model.

S052 formalizes the first outline evidence pack schema in
`fixtures/render-everywhere/strict-text/outline-evidence-pack.schema.md`. The schema fixes
`geordi-glyph-evidence-pack/1`, `outlinePaths`, glyph-origin fixed 26.6 coordinates, nonzero fill,
fixture-local path/hash expectations, and stable diagnostic codes for TypeScript and Rust parser
slices. It is a contract for prepared evidence only; it is not a font parser, shaper, platform text
adapter, or general text feature.

S053 commits the first two fixture-local outline packs:

- `fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json`
- `fixtures/render-everywhere/strict-text/text-0123.outline-evidence.geordi.json`

These packs cover every glyph id referenced by the canonical strict text fixtures and keep the space
glyph as explicit non-drawing evidence. They are data inputs for S054/S055 parsers; they do not make
browser or native rendering compliant by themselves.

S054 implements the TypeScript DTO/parser surface in `@flyingrobots/geordi-render-fixture`. It parses
the committed packs, preserves canonical JSON expectations, and reports stable
`GEORDI_TEXT_EVIDENCE_*` diagnostic codes for malformed pack metadata, glyph entries, bounds, paint,
and command field shape. It does not render text or resolve runtime glyph coverage.

S055 mirrors that parser surface in `geordi-ir` with Rust DTOs, parse/load helpers, validation, and
the same diagnostic code strings. Browser and native rendering remain unclaimed until later slices
consume validated evidence.

S056 hardens outline command validation in both runtimes and adds
`fixtures/render-everywhere/strict-text/failures/bad-outline-command.outline-evidence.geordi.json`
as the shared failure fixture for invalid contour state and command-specific fields.

S057 adds the browser Canvas path renderer for already-parsed strict text fixtures and outline
evidence. It converts fixed 26.6 outline commands into path geometry and explicitly avoids Canvas
text APIs. Browser fixture loading and UI mode integration remain in S058 and later slices.

S058 adds browser strict text fixture mode loading: the harness fetches a strict text fixture and an
outline evidence pack, parses both with shared validators, rejects invalid evidence before drawing,
and routes valid inputs through the S057 renderer.

S059 exposes the browser strict text proof through the demo shell. The browser harness now imports
the canonical font-pack manifest URL, validates strict text font references before drawing, computes
fixture, font-pack, glyph-run, line-box, and evidence SHA-256 values from the loaded bytes or
canonical fragments, and renders them in a collapsed `Text metadata` disclosure. The disclosure also
states `semanticTextAffectsPixels=false` and labels semantic text as non-rendering metadata so the UI
does not imply that strings, host fonts, or platform text APIs determine pixels.

S060 adds the first browser visible text smoke. The Playwright gate switches to the browser `Text`
panel, samples the strict text canvas, fails through a custom strict text smoke error if the canvas is
blank or unavailable, checks nonblank bounds are inside the canvas, and installs browser-side spies
for Canvas text APIs and `FontFace` before app startup. This remains a smoke, not the later stable
probe policy or browser/native raster parity claim.

The first outline evidence command vocabulary is intentionally small:

~~~ts
type OutlineCommand =
  | { readonly op: 'moveTo'; readonly x: Fixed26Dot6; readonly y: Fixed26Dot6 }
  | { readonly op: 'lineTo'; readonly x: Fixed26Dot6; readonly y: Fixed26Dot6 }
  | { readonly op: 'quadTo'; readonly cx: Fixed26Dot6; readonly cy: Fixed26Dot6; readonly x: Fixed26Dot6; readonly y: Fixed26Dot6 }
  | { readonly op: 'cubicTo'; readonly cx1: Fixed26Dot6; readonly cy1: Fixed26Dot6; readonly cx2: Fixed26Dot6; readonly cy2: Fixed26Dot6; readonly x: Fixed26Dot6; readonly y: Fixed26Dot6 }
  | { readonly op: 'closePath' };
~~~

The first evidence pack declares `windingRule: "nonzero"`. If a native renderer lowers curves to line segments, the flattening tolerance must be named by a future raster/evidence profile; it must not be an ambient renderer choice.

Future evidence kinds may include bitmap atlases, SDF or MSDF atlases, shared-rasterizer coverage masks, or vector outlines generated by a pinned toolchain. The text profile should not be named after the evidence kind. Evidence is replaceable. Positioned glyph runs are the stable contract.

Planned evidence feature names:

- `glyphEvidence.outlinePaths`
- `glyphEvidence.bitmapAtlas`
- `glyphEvidence.sdfAtlas`
- `glyphEvidence.sharedRasterizer`

## Receipt Fields

Strict text receipts add text-specific provenance:

S044 formalizes the first receipt schema in
`fixtures/render-everywhere/strict-text/strict-text-fixture-receipt.schema.md`. The schema fixes
receipt versioning, hash inputs, canonical fragment bytes, and the rule that glyph evidence hashes
are omitted until real evidence packs exist.

~~~json
{
  "textProfile": "geordi-strict-positioned-glyph-run/1",
  "fontPackHash": "sha256:...",
  "glyphRunHash": "sha256:...",
  "lineBoxHash": "sha256:...",
  "outlinePackHash": "sha256:...",
  "shapingProfile": "precomputed-fixture/1"
}
~~~

If no shaper ran, the receipt must say so. A null or precomputed-fixture value is more honest than pretending HarfBuzz or rustybuzz was part of the pipeline.

Receipt rules:

- `fontPackHash` is the canonical hash of the font pack manifest, not just the raw font file.
- Each `FontFaceAsset.sha256` still hashes the corresponding font bytes.
- `glyphRunHash` hashes canonical positioned glyph-run data after JSON normalization.
- `lineBoxHash` hashes canonical line-box data after JSON normalization.
- `outlinePackHash` hashes the canonical glyph evidence pack, including bounds, path commands, and
  winding rule.
- `textProfile` must match the fixture's declared `textProfile`.
- `shapingProfile` is `precomputed-fixture/1` until a Geordi-owned text-prep tool produces the
  glyph run.
- Receipts must not claim HarfBuzz, rustybuzz, FreeType, browser Canvas, CoreText, DirectWrite, or
  any other engine unless that engine actually produced the artifact and its configuration is
  fingerprinted.

Minimum receipt fragment:

~~~json
{
  "textProfile": "geordi-strict-positioned-glyph-run/1",
  "positionEncodingProfile": "geordi-fixed-26.6/1",
  "fontPackHash": "sha256:...",
  "glyphRunHash": "sha256:...",
  "lineBoxHash": "sha256:...",
  "glyphEvidencePackHash": "sha256:...",
  "glyphEvidenceKind": "outlinePaths",
  "shapingProfile": "precomputed-fixture/1"
}
~~~

The parity gate compares these fields exactly before looking at pixels.

## Text Compliance Badge Vocabulary

Demo UIs, CLI reports, receipts, and docs should expose strict text status with the same vocabulary.
The badge is explanatory evidence, not branding.

Initial badge fields:

| Field | Pass condition |
| --- | --- |
| `profile` | Fixture declares `geordi-strict-positioned-glyph-run/1`. |
| `fontHashVerified` | Every declared font asset hash matches loaded bytes. |
| `glyphRunVerified` | Positioned glyph-run hash matches canonical fixture data. |
| `lineBoxVerified` | Line-box hash matches canonical fixture data. |
| `glyphEvidenceVerified` | Evidence pack hash and glyph references are valid. |
| `runtimeShaping` | Must be `false` for strict compliance. |
| `hostFallback` | Must be `false` for strict compliance. |
| `platformMetrics` | Must be `false` for strict compliance. |
| `multiline` | Must be `false` for the first profile. |

Suggested display:

~~~text
Text compliance:
strict positioned glyph run: yes
font hash verified: yes
glyph run verified: yes
line box verified: yes
glyph evidence verified: yes
runtime shaping: no
host fallback: no
platform metrics: no
~~~

The badge must never collapse failures into a single generic "not supported" value. Each field is a
debuggable contract point and later becomes a useful parity report input.

## Text Evidence Ladder

~~~mermaid
flowchart LR
  L0[Level 0<br/>raw runtime text<br/>noncompliant] --> L1[Level 1<br/>positioned glyph runs<br/>font pack]
  L1 --> L2[Level 2<br/>explicit glyph evidence]
  L2 --> L3[Level 3<br/>fingerprinted shaping]
  L3 --> L4[Level 4<br/>deterministic line boxes]
  L4 --> L5[Level 5<br/>multiline wrap]
  L5 --> L6[Level 6<br/>bidi and complex scripts]
  L6 --> L7[Level 7<br/>explicit fallback chains]
~~~

This milestone targets Levels 1 and 2, then starts Level 3 only after browser and native can consume strict evidence.

Evidence kind law:

| Evidence kind | Status | Purpose |
| --- | --- | --- |
| `outlinePaths` | First implementation target | Resolution-independent geometry proof. |
| `bitmapAtlas` | Future | CI-friendly pixel evidence at fixed sizes. |
| `sdfAtlas` | Future | GPU-friendly scalable text rendering. |
| `sharedRasterizer` | Future | Stronger pixel parity when both runtimes share coverage generation. |

The strict positioned glyph-run profile is independent of evidence kind. A glyph run identifies
which font-local glyph goes where. The evidence pack says how this fixture proves those glyphs are
drawable.

Evidence pack invariants:

- Every positioned glyph references evidence by `fontRef + glyphId`.
- Every evidence entry declares bounds in the same `positionEncoding` profile.
- Every evidence entry contributes to `glyphEvidencePackHash`.
- Evidence entries may be subsetted to only glyphs used by the fixture.
- Missing evidence is a hard failure.
- Extra evidence is allowed only if the pack manifest says it is a reusable pack rather than a
  fixture-local minimal pack.

The first implementation should prefer fixture-local minimal packs. Reusable glyph packs come later,
after cache identity and invalidation rules exist.

## Why This Is Not CSS Text

This profile does not implement CSS text. It does not ask the browser for glyph metrics. It does not use host font fallback. It does not shape at render time. It renders positioned glyph evidence.

That distinction protects Geordi from accidentally inheriting the DOM and platform text stacks it is trying to avoid.

CSS text is intentionally outside this profile because CSS text behavior depends on a large runtime
surface:

- font-family lookup;
- font-face loading and timing;
- fallback stacks;
- browser shaping;
- browser line breaking;
- white-space processing;
- bidi processing;
- text-transform;
- font-feature settings;
- font-variation settings;
- platform antialiasing and hinting;
- browser-specific metric choices.

The strict profile replaces those runtime decisions with prepared evidence:

| CSS/browser concept | Strict positioned glyph-run replacement |
| --- | --- |
| `font-family` | `FontFaceAsset` with content hash and face index. |
| Runtime shaping | Precomputed glyph ids and positions. |
| Runtime line metrics | Explicit line boxes. |
| Fallback stack | Rejected in first profile. |
| CSS line wrapping | Rejected in first profile. |
| Glyph rasterization style | Explicit glyph evidence kind. |
| Text content determining pixels | Non-rendering `semanticText` plus render evidence. |

Future authoring layers can expose CSS-like syntax if useful, but the compiler must lower that
syntax into strict evidence before the renderer sees it.

## Fixture First, IR Later

Strict text starts as a render-everywhere fixture artifact, not as a direct `geordi-ir/1` text node. That keeps the first proof narrow and lets the evidence model mature independently:

~~~text
strict text fixture
-> typed TypeScript and Rust validation
-> browser/native proof harnesses
-> parity metadata
-> later geordi-ir/1 integration
~~~

The renderer contract is deliberately smaller than the authoring contract. Authoring tools may provide strings, font intent, language metadata, and accessibility text, but the strict renderer path accepts only positioned glyph evidence.

## Initial Fixture Scope And Nonclaims

The first strict text milestone uses two fixtures:

| Fixture | Text metadata | Purpose |
| --- | --- | --- |
| Fixture A | `GEORDI` | Simple uppercase pipeline proof with few glyph categories. |
| Fixture B | `text 0123` | Ascenders, descenders, space, lowercase, and digits. |

Fixture scope:

- one font pack;
- one face index;
- one line per fixture;
- left-to-right direction;
- no fallback chain;
- no multiline wrapping;
- no bidi;
- no complex scripts;
- no variable axes;
- no runtime shaping;
- no runtime kerning;
- no runtime ligatures;
- fill-only monochrome outline evidence for the first visible proof.

Fixture A proves the contract can render a minimal word. Fixture B catches lazy assumptions about
spaces, descenders, lowercase bounds, and digit advances.

Nonclaims:

- The milestone does not support arbitrary user strings.
- The milestone does not support CSS text.
- The milestone does not support browser/native text metric equivalence.
- The milestone does not support full-image text pixel identity unless a later shared raster profile
  proves it.
- The milestone does not imply `shape.text` is production-ready in `geordi-ir/1`.

## Runtime Responsibilities

A strict renderer consumes glyph ids, positions, line boxes, and glyph evidence. It does not perform:

- Unicode shaping;
- kerning;
- ligature substitution;
- glyph substitution;
- line breaking;
- bidi reordering;
- fallback lookup;
- platform font matching;
- host text measurement.

If any fixture asks the runtime to do those things, the runtime fails before drawing.

## Text Preparation Pipeline

The first receiver proof can use hand-authored or precomputed fixture evidence. A durable text preparation package belongs later, after browser and native runtimes can already validate and render strict evidence.

Planned package and CLI shape:

~~~text
packages/text-prep
@flyingrobots/geordi-text-prep
geordi text-prep --input text-prep.json --output fixtures/text/strict-geordi
~~~

The future `text-prep` command owns shaping, glyph-run generation, line-box generation, glyph evidence generation, and receipt provenance. It must fingerprint every input that affects output: font hash, face index, shaper name/version/config, OpenType features, script, language, direction, normalization form, variation axes, source string hash, and output glyph-run hash.

~~~mermaid
flowchart LR
  Source[Source text metadata] --> Prep[text-prep CLI]
  Font[Content-addressed font] --> Prep
  Profile[Shaping profile fingerprint] --> Prep
  Prep --> Run[Positioned glyph run]
  Prep --> Box[Line boxes]
  Prep --> Evidence[Glyph evidence pack]
  Prep --> Receipt[Text provenance receipt]
~~~

## Backlog And Design Index Alignment

This plan is the active execution source for the P0 backlog item named `Define the strict
positioned glyph-run profile`. The older strict text/font profile document remains useful historical
seed material, but it is no longer the scheduler for implementation.

The source-of-truth map is:

- `BACKLOG.md`: product-priority entry and acceptance criteria.
- `BEARING.md`: executable 100-slice checklist with per-slice state.
- `docs/design/2026-05-strict-positioned-glyph-run-plan.md`: detailed law, pipeline, and evidence
  model.
- `docs/design/2026-05-strict-positioned-glyph-run-dag.dot`: dependency source.
- `docs/design/2026-05-strict-positioned-glyph-run-dag.svg`: rendered dependency graph.
- `docs/design/README.md`: design-pack index pointing readers to the active documents.

Any future slice that changes milestone scope must update all of these surfaces in the same commit.
If they disagree, the next implementation slice is blocked until the planning state is reconciled.

## S015 Law Checkpoint

S015 closes the law arc and opens the first implementation-adjacent paths. This checkpoint does not
claim that Geordi renders strict text yet. It claims that the contract boundary is now stable enough
to start collecting font assets and designing the glyph-run schema.

The checkpoint assertions are:

- The active profile is `geordi-strict-positioned-glyph-run/1`.
- Source strings may be preserved as metadata, but they do not determine pixels in strict mode.
- The render contract consumes positioned glyph runs, explicit line boxes, font identity, and glyph
  evidence.
- Font identity is content-addressed and fixture-local; host font lookup is outside the profile.
- Glyph positions use `geordi-fixed-26.6/1` until a later profile explicitly changes the numeric
  subprofile.
- Runtime shaping, platform text APIs, fallback, CSS line breaking, wrapping, bidi, complex scripts,
  variable axes, and broad text-support claims remain unsupported.
- The next OPEN nodes are `S016` and `S031`; S016 is selected first because it is the lowest-numbered
  OPEN node.

## Font License Candidate Review

S016 chooses a font candidate before any font bytes enter the repository. The first fixture font must
be boring on purpose: static, redistributable, fixture-local, easy to hash, and suitable for simple
Latin uppercase/lowercase/digit proof strings.

Candidate requirements:

- License must permit bundling the unmodified font with the repository and demos.
- License text must be vendored beside the font bytes.
- Source must be an inspectable upstream path, not a host font lookup or CDN alias.
- First asset must be a static `.ttf`; variable fonts and collections are deferred.
- Candidate must cover the initial fixture strings `GEORDI`, `HELLO`, and `text 0123`.
- Reserved Font Name rules must be recorded; Geordi must not modify and redistribute a renamed
  derivative as if it were the original family.

| Candidate | Upstream path | License | Remote check | Decision |
| --- | --- | --- | --- | --- |
| Lato Regular | `google/fonts/ofl/lato/Lato-Regular.ttf` | SIL OFL 1.1 with Reserved Font Name `Lato` | HTTP 200, 656568 bytes | Selected candidate for S018/S020. Broader useful glyph set than `Basic`, static TTF, and normal UI proportions. |
| Poppins Regular | `google/fonts/ofl/poppins/Poppins-Regular.ttf` | SIL OFL 1.1 | HTTP 200, 160316 bytes | Acceptable fallback, but geometric shapes are less representative of dense UI body text. |
| Basic Regular | `google/fonts/ofl/basic/Basic-Regular.ttf` | SIL OFL 1.1 with Reserved Font Name `Basic` | HTTP 200, 58520 bytes | Useful tiny fallback, but too narrow as the primary fixture font. |

S016 does not land font bytes and does not create the final manifest. Those are deliberately split
into S020 and S021 so the review, directory contract, selection record, byte landing, and hash record
remain separately inspectable commits.

## Font Asset Directory Contract

S017 defines the fixture-local directory contract before the first font asset lands.

~~~text
fixtures/render-everywhere/assets/fonts/
  README.md
  <font-family-slug>/
    <upstream-font-file>.ttf
    OFL.txt
    SELECTION.md
~~~

The directory rules are intentionally stricter than a normal asset folder:

- Family directory slugs are lowercase kebab-case.
- Font bytes remain exact upstream bytes; Geordi does not silently subset or mutate the source font.
- License text sits beside the bytes it governs.
- Selection rationale sits beside the selected family in `SELECTION.md`.
- Manifests use repository-relative POSIX paths, never absolute paths.
- Identity includes font id, path, format, face index, and `sha256:<hex>`.
- Runtime and validator boundaries reject missing files, hash mismatches, unsupported formats,
  absolute paths, path traversal, and host font fallback.
- Derived glyph evidence assets live in later evidence packs so source fonts, outline evidence, and
  raster evidence remain separately hashable.

## First Font Asset Selection

S018 records Lato Regular as the first fixture font selection without landing font bytes yet.

Selection record:

~~~text
fixtures/render-everywhere/assets/fonts/lato/SELECTION.md
~~~

Decision:

- Selected asset: `Lato-Regular.ttf`.
- Source path: `google/fonts/ofl/lato/Lato-Regular.ttf`.
- License path: `google/fonts/ofl/lato/OFL.txt`.
- Format: static TrueType font.
- Face index: `0`.
- License: SIL OFL 1.1.
- Reserved Font Name: `Lato`.

The selection is intentionally separate from the asset landing so reviewers can audit why this font
was chosen before reviewing vendored bytes or hash manifests.

## Font Manifest Schema Design

S019 defines the first font manifest shape in
`fixtures/render-everywhere/assets/fonts/font-pack.schema.md`. The planned concrete manifest path is:

~~~text
fixtures/render-everywhere/assets/fonts/font-pack.geordi.json
~~~

Schema commitments:

- `fontPackVersion` is `geordi-font-pack/1`.
- `fonts` is a non-empty array of unique logical font ids.
- Each font id is lowercase kebab-case.
- First milestone format support is static `ttf` only.
- Paths are repository-relative POSIX paths under `fixtures/render-everywhere/assets/fonts/`.
- Hashes use `sha256:<64 lowercase hex chars>`.
- License data is explicit and includes `redistributionAllowed`, reserved font names, and a license
  text hash.
- No timestamp, local machine path, host font lookup, or environment-derived value is allowed.

This is still schema design, not parser implementation. TypeScript and Rust boundary types/parsers
begin at S022-S025.

## Font Fixture Asset Landing

S020 lands the first font bytes and colocated license text:

~~~text
fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf
fixtures/render-everywhere/assets/fonts/lato/OFL.txt
~~~

Verification recorded during landing:

| File | Check |
| --- | --- |
| `Lato-Regular.ttf` | TrueType font data, 656568 bytes |
| `OFL.txt` | ASCII license text, whitespace-normalized, 4406 bytes |

The S020 commit intentionally does not introduce the final font manifest. S021 records the hash
manifest after the bytes are present in the repository.

## Font Hash Manifest Record

S021 records the concrete `geordi-font-pack/1` manifest at:

~~~text
fixtures/render-everywhere/assets/fonts/font-pack.geordi.json
~~~

The first manifest binds logical font id `lato-regular` to:

| Field | Value |
| --- | --- |
| Font file | `fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf` |
| Font hash | `sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251` |
| License file | `fixtures/render-everywhere/assets/fonts/lato/OFL.txt` |
| License hash | `sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423` |
| Source repository | `https://github.com/google/fonts` |
| Source commit | `c5b52261e8fde2d3b2592fa9d26ac525939c5e4c` |
| Source path | `ofl/lato/Lato-Regular.ttf` |
| Source font hash | `sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251` |
| Source license path | `ofl/lato/OFL.txt` |
| Source license hash | `sha256:74ba064d03f1f1c4a952da936c3eb71866c34404916734de3cae73b34357e59e` |
| License normalization | `trim-trailing-ascii-whitespace/1` |

This manifest is data only. Parser, hash-verifier, and failure-fixture implementation starts in the
later TypeScript/Rust font-manifest slices.

## S050 Glyph-Run Checkpoint

S050 closes the glyph-run validation arc and opens the rendering-evidence arc. This checkpoint does
not claim that Geordi renders strict text yet. It claims that the strict text fixture boundary is
validated enough to decide how glyph evidence will be represented and rendered.

Checkpoint claims:

- `geordi-strict-text-fixture/1` is represented by committed canonical fixture data for `GEORDI`
  and `text 0123`.
- TypeScript and Rust parse strict text fixture manifests through typed boundaries and custom error
  types.
- TypeScript and Rust validate profile names, required feature vocabulary, fixed 26.6 coordinate
  integers, font-local glyph ids, glyph advances, glyph offsets, line boxes, semantic-text
  nonauthority, duplicate ids, missing references, unsafe integers, negative values, and unresolved
  font ids.
- Strict text fixtures resolve font ids through the checked-in `geordi-font-pack/1` manifest and
  the Lato Regular content-addressed font asset.
- Canonical JSON normalization is pinned for committed strict text fixtures.
- `geordi-strict-text-fixture-receipt/1` records fixture, font-pack, glyph-run, line-box,
  semantic-text, text-profile, position-encoding, shaping-profile, and future glyph-evidence hash
  inputs.
- TypeScript and Rust build matching canonical receipts for both valid strict text fixtures.
- The committed unsupported runtime-shaping fixture remains rejected by TypeScript, Rust, browser
  harness preflight, and native harness preflight before drawing.

Checkpoint nonclaims:

- No glyph evidence pack schema exists yet.
- No outline path command vocabulary has been implemented.
- No browser or native runtime renders strict text pixels.
- No text pixel probes, metadata parity report, or nonblank text bounds check exists yet.
- Strict text has not graduated into `geordi-ir/1`.
- Runtime shaping, platform text APIs, host font fallback, wrapping, bidi, complex scripts, variable
  font axes, and broad text support remain unsupported.

The next OPEN node after this checkpoint is `S051`, rendering evidence strategy decision. That slice
must choose the evidence path before `S052` can formalize the outline evidence pack schema.

## S051 Rendering Evidence Strategy Decision

Decision: the first strict text renderer proof uses fixture-local `outlinePaths` glyph evidence,
not runtime font parsing, not platform text APIs, not a shared rasterizer, and not WASM.

The first visible proof therefore has this data flow:

~~~text
strict text fixture
  -> font pack identity check
  -> positioned glyph-run validation
  -> fixture-local glyph evidence pack validation
  -> browser/native outline path drawing
  -> metadata parity and scoped visual probes
~~~

Chosen strategy:

- Evidence kind: `outlinePaths`.
- Evidence pack scope: fixture-local minimal pack. It contains only glyph evidence needed by the
  fixture unless a later reusable-pack profile explicitly changes cache semantics.
- Evidence coordinates: fixed 26.6 px coordinates in glyph-origin local space, already scaled and
  y-oriented for Geordi scene coordinates by text preparation. Renderers translate by validated
  glyph position; they do not apply font-unit scaling, y-axis inversion, kerning, shaping, fallback,
  or platform metrics.
- Evidence identity: every glyph evidence entry is keyed by `fontId`, font hash, face index,
  text profile, shaping profile, glyph id, and evidence kind.
- Paint scope: first proof is fill-only monochrome. Stroke, gradients, effects, multiple fills,
  text decorations, and CSS-like text paint are known failures until separately named.
- Winding: first proof uses nonzero fill rule.
- Curves: the schema may name `moveTo`, `lineTo`, `quadTo`, `cubicTo`, and `closePath`, but each
  command must be explicit fixture data. Native curve flattening, if needed, must use a named
  tolerance in metadata before it can affect parity claims.
- Browser renderer: consume evidence as Canvas 2D path geometry. The strict path must not call
  `fillText`, `strokeText`, `measureText`, `FontFace`, DOM text layout, CSS font matching, or host
  font fallback.
- Native renderer: consume the same evidence commands through the Rust harness. The strict path must
  not call OS text APIs, font lookup APIs, runtime shapers, or platform line-metric APIs.
- Parity target: exact metadata first; scoped visual probes second. The first outline proof may
  claim visible, nonblank, bounded text from shared evidence, not full antialiasing pixel identity.

Rejected strategies for this milestone:

| Strategy | Rejection reason |
| --- | --- |
| Browser Canvas text (`fillText`, `measureText`) | Reintroduces browser shaping, metrics, fallback, and font loading. |
| Native OS text APIs | Reintroduces platform shaping and rasterization differences. |
| Runtime OpenType parsing in each renderer | Duplicates hard font logic before the evidence contract is stable. |
| Rust/WASM font kernel as a required browser dependency | Loader/package friction is not justified before outline evidence proves the contract. |
| Bitmap or SDF atlas first | More pixel- and cache-policy surface than needed for the first visible proof. |
| Shared rasterizer first | Prematurely optimizes pixel identity before metadata/evidence identity is proven. |

Consequences for the next slices:

- `S052` must define `geordi-glyph-evidence-pack/1` as an outline path evidence schema.
- `S053` must add fixture-local outline evidence for the existing canonical strict text fixtures.
- `S054` and `S055` must parse the same outline evidence shape in TypeScript and Rust.
- Browser and native rendering slices must reject missing evidence before drawing.
- Receipts must keep `glyphEvidencePackHash` optional until a real pack exists, then make it present
  for renderable strict text fixtures.

## Active DAG

The active dependency graph is rendered from [2026-05-strict-positioned-glyph-run-dag.dot](./2026-05-strict-positioned-glyph-run-dag.dot) to [2026-05-strict-positioned-glyph-run-dag.svg](./2026-05-strict-positioned-glyph-run-dag.svg).

Use the DAG to choose the next slice. A node is OPEN when all parents are complete. After each slice, update the checklist state, update the node status in the DOT file, regenerate the SVG, and commit both the slice work and planning-state updates.

## DAG Execution Protocol

Every slice execution follows the same planning-state protocol:

1. Read `BEARING.md` and the DAG DOT file.
2. Identify all nodes whose `Blocked By` entries are complete.
3. Select the lowest-numbered OPEN node unless the user explicitly reprioritizes.
4. Complete only that slice's acceptance criteria.
5. Run the relevant gates for that slice.
6. Update the checklist entry from `- [ ]` to `- [x]`.
7. Update the completed node in DOT to dashed gray.
8. Update newly unblocked nodes in DOT to thick green.
9. Regenerate the SVG with Graphviz.
10. Commit the slice and planning-state updates together.

State styling is normative:

| State | DOT style |
| --- | --- |
| OPEN | `color="#16a34a", penwidth=4` |
| BLOCKED | `color="#dc2626", penwidth=4` |
| COMPLETE | `color="#94a3b8", penwidth=3, style="rounded,filled,dashed", fontcolor="#64748b"` |

The graph is not a decorative image. It is the scheduler. If `BEARING.md`, the DOT source, and the
SVG disagree, the next slice is blocked until planning state is repaired.
