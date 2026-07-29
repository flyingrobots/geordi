# Keep Profunctor Page Conformance Fixture

These three input files are byte-identical copies of the canonical website
fixture at source commit
[`6a411d7`](https://github.com/flyingrobots/profunctor-optics-website/commit/6a411d72c55edb6e4acc3b556d5cf96c303376f5).

| File | SHA-256 |
| --- | --- |
| `input/page.profunctor.json` | `12b90184b4e238bc6bd7db944af8651900b830ea76ba775ab7c7ee20be051e73` |
| `input/page.profunctor.map.json` | `a40e97f2fd513519092d2a131c0d7107517b92bd7e9cfd5e79df70a65a3fe044` |
| `input/page.profunctor.build.json` | `975efc9c701cbd7a6981787150748b76d1e53fd83cd424128667bc8014687ab7` |

The website remains the authority for these bytes. Geordi tests refuse stale or
contradictory copies before lowering.

Generate the Geordi-owned target evidence:

```bash
pnpm generate:profunctor-page-target
```

Verify the checked output inventory and exact bytes:

```bash
pnpm test:profunctor-page-target
```

The generated directory contains deterministic `geordi-ir/1`, target-map,
receipt, and structural SVG evidence. The SVG is a diagnostic witness; its host
SVG labels do not establish a Geordi general-text claim.
