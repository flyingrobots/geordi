# Render Law: One Integer Rasterizer, With The Frame Hash As The Claim

> **DRAFT: AWAITING DECISION.** This record is an analyst's draft for the decider, James Ross
> (`flyingrobots`). Nothing in it is decided. The [Decision](#decision) section is empty on purpose
> and must be filled in by the decider before the pull request that adds this file is merged. Until
> then no other document, issue or code may cite this record as the render law.

**Status**: Draft, awaiting decision
**Date**: 2026-11-22
**Issue**: [flyingrobots/geordi#78](https://github.com/flyingrobots/geordi/issues/78)
**Milestone**: [flyingrobots/geordi#77](https://github.com/flyingrobots/geordi/issues/77)
**Baseline**: `main` at `99391a6` (merge of [#210](https://github.com/flyingrobots/geordi/pull/210))
**Decider**: James Ross (`flyingrobots`)

## Reader job

This record lets the decider choose Geordi's render law by reading one document. For every option
it states what the option claims, what it costs to build, what the evidence on `main` does and does
not show about it, which issues it unblocks or forecloses, what it costs to reverse, and the
strongest argument against it. It ends with an analyst's recommendation and an empty Decision
section.

Statements are marked by kind:

- **[Established]**: shown by evidence on `main` at `99391a6`; the file or commit is cited.
- **[Inferred]**: follows from established facts by reasoning stated next to it; not tested.
- **[Unknown]**: nothing on `main` answers it.

The issue says the decider "confirmed option A on 2026-11-08" in conversation. That confirmation
predates most of the evidence below: the `bijou-surface-gpu/1` ABI (selected 2026-11-21), its
presenters, and the Taffy and rustybuzz findings (2026-11-22). Part of that evidence conflicts with
the literal text of option A (see [The GPU rule conflict](#the-gpu-rule-conflict)). This draft
therefore asks the decider to confirm option A as written, confirm it with amendments, or choose
another option, and to record that in [Decision](#decision).

## The choice

Which render law does Geordi adopt? The issue offers A and B. This record adds two options the
evidence shows are missing, labelled as the analyst's: A′ (option A with its GPU rule and its
meaning of "one rasterizer" made precise) and C (one integer law with several conforming
implementations and no privileged codebase).

| Option | One-line summary | Source |
| --- | --- | --- |
| A | One Rust integer rasterizer crate, native and WASM; GPU hosts present its frame or run the same algorithm in compute shaders; fixed-function rasterization, hardware texture sampling and shader float math forbidden; claim is an equal `geordi-frame-hash/1` | Issue #78 |
| A′ | Option A, with a precise GPU rule taken from `bijou-surface-gpu/1`, "one rasterizer" defined as one reference implementation per profile, one hash definition, and a stated integer boundary | Analyst |
| B | One renderer per host, compared with pixel probes | Issue #78 |
| C | One written integer law per profile; any number of implementations (Rust, TypeScript, WGSL, GLSL) conform by reproducing the profile's golden frame hashes; no codebase is privileged | Analyst |

## Background

**[Established]** Geordi rasterizes in more than one way today:

- `crates/geordi-renderer/src/lib.rs` (`nonzero_winding`, line 1098 at `99391a6`; the issue cites
  `f68160f`) samples glyph outlines with `f64` at pixel centres, using `f64::mul_add`, with no
  antialiasing.
- `examples/browser-render-everywhere/src/strictTextRender.ts` fills strict-text outlines with
  Canvas 2D paths (`context.fill('nonzero')`, line 102).
- `packages/runtime-webgl/src/WebGLRenderer.ts` draws with Canvas 2D (`getContext('2d', …)`, line
  32), despite its name.
- `packages/bijou-gpu` renders Bijou cell surfaces with an integer law in four implementations
  (TypeScript oracle, TypeScript Canvas 2D compositor, WGSL, `naga`-generated GLSL ES 3.00), all
  checked against one frame hash. This is new since the issue was written; see
  [Evidence](#evidence-on-main).

**[Established]** Only axis-aligned integer rectangles are claimed pixel-identical between the
browser and native harnesses (`VISION.md`, Proof Ladder; `docs/STATUS.md`, Current Nonclaims).

## Evidence on main

### `bijou-surface-gpu/1`: an integer law whose claim is a frame hash

**[Established]** The design record
[`2026-11-bijou-surface-gpu-abi.md`](./2026-11-bijou-surface-gpu-abi.md) (merged in
[#176](https://github.com/flyingrobots/geordi/pull/176), `b1251c3`; Option A selected 2026-11-21,
Option E4 approved 2026-11-22) defines one zero-float pixel law for Bijou cell surfaces. Every pixel
decision uses `u32` arithmetic; canonical readback uses integer targets (`rgba8uint`, `RGBA8UI`,
integer `ImageData`); and every presenter's test must assert
`receipt.frameRgbaSha256 === oracle.frameRgbaSha256` with zero tolerance (section 6).

**[Established]** The implementations and their evidence:

| Implementation | Where | Merged | What reproduced the oracle's frame SHA-256 | Limits stated on its page |
| --- | --- | --- | --- | --- |
| CPU reference oracle (TypeScript) | `packages/bijou-gpu/src/reference.ts`; [`../bijou-gpu-conformance-kit.md`](../bijou-gpu-conformance-kit.md) | [#177](https://github.com/flyingrobots/geordi/pull/177), `993589c` | It is the oracle | Renders on the CPU only |
| Canonical shader and GLSL generator | `packages/bijou-gpu/shaders/`, `crates/geordi-bijou-shadergen`; [`../bijou-gpu-shaders.md`](../bijou-gpu-shaders.md) | [#178](https://github.com/flyingrobots/geordi/pull/178), `e97c614` | Bunny kernel vectors bit for bit in translated GLSL; Option E4 arcs with zero divergent pixels in WebGL2 and WebGPU at the listed sizes | The exhaustive `[1..256]^2` arc diff is opt-in (`GEORDI_BIJOU_GPU_E4_EXHAUSTIVE=1`); CI runs the listed sizes |
| WebGL2 presenter | `packages/bijou-gpu/src/webgl2-presenter.ts`; [`../bijou-gpu-webgl2-presenter.md`](../bijou-gpu-webgl2-presenter.md) | [#183](https://github.com/flyingrobots/geordi/pull/183), `fd359fc` | Paint and erase fixtures; 120 animated frames at 160 x 48 cells | Chrome only. CI is SwiftShader (`software-probed`). `gpu-probed` from one local run on `ANGLE Metal Renderer: Apple M5` (test plan, Evidence levels). No frame-time budget |
| WebGPU presenter | `packages/bijou-gpu/src/webgpu-presenter.ts`; [`../bijou-gpu-webgpu-presenter.md`](../bijou-gpu-webgpu-presenter.md) | [#184](https://github.com/flyingrobots/geordi/pull/184), `1f89580` | Atlas and procedural paint and erase; 24 seeded resizes | Chrome on Apple Metal on one Mac, plus local SwiftShader. Hosted CI has no WebGPU adapter and skips positive tests as `capability-refused`. Device loss only against a fake. No timing |
| Canvas 2D presenter | `packages/bijou-gpu/src/canvas2d-presenter.ts`; [`../bijou-gpu-canvas2d-presenter.md`](../bijou-gpu-canvas2d-presenter.md) | [#182](https://github.com/flyingrobots/geordi/pull/182), `7fd2f73` | Paint and erase; 500 single-cell updates with the oracle digest every 50 steps | Computes every pixel on the CPU with the oracle's integer helpers and copies them with `putImageData`; uses no canvas drawing call (`fillText`, `drawImage`, `globalAlpha` are rejected as non-exact). Chrome only. No timing |
| Native Rust `wgpu` proof | `crates/geordi-bijou-wgpu-proof`; [`../bijou-gpu-native-wgpu.md`](../bijou-gpu-native-wgpu.md) | [#181](https://github.com/flyingrobots/geordi/pull/181), `a729595` | Three `gpu-probed` receipts in `fixtures/bijou-gpu/native-wgpu/` equal to the oracle golden | Offscreen only, no window or display pass. Receipts from one Apple M5 (`wgpu` Metal, `IntegratedGpu`). CI runs no adapter test, so CI produces no `gpu-probed` evidence |

**[Established]** Scope of what was hashed: the width-1 fixture suite is an 8 x 7 cell grid at 8 x
16 pixel cells on a 67 x 117 canvas, two frames (paint, erase), plus the Bijou RE-036 import on a
16 x 32 canvas (conformance kit, Width-1 fixture suite; native proof, Checked-in receipts). Text
glyphs in these fixtures come from a hand-authored 8 x 16 test glyph pack, not from a font
(conformance kit, Test glyph pack). The contract is width-1 glyphs only; width-2 glyphs are refused
(ABI section 3).

**[Established]** With a real font, `GlyphAtlas`'s browser adapter rasterizes each glyph with
Canvas 2D `fillText` and reads it back (`../bijou-gpu-glyph-atlas.md`, Browser adapter). The frame
hash law holds "given identical `rgba8uint` `GlyphAtlas` bytes" (ABI section 6), so with real fonts
the atlas, and therefore the frame, depends on the host's text rasterizer.

**[Established]** Bunny primitives adopted by the shader, pinned in ABI section "Deterministic
numeric law":

| Contract | Bunny commit | Artifact | SHA-256 |
| --- | --- | --- | --- |
| `bunny-u32-div-round-even/1` | `3b7fbad` | `crates/bunny-gpu/shaders/bunny_u32_div_round_even.wgsl` | `ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f` |
| `bunny-u32-div-round-even/1` | `3b7fbad` | `crates/bunny-gpu/fixtures/u32_div_round_even_vectors.json` | `df265cc7233772e33347b04fa1f7a3e71f34566e4aa6af5cf3fecf23e2b044a6` |
| `bunny-u32-ellipse-classify/1` | `292a2c3` | `crates/bunny-gpu/shaders/bunny_u32_ellipse_classify.wgsl` | `1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99` |
| `bunny-u32-ellipse-classify/1` | `292a2c3` | `crates/bunny-gpu/fixtures/u32_ellipse_classify_vectors.json` | `5f0ec6422de185e2ce7e832a7c1bce7ccde9b6f33e92b399f7c547191ef205e4` |

The ABI states that these cover bounded unsigned terminal math only and make no claim of full
`FixedQ32_32` GPU conformance.

**[Established]** Option E4 (ABI section 7.1, item 3): rounded box-drawing corners are classified
exactly with `bunny-u32-ellipse-classify/1`. An earlier Q12 fixed-point truncation rule was
rejected after an exact-rational comparison over `[1..256]^2` found 179,000 changed pixels. E4 was
checked over all 262,144 size-and-corner instances for non-vanishing, single-component
connectivity and an edge-join sandwich. This is a worked example of an integer geometry rule chosen
by exhaustive evidence rather than by eye.

### The GPU rule conflict

**[Established]** `bijou-surface.wgsl` is drawn as one fullscreen triangle through the hardware
rasterizer. Its only floats are the clip-space position written by `vs_main` and the rasterizer
position that `frag_px` and `frag_py` convert to integers once (`../bijou-gpu-shaders.md`, Floating
point). It reads textures only with `textureLoad` / `texelFetch` at LOD 0, with no filtering (ABI
section 2).

**[Inferred]** Option A as written forbids "fixed-function rasterization" and "shader float math"
in the pixel path. Read literally, the existing `bijou-surface-gpu/1` WebGL2, WebGPU and native
presenters use the fixed-function rasterizer to enumerate pixels and hold floats in the fragment
position, so they would be non-compliant, although they are the only GPU evidence of frame-hash
equality that Geordi has. Read generously ("fixed-function rasterization may enumerate pixel
centres but may not decide coverage"), they comply. The issue's text does not say which reading it
means. The decision has to.

**[Established]** WebGL2 has no compute shaders. **[Inferred]** Under option A's "or runs the same
integer algorithm in compute shaders", a WebGL2 host can only present a CPU-produced frame.

### Upstream float stages: Taffy and rustybuzz

**[Established]** [`2026-11-taffy-wasm32-determinism.md`](./2026-11-taffy-wasm32-determinism.md)
([#136](https://github.com/flyingrobots/geordi/issues/136), merged in
[#209](https://github.com/flyingrobots/geordi/pull/209), `c16f3cf`): all 673,332 `f32` outputs from
50 generated block and flex trees had the same bits on one Apple M5, one Intel Xeon and one AMD EPYC
runner, and as wasm32 in Node and headless Chromium (V8 only). Its limits: agreement depends on
Rust's unpromised `f32::max`/`min` choice at signed zero and on never producing NaN; grid and
`calc()` were not exercised; Firefox and Safari were not tested; Taffy `=0.15.1` only. It notes
that Taffy's `f32` results would need "a defined conversion to integers before they reach the
frame".

**[Established]** [`2026-11-rustybuzz-wasm32-determinism.md`](./2026-11-rustybuzz-wasm32-determinism.md)
([#137](https://github.com/flyingrobots/geordi/issues/137), merged in
[#210](https://github.com/flyingrobots/geordi/pull/210), `99391a6`): all 344,015 shaping outputs for
200 Latin strings under five configurations were identical on the same three hosts and wasm32 in
Node and Chromium, and the source review found no float arithmetic on the way to an output value
for Lato Regular. Limits: one face, Latin only, no hinting, V8 only; a variable, colour or bitmap
font would reach `f32` sites.

**[Inferred]** A float-using stage can sit upstream of an integer rasterizer without breaking a
frame-hash claim only if (a) its output is converted to integers once, by a rule the profile
defines, before the pixel path; (b) the stage is pinned to an exact version; and (c) a cross-target
gate like the two research harnesses runs on each update. Taffy's signed-zero dependence disappears
after an integer conversion (the Taffy record says so); its NaN exposure does not, unless inputs
that can produce NaN are rejected. rustybuzz already yields integers in font units for the tested
face. Both findings are inputs to [#141](https://github.com/flyingrobots/geordi/issues/141) and
[#142](https://github.com/flyingrobots/geordi/issues/142), which sit downstream of this decision
(through #135 → #138/#139 → #140 → #141, and #70 → #108 → #110 → #142).

### Fixed-point kernels and the ray-traced profile

**[Established]** [`2026-11-fixed-point-and-ray-traced-scene-profiles.md`](./2026-11-fixed-point-and-ray-traced-scene-profiles.md)
(accepted 2026-11-13, [#152](https://github.com/flyingrobots/geordi/issues/152)) defines
`geordi-fixed-q32.32/1` on Bunny's Q32.32 and a ray-traced scene profile whose output is RGBA8 with
an image hash. No renderer exists and the profile is not claimed (its Reader job). Its proof gates
(B9) include machine invariance across two CPU architectures and, as a later separate claim, "an
independent implementation … written from its definition", described as "the evidence that the
definition, not one codebase, fixes the bytes". CPU and GPU agreement is a separate later gate
([lumen#7](https://github.com/flyingrobots/lumen/issues/7)).

**[Established]** Three hash definitions exist or are planned:

| Hash | Defined in | Bytes hashed | Text form |
| --- | --- | --- | --- |
| `frameRgbaSha256` | ABI section 6 (on `main`) | Tight RGBA8 only; size in the receipt | 64 lowercase hex |
| `imageHash` | Ray-traced profile B6 (on `main`, accepted) | Tight RGBA8 only; size, format and encoding in the receipt | `sha256:` + 64 lowercase hex |
| `geordi-frame-hash/1` | [#84](https://github.com/flyingrobots/geordi/issues/84) (planned) | ASCII `geordi-frame/1`, a zero byte, width, height and format code as `u32` LE, then RGBA8 | `sha256:` + 64 lowercase hex |

**[Inferred]** The same pixels give three different strings. A law whose claim is "the frame hash"
must say which one, or how they relate.

### Performance

**[Established]** No document or test on `main` measures the speed of any integer rasterizer. Every
`bijou-gpu` page says no timing was measured; the WebGL2 stress test records its duration as an
annotation and asserts nothing (`../bijou-gpu-webgl2-presenter-test-plan.md`, Not covered). The
ABI's nonclaims say frame timings "must be measured on named hardware". The only timing claim near
this work is lumen's 4K ray-tracing target, which is lumen's claim, not Geordi's
([lumen#5](https://github.com/flyingrobots/lumen/issues/5)).

**[Unknown]** Whether a CPU or WASM integer rasterizer with `putImageData` sustains interactive
frame rates at large surfaces (for example 2560 x 1440 or 4K) in any browser.

## What each option would decide downstream

**[Established]** 59 open issues are downstream of #78 in the `.blocked_by` graph at the time of
writing. The six that name #78 directly are:

| Issue | What it needs from this record |
| --- | --- |
| [#79](https://github.com/flyingrobots/geordi/issues/79) | The public claim for README, VISION, STATUS and the boundary doc |
| [#82](https://github.com/flyingrobots/geordi/issues/82) | Whether `crates/geordi-raster` (integer-only, float gate, Q24.8 `RasterCoord`) exists; the issue says the decision is reversible until #82 lands |
| [#106](https://github.com/flyingrobots/geordi/issues/106) | Whether `runtime-webgl` is removed, becomes a WASM loader, or stays as a labelled non-compliant preview |
| [#70](https://github.com/flyingrobots/geordi/issues/70) | Whether "renderers do not shape strings" changes to "renderers shape strings only with pinned, integer-only Geordi code" (its option C) |
| [#114](https://github.com/flyingrobots/geordi/issues/114) | Whether Echo scene visual rules are defined as exact integer rules with golden hashes |
| [#135](https://github.com/flyingrobots/geordi/issues/135) | Whether the CSS subset is sized for a deterministic integer pipeline |

Outside this repository, [flyingrobots/echo#964](https://github.com/flyingrobots/echo/issues/964)
(scene-port scalars as Q32.32 or `f32`) names #78 directly.

Further downstream are the raster chain (#83 to #105, including #84 `geordi-frame-hash/1`, #85
integer coverage accumulation, #96 the WASM ABI crate, #98 the TypeScript frame hash, #100 Firefox
and WebKit, #105 removing Canvas 2D rasterization), the Echo renderer chain (#118 to #129), the
Bunny proof (#72, #131 to #133), text (#108 to #112, #142) and HTML and CSS (#138 to #148, which
include #141).

## Options and consequences

### Option A: one Rust integer rasterizer (as written in the issue)

**Claims.** Every compliant host produces the same RGBA8 frame for the same inputs, and proves it
with an equal `geordi-frame-hash/1`. There is one rasterizer: a Rust crate with an integer-only
pixel path, compiled to native code and to WASM. Browsers show its frame with `putImageData`. A GPU
host presents the frame, or runs the same integer algorithm in compute shaders. Fixed-function
rasterization, hardware texture sampling and shader float math are not allowed in the pixel path.
Bunny supplies the fixed-point geometry math. Echo is the first customer.

**Requires.** `crates/geordi-raster` with float lints and a source-level float gate (#82); integer
compositing (#83); the hash (#84); integer coverage accumulation for antialiased paths (#85); curve
flattening, strokes and dashes (#86 to #90); a golden manifest (#91); the WASM ABI and build
(#96, #97); browser gates in three engines (#99 to #103); removal of Canvas 2D rasterization
(#105); glyph outlines decoded into raster paths (#109); and an outcome on #106.

**What the evidence shows.**

- **[Established]** Integer pixel math reproduces one frame hash across CPU, browser GPU and native
  GPU for the width-1 Bijou fixtures (table above).
- **[Established]** Canvas 2D can carry a bit-exact frame, but only as a `putImageData` copy of
  integer-computed pixels, never through its drawing calls (`../bijou-gpu-canvas2d-presenter.md`,
  How pixels are produced). That is exactly option A's browser path.
- **[Established]** Pinned float-using layout and integer shaping agree bit for bit across three
  CPUs and wasm32 for the inputs tested (Taffy, rustybuzz records).

**What it does not show.**

- **[Unknown]** Any Rust integer rasterizer exists; `crates/geordi-raster` does not.
- **[Established]** The evidence was produced by four implementations of one law, not by one
  rasterizer compiled to several targets. **[Inferred]** It supports "one law, proven by hash" more
  directly than "one codebase".
- **[Established]** No compute-shader implementation of any Geordi pixel law exists.
- **[Unknown]** Performance at any size (see [Performance](#performance)).
- **[Unknown]** Agreement in Firefox, Safari or on any GPU other than the Apple M5.

**Unblocks.** #79, #82 and its chain, #106, #70, #114, #135, echo#964, and through them the Echo,
Bunny, text and HTML chains.

**Forecloses.** Host-native text rendering, hinting and subpixel (LCD) antialiasing as compliant
paths. GPU fixed-function rasterization and filtering for compliant output. **[Inferred]** If read
literally, the current `bijou-surface-gpu/1` GPU presenters as compliant renderers (see
[The GPU rule conflict](#the-gpu-rule-conflict)), and the TypeScript oracle as a second rasterizer.

**Cost to reverse.** Low before #82; the issue says so. **[Inferred]** The real lock-in point is
later: golden frame hashes (#91, #125, #146) and the Echo scene-port contract once published
(echo#964 says reversible until echo#968 publishes the crates). After those, a change of law means
new profile versions and new goldens.

**Strongest argument against.** "One rasterizer" puts every pixel through a CPU or WASM code path
whose speed nobody has measured, and forbids the GPU features that make GPUs fast at rasterizing.
If the integer CPU path is too slow for large interactive surfaces, the product claim survives only
for small or static frames, and the work in #82 to #105 has been spent before that is known. A
second argument: the literal GPU rule contradicts the one GPU design the maintainer approved after
2026-11-08.

### Option A′: option A, made precise (analyst's option)

**Claims.** The same claim as option A, with four amendments:

1. **One reference rasterizer per profile, conformance by hash.** `geordi-raster` is the reference
   implementation for the raster profiles. Other implementations (a GPU shader, an integer Canvas 2D
   compositor, a TypeScript oracle) are allowed only as conformance implementations that reproduce
   the reference's golden frame hashes with zero tolerance. A profile whose reference is not in
   Rust, such as `bijou-surface-gpu/1` with its TypeScript oracle, is named as such in the law.
2. **A precise GPU rule**, taken from `bijou-surface-gpu/1`. Allowed: the hardware rasterizer used
   only to enumerate pixel centres, with the fragment position converted to integers once; integer
   texel loads (`textureLoad` / `texelFetch` at LOD 0); integer colour targets for canonical
   readback; a separate display pass that only copies bytes. Forbidden: any floating-point value
   that decides a pixel; texture filtering, mipmaps and samplers; fixed-function blending; MSAA;
   derivatives; `-srgb` targets; dithering; and using the hardware rasterizer to decide coverage.
3. **One hash definition.** The law names one frame hash and states how `frameRgbaSha256` and the
   ray-traced `imageHash` map to it (for example, both become fields derivable from the same tight
   RGBA8 bytes plus the receipt's size and format).
4. **A stated integer boundary.** The pixel path starts at `RasterCoord`. Stages before it may use
   floats only if the profile pins the stage's version, defines one conversion to integers, rejects
   inputs that can produce NaN, and runs a cross-target gate on each update.

**Requires.** Everything option A requires, plus text in `docs/raster-profile.md` (#82) for the GPU
rule and the integer boundary, a hash reconciliation in #84, and a short note in the
`bijou-surface-gpu/1` record placing that profile under the law.

**What the evidence shows.** **[Established]** Every amendment is already practised on `main`: the
GPU rule is the one the `bijou-surface-gpu/1` presenters follow and pass under; reference-plus-
conformance is how the conformance kit works; the ray-traced profile already asks for an
independent implementation as later evidence. **[Inferred]** A′ makes the law consistent with the
only evidence that exists, without giving up option A's single reference.

**What it does not show.** The same gaps as option A: no Rust rasterizer, no performance figures,
one GPU, one browser.

**Unblocks.** The same issues as option A. It also unblocks #106 more cleanly, because "a thin
loader for the WASM module" and "a conformance implementation" become distinct, named roles.

**Forecloses.** The same as option A, except that GPU fragment presenters that follow the rule stay
compliant.

**Cost to reverse.** As option A. The amendments themselves are wording until goldens exist.

**Strongest argument against.** Allowing conformance implementations reopens the door option A
wanted shut: every extra implementation is code that can drift, and the GPU rule needs reviewers who
can tell a deciding float from a non-deciding one. A per-pixel closed-form law like Bijou's maps
naturally onto a fragment shader; a scan-line accumulation rasterizer like #85 does not, so in
practice GPU conformance for general paths may never be built, and the amendment buys little.

### Option B: one renderer per host, compared with pixel probes (as written in the issue)

**Claims.** Each host renders with the tools native to it (Canvas 2D or WebGL in browsers,
`geordi-renderer` natively, GPU pipelines where present). Agreement is checked with pixel probes at
chosen points. The claim stays what it is today: exact agreement for integer rectangles, and
probe-level agreement elsewhere.

**Requires.** Little new code. A probe policy for content that cannot match exactly (tolerances,
or regions excluded from probes); keeping `runtime-webgl` and naming it correctly (#106 option C or
B); rewriting the raster, Echo and HTML chains so their gates are probe-based, not hash-based.

**The best case for it.**

- **[Established]** It is the current state, and its claims are true today (`VISION.md`, Proof
  Ladder).
- **[Inferred]** Each host gets its own best antialiasing, hinting, subpixel text and GPU speed. No
  WASM payload, no CPU raster cost, no `putImageData` upload per frame.
- **[Inferred]** It matches how mainstream engines treat cross-backend output (equal in intent, not
  in bytes), which is what most UI consumers expect.
- **[Established]** The portable endpoints record already frames the Geordi claim this way: "not
  that every endpoint produces identical pixels … [but] explicit artifacts, declared feature
  support, fail-loud … and receipts" ([`2026-06-portable-bijou-ui-render-endpoints.md`](./2026-06-portable-bijou-ui-render-endpoints.md),
  Decision Summary).

**What the evidence shows against it.** **[Established]** Canvas 2D drawing calls antialias,
filter and blend in floating point, and the canvas stores premultiplied colour
(`../bijou-gpu-canvas2d-presenter.md`). **[Inferred]** So host-native rendering cannot give byte
equality for antialiased or translucent content, which the issue states. **[Established]** The
bijou presenters show byte equality is achievable across hosts when the law is integer, so B gives
up a property that has been demonstrated, not a hypothetical one.

**Unblocks.** #106 (as C or B) and #79 (with per-host claims) immediately. It needs #82 to #105 to be
closed or rescoped.

**Forecloses.** The frame-hash claim for anything beyond integer rectangles; golden frame hashes
for Echo (#124, #125), the Bunny proof (#132, #133) and the HTML page (#146, #147); echo#964's
reason to move scene scalars to Q32.32 for rendering (Echo's own float ban would still apply).

**Cost to reverse.** **[Inferred]** Low in code, because B builds little. High in direction: every
week under B adds host-specific rendering that a later move to A would delete (#105 already plans
such a deletion).

**Strongest argument against.** It cannot make the claim the milestone (#77) exists to make, that
the same inputs give the same RGBA8 bytes natively, in a browser, as an image and through GPU
hosts. With B, Geordi is a receipt format around renderers that disagree.

### Option C: one integer law, many conforming implementations (analyst's option)

**Claims.** Each profile is a written integer law plus golden frame hashes. Any implementation, in
any language, on any host, is compliant if it reproduces the goldens. No codebase is the law;
the document and the goldens are.

**Requires.** For every profile: a normative written law precise enough to implement twice; a
conformance suite with goldens; and as many implementations as there are host strategies (Rust
native, TypeScript or WASM in browsers, WGSL and GLSL on GPUs). Each new primitive (coverage
accumulation, Bézier flattening, strokes, dashes, glyph outlines) is written once per
implementation.

**The best case for it.**

- **[Established]** It describes `bijou-surface-gpu/1` exactly: a TypeScript oracle, a TypeScript
  Canvas 2D compositor "written independently of the oracle's inner loop", WGSL, and generated GLSL,
  all equal by hash.
- **[Established]** The ray-traced profile names an independent implementation as the strongest
  evidence that "the definition, not one codebase, fixes the bytes" (B9).
- **[Established]** The boundary doc keeps TypeScript native at the edges and reserves WASM for hard
  kernels ([`2026-05-typescript-rust-wasm-boundary.md`](./2026-05-typescript-rust-wasm-boundary.md),
  WASM Justification Test). C keeps that policy; A makes the rasterizer a mandatory WASM kernel in
  browsers.
- **[Inferred]** GPU hosts can run the law at GPU speed where it is per-pixel.

**What the evidence does not show.** **[Unknown]** Whether a general path rasterizer with
scan-line accumulation (#85) can be written as a per-pixel GPU law at all, or kept in lockstep
across three languages at reasonable cost. The only multi-implementation law on `main` is a
per-cell closed-form law with no accumulation across pixels.

**Unblocks.** #79, #114, #135 and echo#964 as option A does. #82 and its chain become "the Rust
implementation", one of several. #106 becomes "a TypeScript implementation", not a loader.

**Forecloses.** Nothing technical. It forecloses the simplicity of one codebase.

**Cost to reverse.** **[Inferred]** Moving from C to A later means deleting the non-Rust
implementations; moving from A to C later means writing them. Both are possible after goldens
exist, because goldens are implementation-independent.

**Strongest argument against.** The boundary doc's own test asks "Would duplicating this logic in
TypeScript and Rust create scary bugs?" and lists "Produce pixel-perfect reference output" as a
Rust-first item. A rasterizer is the canonical example of logic whose duplication creates scary
bugs: the E4 work found 179,000 pixel differences between two reasonable integer rules for one
corner shape. C multiplies that risk by the number of implementations and the number of primitives.

## Residual risks of the favoured option

These apply to options A and A′. Each is stated with what evidence exists.

| Risk | Evidence on `main` | Kind |
| --- | --- | --- |
| Integer CPU or WASM rasterizer too slow at large surfaces | None. No timing measured anywhere in this work; largest frames tested are small (67 x 117 fixtures; 160 x 48 cells in the WebGL2 stress test) | Unknown |
| Text beyond width-1 | `bijou-surface-gpu/1` is width-1 only; real-font atlases come from host `fillText`, so frames with real fonts are host-dependent today. Glyph outline decoding into the integer rasterizer (#109, #111) does not exist | Established gap |
| Antialiasing | Planned as integer signed-area coverage, 0 to 255 (#85). Not built | Unknown |
| Subpixel (LCD) antialiasing | Incompatible with a frame hash because it depends on the display's subpixel layout. The atlas tests use synthetic subpixel fixtures only | Inferred: foreclosed |
| Subpixel glyph positioning | `RasterCoord` Q24.8 (#82) gives 1/256 px positions. Not built | Inferred: possible |
| Colour management | `bijou-surface-gpu/1` blends sRGB-direct, with no gamma conversion, and refuses `-srgb` swapchains to avoid a double gamma shift. That is a choice of look (not linear-light blending) the law would freeze. What the OS compositor and display do after presentation is outside every hash | Established for Bijou; unknown for the general raster profile |
| Display paths that cannot read pixels back | The hash certifies the canonical frame bytes, not the display. Bijou separates an integer canonical target from the display pass, and a frame without readback gets `unit-upload` evidence and no hash. A swapchain-only host can claim nothing | Established |
| Hardware and browser diversity | One GPU (Apple M5, Metal). Chrome only for pixels; V8 only for WASM. CI: SwiftShader WebGL2, no WebGPU adapter, no native adapter | Established gap |
| Floats upstream of the pixel path | Taffy relies on unpromised signed-zero `max`/`min` and on no NaN; rustybuzz is integer for one static face only | Established limits |
| WebGL2 cannot run compute | No compute in WebGL2; option A's compute route excludes it | Established |
| Hash ambiguity | Three hash strings for the same bytes | Established |

## Follow-up issues each option would need

"To be filed" means no matching open issue was found. This record creates no issues.

| Need | A | A′ | B | C |
| --- | --- | --- | --- | --- |
| State the law in public docs | #79 | #79 | #79, rescoped to per-host claims | #79 |
| Integer raster crate and chain | #82 to #97 | #82 to #97 | Close or rescope #82 to #105 | #82 to #97 as the Rust implementation |
| Frame hash definition | #84 | #84, plus reconciliation with `frameRgbaSha256` and `imageHash` (to be filed) | Not needed | #84, plus reconciliation (to be filed) |
| Browser through WASM | #96, #97, #99, #102, #103 | Same | Not needed | Replaced by TypeScript or WGSL implementations (to be filed) |
| Other browser engines | #100, #129, #147 | Same | Probe policy per engine (to be filed) | Same as A |
| Remove host rasterization | #105, #106 | #105, #106 | #106 as option C (labelled preview) | #106 as "TypeScript implementation" |
| Place `bijou-surface-gpu/1` under the law | Decide whether its GPU presenters are compliant (to be filed) | Note in the ABI record (to be filed) | Not needed | Already conforms |
| GPU rule written into the raster profile | Implicit in #82 | Explicit in #82, or to be filed | Not needed | Per profile (to be filed) |
| Performance measurement at large surfaces | To be filed | To be filed | Not needed | To be filed |
| Integer boundary for upstream stages | #141, #142 | #141, #142, plus the rule in #82 | Not needed | #141, #142 |
| Text and shaping law | #70 (option C) | #70 (option C) | #70 (option A or B) | #70 |
| Echo scene contract | echo#964 option A | echo#964 option A | echo#964 either option | echo#964 option A |
| Probe tolerance policy | Not needed | Not needed | To be filed | Not needed |

## Reversibility

The issue says the decision is reversible before #82 lands. **[Inferred]** #82 is a crate scaffold
with a coordinate type and a float gate; it is cheap to delete. The decision becomes expensive when
golden frame hashes exist (#91, #125, #146) and when echo#964 publishes Echo crates with Q32.32
scalars (echo#968). Those, not #82, are the practical points of no return.

## Analyst's recommendation

> This is the analyst's recommendation, not a decision.

Adopt **option A′**: option A's single integer rasterizer and frame-hash claim, with the GPU rule
written as `bijou-surface-gpu/1` practises it, "one rasterizer" defined as one reference
implementation per profile with other implementations allowed only as hash-conforming ones, one
named frame hash reconciled with the two that exist, and a stated integer boundary for float-using
stages upstream. The evidence on `main` supports the integer law and the frame-hash claim directly,
and A′ removes the one place where option A's text contradicts that evidence.

The recommendation would change if a performance measurement showed that an integer CPU or WASM
rasterizer cannot present large interactive surfaces fast enough in browsers; then option C, which
lets per-pixel profiles run on GPUs, or a narrower claim restricted to static frames, deserves a
second look. Running that measurement before goldens exist (#91) is cheap insurance.

The decision turns on three points:

1. **The GPU rule.** Does "fixed-function rasterization forbidden" forbid the fullscreen-triangle,
   integer-converted fragment position that `bijou-surface-gpu/1` uses? If yes, the only existing
   GPU proof is non-compliant and GPU hosts must present CPU frames or use compute (not available in
   WebGL2).
2. **One codebase or one law.** Is the TypeScript oracle, and any GPU shader, a forbidden second
   rasterizer or an allowed conformance implementation of a law whose reference is Rust?
3. **Which hash.** `geordi-frame-hash/1` (#84) differs in bytes and form from `frameRgbaSha256` and
   the ray-traced `imageHash` that exist on `main`.

## Decision

> **To be completed by the decider, James Ross. Left empty by the analyst.**

- **Decider**:
- **Date**:
- **Chosen option**:
- **Amendments, if any**:
- **Rejected options**:
- **Answers to the three points above**:

## Nonclaims

- This record decides nothing and changes no code.
- It does not claim that any Rust integer rasterizer exists, that any integer rasterizer is fast
  enough, or that any result above holds on a GPU other than the Apple M5, in a browser other than
  Chrome, or in a WASM engine other than V8.
- It does not claim pixel identity for any content beyond what the cited pages already claim.
- Counts of downstream issues were taken from the open issues' `.blocked_by` fields on
  2026-11-22 and will drift as issues close.
