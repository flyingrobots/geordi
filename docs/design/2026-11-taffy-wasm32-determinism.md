# Research: Taffy Layout On Native Hosts And wasm32

**Status**: Finding recorded
**Date**: 2026-11-22
**Card**: [flyingrobots/geordi#136](https://github.com/flyingrobots/geordi/issues/136)
**Feeds**: [flyingrobots/geordi#141](https://github.com/flyingrobots/geordi/issues/141)
(use Taffy, or write fixed-point block layout in Geordi), under the render law of
[flyingrobots/geordi#78](https://github.com/flyingrobots/geordi/issues/78)

This record answers one question with evidence. It does not choose the layout engine; #141 does.

## Question

Does Taffy give bit-identical layout results on native x86_64, native aarch64 and wasm32 for
block and flex layout?

## Answer

**Yes, for these inputs on these hosts.** Every one of 703,938 `f32` output values from 50
generated block and flex trees had the same bits on aarch64 macOS, on Intel and AMD x86-64 Linux,
and as wasm32 in Node and headless Chromium, in every build listed below. That
includes 17,482 negative zeros and 9 subnormals. No variant differed from another in any bit.
This is a finding about these inputs, builds and hosts. It does not prove that Taffy never
diverges; see [Limits](#limits).

## Method

The experiment is [`research/taffy-wasm32/`](../../research/taffy-wasm32/), a crate outside the
Cargo workspace. It has its own empty `[workspace]` table and `Cargo.lock`, so Taffy is not a
workspace dependency.

- `src/lib.rs` generates 50 trees with an integer-only PRNG (splitmix64). Tree `i` has a budget of
  `5 + 12i` nodes, 15,303 nodes in all, and depth up to 7. Each tree is laid out twice, once with
  Taffy's rounding and once with `disable_rounding()`. All 22 `f32` fields of every node's `Layout`
  (location, size, scrollable overflow rectangle, scrollbar size, border, padding, margin) are
  written as raw bits, with `order` and depth, in depth-first order. That gives 703,938 float
  values in a 2,877,572-byte stream.
- The native binary prints the stream as hex in one JSON line. The `cdylib` built for
  `wasm32-unknown-unknown` exports `dump_ptr` and `dump_len` and has no imports, so the same
  `.wasm` file runs in Node and in a browser page unchanged.
- [`run.mjs`](../../research/taffy-wasm32/run.mjs) builds each variant, runs it, and compares every
  32-bit word with the native release build of the same run. A mismatch is reported with tree,
  node, pass (rounded or unrounded), field and both bit patterns. Every variant is also compared
  with the per-tree SHA-256 values in
  [`golden.json`](../../research/taffy-wasm32/golden.json), recorded on aarch64-apple-darwin, which
  gives the cross-host comparison. A tree that differs from the golden file has its bytes written
  to the log, so it can be diffed against a run on the golden host.
- `pnpm test` runs `pnpm test:research:taffy-wasm32`, which also runs `cargo fmt --check`, clippy
  with `-D warnings` and the crate's test. Under `CI=true` a variant that cannot build or run fails
  the run. Elsewhere it is reported as a `refusal` line and skipped.

Re-run it with:

```sh
pnpm test:research:taffy-wasm32
node research/taffy-wasm32/run.mjs --help
```

### Inputs chosen to provoke differences

Every length is written as a bit pattern, so the inputs are exact on every target.

- Lengths: 0, -0, 0.1, 1/3, 0.5, 0.7, 1.5, 2.5 (rounding ties), pi, 9.333333, 99.99, 123.456,
  150.5, 0.99999994, the smallest subnormal, the smallest normal, 16777215 and 10000001 (where the
  gap between adjacent `f32` values is one pixel or more).
- Percentages of 1/3, 2/3, 1/8, 1/10, 0.001 and just under 100%, for sizes, insets, margins,
  padding and gaps.
- Flex grow and shrink factors of 0, 0.1, 1/3, 2.7, 0.001, 10 and a subnormal. Aspect ratios
  16/9, 1/3 and 1.618.
- Block and flex containers in all four flex directions, `nowrap`, `wrap` and `wrap-reverse`,
  every `justify-content` distribution (including `space-evenly`), baseline and stretch alignment,
  `align-content`, `box-sizing` both ways, min and max sizes, `auto` margins, absolute positioning
  with percentage insets, left and right floats, and scroll containers with 15, 0.7 and 0 px
  scrollbars.
- Root available space of 800 by 600, 796.6667 by max-content, max-content, min-content, and
  321 by 0.7.
- Leaves measure as wrapping text: `chars * char_width` wide, wrapped at whole characters, with
  advances of 7.3, 8.32, 1 and 10.333333 px. The measure function divides and uses `floor`,
  `ceil`, `min` and `max`, so its float operations are part of what was compared.

The unrounded pass exists because rounding could hide a difference: 203,256 of its 336,666
values have a fractional part, with 65,829 distinct bit patterns.

## Results

All variants of all runs produced the same stream, SHA-256
`7bf4d4af09fc6e584991863b0cf12ae973b635d2b4701c717049267118d9f717`, and no `mismatch` line.

| Run | Host | Target | Toolchain | Variants |
| --- | --- | --- | --- | --- |
| local, commit `0687fc7` | macOS (Darwin 25.6.0), Apple M5 | aarch64-apple-darwin | rustc 1.100.0 (Homebrew), LLVM 23.1.6 | native release, native release `-C target-cpu=native`, native debug |
| CI run 45111760322, commit `0687fc7` | GitHub Actions `ubuntu-latest` (Linux 7.0.0-1016-aws), Intel Xeon 6975P-C | x86_64-unknown-linux-gnu | rustc 1.96.0, LLVM 22.1.2 | native release, native release `-C target-cpu=native`, native debug |
| the same run | the same runner, Node 22.23.5 (V8 12.4.254.21) | wasm32-unknown-unknown | rustc 1.96.0 | wasm32 release, wasm32 release `+simd128` |
| CI run 45112314195, commit `8b90fa2` | GitHub Actions `ubuntu-latest` (Linux 7.0.0-1020-azure), AMD EPYC 9V74 | x86_64-unknown-linux-gnu | rustc 1.96.0, LLVM 22.1.2 | native release, native release `-C target-cpu=native`, native debug |
| the same run | the same runner, Node 22.23.5 (V8 12.4.254.21) | wasm32-unknown-unknown | rustc 1.96.0 | wasm32 release, wasm32 release `+simd128` |
| the same run | the same runner, headless Chromium 157.0.8103.78 through Playwright | wasm32-unknown-unknown | rustc 1.96.0 | wasm32 release |

The Chromium variant of run 45111760322 did not run: the harness read `memory.buffer` before the
first export call grew memory, and Chromium refused the detached buffer. Commit `8b90fa2` fixed the
harness, not the experiment.

The wasm32 build could not run on the Mac: Homebrew's rustc ships no wasm32 standard library and no
`rust-lld`, and installing either was out of scope. So every wasm32 result comes from the CI
runner.

The Mac and the CI runners used different compilers (1.100.0 with LLVM 23 on the Mac, 1.96.0
with LLVM 22 in CI) and still agreed.

## Source review

Taffy 0.15.1 with default features (`std`, `taffy_tree`, `flexbox`, `flexbox_balance`, `grid`,
`block_layout`, `float_layout`, `calc`, `content_size`, `detailed_layout_info`) depends only on
`slotmap` 1.1.1 and `smallvec` 1.16.6. It does not use `libm`.

- No `mul_add`, `sqrt`, `powf`, `exp`, `ln` or trigonometric call appears anywhere in `src/`.
- Its float helpers (`src/util/sys.rs`, `std` build) are `f32::floor`, `ceil`, `abs`, `max` and
  `min`. Its `round` is `(value + 0.5).floor()`, not `f32::round`. `floor`, `ceil` and `abs` are
  exact operations. The rest is `+`, `-`, `*` and `/`, which IEEE 754 defines exactly and Rust does
  not contract into fused multiply-add.
- `f32::max` and `f32::min` are the exception. Rust documents that when the inputs compare equal,
  as `+0.0` and `-0.0` do, "either input may be returned non-deterministically". The stream holds
  17,482 negative zeros, and they matched on every host here, but Rust does not promise that.
- The `no_std` build swaps in polyfills copied from `num-traits` for `round`, `floor`, `ceil` and
  `abs`. This experiment uses the `std` build only.
- `total_cmp` is used to pick maxima in flexbox and grid. It is deterministic.

## Limits

- **Coverage.** Grid layout, `calc()`, `display: none`, right-to-left direction, `text-align` and
  flex line balancing are compiled in but never used by the generated trees. The answer says nothing
  about them.
- **NaN.** No input is NaN and no output was NaN. Rust does not fix the sign or payload of a NaN
  produced by arithmetic, and wasm makes NaN bits nondeterministic, so inputs that produce NaN could
  differ in bits even where they agree in value.
- **Signed zero.** As above: equal here, not guaranteed. A frame hash taken over raw `f32` bits
  would see a `+0.0`/`-0.0` flip. One taken after conversion to integers would not.
- **FMA.** Taffy never asks for a fused multiply-add, and `rustc` does not contract by default, so
  `-C target-cpu=native`, which lets the compiler use every instruction each tested CPU has (FMA included), changed nothing. A
  build with fast-math style flags, or a Taffy version that adds `mul_add`, would void this.
- **`+simd128`.** Tested: the build with wasm SIMD enabled gave the same bits.
- **Hosts.** One Apple M5, one Intel Xeon runner and one AMD EPYC runner. No 32-bit ARM, no
  Windows, and only the V8 engine (Node and Chromium both use V8). Firefox and Safari were not
  tested.
- **Versions.** Taffy `=0.15.1`, pinned in the experiment's `Cargo.toml` and `Cargo.lock`. A Taffy
  update can change the answer.

## Input to #141

The card's two outcomes are "identical on all targets: use Taffy with a pinned version and a
cross-target gate" and "different on some target: write fixed-point block layout". This
experiment found the first outcome on the hosts and inputs above. It leaves #141 three facts to
weigh:

1. Agreement depends on Rust's unpromised `max`/`min` behavior at signed zero, and on never
   producing NaN.
2. Grid and `calc()` were not tested.
3. Taffy's results are `f32`. Under the integer-only pixel path of #78 they would still need a
   defined conversion to integers before they reach the frame.

The harness in `research/taffy-wasm32/` can serve as that cross-target gate, or as a model for it.
