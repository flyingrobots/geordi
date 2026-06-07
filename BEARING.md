# Geordi Bearing

**Date**: 2026-05-25
**Branch baseline**: <code>main</code> at <code>69073ed</code>
**Active milestone**: Strict Positioned Glyph-Run Text
**Active profile under design**: <code>geordi-strict-positioned-glyph-run/1</code>
**Active design doc**: [docs/design/2026-05-strict-positioned-glyph-run-plan.md](./docs/design/2026-05-strict-positioned-glyph-run-plan.md)
**Remaining slice PRD/test plan**:
[docs/design/2026-05-strict-text-remaining-slices-prd-test-plan.md](./docs/design/2026-05-strict-text-remaining-slices-prd-test-plan.md)
**Active DAG SVG**: [docs/design/2026-05-strict-positioned-glyph-run-dag.svg](./docs/design/2026-05-strict-positioned-glyph-run-dag.svg)
**Drift correction**: shared TypeScript/Rust contract DTOs must be generated from a Wesley common
schema; see
[docs/design/2026-05-wesley-common-type-generation.md](./docs/design/2026-05-wesley-common-type-generation.md).
**Runtime boundary**: TypeScript remains native at browser, Node, tooling, and fixture-authoring
edges; Rust remains native at the renderer and CLI core; WASM is reserved for hard deterministic
kernels. See
[docs/design/2026-05-typescript-rust-wasm-boundary.md](./docs/design/2026-05-typescript-rust-wasm-boundary.md).

This file is the short-term operating map. Product laws remain in [docs/V0_DESIGN_LAWS.md](./docs/V0_DESIGN_LAWS.md). The active execution plan is the 100-slice strict positioned glyph-run plan below.

## Current Position

The rectangle render-everywhere proof and Stanford bunny mesh milestone are complete for their stated claim boundaries. The current exact pixel-probe rendering claim remains rectangle-only. The bunny proof establishes shared mesh identity, parser validation, sampled transform metadata, and visible browser/native rotation, not pixel-identical 3D rasterization.

Text remains deferred as a broad feature. The next credibility milestone is not general text support. It is a strict positioned glyph-run proof.

The strict text DTOs currently introduced in TypeScript and Rust are provisional until the Wesley
common-type generator replaces mirrored hand-authored shapes. Validation, custom errors, IO, and
rendering behavior remain handwritten around generated DTOs.

The TypeScript package is not intended to become a thin WASM wrapper around Rust for ordinary fixture
validation. Shared conformance fixtures and stable diagnostic identities must prove cross-runtime
agreement while simple edge behavior remains native in each host.

## Milestone Law

Strict Geordi text is not strings. Strict Geordi text is positioned glyph evidence backed by content-addressed font assets.

The first profile name is:

~~~text
geordi-strict-positioned-glyph-run/1
~~~

The first proof must preserve these nonclaims:

- no CSS text;
- no platform-native text as a compliant path;
- no host font fallback;
- no runtime shaping in strict mode;
- no runtime kerning, ligature substitution, glyph substitution, wrapping, or fallback;
- no multiline wrapping;
- no bidi or complex-script support;
- no variable font axes;
- no text editing/caret/selection semantics;
- no README-level broad text claim until all gates pass.

The first proof starts as a separate render-everywhere strict text fixture artifact. It graduates into
`geordi-ir/1` only after the evidence model, validators, browser renderer, native renderer, parity
metadata, and failure fixtures prove the contract.

Initial glyph coordinates use `geordi-fixed-26.6/1`: px units, scale `64`, top-left origin, positive
x rightward, positive y downward, and explicit baselines. Renderers do not infer hidden rounding,
baselines, line boxes, kerning, shaping, or fallback from platform APIs.

## S015 Law Checkpoint

The first law arc is complete when S015 is checked off. Its result is a scope lock, not a rendering
claim:

- Current claim: Geordi has a documented strict text evidence milestone named
  `geordi-strict-positioned-glyph-run/1`.
- Current claim: strict text fixture work starts outside `geordi-ir/1` and graduates only after both
  browser and native validation/rendering paths prove the contract.
- Current claim: positioned glyph evidence, content-addressed font identity, line boxes, fixed-point
  coordinates, receipts, badges, backlog alignment, and DAG execution are defined enough to start
  font-asset work.
- Current nonclaim: Geordi still does not provide compliant general text rendering, platform text,
  CSS text, runtime shaping, fallback, wrapping, bidi, complex scripts, variable font axes, text
  editing, or pixel-identical text rasterization.
- Next OPEN nodes after this checkpoint: `S016` and `S031`. The selected next slice is `S016`
  because the execution rule prefers the lowest-numbered OPEN node.

## S030 Font Asset Checkpoint

The font asset arc is complete when S030 is checked off. Its result is a verified asset boundary,
not text rendering:

- Current claim: strict text has a documented `geordi-font-pack/1` manifest shape with
  repository-relative font and license paths.
- Current claim: TypeScript and Rust can load the font-pack manifest and verify checked-in font and
  license bytes by `sha256:` identity.
- Current claim: committed failure fixtures cover absolute paths, duplicate font ids, unsupported
  formats, and mismatched bytes.
- Current claim: `font-pack.geordi.json.receipt` records the manifest hash and verifier outputs for
  review and CI provenance.
- Current nonclaim: Geordi still does not shape, line-break, render, rasterize, or compare text.
- Current nonclaim: the Lato font asset pack does not imply host font lookup, fallback, platform
  metrics, or runtime text APIs are compliant.
- Next OPEN node after this checkpoint: `S031`, because `S039` remains blocked until glyph-run
  validation slices complete.

## S050 Glyph-Run Checkpoint

The glyph-run arc is complete when S050 is checked off. Its result is a validated strict text
fixture boundary, not text rendering:

- Current claim: strict text has committed `geordi-strict-text-fixture/1` fixtures for `GEORDI` and
  `text 0123`.
- Current claim: TypeScript and Rust parse and validate strict text fixture shape, text profile,
  feature requirements, fixed 26.6 coordinates, font-local glyph ids, advances, offsets, line boxes,
  semantic-text nonauthority, and font-pack references.
- Current claim: canonical JSON normalization is pinned for committed strict text fixtures.
- Current claim: `geordi-strict-text-fixture-receipt/1` records fixture, font-pack, glyph-run,
  line-box, semantic-text, position-encoding, text-profile, and shaping-profile provenance hashes.
- Current claim: TypeScript and Rust build matching canonical strict text fixture receipts for both
  committed valid fixtures.
- Current claim: the committed unsupported runtime-shaping fixture is rejected by TypeScript, Rust,
  browser harness preflight, and native harness preflight before drawing.
- Current nonclaim: Geordi still does not provide strict text glyph evidence packs, outline command
  validation, browser strict text rendering, native strict text rendering, text pixel probes, text
  parity reports, or `geordi-ir/1` text-node integration.
- Current nonclaim: platform text APIs, host font lookup, runtime shaping, fallback, wrapping, bidi,
  complex scripts, variable font axes, and broad text support remain unsupported.
- Next OPEN node after this checkpoint: `S051`, rendering evidence strategy decision.

## S051 Rendering Evidence Strategy

The first strict text rendering proof uses fixture-local `outlinePaths` glyph evidence. Renderers
consume explicit fixed 26.6 outline commands and validated glyph positions; they do not parse fonts,
shape text, query platform metrics, use host fallback, call browser text APIs, or require a WASM font
kernel for this milestone.

The first visible proof is fill-only monochrome outline geometry with exact metadata parity and
scoped visual probes. It does not claim full text antialiasing pixel identity, reusable glyph-cache
semantics, bitmap/SDF atlases, shared rasterization, or broad text paint support.

Next OPEN node after this decision: `S053`, outline evidence fixture data.

## S052 Outline Evidence Pack Schema

The first strict text outline evidence pack schema is
`fixtures/render-everywhere/strict-text/outline-evidence-pack.schema.md`. It defines
`geordi-glyph-evidence-pack/1`, `outlinePaths`, fixture-local path/hash linkage, glyph-origin fixed
26.6 command coordinates, nonzero solid-fill geometry, font identity binding, command vocabulary,
and stable diagnostic codes for the TypeScript and Rust parser slices.

The schema did not make strict text renderable by itself; S053 adds committed data, while parser and
renderer support remain separate slices.

## S053 Outline Evidence Fixture Data

The canonical strict text fixtures now have fixture-local outline evidence packs:

- `fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json`
- `fixtures/render-everywhere/strict-text/text-0123.outline-evidence.geordi.json`

The packs contain simple TrueType outline paths from the committed Lato Regular bytes, scaled to
the fixture's 48px fixed 26.6 coordinate system. Each referenced `fontId + glyphId` pair has one
evidence entry; the space glyph uses `draws: false` with empty commands and zero-area bounds.

The data did not make strict text renderable by itself; S054 adds the TypeScript parser, while Rust
parser and renderer support remain separate slices.

## S054 TypeScript Outline Evidence Parser

`@flyingrobots/geordi-render-fixture` now exports TypeScript DTOs, constants, parse/assert/is
helpers, and `validateRenderFixtureStrictTextOutlineEvidencePack` for
`geordi-glyph-evidence-pack/1`. The parser validates the outline evidence pack shape, first-profile
metadata, font identity shape, glyph entries, bounds, paint, and command field shape with stable
`GEORDI_TEXT_EVIDENCE_*` diagnostic codes.

The TypeScript parser is not a renderer and does not resolve fixture glyph coverage against a font
pack yet. S055 adds the Rust parser while renderer support remains separate.

## S055 Rust Outline Evidence Parser

`geordi-ir` now exports Rust DTOs, parse/load helpers, and
`validate_geordi_strict_text_outline_evidence_pack` for the same
`geordi-glyph-evidence-pack/1` `outlinePaths` shape. The Rust validator mirrors the TypeScript
first-profile checks and reports stable `GEORDI_TEXT_EVIDENCE_*` diagnostic code strings for invalid
metadata, font identity shape, glyph entries, bounds, paint, and command field shape.

The Rust parser is not a native text renderer and does not resolve fixture glyph coverage against a
font pack yet. Current nonclaims remain: no browser or native strict text renderer, no platform text
API compliance path, and no general text support.

## S056 Outline Command Validation

TypeScript and Rust outline evidence validators now enforce exact first-profile command field shape
and contour state. Drawing glyphs must open contours with `moveTo`, use segment commands only inside
an open contour, close every contour with `closePath`, and avoid command fields that are not allowed
for the command `op`. The shared failure fixture is
`fixtures/render-everywhere/strict-text/failures/bad-outline-command.outline-evidence.geordi.json`.

This still does not render text. Current nonclaims remain: no browser or native strict text renderer,
no platform text API compliance path, no glyph evidence coverage/linkage enforcement, and no general
text support.

## S057 Browser Outline Glyph Renderer

The browser harness now has a strict text outline renderer in
`examples/browser-render-everywhere/src/strictTextRender.ts`. It consumes parsed strict text fixture
DTOs plus parsed outline evidence DTOs, converts fixed 26.6 glyph-origin commands into Canvas path
calls, fills the path with the evidence `solidFill` paint, and reports renderer metadata. Tests prove
the renderer uses path APIs and does not call Canvas text APIs.

S058 adds the browser fixture loading mode; native renderer, coverage/linkage enforcement, platform
text API compliance, and general text support remain separate concerns.

## S058 Browser Text Fixture Mode

The browser harness now exposes `renderBrowserStrictTextFixture`, a fixture mode that fetches a
strict text fixture URL plus an outline evidence pack URL, parses both through the shared DTO
validators, rejects invalid evidence before drawing, and routes valid inputs through the browser
outline renderer. `strictTextAssets.ts` now names the canonical `GEORDI` fixture/evidence asset pair.

This is still not mounted in the browser UI. Current nonclaims remain: no browser text metadata
disclosure UI, no native strict text renderer, no glyph evidence coverage/linkage enforcement, no
platform text API compliance path, and no general text support.

## S059 Browser Text Metadata Disclosure

The browser harness now mounts a dedicated `Text` panel beside `Rectangles` and `Bunny`. Startup
loads the canonical strict text fixture, the canonical outline evidence pack, and the referenced
font-pack manifest; validates font references before drawing; renders the strict text canvas through
outline path geometry; and fills a collapsed `Text metadata` disclosure.

The metadata report exposes renderer name, fixture id/hash, font-pack path/hash, glyph-run hash,
line-box hash, evidence pack id/kind/hash, text profile, position encoding, glyph counts, command
count, and semantic-text fields. The semantic text report explicitly states
`semanticTextAffectsPixels=false` and labels semantic text as non-rendering metadata whose strings
do not determine pixels.

S060 adds visible text smoke assertions. Current nonclaims remain: no native strict text renderer,
no cross-runtime metadata equality gate, no platform text API compliance path, and no general text
support.

## S060 Browser Visible Text Smoke

The Playwright browser gate now switches to the `Text` panel, verifies exactly one strict text canvas
is visible, samples the full canvas, proves it has non-background pixels, records the nonblank pixel
bounds, and asserts those bounds stay within the declared canvas. The page installs browser-side
spies before app startup for `CanvasRenderingContext2D.fillText`, `strokeText`, `measureText`, and
`FontFace`; any call fails through `BrowserGateStrictTextSmokeError` with the recorded call list.

This is a coarse smoke only. S066 owns stable text probe policy and sample points, S069 owns
cross-runtime nonblank bounds policy, and S065 owns browser/native metadata equality. Current
nonclaims remain: no native strict text renderer, no browser/native parity claim, no platform text
API compliance path, and no general text support.

## S061 Native Outline Glyph Renderer

The Rust renderer crate now exposes `render_strict_text_outline_glyphs_to_image`, a native software
path that validates a strict text fixture and an outline evidence pack before drawing into the
existing `RenderedImage` RGBA8 buffer. The renderer converts fixed 26.6 glyph-origin outline
commands into flattened line segments, fills them with the evidence `solidFill` paint using nonzero
winding, and returns deterministic metadata for renderer name, fixture id, evidence id/kind, text
profile, glyph count, drawn glyph count, and consumed command count.

This is an API-level native proof, not the CLI mode or parity report. S062 owns native fixture CLI
mode, S063 owns native text metadata report expansion, S067 owns native coarse pixel probes, and S065
owns browser/native metadata equality. Current nonclaims remain: no full text antialiasing parity,
no platform text API compliance path, no host font lookup, and no general text support.

## S062 Native Text Fixture CLI Mode

The native render-everywhere harness now has a strict text offscreen mode:

~~~bash
cargo run -p native-render-everywhere -- --strict-text-smoke \
  fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json
~~~

The mode resolves strict text fixture paths inside `fixtures/render-everywhere/strict-text`, derives
the matching `.outline-evidence.geordi.json` pack by convention unless `--evidence` is supplied,
loads and validates the strict text fixture, font pack, font hashes, font references, and outline
evidence, renders through the Rust outline renderer, and prints a minimal summary without opening a
window. Escaping fixture paths and invalid outline evidence fail through custom native errors.

S063 owns the expanded metadata report needed for browser/native equality. S064 owns native visible
text smoke assertions. Current nonclaims remain: no full text antialiasing parity, no `geordi-ir/1`
text-node graduation, no platform text API compliance path, no host font lookup, and no general text
support.

## S063 Native Text Metadata Report

The native strict text smoke summary now emits the browser-aligned metadata fields: fixture hash,
font-pack path/hash, glyph-run hash, line-box hash, evidence pack id/kind/hash, text profile,
position encoding, renderer name, glyph counts, command count, and semantic text fields with
`semanticTextAffectsPixels=false` and the non-rendering semantic text role.

The native report reuses the Rust strict text receipt builder for fixture, font-pack, glyph-run, and
line-box hashes, and hashes the exact outline evidence bytes separately. This creates the metadata
surface S065 will compare against the browser report; it still does not claim visual parity.

S064 owns native visible text smoke assertions. Current nonclaims remain: no full text antialiasing
parity, no `geordi-ir/1` text-node graduation, no platform text API compliance path, no host font
lookup, and no general text support.

## S064 Native Visible Text Smoke

The native strict text smoke mode now fails unless the rendered offscreen buffer contains nonblank
text pixels. The smoke report records deterministic nonblank pixel count and coarse bounds for the
canonical `GEORDI` outline proof:

~~~text
nonblankPixels=2092
nonblankBounds=2,13..175,47
smoke=passed
~~~

The blank-output negative test mutates a valid outline evidence pack to non-drawing glyphs, renders
through the public strict text renderer, and verifies `NativeStrictTextSmokeError` rather than a
successful smoke claim.

S065 owns browser/native metadata equality. S067 owns stable native coarse probes, and S069 owns the
later cross-runtime nonblank bounds policy. Current nonclaims remain: no full text antialiasing
parity, no `geordi-ir/1` text-node graduation, no platform text API compliance path, no host font
lookup, and no general text support.

## S065 Browser/Native Metadata Equality

The browser Vitest harness now compares the browser strict text metadata report against the native
`--strict-text-smoke` CLI output for the canonical `GEORDI` fixture. The equality check covers
fixture id/hash, font-pack path/hash, glyph-run hash, line-box hash, evidence pack id/kind/hash,
text profile, position encoding, glyph counts, command count, and semantic text nonauthority fields.

Renderer names remain intentionally runtime-specific (`browser-canvas-outline-glyphs` versus
`rust-software-outline-glyphs`), and native nonblank smoke fields remain native smoke metadata. The
new root gate is:

~~~bash
pnpm test:render-everywhere:strict-text
~~~

S066 and S067 own browser/native coarse pixel probes. Current nonclaims remain: no full text
antialiasing parity, no `geordi-ir/1` text-node graduation, no platform text API compliance path, no
host font lookup, and no general text support.

## S066 Browser Coarse Pixel Probes

The Playwright browser text gate now samples explicit strict text probe points in the visible
`Text` canvas. The first browser probe set covers transparent background points and stable interior
fill points across the `GEORDI` glyphs. Fill probes require exact `[17, 24, 39, 255]`; transparent
probes require alpha `0`.

Probe failures throw `BrowserGateStrictTextProbeError` with fixture id, probe id, coordinates,
expected class, and actual RGBA. These probes are deliberately coarse browser evidence only; they do
not claim antialiasing parity with native.

S067 owns native coarse probes for the same proof family. Current nonclaims remain: no full text
antialiasing parity, no `geordi-ir/1` text-node graduation, no platform text API compliance path, no
host font lookup, and no general text support.

## S070 Missing Glyph Evidence Failure

Strict text rendering now rejects validly-shaped outline evidence that does not cover every
positioned glyph in the strict text fixture. The shared diagnostic code is
`GEORDI_TEXT_EVIDENCE_MISSING_GLYPH`, and the failure is exercised across TypeScript contract tests,
browser direct rendering, browser fixture mode, Rust IR validation, the Rust renderer, and native
`--strict-text-smoke`.

The failure fixture is:

~~~text
fixtures/render-everywhere/strict-text/failures/missing-glyph-evidence.outline-evidence.geordi.json
~~~

This closes the silent-skip risk for omitted glyph evidence. Current nonclaims remain: no full text
antialiasing parity, no `geordi-ir/1` text-node graduation, no platform text API compliance path, no
host font lookup, and no general text support.

## S071 Glyph Id Not Found Failure

Fixture-local strict text evidence now rejects extra glyph entries that are not referenced by the
fixture's positioned glyph runs. The shared diagnostic code is
`GEORDI_TEXT_EVIDENCE_UNKNOWN_GLYPH`, and the failure is covered in TypeScript contract tests,
browser direct rendering, browser fixture mode, Rust IR validation, the Rust renderer, and native
`--strict-text-smoke`.

The failure fixture is:

~~~text
fixtures/render-everywhere/strict-text/failures/unknown-glyph-evidence.outline-evidence.geordi.json
~~~

This preserves the current fixture-local minimal-pack contract. A future reusable evidence-pack
profile may allow extra glyph evidence only after it states that behavior explicitly.

## S072 Bad Line Box Failure

Strict text evidence now rejects drawing outline bounds that escape the glyph run's declared line
box after applying positioned glyph origins. The shared diagnostic code is
`GEORDI_TEXT_EVIDENCE_OUTSIDE_LINE_BOX`, and the failure is covered in TypeScript contract tests,
browser direct rendering, browser fixture mode, Rust IR validation, the Rust renderer, and native
`--strict-text-smoke`.

The failure fixture is:

~~~text
fixtures/render-everywhere/strict-text/failures/bad-line-box.strict-text.geordi.json
~~~

This keeps line boxes as explicit render contract data. Overflow remains unsupported unless a future
strict text profile names it directly.

## S073 Unsupported Text Fill/Stroke Failure

The first strict text rendering proof remains fill-only. Unsupported text paint now has committed
failure fixtures for both evidence-level paint (`paint.kind: "stroke"`) and fixture-level text paint
feature requests (`text.stroke`). TypeScript contract tests, browser fixture mode, Rust IR
validation, the Rust renderer, and native `--strict-text-smoke` reject those paths before drawing.

The failure fixtures are:

~~~text
fixtures/render-everywhere/strict-text/failures/unsupported-paint.outline-evidence.geordi.json
fixtures/render-everywhere/strict-text/failures/unsupported-text-paint.strict-text.geordi.json
~~~

Current nonclaims remain: no text stroke, gradients, opacity effects, multi-paint text, platform
text APIs, host font lookup, runtime shaping, or general text support.

## S074 Browser Text Demo Docs

The browser render-everywhere docs now describe the `Text` panel as a strict positioned glyph-run
proof, not as general text support. The documented path names the exact fixture, outline evidence,
probe policy, and font-pack assets consumed by the browser harness; the validation sequence before
drawing; the Canvas path-only rendering route; the expected metadata fields; and the browser gate's
text API spies for `fillText`, `strokeText`, `measureText`, and `FontFace`.

The higher-level render-everywhere and end-to-end docs now distinguish the strict text browser proof
from the rectangle `geordi-ir/1` proof and the bunny mesh sanity proof. Current nonclaims remain:
no CSS text, no platform-native text path, no host font fallback, no runtime shaping, no wrapping,
no bidi or complex scripts, no variable font axes, no full antialiasing parity, and no broad
`geordi-ir/1` `shape.text` support.

## S075 Native Text Demo Docs

The native render-everywhere docs now describe `--strict-text-smoke` as the Rust proof for
`geordi-strict-positioned-glyph-run/1`, not as OS text support. The documented path names the exact
strict text fixture, outline evidence, probe policy, and font-pack assets; explains fixture path
resolution and evidence override behavior; records the browser-aligned metadata fields; and lists
the hard failure families for escaping paths, unsupported features, missing or unknown evidence,
line-box escape, unsupported paint, blank output, probe mismatch, and nonblank-bounds escape.

The high-level README, render-everywhere guide, end-to-end guide, status signpost, and vision
signpost now describe strict text as a browser/native prepared-artifact proof with metadata and
coarse probes. Current nonclaims remain: no OS text APIs, no host font fallback, no runtime shaping,
no wrapping, no bidi or complex scripts, no variable font axes, no native strict text window mode,
no full antialiasing parity, and no broad `geordi-ir/1` `shape.text` support.

## S076 Shaping Implementation Decision

Shaping remains outside the compliant browser/native renderer path. The selected future boundary is
a pinned text-prep CLI that emits prepared strict text fixtures, line boxes, glyph evidence, and
receipts. TypeScript stays native for authoring helpers, browser/Node integration, fixture loading,
docs tooling, and simple validation; the shaping core should be Rust-native when implemented because
shaping is hard algorithmic behavior that should not be hand-mirrored across runtimes.

The decision keeps current fixtures on `shapingProfile: "precomputed-fixture/1"` until a Geordi-owned
generator exists. WASM is allowed only as an optional later exposure of a hard shaping/font/glyph
kernel after native text-prep, fingerprints, conformance fixtures, and generated outputs are stable.
Browser Canvas shaping, DOM/CSS text shaping, native OS text APIs, host font fallback, runtime
shaping, mandatory WASM validation, and unfingerprinted prep scripts are rejected compliance paths.

## S077 Shaping Profile Fingerprint Law

Generated strict text cannot claim Geordi-owned shaping provenance unless it carries a complete
`geordi-text-prep-shaping-fingerprint/1` record. The fingerprint must canonicalize profile identity,
generator identity, shaper identity, font identity, source identity, shaping inputs, geometry policy,
and output hashes. Required fields include the font pack hash, font file hash, face index, shaper
name/version/build/config hashes, script, language, direction, OpenType features, normalization
profile, variation axes, source text hash, glyph-run hash, line-box hash, glyph evidence hash, and
fixture hash.

The law also defines future stable diagnostic identities for missing fingerprints, unsupported
fingerprint profiles, missing required fields, malformed or mismatched hashes, unstable inputs, and
output mismatches. S077 does not implement a shaping engine, generator, or compliant shaped output;
it only defines the provenance contract later slices must satisfy.

## S078 Shaping Spike Outside Compliance Path

Any shaping experiment before the text-prep boundary is explicitly noncompliant. The spike profile is
`geordi-text-shaping-spike-noncompliant/1`, and spike outputs must declare
`compliance: "noncompliant-spike/1"` plus `mayFeedStrictRenderer: false`. Spike output must not use
the `*.strict-text.geordi.json` fixture family, populate compliant receipt shaping fields, replace
canonical fixtures, enter browser/native strict smoke gates, resolve host fonts, or hide fallback,
multiline, bidi, complex-script, or variable-axis behavior.

The law defines future diagnostics for spike artifacts that are supplied as strict fixtures, missing
noncompliance labels, or attempt host font lookup. S078 adds no spike code; it makes future spike
work safe by preventing exploratory shaping output from becoming an accidental renderer claim.

## S079 Compiler Text Preparation Boundary

Text preparation is a compiler/tooling boundary, not a renderer feature. The new
`geordi-text-prep-boundary/1` law allows source strings, font intent, language/script metadata, and
authoring conveniences to enter a text-prep tool, but browser/native renderers may receive only
prepared strict artifacts: positioned glyph runs, line boxes, font identity, glyph evidence,
fingerprint data, and receipts.

The boundary assigns source normalization, content-addressed font resolution, shaping, glyph-run
generation, deterministic line-box generation, evidence linkage, receipt provenance, and
explainability to text prep. Renderers own validation and evidence drawing only. Future diagnostics
cover host font lookup, fallback requirements, unsupported multiline, bidi/complex scripts,
variable axes, and missing shaping fingerprints.

## S080 Generated Shaped Output Schema

`fixtures/render-everywhere/strict-text/generated-shaped-output.schema.md` now defines
`geordi-text-prep-generated-output/1`, the future text-prep output bundle manifest. The schema binds
source hash, font identity, shaping fingerprint, generated strict fixture, glyph evidence pack,
receipt, and canonical glyph-run/line-box/fixture hashes into one reviewable unit.

The manifest is audit/comparison data, not a renderer input by itself. It must not contain renderer
names, `rendered=true`, `smoke=passed`, host font families, platform metrics, absolute paths,
wall-clock timestamps, or spike artifacts. S081 introduced the first command surface and
deterministic prep plan, S082 owns the first generated artifact, and S083 owns drift comparison.

## S081 Glyph-Run Generation CLI

`@flyingrobots/geordi-text-prep` now exposes the first pinned text-prep CLI surface:

~~~bash
geordi-text-prep prepare --input text-prep.input.geordi.json --output fixtures/render-everywhere/strict-text/generated
~~~

The command validates `geordi-text-prep-input/1` JSON and writes
`text-prep.generation-plan.geordi.json` as deterministic audit data. The plan records source hash,
content-addressed font identity, shaping fingerprint identity, first-profile geometry policy, and
output intent. It omits pixel-authoritative source text and declares `mayFeedStrictRenderer: false`
because generated strict fixtures, evidence packs, receipts, and generated output manifests remain
future slices.

The validator rejects host font lookup, fallback chains, multiline source, bidi or non-Latin
first-profile shaping, variable axes, non-repository-relative font/fingerprint paths, missing
shaping fingerprints, and source hash or normalization drift with stable `GEORDI_TEXT_PREP_*`
diagnostics.

Next OPEN node after this CLI: `S082`, generated fixture artifact.

## S082 Generated Fixture Artifact

The first generated strict text fixture artifacts now live under:

~~~text
fixtures/render-everywhere/strict-text/generated/
  README.md
  geordi.text-prep.input.geordi.json
  text-prep.generation-plan.geordi.json
  geordi.strict-text.geordi.json
~~~

`geordi-text-prep prepare` lowers pinned `preparedFixture.glyphRuns` and
`preparedFixture.lineBoxes` into a canonical `geordi-strict-text-fixture/1` file when
`output.strictTextFixtureFile` is present. The generated fixture uses
`render-everywhere:strict-text:generated-geordi`, keeps source text as nonauthoritative semantic
metadata, and validates through the existing strict text fixture contract.

This is not a real shaping-engine claim. The fixture is generated from explicit prepared glyph-run
and line-box input. Generated evidence, receipts, bundle manifests, and regeneration comparison
remain future slices.

Next OPEN node after this artifact: `S083`, generated artifact comparison.

## S083 Generated Artifact Comparison

Generated strict text artifacts now have a byte-for-byte regeneration gate:

~~~bash
pnpm test:render-everywhere:strict-text-generated
~~~

The gate runs `geordi-text-prep compare` against
`fixtures/render-everywhere/strict-text/generated/geordi.text-prep.input.geordi.json` and the
committed generated directory. The command regenerates the plan and strict fixture in memory, reads
the expected committed files, and fails with `GEORDI_TEXT_PREP_COMPARE_DRIFT` or
`GEORDI_TEXT_PREP_COMPARE_MISSING_ARTIFACT` when the committed bytes no longer match.

Next OPEN node after this comparison: `S084`, receipt shaping profile field.

## S084 Receipt Shaping Profile Field

Strict text fixture receipts now accept only these shaping profiles:

- `precomputed-fixture/1`;
- `geordi-text-prep-shaping-fingerprint/1`.

When a receipt uses the fingerprinted text-prep profile, `shapingFingerprintHash` is required and
must be a `sha256:` hash. When it uses `precomputed-fixture/1`, `shapingFingerprintHash` must be
absent. TypeScript validators and the Node receipt builder enforce the profile/hash coupling; Rust
receipt structs now carry optional `shaping_fingerprint_hash` and preserve `None` for existing
precomputed fixture receipts.

Next OPEN node after this receipt field: `S085`, receipt glyph-run checksum field.

## S085 Receipt Glyph-Run Checksum Field

The strict text receipt `glyphRunHash` field is now tested against the generated fixture path in
both TypeScript and Rust. The generated `GEORDI` fixture's canonical `glyphRuns` fragment hashes to:

~~~text
sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472
~~~

This proves the checksum is tied to positioned glyph-run evidence, not fixture id, source text, or
receipt metadata. S086 owns the matching line-box checksum hardening.

Next OPEN node after this checksum field: `S086`, receipt line-box checksum field.

## S086 Receipt Line-Box Checksum Field

The strict text receipt `lineBoxHash` field is now tested against the generated fixture path in both
TypeScript and Rust. The generated `GEORDI` fixture's canonical `lineBoxes` fragment hashes to:

~~~text
sha256:6d0b4e63bd04bd33e7213240a173f86fb478f23fa4cd505514c0b8af425f1e10
~~~

This proves generated fixture receipts pin line metrics and containment bounds separately from
glyph-run evidence. Source text, fixture id, and receipt metadata are not part of the line-box
checksum.

Next OPEN node after this checksum field: `S087`, no-fallback validator.

## S087 No-Fallback Validator

Text-prep input now requires `shaping.fallbackPolicy: "no-fallback/1"` and the generation plan
carries that policy forward for audit. Fallback-chain keys are rejected by presence under `font` or
`shaping`, including empty arrays:

~~~text
fallbackFonts
fallbackFontIds
fallbackChain
~~~

The generated text-prep input and generation plan were regenerated with the explicit no-fallback
policy. The generated strict text fixture bytes remain unchanged.

Next OPEN node after this validator: `S088`, fallback-chain rejection fixture.

## S088 Fallback-Chain Rejection Fixture

The committed text-prep failure fixture now lives at:

~~~text
fixtures/render-everywhere/strict-text/failures/fallback-chain.text-prep.input.geordi.json
~~~

It preserves the generated `GEORDI` source, font identity, geometry, and prepared fixture data while
adding a fallback font id, fallback chain, and `fallbackPolicy: "font-fallback-chain/1"`. The
text-prep test suite reads this fixture from disk and requires `GEORDI_TEXT_PREP_FALLBACK_REQUIRED`
on the fallback-chain paths.

Next OPEN node after this failure fixture: `S089`, multiline rejection fixture.

## S089 Multiline Rejection Fixture

The committed multiline text-prep failure fixture now lives at:

~~~text
fixtures/render-everywhere/strict-text/failures/multiline.text-prep.input.geordi.json
~~~

It pins the normalized UTF-8 source `GEORDI\nTEXT` and otherwise keeps first-profile font, geometry,
no-fallback shaping, and prepared fixture data valid. The text-prep test suite reads this fixture
from disk and requires `GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE` at `$.source.sourceText`.

Next OPEN node after this failure fixture: `S090`, bidi and complex-script rejection fixtures.

## S090 Bidi And Complex-Script Rejection Fixtures

The committed bidi and complex-script text-prep failure fixtures now live at:

~~~text
fixtures/render-everywhere/strict-text/failures/bidi-rtl.text-prep.input.geordi.json
fixtures/render-everywhere/strict-text/failures/complex-script.text-prep.input.geordi.json
~~~

`bidi-rtl` isolates `shaping.direction: "rtl"` on Latin source text.
`complex-script` isolates `shaping.script: "Arab"` with Arabic language metadata and escaped Arabic
source text. The text-prep test suite reads both fixtures from disk and requires
`GEORDI_TEXT_PREP_UNSUPPORTED_BIDI` on the relevant shaping path.

Next OPEN node after these failure fixtures: `S091`, variable-font-axis rejection fixture.

## S091 Variable-Font-Axis Rejection Fixture

The committed variable-axis text-prep failure fixture now lives at:

~~~text
fixtures/render-everywhere/strict-text/failures/variable-axis.text-prep.input.geordi.json
~~~

It isolates `variationAxes: ["wght=700"]` while keeping first-profile Latin source, no-fallback
shaping, font identity, and geometry valid. The text-prep test suite reads it from disk and requires
`GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES` at `$.shaping.variationAxes`.

Next OPEN node after this failure fixture: `S092`, measured line-box generation.

## S092 Measured Line-Box Generation

`@flyingrobots/geordi-text-prep` now exports `readTtfMetrics` and `measureFontLineBox`:

- `readTtfMetrics(bytes: Uint8Array)` parses the `head` and `hhea` tables of a TTF font file and
  returns `{ ascender, descender, unitsPerEm }` without font-parsing library dependencies.
- `measureFontLineBox(metrics, pxPerEm, totalAdvanceFixed, lineBoxId?)` converts those metrics into a
  `RenderFixtureStrictTextLineBox` with baseline and height derived from font metrics rather than
  precomputed literals.

Two policy constants name the new measurement approach:

- `FONT_ASCENT_DESCENT_BASELINE_POLICY = 'font-ascent-descent/1'`
- `SINGLE_LINE_FONT_BOUNDS_LINE_BOX_POLICY = 'single-line-font-bounds/1'`

For Lato Regular at `pxPerEm = 48` (geordi-fixed-26.6/1, scale 64):

- `unitsPerEm = 2000`
- `ascender = 1974` → `baselineY = round(1974 * 48/2000 * 64) = 3036`
- `descender = -426` → `height = round((1974 + 426) * 48/2000 * 64) = 3686`

The existing generated fixture retains its precomputed `lineBoxPolicy` and `baselinePolicy`; the
measurement engine does not retroactively alter committed artifacts.

Next OPEN node after this engine: `S093`, raw runtime text noncompliance docs.

## S093 Raw Runtime Text Noncompliance Docs

`docs/end-to-end.md` now contains an explicit noncompliance note for `text.raw-runtime-shaping`:

- `text.raw-runtime-shaping` is the current compiler-emitted baseline placeholder — it marks text
  that relies on platform-native shaping, host font metrics, and host line breaking at runtime.
- It is retained in `GEORDI_BASELINE_FEATURES` until the compiler can lower text to deterministic
  strict glyph runs; it will not be removed before that capability exists.
- A scene that requires `text.raw-runtime-shaping` is not compliant with
  `geordi-strict-positioned-glyph-run/1`.
- The strict text milestone proof does not go through `geordi-ir/1` text nodes; it uses a
  separate fixture and evidence model.

`docs/STATUS.md` now names `text.raw-runtime-shaping` explicitly in the nonclaims section.

Next OPEN node after these doc updates: `S094`, end-to-end text pipeline docs.

## S094 End-to-End Text Pipeline Docs

`docs/end-to-end.md` now has a "Strict Text Preparation Pipeline" section that documents:

- the full source → text-prep → strict fixture → browser/native renderer pipeline;
- a table of what is allowed and forbidden at each stage;
- `geordi-text-prep compare` as the regeneration drift gate;
- `readTtfMetrics` and `measureFontLineBox` as available utilities for the preparation pipeline;
- updated "current claims" list that names browser/native strict text rendering, parity,
  and text-prep artifacts.

Next OPEN node after this section: `S095`, render-everywhere text docs.

## DAG Operating Rule

To choose the next slice:

1. Read the DAG and this checklist.
2. A slice is OPEN when every parent in **Blocked By** is complete.
3. Pick an OPEN node, preferably the lowest-numbered OPEN node unless the user reprioritizes.
4. After completing a slice, mark its checklist item complete, update the DOT node status, regenerate the SVG, and commit both implementation and planning-state updates.
5. Do not mark a slice complete until acceptance criteria, tests, docs, and commit are done.

Regenerate the graph with:

~~~bash
dot -Tsvg docs/design/2026-05-strict-positioned-glyph-run-dag.dot \
  -o docs/design/2026-05-strict-positioned-glyph-run-dag.svg
~~~

Current OPEN node: **S095**.

![Strict positioned glyph-run DAG](docs/design/2026-05-strict-positioned-glyph-run-dag.svg)

## Slice Checklist And Dependency Ledger

### S001: Milestone law and nonclaims

- [x] **S001: Milestone law and nonclaims** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with milestone law and nonclaims documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Milestone law and nonclaims.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S002
- **Blocked By**: none

### S002: Profile name and feature vocabulary

- [x] **S002: Profile name and feature vocabulary** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with profile name and feature vocabulary documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Profile name and feature vocabulary.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S003
- **Blocked By**: S001

### S003: Source text versus render evidence law

- [x] **S003: Source text versus render evidence law** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with source text versus render evidence law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Source text versus render evidence law.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S004
- **Blocked By**: S002

### S004: Unsupported raw/platform text rejection law

- [x] **S004: Unsupported raw/platform text rejection law** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with unsupported raw/platform text rejection law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Unsupported raw/platform text rejection law.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S005
- **Blocked By**: S003

### S005: Font-local glyph identity law

- [x] **S005: Font-local glyph identity law** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with font-local glyph identity law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Font-local glyph identity law.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S006
- **Blocked By**: S004

### S006: Text coordinate and numeric law

- [x] **S006: Text coordinate and numeric law** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with text coordinate and numeric law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Text coordinate and numeric law.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S007
- **Blocked By**: S005

### S007: Line box and baseline law

- [x] **S007: Line box and baseline law** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with line box and baseline law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Line box and baseline law.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S008
- **Blocked By**: S006

### S008: Text receipt provenance law

- [x] **S008: Text receipt provenance law** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with text receipt provenance law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Text receipt provenance law.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S009
- **Blocked By**: S007

### S009: Glyph evidence ladder and evidence kinds

- [x] **S009: Glyph evidence ladder and evidence kinds** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with glyph evidence ladder and evidence kinds documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Glyph evidence ladder and evidence kinds.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S010
- **Blocked By**: S008

### S010: Initial fixture scope and nonclaims

- [x] **S010: Initial fixture scope and nonclaims** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with initial fixture scope and nonclaims documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Initial fixture scope and nonclaims.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S011
- **Blocked By**: S009

### S011: Slice DAG operating rule

- [x] **S011: Slice DAG operating rule** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with slice dag operating rule documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Slice DAG operating rule.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S012
- **Blocked By**: S010

### S012: Text compliance badge vocabulary

- [x] **S012: Text compliance badge vocabulary** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with text compliance badge vocabulary documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Text compliance badge vocabulary.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S013
- **Blocked By**: S011

### S013: Why this is not CSS text section

- [x] **S013: Why this is not CSS text section** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with why this is not css text section documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Why this is not CSS text section.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S014
- **Blocked By**: S012

### S014: Backlog and design index alignment

- [x] **S014: Backlog and design index alignment** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with backlog and design index alignment documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Backlog and design index alignment.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S015
- **Blocked By**: S013

### S015: Law checkpoint review gate

- [x] **S015: Law checkpoint review gate** (COMPLETE)
- **User Stories**: As a renderer implementer, I need unambiguous text laws before code exists so I can reject unsupported typography instead of guessing.
- **Acceptance Criteria**: The slice lands with law checkpoint review gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim. A checkpoint note states current claims, nonclaims, and next OPEN nodes.
- **Requirements**: No implementation surface may be added until the law names the profile, nonclaims, evidence, and failure semantics. Slice-specific requirement: Law checkpoint review gate.
- **Test Plan**: Goldens: Design excerpts, feature strings, profile names, and nonclaim examples stay stable in docs review. Known Fails: Raw runtime text, host font fallback, CSS line breaking, platform metrics, and broad text-support claims remain rejected. Edges: Ambiguous source strings, empty text evidence, missing profile names, and undocumented nonclaims are called out. Fuzz/Stress: Review generated examples for malformed profile strings, circular dependency claims, and inconsistent terminology.
- **API/CLI/MCP Surface**: API: feature/profile constants only when later implementation slices add them. CLI: none. MCP: agents read BEARING, design doc, DOT, and SVG through filesystem/search tools only.
- **Blocks**: S016, S031
- **Blocked By**: S014

### S016: Font license candidate review

- [x] **S016: Font license candidate review** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font license candidate review documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font license candidate review.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S017
- **Blocked By**: S015

### S017: Font asset directory contract

- [x] **S017: Font asset directory contract** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font asset directory contract documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font asset directory contract.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S018
- **Blocked By**: S016

### S018: First font asset selection

- [x] **S018: First font asset selection** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with first font asset selection documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: First font asset selection.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S019
- **Blocked By**: S017

### S019: Font manifest schema design

- [x] **S019: Font manifest schema design** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font manifest schema design documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font manifest schema design.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S020
- **Blocked By**: S018

### S020: Font fixture asset landing

- [x] **S020: Font fixture asset landing** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font fixture asset landing documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font fixture asset landing.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S021
- **Blocked By**: S019

### S021: Font hash manifest record

- [x] **S021: Font hash manifest record** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font hash manifest record documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font hash manifest record.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S022, S023
- **Blocked By**: S020

### S022: TypeScript font manifest type

- [x] **S022: TypeScript font manifest type** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with typescript font manifest type documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: TypeScript font manifest type.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S024
- **Blocked By**: S021

### S023: Rust font manifest type

- [x] **S023: Rust font manifest type** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with rust font manifest type documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Rust font manifest type.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S025
- **Blocked By**: S021

### S024: TypeScript font manifest parser

- [x] **S024: TypeScript font manifest parser** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with typescript font manifest parser documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: TypeScript font manifest parser.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S026
- **Blocked By**: S022

### S025: Rust font manifest parser

- [x] **S025: Rust font manifest parser** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with rust font manifest parser documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Rust font manifest parser.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S027
- **Blocked By**: S023

### S026: TypeScript font hash verifier

- [x] **S026: TypeScript font hash verifier** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with typescript font hash verifier documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: TypeScript font hash verifier.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S028
- **Blocked By**: S024

### S027: Rust font hash verifier

- [x] **S027: Rust font hash verifier** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with rust font hash verifier documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Rust font hash verifier.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S028
- **Blocked By**: S025

### S028: Font failure fixtures

- [x] **S028: Font failure fixtures** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font failure fixtures documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font failure fixtures.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S029
- **Blocked By**: S026, S027

### S029: Font asset docs and receipts

- [x] **S029: Font asset docs and receipts** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font asset docs and receipts documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font asset docs and receipts.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S030
- **Blocked By**: S028

### S030: Font asset checkpoint gate

- [x] **S030: Font asset checkpoint gate** (COMPLETE)
- **User Stories**: As a fixture author, I need fonts to be explicit content-addressed assets so every runtime sees the same bytes.
- **Acceptance Criteria**: The slice lands with font asset checkpoint gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim. A checkpoint note states current claims, nonclaims, and next OPEN nodes.
- **Requirements**: All font bytes and metadata must be fixture-local, content-addressed, license-recorded, and parsed through typed boundaries. Slice-specific requirement: Font asset checkpoint gate.
- **Test Plan**: Goldens: Font manifest JSON, hash receipts, license records, and fixture-local asset paths are canonical. Known Fails: Missing font, bad hash, unsupported format, disallowed license, absolute path, and host font lookup fail loudly. Edges: Face index, family/style metadata, weight/stretch bounds, duplicate ids, and path traversal are covered. Fuzz/Stress: Random manifest values, oversized metadata, malformed hashes, and repeated ids are rejected without ambient fallback.
- **API/CLI/MCP Surface**: API: render-fixture font manifest types/parsers. CLI: fixture validation and hash-report hooks. MCP: no public server; docs/DAG are the coordination surface.
- **Blocks**: S039
- **Blocked By**: S029

### S031: Positioned glyph-run schema design

- [x] **S031: Positioned glyph-run schema design** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with positioned glyph-run schema design documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Positioned glyph-run schema design.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S032, S033
- **Blocked By**: S015

### S032: TypeScript glyph-run type

- [x] **S032: TypeScript glyph-run type** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with typescript glyph-run type documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: TypeScript glyph-run type.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S034
- **Blocked By**: S031

### S033: Rust glyph-run type

- [x] **S033: Rust glyph-run type** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with rust glyph-run type documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Rust glyph-run type.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S035
- **Blocked By**: S031

### S034: TypeScript glyph-run parser

- [x] **S034: TypeScript glyph-run parser** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with typescript glyph-run parser documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: TypeScript glyph-run parser.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S036
- **Blocked By**: S032

### S035: Rust glyph-run parser

- [x] **S035: Rust glyph-run parser** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with rust glyph-run parser documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Rust glyph-run parser.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S036
- **Blocked By**: S033

### S036: Glyph id validation

- [x] **S036: Glyph id validation** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with glyph id validation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Glyph id validation.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S037
- **Blocked By**: S034, S035

### S037: Glyph position validation

- [x] **S037: Glyph position validation** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with glyph position validation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Glyph position validation.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S038
- **Blocked By**: S036

### S038: Advance and offset validation

- [x] **S038: Advance and offset validation** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with advance and offset validation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Advance and offset validation.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S039
- **Blocked By**: S037

### S039: Font reference resolution validation

- [x] **S039: Font reference resolution validation** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with font reference resolution validation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Font reference resolution validation.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S040
- **Blocked By**: S038, S030

### S040: Line box validation

- [x] **S040: Line box validation** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with line box validation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Line box validation.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S041
- **Blocked By**: S039

### S041: Canonical strict text fixture A

- [x] **S041: Canonical strict text fixture A** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with canonical strict text fixture a documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Canonical strict text fixture A.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S042, S053
- **Blocked By**: S040

### S042: Canonical strict text fixture B

- [x] **S042: Canonical strict text fixture B** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with canonical strict text fixture b documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Canonical strict text fixture B.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S043
- **Blocked By**: S041

### S043: Canonical JSON normalization test

- [x] **S043: Canonical JSON normalization test** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with canonical json normalization test documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Canonical JSON normalization test.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S044
- **Blocked By**: S042

### S044: Text fixture receipt design

- [x] **S044: Text fixture receipt design** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with text fixture receipt design documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Text fixture receipt design.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S045, S046
- **Blocked By**: S043

### S045: TypeScript text fixture receipt

- [x] **S045: TypeScript text fixture receipt** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with typescript text fixture receipt documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: TypeScript text fixture receipt.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S047
- **Blocked By**: S044

### S046: Rust text fixture receipt/report

- [x] **S046: Rust text fixture receipt/report** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with rust text fixture receipt/report documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Rust text fixture receipt/report.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S047
- **Blocked By**: S044

### S047: Unsupported strict text fixture

- [x] **S047: Unsupported strict text fixture** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with unsupported strict text fixture documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Unsupported strict text fixture.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S048, S049
- **Blocked By**: S045, S046

### S048: Browser strict text rejection

- [x] **S048: Browser strict text rejection** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with browser strict text rejection documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Browser strict text rejection.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S050
- **Blocked By**: S047

### S049: Native strict text rejection

- [x] **S049: Native strict text rejection** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with native strict text rejection documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Native strict text rejection.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S050
- **Blocked By**: S047

### S050: Glyph-run checkpoint gate

- [x] **S050: Glyph-run checkpoint gate** (COMPLETE)
- **User Stories**: As a compiler/runtime boundary owner, I need positioned glyph evidence to be validated before rendering so strings never determine pixels in strict mode.
- **Acceptance Criteria**: The slice lands with glyph-run checkpoint gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim. A checkpoint note states current claims, nonclaims, and next OPEN nodes.
- **Requirements**: All positioned glyph-run data must be schema-validated, finite, font-local, and detached from source strings as pixel authority. Slice-specific requirement: Glyph-run checkpoint gate.
- **Test Plan**: Goldens: Glyph-run fixture JSON, line box JSON, receipt fragments, and parser diagnostics stay stable. Known Fails: Unresolved font refs, missing line boxes, missing glyph evidence, unsafe glyph ids, and invalid positions fail loudly. Edges: Zero glyphs, spaces, descenders, repeated glyphs, baseline extremes, fixed-point bounds, and checksum mismatch are covered. Fuzz/Stress: Random glyph ids, finite-number abuse, huge glyph arrays, shuffled keys, and malformed evidence packs are rejected deterministically.
- **API/CLI/MCP Surface**: API: positioned glyph-run, line-box, and glyph-evidence types/parsers. CLI: fixture validation and explanation hooks. MCP: no runtime protocol change.
- **Blocks**: S051
- **Blocked By**: S048, S049

### S051: Rendering evidence strategy decision

- [x] **S051: Rendering evidence strategy decision** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with rendering evidence strategy decision documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Rendering evidence strategy decision.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S052
- **Blocked By**: S050

### S052: Outline evidence pack schema

- [x] **S052: Outline evidence pack schema** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with outline evidence pack schema documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Outline evidence pack schema.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S053
- **Blocked By**: S051

### S053: Outline evidence fixture data

- [x] **S053: Outline evidence fixture data** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with outline evidence fixture data documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Outline evidence fixture data.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S054, S055
- **Blocked By**: S052, S041

### S054: TypeScript outline evidence parser

- [x] **S054: TypeScript outline evidence parser** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with typescript outline evidence parser documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: TypeScript outline evidence parser.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S056
- **Blocked By**: S053

### S055: Rust outline evidence parser

- [x] **S055: Rust outline evidence parser** (COMPLETE)
- **User Stories**: As a native runtime user, I need the Rust path to consume the same evidence and report the same metadata so native is an independent proof.
- **Acceptance Criteria**: The slice lands with rust outline evidence parser documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Native rendering must consume the same fixture/evidence model and use custom error types for every failure. Slice-specific requirement: Rust outline evidence parser.
- **Test Plan**: Goldens: Native CLI summary, offscreen output, fixture metadata, and selected probe reports remain stable. Known Fails: Missing font/evidence, unsupported profile, bad outline command, fallback request, and hash mismatch fail loudly. Edges: Small image buffer, clipped glyph bounds, negative baseline rejection, and explicit no-window smoke mode are covered. Fuzz/Stress: Stress outline path command counts, glyph count, malformed fixture inputs, and repeated native smoke runs.
- **API/CLI/MCP Surface**: API: Rust fixture structs/parsers/render mode. CLI: native harness text smoke arguments. MCP: no protocol change.
- **Blocks**: S056
- **Blocked By**: S053

### S056: Outline command validation

- [x] **S056: Outline command validation** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with outline command validation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Outline command validation.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S057, S061, S070
- **Blocked By**: S054, S055

### S057: Browser outline glyph renderer

- [x] **S057: Browser outline glyph renderer** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with browser outline glyph renderer documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Browser outline glyph renderer.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S058
- **Blocked By**: S056

### S058: Browser text fixture mode

- [x] **S058: Browser text fixture mode** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with browser text fixture mode documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Browser text fixture mode.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S059
- **Blocked By**: S057

### S059: Browser text metadata disclosure

- [x] **S059: Browser text metadata disclosure** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with browser text metadata disclosure documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Browser text metadata disclosure.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S060
- **Blocked By**: S058

### S060: Browser visible text smoke

- [x] **S060: Browser visible text smoke** (COMPLETE)
- **User Stories**: As a browser demo user, I need strict text to render from evidence without platform text APIs so browser output demonstrates the Geordi contract.
- **Acceptance Criteria**: The slice lands with browser visible text smoke documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Browser rendering must consume positioned glyph evidence and never call platform text APIs in the strict path. Slice-specific requirement: Browser visible text smoke.
- **Test Plan**: Goldens: Browser report text, fixture metadata, first-frame screenshots, and probe fixtures remain stable. Known Fails: Unsupported profile, missing evidence, runtime shaping request, fallback request, and canvas/context failure fail loudly. Edges: High DPI canvas, dark/light shell, clipped glyph bounds, space glyphs, and no-antialias debug mode are exercised. Fuzz/Stress: Stress glyph count, degenerate outlines, malformed commands, and repeated browser fixture reloads without state leakage.
- **API/CLI/MCP Surface**: API: browser harness fixture loader/render mode. CLI: pnpm browser test scripts. MCP: no protocol change; status is visible through docs and test output.
- **Blocks**: S065, S074
- **Blocked By**: S059

### S061: Native outline glyph renderer

- [x] **S061: Native outline glyph renderer** (COMPLETE)
- **User Stories**: As a native runtime user, I need the Rust path to consume the same evidence and report the same metadata so native is an independent proof.
- **Acceptance Criteria**: The slice lands with native outline glyph renderer documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Native rendering must consume the same fixture/evidence model and use custom error types for every failure. Slice-specific requirement: Native outline glyph renderer.
- **Test Plan**: Goldens: Native CLI summary, offscreen output, fixture metadata, and selected probe reports remain stable. Known Fails: Missing font/evidence, unsupported profile, bad outline command, fallback request, and hash mismatch fail loudly. Edges: Small image buffer, clipped glyph bounds, negative baseline rejection, and explicit no-window smoke mode are covered. Fuzz/Stress: Stress outline path command counts, glyph count, malformed fixture inputs, and repeated native smoke runs.
- **API/CLI/MCP Surface**: API: Rust fixture structs/parsers/render mode. CLI: native harness text smoke arguments. MCP: no protocol change.
- **Blocks**: S062
- **Blocked By**: S056

### S062: Native text fixture CLI mode

- [x] **S062: Native text fixture CLI mode** (COMPLETE)
- **User Stories**: As a native runtime user, I need the Rust path to consume the same evidence and report the same metadata so native is an independent proof.
- **Acceptance Criteria**: The slice lands with native text fixture cli mode documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Native rendering must consume the same fixture/evidence model and use custom error types for every failure. Slice-specific requirement: Native text fixture CLI mode.
- **Test Plan**: Goldens: Native CLI summary, offscreen output, fixture metadata, and selected probe reports remain stable. Known Fails: Missing font/evidence, unsupported profile, bad outline command, fallback request, and hash mismatch fail loudly. Edges: Small image buffer, clipped glyph bounds, negative baseline rejection, and explicit no-window smoke mode are covered. Fuzz/Stress: Stress outline path command counts, glyph count, malformed fixture inputs, and repeated native smoke runs.
- **API/CLI/MCP Surface**: API: Rust fixture structs/parsers/render mode. CLI: native harness text smoke arguments. MCP: no protocol change.
- **Blocks**: S063
- **Blocked By**: S061

### S063: Native text metadata report

- [x] **S063: Native text metadata report** (COMPLETE)
- **User Stories**: As a native runtime user, I need the Rust path to consume the same evidence and report the same metadata so native is an independent proof.
- **Acceptance Criteria**: The slice lands with native text metadata report documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Native rendering must consume the same fixture/evidence model and use custom error types for every failure. Slice-specific requirement: Native text metadata report.
- **Test Plan**: Goldens: Native CLI summary, offscreen output, fixture metadata, and selected probe reports remain stable. Known Fails: Missing font/evidence, unsupported profile, bad outline command, fallback request, and hash mismatch fail loudly. Edges: Small image buffer, clipped glyph bounds, negative baseline rejection, and explicit no-window smoke mode are covered. Fuzz/Stress: Stress outline path command counts, glyph count, malformed fixture inputs, and repeated native smoke runs.
- **API/CLI/MCP Surface**: API: Rust fixture structs/parsers/render mode. CLI: native harness text smoke arguments. MCP: no protocol change.
- **Blocks**: S064
- **Blocked By**: S062

### S064: Native visible text smoke

- [x] **S064: Native visible text smoke** (COMPLETE)
- **User Stories**: As a native runtime user, I need the Rust path to consume the same evidence and report the same metadata so native is an independent proof.
- **Acceptance Criteria**: The slice lands with native visible text smoke documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Native rendering must consume the same fixture/evidence model and use custom error types for every failure. Slice-specific requirement: Native visible text smoke.
- **Test Plan**: Goldens: Native CLI summary, offscreen output, fixture metadata, and selected probe reports remain stable. Known Fails: Missing font/evidence, unsupported profile, bad outline command, fallback request, and hash mismatch fail loudly. Edges: Small image buffer, clipped glyph bounds, negative baseline rejection, and explicit no-window smoke mode are covered. Fuzz/Stress: Stress outline path command counts, glyph count, malformed fixture inputs, and repeated native smoke runs.
- **API/CLI/MCP Surface**: API: Rust fixture structs/parsers/render mode. CLI: native harness text smoke arguments. MCP: no protocol change.
- **Blocks**: S065, S075
- **Blocked By**: S063

### S065: Browser/native metadata equality

- [x] **S065: Browser/native metadata equality** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with browser/native metadata equality documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Browser/native metadata equality.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S066, S067
- **Blocked By**: S060, S064

### S066: Browser coarse pixel probes

- [x] **S066: Browser coarse pixel probes** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with browser coarse pixel probes documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Browser coarse pixel probes.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S068
- **Blocked By**: S065

### S067: Native coarse pixel probes

- [x] **S067: Native coarse pixel probes** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with native coarse pixel probes documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Native coarse pixel probes.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S068
- **Blocked By**: S065

### S068: Stable text probe policy

- [x] **S068: Stable text probe policy** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with stable text probe policy documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Stable text probe policy.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S069
- **Blocked By**: S066, S067

### S069: Nonblank text bounds check

- [x] **S069: Nonblank text bounds check** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with nonblank text bounds check documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Nonblank text bounds check.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: none
- **Blocked By**: S068

### S070: Missing glyph evidence failure

- [x] **S070: Missing glyph evidence failure** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with missing glyph evidence failure documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Missing glyph evidence failure.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S071
- **Blocked By**: S056

### S071: Glyph id not found failure

- [x] **S071: Glyph id not found failure** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with glyph id not found failure documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Glyph id not found failure.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S072
- **Blocked By**: S070

### S072: Bad line box failure

- [x] **S072: Bad line box failure** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with bad line box failure documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Bad line box failure.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: S073
- **Blocked By**: S071

### S073: Unsupported text fill/stroke failure

- [x] **S073: Unsupported text fill/stroke failure** (COMPLETE)
- **User Stories**: As a release reviewer, I need exact metadata equality and modest visual probes so the claim boundary is measurable and honest.
- **Acceptance Criteria**: The slice lands with unsupported text fill/stroke failure documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Parity checks must compare metadata exactly and visual probes modestly without overclaiming antialiasing identity. Slice-specific requirement: Unsupported text fill/stroke failure.
- **Test Plan**: Goldens: Browser/native metadata equality report, probe report, and receipt fields remain stable. Known Fails: Mismatched font hash, glyph count, line box, baseline, evidence hash, or unsupported runtime capability fails loudly. Edges: Probe points on fills, holes, bounds edges, empty regions, and dark/light backgrounds are covered. Fuzz/Stress: Stress fixture ordering, canonical JSON stability, repeated parity runs, and near-boundary probe coordinates.
- **API/CLI/MCP Surface**: API: shared metadata report shape. CLI: browser/native parity smoke scripts. MCP: no protocol change; machine-readable reports are local artifacts.
- **Blocks**: none
- **Blocked By**: S072

### S074: Browser text demo docs

- [x] **S074: Browser text demo docs** (COMPLETE)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with browser text demo docs documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: Browser text demo docs.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: none
- **Blocked By**: S060

### S075: Native text demo docs

- [x] **S075: Native text demo docs** (COMPLETE)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with native text demo docs documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim. A checkpoint note states current claims, nonclaims, and next OPEN nodes.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: Native text demo docs.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S076
- **Blocked By**: S064

### S076: Shaping implementation decision

- [x] **S076: Shaping implementation decision** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with shaping implementation decision documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Shaping implementation decision.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S077
- **Blocked By**: S075

### S077: Shaping profile fingerprint law

- [x] **S077: Shaping profile fingerprint law** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with shaping profile fingerprint law documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Shaping profile fingerprint law.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S078
- **Blocked By**: S076

### S078: Shaping spike outside compliance path

- [x] **S078: Shaping spike outside compliance path** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with shaping spike outside compliance path documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Shaping spike outside compliance path.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S079
- **Blocked By**: S077

### S079: Compiler text preparation boundary

- [x] **S079: Compiler text preparation boundary** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with compiler text preparation boundary documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Compiler text preparation boundary.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S080
- **Blocked By**: S078

### S080: Generated shaped output schema

- [x] **S080: Generated shaped output schema** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with generated shaped output schema documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Generated shaped output schema.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S081
- **Blocked By**: S079

### S081: Glyph-run generation CLI

- [x] **S081: Glyph-run generation CLI** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with glyph-run generation cli documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Glyph-run generation CLI.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S082
- **Blocked By**: S080

### S082: Generated fixture artifact

- [x] **S082: Generated fixture artifact** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with generated fixture artifact documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Generated fixture artifact.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S083
- **Blocked By**: S081

### S083: Generated artifact comparison

- [x] **S083: Generated artifact comparison** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with generated artifact comparison documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Generated artifact comparison.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S084
- **Blocked By**: S082

### S084: Receipt shaping profile field

- [x] **S084: Receipt shaping profile field** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with receipt shaping profile field documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Receipt shaping profile field.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S085
- **Blocked By**: S083

### S085: Receipt glyph-run checksum field

- [x] **S085: Receipt glyph-run checksum field** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with receipt glyph-run checksum field documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Receipt glyph-run checksum field.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S086
- **Blocked By**: S084

### S086: Receipt line-box checksum field

- [x] **S086: Receipt line-box checksum field** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with receipt line-box checksum field documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Receipt line-box checksum field.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S087
- **Blocked By**: S085

### S087: No-fallback validator

- [x] **S087: No-fallback validator** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with no-fallback validator documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: No-fallback validator.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S088
- **Blocked By**: S086

### S088: Fallback-chain rejection fixture

- [x] **S088: Fallback-chain rejection fixture** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with fallback-chain rejection fixture documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Fallback-chain rejection fixture.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S089
- **Blocked By**: S087

### S089: Multiline rejection fixture

- [x] **S089: Multiline rejection fixture** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with multiline rejection fixture documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Multiline rejection fixture.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S090
- **Blocked By**: S088

### S090: Bidi and complex-script rejection fixtures

- [x] **S090: Bidi and complex-script rejection fixtures** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with bidi and complex-script rejection fixtures documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Bidi and complex-script rejection fixtures.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S091
- **Blocked By**: S089

### S091: Variable-font-axis rejection fixture

- [x] **S091: Variable-font-axis rejection fixture** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with variable-font-axis rejection fixture documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Variable-font-axis rejection fixture.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S092
- **Blocked By**: S090

### S092: Measured line-box generation

- [x] **S092: Measured line-box generation** (COMPLETE)
- **User Stories**: As a compiler author, I need shaping to enter only after receivers are strict so generated text artifacts are explainable and reproducible.
- **Acceptance Criteria**: The slice lands with measured line-box generation documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Shaping must be introduced only after receivers are strict, and every shaper input/output must be fingerprinted. Slice-specific requirement: Measured line-box generation.
- **Test Plan**: Goldens: Generated glyph-run artifact, shaping provenance, and receipt hashes stay stable. Known Fails: Unfingerprinted shaper, fallback, multiline, bidi, complex script, variable axes, and host shaping fail loudly. Edges: Normalization form, feature toggles, language/script/direction metadata, and face index are explicit. Fuzz/Stress: Stress random source strings within supported subset, shaper input hashes, and generated fixture comparison.
- **API/CLI/MCP Surface**: API: text-prep/shaping boundary and receipt fields. CLI: glyph-run generation/explain command. MCP: optional future read-only reporting only after local CLI exists.
- **Blocks**: S093
- **Blocked By**: S091

### S093: Raw runtime text noncompliance docs

- [x] **S093: Raw runtime text noncompliance docs** (COMPLETE)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with raw runtime text noncompliance docs documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: Raw runtime text noncompliance docs.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S094
- **Blocked By**: S092

### S094: End-to-end text pipeline docs

- [x] **S094: End-to-end text pipeline docs** (COMPLETE)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with end-to-end text pipeline docs documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: End-to-end text pipeline docs.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S095
- **Blocked By**: S093

### S095: Render-everywhere text docs

- [ ] **S095: Render-everywhere text docs** (OPEN)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with render-everywhere text docs documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: Render-everywhere text docs.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S096
- **Blocked By**: S094

### S096: README strict text status gate

- [ ] **S096: README strict text status gate** (BLOCKED)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with readme strict text status gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: README strict text status gate.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S097
- **Blocked By**: S095

### S097: CI text fixture validation gate

- [ ] **S097: CI text fixture validation gate** (BLOCKED)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with ci text fixture validation gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: CI text fixture validation gate.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S098
- **Blocked By**: S096

### S098: CI browser text smoke gate

- [ ] **S098: CI browser text smoke gate** (BLOCKED)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with ci browser text smoke gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: CI browser text smoke gate.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S099
- **Blocked By**: S097

### S099: CI native text smoke gate

- [ ] **S099: CI native text smoke gate** (BLOCKED)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with ci native text smoke gate documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: CI native text smoke gate.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: S100
- **Blocked By**: S098

### S100: Final drift and claim audit

- [ ] **S100: Final drift and claim audit** (BLOCKED)
- **User Stories**: As a contributor, I need the public docs, DAG, and gates to agree so the next slice can be chosen mechanically.
- **Acceptance Criteria**: The slice lands with final drift and claim audit documented or implemented, custom failure vocabulary where applicable, and no broadened text-support claim. A checkpoint note states current claims, nonclaims, and next OPEN nodes.
- **Requirements**: Public docs must advertise only completed claims and preserve explicit nonclaims for unsupported typography. Slice-specific requirement: Final drift and claim audit.
- **Test Plan**: Goldens: README, render-everywhere docs, end-to-end diagrams, BEARING, checklist, DOT, and SVG agree. Known Fails: Any broad text-support claim, stale open-node status, missing DAG update, or missing nonclaim fails review. Edges: Historical bunny references, raw text wording, and text evidence ladder wording remain precise. Fuzz/Stress: Run docs checks and search for banned broad claims, stale slice status, and inconsistent profile names.
- **API/CLI/MCP Surface**: API: none unless status constants are implemented. CLI: docs tests and graphviz regeneration command. MCP: agents use the BEARING open-node rule.
- **Blocks**: none
- **Blocked By**: S099


## Full Gate

The final checkpoint should run the full repo gate:

~~~bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:docs
pnpm test:package-names
pnpm test:repo-sludge
pnpm test:placeholders
pnpm test:exports
git diff --check
cargo fmt --check
cargo test
cargo clippy --workspace --all-targets -- -D warnings
~~~

Text-specific gates become mandatory as their slices add them.
