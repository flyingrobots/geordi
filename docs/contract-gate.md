# Contract Gate

**Command**: `node scripts/contract-gate.mjs` (`pnpm contracts:check`)
**Registry**: [`contracts/registry.json`](../contracts/registry.json)
**Change records**: [`contracts/changes/`](../contracts/changes/)
**Issue**: [flyingrobots/geordi#217](https://github.com/flyingrobots/geordi/issues/217)
**Test plan**: [`contract-gate-test-plan.md`](./contract-gate-test-plan.md)

The contract gate compares the public contracts of a pull request with those of its base. Each
contract surface is computed from source on both trees by the same code, so a pull request cannot
pass by changing a contract and its pinned hash or fixtures together. That is how
flyingrobots/geordi#212 renamed a field of `geordi-ray-traced-scene/1` on a green build. Tests
assert what the code does now. The gate asserts what changed since the base, and requires the
change to be declared.

## Registry

`contracts/registry.json` (schema:
[`schemas/geordi-contract-registry/registry.schema.json`](../schemas/geordi-contract-registry/registry.schema.json))
lists three kinds of entry:

- **`contracts`**: a serialized contract that the gate compares. An entry has:
  - an identifier and major version, written `name/N`;
  - a status, with `statusEvidence` quoting where the repository documents that status;
  - a JSON Schema;
  - one or more canonical example documents, each with its encoder;
  - optionally, the diagnostic codes it can produce;
  - optionally, the Rust source files that carry its public API.
- **`messageSchemaFamilies`**: a directory of CLI message schemas. Each `*.schema.json` in the
  directory is one contract, `<x-schema-id>/<major of x-schema-version>`, compared by its schema.
- **`ungated`**: a public contract the gate does not compare yet, with its documented status and
  the reason. The gate prints these entries as `coverage` lines with `gated: false`, so the gap
  shows in every run.

### Status

| Status | Meaning | What the gate requires |
| --- | --- | --- |
| `draft` | The contract may still change | Any difference needs a change record |
| `frozen` | Consumers rely on this version | An additive difference needs a change record. A breaking or unknown difference fails, unless the version is raised |
| `superseded` | Replaced by a higher version, named in `supersededBy` | Its schema and example files stay byte for byte as they were on the base |

Each contract starts with the status the repository documents for it. No contract is documented as
frozen. `geordi-ray-traced-scene/1` is `draft` because
[`ray-traced-scene-profile.md`](./ray-traced-scene-profile.md) says it "is not yet frozen". Where
the docs say nothing, the entry is `draft` and its evidence says so. That includes every CLI
message schema family. The maintainer decides when a contract is frozen.

The gate allows these status changes:

- `draft` to `frozen`, or to `superseded`.
- `frozen` to `superseded`.

It refuses these:

- `frozen` to `draft`.
- Any change out of `superseded`.
- A new contract that starts `superseded`.

### Raising a version

To change a frozen contract incompatibly:

1. Add `name/N+1` as a new entry, with its own schema and examples.
2. Mark `name/N` as `superseded`, with `"supersededBy": "name/N+1"`.
3. Keep `name/N`'s schema and examples where they are, unchanged.
4. Move the live surfaces (`diagnostics`, `rustApi`) to the new entry.
5. Add two change records: one for the new version, and one for the old version that states the
   status change.

## Surfaces

Each surface is computed from source, never read from a stored snapshot.

| Surface | How it is computed | Difference |
| --- | --- | --- |
| `schema` | The contract's JSON Schema, parsed and walked keyword by keyword | Each changed keyword, at its JSON pointer |
| `example` | Each example document hashed by its encoder. `rust-fn`: the named Rust function, built from that tree's own crate. `sha256-bytes`: SHA-256 of the file bytes | A changed, added or removed hash |
| `diagnostic` | Codes with the entry's prefix: the catalog's level-three headings that name a code in backticks (with their `Severity` and `Message` lines), and the values of `pub const` `&str` items in the source files | An added or removed code, or a changed severity or documented message |
| `rust-api` | Public items of the listed Rust files, parsed with `syn` by [`crates/geordi-contract-api`](../crates/geordi-contract-api/src/lib.rs). `select: "reexports"` keeps only the `pub use` items from one module | An added, removed or changed item |

On the head, the gate also checks two things:

- Each example validates against its contract's schema (`GEORDI_E_CONTRACT_EXAMPLE_INVALID`).
- The catalog and the source list the same codes (`GEORDI_E_CONTRACT_DIAGNOSTICS_DISAGREE`).

The `ray-traced-scene/1` reference scene hash is computed by `geordi_ir::geordi_ray_traced_scene_hash`,
built from the base tree for the base and from the head tree for the head. The gate copies the
encoder crate, the tree's root `Cargo.toml` and its `Cargo.lock` into a content-addressed directory
under `target/contract-gate/`. It then builds a small generated harness against that copy with the
pinned toolchain. An encoder must have the signature `fn(&str) -> Result<String, E>` with
`E: Debug`, and its crate must build without other path dependencies.

### Why `syn` and not rustdoc

`cargo public-api` and `cargo semver-checks` read rustdoc JSON. Rustdoc JSON needs
`-Z unstable-options`, which only a nightly compiler accepts. The repository pins stable `1.96.0`,
so `crates/geordi-contract-api` parses source text with `syn` instead.

It sees every `pub` item in the listed files:

- functions;
- structs and their public fields;
- enums and their variants;
- constants and their values;
- statics, type aliases and traits;
- inline `pub mod` blocks;
- public inherent methods;
- trait implementations, derived or hand-written, for public types declared in the same file,
  keyed by the trait with its type arguments (lifetime arguments are dropped, so a derive and a
  hand-written `impl<'de> Deserialize<'de>` agree) and recording the impl's type parameters and
  `where` clause;
- `unsafe` on a trait, the defaults of associated constants, and the generics, bounds and `where`
  clauses of associated types;
- the generics and `where` clause of the `impl` block a public method is declared in;
- `pub use` re-exports, with their source path.

Doc comments and attributes other than `#[non_exhaustive]` and `#[derive]` do not count.

It does not see:

- macro expansion;
- `cfg` other than `cfg(test)`;
- name resolution: a type is compared as written, so `String` and `std::string::String` differ;
- files reached only through `mod name;`, so list each file;
- blanket and auto-trait implementations (`Send`, `Sync`);
- whether a public signature names a private type.

## Classification

A difference is **breaking** if it does any of these:

- removes or renames a field, code, type, function or variant;
- changes a type or a signature;
- adds a required property;
- removes an `enum` value or a `type`;
- tightens a bound or adds a `pattern` or `const`;
- makes `additionalProperties` false;
- changes an example's canonical hash;
- changes a diagnostic's severity.

These Rust additions are also breaking:

- a field added to a struct whose fields are all public and that is not `#[non_exhaustive]`;
- a variant added to an exhaustive enum;
- a required method, associated type or associated constant without a default added to an
  existing trait.

A difference is **additive** if it adds an optional property to an object that refused other
members (`additionalProperties: false`), a new code, a new item or a new example, or loosens a
bound.

A difference is **unknown** when the gate cannot tell, and an unknown difference is treated as
breaking. These are unknown:

- a changed diagnostic message, because the meaning may have narrowed or widened;
- a changed constant value;
- a changed `pattern` or `$id`;
- an optional property added to an object that did not refuse other members, because existing
  documents may already hold it with a value the new schema rejects;
- an otherwise additive change inside a `oneOf` branch, because a wider branch can make a value
  match two branches;
- loosening or removing `additionalProperties` in a schema that uses `unevaluatedProperties`;
- `oneOf` or `allOf` branches added or removed;
- a removed `$defs` entry;
- any keyword the gate does not model.

Annotations (`title`, `description`, `$comment`, `examples`, `x-*`) are ignored. Item names in
reported JSON pointers are escaped as RFC 6901 requires (`~0`, `~1`). A schema number that
JavaScript cannot hold exactly (an integer beyond `2^53 - 1`) fails the snapshot instead of being
compared rounded. Line endings in
the schema, the catalog and Rust sources are ignored, and so is the key order of a schema.
Example documents are hashed exactly as their encoder hashes them.

## Change records

A change record is a small file in `contracts/changes/` (schema:
[`schemas/geordi-contract-registry/change-record.schema.json`](../schemas/geordi-contract-registry/change-record.schema.json)).
Name it `YYYY-MM-DD-<slug>.json`. This one is checked in:

```json
{
  "$schema": "../../schemas/geordi-contract-registry/change-record.schema.json",
  "contract": "geordi-ray-traced-scene/1",
  "change": "breaking",
  "summary": "A directional light's value is `irradiance`, not `radiance`; ...",
  "why": "From CHANGELOG.md: Geordi is pre-1.0, ...",
  "references": ["flyingrobots/geordi#212", "flyingrobots/geordi#161", "flyingrobots/geordi#217"],
  "retroactive": true
}
```

The summary and reason are abridged here. The full file is
[`2026-11-22-geordi-212-directional-irradiance.json`](../contracts/changes/2026-11-22-geordi-212-directional-irradiance.json).

The gate matches the records the head adds (present on the head, absent on the base) against what
it observed:

| Observed | Needs |
| --- | --- |
| A contract with differences, a new contract, or a removed contract | At least one new record that names it |
| A breaking or unknown difference, a status change, or both | One record that describes the whole change: it says `breaking` when any difference is breaking or unknown (`GEORDI_E_CONTRACT_RECORD_UNDERSTATED` otherwise), and its `status` is `{ "from": ..., "to": ... }` with the observed status change |
| A record that names a contract with no observed difference, or states a status change that did not happen | Fails as stale (`GEORDI_E_CONTRACT_RECORD_STALE`) |
| A record that names a contract in neither registry, or does not match its schema | Fails as invalid |

Records are history. They are kept forever and are not folded into the changelog on release. A
record that exists on the base and is edited or deleted fails the gate
(`GEORDI_E_CONTRACT_HISTORY_REWRITTEN`). A record that is already on the base satisfies nothing in
a later pull request.

A record with `"retroactive": true` describes a change that merged before its record existed. It
satisfies no difference and is never stale. The record for flyingrobots/geordi#212 is one; it
starts the history of `geordi-ray-traced-scene/1`.

## The base

- **In CI**, the base is the merge base of the checked-out commit and the pull request's base
  branch (`--base-ref origin/<base>`). On a push to `main` it is the previous `main`
  (`--base-ref HEAD^1`). The checkout fetches full history (`fetch-depth: 0`).
- **Locally**, the base defaults to the merge base with `origin/main`. Run `git fetch` first:
  a stale `origin/main` gives a stale merge base. In a shallow clone, run
  `git fetch --unshallow origin`; a plain `git fetch` does not move the shallow boundary. Give a branch with `--base-ref`, an exact
  revision with `--base`, or a directory with `--base-dir`.
- **The head** is the working tree by default. `--head <rev>` compares a commit, and `--head-dir`
  compares a directory.

A git base is read blob by blob (`git ls-tree` and `git cat-file --batch`) into
`target/contract-gate/trees/<sha>/`. The comparison therefore uses the exact committed bytes of the
merge base, never a file the pull request could have edited, and no `git archive` transformation
(`export-ignore`, `export-subst`) applies. The merge base is taken with the head being compared:
`--head <rev>` with `--base-ref` uses `<rev>`, not the checked-out branch. Registry paths may not
contain `.` or `..` segments, and every path is checked to stay inside its tree.

A superseded contract's registry entry must keep naming the same schema and example paths as on
the base, and those files must keep their bytes.

The gate fails closed with a schema'd `error` line on stderr, and never passes, when it cannot:

- resolve the base ref, or find a `--base-dir` directory;
- find a merge base (for example in a shallow clone);
- read a registry;
- compute a surface.

**Bootstrap.** When the base has no `contracts/registry.json`, the run is a `bootstrap`: every
contract is new and needs no record. That happens once, in the pull request that adds the registry.
A head without a registry is an error, so the registry cannot be deleted to get back there.

## Running it

```bash
git fetch origin
pnpm contracts:check                          # JSON Lines
node scripts/contract-gate.mjs --human        # prose
node scripts/contract-gate.mjs --base-ref origin/main --head HEAD
node scripts/contract-gate.mjs --help         # what it does, then every output and error schema
node scripts/contract-gate.mjs --schema       # every message schema; exits 0
```

The first run compiles `crates/geordi-contract-api` and the encoder harness. Later runs reuse
`target/`.

Output is JSON Lines on stdout and stderr. Every line carries `_schema` (an id and version from
[`schemas/geordi-contract-gate/`](../schemas/geordi-contract-gate/)) and `kind`. The lines come
in this order:

1. one `comparison`;
2. for each contract, its `difference` lines, then its `contract` line;
3. a `record` line for each new record;
4. a `coverage` line for each contract, gated or not;
5. a `violation` line for each broken rule;
6. one `result`.

A failed run ends with a `GEORDI_E_CONTRACT_GATE_FAILED` error on stderr and exit code 1. Exit
code 2 is a usage error. The codes are listed in
[`ERROR_CODES.md`](./ERROR_CODES.md#contract-gate).

This is what the gate prints with `--human` for the replay of flyingrobots/geordi#212 in
`scripts/contract-gate-replay-212.test.mjs`. The lines are abridged: 13 of the 15 `rust-api`
lines are omitted, and long schema values are cut:

```text
FAIL geordi-ray-traced-scene/1: changed, breaking (draft -> draft)
  breaking: schema /$defs/light/oneOf/0/properties/irradiance added: required property irradiance was added (null -> {"items":...})
  breaking: schema /$defs/light/oneOf/0/properties/radiance removed: property radiance was removed ({"items":...} -> null)
  breaking: example fixtures/ray-traced-scene/reference.rt-scene.geordi.json changed: the canonical hash of the example document changed, computed by each tree's own encoder (sha256:3f245c019731d361dbbdd4c38362e2a2e6d0f725ba799f5d0baaa6d34f482747 -> sha256:5ea6b6085b5178fcda09fc966737e44cd5c731ed311e4fcd601ddf935a480a24)
  additive: diagnostic GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE added: a public diagnostic code was added (null -> A directional light's irradiance channel is outside `[0, 65536]`)
  unknown, treated as breaking: diagnostic GEORDI_E_RT_RADIANCE_OUT_OF_RANGE changed: the documented meaning of a diagnostic code changed; it may have been narrowed or widened (A radiance channel is outside `[0, 65536]` -> A uniform sky's radiance channel is outside `[0, 65536]`)
  breaking: rust-api field GeordiRayTracedLight.radiance removed: a public item was removed or renamed ([GeordiFixedQ32_32 ; 3] -> null)
  breaking: rust-api field GeordiRayTracedLight.value added: a field was added to an exhaustive struct whose fields are all public: struct literals and exhaustive patterns no longer compile (null -> GeordiRayTracedLightValue)
coverage geordi-ray-traced-scene/1: gated (schema, example, diagnostic, rust-api)
violation GEORDI_E_CONTRACT_RECORD_MISSING geordi-ray-traced-scene/1: geordi-ray-traced-scene/1 is changed (breaking) and no new change record in contracts/changes/ names it
failed: 1 contracts, 20 differences, 1 violations
error GEORDI_E_CONTRACT_GATE_FAILED: 1 contract violation(s); see the violation lines, and add change records under contracts/changes/ (docs/contract-gate.md)
```

## What it does not cover

- **TypeScript APIs.** No published package's TypeScript API is compared yet. The tool would
  normalise and diff `tsc --declaration` output for each tree, but the base tree's workspace
  dependencies would have to resolve to the base's own sources. That is not built.
- **Ungated contracts.** The `ungated` entries in the registry have no JSON Schema yet, and
  several are TypeScript-side. Among them are `bijou-surface-gpu/1`, `geordi-bijou-gpu-receipt/1`
  and `geordi-ir/1`. `bijou-surface-gpu/1` is recorded as `draft`, but its design record says both
  "Status: Proposed" and "This record freezes", so its status is for the maintainer to settle.
- **`geordi-ray-traced-render-receipt/1`.** It shares a source file and the `GEORDI_E_RT_` prefix
  with the scene format, so a change to it is reported under `geordi-ray-traced-scene/1` until it
  has its own entry.
- **The JSON Schema is not the validator.** The scene schema expresses shape, constants, ranges
  and patterns. The validator's cross-field and exact-arithmetic rules are listed in
  [`ray-traced-scene-profile.md`](./ray-traced-scene-profile.md#json-schema). The gate therefore
  sees a change to those rules only if it also changes a diagnostic code, a Rust item or an example
  hash.
- **Behaviour.** The gate compares declared surfaces. It does not show that a function with an
  unchanged signature still does the same thing. The example hashes are the only behavioural
  surface.
- **CLI message examples.** Message schema families are compared by their schemas. Each command's
  own tests validate its real output against those schemas.

## Recommended repository setting

A change record makes a contract change explicit, but anyone can add one. The registry, the change
records and the format schemas should also need a named person's review. These settings are
recommended for the maintainer to enable; this repository does not apply them:

```text
# .github/CODEOWNERS
/contracts/                         @flyingrobots
/schemas/geordi-contract-registry/  @flyingrobots
/schemas/geordi-ray-traced-scene/   @flyingrobots
```

To enable them:

1. Add the CODEOWNERS file above.
2. In the branch rule (or ruleset) for `main`, enable "Require review from Code Owners".
3. Make the `Test` check, which runs the gate, required.
