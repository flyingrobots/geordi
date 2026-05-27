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

S061 adds the first native strict text outline renderer. The Rust renderer validates the strict text
fixture and outline evidence pack, lowers fixed 26.6 outline commands into deterministic software
path segments, fills them into the existing RGBA8 image buffer using the evidence `solidFill` paint
and nonzero winding, and returns renderer metadata for fixture id, evidence id/kind, text profile,
glyph counts, and consumed command count. This is a native API proof; CLI mode, expanded metadata
reporting, stable native probes, and browser/native equality gates remain later slices.

S062 adds native strict text fixture CLI mode. `native-render-everywhere --strict-text-smoke` accepts
a strict text fixture path under `fixtures/render-everywhere/strict-text`, derives the matching
outline evidence pack by suffix convention unless `--evidence` is supplied, validates fixture, font
pack, font hashes, font references, and outline evidence before rendering, then draws offscreen
through the Rust outline renderer and prints a minimal text summary. This is still not the expanded
native metadata equality report or native visible-text probe gate.

S063 expands the native strict text summary into the browser-aligned metadata report. Native output
now includes fixture hash, font-pack path/hash, glyph-run hash, line-box hash, evidence pack
id/kind/hash, text profile, position encoding, renderer name, glyph counts, command count, and
semantic-text nonauthority fields. The fixture/font/glyph-run/line-box values come from the Rust
strict text receipt builder, while the evidence hash covers the exact outline evidence bytes.

S064 adds native visible text smoke assertions. `--strict-text-smoke` now computes nonblank pixel
count and coarse nonblank bounds from the offscreen RGBA8 output, fails blank text with
`NativeStrictTextSmokeError`, and prints `smoke=passed` only after visible evidence is present. This
is still a coarse smoke, not the later stable probe policy or cross-runtime bounds gate.

S065 adds browser/native metadata equality. The browser Vitest harness renders the canonical strict
text fixture through the fake Canvas path renderer, asks the native CLI for its `--strict-text-smoke`
metadata, and compares the shared contract fields exactly: fixture and font hashes, glyph-run and
line-box hashes, evidence id/kind/hash, profile, position encoding, glyph counts, command count, and
semantic text nonauthority fields. Runtime-specific renderer names and native smoke bounds are not
treated as equality fields.

S066 adds browser coarse pixel probes. The browser Playwright gate samples named points in the
visible strict text canvas, requiring exact interior fill at stable glyph points and transparent
background outside the glyph evidence. Failures report fixture id, probe id, coordinates, expected
class, and actual RGBA through `BrowserGateStrictTextProbeError`.

S067 adds matching native coarse pixel probes. The native `--strict-text-smoke` path samples the
same named coordinates as the browser gate, requires exact fill `[17, 24, 39, 255]` for interior
glyph probes, requires transparent alpha for background probes, emits every probe result in the CLI
summary, and fails through `NativeStrictTextProbeError` before reporting `smoke=passed`.

S068 makes those probes a fixture-local policy artifact instead of duplicated constants. The
`geordi-strict-text-probe-policy/1` schema requires each probe to state its purpose, coordinate
source, expectation, tolerance, and stability class. Browser Playwright and native
`--strict-text-smoke` both consume `geordi.probe-policy.geordi.json`; fill probes require exact
policy `fillRgba`, transparent probes require alpha zero, and antialiasing-edge probes are explicitly
non-stable and nonblocking.

S069 extends that policy with evidence-derived allowed nonblank bounds. The browser gate and native
smoke path independently derive inclusive pixel bounds from positioned glyph origins plus drawing
outline evidence bounds, verify the policy's `allowedNonblankBounds`, compute rendered nonblank
bounds, and fail through custom bounds errors if painted pixels escape the allowed evidence box. This
remains a containment proof, not a requirement that every allowed pixel be painted.

S070 adds missing glyph evidence rejection. The TypeScript and Rust contracts now expose explicit
fixture-to-evidence coverage validators with stable diagnostic code
`GEORDI_TEXT_EVIDENCE_MISSING_GLYPH`. Browser direct rendering, browser fixture mode, native CLI
smoke mode, and the Rust renderer all reject the validly-shaped
`failures/missing-glyph-evidence.outline-evidence.geordi.json` pack before drawing when it omits a
glyph referenced by `geordi.strict-text.geordi.json`.

S071 adds unknown glyph evidence rejection for fixture-local minimal packs. The same coverage
validators now reject evidence entries whose `fontId + glyphId` key is not referenced by the strict
text fixture, using stable diagnostic code `GEORDI_TEXT_EVIDENCE_UNKNOWN_GLYPH`. The
`failures/unknown-glyph-evidence.outline-evidence.geordi.json` pack keeps all required glyph ids
present but adds glyph id `9999`, proving that renderers fail before silently ignoring extra glyph
evidence.

S072 adds line-box containment rejection. TypeScript and Rust now validate drawing outline evidence
after translating glyph-local bounds through positioned glyph origins: each translated bounds box
must stay inside the glyph run's declared line box unless a future overflow profile explicitly
relaxes that rule. The `failures/bad-line-box.strict-text.geordi.json` fixture keeps the strict text
fixture shape valid but narrows `line-0`, and browser direct rendering, browser fixture mode, native
CLI smoke mode, and the Rust renderer all reject it before drawing with
`GEORDI_TEXT_EVIDENCE_OUTSIDE_LINE_BOX`.

S073 adds explicit unsupported text paint failures. The first strict text proof remains fill-only:
outline evidence must use `paint.kind: "solidFill"`, and strict text fixtures must not request
stroke-like text paint features. The `failures/unsupported-paint.outline-evidence.geordi.json` and
`failures/unsupported-text-paint.strict-text.geordi.json` fixtures prove TypeScript, browser,
native, and Rust paths reject unsupported paint before drawing instead of treating stroke, gradient,
opacity-effect, or multi-paint modes as compliant.

S074 documents the browser strict text demo as the first UI-facing `Text` panel proof. The browser
docs name the exact strict text fixture, outline evidence, probe policy, and font-pack assets;
describe validation before drawing; identify Canvas path rendering as the only compliant browser
route; list expected metadata fields; and preserve the no-platform-text-API spies for `fillText`,
`strokeText`, `measureText`, and `FontFace`. The docs explicitly keep the proof outside `geordi-ir/1`
and outside general text support.

S075 documents the native strict text demo as the Rust `--strict-text-smoke` proof. The native docs
name the same strict text fixture, outline evidence, probe policy, and font-pack assets; describe
fixture path resolution and explicit evidence overrides; record browser-aligned output fields; and
preserve hard failures for unsupported features, missing or unreferenced evidence, line-box escape,
unsupported paint, blank output, probe mismatch, and nonblank-bounds escape. The docs explicitly
keep native strict text outside OS text APIs, host fallback, native window presentation, and broad
`geordi-ir/1` text support.

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

### S076 Shaping Implementation Decision

Decision: shaping stays out of the compliant renderer path. The next implementation boundary for
shaping is a pinned text-prep tool that emits prepared strict artifacts; it is not browser shaping,
not OS shaping, not runtime shaping inside browser/native renderers, and not a mandatory
TypeScript-to-WASM validation wrapper.

The selected implementation direction is:

1. Keep current fixtures on `shapingProfile: "precomputed-fixture/1"` until a Geordi-owned
   generator exists.
2. Introduce shaping through a text-prep CLI boundary after strict receivers are already proven.
3. Prefer a Rust-native shaping core for the CLI because shaping is algorithmically hard and should
   not be hand-mirrored in TypeScript.
4. Let TypeScript remain the authoring, fixture, browser, and docs/tooling edge; a Node package may
   invoke the CLI or consume generated artifacts, but it must not make ordinary validation depend on
   mandatory WASM.
5. Treat WASM as an optional later exposure of the same hard kernel only after the native text-prep
   path, fingerprints, conformance fixtures, and generated outputs are stable.

The decision rejects these paths for compliance:

| Rejected path | Reason |
| --- | --- |
| Browser Canvas or DOM shaping | Reintroduces host font loading, browser metrics, fallback, and timing differences. |
| Native OS text APIs | Reintroduces CoreText/DirectWrite/Pango/etc. differences as renderer behavior. |
| Runtime shaping in browser/native renderers | Makes glyph ids and positions depend on runtime environment instead of artifact data. |
| Hand-mirrored TypeScript and Rust shapers | High drift risk for a hard algorithmic domain. |
| Mandatory WASM for all TypeScript validation | Adds loader/package friction for ordinary object-shaped fixture checks. |
| Unfingerprinted prep scripts | Cannot explain why glyph ids, advances, line boxes, or evidence changed. |

The text-prep artifact boundary must look like this:

~~~mermaid
sequenceDiagram
  autonumber
  participant Author as Authoring Input
  participant Prep as Pinned Text Prep CLI
  participant Font as Content-Addressed Font Pack
  participant Shaper as Pinned Shaping Core
  participant Fixture as Strict Text Fixture
  participant Evidence as Glyph Evidence Pack
  participant Receipt as Provenance Receipt
  participant Runtime as Browser/Native Runtime

  Author->>Prep: source text, language, script, direction, features
  Font->>Prep: font bytes, face index, hashes
  Prep->>Shaper: normalized source and fingerprinted config
  Shaper-->>Prep: glyph ids, advances, offsets
  Prep->>Fixture: positioned glyph runs and line boxes
  Prep->>Evidence: glyph evidence references or generated evidence
  Prep->>Receipt: shaping fingerprint and output hashes
  Runtime->>Fixture: validate prepared artifact
  Runtime->>Evidence: render evidence only
  Runtime-->>Author: no runtime shaping, no host fallback
~~~

Minimum S076 policy for future shaping artifacts:

- Every shaping-affecting input must be fingerprinted before a generated fixture can be called
  strict-compliant.
- Runtime renderers consume only the generated fixture, line boxes, font pack, evidence pack, and
  receipt fields.
- Source strings remain semantic/debug/accessibility metadata in runtime artifacts.
- Generated glyph ids, advances, offsets, line boxes, and evidence hashes must be reviewable and
  reproducible from pinned inputs.
- The engine choice is intentionally not finalized in S076; S077 owns the fingerprint law, S078 owns
  any shaping spike, and S079 owns the compiler/text-prep boundary.

### S077 Shaping Profile Fingerprint Law

Any artifact that claims a Geordi-owned shaper produced glyph ids, advances, offsets, line boxes, or
evidence must carry a complete shaping profile fingerprint. Without that fingerprint, the artifact is
only `precomputed-fixture/1` review data and must not claim generated strict-text compliance.

The first fingerprint profile name is:

~~~text
geordi-text-prep-shaping-fingerprint/1
~~~

The fingerprint is contract data, not a debug note. It must be canonical JSON, hashable, and linked
from the generated fixture receipt. Its job is to answer this question for every generated glyph run:

~~~text
Given these exact inputs and this exact toolchain, why are these the glyph ids,
positions, line boxes, and evidence references?
~~~

Required fingerprint fields:

| Group | Required fields | Why it matters |
| --- | --- | --- |
| Profile identity | `fingerprintVersion`, `textProfile`, `positionEncodingProfile`, `generatedAtPolicy` | Prevents accidental reuse across incompatible strict-text profiles or timestamp-bearing builds. |
| Generator identity | `generatorName`, `generatorVersion`, `generatorSourceHash`, `generatorConfigHash` | Identifies the Geordi-owned prep tool and its pinned configuration. |
| Shaper identity | `shaperName`, `shaperVersion`, `shaperBuildHash`, `shaperConfigHash` | Identifies the hard shaping kernel whose behavior affects glyph identity and positions. |
| Font identity | `fontPackHash`, `fontId`, `fontFileHash`, `faceIndex`, `fontFormat` | Binds glyph ids to exact font bytes and face selection. |
| Source identity | `sourceTextHash`, `sourceEncoding`, `normalizationProfile`, `semanticLanguage` | Makes source text and Unicode normalization reviewable without making strings runtime authority. |
| Shaping inputs | `script`, `language`, `direction`, `fallbackPolicy`, `openTypeFeatures`, `variationAxes` | Captures inputs that can change substitution, positioning, metrics, or font selection. |
| Geometry policy | `pxPerEm`, `coordinateSpace`, `roundingPolicy`, `baselinePolicy`, `lineBoxPolicy` | Binds numeric conversion and line metrics to deterministic rules instead of host measurement. |
| Output identity | `glyphRunHash`, `lineBoxHash`, `glyphEvidenceKind`, `glyphEvidencePackHash`, `fixtureHash` | Links the fingerprint to the generated artifacts that runtimes actually consume. |

Canonicalization rules:

- The fingerprint must be serialized through the same canonical JSON port used by other Geordi
  receipts.
- Hash fields use `sha256:` lowercase hex strings.
- OpenType feature records are sorted by tag, then value.
- Variation-axis records are sorted by axis tag and must be empty for the first static-font profile.
- `fallbackPolicy` must be `no-fallback/1` for the first profile; fallback-chain fields must not
  appear as empty arrays or future-looking placeholders.
- `generatedAtPolicy` must be `no-wall-clock-input/1` until a later reproducibility profile states
  how timestamps are excluded from artifact hashes.
- `normalizationProfile` must name both the normalization form and the Unicode data version used by
  the prep tool.
- `language` and `semanticLanguage` are distinct: `language` is a shaping input; semantic language
  remains metadata for humans and accessibility experiments.
- If a field is not applicable, it must use a profile-defined sentinel such as `none/1` or an empty
  canonical array; it must not be omitted.

Future generated fixture receipts must link the fingerprint like this:

~~~json
{
  "shapingProfile": "geordi-text-prep-shaping-fingerprint/1",
  "shapingFingerprintHash": "sha256:...",
  "fontPackHash": "sha256:...",
  "glyphRunHash": "sha256:...",
  "lineBoxHash": "sha256:...",
  "glyphEvidencePackHash": "sha256:..."
}
~~~

The fingerprint owns provenance; it does not authorize runtime shaping. Browser and native
renderers still consume prepared glyph runs, line boxes, and evidence only.

Future validators should use stable diagnostic identities for fingerprint failures:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_SHAPING_FINGERPRINT_REQUIRED` | A generated artifact claims shaped output but has no fingerprint. |
| `GEORDI_TEXT_SHAPING_FINGERPRINT_BAD_PROFILE` | `fingerprintVersion` or `shapingProfile` is missing or unsupported. |
| `GEORDI_TEXT_SHAPING_FINGERPRINT_MISSING_FIELD` | A required fingerprint field is absent instead of using a profile-defined sentinel. |
| `GEORDI_TEXT_SHAPING_FINGERPRINT_BAD_HASH` | A hash field is malformed or does not match generated artifact bytes. |
| `GEORDI_TEXT_SHAPING_FINGERPRINT_UNSTABLE_INPUT` | The fingerprint depends on wall-clock time, host font lookup, ambient locale, or another unpinned input. |
| `GEORDI_TEXT_SHAPING_FINGERPRINT_OUTPUT_MISMATCH` | Output hashes do not match the fixture, line boxes, glyph run, or evidence pack being validated. |

S077 does not choose a shaping engine, implement a generator, or make shaped output compliant. It
only defines the minimum evidence that later slices must produce before generated strict text can be
trusted.

### S078 Shaping Spike Outside Compliance Path

Any shaping experiment before the text-prep boundary is a spike, not a product feature. A spike may
help compare engines, inspect glyph ids, or estimate line metrics, but it must not emit artifacts
that browser or native strict renderers can mistake for compliant fixture input.

The spike profile name is:

~~~text
geordi-text-shaping-spike-noncompliant/1
~~~

Spike outputs are allowed only when all of these are true:

- the output is stored under a path or manifest that names `spike` or `noncompliant`;
- the output declares `compliance: "noncompliant-spike/1"`;
- the output declares `mayFeedStrictRenderer: false`;
- the output omits `geordi-strict-text-fixture/1` as a fixture version;
- the output omits `geordi-text-prep-shaping-fingerprint/1` unless it is explicitly exercising
  fingerprint shape validation without claiming generated compliance;
- the output is excluded from browser/native render-everywhere fixture discovery;
- docs and tests describe it as exploratory evidence only.

Spike outputs are forbidden from:

| Forbidden use | Reason |
| --- | --- |
| Serving as `*.strict-text.geordi.json` | That extension family is reserved for strict renderer inputs. |
| Replacing canonical fixtures | Canonical fixtures remain hand-authored/precomputed until S080-S083 define generated output and comparison. |
| Populating receipt `shapingProfile` as compliant | Receipts must not claim a generator path before fingerprint and output schema exist. |
| Being loaded by browser or native strict smoke gates | Smoke gates prove receiver behavior, not exploratory shaping. |
| Resolving host fonts by family name | Host lookup would make spike output unreproducible and normalize the wrong behavior. |
| Hiding fallback, multiline, bidi, complex-script, or variable-axis behavior | Unsupported typography must remain visible as rejection data in later slices. |

The intended spike flow is:

~~~mermaid
flowchart TD
  Source[Source text sample] --> Spike[Noncompliant shaping spike]
  Font[Fixture-local font bytes] --> Spike
  Spike --> Report[Engine comparison report]
  Spike --> Scratch[Scratch glyph observations]
  Report -. not renderer input .-> Renderer[Strict browser/native renderers]
  Scratch -. not fixture input .-> Fixture[Canonical strict fixtures]
~~~

Spike reports may record:

- candidate engine name and version;
- observed glyph ids;
- observed advances and offsets;
- observed line metrics;
- observed unsupported-feature behavior;
- mismatches versus current hand-authored fixtures;
- open questions for S079-S083.

Spike reports must not record:

- a compliance badge;
- a strict text fixture id;
- `rendered=true`;
- `smoke=passed`;
- browser/native parity metadata;
- any statement that the spike output is accepted by a compliant renderer.

Future validators should reject accidental promotion with stable diagnostic identities:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_SHAPING_SPIKE_NONCOMPLIANT` | A spike artifact is clearly labeled noncompliant and must not be rendered as strict text. |
| `GEORDI_TEXT_SHAPING_SPIKE_USED_AS_FIXTURE` | A noncompliant spike artifact was supplied where a strict text fixture is required. |
| `GEORDI_TEXT_SHAPING_SPIKE_MISSING_NONCOMPLIANCE_LABEL` | A spike report lacks the required noncompliance profile or `mayFeedStrictRenderer: false`. |
| `GEORDI_TEXT_SHAPING_SPIKE_HOST_FONT_LOOKUP` | A spike tried to resolve fonts through ambient host family/fallback behavior. |

S078 does not add spike code. It makes future spike code safe to add by ensuring exploratory shaping
cannot become an accidental renderer claim.

### S079 Compiler Text Preparation Boundary

Text preparation is a compiler/tooling boundary, not a runtime renderer feature. Source strings,
font intent, language/script metadata, and authoring conveniences may enter text prep. Browser and
native renderers may receive only prepared strict artifacts.

The boundary profile name is:

~~~text
geordi-text-prep-boundary/1
~~~

The boundary is intentionally one-way:

~~~text
authoring input -> text-prep input -> generated strict artifacts -> renderers
~~~

Renderers must never call back into text prep while drawing. A renderer that lacks prepared glyph
runs, line boxes, font identity, evidence references, and receipt/fingerprint data must fail before
drawing instead of shaping a string.

Text-prep owns:

| Responsibility | Boundary rule |
| --- | --- |
| Source normalization | Normalize source using an explicit `normalizationProfile`; record `sourceTextHash`. |
| Font resolution | Resolve only fixture-local, content-addressed font assets; reject family-name lookup and fallback. |
| Shaping | Run only through the pinned prep engine selected by future slices; record the complete fingerprint. |
| Glyph-run generation | Emit font-local glyph ids, advances, offsets, and positions in `geordi-fixed-26.6/1`. |
| Line-box generation | Emit deterministic line boxes from pinned policy and measured/prepared data, not runtime APIs. |
| Evidence linkage | Reference or generate glyph evidence packs whose hashes are receipt inputs. |
| Receipt provenance | Emit hashes for source, font pack, shaping fingerprint, glyph runs, line boxes, evidence, and fixture. |
| Explainability | Provide a report that lets reviewers trace source text to glyph ids without making source strings pixel authority. |

Renderers own:

| Responsibility | Boundary rule |
| --- | --- |
| Artifact validation | Validate prepared fixture, font pack, line boxes, evidence, fingerprint references, and feature requirements. |
| Drawing | Draw only from positioned glyph evidence. |
| Failure behavior | Reject missing or unsupported prepared data before drawing. |

Renderers do not own:

- source-string parsing for pixels;
- Unicode normalization;
- font-family lookup;
- fallback-chain selection;
- shaping;
- kerning or ligature decisions;
- line breaking;
- bidi reordering;
- variable-axis resolution;
- host text measurement.

The future CLI surface belongs outside browser/native renderer packages:

~~~text
geordi text-prep prepare --input text-prep.input.geordi.json --output fixtures/text/generated
geordi text-prep explain --fixture fixtures/text/generated/example.strict-text.geordi.json
geordi text-prep compare --expected fixtures/text/generated --actual /tmp/generated
~~~

The first text-prep input must identify:

| Input group | Required data |
| --- | --- |
| Source | Source string bytes or source artifact path, source encoding, semantic language, normalization profile. |
| Font | Font-pack path/hash, font id, font file hash, face index. |
| Shaping | Script, shaping language, direction, OpenType features, variation axes, shaper profile request. |
| Geometry | Canvas/line coordinate space, px-per-em, baseline policy, line-box policy, rounding policy. |
| Output | Fixture id, output directory, evidence kind, receipt policy, comparison policy. |

The first text-prep output must include:

| Output artifact | Purpose |
| --- | --- |
| `*.strict-text.geordi.json` | Prepared positioned glyph-run fixture. |
| `*.outline-evidence.geordi.json` or evidence reference | Drawable glyph evidence for the prepared glyphs. |
| `*.shaping-fingerprint.geordi.json` | Canonical shaping profile fingerprint. |
| `*.strict-text.geordi.json.receipt` | Provenance and hash receipt. |
| `*.text-prep-report.geordi.json` | Human/audit explanation; not renderer input unless later named. |

Future boundary diagnostics:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_PREP_HOST_FONT_LOOKUP` | Text prep attempted ambient family-name lookup instead of content-addressed fonts. |
| `GEORDI_TEXT_PREP_FALLBACK_REQUIRED` | Source text required fallback outside the first strict profile. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE` | Input requested wrapping or multiline layout before that profile exists. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_BIDI` | Input requested bidi or complex-script behavior outside the first supported subset. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES` | Input requested variable axes without an axis fingerprint profile. |
| `GEORDI_TEXT_PREP_MISSING_FINGERPRINT` | Generated output lacks the shaping fingerprint required by S077. |

S079 does not implement the CLI or schema. It defines the boundary that S080-S083 must use when they
add generated output, generation commands, and comparison behavior.

### S080 Generated Shaped Output Schema

The generated output bundle schema is:

~~~text
fixtures/render-everywhere/strict-text/generated-shaped-output.schema.md
~~~

It defines `geordi-text-prep-generated-output/1`, a manifest that ties together a generated strict
text fixture, source hash, content-addressed font identity, shaping fingerprint, glyph evidence pack,
receipt, and canonical output hashes. The manifest is an audit/comparison bundle, not a renderer
input by itself.

The schema requires:

- `source.sourceTextHash`, `sourceEncoding`, `normalizationProfile`, and `semanticLanguage`;
- `fontPackPath`, `fontPackHash`, `fontId`, `fontFileHash`, `faceIndex`, and `fontFormat`;
- `shapingProfile`, `shapingFingerprintPath`, and `shapingFingerprintHash`;
- generated strict fixture path/hash;
- glyph evidence pack path/hash/kind;
- receipt path/hash;
- canonical `glyphRunHash`, `lineBoxHash`, and `fixtureHash`.

Generated output manifests must not contain renderer names, `rendered=true`, `smoke=passed`, host
font family names, platform metrics, local absolute paths, wall-clock timestamps, or spike artifacts.
S081 introduced the first command surface and deterministic prep plan, S082 owns the first generated
fixture artifact, and S083 owns regeneration comparison.

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

### S081 Glyph-Run Generation CLI

The first CLI surface is implemented in:

~~~text
packages/text-prep
@flyingrobots/geordi-text-prep
geordi-text-prep prepare --input text-prep.input.geordi.json --output fixtures/render-everywhere/strict-text/generated
~~~

This slice intentionally creates the command boundary before claiming full generation. The command
parses pinned `geordi-text-prep-input/1` JSON, validates the first strict text-prep subset, and
writes `text-prep.generation-plan.geordi.json` as deterministic audit data. The plan is not a
renderer input and declares `mayFeedStrictRenderer: false`; S082 must add the first generated strict
text fixture before any generated output can enter render-everywhere fixture review.

The input validator requires:

- `inputVersion: "geordi-text-prep-input/1"`;
- `textPrepBoundary: "geordi-text-prep-boundary/1"`;
- `textProfile: "geordi-strict-positioned-glyph-run/1"`;
- normalized UTF-8 source text plus `sourceTextHash`;
- content-addressed font-pack path/hash, font id, font file hash, face index, and `ttf` format;
- `shapingProfile: "geordi-text-prep-shaping-fingerprint/1"` plus fingerprint path/hash;
- first-profile shaping metadata: `script: "Latn"`, `direction: "ltr"`, language, OpenType
  feature list, `fallbackPolicy: "no-fallback/1"`, and empty variation-axis list;
- fixed 26.6 geometry policy, rounding policy, baseline policy, line-box policy, and output intent.

The plan output carries only hashes and policy fields required for later artifact generation:

~~~mermaid
classDiagram
  class TextPrepInput {
    +inputVersion
    +textPrepBoundary
    +textProfile
    +source
    +font
    +shaping
    +geometry
    +output
  }
  class TextPrepGenerationPlan {
    +planVersion
    +status
    +compliance
    +mayFeedStrictRenderer
    +inputHash
    +source
    +font
    +shaping
    +geometry
    +output
  }
  class GeneratedOutputManifest {
    +outputVersion
    +source
    +font
    +shaping
    +artifacts
    +hashes
  }
  TextPrepInput --> TextPrepGenerationPlan : validates into
  TextPrepGenerationPlan ..> GeneratedOutputManifest : S082-S083 extend into
~~~

The generation plan never contains pixel-authoritative source text. It records `sourceTextHash`,
font identity, shaping fingerprint identity, feature-list hash, variation-axis hash, fixed-position
encoding, and output fixture intent. It exists so reviewers can audit the exact pinned intent before
later slices create generated fixtures, evidence packs, receipts, and bundle manifests.

~~~mermaid
sequenceDiagram
  participant User
  participant CLI as geordi-text-prep prepare
  participant Validator as Input Validator
  participant Plan as Generation Plan Writer
  User->>CLI: --input text-prep.input.geordi.json --output generated/
  CLI->>Validator: parse canonical JSON
  Validator-->>CLI: valid pinned intent or GEORDI_TEXT_PREP_* diagnostics
  CLI->>Plan: write deterministic plan when valid
  Plan-->>User: text-prep.generation-plan.geordi.json
~~~

Stable diagnostics introduced by this slice:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_PREP_BAD_INPUT` | Required shape, profile, or scalar field is malformed. |
| `GEORDI_TEXT_PREP_BAD_PATH` | Font or shaping fingerprint path is not repository-relative POSIX. |
| `GEORDI_TEXT_PREP_HOST_FONT_LOOKUP` | Input attempted host/system font lookup. |
| `GEORDI_TEXT_PREP_IO_ERROR` | CLI input or output file IO failed. |
| `GEORDI_TEXT_PREP_FALLBACK_REQUIRED` | Input omitted or misdeclared `fallbackPolicy: "no-fallback/1"`, or attempted a fallback-chain field. |
| `GEORDI_TEXT_PREP_MISSING_FINGERPRINT` | Input omitted `geordi-text-prep-shaping-fingerprint/1`. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE` | Source requested multiline/wrapping behavior. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_BIDI` | Input requested bidi or non-Latin first-profile shaping. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES` | Input requested variable font axes before an axis fingerprint profile exists. |
| `GEORDI_TEXT_PREP_UNSTABLE_INPUT` | Source normalization or source hash is not pinned. |

S081 does not implement shaping, font parsing, glyph outline extraction, line-box measurement,
generated strict text fixtures, receipts, generated output manifests, or comparison. It gives those
later slices a tested CLI/API boundary with deterministic output and no ambient host font lookup.

### S082 Generated Fixture Artifact

The first generated strict text fixture artifacts are committed under:

~~~text
fixtures/render-everywhere/strict-text/generated/
  README.md
  geordi.text-prep.input.geordi.json
  text-prep.generation-plan.geordi.json
  geordi.strict-text.geordi.json
~~~

The generated input uses `geordi-text-prep-input/1` and pins the same first-profile `GEORDI`
glyph ids, advances, offsets, and line box as the canonical hand-authored fixture. The CLI now
lowers `preparedFixture.glyphRuns` and `preparedFixture.lineBoxes` into a canonical
`geordi-strict-text-fixture/1` output when `output.strictTextFixtureFile` is present.

This is deliberately not a shaping-engine claim. The generated fixture comes from explicit prepared
glyph-run and line-box data, validates through the strict text fixture contract, and remains separate
from browser/native renderer inputs until later slices add evidence, receipts, generated output
manifests, and regeneration comparison.

~~~mermaid
flowchart LR
  Input["geordi.text-prep.input.geordi.json"] --> CLI["geordi-text-prep prepare"]
  CLI --> Plan["text-prep.generation-plan.geordi.json"]
  CLI --> Fixture["geordi.strict-text.geordi.json"]
  Fixture --> Validator["strict text fixture validator"]
  Plan -. "audit only" .-> Reviewer["reviewer/comparison tooling"]
~~~

Generated artifact rules:

- the generated fixture is canonical JSON and has a final newline;
- the generated fixture id is `render-everywhere:strict-text:generated-geordi`;
- the source string remains `semanticText` metadata with `affectsPixels: false`;
- font identity comes from the content-addressed Lato font pack;
- the generation plan omits source text and records `sourceTextHash`, `preparedFixtureHash`, font
  identity, shaping fingerprint identity, geometry policy, and output intent;
- the plan declares `mayFeedStrictRenderer: false` until generated evidence and receipts exist.

S082 does not implement regeneration comparison, generated evidence, generated receipts, measured
line boxes, a generated output bundle manifest, or a real shaping/font parsing kernel. S083 owns
drift comparison for these generated artifacts.

### S083 Generated Artifact Comparison

Generated strict text artifacts now have a read-only regeneration comparison gate:

~~~bash
pnpm test:render-everywhere:strict-text-generated
~~~

The gate builds `@flyingrobots/geordi-text-prep` and runs:

~~~bash
geordi-text-prep compare \
  --input fixtures/render-everywhere/strict-text/generated/geordi.text-prep.input.geordi.json \
  --expected fixtures/render-everywhere/strict-text/generated
~~~

`compare` parses the pinned text-prep input, regenerates the plan and strict text fixture in memory,
then compares the expected committed files byte-for-byte. It does not rewrite files. Drift fails with
stable diagnostics that include artifact path plus expected and actual `sha256:` hashes.

~~~mermaid
sequenceDiagram
  participant Gate as strict-text-generated gate
  participant CLI as geordi-text-prep compare
  participant Prep as In-memory generation
  participant Files as Committed generated files
  Gate->>CLI: --input generated input --expected generated dir
  CLI->>Prep: regenerate plan and strict fixture bytes
  CLI->>Files: read expected committed bytes
  Files-->>CLI: expected bytes
  CLI-->>Gate: ok or GEORDI_TEXT_PREP_COMPARE_* diagnostics
~~~

Comparison diagnostics:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_PREP_COMPARE_DRIFT` | Regenerated bytes differ from the committed generated artifact. |
| `GEORDI_TEXT_PREP_COMPARE_MISSING_ARTIFACT` | A required expected artifact is absent or unreadable. |

S083 does not make generated output renderable by itself. The generated fixture still lacks generated
evidence, generated receipts, generated output bundle validation, and measured line boxes.

### S084 Receipt Shaping Profile Field

Strict text fixture receipts now allow exactly two shaping provenance profiles:

| Profile | Meaning | Fingerprint hash rule |
| --- | --- | --- |
| `precomputed-fixture/1` | Hand-authored or externally precomputed fixture review data. | `shapingFingerprintHash` must be absent. |
| `geordi-text-prep-shaping-fingerprint/1` | Generated text-prep output with a pinned shaping fingerprint. | `shapingFingerprintHash` is required and must be a `sha256:` hash. |

TypeScript receipt DTOs, validators, and the Node receipt builder enforce this rule. Rust receipt
structs now carry optional `shaping_fingerprint_hash` and preserve `None` for existing precomputed
fixtures. Existing canonical receipts still build as `precomputed-fixture/1`; generated receipts can
opt into the fingerprinted profile without accepting arbitrary runtime-shaping strings.

S084 does not add generated receipt files yet. S085 and S086 continue the receipt arc by tightening
glyph-run and line-box checksum handling for generated output.

### S085 Receipt Glyph-Run Checksum Field

`glyphRunHash` was already part of the strict text fixture receipt schema. S085 hardens that field
against generated fixture drift by extending TypeScript and Rust receipt tests to the generated
strict text fixture:

~~~text
fixtures/render-everywhere/strict-text/generated/geordi.strict-text.geordi.json
~~~

Both receipt builders now prove that the generated fixture's canonical `glyphRuns` fragment hashes
to:

~~~text
sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472
~~~

That is the same positioned glyph-run evidence as the canonical `GEORDI` fixture, under a generated
fixture id. The hash input remains `canonicalJsonPort.stringify(glyphRuns, { space: 2 }) + "\n"`;
source text, fixture id, and receipt metadata are not part of the glyph-run checksum.

S085 does not add generated receipt files or line-box checksum hardening. S086 owns the generated
line-box checksum proof.

### S086 Receipt Line-Box Checksum Field

`lineBoxHash` was already part of the strict text fixture receipt schema. S086 hardens that field
against generated fixture drift by extending TypeScript and Rust receipt tests to the generated
strict text fixture:

~~~text
fixtures/render-everywhere/strict-text/generated/geordi.strict-text.geordi.json
~~~

Both receipt builders now prove that the generated fixture's canonical `lineBoxes` fragment hashes
to:

~~~text
sha256:6d0b4e63bd04bd33e7213240a173f86fb478f23fa4cd505514c0b8af425f1e10
~~~

The line-box checksum pins baseline, extent, and containment geometry independently from
`glyphRunHash`. The hash input remains:

~~~text
canonicalJsonPort.stringify(lineBoxes, { space: 2 }) + "\n"
~~~

Source text, fixture id, and receipt metadata are not part of the line-box checksum.

S086 does not add generated receipt files or fallback-chain validation. S087 owns the no-fallback
validator.

### S087 No-Fallback Validator

S087 makes no-fallback an explicit text-prep shaping policy instead of relying on the absence of
fallback-chain data. The first strict text-prep profile now requires:

~~~json
{
  "shaping": {
    "fallbackPolicy": "no-fallback/1"
  }
}
~~~

The validator rejects any of these keys wherever they appear under `font` or `shaping`:

~~~text
fallbackFonts
fallbackFontIds
fallbackChain
~~~

Presence alone is invalid, including empty arrays. Empty fallback arrays are not a stable contract;
`fallbackPolicy: "no-fallback/1"` is the only first-profile sentinel.

The generation plan carries `shaping.fallbackPolicy` forward so audit tooling can verify that a
generated glyph-run plan did not depend on host font fallback or a hidden fallback chain. The
committed generated text-prep input and generation plan were regenerated with the explicit
no-fallback policy, while the generated strict text fixture bytes remain unchanged.

S087 does not add a separate fallback-chain failure fixture. S088 owns the committed rejection
fixture that proves the diagnostic survives outside unit tests.

### S088 Fallback-Chain Rejection Fixture

S088 commits the first text-prep failure fixture:

~~~text
fixtures/render-everywhere/strict-text/failures/fallback-chain.text-prep.input.geordi.json
~~~

The fixture preserves the generated `GEORDI` source hash, content-addressed Lato font identity,
first-profile geometry policy, and prepared glyph-run/line-box data. It changes only fallback
contract data:

- `font.fallbackFontIds: ["host-serif"]`;
- `shaping.fallbackChain: ["host-serif"]`;
- `shaping.fallbackPolicy: "font-fallback-chain/1"`.

`@flyingrobots/geordi-text-prep` now reads this committed fixture in its unit suite and requires
`GEORDI_TEXT_PREP_FALLBACK_REQUIRED` on the fallback-chain paths. This keeps fallback rejection from
living only in synthetic inline tests.

S088 does not add multiline, bidi, complex-script, or variable-axis rejection fixtures. S089 and
later slices own those unsupported-input proofs.

### S089 Multiline Rejection Fixture

S089 commits the multiline text-prep failure fixture:

~~~text
fixtures/render-everywhere/strict-text/failures/multiline.text-prep.input.geordi.json
~~~

The fixture pins the normalized UTF-8 source text `GEORDI\nTEXT` and its hash:

~~~text
sha256:de636fbea6fb465b0edc87f79d4d38f02feb795c46825d5b742c994cdab4ef21
~~~

All other first-profile fields remain pinned to the generated `GEORDI` font, geometry, shaping
fingerprint, no-fallback policy, and prepared glyph-run/line-box data. The text-prep unit suite now
loads this committed fixture from disk and requires
`GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE` at `$.source.sourceText`.

S089 does not add bidi, complex-script, or variable-axis fixtures. S090 and S091 own those
unsupported-input proofs.

### S090 Bidi And Complex-Script Rejection Fixtures

S090 commits two text-prep failure fixtures:

~~~text
fixtures/render-everywhere/strict-text/failures/bidi-rtl.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/failures/complex-script.text-prep.input.geordi.json
~~~

`bidi-rtl.text-prep.input.geordi.json` isolates `shaping.direction: "rtl"` while keeping Latin
source text and `script: "Latn"`. It must be rejected with
`GEORDI_TEXT_PREP_UNSUPPORTED_BIDI` at `$.shaping.direction`.

`complex-script.text-prep.input.geordi.json` isolates `shaping.script: "Arab"` with Arabic
language/semantic metadata and escaped Arabic source text whose normalized UTF-8 hash is:

~~~text
sha256:bda1fa48345336618741fd2c4bc02809eb099c49a9b02fb5056401ab6d4dc3e6
~~~

It must be rejected with `GEORDI_TEXT_PREP_UNSUPPORTED_BIDI` at `$.shaping.script`.

S090 does not add variable-axis rejection fixtures. S091 owns that proof.

### S091 Variable-Font-Axis Rejection Fixture

S091 commits the variable-axis text-prep failure fixture:

~~~text
fixtures/render-everywhere/strict-text/failures/variable-axis.text-prep.input.geordi.json
~~~

The fixture keeps the first-profile Latin source, content-addressed font identity, no-fallback
policy, direction, script, and OpenType feature list valid. It isolates a non-empty variation-axis
list:

~~~json
{
  "variationAxes": ["wght=700"]
}
~~~

The text-prep unit suite loads this committed fixture from disk and requires
`GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES` at `$.shaping.variationAxes`.

S091 does not implement measured line-box generation. S092 owns the first generated line-box
measurement rule.

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
