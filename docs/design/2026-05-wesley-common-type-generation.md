# Wesley Common Type Generation

**Status**: Drift correction
**Date**: 2026-05-25
**Applies to**: shared Geordi contract DTOs used by TypeScript and Rust

Geordi now has strict text contract shapes that naturally appear in both TypeScript and Rust:

- font-pack manifest DTOs;
- strict text fixture DTOs;
- line box DTOs;
- glyph-run DTOs;
- positioned glyph DTOs;
- receipt DTOs as they mature.

Those shapes must not keep drifting as hand-authored TypeScript interfaces and Rust structs. The
correct long-term boundary is one common schema and generated target-language DTOs.

This document owns DTO generation. The broader runtime boundary policy lives in
[`2026-05-typescript-rust-wasm-boundary.md`](./2026-05-typescript-rust-wasm-boundary.md): TypeScript
packages remain native at browser, Node, tooling, and fixture-authoring edges; Rust remains native at
the renderer and CLI core; WASM is reserved for hard deterministic kernels such as font parsing,
glyph extraction, shaping, and reference raster work.

## Law

Common serialized contract types are generated from a single Wesley schema.

~~~text
common GraphQL SDL -> Wesley Geordi common-types extension -> TypeScript DTOs + Rust DTOs
~~~

Handwritten code may still own:

- validation rules;
- custom error types;
- parsing/loading functions;
- content-addressed hash verification;
- renderer preparation;
- browser/native rendering;
- domain-specific helper APIs.

Handwritten code must not define an equivalent serialized DTO shape independently in multiple
languages once the type belongs to the common contract.

## Scope

The generator owns data-transfer shape, names, field casing, optionality, arrays, scalar mappings,
literal profile constants, and target-language derives/interfaces.

The generator does not own behavior. It does not validate semantic invariants such as duplicate IDs,
path locality, glyph ID non-negativity, line-box references, font references, hash equality, or
profile compatibility. Those remain handwritten and tested at package boundaries.

Handwritten validators that exist in both TypeScript and Rust must emit stable diagnostic identities
and be covered by shared conformance fixtures. Conformance tests compare acceptance, diagnostic code,
JSON path, canonical hash, and receipt identity where applicable. They do not compare prose error
messages as contract text.

## Proposed Schema Location

~~~text
schemas/geordi-common.graphql
~~~

The first schema should include:

~~~graphql
scalar Sha256
scalar RelativePath
scalar Fixed26_6
scalar GlyphId

type FontPackManifest @geordi_common(name: "GeordiFontPackManifest") {
  fontPackVersion: String!
  fonts: [FontFace!]!
}

type FontFace @geordi_common(name: "GeordiFontFace") {
  id: String!
  format: String!
  path: RelativePath!
  sha256: Sha256!
  faceIndex: Int!
  familyName: String!
  styleName: String!
  weight: Int!
  license: FontLicense!
  source: FontSource!
}

type StrictTextFixtureManifest @geordi_common(name: "GeordiStrictTextFixtureManifest") {
  fixtureVersion: String!
  id: String!
  textProfile: String!
  positionEncoding: String!
  fontPackPath: RelativePath!
  features: [String!]!
  semanticText: StrictTextSemanticText!
  lineBoxes: [StrictTextLineBox!]!
  glyphRuns: [GlyphRun!]!
}
~~~

The actual schema should be complete before generation starts, but this sketch captures the intended
shape.

## Generated Outputs

Recommended checked-in generated files:

~~~text
packages/render-fixture/src/generated/geordi-common.ts
crates/geordi-ir/src/generated/geordi_common.rs
~~~

TypeScript output should use:

- `export interface`;
- `readonly` fields;
- literal scalar aliases where useful;
- no `any`;
- no `unknown` outside generated JSON boundary helpers.

Rust output should use:

- `#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]`;
- `#[serde(deny_unknown_fields, rename_all = "camelCase")]`;
- documented public fields if the workspace `missing_docs` lint applies to the module;
- integer newtypes only when the schema says a scalar needs stronger typing.

## Wesley Extension Shape

The existing `@flyingrobots/geordi-wesley-generator` package can grow a second path:

~~~text
GeordiGeneratorPlugin             SDL -> canonical scene artifacts
GeordiCommonTypesGeneratorPlugin  SDL -> TypeScript/Rust common DTOs
~~~

The common-types generator should:

1. Parse GraphQL SDL.
2. Find `@geordi_common` object types.
3. Resolve fields, non-null, list, and scalar mappings.
4. Emit deterministic TypeScript.
5. Emit deterministic Rust.
6. Emit a manifest/receipt containing schema hash, generator version, targets, and output hashes.

The generator must fail loudly for unsupported SDL features:

- unions;
- interfaces;
- recursive object graphs unless explicitly supported;
- nullable list item ambiguity;
- unsupported scalars;
- field names that cannot map to Rust snake case deterministically;
- duplicate target names;
- target-language reserved words.

## Build Rule

Generated files must be reproducible from the schema and generator:

~~~bash
pnpm --filter @flyingrobots/geordi-wesley-generator test
pnpm geordi-common-types
git diff --exit-code packages/render-fixture/src/generated crates/geordi-ir/src/generated
~~~

The exact script name can change, but CI must prevent stale generated outputs.

## Migration Rule

Existing hand-authored DTOs from S022, S023, S032, and S033 are provisional. Before strict text
rendering is advertised, the duplicated DTO definitions must be replaced by generated TypeScript
and Rust outputs or explicitly marked local-only.

Recommended migration sequence:

1. Add common schema and generator tests.
2. Generate TypeScript/Rust DTO files.
3. Re-export generated TypeScript DTOs from `@flyingrobots/geordi-render-fixture`.
4. Include generated Rust DTOs from `geordi-ir`.
5. Move handwritten validation functions to accept generated DTOs.
6. Add stale-generation CI.
7. Remove duplicated handwritten DTO definitions.

## Impact On Current Slices

S039 through S041 can continue only if they do not add new mirrored DTO shapes. They may add
validation functions, fixtures, and tests around the existing provisional DTOs. The next structural
type change should go through the common schema path.

The glyph tooling spike should also consume generated DTOs once the generator exists. Its UI models
may be local, but serialized Geordi artifacts must come from the shared schema.
