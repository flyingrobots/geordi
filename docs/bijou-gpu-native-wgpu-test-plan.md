# Bijou GPU Native `wgpu` Proof Test Plan

Contract ledger for [`bijou-gpu-native-wgpu.md`](./bijou-gpu-native-wgpu.md). Each row gives a
requirement, the case, the oracle that decides it, and the test that is its evidence.
Requirements come from [flyingrobots/geordi#58](https://github.com/flyingrobots/geordi/issues/58)
and the [design record](./design/2026-11-bijou-surface-gpu-abi.md). Where the two differ, the
design record wins.

Run them with:

```bash
pnpm test:bijou-gpu:native
cargo test -p geordi-bijou-wgpu-proof -- --include-ignored
pnpm --filter @flyingrobots/geordi-bijou-gpu test
```

Every row is implemented. The three rows marked **adapter** need a `wgpu` adapter. They are
`#[ignore]`d, fail rather than pass on a host without an adapter, and run only with
`--include-ignored`. CI does not run them. They last passed on an Apple M5 (Metal,
`IntegratedGpu`). Rust tests are in `crates/geordi-bijou-wgpu-proof/src/proof/tests/`, under the
module named in the row.

## Intake

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BW-IN-01 | The Bijou fixture is imported byte for byte | Its SHA-256 and length equal `fixtures/bijou-gpu/bijou/provenance.json`, which names the Bijou commit and path | `intake::imported_bijou_fixture_is_byte_identical_to_its_recorded_provenance_and_is_accepted` |
| BW-IN-02 | Conformance frames are accepted and bound to their bytes | `inputReceiptSha256` equals the suite's digest | `intake::conformance_frames_are_accepted_and_bound_to_their_exact_file_bytes` |
| BW-IN-03 | Unknown versions, formats and fields | `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` at the field's path | `intake::unknown_versions_formats_and_fields_are_refused` |
| BW-IN-04 | Malformed side-table relationships | Typed refusal at the path | `intake::malformed_side_table_relationships_are_refused` |
| BW-IN-05 | Unsupported glyphs, before preparation | Typed refusal | `intake::unsupported_glyphs_are_refused_before_any_preparation` |
| BW-IN-06 | Width-2 graphemes | `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH`, the code the suite declares | `intake::the_width_2_negative_fixture_is_refused_with_the_code_the_suite_declares` |
| BW-IN-07 | Modifiers | Unsupported combinations are refused and the full supported set is accepted | `intake::unsupported_modifier_combinations_are_refused_and_the_full_set_is_accepted` |
| BW-IN-08 | Chroma | Unsupported chroma is refused | `intake::unsupported_chroma_is_refused` |
| BW-IN-09 | Excessive and empty dimensions | Typed refusal | `intake::excessive_and_empty_dimensions_are_refused` |
| BW-IN-10 | Malformed byte arrays | Typed refusal | `intake::malformed_byte_arrays_are_refused` |
| BW-IN-11 | The pinned glyph pack | The pack is the suite's pack by SHA-256 and hashes to its declared atlas; any other file or a malformed pack is refused | `intake::pinned_glyph_pack_is_the_conformance_suite_pack_and_hashes_to_its_declared_atlas`; `intake::a_glyph_pack_that_is_not_the_pinned_file_is_refused`; `intake::malformed_glyph_packs_are_refused` |
| BW-IN-12 | Refusal precedes any adapter request | The command line exits 1 with an empty stdout, so no `adapter` line was written | `cli::invalid_input_is_refused_before_the_adapter_is_asked_for` |

## Preparation

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BW-PREP-01 | ABI vectors | `V0`..`V5` prepare to the design record's exact words | `prepare::canonical_abi_vectors_v0_to_v5_prepare_to_their_exact_words` |
| BW-PREP-02 | Conformance frames | `preparedBufferSha256` equals the CPU oracle's digest for paint and erase | `prepare::conformance_frames_prepare_to_the_oracle_prepared_buffer_digest` |
| BW-PREP-03 | Determinism and atlas records | Repeated runs give equal bytes; one entry per atlas slot in use | `prepare::preparation_is_deterministic_and_records_one_entry_per_atlas_slot_in_use` |
| BW-PREP-04 | Modifiers at the supported limit | Flag and alpha bytes are carried verbatim | `prepare::modifiers_at_the_supported_limit_are_carried_verbatim` |
| BW-PREP-05 | Largest canonical grid | One 16-byte record per cell | `prepare::the_largest_canonical_grid_prepares_one_record_per_cell` |
| BW-PREP-06 | Missing glyph weight | `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` | `prepare::a_grapheme_without_a_slot_in_the_requested_weight_is_refused` |

## Shader identity and frame geometry

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BW-SH-01 | The host executes the manifest's assembled WGSL | Bytes and SHA-256 equal the manifest's `assembledWgslSha256` and the file | `render::the_host_executes_the_assembled_wgsl_the_manifest_pins_byte_for_byte` |
| BW-SH-02 | A changed shader or glyph table is refused | `GEORDI_E_BIJOU_WGPU_SHADER_IDENTITY` | `render::a_shader_that_is_not_the_manifest_shader_is_refused_before_it_can_run` |
| BW-SH-03 | Uniform block layout | Byte offsets equal the manifest's binding map | `render::uniform_block_follows_the_byte_offsets_the_manifest_declares` |
| BW-GEO-01 | Canvas | Defaults to the grid and may only grow | `render::canvas_defaults_to_the_grid_and_may_only_grow` |
| BW-GEO-02 | Resource limits before GPU allocation | `FrameSpec::new`, which runs before any adapter request, returns `GEORDI_E_BIJOU_WGPU_RESOURCE_LIMIT` for a texture edge over 8,192 | `render::grids_and_canvases_beyond_the_profile_limits_are_refused_before_gpu_allocation` |
| BW-GEO-03 | Theme colours | Uppercase `#RRGGBB` round-trips; other spellings are refused | `render::hex_colours_round_trip_and_reject_non_canonical_spellings` |
| BW-RB-01 | Read-back row padding | Rows padded to 256 bytes are stripped to tight RGBA8 | `render::readback_rows_are_padded_to_256_bytes_and_stripped_to_tight_rgba8` |

## Evidence and receipts

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BW-EV-01 | Only a named GPU class supports a hardware claim | `Cpu` and `Other` give `software-probed`, a refusal gives `capability-refused` | `render::only_a_named_gpu_class_supports_a_hardware_claim` |
| BW-EV-02 | Typed refusal | `capability-refused`, `frameRgbaSha256: null`, `probes: []`, and bytes equal to the checked-in refusal | `render::a_denied_adapter_gives_a_capability_refused_receipt_with_no_pixels` |
| BW-EV-03 | CPU-authored cells, GPU presentation | `cellProduction: "cpu-authored"` and `gpuCellProductionClaim: false` on refused and probed runs | `cli::a_denied_adapter_streams_a_typed_refusal_and_never_a_pass`; `cli::rendering_streams_a_probed_receipt_and_checks_the_expected_frame_digest` |
| BW-RC-01 | The receipt pins every identity | Shader, glyph table, Bunny pins, font, atlas, adapter, profile; a `Cpu` adapter never claims a GPU | `render::receipts_pin_every_identity` |
| BW-RC-02 | Geometry, probe binding and canonical serialization | 57 probes, each bound to its cell's source and prepared bytes; the letterbox probe to no cell; sorted, deterministic JSON | `render::receipts_record_the_frame_geometry_bind_probes_to_cells_and_serialize_canonically` |
| BW-RC-03 | Checked-in `gpu-probed` receipts match the current inputs | Every field except adapter, evidence, frame and probes is recomputed without a GPU; paint and erase carry the suite's frame goldens | `render::checked_in_gpu_probed_receipts_claim_exactly_the_oracle_digests_of_the_current_inputs` |
| BW-RC-04 | The kit validates the native receipts | `validateEndpointReceipt` accepts each file; shader, input, font and atlas identities match | `%s validates and names its evidence level in its file name` (`packages/bijou-gpu/src/native-wgpu-receipts.test.ts`) |
| BW-RC-05 | Recorded frames equal the CPU oracle | `assertBitExactFrameHash` and `assertPixelProbes` against `renderReferenceRgba`, including the RE-036 frame | `%s hashes to the CPU oracle frame with zero tolerance and its probes are oracle pixels` (same file) |
| BW-RC-06 | A refusal cannot pass the bit-exact gate | `FrameHashMismatchError` | `a capability refusal carries no pixels and cannot pass the bit-exact gate` (same file) |

## `wgpu` frames

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BW-GPU-01 | **adapter**: zero-tolerance frame parity | Tight 67 x 117 RGBA8, all opaque, SHA-256 equal to the suite's oracle goldens for paint and erase | `render::wgpu_frames_hash_to_the_cpu_oracle_goldens_with_zero_tolerance` |
| BW-GPU-02 | **adapter**: repeatability and reproduction | Two runs give equal frames and receipts, equal to the checked-in receipts except adapter and evidence | `render::wgpu_runs_reproduce_the_checked_in_receipts_and_are_repeatable` |
| BW-GPU-03 | **adapter**: command-line render | Probed outcome, 57 probe bindings, `frameComparison: "match"`; a wrong digest exits 1 | `cli::rendering_streams_a_probed_receipt_and_checks_the_expected_frame_digest` |
| BW-GPU-04 | Offscreen run in CI | `pnpm test:bijou-gpu:native` exits 0 with a typed `result` line; without an adapter it is `capability-refused`, never a pass | CI step `Run the native wgpu offscreen proof (typed refusal without an adapter)` |

## Command line

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BW-CLI-01 | Output contract | Every help, schema and usage line validates against its declared schema | `cli::every_help_schema_and_usage_line_validates_against_its_declared_schema` |
| BW-CLI-02 | `--human` | Every stream switches to prose | `cli::human_flag_switches_every_stream_to_prose` |
| BW-CLI-03 | `--require-gpu` | A refusal exits 1 with a typed `GEORDI_E_BIJOU_BACKEND_UNAVAILABLE` error line and no `result` line | `cli::require_gpu_turns_a_refusal_into_a_failure` |
