# Contract Gate Replay of flyingrobots/geordi#212

Overlay files for the golden test `scripts/contract-gate-replay-212.test.mjs`, which runs the
contract gate over the change that flyingrobots/geordi#212 merged on 2026-11-22.

## The two trees

The test reads both trees from git with `git archive`, so the code, docs and fixtures are the
recorded bytes of those commits:

| Tree | Commit | What it is |
| --- | --- | --- |
| base | `fa474ecb74cbfb1cccb34db10f34c3b641c9961e` | The first parent on `main` of the merge of flyingrobots/geordi#212 |
| head | `52ba6bbf96508aaf951fb7c70cff2c19bb2a6799` | The merge of flyingrobots/geordi#212 |

It extracts `Cargo.toml`, `Cargo.lock`, `crates/geordi-ir`, `docs/ERROR_CODES.md` and
`fixtures/ray-traced-scene` from each commit. The gate builds each tree's own `geordi-ir` to
compute the reference scene hash.

## The overlays

Neither commit has a contract registry or a JSON Schema for `geordi-ray-traced-scene/1`; both
were added by flyingrobots/geordi#217. The test writes these files over the two trees as if they
had existed then. They are reconstructions, not recorded bytes:

| File | Laid over | Content |
| --- | --- | --- |
| `head.scene.schema.json` | head, as `schemas/geordi-ray-traced-scene/1/scene.schema.json` | A copy of the schema as flyingrobots/geordi#217 wrote it, for the head commit's format |
| `base.scene.schema.json` | base, at the same path | The same schema with the directional light carrying `radiance` instead of `irradiance`, the only difference in shape between the two commits |
| `registry.json` | both, as `contracts/registry.json` | One contract, `geordi-ray-traced-scene/1`; the test sets its status to `draft` or `frozen` |
| `registry-version-raised.json` | head | Version 1 `superseded` by a version 2 that carries the new format |
| `head-v2.scene.schema.json` | head, as `schemas/geordi-ray-traced-scene/2/scene.schema.json` | `head.scene.schema.json` with its `$id`, `title` and `sceneVersion` naming version 2; the test writes the head commit's reference scene with `sceneVersion` set to version 2 as version 2's example |
| `record.json` | head | A `breaking` change record for version 1 |
| `record-version-2.json`, `record-version-1-superseded.json` | head | The two records a version raise needs |

The copies are frozen on purpose: the live schema may change, and this test must keep
replaying the change as it was. The test does not use the live registry.
