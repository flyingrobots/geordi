# Strict Positioned Glyph-Run Text Plan

**Status**: Draft execution plan
**Date**: 2026-05-25
**Parent Bearing**: [../../BEARING.md](../../BEARING.md)
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

## Glyph Evidence Pack

A positioned glyph run says which glyph goes where. It does not by itself say how to draw the glyph. The first strict profile uses an explicit glyph evidence pack. The first evidence kind should be outline paths because it keeps text close to Geordi's explicit geometry model.

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

## Why This Is Not CSS Text

This profile does not implement CSS text. It does not ask the browser for glyph metrics. It does not use host font fallback. It does not shape at render time. It renders positioned glyph evidence.

That distinction protects Geordi from accidentally inheriting the DOM and platform text stacks it is trying to avoid.

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

## Active DAG

The active dependency graph is rendered from [2026-05-strict-positioned-glyph-run-dag.dot](./2026-05-strict-positioned-glyph-run-dag.dot) to [2026-05-strict-positioned-glyph-run-dag.svg](./2026-05-strict-positioned-glyph-run-dag.svg).

Use the DAG to choose the next slice. A node is OPEN when all parents are complete. After each slice, update the checklist state, update the node status in the DOT file, regenerate the SVG, and commit both the slice work and planning-state updates.
