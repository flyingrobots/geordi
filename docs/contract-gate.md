# Contract Gate

**Command**: `node scripts/contract-gate.mjs` (`pnpm contracts:check`)
**Registry**: [`contracts/registry.json`](../contracts/registry.json)
**Change records**: [`contracts/changes/`](../contracts/changes/)
**Issues**: [flyingrobots/geordi#217](https://github.com/flyingrobots/geordi/issues/217),
[flyingrobots/geordi#219](https://github.com/flyingrobots/geordi/issues/219) (the TypeScript surface)
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
lists four kinds of entry:

- **`contracts`**: a serialized contract that the gate compares. An entry has:
  - an identifier and major version, written `name/N`;
  - a status, with `statusEvidence` quoting where the repository documents that status;
  - a JSON Schema;
  - one or more canonical example documents, each with its encoder;
  - optionally, the diagnostic codes it can produce;
  - optionally, the Rust source files that carry its public API.
- **`messageSchemaFamilies`**: a directory of CLI message schemas. Each `*.schema.json` in the
  directory is one contract, `<x-schema-id>/<major of x-schema-version>`, compared by its schema.
- **`typescriptPackages`**: the published TypeScript packages. Each `packages/*/package.json`
  without `"private": true` is one contract, `<package name>/<major version>`, such as
  `@flyingrobots/geordi-core/0`, compared by its public TypeScript API. The member's status is
  `draft` and applies to every package; the schema allows nothing else, because no version model
  for freezing a package API exists yet. Marking a package `private`, renaming it, raising its major
  version or removing the member removes the contract, which needs a change record like any other
  removal.
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
| `typescript-api` | The exports of each entry point of a published package, read by the TypeScript compiler's type checker from the tree's own sources by [`typescript-api.mjs`](../scripts/lib/contract-gate/typescript-api.mjs). See [The TypeScript surface](#the-typescript-surface) | An added, removed or changed entry point, export, signature or member |

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

## The TypeScript surface

### Entry points

A package's entry points are the subpaths of its `package.json` `exports`, or `.` from `types` and
`main` when it has no `exports`. An entry point whose `types` (or, without one, its JavaScript
target) is a file under the package's `outDir` maps back to the source under its `rootDir`, read
from the package's own `tsconfig.json`: `./dist/node.d.ts` is `src/node.ts`. Any other entry point,
such as `./shaders/*` or a JSON file, is recorded by its target string. An entry point that names
a declaration file with no source fails the snapshot.

Each source is compiled with the first tsconfig that includes it: `tsconfig.json`, then the files
the package's `build` script passes to `tsc -p`, in order. That is how
`@flyingrobots/geordi-bijou-gpu/shader-source/node` is read with `tsconfig.node.json`. Options
that only steer emit, or that would redirect resolution (`paths`, `baseUrl`, `rootDirs`), are
dropped.

### Resolving the base to its own sources

The base tree is extracted from git into `target/contract-gate/trees/<sha>/`. It has no
`node_modules` and no built `dist/`, and its packages may differ from the head's. The gate
resolves imports itself:

- An import of a workspace package, by name or subpath, resolves to that package's source in the
  same tree, through that tree's own `exports`. The base's `@flyingrobots/geordi-bijou-gpu` sees the
  base's `@flyingrobots/geordi-core`, never the head's and never a `dist/`.
- Every other bare import (a third-party package, `@types/node`, `vitest/globals`) resolves from
  the dependencies installed for the repository running the gate. The import is resolved as if from
  the same package directory there, or from the repository root for a package the install does not
  have. There is no network access and no second install. The TypeScript compiler is the installed
  one.
- A bare import whose installed name links outside `node_modules` fails the snapshot. Such a link
  is a workspace symlink, and following it would compare against the head's sources.

Any compiler error in a package's program fails the snapshot. An unresolved import would
otherwise turn every type that depends on it into `any`. Both trees are read by the same code.

### What is compared

For each export of an entry point, the gate compares:

- its name, under the entry point (`compile`, or `./shader-source/node:createFileShaderSource`);
- its kind (`function`, `class`, `interface`, `type`, `const`, `enum`, `namespace`, or several
  for a merged declaration);
- whether it is type-only, which means a value that the entry point lets consumers use only as a
  type. This covers `export type { X }` and `export type * from`. The gate decides it by asking the
  compiler whether the value can be used, through a probe file beside the entry source;
- the call signatures of a function, in order, and the construct signatures of a class;
- the type parameters of an interface, class or type alias;
- the members of an interface, a class (instance and static, inherited ones included) or an
  object type alias: name, optional, `readonly`, `protected`, method or property, and type.
  Private members are skipped;
- the type of a constant or variable, and the text of any other type alias;
- the members of an enum and their values.

Types are printed by the compiler, with inferred types written out, so a return type that changes
without its declaration text changing is seen. Parameter names are left out of signatures, because
renaming a parameter breaks no caller. Union members are sorted, because the checker orders them
by the order it created each type.

| Difference | Classification |
| --- | --- |
| An entry point, export or member removed (a rename is a removal and an addition) | breaking |
| An export's kind changed, or it became type-only | breaking |
| A signature changed, or an overload removed or changed | breaking |
| Type parameters, a constant's type or a type alias's text changed | breaking |
| A member's type, optionality, `readonly` or `protected` changed | breaking |
| A required member added to an interface or object type | breaking |
| An entry point, export or overload added | additive |
| An optional member added, or any member added to a class | additive |
| A type-only export that can now be used as a value | additive |
| An enum member added | unknown, treated as breaking |
| A non-TypeScript entry point that now names a different target | unknown, treated as breaking |
| A signature added to an item that had none | unknown, treated as breaking |

The surface does not see:

- behaviour. A function whose signature is unchanged may still do something else;
- two spellings of one type. An alias and its expansion print differently, and a parameter type
  widened is reported as changed (breaking), like one narrowed;
- a change in a third-party dependency. Both trees use the head's installed dependencies, so an
  upgrade is seen only where it changes a type the package prints;
- deep imports into `dist/` or `src/`, which are not public API;
- declaration-emit details that the checker's view does not carry, such as JSDoc and parameter
  names.

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

Run `pnpm install --frozen-lockfile` first: the TypeScript surface needs the installed TypeScript
compiler and third-party types. Without them it fails with `GEORDI_E_CONTRACT_GATE_SNAPSHOT`. In CI
the gate step runs after the install. The first run compiles `crates/geordi-contract-api` and the
encoder harness. Later runs reuse `target/`. Measured locally with a warm `target/`, the ten packages
here take the gate from about 1.0 seconds to about 3.8 seconds when both trees list
`typescriptPackages`.

Output is JSON Lines on stdout and stderr. Every line carries `_schema` and `kind`. `_schema` is
an id and the version of that message type's own schema in
[`schemas/geordi-contract-gate/`](../schemas/geordi-contract-gate/) (`x-schema-version`). Each
message type is versioned separately. The lines come
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
