# Strict Text Remaining Slices PRD And Test Plan

**Status**: Execution quality gate
**Date**: 2026-05-26
**Feature/Product Name**: Strict Positioned Glyph-Run Text, Evidence Rendering And Conformance
**Slice Range**: S052-S100, with S051 as the completed strategy input
**Parent Plan**: [2026-05-strict-positioned-glyph-run-plan.md](./2026-05-strict-positioned-glyph-run-plan.md)
**Operating Map**: [../../BEARING.md](../../BEARING.md)

This document applies the product-management and lead-QA standard to the remaining strict text
execution slices. It is intentionally specific: every remaining slice must preserve the claim
boundary that strict Geordi text is positioned glyph evidence, not strings, CSS text, platform text,
host font fallback, or runtime shaping.

## 1. Feature Overview & Objectives:

### Problem Statement

Geordi needs a credible strict text proof that can render visible text in browser and native
runtimes without delegating glyph identity, shaping, metrics, fallback, or line boxes to host text
stacks. The current milestone has validated font packs, positioned glyph runs, line boxes, canonical
fixtures, receipts, and rejection preflights, but it still lacks glyph evidence packs, outline
rendering, browser/native parity metadata, scoped visual probes, shaping-prep boundaries, and final
claim gates.

The remaining slices must turn the validated strict text fixture boundary into a measurable
render-everywhere proof while preventing feature creep into general text rendering.

### Target User/Audience

| Persona | Needs | Non-negotiable quality bar |
| --- | --- | --- |
| Runtime implementer | A strict artifact contract that can be validated before drawing. | Must reject unsupported text behavior with custom errors and no partial compliant rendering. |
| Browser demo user | A visible proof that browser output is produced from evidence, not Canvas text. | Must never call `fillText`, `strokeText`, `measureText`, DOM text layout, CSS font matching, or host fallback in the strict path. |
| Native runtime user | An independent Rust proof that consumes the same evidence and reports comparable metadata. | Must not call OS text APIs, font lookup APIs, runtime shapers, or platform line-metric APIs. |
| Release reviewer | Exact metadata equality and modest visual evidence without overclaiming pixel identity. | Must compare stable hashes, counts, bounds, and probe reports before any broad public claim. |
| Compiler/text-prep author | A future shaping boundary that fingerprints all inputs and outputs. | Must keep shaping outside compliance until receiver proofs are strict. |
| Contributor/maintainer | A mechanical DAG-driven execution process. | Must keep `BEARING.md`, DOT, SVG, status docs, tests, and README claims synchronized. |

### Success Metrics (KPIs)

| KPI | Target by S100 | Measurement method |
| --- | ---: | --- |
| Cross-runtime strict text conformance | 100 percent of committed valid strict text fixtures accepted by TypeScript and Rust validators; 100 percent of committed failure fixtures rejected by both. | Package tests, Rust tests, fixture failure tests, and CI validation gate. |
| Browser/native proof coverage | 2 canonical strict text fixtures produce validated metadata reports, nonblank text bounds, and scoped visual probes in both runtimes. | Browser Playwright smoke, native smoke, parity report, and probe assertions. |
| Claim hygiene | 0 broad or unsupported public claims for general text, CSS text, host fallback, runtime shaping, or pixel-identical text rasterization. | Docs hygiene, grep-based claim audit, PR review checklist, and final drift audit. |

## 2. Scope Definition:

### In Scope

The remaining iteration builds the following, slice by slice:

| Slice range | In-scope product surface | Required output |
| --- | --- | --- |
| S052-S056 | Glyph evidence pack contract. | `geordi-glyph-evidence-pack/1` outline schema, fixture-local evidence data, TypeScript parser, Rust parser, and command validation. |
| S057-S060 | Browser strict text rendering proof. | Browser outline renderer, text fixture mode, metadata disclosure, and visible text smoke from evidence only. |
| S061-S064 | Native strict text rendering proof. | Native outline renderer, CLI mode, metadata report, and visible text smoke from evidence only. |
| S065-S073 | Parity and negative proof. | Exact browser/native metadata equality, coarse probes, stable probe policy, nonblank text bounds, and failure fixtures for missing evidence, missing glyph ids, bad line boxes, and unsupported text paint. |
| S074-S075 | Demo documentation checkpoints. | Browser and native text demo docs that expose current claims and nonclaims without broadening support. |
| S076-S092 | Shaping/text-prep boundary. | Shaping decision, fingerprint law, noncompliant spike boundary, compiler preparation contract, generated output schema, generation CLI, generated artifact, comparison, receipt fields, no-fallback validator, and rejection fixtures for fallback, multiline, bidi/complex scripts, variable axes, and measured line boxes. |
| S093-S100 | Public docs and CI gates. | Raw runtime text noncompliance docs, end-to-end text pipeline docs, render-everywhere text docs, README status gate, CI validation/smoke gates, and final drift/claim audit. |

Every remaining slice must:

- preserve the explicit strict text nonclaims;
- use custom error types for new failure modes;
- keep TypeScript and Rust contracts aligned through fixtures and conformance tests;
- update `BEARING.md`, the DOT graph, the SVG graph, and status signposts when slice state changes;
- land as a scoped commit with relevant gates recorded in the final message.

### Out of Scope

The remaining strict positioned glyph-run milestone does not build:

| Out-of-scope item | Reason |
| --- | --- |
| General Unicode text layout | Requires shaping, bidi, fallback, wrapping, and script support outside the first proof. |
| CSS text compatibility | CSS font loading, line breaking, fallback, white-space, bidi, features, transforms, and metrics are not the renderer contract. |
| Runtime shaping in compliant renderers | Strict mode consumes prepared glyph evidence only. |
| Host font lookup or fallback | Font identity is content-addressed fixture data. |
| Platform text APIs | Browser/native strict paths must not ask host text stacks to determine pixels. |
| Pixel-identical antialiasing claim | Initial probes are scoped visual evidence; metadata equality is the stronger first claim. |
| Reusable glyph cache profile | First evidence packs are fixture-local minimal packs. |
| Bitmap/SDF atlas rendering | Outline paths are the selected first evidence kind. |
| Required WASM dependency for TypeScript consumers | WASM remains optional future kernel territory, not the default TS package path. |
| `geordi-ir/1` text-node graduation | Graduation happens only after validation, rendering, parity, docs, and CI gates prove the fixture path. |
| Text editing, selection, caret, or accessibility tree semantics | These need separate product scope and runtime contracts. |
| Variable font axes | Rejected until a future profile fingerprints axes and generated outputs. |

## 3. Detailed User Stories:

Each story maps directly to one remaining slice. The story ID is the slice ID and the acceptance
criteria in section 4 are binding for that story.

| Story ID | User Story |
| --- | --- |
| S052 | As a runtime implementer, I want an outline evidence pack schema so that browser and native runtimes can validate glyph drawing data before any text pixels are produced. |
| S053 | As a fixture author, I want committed outline evidence data for the canonical strict text fixtures so that rendering work starts from inspectable, content-addressed evidence. |
| S054 | As a TypeScript package consumer, I want a TypeScript outline evidence parser so that browser and Node tooling reject malformed evidence before rendering. |
| S055 | As a Rust runtime maintainer, I want a Rust outline evidence parser so that native rendering consumes the same evidence shape independently. |
| S056 | As a runtime implementer, I want outline command validation so that malformed paths, missing commands, unsafe numbers, and unresolved glyph evidence fail deterministically. |
| S057 | As a browser demo user, I want the browser renderer to draw glyph outlines from evidence so that the visible proof does not use platform text APIs. |
| S058 | As a browser demo user, I want a browser text fixture mode so that strict text can be loaded separately from rectangle and bunny demos. |
| S059 | As a browser reviewer, I want browser text metadata disclosure so that fixture, font, glyph-run, line-box, and evidence hashes are visible and reviewable. |
| S060 | As a browser reviewer, I want browser visible text smoke tests so that the browser proof catches blank canvases and accidental platform-text paths. |
| S061 | As a native runtime user, I want the native renderer to draw glyph outlines from evidence so that Rust proves the same contract independently. |
| S062 | As a native runtime user, I want a native text fixture CLI mode so that strict text fixtures can be loaded, validated, and smoked without opening a window. |
| S063 | As a native reviewer, I want a native text metadata report so that native output can be compared to browser output without visual guesswork. |
| S064 | As a native reviewer, I want native visible text smoke tests so that native rendering catches blank buffers and broken evidence consumption. |
| S065 | As a release reviewer, I want browser/native metadata equality so that parity is based on exact contract data before pixels are discussed. |
| S066 | As a browser gate owner, I want browser coarse pixel probes so that the browser path proves visible, bounded text at stable sample points. |
| S067 | As a native gate owner, I want native coarse pixel probes so that the native path proves visible, bounded text at stable sample points. |
| S068 | As a release reviewer, I want a stable text probe policy so that visual checks remain honest and do not imply full antialiasing identity. |
| S069 | As a release reviewer, I want a nonblank text bounds check so that both runtimes prove text appears inside declared evidence bounds. |
| S070 | As a runtime implementer, I want a missing glyph evidence failure so that a glyph run cannot draw unless every referenced glyph has evidence. |
| S071 | As a runtime implementer, I want a glyph-id-not-found failure so that evidence packs cannot omit or mismatch font-local glyph identity. |
| S072 | As a runtime implementer, I want a bad line-box failure so that renderers reject evidence that violates explicit line-box constraints. |
| S073 | As a runtime implementer, I want unsupported text fill/stroke failures so that unimplemented paint modes cannot silently become compliant. |
| S074 | As a browser demo user, I want browser text demo docs so that I understand exactly what the browser proof claims and does not claim. |
| S075 | As a native demo user, I want native text demo docs so that I understand exactly what the native proof claims and does not claim. |
| S076 | As a compiler author, I want a shaping implementation decision so that shaping enters only after strict receivers exist. |
| S077 | As a compiler author, I want a shaping profile fingerprint law so that generated glyph runs identify every input that could affect output. |
| S078 | As a compiler author, I want a shaping spike outside the compliance path so that exploratory shaping does not become an accidental product claim. |
| S079 | As a compiler author, I want a compiler text preparation boundary so that strings are lowered to deterministic artifacts before runtime. |
| S080 | As a tooling author, I want a generated shaped output schema so that generated glyph runs, line boxes, evidence references, and provenance are explicit. |
| S081 | As a tooling user, I want a glyph-run generation CLI so that strict fixtures can be produced repeatably from pinned inputs. |
| S082 | As a fixture reviewer, I want a generated fixture artifact so that generated output can be audited against hand-authored canonical fixtures. |
| S083 | As a QA engineer, I want generated artifact comparison so that regeneration drift is detected before fixture changes land. |
| S084 | As a receipt reviewer, I want a receipt shaping-profile field so that every fixture states whether shaping was precomputed or tool-generated. |
| S085 | As a receipt reviewer, I want a receipt glyph-run checksum field so that positioned glyph evidence changes are content-addressed. |
| S086 | As a receipt reviewer, I want a receipt line-box checksum field so that line metrics are content-addressed and reviewable. |
| S087 | As a compiler author, I want a no-fallback validator so that unsupported host or font fallback cannot enter generated strict fixtures. |
| S088 | As a QA engineer, I want a fallback-chain rejection fixture so that fallback remains a proven hard failure. |
| S089 | As a QA engineer, I want a multiline rejection fixture so that wrapping and multiline layout remain outside the first profile. |
| S090 | As a QA engineer, I want bidi and complex-script rejection fixtures so that unsupported script behavior fails explicitly. |
| S091 | As a QA engineer, I want a variable-font-axis rejection fixture so that axes cannot silently change glyph identity or metrics. |
| S092 | As a compiler author, I want measured line-box generation so that prepared artifacts can record deterministic line boxes without runtime metrics. |
| S093 | As a contributor, I want raw runtime text noncompliance docs so that future demos cannot imply raw strings are compliant. |
| S094 | As a contributor, I want end-to-end text pipeline docs so that authoring, prep, evidence, rendering, parity, and CI responsibilities are explicit. |
| S095 | As a render-everywhere user, I want render-everywhere text docs so that text proof commands and artifacts are discoverable. |
| S096 | As a repository reader, I want a README strict text status gate so that top-level claims match completed evidence only. |
| S097 | As a maintainer, I want a CI text fixture validation gate so that malformed strict text artifacts cannot land. |
| S098 | As a maintainer, I want a CI browser text smoke gate so that browser strict text proof remains exercised automatically. |
| S099 | As a maintainer, I want a CI native text smoke gate so that native strict text proof remains exercised automatically. |
| S100 | As a release reviewer, I want a final drift and claim audit so that docs, tests, DAG state, and public claims are synchronized before the milestone is called complete. |

## 4. Acceptance Criteria (BDD Format):

Every acceptance criterion below is technical and testable. Slices may add stricter criteria, but
they must not weaken these.

| Story ID | Given | When | Then |
| --- | --- | --- | --- |
| S052 | Given the first evidence kind is `outlinePaths` | When the schema is added | Then it defines pack version, evidence kind, font identity, face index, text profile, shaping profile, position encoding, winding rule, glyph entries, bounds, commands, and fixture-local path/hash expectations. |
| S052 | Given a future renderer needs evidence before drawing | When a strict text fixture lacks `glyphEvidencePackPath` or equivalent schema linkage | Then the docs define that rendering slices must reject it before drawing. |
| S053 | Given the canonical strict text fixtures reference fixed glyph ids | When outline evidence data is committed | Then every referenced `fontId + glyphId` pair has exactly one evidence entry with deterministic bounds and commands. |
| S053 | Given fixture evidence is content-addressed | When the evidence file changes | Then its canonical hash input changes and receipt integration work can detect that drift. |
| S054 | Given a TypeScript consumer parses an evidence pack | When the pack is valid canonical JSON | Then the parser returns typed DTOs without exposing ad hoc untyped JSON to callers. |
| S054 | Given malformed TypeScript evidence input | When version, kind, path, glyph id, bounds, or command fields are invalid | Then a custom TypeScript error reports stable issue paths. |
| S055 | Given a Rust consumer parses the same evidence pack | When the pack is valid canonical JSON | Then Rust structs deserialize and expose the same contract fields as TypeScript. |
| S055 | Given malformed Rust evidence input | When version, kind, path, glyph id, bounds, or command fields are invalid | Then a custom Rust error reports stable issue paths. |
| S056 | Given an outline evidence pack with commands | When commands are validated | Then only `moveTo`, `lineTo`, `quadTo`, `cubicTo`, and `closePath` are accepted with finite safe fixed 26.6 integer coordinates. |
| S056 | Given a glyph evidence path is malformed | When the path starts with `lineTo`, has open contours, repeated invalid closes, unsafe coordinates, or unsupported commands | Then both TypeScript and Rust reject it deterministically. |
| S057 | Given a browser strict text fixture with valid outline evidence | When the browser renderer draws it | Then pixels are produced from path geometry and the strict path makes zero calls to browser text APIs. |
| S057 | Given missing or invalid evidence | When browser rendering is requested | Then rendering fails before any compliant partial draw. |
| S058 | Given the browser harness has rectangle and bunny modes | When text fixture mode is added | Then text loads through a separate explicit mode without weakening existing rectangle or bunny gates. |
| S058 | Given browser text fixture load fails | When the page starts or the test route supplies bad data | Then the harness reports a custom failure instead of falling back to platform text. |
| S059 | Given a browser text fixture has metadata | When the browser UI/report is opened | Then fixture id, font pack hash, glyph-run hash, line-box hash, evidence hash, text profile, position encoding, and renderer name are visible. |
| S059 | Given semantic text is present | When metadata is displayed | Then it is labeled non-rendering and never presented as pixel authority. |
| S060 | Given browser strict text rendering is implemented | When Playwright runs the text smoke | Then the canvas is nonblank, bounded, and sampled without using text APIs. |
| S060 | Given a browser regression produces blank text | When smoke tests run | Then the test fails with a specific browser strict text smoke error. |
| S061 | Given a native strict text fixture with valid outline evidence | When native rendering runs | Then the Rust renderer draws path geometry from evidence without OS text APIs or runtime shaping. |
| S061 | Given invalid native evidence | When rendering is requested | Then native rendering fails before allocating or presenting a successful output claim. |
| S062 | Given a strict text fixture path | When `native-render-everywhere` runs text fixture mode | Then it validates, renders offscreen, and exits nonzero on custom validation/render failures. |
| S062 | Given the fixture path is missing or escapes expected boundaries | When CLI mode starts | Then the CLI fails with a custom path/load error. |
| S063 | Given native text rendering completed | When the metadata report is written | Then it includes the same identity fields as the browser report and stable renderer-specific fields. |
| S063 | Given metadata cannot be produced | When native smoke runs | Then the command fails before claiming smoke success. |
| S064 | Given native strict text rendering is implemented | When native visible text smoke runs | Then the output buffer is nonblank, bounded, and sampled at stable probe points. |
| S064 | Given native text is blank or outside bounds | When smoke runs | Then the test fails with a specific native text smoke error. |
| S065 | Given browser and native metadata reports for the same fixture | When parity comparison runs | Then fixture id, profile, position encoding, font hash, glyph-run hash, line-box hash, evidence hash, glyph counts, and line-box fields match exactly. |
| S065 | Given any required metadata field differs | When parity comparison runs | Then the gate fails before evaluating pixels. |
| S066 | Given browser text output is visible | When browser coarse probes run | Then sampled points prove interior fill and background/empty regions without claiming antialiasing identity. |
| S066 | Given a browser probe samples outside bounds or wrong color class | When the gate runs | Then it fails with fixture id, probe id, coordinates, expected class, and actual RGBA. |
| S067 | Given native text output is visible | When native coarse probes run | Then sampled points prove interior fill and background/empty regions without claiming antialiasing identity. |
| S067 | Given a native probe samples outside bounds or wrong color class | When the gate runs | Then it fails with fixture id, probe id, coordinates, expected class, and actual RGBA. |
| S068 | Given text probe positions are selected | When the probe policy is documented or implemented | Then each probe states purpose, tolerance/class, coordinate source, and why it is stable across browser/native raster differences. |
| S068 | Given a proposed probe lies on an antialiasing edge | When reviewed | Then it is rejected or classified as non-stable. |
| S069 | Given rendered text bounds are known from evidence | When nonblank bounds checks run | Then both runtimes prove nontransparent/nonbackground pixels exist inside expected evidence bounds. |
| S069 | Given pixels appear outside allowed text/evidence bounds | When bounds checks run | Then the gate fails and reports the offending bounding box. |
| S070 | Given a glyph run references a glyph id | When no matching evidence exists | Then TypeScript, Rust, browser, and native paths reject before drawing. |
| S071 | Given an evidence pack contains a glyph id not referenced or omits one that is referenced | When glyph coverage validation runs | Then the validator reports stable glyph identity mismatch diagnostics. |
| S072 | Given evidence bounds conflict with declared line boxes | When fixture validation runs | Then the fixture is rejected unless a future explicit overflow profile exists. |
| S073 | Given a fixture requests unsupported text stroke, gradient, opacity mode, or paint effect | When validation/rendering starts | Then it fails as unsupported text paint before drawing. |
| S074 | Given browser text proof is visible | When browser docs are updated | Then they document exact commands, expected UI, current claims, and current nonclaims. |
| S075 | Given native text proof is visible | When native docs are updated | Then they document exact commands, expected CLI output, current claims, and current nonclaims. |
| S076 | Given receivers can validate and render strict evidence | When shaping implementation is considered | Then the decision records whether shaping remains deferred, uses a Rust/native tool, or uses another pinned prep path. |
| S077 | Given shaping can affect glyph ids and positions | When fingerprint law is written | Then font hash, face index, shaper name/version/config, script, language, direction, features, normalization, variation axes, source hash, glyph-run hash, and line-box hash are required inputs. |
| S078 | Given shaping spike code or docs are added | When it runs | Then it is explicitly outside compliance and cannot be used as a strict renderer path. |
| S079 | Given source strings enter compiler tooling | When text preparation boundary is defined | Then the runtime input is prepared artifacts, not raw strings. |
| S080 | Given generated shaped output is represented | When schema lands | Then it includes source hash, font identity, shaping profile, glyph runs, line boxes, evidence references, and receipt fields. |
| S081 | Given pinned text-prep inputs | When the generation CLI runs | Then it emits deterministic artifacts or stable diagnostics with no ambient host font lookup. |
| S082 | Given generated artifacts are produced | When fixture data lands | Then the generated fixture is committed with canonical bytes and reviewable receipts. |
| S083 | Given generated artifacts can be regenerated | When comparison runs | Then byte/hash drift fails unless expected fixture updates are staged. |
| S084 | Given a strict text receipt is built | When shaping provenance is present | Then `shapingProfile` records `precomputed-fixture/1` or a concrete fingerprinted generator profile. |
| S085 | Given a strict text receipt is built | When glyph runs are present | Then `glyphRunHash` hashes canonical positioned glyph-run data. |
| S086 | Given a strict text receipt is built | When line boxes are present | Then `lineBoxHash` hashes canonical line-box data. |
| S087 | Given generated or authored fixture data includes fallback | When no-fallback validation runs | Then the artifact is rejected with stable fallback diagnostics. |
| S088 | Given a fallback-chain failure fixture | When validators run | Then TypeScript and Rust reject it with matching diagnostic identity. |
| S089 | Given a multiline or wrapping failure fixture | When validators run | Then TypeScript and Rust reject it as outside the first profile. |
| S090 | Given bidi or complex-script failure fixtures | When validators run | Then TypeScript and Rust reject them as unsupported without attempting runtime shaping. |
| S091 | Given variable-font-axis fixture data | When validators run | Then TypeScript and Rust reject it unless a future axis fingerprint profile exists. |
| S092 | Given line boxes are generated by text-prep | When generation runs | Then line boxes are deterministic, content-addressed, and never measured by runtime renderers. |
| S093 | Given public docs mention raw text | When docs are audited | Then they state raw runtime text is noncompliant for strict rendering. |
| S094 | Given the end-to-end text pipeline is documented | When a reader follows it | Then every boundary from authoring source to prep to evidence to rendering to parity to CI is explicit. |
| S095 | Given render-everywhere text proof exists | When docs are updated | Then artifact paths, commands, reports, and failure fixtures are discoverable. |
| S096 | Given README text status is updated | When the top-level README is reviewed | Then it advertises only completed strict text claims and preserves nonclaims. |
| S097 | Given CI validates text fixtures | When malformed fixture, font, glyph-run, line-box, evidence, or receipt data lands | Then CI fails before merge. |
| S098 | Given CI runs browser text smoke | When browser rendering regresses | Then CI fails with browser-specific strict text diagnostics. |
| S099 | Given CI runs native text smoke | When native rendering regresses | Then CI fails with native-specific strict text diagnostics. |
| S100 | Given all prior slices are complete | When final audit runs | Then docs, checklist, DOT, SVG, README, CI gates, fixtures, receipts, reports, and claims agree with no broad unsupported text claim. |

## 5. Detailed Test Plan:

### Test Scenarios

| Scenario ID | Slice coverage | Category | Preconditions | Test action | Expected result | Primary gate |
| --- | --- | --- | --- | --- | --- | --- |
| TS-EVIDENCE-PARSE-VALID | S052-S054 | Happy path | Valid outline evidence pack exists. | Parse pack through TypeScript package. | Typed DTO returned; canonical fields match fixture. | `pnpm --filter @flyingrobots/geordi-render-fixture test` |
| TS-EVIDENCE-PARSE-INVALID | S052-S056 | Negative | Pack has bad version, unsupported kind, unsafe coordinates, duplicate glyphs, or bad command order. | Parse/assert TypeScript evidence. | Custom error with stable paths. | Package tests |
| RUST-EVIDENCE-PARSE-VALID | S052-S055 | Happy path | Same valid pack exists. | Parse pack through Rust crate. | Rust structs match TypeScript fixture expectations. | `cargo test -p geordi-ir` |
| RUST-EVIDENCE-PARSE-INVALID | S052-S056 | Negative | Same invalid fixtures exist. | Parse/assert Rust evidence. | Custom error with stable paths. | Rust tests |
| EVIDENCE-COVERAGE | S053-S056, S070-S071 | Negative | Glyph run references evidence by `fontId + glyphId`. | Remove or mismatch evidence entry. | Validation rejects before rendering. | TS/Rust conformance tests |
| LINE-BOX-EVIDENCE | S056, S072 | Edge | Evidence bounds exceed line box. | Validate fixture. | Rejection unless future overflow profile is explicit. | TS/Rust tests |
| BROWSER-NO-TEXT-API | S057-S060 | Security/contract | Browser strict text fixture is valid. | Render under spy/stubbed Canvas text APIs. | No calls to `fillText`, `strokeText`, `measureText`, DOM text layout, CSS font matching, or `FontFace`. | Browser unit and Playwright tests |
| BROWSER-TEXT-SMOKE | S057-S060, S066 | Happy path | Browser text mode available. | Run browser text smoke. | Nonblank bounded text and stable probes pass. | Playwright |
| BROWSER-INVALID-EVIDENCE | S057-S060, S070-S073 | Negative | Fixture has missing evidence or unsupported paint. | Load browser text mode. | Custom failure before drawing. | Browser unit tests |
| NATIVE-NO-TEXT-API | S061-S064 | Contract | Native strict text fixture is valid. | Run native text smoke. | Native renderer uses evidence path only; no OS text/shaper path is introduced. | Rust tests and code review |
| NATIVE-TEXT-SMOKE | S061-S064, S067 | Happy path | Native text CLI mode exists. | Run offscreen native text smoke. | Nonblank bounded text and stable probes pass. | `cargo run -p native-render-everywhere -- --text-smoke ...` |
| NATIVE-INVALID-EVIDENCE | S061-S064, S070-S073 | Negative | Fixture has missing evidence or unsupported paint. | Run native text mode. | Custom failure before rendering success. | Rust tests |
| METADATA-PARITY | S065 | Happy path | Browser and native reports exist for same fixture. | Compare reports. | Required metadata fields match exactly. | Parity script/test |
| METADATA-MISMATCH | S065 | Negative | One report has altered hash/count/bounds. | Run parity comparison. | Fails before pixel/probe checks. | Parity test |
| PROBE-POLICY | S066-S069 | Edge | Probe definitions exist. | Audit probe classes and coordinates. | Probes avoid unstable antialiasing edges and document purpose. | Probe policy tests/docs |
| NONBLANK-BOUNDS | S069 | Negative | Rendered output blank or outside bounds. | Run bounds check. | Fails with computed bounds report. | Browser/native smoke |
| SHAPING-FINGERPRINT | S076-S087 | Contract | Shaping or generated artifacts are introduced. | Build receipt/generation metadata. | Every shaping-affecting input is fingerprinted. | Text-prep tests |
| SHAPING-OUT-OF-COMPLIANCE | S078 | Negative | Spike path exists. | Attempt to use spike output as compliant renderer input. | Docs/tests reject compliance claim. | Docs and tests |
| GENERATED-DRIFT | S080-S083 | Regression | Generated fixture can be regenerated. | Run generation comparison. | Drift fails unless expected artifacts are updated. | CLI comparison test |
| RECEIPT-HASHES | S084-S086 | Regression | Fixture receipt is built. | Change glyph runs or line boxes. | Corresponding hash changes and tests catch stale receipts. | Receipt tests |
| UNSUPPORTED-TEXT-FEATURES | S087-S092 | Negative | Failure fixtures request fallback, multiline, bidi, complex script, or variable axes. | Run TS/Rust validators. | Stable rejection in both runtimes. | Conformance tests |
| DOC-CLAIM-AUDIT | S093-S096, S100 | Docs | Public docs and README exist. | Run docs checks and claim grep. | No unsupported broad text claims. | `pnpm test:docs` plus audit grep |
| CI-TEXT-VALIDATION | S097 | CI | CI config includes text validation. | Push malformed text fixture. | CI fails before merge. | CI dry-run or local equivalent |
| CI-BROWSER-SMOKE | S098 | CI | Browser text smoke in CI. | Break browser evidence rendering. | CI fails with browser text smoke failure. | Browser CI job |
| CI-NATIVE-SMOKE | S099 | CI | Native text smoke in CI. | Break native evidence rendering. | CI fails with native text smoke failure. | Native CI job |
| FINAL-DRIFT-AUDIT | S100 | Release gate | All slices complete. | Compare docs, DAG, SVG, fixtures, receipts, reports, and CI. | Milestone can be claimed only if every surface agrees. | Full gate |

### Happy Path Testing

1. Add a valid `geordi-glyph-evidence-pack/1` outline pack for the canonical `GEORDI` fixture.
2. Parse the pack in TypeScript and Rust.
3. Validate pack identity: version, kind, font id, font hash, face index, text profile, shaping
   profile, position encoding, winding rule, glyph ids, bounds, and commands.
4. Link the pack from the strict text fixture.
5. Validate font pack, strict text fixture, line boxes, glyph runs, and evidence together.
6. Build or update the strict text receipt and confirm `glyphEvidencePackHash` is present where
   renderable evidence exists.
7. Render the fixture in browser text mode.
8. Verify browser metadata report includes fixture id, renderer name, text profile, position
   encoding, font hash, glyph-run hash, line-box hash, evidence hash, glyph count, and line-box
   summary.
9. Run browser visible smoke and confirm text is nonblank and bounded.
10. Render the same fixture in native text mode.
11. Verify native metadata report includes the same parity fields.
12. Run native visible smoke and confirm text is nonblank and bounded.
13. Compare browser/native metadata exactly.
14. Run browser and native coarse probes using the stable probe policy.
15. Repeat steps 1-14 for the `text 0123` fixture.
16. Run docs, package, Rust, browser, native, and parity gates.
17. Confirm public docs state the strict claim and preserve all nonclaims.

### Negative/Edge Case Testing

| Failure or edge | Required behavior |
| --- | --- |
| Missing evidence pack path | Reject before rendering; report fixture path and missing evidence field. |
| Evidence pack version mismatch | Reject at parse/validation boundary with stable version path. |
| Unsupported evidence kind | Reject before rendering; do not fall back to bitmap/SDF/platform text. |
| Font hash mismatch between font pack and evidence pack | Reject before drawing; report expected and actual hash identity where available. |
| Face index mismatch | Reject as glyph identity mismatch. |
| Text profile mismatch | Reject evidence pack as incompatible with fixture. |
| Position encoding mismatch | Reject evidence pack as incompatible with glyph coordinates. |
| Duplicate glyph evidence key | Reject with duplicate `fontId + glyphId` diagnostic. |
| Missing glyph evidence key | Reject with missing `fontId + glyphId` diagnostic. |
| Extra glyph evidence key | Accept only if schema explicitly permits fixture-local extra evidence; otherwise reject or document reusable-pack profile requirement. |
| Unsafe fixed 26.6 coordinate | Reject at parser/validator boundary. |
| Fractional coordinate where integer is required | Reject at JSON parse or validation boundary. |
| `NaN`, infinity, or `-0` equivalent | Reject or normalize only at documented JSON port; no renderer-specific behavior. |
| Path starts with draw command before `moveTo` | Reject invalid contour. |
| `closePath` without open contour | Reject invalid contour. |
| Unsupported command name | Reject with command index path. |
| Empty glyph path for visible glyph | Reject unless glyph is explicitly declared as non-drawing, such as a space, with bounds/advance semantics. |
| Space glyph evidence | Must be explicit enough for coverage and receipt identity; may have empty draw commands only if schema allows non-drawing glyphs. |
| Bounds outside line box | Reject unless future overflow profile is explicitly declared. |
| Unsupported fill/stroke/gradient/effect | Reject before drawing. |
| Browser canvas context unavailable | Custom browser harness error; no success report. |
| Browser route/fetch timeout or 404 | Custom fetch/load error; no fallback fixture. |
| Native fixture path missing | Custom native load error; nonzero exit. |
| Native image buffer overflow | Custom native render error; nonzero exit. |
| Concurrent browser fixture reloads | No shared mutable state leaks; each load validates its own fixture/evidence. |
| Concurrent native CLI invocations | No global mutable fixture state; outputs are deterministic. |
| Broken font-pack dependency | Reject before evidence rendering. |
| Broken receipt dependency | Reject receipt/parity gate; do not claim render proof. |
| Probe placed on antialiasing edge | Reject the probe policy entry or classify it as unstable and nonblocking. |
| Metadata report missing required field | Parity fails before pixel/probe checks. |
| Generated fixture drift | Comparison fails unless regenerated artifacts are intentionally updated. |
| Fallback, multiline, bidi, complex script, or variable axis request | Reject in validators and failure fixtures. |

### Non-Functional Testing

#### Performance

| Requirement | Target | Measurement |
| --- | ---: | --- |
| Evidence parser runtime for canonical fixtures | Under 50 ms per fixture in local tests for TypeScript and Rust. | Unit-test timing notes or benchmark smoke where added. |
| Browser text smoke runtime | Under 5 seconds for canonical fixtures in Playwright on local dev hardware. | Playwright duration. |
| Native text smoke runtime | Under 2 seconds for canonical fixtures in offscreen mode. | Cargo run/test duration. |
| Parity metadata comparison | Under 1 second for canonical reports. | Parity script/test duration. |
| Fixture size growth | Evidence packs remain fixture-local and minimal; no unbounded full-font outline dumps in this milestone. | File size review and PR diff. |

#### Load And Stress

| Stress axis | Required coverage |
| --- | --- |
| Glyph count | Tests include the canonical fixtures and at least one stress fixture or synthetic test with repeated glyphs. |
| Command count | Validation covers empty, minimal, repeated, and high-count command arrays. |
| Repeated runs | Browser and native smoke can run repeatedly without state leakage or nondeterministic metadata. |
| Concurrent consumers | Node/browser helper logic and native CLI do not rely on mutable global fixture state. |
| Large malformed inputs | Validators reject oversized or deeply malformed arrays without panics or unhandled exceptions. |

#### Security

| Risk | Required mitigation |
| --- | --- |
| Path traversal | All fixture-local paths reject absolute paths, URL schemes, Windows drive prefixes, UNC paths, and `..` escapes. |
| Host font escape | Renderers must not load host fonts or resolve ambient font family names. |
| Platform text escape | Browser strict path must not call text APIs; native strict path must not call OS text APIs. |
| Hash spoofing | Hash fields must use lowercase `sha256:<64 hex>` and compare against exact loaded bytes/canonical fragments. |
| Untrusted JSON | JSON ingress goes through canonical/typed ports and custom errors; no `eval`, dynamic code generation, or prototype-sensitive object merging. |
| Resource exhaustion | Validators must bound or reject unsafe integers, huge dimensions, and buffer-overflow conditions. |

#### Accessibility

| Area | Requirement |
| --- | --- |
| Browser demo controls | Text fixture mode must be keyboard reachable and expose correct button/tabpanel state where UI is added. |
| Metadata disclosure | Reports must be readable text, not only canvas pixels. |
| Semantic text | `semanticText.source` may be displayed for review/debug, but must be labeled non-rendering and not treated as accessibility compliance. |
| Contrast | Demo UI metadata and controls must maintain readable contrast in the existing harness style. |
| No false a11y claim | This milestone does not claim text editing, selection, caret, screen-reader semantics, or production accessibility tree support. |

#### Regression Gate Bundle

Each implementation slice must run the narrow gate relevant to touched files. Before S100 can close,
the final gate must include:

| Gate | Command or check |
| --- | --- |
| TypeScript typecheck | `pnpm typecheck` |
| TypeScript lint | `pnpm lint` |
| TypeScript tests | `pnpm test` |
| Docs hygiene | `pnpm test:docs` |
| Package naming | `pnpm test:package-names` |
| Repo sludge | `pnpm test:repo-sludge` |
| Placeholder audit | `pnpm test:placeholders` |
| Export smoke | `pnpm test:exports` |
| Diff hygiene | `git diff --check` |
| Rust formatting | `cargo fmt --check`, unless a known unrelated rustfmt drift is explicitly isolated and documented in the slice notes |
| Rust tests | `cargo test --workspace` |
| Rust clippy | `cargo clippy --workspace --all-targets -- -D warnings` |
| Browser text smoke | CI/local command added by S098 |
| Native text smoke | CI/local command added by S099 |
| Claim audit | Search docs for broad unsupported text claims and stale DAG/open-node state |
