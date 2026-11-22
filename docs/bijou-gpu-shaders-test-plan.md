# Bijou GPU Shader Test Plan

Contract ledger for [`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md). Each row names a
requirement, the case, the oracle that decides it, and the test that is the evidence.
Requirements come from
[flyingrobots/geordi#170](https://github.com/flyingrobots/geordi/issues/170) and the
[design record](./design/2026-11-bijou-surface-gpu-abi.md).

Run them with:

```bash
pnpm test:bijou-gpu:shaders
cargo test -p geordi-bijou-shadergen -- --include-ignored
```

Every row is implemented. `BS-GLSL-03` needs `glslangValidator` on `PATH` and runs only with
`--include-ignored`; CI runs it. `BS-ARC-03` and the WebGPU half of `BS-FRAME-01` are reported as
skipped or not executed, never as passed, when the browser has no WebGPU adapter.

## Adoption and assembly

Tests are in `crates/geordi-bijou-shadergen/src/tests.rs`.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BS-ADOPT-01 | Vendored Bunny helpers and vectors are the pinned artifacts | SHA-256 of each file equals the generator pin and the design record row | `vendored_bunny_artifacts_have_the_digests_and_commits_the_abi_record_pins` |
| BS-ADOPT-02 | The shader adopts the helpers and the glyph table | Assembled WGSL contains each helper's bytes exactly once and the generated `const` block | `assembled_surface_wgsl_embeds_the_bunny_helpers_verbatim_and_the_procedural_table` |
| BS-ADOPT-03 | A changed helper is refused | `GEORDI_E_BIJOU_SHADERGEN_BUNNY_DIGEST_MISMATCH` | `a_changed_bunny_helper_is_refused_by_digest` |
| BS-ADOPT-04 | Glyph table delivery | 160 literals equal `packedU32` in code point order | `glyph_table_block_carries_every_packed_entry_in_code_point_order`; `malformed_glyph_tables_are_refused` |
| BS-ADOPT-05 | Manifest pins match the endpoint receipt validator | `bunnyPrimitives` equals `BUNNY_PRIMITIVE_PINS` | `the manifest pins the same Bunny primitives as the endpoint receipt validator` (`scripts/bijou-gpu-shader-conformance.test.mjs`) |

## WGSL

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BS-WGSL-01 | Pinned `naga` accepts both modules | Parse and full validation succeed | `checked_in_wgsl_modules_pass_pinned_naga_validation` |
| BS-WGSL-02 | Integer textures only, three bindings, no vertex buffers | No `rgba8unorm`, `texture_2d<f32>`, `textureSample` or sampler | `surface_wgsl_reads_both_textures_as_integers_and_never_as_rgba8unorm` |
| BS-WGSL-03 | Zero floats in the pixel law | No float type, literal, cast or math call in any function except `frag_px` and `frag_py` | `core_rendering_functions_hold_no_floating_point_value` |

## GLSL ES 3.00

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BS-GLSL-01 | Integer `texelFetch` on `usampler2D`, `uvec4` output, top-left normalization | Text of the generated stages | `surface_glsl_is_es_300_with_integer_texel_fetch_and_top_left_normalization` |
| BS-GLSL-02 | `d == 0` branch before `/`; degenerate ellipse branch before the polynomial; no `2 * r` | Order of statements in the generated kernels | `kernel_glsl_keeps_the_branch_first_guards_of_the_bunny_helpers` |
| BS-GLSL-03 | Generated stages are valid GLSL ES 3.00 | `glslangValidator` exits 0 for every stage | `generated_glsl_passes_glslang_validator` |
| BS-GLSL-04 | Generated stages compile and link in WebGL2 | `compilation` and `linking` are `pass` | `transport canary and the shared Bunny vectors pass bit for bit through translated GLSL ES 3.00 in WebGL2`; `translated GLSL ES 3.00 Option E4 arcs match the reference model with zero divergent pixels in WebGL2` |

## Determinism, drift and manifest

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BS-GEN-01 | Deterministic, byte-identical output | Two generations are equal and equal the nine checked-in files | `generation_is_deterministic_and_byte_identical_to_the_checked_in_artifacts` |
| BS-GEN-02 | `--check` passes on `main` | Exit 0, nine `match` lines, one `result` line | `check_passes_on_the_checked_in_artifacts` |
| BS-GEN-03 | `--check` reports drift and writes nothing | Exit 1, `drift` and `missing` states, `GEORDI_E_BIJOU_SHADERGEN_DRIFT` with the paths | `check_reports_drift_and_missing_files_and_writes_nothing` |
| BS-GEN-04 | `--write` restores and is idempotent | `written`, then `unchanged` | `write_restores_drifted_artifacts_and_is_idempotent` |
| BS-GEN-05 | Pinned `naga` | Exact `=29.0.4` in the crate manifest, one `naga` in the lockfile | `pinned_naga_version_is_exact_in_the_crate_manifest_and_the_lockfile` |
| BS-MAN-01 | Manifest digests | Each digest is the SHA-256 of the file it names; `generatedGlslSha256` follows the framing rule | `manifest_digests_are_the_sha256_of_the_bytes_they_name` |
| BS-MAN-02 | Binding map | Each GLSL name is declared in the stage; uniform offsets `0, 8, 16, 24, 32, 48, 60` in 64 bytes | `manifest_binding_map_names_the_exact_glsl_uniforms_and_uniform_layout` |
| BS-CLI-01 | Output contract | Every stdout and stderr line validates against its declared schema | `every_help_schema_and_usage_line_validates_against_its_declared_schema` |
| BS-CLI-02 | `--human` | Prose on both streams | `human_flag_switches_every_stream_to_prose` |

## Kernel conformance

Tests are in `scripts/bijou-gpu-shader-conformance.test.mjs`.

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BS-KERN-01 | Missing WebGL2 | `outcome: "unavailable"`, every step `not-run` | `a missing WebGL2 context yields outcome "unavailable", never "pass"` |
| BS-KERN-02 | Receipts fail closed | Any failed or unrun step, or differing result bytes, is `fail` | `kernel receipts fail closed when a step fails or the result bytes differ` |
| BS-KERN-03 | Edge vectors are in the shared fixtures | `3,000,000,000 / 4,000,000,000 -> [1, 0]`, `d == 0`, zero semi-axes, out of domain | `shared Bunny fixtures carry the edge vectors the test plan names` |
| BS-KERN-04 | Canary, then 1,720 and 1,444 Bunny vectors through translated GLSL in WebGL2 | Little-endian result bytes equal the fixture's expected bytes, by SHA-256 | `transport canary and the shared Bunny vectors pass bit for bit through translated GLSL ES 3.00 in WebGL2` |
| BS-KERN-05 | The harness can fail | Wrong kernel, compile error, link error and a corrupted canary each fail at their own step | `the kernel harness detects a wrong kernel, a compile failure and a link failure` |

## Arc and frame conformance

| ID | Case | Oracle | Test |
| --- | --- | --- | --- |
| BS-ARC-01 | Reference model is the pinned geometry | Bitmaps the design record pins | `Option E4 reference model reproduces the bitmaps the ABI record pins` |
| BS-ARC-02 | Translated GLSL arcs in WebGL2, the eleven sizes the design record lists and twelve more, four corners each, with a letterboxed remainder | Zero divergent pixels against the reference model | `translated GLSL ES 3.00 Option E4 arcs match the reference model with zero divergent pixels in WebGL2` |
| BS-ARC-03 | Assembled WGSL arcs in WebGPU, same sizes | Zero divergent pixels against the reference model | `assembled WGSL Option E4 arcs match the reference model with zero divergent pixels in WebGPU` |
| BS-ARC-04 | The diff can fail | A bottom-left origin and a strict boundary comparison each diverge | `the Option E4 diff detects a flipped row origin and a changed arc rule` |
| BS-FRAME-01 | All 416 procedural glyphs, mono and color atlas glyphs, every flag, presence bit and opacity, at five cell sizes | `frameRgbaSha256` of `renderReferenceRgba` | `full frames of every procedural glyph, atlas glyph and style match the CPU reference oracle bit for bit` |

`BS-ARC-02` covers all 262,144 instances of `[1..256]^2 x 4` when
`GEORDI_BIJOU_GPU_E4_EXHAUSTIVE=1` is set. CI runs the listed sizes.
