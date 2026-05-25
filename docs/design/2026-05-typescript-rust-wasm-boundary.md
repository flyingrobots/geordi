# TypeScript, Rust, and WASM Boundary Policy

**Status**: Active design policy
**Date**: 2026-05-25
**Applies to**: Geordi TypeScript packages, Rust crates, generated shared contracts, strict text, font assets, glyph evidence, render-everywhere tooling

## Executive Decision

Geordi is TypeScript-native at the edges, Rust-native at the rendering core, generated at the
contract boundary, and WASM-backed only where deterministic hard algorithms justify the cost.

~~~text
Shared contract source
  -> Wesley/common-type generation
  -> Generated TypeScript DTOs and generated Rust DTOs
  -> Native TypeScript helpers and native Rust renderer
  -> Optional Rust/WASM kernels for hard font, glyph, and raster work
~~~

The TypeScript packages must not become thin WASM wrappers around Rust by default. The current
handwritten TypeScript and Rust DTO mirror is also not a permanent architecture. Shared serialized
artifact shapes must move to generated TypeScript and Rust types from one common contract source.

## Problem Statement

The strict positioned glyph-run milestone introduced contract shapes that naturally appear in both
TypeScript and Rust:

- font-pack manifests;
- strict text fixture manifests;
- line boxes;
- positioned glyph runs;
- positioned glyphs;
- receipts and provenance records as they mature.

There are two failure modes to avoid:

1. Permanent hand-mirrored TypeScript interfaces and Rust structs drift subtly over time.
2. TypeScript becomes a mandatory WASM loader for ordinary object validation and loses its value as
   lightweight browser, Node, tooling, and fixture-authoring glue.

The correct architecture solves both without pretending every runtime should use the same execution
mechanism.

## Architecture Rule

Contracts are generated. Runtime glue stays native. Expensive deterministic kernels may be shared.

~~~text
                 Geordi contract spec
             / Wesley common-type schema
                         |
              deterministic generation
                         |
        +----------------+----------------+
        |                                 |
 Generated TypeScript DTOs          Generated Rust DTOs
        |                                 |
 Native TypeScript helpers          Native Rust validators
 Browser and Node workflows         Native renderer and CLI workflows
        |                                 |
        +----------------+----------------+
                         |
          shared conformance fixtures
                         |
        Optional future Rust/WASM kernels
        for font, glyph, shaping, raster,
        and reference-proof work
~~~

## What Stays Native TypeScript

Keep TypeScript native for code that is primarily host integration, fixture ergonomics, or simple
artifact inspection:

| Area | Reason |
| --- | --- |
| DTO exports generated for TypeScript | Consumers need ordinary TypeScript types without a runtime loader. |
| Fixture helpers | Test authors and docs tooling should import simple JavaScript modules. |
| Manifest loading and object walking | JSON-shaped artifact handling does not justify a WASM boundary. |
| Browser integration | Canvas, WebGL, WebGPU, fetch, bundlers, and devtools are JavaScript-first APIs. |
| Node integration | Filesystem, paths, package resolution, and crypto helpers already have native Node APIs. |
| Simple structural validation | Checks such as required fields, duplicate IDs, and local references are cheap and easy to test. |
| Dev tooling and examples | Low-friction package consumption matters more than single-language implementation purity. |

Mandatory WASM loading is not acceptable for simple checks such as "every glyph run font id exists in
the font pack." That kind of validation can be implemented natively in TypeScript and Rust while a
conformance corpus proves they agree.

## What Belongs In Rust Or Rust/WASM

Prefer a shared Rust implementation, with optional WASM exposure for browser or Node reuse, when the
logic is algorithmically hard, security-sensitive, performance-sensitive, edge-case-heavy, or
dangerous to duplicate.

| Area | Recommendation |
| --- | --- |
| Font parsing | Prefer Rust, expose through WASM when TypeScript runtimes need the same parser. |
| Glyph metrics | Prefer Rust/WASM once metrics become part of a deterministic contract. |
| Glyph outline extraction | Prefer Rust/WASM; duplicated outline extraction is high drift risk. |
| Text shaping | Prefer one canonical engine if Geordi later supports shaping beyond positioned glyph evidence. |
| Rasterization and reference rendering | Prefer Rust/native first; add WASM if browser reference proof needs it. |
| Pixel diff and proof tooling | Prefer shared deterministic kernels when comparison semantics become complex. |
| Nontrivial binary normalization | Consider Rust/WASM if canonical binary or hash preparation grows beyond simple JSON hashing. |

Strict positioned glyph-run text currently avoids runtime shaping. It should not introduce a shaping
WASM dependency until the milestone explicitly adds shaping as a supported claim.

## What Must Not Happen

Do not make this the default fixture validation path:

~~~text
TypeScript API
  -> serialize JavaScript object across WASM boundary
  -> Rust validates ordinary JSON-shaped data
  -> serialize diagnostics back to JavaScript
  -> map Rust diagnostics into TypeScript error classes
~~~

That path adds loader constraints, packaging risk, bundler variance, async initialization decisions,
harder stack traces, and JSON/error marshaling for behavior that is not computationally hard.

This path is allowed only when a specific kernel has already passed the WASM justification test in
this document.

## WASM Justification Test

Before moving TypeScript-facing behavior behind Rust/WASM, answer this question:

~~~text
Would duplicating this logic in TypeScript and Rust create scary bugs?
~~~

If the answer is no, keep the behavior native and protect it with generated contracts plus
conformance tests.

If the answer is yes, consider Rust/WASM or another shared implementation strategy.

| Logic | Boundary decision |
| --- | --- |
| Check that `fontId` exists in a font pack | Native TypeScript and native Rust are acceptable. |
| Validate required manifest fields | Generated DTOs plus native validators are acceptable. |
| Compute simple canonical manifest hashes | Duplicate only with golden hash tests. |
| Parse OpenType tables | Rust core, optional WASM package for TypeScript runtimes. |
| Extract glyph outlines | Rust core, optional WASM package. |
| Shape complex text | One canonical engine if the feature is added. |
| Produce pixel-perfect reference output | Rust reference path first; WASM only if browser proof requires it. |
| Walk fixture JSON for docs or tests | TypeScript native. |

## Generated Contract Rule

Shared serialized artifact types must be generated from one source once they leave local-only status.

The source of truth is defined by the Wesley common-type generation plan:

~~~text
schemas/geordi-common.graphql
  -> Geordi common-types generator
  -> packages/render-fixture/src/generated/geordi-common.ts
  -> crates/geordi-ir/src/generated/geordi_common.rs
~~~

Generated contracts own:

- data-transfer object names;
- field names and casing;
- optionality;
- scalar mappings;
- literal profile constants;
- array and nested object shape;
- target-language derives and interface modifiers.

Generated contracts do not own:

- semantic validation;
- custom error classes;
- path locality checks;
- hash verification;
- file IO;
- renderer preparation;
- browser rendering;
- native rendering.

Handwritten code must not define equivalent serialized DTO shapes in multiple languages after the
contract type has moved to the common schema.

## Validator Policy

Simple validators may be implemented natively in both TypeScript and Rust when all of these are true:

- the validator depends only on already-loaded generated DTOs;
- the rule is local, structural, or relational across small in-memory artifacts;
- the rule emits a stable diagnostic code and path;
- the shared conformance corpus covers valid, invalid, and edge cases;
- the validator has no parsing, shaping, rasterization, font-table, or binary-format semantics.

Promote a validator away from duplicated native implementations when any of these become true:

- it requires format-specific binary parsing;
- it depends on deep algorithmic behavior;
- it carries security risk from hostile input;
- it is expensive enough to matter in normal workflows;
- drift between TypeScript and Rust would undermine a render-everywhere claim.

Promotion options are:

- generated validator from schema or rule metadata;
- shared Rust core exposed through an optional WASM package;
- table-driven rule engine generated for both targets;
- stricter cross-runtime golden corpus while the shared implementation is being designed.

## Diagnostic Code Policy

Cross-runtime comparisons must anchor on stable diagnostic identity, not prose messages.

Validation issues should include:

| Field | Contract |
| --- | --- |
| `code` | Stable machine-readable diagnostic identity. |
| `path` | Stable JSON path when the issue maps to a JSON location. |
| `severity` | Error or warning when the validator participates in the broader diagnostic pipeline. |
| `message` | Human-readable text that may improve over time. |
| `details` | Optional deterministic JSON object for structured evidence. |

Conformance tests must compare `code` and `path`. They may snapshot `details` when details are part
of the contract. They must not require identical prose `message` text across TypeScript and Rust.

Example strict text diagnostic identities:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_UNKNOWN_FONT_ID` | A glyph run references a font id absent from the referenced font pack. |
| `GEORDI_TEXT_UNKNOWN_LINE_BOX_ID` | A glyph run references a line box id absent from the fixture. |
| `GEORDI_TEXT_BAD_GLYPH_ID` | A positioned glyph uses an invalid glyph id for the active profile. |
| `GEORDI_TEXT_BAD_FIXED_POSITION` | A strict text coordinate violates the fixed-point profile. |
| `GEORDI_TEXT_UNSUPPORTED_PROFILE` | The artifact requests a text profile unsupported by the validator or renderer. |

If a strict text issue is surfaced through the compiler diagnostic pipeline, map it to the existing
`GEORDI_E_*` or `GEORDI_W_*` taxonomy at that boundary. The fixture-level diagnostic identity should
still remain stable.

## Shared Conformance Harness

The conformance harness is more important than a WASM wrapper for ordinary validation.

Recommended corpus layout:

~~~text
fixtures/conformance/render-fixture/
  valid/
  invalid/
  edge/
  expected/
~~~

Each fixture should declare or imply:

- artifact path;
- artifact kind;
- expected pass/fail result;
- expected diagnostic codes;
- expected JSON paths;
- optional expected canonical hash;
- optional expected receipt fragment.

Both TypeScript and Rust runners should emit normalized receipts:

~~~json
{
  "fixture": "strict-text/unknown-font-id.geordi.json",
  "runtime": "typescript",
  "ok": false,
  "diagnostics": [
    {
      "code": "GEORDI_TEXT_UNKNOWN_FONT_ID",
      "path": "$.glyphRuns[0].fontId"
    }
  ]
}
~~~

The comparison step should ignore runtime-specific stack traces, class names, and prose messages.
It should fail on mismatched acceptance, diagnostic code, diagnostic path, canonical hash, or receipt
identity when those fields are declared as part of the fixture expectation.

## Package Boundary Recommendation

Keep ordinary TypeScript packages lightweight:

~~~text
@flyingrobots/geordi-core
@flyingrobots/geordi-render-fixture
@flyingrobots/geordi-runtime-webgl
~~~

Introduce an optional WASM package only when a hard kernel exists:

~~~text
@flyingrobots/geordi-wasm-kernel
~~~

The optional WASM package may expose APIs such as:

~~~ts
import { extractGlyphOutlines, parseFont } from '@flyingrobots/geordi-wasm-kernel';
~~~

The core TypeScript packages must not depend on that package until a design document explicitly
promotes the kernel to required runtime behavior.

## Current Strict Text Interpretation

The current strict text TypeScript and Rust DTOs are provisional. The S039 font-reference validator
and S040 line-box geometry validator are acceptable because they are simple, structural, and
protected by paired TypeScript and Rust tests.

It is not a precedent for long-term hand-authored DTO mirroring.

Near-term strict text work should:

1. keep adding handwritten behavior only around the existing provisional DTOs;
2. avoid adding new mirrored DTO shapes before the common-type generator exists;
3. add stable strict text diagnostic identities;
4. add shared conformance fixtures for valid, invalid, and edge artifacts;
5. replace provisional DTO definitions with generated TypeScript and Rust outputs before strict text
   is advertised as a rendering capability.

## Migration Plan

1. Document the boundary policy in active design docs.
2. Add strict text diagnostic identities to fixture validation results.
3. Add the first shared conformance corpus for font pack and strict text fixture validation.
4. Add TypeScript and Rust conformance runners that emit normalized receipts.
5. Implement Wesley/common-type generation for shared serialized DTOs.
6. Re-export generated TypeScript DTOs from TypeScript packages.
7. Include generated Rust DTOs from Rust crates.
8. Move handwritten validators to generated DTO inputs.
9. Remove duplicated handwritten DTO definitions.
10. Design an optional Rust/WASM kernel only after the font, glyph, or raster algorithm exists.

## Review Checklist

Use this checklist for future PRs that touch TypeScript/Rust shared behavior:

- Does the PR add a serialized artifact type in both TypeScript and Rust?
- If yes, is it generated from the common schema?
- If it is not generated yet, is the type explicitly provisional and covered by a migration note?
- Does the PR compare diagnostic codes instead of prose messages?
- Does the PR add conformance fixtures for valid, invalid, and edge behavior?
- Does the PR introduce a WASM dependency?
- If yes, does the PR identify the hard kernel that justifies WASM?
- Does ordinary fixture validation remain usable without async WASM initialization?
- Do browser, Node, native, and CI workflows still have clear package boundaries?

## Non-Goals

This policy does not implement:

- the Wesley/common-type generator;
- strict text diagnostic code plumbing;
- the shared conformance runner;
- a font parser;
- a glyph outline extractor;
- a text shaping engine;
- a WASM package;
- a production raster reference renderer.

It defines the boundary rules those changes must follow.
