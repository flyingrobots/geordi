# Lower a Profunctor Page into structural Geordi evidence

This reference describes the bounded
`geordi-profunctor-page-structural/1` target implemented by
`@flyingrobots/geordi-profunctor-page`. Use it to reproduce the checked Keep
proof, inspect its artifacts, or integrate the lowerer without expanding its
claims.

The website remains authoritative for page composition, publication, prose,
reading order, and source occurrences. Geordi owns the structural target
geometry, render-node identities, target map, receipt, and diagnostic SVG.

## Supported input

The lowerer accepts exact UTF-8 source strings for one aligned artifact family:

| Input | Required version |
| --- | --- |
| Semantic page | `profunctor-page/0` |
| Page source map | `profunctor-page-source-map/0` |
| Build manifest | `profunctor-build-manifest/0` |

Before lowering, it validates JSON shape, exact versions, cross-artifact page
and route identity, the exact page-byte digest, dependency order, node and slot
relationships, token references, and source-occurrence ownership. Unsupported
visible block definitions fail closed. An unsupported hidden block may remain
in the target map with no render node and an explicit residual.

The current profile supports these block definitions:

- `block:page`
- `block:project-hero`
- `block:project-facts`
- `block:project-documentation`
- `block:project-related`

## Output

One successful lowering returns four UTF-8 artifacts:

| Path | Contract |
| --- | --- |
| `scene.geordi.json` | Valid resolved-rectangle `geordi-ir/1` |
| `scene.geordi.map.json` | `geordi-profunctor-page-map/1` |
| `scene.geordi.json.receipt` | `geordi-profunctor-page-receipt/1` |
| `scene.geordi.preview.svg` | Structural diagnostic witness |

The target map preserves page-node, template-node, source-occurrence, token,
action, and residual evidence. The receipt binds the exact input and output
bytes and records `upstreamClaimsInherited: false`.

The SVG labels are host SVG text used only for inspection. They are not Geordi
`Text` nodes and do not establish a general-text claim.

## Reproduce the checked proof

Install the workspace dependencies, then generate the Geordi-owned outputs:

```bash
pnpm generate:profunctor-page-target
```

Expected output:

```text
Wrote 4 Profunctor Page target proof artifacts.
```

Verify the committed inventory, exact bytes, and package tests:

```bash
pnpm test:profunctor-page-target
```

The command reports that four artifacts were verified before running the
package's positive and negative tests.

The canonical fixture and generated evidence live under
[`../fixtures/profunctor-page/project-keep/`](../fixtures/profunctor-page/project-keep/).
Do not edit the three input files in Geordi. Refresh them only from an explicit
website contract revision and update their pinned hashes and provenance
together.

## Programmatic use

```typescript
import { lowerProfunctorPageArtifacts } from '@flyingrobots/geordi-profunctor-page';

const result = lowerProfunctorPageArtifacts({
  buildManifest: {
    filename: 'page.profunctor.build.json',
    source: buildManifestSource,
  },
  page: {
    filename: 'page.profunctor.json',
    source: pageSource,
  },
  sourceMap: {
    filename: 'page.profunctor.map.json',
    source: sourceMapSource,
  },
});
```

The function either returns all four artifacts or throws
`ProfunctorPageTargetError`. The error's `code` is the stable contract; `path`
and `detail` are diagnostic context.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `GEORDI_PAGE_INPUT_JSON_INVALID` | An input is not valid canonical JSON. |
| `GEORDI_PAGE_INPUT_VERSION_UNSUPPORTED` | An artifact version is unsupported. |
| `GEORDI_PAGE_INPUT_IDENTITY_MISMATCH` | Page, route, entity, or dependency identity disagrees. |
| `GEORDI_PAGE_INPUT_DIGEST_MISMATCH` | The build manifest does not bind the exact page bytes. |
| `GEORDI_PAGE_INPUT_REFERENCE_INVALID` | A node, slot, reading-order, token, or other reference is invalid. |
| `GEORDI_PAGE_INPUT_SOURCE_AMBIGUOUS` | Source evidence is missing, duplicated, mismatched, or unowned. |
| `GEORDI_PAGE_BLOCK_UNSUPPORTED` | A visible block has no target geometry. |
| `GEORDI_PAGE_OUTPUT_INVALID` | Emitted IR violates the core Geordi contract. |

## Claims and limits

This target claims:

- deterministic resolved rectangle geometry;
- page-node to render-node identity;
- preserved structural inspection evidence; and
- a deterministic SVG witness derived from the same lowering result.

It does not claim:

- semantic HTML or browser landmarks;
- accessibility-tree behavior;
- native-link activation;
- general or public prose rendering;
- CSS or platform text;
- website pixel parity; or
- inheritance of upstream HTML-target claims.

The accepted architecture and complete test plan are in
[Profunctor Page target proof](./design/2026-07-profunctor-page-target-proof.md).
