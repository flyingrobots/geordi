# GPVue Render Fixture Pipeline Design

**Status**: Draft
**Date**: 2026-05-23
**Parent Design**: [`2026-05-render-everywhere-demo.md`](./2026-05-render-everywhere-demo.md)

## Purpose

GPVue is the planned developer-facing SDK for authoring Geordi scenes from Vue-like components. The
render-everywhere demo should eventually start from GPVue source, but the first portability proof
must not depend on a compiler that does not exist yet.

This design defines how GPVue joins the harness without making false claims.

## Staging Policy

There are three stages.

### Stage 1: Artifact-First

The shared fixture has canonical IR and no GPVue source claim.

```text
scene.geordi.json
scene.geordi.json.receipt
fixture.json
```

Claim:

```text
Geordi IR renders in browser and native Rust.
```

### Stage 2: Draft GPVue Source

The fixture adds illustrative GPVue source, but the manifest marks it as draft.

```text
source.gpvue
scene.geordi.json
fixture.json
```

Claim:

```text
This is the intended GPVue authoring shape for the fixture.
The canonical IR remains the authoritative artifact.
```

Any command that tries to compile `source.gpvue` before the compiler exists must fail loudly.

### Stage 3: Compiler-Produced Artifact

The GPVue compiler emits the canonical IR artifact.

```text
source.gpvue
-> GPVue compiler
-> scene.geordi.json
-> browser runtime
-> native Rust runtime
```

Claim:

```text
GPVue compiles once to Geordi IR, and that artifact renders everywhere.
```

## Fixture Manifest Fields

The fixture manifest should leave room for GPVue without requiring it at first:

```json
{
  "fixtureVersion": "geordi-render-fixture/1",
  "id": "render-everywhere:hello-panel",
  "source": {
    "kind": "none"
  },
  "scenePath": "scene.geordi.json"
}
```

Draft GPVue source:

```json
{
  "source": {
    "kind": "gpvue-draft",
    "path": "source.gpvue"
  }
}
```

Compiler-backed GPVue source:

```json
{
  "source": {
    "kind": "gpvue",
    "path": "source.gpvue",
    "compiler": "@flyingrobots/geordi-gpvue",
    "compilerVersion": "0.1.0"
  }
}
```

## Compiler Boundary

The future GPVue compiler should be a package boundary, not code embedded in the browser demo.

Preferred package:

```text
packages/gpvue/
  package.json
  src/
    compileGpVue.ts
    errors.ts
    ports/
      parseVue.ts
      emitCanonicalAst.ts
      compileToGeordiIr.ts
  test/
    compileGpVue.test.ts
```

Browser and Rust harnesses consume emitted artifacts. They do not parse GPVue source.

## GPVue MVP Scope

The first GPVue fixture should lower only deterministic static rectangles.

Supported authoring subset:

```text
static component root
absolute/resolved geometry
solid fills
static node ids
no CSS cascade
no browser layout reads
no text in the first deterministic fixture
```

Possible draft source:

```vue
<template>
  <Scene id="hello-panel" :width="640" :height="360">
    <Rect id="background" :x="0" :y="0" :width="640" :height="360" fill="#101820" />
    <Rect id="panel" :x="48" :y="48" :width="544" :height="264" fill="#1f2937" />
    <Rect id="accent" :x="48" :y="48" :width="544" :height="8" fill="#38bdf8" />
  </Scene>
</template>
```

The exact GPVue syntax is not locked by this draft. The compiler design must decide whether these
are real Vue components, macros, SFC custom blocks, or a constrained template DSL.

## Canonical Output Requirements

When GPVue compilation exists, it must emit:

- `scene.geordi.json`;
- `scene.geordi.json.receipt`;
- `scene.geordi.map.json`;
- diagnostics with source locations;
- stable artifact hashes for identical inputs.

The emitted IR must:

- use `irVersion: "geordi-ir/1"`;
- use `numericProfile: "geordi-finite-binary64/1"`;
- declare only the feature requirements it actually needs;
- remain deterministic across machines.

## Source Map Requirement

GPVue source maps should connect rendered IR nodes back to GPVue source spans.

Minimum source map entry:

```json
{
  "id": "panel",
  "source": {
    "file": "source.gpvue",
    "line": 4,
    "column": 5
  }
}
```

This is important for future browser harness explainability:

```text
click rendered node
-> node id
-> source map entry
-> GPVue source span
```

## Failure Cases

The GPVue compiler must fail loudly on unsupported authoring constructs.

Initial explicit failures:

- CSS cascade;
- class selectors that require runtime CSS resolution;
- grid or flow layout before profile support;
- dynamic style expressions without a deterministic lowering rule;
- text in a strict deterministic fixture before strict text support;
- unsupported Vue directives.

Errors should be custom error classes with stable diagnostic codes once the package exists.

## Test Plan

Compiler tests:

1. Minimal rectangle fixture compiles.
2. Output IR is canonical and stable.
3. Receipt hash matches emitted IR.
4. Source map points to GPVue source.
5. Unsupported CSS fails loudly.
6. Recompiling identical input produces identical artifacts.

Harness tests:

1. Compile GPVue fixture.
2. Browser harness renders emitted artifact.
3. Rust harness renders emitted artifact.
4. Both report the same artifact hash.

## Acceptance Criteria

- GPVue source does not become a runtime dependency.
- Harnesses remain artifact-first.
- Draft GPVue fixtures are marked as draft until compiler support exists.
- GPVue compiler output uses the same canonical artifact paths as compiler-core.
- Unsupported authoring constructs fail before runtime rendering.

## Open Questions

- Is GPVue a package named `@flyingrobots/geordi-gpvue`, `@flyingrobots/gpvue`, or a subcommand in a
  future CLI?
- Should GPVue accept real Vue SFCs, or a deliberately constrained SFC-like DSL?
- Should GPVue lower directly to `GeordiIr`, or first to canonical AST and then through
  compiler-core?
- How much static expression evaluation belongs in GPVue v0?
- How should GPVue represent component reuse without introducing runtime component semantics?
