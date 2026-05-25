# Glyph Tooling Spike

**Status**: Proposed
**Date**: 2026-05-25
**Related milestone**: `geordi-strict-positioned-glyph-run/1`
**Planning budget**: two free planning slices plus a 15-slice implementation spike

This document proposes user-facing glyph tooling for Geordi. The goal is not to become a font
editor. The goal is to make strict text artifacts understandable, inspectable, importable,
previewable, and debuggable by humans.

Strict Geordi text turns platform text into evidence:

~~~text
font pack + positioned glyph runs + line boxes + glyph evidence + receipts
~~~

That model is correct but harsh. Users will need tools that explain what was imported, what glyphs
exist, what the renderer will draw, why validation failed, and how browser/native outputs relate.

## Free Slice 1: Market Brainstorm

This slice looked across design tools, font editors, game engines, browser tooling, and text
pipeline tools. The strongest lesson is that mature tools expose typography at several layers:
author intent, font metadata, glyph inventory, OpenType behavior, atlas/evidence output, and visual
preview.

| Tool Family | Examples | Font-Related Tooling | Lesson For Geordi |
| --- | --- | --- | --- |
| Design tools | Figma, Adobe Illustrator | Typography panels, variable font controls, text property inspection, OpenType feature controls, glyph/alternate insertion. | Designers expect live previews, selected-text inspection, feature toggles, and a visible link between what they picked and what appears. |
| Font editors | Glyphs, FontLab, RoboFont, FontForge | Glyph grids, outline editors, masters/variation axes, OpenType feature authoring, validation, export, scripting, extension ecosystems. | Geordi should not duplicate full font editing, but it should borrow glyph grids, validation surfacing, outline previews, and scriptable workflows. |
| Game engines | Unity TextMesh Pro, Unreal Font Editor | Imported font assets, font face assets, atlas generation, SDF/MSDF workflows, fallback/composite font models, runtime/offline caching modes. | Real-time renderers treat fonts as assets, not ambient system state. Geordi should make font packs and glyph evidence feel like first-class project assets. |
| Browser/dev tools | Chrome DevTools | Rendered-font inspection, local-font disabling, rendering diagnostics, layout/debug overlays. | Debuggers should answer “what did this actually use?” and “what changed?” without asking the user to infer from pixels. |
| Text pipeline libraries | HarfBuzz, fontTools, msdfgen | Shaping outputs glyph IDs/positions, subsetting optimizes font contents, SDF/MSDF tools generate renderable glyph evidence. | Geordi tooling should wrap deterministic pipeline steps with receipts, not hide them behind convenience UI. |

Research notes and source anchors:

- Figma exposes text properties, Dev Mode inspection, and variable font controls in its typography
  UI.
  Sources: [Figma text properties](https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties),
  [Figma Dev Mode inspection](https://help.figma.com/hc/en-us/articles/22012921621015-Guide-).
- Adobe Illustrator exposes OpenType controls and glyph inspection/insertion through Type panels.
  Sources: [Illustrator OpenType panel](https://helpx.adobe.com/uk/illustrator/desktop/design-with-text/special-characters-glyphs/opentype-panel-overview.html),
  [Adobe OpenType overview](https://www.adobe.com/uk/products/type/opentype.html).
- Glyphs and FontLab emphasize full font production: glyph editing, OpenType feature generation,
  export, variable fonts, and testing.
  Sources: [Glyphs features](https://glyphsapp.com/features),
  [FontLab 8](https://www.fontlab.com/font-editor/fontlab-studio/).
- RoboFont and FontForge show the value of scriptability, open formats, lookups, validation, and
  advanced inspection.
  Sources: [RoboFont scripting](https://doc.robofont.com/documentation/topics/scripting-environment),
  [RoboFont generating fonts](https://www.robofont.com/documentation/tutorials/generating-fonts/),
  [FontForge lookups](https://fontforge.org/docs/ui/dialogs/lookups.html),
  [FontForge validation](https://fontforge.org/docs/ui/dialogs/validation.html).
- Unity and Unreal treat text rendering as an asset pipeline with font assets, face assets, atlas
  generation, and caching modes.
  Sources: [TextMesh Pro font assets](https://docs.unity.cn/Packages/com.unity.textmeshpro%402.2/manual/FontAssets.html),
  [TextMesh Pro SDF fonts](https://docs.unity.cn/Packages/com.unity.textmeshpro%404.0/manual/FontAssetsSDF.html),
  [Unreal Font Asset and Editor](https://dev.epicgames.com/documentation/unreal-engine/font-asset-and-editor-in-unreal-engine?lang=en-US).
- HarfBuzz, fontTools, and msdfgen map well to Geordi’s evidence contract: shaping gives glyph
  IDs/positions, subsetting controls font contents, and SDF/MSDF/outline tools produce renderable
  evidence.
  Sources: [HarfBuzz shaping](https://harfbuzz.github.io/shaping-and-shape-plans.html),
  [fontTools subset](https://fonttools.readthedocs.io/en/stable/subset/index.html),
  [msdfgen](https://github.com/Chlumsky/msdfgen).
- Chrome DevTools is a useful model for final-output inspection: it reports actual rendered fonts
  and includes rendering diagnostics.
  Sources: [Chrome rendered font inspection](https://developer.chrome.com/blog/devtools-answers-what-font-is-that),
  [Chrome Rendering tab](https://developer.chrome.com/docs/devtools/rendering).

## Free Slice 2: Proposal

Build a small Geordi Glyph Workbench and matching CLI/API surfaces that make strict text evidence
visible. The spike should prove four workflows:

1. Import a font into a verified Geordi font pack.
2. Inspect glyph inventory and font metadata.
3. Preview a strict text fixture with overlays.
4. Diagnose validation and parity failures without reading raw JSON by hand.

The workbench should treat the existing contract as the source of truth. It must not silently shape,
fallback, or use platform font APIs as a compliant path. Any “demo convenience” behavior must be
visibly labeled noncompliant.

## Product Shape

The first user-facing tool should be a local developer workbench:

~~~text
packages/glyph-tools/           CLI and shared application services
examples/glyph-workbench/       browser UI using the shared services
fixtures/render-everywhere/     font packs, strict text fixtures, receipts, failure fixtures
~~~

The workbench starts as a repo-local tool, not a published app. It can later become a GPVue-facing
debugger or an MCP-backed design assistant.

## North-Star Workflows

### Import

A user selects a font file and license file. The tool validates paths, hashes bytes, records
metadata, and proposes a `geordi-font-pack/1` manifest update.

Important UI:

- font file picker or path input;
- license file picker or path input;
- hash preview;
- face index preview;
- format support badge;
- redistribution/license warning;
- generated manifest diff.

CLI shape:

~~~bash
pnpm geordi-glyph font import \
  --font fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf \
  --license fixtures/render-everywhere/assets/fonts/lato/OFL.txt \
  --id lato-regular \
  --out fixtures/render-everywhere/assets/fonts/font-pack.geordi.json
~~~

### Inspect

A user opens a font pack and sees what Geordi knows:

- font id;
- file hash;
- face index;
- family/style/weight;
- license status;
- glyph count;
- cmap coverage;
- glyph id lookup;
- rough outline/bounds preview when outline extraction exists;
- feature/axis metadata later.

This is the “what is actually in my artifact?” view.

### Preview

A user opens a strict text fixture and sees the exact positioned glyph-run layout:

- glyph boxes;
- line boxes;
- baselines;
- glyph IDs;
- advances;
- offsets;
- font id labels;
- fixed-point to px conversion;
- noncompliant semantic text clearly separated from render evidence.

This is the “what will the renderer consume?” view.

### Debug

A user opens a failure fixture or invalid artifact and gets a navigable report:

- error class;
- JSON path;
- human explanation;
- blocked capability;
- expected vs actual hash;
- linked artifact;
- suggested next command.

This is the “why did Geordi refuse to draw?” view.

### Compare

Later in the spike, a user loads browser/native receipts and compares:

- profile match;
- font pack hash match;
- glyph-run hash match;
- line-box hash match;
- evidence hash match;
- probe results;
- screenshot or canvas overlay when available.

This is the “did both runtimes consume the same evidence?” view.

## Tool Architecture

~~~mermaid
flowchart TD
  FontFile[Font File] --> Importer[Font Importer]
  LicenseFile[License File] --> Importer
  Importer --> FontPack[font-pack.geordi.json]
  FontPack --> Inspector[Glyph Inspector]
  FontPack --> FixtureValidator[Strict Fixture Validator]
  StrictFixture[strict-text.fixture.json] --> FixtureValidator
  FixtureValidator --> PreviewModel[Preview Model]
  PreviewModel --> BrowserWorkbench[Browser Workbench]
  PreviewModel --> CLIReport[CLI Report]
  BrowserReceipt[Browser Receipt] --> Compare[Parity Comparator]
  NativeReceipt[Native Receipt] --> Compare
  Compare --> DebugReport[Debug Report]
~~~

Layering rule:

- Domain model: font packs, strict text fixtures, glyph inventory, validation reports.
- Ports: JSON, file system, font parser, renderer preview, receipt comparison.
- Adapters: Node CLI, browser UI, future MCP wrapper.
- No UI component may parse raw JSON directly; UI consumes domain/application results.

## Nonclaims

The spike does not deliver:

- a full font editor;
- variable font authoring;
- OpenType feature authoring;
- complex script shaping;
- host font fallback;
- browser-native text as a compliant preview;
- production-grade atlas packing;
- accessibility editing;
- GPVue authoring integration.

It does deliver the first user-facing path for seeing and debugging strict glyph evidence.

## Fifteen-Slice Spike Plan

- [ ] **G001: Spike scaffold and command namespace**
- [ ] **G002: Font pack import dry-run CLI**
- [ ] **G003: Font pack verification CLI report**
- [ ] **G004: Font inventory reader boundary**
- [ ] **G005: Glyph inventory JSON report**
- [ ] **G006: Workbench shell**
- [ ] **G007: Font pack inspector view**
- [ ] **G008: Strict fixture inspector view**
- [ ] **G009: Glyph-run overlay preview**
- [ ] **G010: Validation issue navigator**
- [ ] **G011: Failure fixture gallery**
- [ ] **G012: Receipt comparison report**
- [ ] **G013: Import-to-fixture guided path**
- [ ] **G014: Workbench docs and screenshots**
- [ ] **G015: Spike checkpoint and next-decision gate**

### G001: Spike Scaffold And Command Namespace

Create the package and command namespace for user-facing glyph tools.

Acceptance:

- `packages/glyph-tools` exists with strict TypeScript settings.
- A root script exposes the tool, for example `pnpm geordi-glyph`.
- The command can print help and version information.
- No `Any`, no `unknown` leakage past JSON boundaries, and custom error types only.

Test plan:

- Unit: command parser accepts `--help`.
- Known fail: unknown command exits with a custom error.
- Edge: empty argv.
- Stress: help output remains deterministic.

### G002: Font Pack Import Dry-Run CLI

Add an import command that reads a font file and license file and emits a proposed manifest entry
without writing by default.

Acceptance:

- Computes font and license hashes.
- Accepts explicit `id`, `familyName`, `styleName`, `weight`, `faceIndex`, and source metadata.
- Emits canonical JSON.
- Refuses absolute/path-traversal output paths.

Test plan:

- Golden: Lato dry-run output.
- Known fail: missing license.
- Edge: existing id collision.
- Stress: repeated run gives identical output.

### G003: Font Pack Verification CLI Report

Expose the TypeScript font-pack parser and hash verifier through a CLI report.

Acceptance:

- Valid font pack prints a deterministic verification table.
- Bad hash fixture prints expected/actual values.
- Structural failures include JSON paths.
- Exit codes distinguish valid, invalid, and internal errors.

Test plan:

- Golden: Lato verification report.
- Known fail: `failures/bad-hash`.
- Edge: unreadable file.
- Stress: all failure fixtures.

### G004: Font Inventory Reader Boundary

Introduce a font-inspection port that can read basic font inventory without committing to shaping.

Acceptance:

- Reads format, face count if available, glyph count, and cmap coverage for supported TTF files.
- Uses a replaceable adapter; the domain model does not depend directly on one parser library.
- Fails loudly on unsupported format.
- Documents that glyph inventory is inspection metadata, not shaping.

Test plan:

- Golden: Lato inventory summary.
- Known fail: unsupported format.
- Edge: invalid TTF bytes.
- Stress: repeated parse hash-stable report.

### G005: Glyph Inventory JSON Report

Add a deterministic machine-readable glyph inventory report.

Acceptance:

- Emits glyph IDs and available codepoint mappings where the parser can provide them.
- Sorts entries deterministically.
- Includes font hash and face index.
- Includes warnings for unsupported tables rather than guessing.

Test plan:

- Golden: Lato small inventory snapshot.
- Known fail: corrupt font.
- Edge: codepoints with no glyph name.
- Stress: limit output for large fonts.

### G006: Workbench Shell

Create a browser workbench shell for local inspection.

Acceptance:

- Runs through Vite or the repo’s existing frontend pattern.
- Has tabs for Font Pack, Fixture, Preview, Failures, and Compare.
- Does not use browser-native text as a compliant preview.
- Shows active profile and loaded artifact hashes.

Test plan:

- Golden: Playwright smoke screenshot.
- Known fail: missing fixture path.
- Edge: narrow viewport.
- Stress: reload and tab switching.

### G007: Font Pack Inspector View

Display a loaded font pack manifest and verification results.

Acceptance:

- Shows font id, family/style/weight, path, hash, license, source.
- Shows verification status per font and license asset.
- Links failures to JSON path and file path.
- Keeps host fonts out of the contract.

Test plan:

- Golden: Lato inspector snapshot.
- Known fail: absolute-path fixture.
- Edge: duplicate id fixture.
- Stress: multiple fonts.

### G008: Strict Fixture Inspector View

Display strict text fixture metadata and glyph-run structure.

Acceptance:

- Shows fixture version, profile, position encoding, required features, semantic text status.
- Lists line boxes, runs, glyph counts, and font references.
- Flags unresolved references.
- Explains that `semanticText.source` does not affect pixels.

Test plan:

- Golden: canonical fixture A once S041 exists.
- Known fail: missing feature.
- Edge: empty glyph run.
- Stress: many runs.

### G009: Glyph-Run Overlay Preview

Render the strict fixture as a debug overlay before glyph evidence exists.

Acceptance:

- Draws line boxes, baselines, glyph origin markers, advances, and labels.
- Uses fixed-point conversion visibly.
- Provides zoom and pan.
- Does not claim glyph outline rendering.

Test plan:

- Golden: overlay screenshot.
- Known fail: non-integer coordinate fixture.
- Edge: negative offsets.
- Stress: hundreds of glyph markers.

### G010: Validation Issue Navigator

Build a UI component for validation failures.

Acceptance:

- Groups issues by artifact and JSON path.
- Shows error class, path, message, and remediation hint.
- Supports copyable CLI command for reproduction.
- Works for font pack and strict text failures.

Test plan:

- Golden: failure fixture issue list.
- Known fail: malformed JSON.
- Edge: multiple issues at same path.
- Stress: large issue list.

### G011: Failure Fixture Gallery

Expose known failure fixtures as a browsable contract gallery.

Acceptance:

- Lists each failure fixture, expected failure class, and current observed result.
- Marks unexpected pass as a hard failure.
- Can run from CLI and browser workbench.
- Links to docs explaining the invariant.

Test plan:

- Golden: gallery report.
- Known fail: intentionally modify expected class.
- Edge: missing fixture.
- Stress: run all failures.

### G012: Receipt Comparison Report

Compare two receipts or reports for deterministic evidence agreement.

Acceptance:

- Compares font pack, glyph-run, line-box, evidence, profile, and probe hashes when present.
- Reports exact mismatch paths.
- Does not require screenshots for the first pass.
- Keeps comparator schema versioned.

Test plan:

- Golden: identical receipt comparison.
- Known fail: changed font hash.
- Edge: missing optional future field.
- Stress: large receipt arrays.

### G013: Import-To-Fixture Guided Path

Add a guided workflow from font import to strict fixture inspection.

Acceptance:

- Guides users through font pack verification, fixture selection, reference validation, and overlay
  preview.
- Produces no hidden mutations.
- Every write requires an explicit output path.
- Emits deterministic summary text.

Test plan:

- Golden: guided Lato path report.
- Known fail: unresolved font id.
- Edge: read-only output path.
- Stress: repeated run.

### G014: Workbench Docs And Screenshots

Document how to run the CLI and workbench.

Acceptance:

- Adds README usage for import, verify, inspect, preview, and failure gallery.
- Adds screenshots or Playwright-generated images if stable.
- Documents nonclaims prominently.
- Links back to strict text design doc and BEARING.

Test plan:

- Docs hygiene.
- Known fail: stale command name.
- Edge: no local dev server.
- Stress: command examples remain copy-pasteable.

### G015: Spike Checkpoint And Next-Decision Gate

Close the spike with a written assessment.

Acceptance:

- Records what worked, what failed, and what should graduate to the main 100-slice plan.
- Separates throwaway spike code from production-worthy code.
- Recommends next slices for glyph evidence, shaping prep, or GPVue integration.
- Does not advertise broad text support.

Test plan:

- Docs hygiene.
- Known fail: broad text claim.
- Edge: incomplete implementation slice.
- Stress: compare against original spike goals.

## Success Criteria

The spike is successful if a user can answer these questions without reading raw JSON:

- Which font bytes does this fixture use?
- Are the font and license hashes valid?
- Which glyph IDs and positions will the renderer consume?
- Which line box owns a glyph run?
- Which validator rejected this artifact, and why?
- What command reproduces the failure?
- Do two receipts agree on the same evidence?

## Recommendation

Run this spike after S041 lands. The canonical strict fixture A gives the workbench something real to
inspect. Starting before S041 risks building UI against hypothetical fixture data. The font-pack
tools can start earlier, but preview and validation views become materially more useful once the
first strict text fixture exists.
