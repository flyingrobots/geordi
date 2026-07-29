# Profunctor Page Target Proof

**Status**: Accepted
**Date**: 2026-07-28
**Issue**: [#52](https://github.com/flyingrobots/geordi/issues/52)
**Milestone**:
[Portable Page Target Proof](https://github.com/flyingrobots/geordi/milestone/1)
**Upstream campaign**:
[profunctor-optics-website#14](https://github.com/flyingrobots/profunctor-optics-website/issues/14)

## Reader job

This document tells a Geordi contributor how to implement and verify the first
bounded Profunctor Page target without widening Geordi's rendering claims or
moving page authority into this repository.

## Objective

Consume the canonical Keep page specimen from website source commit
`6a411d72c55edb6e4acc3b556d5cf96c303376f5` and emit deterministic structural
Geordi evidence:

```text
profunctor-page/0
+ profunctor-page-source-map/0
+ profunctor-build-manifest/0
  -> @flyingrobots/geordi-profunctor-page
    -> geordi-ir/1
    -> geordi-profunctor-page-map/1
    -> geordi-profunctor-page-receipt/1
    -> structural SVG witness
```

The proof ends when all four outputs are byte-stable, all input and
cross-artifact invariants fail closed, every visible page node is accounted
for, the preview labels its nonclaims, full repository gates are green, and the
reviewed pull request is merged.

## Authority

| Concern | Authority |
| --- | --- |
| Page, composition, publication, prose, reading order | Website artifact |
| Source occurrences and upstream residuals | Website source map |
| Upstream artifact digest and semantic HTML claims | Website build manifest |
| Structural geometry and render-node identities | Geordi lowerer |
| Target mappings and target residuals | Geordi target map |
| Output hashes and target claims | Geordi receipt |
| Diagnostic presentation | Geordi SVG witness |

The copied fixture is conformance input, not authored content. Its
`browser-native-flow` and `semantic-document-structure` claims apply only to
the originating HTML target. The Geordi receipt records them as upstream claims
that were not inherited.

## Target profile

The target profile is:

```text
geordi-profunctor-page-structural/1
```

It supports:

- deterministic resolved rectangle geometry;
- one unique render node for every visible page node;
- source, template, page, token, link, and action inspection;
- a Geordi-owned target map and receipt; and
- an SVG diagnostic witness generated from the same lowering result.

It does not support or claim:

- general or public prose rendering;
- CSS or platform text;
- host font lookup, shaping, fallback, or wrapping;
- native-link activation;
- accessibility-tree behavior;
- browser landmarks or semantic HTML;
- pixel equality with the website or future Bijou output; or
- mutation of the upstream artifacts.

## Package boundary

The adapter lives in `packages/profunctor-page`. It depends on
`@flyingrobots/geordi-core` for canonical JSON, versioned IR constants,
numeric-profile constants, feature vocabulary, and IR validation.

The package does not import website implementation code and does not publish a
copy of the complete Profunctor Page contract. It validates only the exact
versioned fields and cross-artifact relationships required by this target.
Contract extraction remains an upstream decision after Geordi and Bijou expose
the proven shared boundary.

## Input law

The lowerer receives exact source strings and filenames for all three
artifacts. Before output:

1. Parse each input through Geordi's canonical JSON port.
2. Require the exact three artifact versions.
3. Require non-empty, unique page, template, source-occurrence, and block
   identities wherever the target consumes them.
4. Require page identity to agree across page, source map, and manifest.
5. Require the manifest artifact digest to match the exact page bytes.
6. Require manifest dependencies and route to agree with the page artifact.
7. Require every reading-order ID, root ID, landmark ID, outline ID, and slot
   child ID to name an existing page node.
8. Require every source binding to resolve to exactly one source-map entry for
   the same page node and source-occurrence identity.
9. Reject duplicate or ambiguous source-map identities.
10. Reject unsupported visible block definitions instead of inventing
    geometry.
11. Reject duplicate visible block definitions because each supported
    definition owns one fixed geometry.
12. Accept token references only when they are own keys of the target profile.
13. Reject duplicate page-wide or node-level capability requirements.

Array order is semantic and remains unchanged. Object keys are serialized
through the canonical JSON port. Locale-sensitive comparison is forbidden.

## Structural lowering

The Keep proof uses a fixed 1440 by 1120 pixel canvas. The supported page
family maps:

| Page block | Geordi kind | Geometry |
| --- | --- | --- |
| `block:page` | `Rect` | Full canvas |
| `block:project-hero` | `Rect` | Full-width opening region |
| `block:project-facts` | `Rect` | Left middle region |
| `block:project-documentation` | `Rect` | Right middle region |
| `block:project-related` | `Rect` | Full-width closing region |

Every Geordi node records the originating page-node and template-node IDs plus
the selected source token reference in its `props`. Concrete colors are target
profile values, not inherited browser CSS values.

The IR requires only:

```text
geordi/core/1
layout.resolved
shape.rect
paint.solid
```

No `Text` node enters the IR. Human-readable labels appear only in the
diagnostic SVG and are accompanied by an explicit nonclaim.

## Target map

`geordi-profunctor-page-map/1` records:

- page and target profile identity;
- input page-node and template-node identity;
- unique target render-node identity;
- source occurrence and upstream source evidence when present;
- token role, token reference, and target profile value;
- preserved links and actions;
- page-wide and node-level input capability requirements;
- page-wide and node-level unsupported-capability residuals; and
- explicit target residuals.

Every visible page node has exactly one map entry and exactly one render node.
A hidden page node has no geometry and must carry an explicit hidden residual.
The first specimen contains no hidden nodes.

## Receipt

`geordi-profunctor-page-receipt/1` records:

- the exact hashes of all three input files;
- the exact hashes of IR, target map, and SVG outputs;
- page, composition, entity, route, target profile, IR version, and numeric
  profile identities;
- input and output node counts;
- page-wide input capability requirements;
- supported target claims;
- explicit target nonclaims;
- upstream claims and `upstreamClaimsInherited: false`; and
- canonical comparator and hash algorithm identities.

The receipt must never repeat an upstream HTML claim as a Geordi target claim.

## Preview

The SVG witness is diagnostic evidence, not a Geordi renderer. It renders the
same fixed structural rectangles as the IR and adds:

- page and block labels;
- page-node and render-node identities;
- token references;
- preserved action/link counts; and
- a visible nonclaim footer.

The SVG uses no remote assets, scripts, animation, or nondeterministic
timestamps.

## Diagnostics

The package uses custom errors with stable diagnostic codes. At minimum:

| Code | Condition |
| --- | --- |
| `GEORDI_PAGE_INPUT_JSON_INVALID` | An input is not valid JSON. |
| `GEORDI_PAGE_INPUT_VERSION_UNSUPPORTED` | An artifact version is not accepted. |
| `GEORDI_PAGE_INPUT_IDENTITY_MISMATCH` | Page or route identity disagrees. |
| `GEORDI_PAGE_INPUT_DIGEST_MISMATCH` | The declared page digest is stale. |
| `GEORDI_PAGE_INPUT_REFERENCE_INVALID` | A node relationship is missing or dangling. |
| `GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS` | A source binding has zero or multiple mappings. |
| `GEORDI_PAGE_BLOCK_UNSUPPORTED` | A visible block has no declared geometry. |
| `GEORDI_PAGE_OUTPUT_INVALID` | Emitted IR fails Geordi validation. |

Error prose is explanatory; the diagnostic code is the contract.

## Test plan

### Exact positive evidence

- The copied three-file fixture matches the upstream SHA-256 values.
- Repeated lowering produces byte-identical outputs.
- The IR validates as `geordi-ir/1` and uses the declared numeric and feature
  profiles.
- The IR has five unique nodes in page reading order.
- Every visible page node round-trips through the target map.
- Existing source occurrences retain their exact upstream selectors and
  digests.
- Tokens and link/action facts remain inspectable.
- The receipt hashes exact input and output bytes.
- The SVG contains every node identity and all declared nonclaims.

### Negative evidence

- malformed JSON;
- unsupported artifact version;
- stale page digest;
- mismatched page identity or route;
- duplicate page-node ID;
- dangling root, reading-order, slot, outline, or landmark reference;
- missing, duplicate, or mismatched source occurrence;
- unsupported visible block;
- duplicate visible fixed-geometry block;
- missing, undeclared, or inherited target token reference;
- missing page-wide capability evidence; and
- invalid emitted IR.

Each negative test asserts a stable diagnostic code and no output.

## Slice sequence

| Slice | Deliverable | Acceptance |
| --- | --- | --- |
| PTP001 | Law, roadmap, docs spine, and test plan | Repository docs agree; documentation gate passes. |
| PTP002 | Exact fixture and intake validator | Positive fixture parses; malformed and stale evidence fail before output. |
| PTP003 | IR, target map, and receipt | Outputs are valid, complete, and byte-stable. |
| PTP004 | SVG witness and fixture generator | Preview is deterministic, inspectable, and explicitly bounded. |
| PTP005 | Negative matrix and living docs | All named failures are covered; docs describe current behavior. |
| PTP006 | Full repository gate and PR | Worktree clean, CI/review green, normal merge complete. |

The sequence is linear because each artifact depends on the preceding contract.
Do not parallelize slices by weakening cross-artifact validation.

## Verification

For documentation-only slices:

```bash
pnpm test:docs
git diff --check
```

For implementation slices:

```bash
pnpm --filter @flyingrobots/geordi-profunctor-page typecheck
pnpm --filter @flyingrobots/geordi-profunctor-page lint
pnpm --filter @flyingrobots/geordi-profunctor-page test
```

Before PR:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:docs
pnpm test:package-names
pnpm test:repo-sludge
pnpm test:placeholders
pnpm test:exports
pnpm test:render-everywhere:gpvue
pnpm test:render-everywhere:bunny
pnpm test:render-everywhere:strict-text-generated
cargo fmt --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
git diff --check
```
