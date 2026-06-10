# Bunny And Geordi Interop

## Purpose

Geordi should remain the portable authored-scene and render-proof pipeline.
Bunny should become the neutral graphics commons underneath it.

This split lets Geordi target WebGPU, WebGL, Metal, DirectX, Unity, Unreal,
Godot, Bijou, and native renderers without forcing every consumer to depend on
Echo or duplicating low-level graphics math across projects.

## Product Ambition

The long-term Geordi path is:

```text
Figma / After Effects / focused CSS subset / GPVue / authoring tools
  -> Geordi IR
  -> Geordi renderer or engine adapter
  -> deterministic render receipt
```

Candidate render and engine adapters include:

- Geordi-WebGPU
- Geordi-WebGL
- Geordi-Metal
- Geordi-DirectX
- Geordi-Bijou
- Unity
- Unreal Engine
- Godot
- Echo-sidecar render witnesses

Geordi is not trying to become a full browser, full CSS engine, full After
Effects clone, or game engine. It should support explicit authored-scene
profiles and expand compatibility deliberately.

## Ownership Boundary

Bunny owns reusable graphics substrate:

- math
- geometry
- query contracts
- mesh contracts
- optics
- lighting helpers

Geordi owns render-everywhere proof:

- IR
- text policy
- animation profiles
- feature negotiation
- renderer backends
- receipts

Echo owns causal runtime concerns:

- provenance
- strands
- braids
- transactions
- retained evidence

Bijou owns terminal presentation and interactive surface behavior.

Bunny may be used by Geordi renderers and compiler frontends. Bunny must not
know Geordi IR, render receipts, renderer feature negotiation, strict text
proof claims, Figma frames, browser DOM nodes, or engine object models.

## Text Rendering Boundary

Geordi keeps text-rendering ownership.

Bunny can provide geometry, transforms, bounds, scalar profiles, and primitive
shape/query helpers used by text layout or hit testing. Bunny should not own:

- font-pack policy
- glyph-run evidence
- text shaping proof
- strict positioned glyph-run receipts
- renderer-specific glyph rasterization claims

Geordi's strict text work remains a render-proof concern because text output is
where cross-runtime determinism becomes visible and user-facing.

## Schema And Wesley Boundary

Bunny owns shared graphics schemas:

```text
schemas/bunny/v0/*.graphql
```

Geordi may generate Rust and TypeScript DTOs from Bunny schemas through a
Bunny/Wesley extension. Geordi should not copy Bunny primitives into
Geordi-owned GraphQL schemas unless it is adapting them into Geordi-specific IR
or receipt structures.

The rule is:

```text
Shared primitive graphics contract -> Bunny schema
Render artifact, feature profile, or receipt -> Geordi schema
```

## Engine Adapter Boundary

Unity, Unreal, Godot, and other engine adapters should translate Geordi IR into
engine-native resources while preserving Geordi artifact identity and receipt
policy.

Engine adapters may use Bunny for:

- transform math
- bounds
- clipping
- hit testing
- mesh identity
- optics and lighting helper math
- deterministic fixture comparison

Engine adapters must not make the engine runtime the authority for Geordi IR.
The Geordi artifact and its receipt remain the proof surface.

## Invariants

- Geordi owns render-everywhere proof, not low-level graphics primitives.
- Bunny owns reusable graphics primitives, not render receipts.
- Geordi can depend on Bunny; Bunny must not depend on Geordi.
- Strict text proof remains in Geordi.
- Authored-scene profiles must be explicit and versioned.
- Browser and design-tool compatibility should grow by supported profiles, not
  broad claims of full CSS, DOM, Figma, or After Effects compatibility.
- Engine adapters are backends, not new sources of truth.

## First Useful Slice

The first interop slice should not replace Geordi rendering. It should:

1. Depend on or vendor a Bunny schema fixture.
2. Generate Geordi-side DTOs from the Bunny-owned schema.
3. Use one Bunny primitive in a Geordi proof path without changing the proof
   claim.
4. Keep existing strict text and render-everywhere gates green.
