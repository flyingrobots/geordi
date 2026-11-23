# Contract Gate Test Plan

Contract ledger for [`contract-gate.md`](./contract-gate.md). Each row names a requirement, the
case, the oracle that decides it, and the test that is the evidence. Requirements come from
[flyingrobots/geordi#217](https://github.com/flyingrobots/geordi/issues/217).

Run them with:

```bash
pnpm test:contracts
```

That builds `crates/geordi-contract-api`, runs its Rust tests and Clippy, then the Node tests
below. Every row is implemented. Every line the gate writes in these tests, on stdout and stderr,
is validated against the schema it names. The replay needs the two commits of
flyingrobots/geordi#212 in the clone (CI fetches full history). It fails, never skips, without
them.

## Golden: the replay of flyingrobots/geordi#212

Tests are in `scripts/contract-gate-replay-212.test.mjs`. The base and head are the two real
commits, read with `git archive`, with the overlays in
[`fixtures/contract-gate/replay-212/`](../fixtures/contract-gate/replay-212/README.md).

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| CG-REPLAY-01 | No change record | Exit 1; one `GEORDI_E_CONTRACT_RECORD_MISSING` for `geordi-ray-traced-scene/1`; contract `changed`, `breaking` | `replaying flyingrobots/geordi#212 with no change record fails the gate` |
| CG-REPLAY-02 | The renamed field is named | Schema differences `.../properties/radiance` removed and `.../properties/irradiance` added, both breaking | `the replay names the renamed field of the serialized format` |
| CG-REPLAY-03 | The diagnostic codes are named | `GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE` added; `GEORDI_E_RT_RADIANCE_OUT_OF_RANGE` changed meaning, treated as breaking | `the replay names the added and the narrowed diagnostic codes` |
| CG-REPLAY-04 | The public Rust type is named | `field GeordiRayTracedLight.radiance` removed; `.value` added (breaking); `enum GeordiRayTracedLightValue` and its re-export added; derive replaced by a hand-written `Deserialize` is no difference | `the replay names the changed public Rust type` |
| CG-REPLAY-05 | The reference hash is named | `before` and `after` are the two hashes in `CHANGELOG.md`, each computed by its own tree's `geordi-ir` | `the replay names the changed reference hash, computed by each tree's own encoder` |
| CG-REPLAY-06 | Draft, with a record | Exit 0 | `the same replay with a change record passes for a draft contract` |
| CG-REPLAY-07 | Frozen, with a record | `GEORDI_E_CONTRACT_FROZEN_BREAKING` | `the same replay with a change record fails for a frozen contract` |
| CG-REPLAY-08 | Frozen, version raised, version 1 kept | Exit 0; `/1` superseded, `/2` new | `the frozen replay passes when the version is raised and version 1 is kept` |
| CG-REPLAY-09 | Frozen, version raised, version 1 not kept | `GEORDI_E_CONTRACT_SUPERSEDED_CHANGED` naming the schema and the reference scene | `the frozen replay fails when the version is raised but version 1 is not kept` |

## Edges

Tests are in `scripts/contract-gate.test.mjs`, over small synthetic trees.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| CG-EDGE-01 | No contract surface changes | Exit 0, no differences, no record needed | `a pull request that changes no contract surface passes with no record` |
| CG-EDGE-02 | An additive field | `additive` at `/properties/label`; fails without a record, passes with an additive one | `an additive field fails without a record and passes with an additive one` |
| CG-EDGE-03 | A new required field | `breaking` | `a new required field is breaking` |
| CG-EDGE-04 | A removed diagnostic code | `breaking`; an additive record is understated; a breaking one passes | `a removed diagnostic code is breaking and an additive record understates it` |
| CG-EDGE-05 | A changed diagnostic meaning | `unknown`, treated as breaking, with both messages | `a changed diagnostic meaning is unknown and treated as breaking` |
| CG-EDGE-06 | Catalog and source disagree | `GEORDI_E_CONTRACT_DIAGNOSTICS_DISAGREE` naming the code | `diagnostic codes in the catalog and in the source must agree on the head` |
| CG-EDGE-07 | A renamed public function | Removed (breaking) and added (additive) | `a renamed public function is a removed item and an added item` |
| CG-EDGE-08 | A new contract with no base | State `new`; needs a record | `a new contract with no base needs a record` |
| CG-EDGE-09 | A record that names the wrong contract | `RECORD_MISSING` for the changed one and `RECORD_STALE` for the named one | `a record that names the wrong contract fails twice: missing and stale` |
| CG-EDGE-10 | A record for an unregistered contract, or not matching its schema | `GEORDI_E_CONTRACT_RECORD_INVALID` | `a record that names an unregistered contract is invalid`; `a record that does not match the change-record schema is invalid` |
| CG-EDGE-11 | A pinned hash edited with the fixture | Still `RECORD_MISSING`; `before` is the base's hash | `editing a pinned hash and the fixture in the same pull request does not pass` |
| CG-EDGE-12 | An example its schema rejects | `GEORDI_E_CONTRACT_EXAMPLE_INVALID` | `an example that its own schema rejects is a violation on the head` |
| CG-EDGE-13 | Frozen, breaking, with a record | `GEORDI_E_CONTRACT_FROZEN_BREAKING` naming `/2` | `a breaking change to a frozen contract fails even with a record` |
| CG-EDGE-14 | Frozen, additive | Needs an additive record | `an additive change to a frozen contract passes with an additive record` |
| CG-EDGE-15 | Version raised, old version kept | Exit 0 | `a breaking change to a frozen contract passes when the version is raised and the old one is kept` |
| CG-EDGE-16 | Version raised with the old schema deleted | `GEORDI_E_CONTRACT_SUPERSEDED_CHANGED` naming the schema | `a version raised with the old schema deleted fails` |
| CG-EDGE-17 | A frozen contract removed, or returned to draft | `FROZEN_REMOVED`; `STATUS_INVALID` | `a frozen contract cannot be removed or returned to draft` |
| CG-EDGE-18 | Freezing a draft | Needs a record with the status change | `freezing a draft contract needs a record that states the status change` |
| CG-EDGE-19 | Records already on the base | Satisfy nothing; editing or deleting one is `HISTORY_REWRITTEN` | `change records already on the base are history: they satisfy nothing and cannot be edited` |
| CG-EDGE-20 | A retroactive record | Accepted, state `retroactive` | `a retroactive record is accepted without an observed difference` |
| CG-EDGE-21 | Line endings and key order | No differences | `line endings and key order do not change a snapshot` |
| CG-EDGE-22 | A base without a registry | `bootstrap`; every contract new; exit 0 | `a base without a registry is a bootstrap: contracts are new and need no record` |
| CG-EDGE-23 | A head without a registry | One `GEORDI_E_CONTRACT_GATE_REGISTRY` error | `a head without a registry fails closed with a schema-tagged error` |
| CG-EDGE-24 | A surface that cannot be computed | `GEORDI_E_CONTRACT_GATE_SNAPSHOT` naming the file | `a surface that cannot be computed fails closed` |
| CG-EDGE-25 | Message schema families | One contract per file; a major version bump is a removal and a new contract | `message schema families are expanded into one contract per schema file` |

## Base selection

Tests are in `scripts/contract-gate.test.mjs`, over temporary git repositories.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| CG-BASE-01 | The base branch moved after the fork | `--base-ref` compares with the merge base and passes; `--base` at the tip fails | `the base is the merge base, not the moving tip of the base branch` |
| CG-BASE-02 | Head from the working tree or a commit | An uncommitted change counts by default; `--head HEAD` ignores it | `the head defaults to the working tree, and --head compares a commit` |
| CG-BASE-03 | An unresolvable base ref | `GEORDI_E_CONTRACT_GATE_BASE` | `an unresolvable base fails closed with a schema-tagged error` |
| CG-BASE-04 | A shallow clone | `GEORDI_E_CONTRACT_GATE_BASE` naming `git fetch --unshallow` | `a shallow clone that cannot reach the merge base fails closed` |

## Command line and the repository's own registry

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| CG-CLI-01 | `--schema` | Every schema in `schemas/geordi-contract-gate/`; exit 0 | `--schema prints every message schema and exits 0` |
| CG-CLI-02 | `--help` | A `help` line with every code, then the schema of every output and error line | `--help describes the command, then the schemas of its output and errors` |
| CG-CLI-03 | `--human`; an unknown argument | Prose; `GEORDI_E_CONTRACT_GATE_USAGE`, exit 2 | `--human writes prose, and an unknown argument is a usage error` |
| CG-REG-01 | The checked-in registry against itself | Exit 0; includes `geordi-ray-traced-scene/1`; ungated coverage lines | `the repository registry passes against itself, with every line schema-valid` |
| CG-REG-02 | The checked-in registry and records | Validate against their schemas | `the checked-in registry and change records validate against their schemas` |

## Review findings

Tests are in `scripts/contract-gate.test.mjs`. They were added in answer to the review of
flyingrobots/geordi#218.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| CG-REV-01 | `enum` added or removed | Classified breaking or additive; no crash | `adding or removing an enum restriction is classified, not a crash` |
| CG-REV-02 | Optional property on an open object | `unknown` | `an optional property on an open object is unknown, because old documents may use it` |
| CG-REV-03 | A `oneOf` branch widened | `unknown` | `widening a oneOf branch is unknown, because a value may then match two branches` |
| CG-REV-04 | `$id` changed | `unknown` | `a changed $id is a difference` |
| CG-REV-05 | Member names in pointers | RFC 6901 escaping | `reported pointers escape member names` |
| CG-REV-06 | A property named `constructor` | An ordinary added property | `a property named like an Object.prototype member is an ordinary added property` |
| CG-REV-07 | `additionalProperties` removed beside `unevaluatedProperties` | `unknown` | `removing additionalProperties is unknown when the schema uses unevaluatedProperties` |
| CG-REV-08 | A schema integer beyond `2^53 - 1` | `GEORDI_E_CONTRACT_GATE_SNAPSHOT` | `a schema number that JavaScript cannot represent exactly fails closed` |
| CG-REV-09 | `__proto__` and key order in canonical JSON | Kept as a member; order ignored | `canonical JSON keeps an own __proto__ member and ignores key order` |
| CG-REV-10 | Associated type added to an existing trait | `breaking` | `a required associated type added to an existing public trait is breaking` |
| CG-REV-11 | A superseded entry repointed | `GEORDI_E_CONTRACT_SUPERSEDED_CHANGED` | `a superseded contract cannot be repointed at other files` |
| CG-REV-12 | A record stating a status change that did not happen | `GEORDI_E_CONTRACT_RECORD_STALE` | `a record that states a status change that did not happen is stale` |
| CG-REV-13 | Status and classification split across two records | `GEORDI_E_CONTRACT_RECORD_UNDERSTATED` | `one record must state both the status change and the classification` |
| CG-REV-14 | Two encoders on one example path | Separate hashes | `examples that share a path but not an encoder keep separate hashes` |
| CG-REV-15 | A `--base-dir` that does not exist | `GEORDI_E_CONTRACT_GATE_BASE`, not bootstrap | `a --base-dir that does not exist fails closed instead of bootstrapping` |
| CG-REV-16 | Registry paths with `..` | `GEORDI_E_CONTRACT_GATE_REGISTRY`; `Tree` refuses paths outside | `registry paths may not leave the tree` |
| CG-REV-17 | `--head <rev>` with `--base-ref` | Merge base of the selected head | `the merge base is computed from the selected head, not the checked-out branch` |
| CG-REV-18 | A base registry marked `export-ignore` | Still read; not bootstrap | `a base registry marked export-ignore is still read: the base is extracted blob by blob` |

The Rust snapshot gained `an_unsafe_trait_differs_from_a_safe_one`,
`an_associated_constant_records_its_default`,
`an_associated_type_records_its_generics_and_constraints`,
`a_trait_impl_keeps_its_type_arguments_but_not_its_lifetimes`,
`a_trait_impl_records_its_constraints` and
`a_method_records_the_constraints_of_its_impl_block` in `crates/geordi-contract-api/src/tests.rs`.
The scene schema test gained `every subschema of the scene schema uses only implemented keywords`.

## The scene schema

Tests are in `scripts/ray-traced-scene-schema.test.mjs`.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| CG-SCHEMA-01 | Positive fixtures | The reference and negotiation scenes validate | `every positive fixture validates against the schema` |
| CG-SCHEMA-02 | Shape-stage failures | Every `parse`-stage failure fixture except the four text-level ones is invalid | `every shape-stage failure fixture is invalid against the schema` |
| CG-SCHEMA-03 | The light field names | `sun-radiance-field` and `sky-irradiance-field` are invalid | `the old directional light field name is refused and the new one is required` |
| CG-SCHEMA-04 | The boundary with the validator | Exactly the listed validate-stage codes are also rejected by the schema; the rest are not | `the schema enforces exactly the validate-stage rules it is documented to express` |
| CG-SCHEMA-05 | Unknown keywords | The validator refuses them | `the schema uses only keywords the validator implements` |

The schema validator itself is tested in `scripts/json-schema-subset.test.mjs`.

## The Rust public-item snapshot

Tests are in `crates/geordi-contract-api/src/tests.rs`.

| ID | Case | Test |
| --- | --- | --- |
| CG-API-01 | Public functions captured; private and `pub(crate)` ignored | `public_functions_are_captured_and_private_ones_are_not` |
| CG-API-02 | A rename is a removal and an addition | `a_renamed_function_is_a_removed_key_and_an_added_key` |
| CG-API-03 | Fields carry types; docs and attributes do not count | `struct_fields_carry_their_types_but_not_their_docs_or_attributes` |
| CG-API-04 | Private fields and `#[non_exhaustive]` recorded | `a_private_field_and_non_exhaustive_are_recorded` |
| CG-API-05 | Variants carry fields without docs | `enum_variants_carry_their_fields_without_docs` |
| CG-API-06 | String constants expose their value | `string_constants_expose_their_value` |
| CG-API-07 | Derived and hand-written impls agree | `a_derived_and_a_hand_written_trait_impl_have_the_same_key` |
| CG-API-08 | Impls for private types ignored | `trait_impls_for_private_types_are_ignored` |
| CG-API-09 | Public inherent methods | `public_inherent_methods_are_captured` |
| CG-API-10 | Re-exports and their source paths | `reexports_name_their_source_path` |
| CG-API-11 | `cfg(test)` skipped; inline modules prefixed | `test_only_items_are_skipped_and_inline_modules_are_prefixed` |
| CG-API-12 | Line endings | `line_endings_do_not_change_the_snapshot` |
| CG-API-13 | Sorted output | `items_are_sorted_by_key` |
| CG-API-14 | Parse error | `invalid_rust_is_a_parse_error` |
| CG-API-15 | JSON Lines, errors, help, schema, `--human` | `run_writes_one_item_line_per_item_and_a_result`; `run_reports_a_missing_file_as_a_schema_tagged_error`; `run_without_files_is_a_usage_error`; `help_and_schema_are_json_lines_and_exit_zero`; `human_output_is_prose` |

## Known failure modes

| Failure mode | Guard |
| --- | --- |
| Comparing with the wrong base (a stale merge base) | CG-BASE-01, CG-BASE-04; CI fetches full history and passes `origin/<base>` |
| A snapshot that depends on file order or line endings | CG-EDGE-21, CG-API-12, CG-API-13 |
| An API tool that needs network or a nightly toolchain | `crates/geordi-contract-api` builds from the locked workspace on the pinned stable toolchain |

Fuzz and stress testing: not applicable, because the gate is a deterministic comparison.
