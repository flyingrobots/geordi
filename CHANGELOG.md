# Changelog

## Unreleased

### Bug Fixes

- **Rust toolchain** (`rust-toolchain.toml`, `Cargo.toml`, CI): the pin now includes the
  `wasm32-unknown-unknown` target, the workspace `rust-version` is 1.96 (was 1.93), and CI installs the
  toolchain unconditionally from the file and builds `geordi-ir` for wasm32. A contract test,
  `scripts/rust-toolchain-pin.test.mjs`, runs in `pnpm test:docs`.
- **Generated-directory writer** (`scripts/lib/atomic-generated-directory.mjs`): the `<destination>.lock`
  file now records its owner (`geordi.generated-directory-lock/1`: pid, hostname, process start time,
  token), and a writer removes it only when it can prove the owner is gone: same host and no such
  process, or a running pid whose start time differs from the recorded one (a recycled pid). Malformed
  metadata, a lock from another host, a running owner and an owner whose start time cannot be compared
  all stay in place and the writer waits out the 10-second timeout, which now throws
  `GeneratedDirectoryLockTimeoutError`. Only the holder of a recovery lock (`<destination>.lock.recovering`)
  may remove the main lock, and only if it still carries the token it judged abandoned, so a recoverer
  can never remove a newer writer's lock; before publishing and before any rollback a writer checks that
  it still owns its lock and otherwise throws `GeneratedDirectoryLockLostError` without touching the
  destination. Removing an abandoned recovery lock is not itself serialized: that needs a recoverer crash
  plus three simultaneous recoverers, and a writer that loses its lock between a check and the rename
  after it can still end with two complete output sets, last rename wins. A lock directory left by the
  previous writer is never removed automatically; delete it by hand once no writer runs (flyingrobots/geordi#54)

### Tests

- Pin the node order of the Terminal SDL end-to-end path in `packages/schema-graphql/test/e2e.terminal.test.ts` (flyingrobots/geordi#67). The Terminal fixture never has equal `zIndex` values (the default is field order plus one), so a new case compiles eight nodes that share `zIndex: 0` with explicit ids and scrambled declaration order, and asserts the hand-written order `zIndex`, then `kind`, then `id`, bytewise. Reversing the `kind` or `id` comparison in `emitIr.ts` makes it fail. No production change: the sort already ends in a total order on unique ids

### CI

- Make the toolchain ready for the open Dependabot groups (flyingrobots/geordi#73). Root cause of the failing `Test` job on the dev-tooling group: `typescript-eslint` 8.x peers on `typescript <6.1.0` and throws at load time on TypeScript 7, so `pnpm lint` fails. `.github/dependabot.yml` now ignores TypeScript major updates until typescript-eslint supports 7. The newer `typescript-eslint` also reports nine new lint findings in three test sources (`no-meaningless-void-operator`, `no-unsafe-class-instance-assignment`) are fixed without suppressions (the randomized resize test timeout was fixed separately on main)
- Typecheck the Profunctor Page test sources: `pnpm typecheck` now also runs `tsc --noEmit -p tsconfig.test.json` in `@flyingrobots/geordi-profunctor-page`, so an invalid type in a `*.test.ts` file fails CI. The build still uses `tsconfig.json` and emits only production files. A node test (`pnpm test:profunctor-page-typecheck-gate`) proves the gate fails on an invalid test type (flyingrobots/geordi#56)
- Pin the Rust toolchain to 1.96.0 with `rust-toolchain.toml` and install that toolchain in CI instead of floating `stable`, so new compiler lints no longer fail CI on unchanged code (flyingrobots/geordi#158)

### Fixes

- **`@flyingrobots/geordi-profunctor-page`**: derive action identities injectively. The old
  `action:${pageNodeId}:${role}:${href}` joined unescaped components, so distinct tuples such as
  `("a:feature:x", "source", "y")` and `("a", "feature", "x:source:y")` collided. IDs are now
  `action:v1:<escaped pageNodeId>:<role>:<escaped href>` with `%` and `:` percent-escaped in the
  two free-form components. **Breaking for stored identities:** every action ID changes, so the
  checked-in Project Keep `scene.geordi.map.json` and `scene.geordi.json.receipt` are regenerated;
  any consumer that persisted or compared old `action:...` IDs must re-derive them
  (flyingrobots/geordi#55)

### Dependencies

- **`native-render-everywhere`** (Rust): depend on `bunny-num`, `bunny-linalg` and `bunny-geom`
  `0.7.1` from crates.io, the first Bunny dependency in the workspace (flyingrobots/geordi#154)
- Migrate `pnpm.overrides` from deprecated `package.json` field to `pnpm-workspace.yaml`; regenerate lockfile with pnpm 10.30.0 to match CI version (resolves `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY` on ubuntu-24.04)
- Bump `vitest` from `^1.3.0` to `^3.2.4` across all packages; add `esbuild >=0.25.0` override (CVE fix)

### Fixes

- **`@flyingrobots/geordi-bijou-gpu`**: the WebGPU presenter verifies the shader against a pin
  compiled into the package (flyingrobots/geordi#189). Before, it checked the WGSL against the
  digest in the manifest that the same `ShaderSourcePort` supplied, so a port could ship altered
  WGSL with a manifest altered to match, and the receipt reported the altered digest as canonical.
  Now `BIJOU_SURFACE_SHADER_PIN` (the WGSL digest, binding map, uniform layout and texture
  formats) is checked before any shader module is created, by the presenter and by
  `createWebGpuRefusalReceipt()`, with the existing `RendererFaultError`; the WebGL2 pin takes its
  WGSL digest and uniform layout from the same module. The bundled and file adapters are accepted
  and receipts carry the same digests. `createWebGPUSurfacePresenterWithUnpinnedShaderForTesting()`
  is a test-only seam that keeps the real-device compile-error test possible; no factory calls it.
  `generate-bijou-gpu-shader-sources.mjs --check` now fails when the pin differs from the manifest.
- **`geordi-ir`, `geordi-renderer`**: scenes Lumen's `Scene::new` refuses no longer validate and
  negotiate (flyingrobots/geordi#166). A scene with no triangle is refused with the new
  `GEORDI_E_RT_SCENE_EMPTY`. A camera `up` whose angle to `forward` has a sine below `2^-15` is
  refused with `GEORDI_E_RT_CAMERA_DEGENERATE`, checked exactly in 256-bit integers (the previous
  rule refused only an exactly zero cross product). `GeordiRayTracedRuntimeProfile` gains
  `max_film_pixels`, and `assert_ray_traced_runtime_profile` refuses a larger film; this is a
  breaking change for code that constructs the profile. New fixtures: `failures/scene-empty`,
  `failures/camera-up-nearly-parallel` and `negotiation/film-pixels-above-runtime-cap`.
- **`@flyingrobots/geordi-bijou-gpu`**: the package now ships its own shaders, behind a port
  (flyingrobots/geordi#185). Before, it published only `dist`, and both GPU presenters required
  the host to pass the package's generated shader text. Now:
  - `ShaderSourcePort` (`readText(file)`), `requireShaderText()` and
    `createInMemoryShaderSource()` are exported from the main entry point. The presenter cores,
    `createWebGL2SurfacePresenterCore(options)` and `createWebGPUSurfacePresenterCore(canvas,
    options)`, take a port as `shaderSource` and still refuse any byte that is not the manifest
    pin with `RendererFaultError`, as is a port that lacks a file. They import no `node:` module
    and no `?raw` specifier.
  - `createWebGL2SurfacePresenter(options)` and `createWebGPUSurfacePresenter(canvas, options)`
    wire the bundled adapter when `shaderSource` is omitted, so a host passes only a canvas and an
    atlas. Receipts carry the same digests as before.
  - Adapters: `@flyingrobots/geordi-bijou-gpu/shader-source/webgl2`
    (`WEBGL2_BUNDLED_SHADER_SOURCE`), `/shader-source/webgpu` (`WEBGPU_BUNDLED_SHADER_SOURCE`) and
    the Node-only `/shader-source/node` (`createFileShaderSource({ directory? })`). The package
    publishes `shaders/` (the manifest and the eight generated GLSL and WGSL artifacts, exported
    as `./shaders/*`) and is marked `sideEffects: false`.
  - **Breaking (0.1.0, unreleased in practice):** `options.shaders` of the WebGL2 presenter and
    `options.shader` of the WebGPU presenter are removed; pass a `ShaderSourcePort` as
    `shaderSource` instead, or nothing. `createWebGpuRefusalReceipt()` takes `shaderSource` in
    place of `shader`. `loadBijouSurfaceShader(port)` is new.
  - `scripts/generate-bijou-gpu-shader-sources.mjs` writes the embedded modules in
    `src/generated/` with a `--check` drift gate (JSON Lines, schemas in
    `schemas/geordi-bijou-shader-sources/`), run by the package tests and
    `pnpm test:bijou-gpu:shaders`. `.gitattributes` keeps the shaders LF.
    `scripts/smoke-bijou-gpu-packed-package.mjs`, run by `pnpm test:exports`, proves the shaders
    and every subpath export from the packed tarball.

### Features

- **`@flyingrobots/geordi-bijou-gpu`**: browser WebGPU presenter for the `bijou-surface-gpu/1` ABI
  (flyingrobots/geordi#175). `createWebGPUSurfacePresenter(canvas, options)` refuses a missing
  `navigator.gpu`, adapter, device or canvas context with `BackendUnavailableError`, and reports
  shader text that does not match the manifest digest, compile and pipeline errors and an `-srgb`
  canvas format as `RendererFaultError`. It runs the canonical `bijou-surface.wgsl` verbatim into
  an `rgba8uint` target and shows it through a separate `bgra8unorm` or `rgba8unorm` display pass.
  Each present uploads the packer's dirty row spans from the retained staging buffer and the atlas
  dirty rectangles with `queue.writeTexture`. `captureFrame()` reads the frame back with
  `copyTextureToBuffer`, strips the 256-byte row padding and records a `gpu-probed` or
  `software-probed` receipt; `createWebGpuRefusalReceipt()` records a refusal as
  `capability-refused`. `device.lost` is recovered by re-uploading the staging buffer and the
  atlas to a new device. `presenter-host.ts` adds canvas-size ingress, grid geometry and validated receipt assembly; the atlas comes through the shared `PresenterAtlasSource`. Browser
  probes read back frames bit-identical to `renderReferenceRgba()`.
- **`@flyingrobots/geordi-bijou-gpu`**: WebGL2 presenter for the `bijou-surface-gpu/1` ABI
  (flyingrobots/geordi#173). `createWebGL2SurfacePresenter()` compiles the checked-in
  naga-generated GLSL ES 3.00 stages unmodified, refusing text whose SHA-256 differs from the
  manifest pin, keeps prepared cells in an `RGBA32UI` texture and the glyph atlas in an `RGBA8UI`
  texture (`NEAREST`, one level), uploads only the dirty row spans from `packSurfaceDamage()` and
  the atlas dirty sub-rects, and draws one fullscreen triangle into an `RGBA8UI` canonical target
  plus a display triangle onto the canvas. Optional canonical readback gives `software-probed`
  or `gpu-probed` receipts, labelled from the renderer string; otherwise receipts are
  `unit-upload`. It recovers from `webglcontextlost` / `webglcontextrestored` from the retained
  staging buffer, implements `resize()`, `cellFromPoint()`, `dispose()` and a dirty-row
  diagnostic overlay, and throws `BackendUnavailableError` without a WebGL2 context. Adds the
  shared `PresenterAtlasSource` / `createStaticAtlasSource()` and
  `GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH` (`DrawingBufferMismatchError`).
- **`@flyingrobots/geordi-bijou-gpu`**: Canvas 2D fallback presenter for the `bijou-surface-gpu/1`
  ABI (flyingrobots/geordi#174). `createCanvas2DSurfacePresenter()` implements
  `GpuSurfacePresenter` with no WebGL or WebGPU. It packs each frame with `packSurfaceDamage()`
  and reads glyphs from a `GlyphAtlas`. Only cells whose prepared words changed are composited,
  with the pure-integer sRGB-direct blend law and the procedural glyph geometry, into a retained
  `ImageData`. Each horizontal run of changed cells is then blitted with one `putImageData` call.
  No canvas drawing operation is used, so the canvas readback hashes equal to
  `renderReferenceRgba()` with zero tolerance. `getLastReceipt()` returns a validated
  `geordi-canvas2d/1` `software-probed` receipt with null shader digests and an
  `executedArtifactSha256` pinned to the executed pixel-path source. `resize()`, the shared
  0-based `cellFromPoint()`, context-restore repaint, and `dispose()` are included.
- **`geordi-bijou-wgpu-proof`** (new Rust crate): bounded offscreen native `wgpu` proof for the
  `bijou-surface-gpu/1` ABI (flyingrobots/geordi#58). It validates one `packed-bijou-cells/1`
  file before any GPU call, against a byte-identical import of Bijou's RE-036 fixture and the
  conformance suite. It prepares the `rgba32uint` cell record and executes the manifest's
  `bijou-surface.wgsl` with `wgpu =29.0.4`, the same `naga` version as `geordi-bijou-shadergen`,
  into an `rgba8uint` offscreen target. It strips the 256-byte row padding and writes a
  `geordi-bijou-gpu-receipt/1` receipt with per-probe cell bindings. Evidence follows the
  adapter's device type: `Cpu` is `software-probed`, a missing adapter is `capability-refused`.
  The command line streams schema'd JSON Lines (`schemas/geordi-bijou-wgpu-proof/`). Checked-in
  receipts under `fixtures/bijou-gpu/native-wgpu/` come from an Apple M5 (Metal) and match the
  CPU oracle frame hashes with zero tolerance. `native-wgpu-receipts.test.ts` checks them with the
  kit's validator and oracle. `pnpm test:bijou-gpu:native` runs the proof in CI, where the
  hosted runner has no adapter and records a typed refusal.
- **`@flyingrobots/geordi-bijou-gpu`**: dynamic `GlyphAtlas` for the `bijou-surface-gpu/1` ABI
  (flyingrobots/geordi#172). `createGlyphAtlas()` caches width-1 glyphs by `(grapheme, bold)` in
  an `rgba8uint` bitmap at integer physical cell metrics, drawing each through an injected
  `GlyphRasterizer`; the core uses no browser API. Monochrome and colour-emoji slots get distinct
  `glyph_kind` bits, decided by the divergence of alpha-weighted channel totals. `dirtyRects`
  reports newly rasterized texels. A full atlas resets and marks everything dirty, incrementing
  `generation`, as does `invalidate()`; `snapCellMetrics()` rounds CSS cell sizes to integer
  pixels. An atlas can be passed to `packSurfaceDamage()` as its options. The browser adapter adds
  `createCanvasGlyphRasterizer()` and `watchGlyphAtlasEnvironment()`, which invalidates on
  `document.fonts.ready`, later font loads, and device pixel ratio changes. No texture upload is
  included.
- **Bijou GPU shader** (flyingrobots/geordi#170): `packages/bijou-gpu/shaders/bijou-surface.wgsl`
  is the canonical `bijou-surface-gpu/1` shader: one fullscreen-triangle vertex stage and one
  pure-`u32` fragment stage that reads the `rgba32uint` cell grid and the `rgba8uint` `GlyphAtlas`
  with `textureLoad`. It is assembled from the Bunny helpers `bunny-u32-div-round-even/1` and
  `bunny-u32-ellipse-classify/1`, vendored byte for byte at their pinned digests, and from the
  procedural glyph table. The new Rust tool `geordi-bijou-shadergen` validates it with exactly
  `naga 29.0.4`, generates checked-in GLSL ES 3.00 stages and the
  `geordi-bijou-gpu-shader-manifest/1` implementation manifest (digests and the WGSL-binding-to-GLSL
  name map), and fails `--check` on any drift. A WebGL2 `RGBA32UI` harness runs a transport canary
  and the shared Bunny vectors through the translated GLSL and emits
  `geordi-bijou-gpu-kernel-receipt/1` receipts. Tests diff the executed shader against an Option
  E4 reference model and against the CPU reference oracle. No presenter is included.
- **`@flyingrobots/geordi-bijou-gpu`**: dirty-union cell packer for the `bijou-surface-gpu/1` ABI
  (flyingrobots/geordi#171). `packSurfaceDamage(state, current, target, options)` lowers the cells
  named by `current.renderDirtyWords | target.renderDirtyWords` into a retained `Uint32Array`
  staging buffer and returns the row spans whose words changed. Side-table cells are compared by
  grapheme string. `accumulateSurfaceDamage()` ORs the dirty words of frames coalesced between two
  presents. The whole grid is rebuilt on the first frame, a dimension change, an atlas generation
  change, a refused pack, and `forceFullRefresh`. Glyph slots come from an injected
  `resolveSlot(grapheme, flags)`; width-2 graphemes are refused with
  `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH`. The module uses no browser API and performs no upload.
- **`@flyingrobots/geordi-bijou-gpu`** (new package): conformance kit for the `bijou-surface-gpu/1`
  ABI (flyingrobots/geordi#169). It provides the `GpuSurfacePresenter` contract and sync-or-async
  `GpuSurfacePresenterFactory`, `BackendUnavailableError` distinct from `RendererFaultError`, a
  strict `packed-bijou-cells/1` width-1 validator, the `geordi-bijou-gpu-receipt/1` validator with
  `assertBitExactFrameHash`, the pure-integer CPU reference rasteriser `renderReferenceRgba`, a
  bundled deterministic test glyph pack, and a Playwright browser probe harness. A checked-in
  fixture suite under `fixtures/bijou-gpu/` holds a paint frame, an erase frame, a width-2
  negative, and oracle golden digests. No GPU presenter, shader, packer, or atlas is included.
- **`native-render-everywhere`** (Rust): the native bunny demo's camera, projection, depth-range
  test and viewport mapping now run on Bunny Q32.32 (`FixedMat4::try_look_at`,
  `FixedMat4::try_perspective`, `FixedPlane3::classify`, `Viewport::try_ndc_to_viewport`)
  instead of hand-written binary64 math (flyingrobots/geordi#154). The mesh rotation stays in
  binary64, because Bunny has no axis-angle rotation yet; each rotated position is rounded to
  Q32.32, ties to even. Every frame of a full turn draws the same RGBA bytes as before (checked
  against the retained binary64 code and against digests recorded from it); projected positions
  move by at most 9e-7 pixels on the fixture. Changes in cases no fixture uses: a non-square
  viewport now divides `x` by the aspect ratio, as `docs/design/2026-05-bunny-projection-law.md`
  states (the binary64 code ignored it); camera, projection and viewport values that Q32.32
  cannot hold, a vertical field of view of pi or more, and an `up` vector that is exactly parallel
  to the view direction after rounding to Q32.32 are refused as manifest validation errors; a zero
  `up`, or an `eye` equal to `target`, now reports its own issue without the parallel-up issue
  that the binary64 cross-product check also raised.
- **`geordi-ir`** (Rust): Add the `geordi-ray-traced-scene/1` artifact and the
  `geordi-fixed-q32.32/1` numeric profile (flyingrobots/geordi#153): `GeordiFixedQ32_32`, which
  deserializes only from JSON integers in `-(2^53 - 1)..=2^53 - 1`; scene, mesh, instance,
  camera, material, light, film and render-settings DTOs; `parse_geordi_ray_traced_scene` and
  `validate_geordi_ray_traced_scene` with stable `GEORDI_E_RT_*` diagnostics, including the exact
  conservative trace-domain check; mesh asset hash verification; canonical scene and receipt JSON
  and their hashes; the raw-RGBA8 image hash; and the `geordi-ray-traced-render-receipt/1` type,
  builder, parser and validator. Fixtures live in `fixtures/ray-traced-scene/`. No renderer; the
  profile is not claimed.
- **`geordi-renderer`** (Rust): Add `GeordiRayTracedRuntimeProfile` and
  `assert_ray_traced_runtime_profile` for ray-tracing runtimes, the checked public constructor
  `RenderedImage::from_rgba8` (rejects a byte length other than `width * height * 4` and overflow of
  that product), and `RenderedImage::image_hash`. Existing rendering is unchanged.

- **`@flyingrobots/geordi-profunctor-page`**: Add a fail-closed
  `geordi-profunctor-page-structural/1` target for the canonical Keep
  `profunctor-page/0` specimen, emitting deterministic rectangle IR, target
  mapping evidence, a byte-binding receipt, and a diagnostic SVG witness.
  Generated proof writes stage and validate the complete output inventory,
  serialize concurrent writers, and restore prior evidence if commit fails.
  Target maps and receipts preserve page-wide capability requirements and
  residuals, while render-node IDs retain the complete page-node identity.
- **`@flyingrobots/geordi-core`**: Add core-owned `geordi-ir/1` constants, current `GeordiIr` types,
  and structural validation for scenes, nodes, bindings, animations, keyframes, and finite
  numeric fields.
- **`@flyingrobots/geordi-compiler-core`**: Re-export IR types from
  `@flyingrobots/geordi-core` and emit the shared core IR constants for artifact keys, receipt
  keys, version, and hash algorithm.
- **`@flyingrobots/geordi-runtime-webgl`**: Add a typed `geordi-ir/1` preparation path plus
  `renderGeordiIrToCanvas()` so runtime callers can render core-owned IR through the existing
  canvas renderer while legacy scene rendering remains available during migration.
- **`@flyingrobots/geordi-runtime-webgl`**: Promote `renderGeordiToCanvas()` to the primary
  public `geordi-ir/1` rendering API, add `renderPreparedSceneToCanvas()` for the draw-ready
  runtime scene shape, and retain `renderGeordiIrToCanvas()` as a compatibility alias.
- **`@flyingrobots/geordi-core`**: Rename the draw-ready scene model at the type level with
  `PreparedGeordiScene` and `PreparedGeordiNode` aliases so the public contract is no longer
  confused with `geordi-ir/1`.
- **`@flyingrobots/geordi-core`**: Own the v0 graphics numeric profile
  (`geordi-finite-binary64/1`), graphics-number helpers, and the canonical JSON port with custom
  parse, non-finite-number, and stringify error types.
- **`@flyingrobots/geordi-compiler-core`**: Emit `numericProfile` in `scene.geordi.json` and
  `scene.geordi.json.receipt`, and re-export the core-owned canonical JSON port for compatibility.
- **`@flyingrobots/geordi-runtime-webgl`**: Add `GEORDI_WEBGL_RUNTIME_PROFILE` and fail loudly
  with `GeordiRuntimeUnsupportedProfileError` when IR requests an unsupported IR version or
  numeric profile.
- **`@flyingrobots/geordi-core`**: Add the baseline feature profile
  (`GEORDI_CORE_PROFILE`, `GEORDI_BASELINE_FEATURES`) and require `geordi-ir/1` artifacts to
  declare supported `requires` values.
- **`@flyingrobots/geordi-compiler-core`**: Emit baseline feature requirements in
  `scene.geordi.json`, record them in receipts, and add a deterministic
  `featureRequirementsHash`.
- **`@flyingrobots/geordi-runtime-webgl`**: Add baseline feature requirements to
  `GEORDI_WEBGL_RUNTIME_PROFILE` and fail loudly when IR omits `requires` or asks for unsupported
  features.
- **`@flyingrobots/geordi-core`**: Split known feature requirements from baseline emitted feature
  requirements and add strict text feature vocabulary for future deterministic font/glyph work.
- **`@flyingrobots/geordi-runtime-webgl`**: Rename the runtime profile feature field to
  `supportedFeatureRequirements` and keep strict text requirements unsupported until the runtime
  can honor the full strict text contract.
- **Public API**: De-version the current IR TypeScript surface (`GeordiIr`,
  `validateGeordiIr()`, `isGeordiIr()`) and compiler target (`geordi-ir`) while preserving
  `irVersion: "geordi-ir/1"` as the serialized contract identity.
- **Root scripts**: Add `pnpm wesley` as a thin shell-out to the installed `wesley` CLI.
- **Strict text fixtures**: Add TypeScript and Rust font-pack boundary types, parsers, hash
  verifiers, failure fixtures, and a receipt for the Lato font asset pack.
- **`@flyingrobots/geordi-compiler-core`**: Add a canonical source-location model shared by AST
  `SourceRef` and diagnostics, including optional spans and offsets.
- **`@flyingrobots/geordi-schema-graphql`**: Preserve GraphQL source spans and byte offsets for
  scene, node, and directive-argument diagnostics.
- **`@flyingrobots/geordi-compiler-core`**: Add a deterministic diagnostic formatter with stable
  source-span rendering and canonical JSON details.
- **`@flyingrobots/geordi-compiler-core`**: Emit `scene.geordi.map.json` source maps alongside IR
  JSON, mapping IR node IDs back to source locations and adding `sourceMapHash` to receipts.
- **`@flyingrobots/geordi-compiler-core`**: Semantic validation engine — `validateCanonicalAst()` with two-tier rule registry; Tier 1 (structural: `sceneDimensions`, `nodeKindValid`, `duplicateId`, `danglingRef`, `cycleDetection`) gates Tier 2 (semantic: `requiredProps` per NodeKind); iterative Kahn's cycle detection passes 10k-node chains without stack overflow
- **`@flyingrobots/geordi-compiler-core`**: Deterministic IR emitter — `emitGeordiIrArtifact()` replaces stub; two-phase topological sort (Kahn's on `parentId` DAG, tie-broken `zIndex ASC → kind ASC → id ASC` bytewise); strips `sourceRef` and `__typename`
- **`@flyingrobots/geordi-compiler-core`**: Determinism certificate — `emitReceiptArtifact()` emits `scene.geordi.json.receipt` alongside IR containing `comparatorVersion`, `inputHash` (SHA-256 of `input.source`), `irHash` (SHA-256 of the emitted IR), `irHashAlg` (`"sha256"`), `irVersion`, and `rulesetFingerprint` (SHA-256 of sorted rule IDs)
- **`@flyingrobots/geordi-compiler-core`**: TypeScript type emitter — `emitTypesArtifact()` replaces stub; `TypeEmitter` produces `NodeId` literal union, `SceneRoot` interface, per-kind node interfaces (`RectNode`, `TextNode`, …), and `SceneNode` discriminated union via token-based emission
- **`@flyingrobots/geordi-compiler-core`**: Identifier utilities — `toTypeIdentifier()` (NFKC normalize → PascalCase → reserved-keyword guard → invalid-start guard) and `buildIdentifierMap()` (bytewise-sorted collision resolution with `__N` suffix) in `src/util/identifiers.ts`
- **`@flyingrobots/geordi-compiler-core`**: All three stubs (`validateStub`, `emitIrStub`, `emitTypesStub`) removed from `compile.ts`; real implementations wired
- **`@flyingrobots/geordi-compiler-core`**: Add `GEORDI_E_INPUT_INVALID_JSON` and `GEORDI_E_INPUT_INVALID_SDL` error codes for invalid input (previously misclassified as `E_INTERNAL_INVARIANT`)
- **`@flyingrobots/geordi-compiler-core`**: Add `hashString()` and `deterministicId()` hashing utilities in `src/canonical/hashing.ts` with stable SHA-256 contract
- **`@flyingrobots/geordi-compiler-core`**: Export `hashString`, `deterministicId`, `HASH_ALGORITHM`, `GraphqlToCanonicalAst`, `ParseInputDeps` from package index
- **`@flyingrobots/geordi-compiler-core`**: `compile()` now accepts optional `deps?: ParseInputDeps` second argument for adapter injection
- **`@flyingrobots/geordi-compiler-core`**: IR emitter uses `stableStringify`, sorts nodes by `zIndex ASC → kind ASC → id ASC` (bytewise), strips `sourceRef` from output, adds `hashAlgorithm` to compile metadata
- **`@flyingrobots/geordi-compiler-core`**: `CompileMetadata` gains optional `hashAlgorithm` field (narrowed to `'sha256'`)
- **`@flyingrobots/geordi-schema-graphql`**: Full GraphQL SDL parser pipeline — `parseGraphql`, `extractScene`, `extractNodes`, `toCanonicalAst`
- **`@flyingrobots/geordi-schema-graphql`**: `graphqlToCanonicalAst` adapter exported from package root, satisfies `GraphqlToCanonicalAst` interface from compiler-core
- **`@flyingrobots/geordi-schema-graphql`**: Null-safe source location policy (`SourceRef` fallback to `<inline>:1:1` when `loc` absent)
- **`@flyingrobots/geordi-schema-graphql`**: `GEORDI_W_UNUSED_FIELD` warning only for unknown `geordi_*`-prefixed directives; non-`geordi_` directives silently ignored
- **`@flyingrobots/geordi-wesley-generator`**: Imports and injects `graphqlToCanonicalAst` adapter into `compile()`; adds `@flyingrobots/geordi-schema-graphql` dependency
- **`@flyingrobots/geordi-gpvue`**: Add the first constrained GPVue compiler path for static
  rectangle-only fixtures, emitting canonical `scene.geordi.json`, a fixture receipt, and a GPVue
  source map while rejecting CSS, text, directives, runtime layout, and duplicate node ids.
- **Render fixtures**: Mark the hello-panel fixture source as compiler-backed GPVue metadata and
  keep browser/native runtime harnesses artifact-first.
- **Render-everywhere demos**: Add `pnpm test:render-everywhere:gpvue`, which compiles the GPVue
  fixture once, routes the browser gate to the emitted scene artifact, and runs the native Rust
  smoke against the same emitted artifact.
- **Bunny mesh milestone**: Add known mesh feature requirements, Stanford bunny mesh asset and
  fixture contracts, TypeScript and Rust SHA-256 helpers, ASCII PLY triangle parsers,
  deterministic bounds/camera/projection/rotation law vectors, and browser/native wireframe
  render-everywhere demos for static, fixed-frame, and live rotating bunny playback.
- **Bunny mesh milestone**: Add the committed `bunny.fixture.json` render descriptor and have both
  browser and native bunny demos load it for camera, projection, material colors, and fixed-rate
  playback instead of carrying parallel render-intent constants.
- **Native render-everywhere demo**: Reject URL-scheme paths anywhere the bunny fixture expects a
  fixture-local relative path.
- **Native render-everywhere demo**: Align bunny mesh asset validation with the TypeScript fixture
  boundary for ISO retrieval dates and duplicate or empty vertex properties.
- **Render fixtures**: Reject mesh fixture descriptors whose perspective projection has `near`
  greater than or equal to `far`, matching the native bunny validator.
- **Browser render-everywhere demo**: Keep the header renderer marker synchronized with the active
  rectangle or bunny scene.
- **Browser render-everywhere demo**: Add a scene switcher so the interactive browser harness can
  show either the rectangle pixel-probe fixture or the rotating Stanford bunny, with debug metadata
  hidden behind collapsed disclosure panels.

### Tests

- `@flyingrobots/geordi-bijou-gpu` unit tests have a 30 s default timeout. Tests that rasterize and
  hash whole frames (`procedural.test.ts` among them) exceeded vitest's 5 s default on a loaded
  machine; no assertion changed.
- The WebGPU presenter's randomized resize test has an explicit 60 s timeout. It takes about
  2 s alone and exceeded the 5 s default on a loaded machine; no assertion changed.
- **Profunctor Page target**: Pin the three upstream conformance artifacts by
  exact SHA-256 identity, verify all four generated outputs, and cover
  malformed, unsupported, stale, duplicate, dangling, ambiguous, missing, and
  invalid-output failure paths with stable diagnostic codes. Preserve
  canonical-JSON parser failures as error causes, reject XML-invalid preview
  labels, reject inherited token keys and duplicate fixed-geometry blocks,
  reject duplicate node capability requirements, cover both directions of
  token-reference drift, and smoke-test the package's public export path.
- **CI**: Install Chromium for Playwright and run the browser render-everywhere Playwright gate on
  pull requests and pushes to `main`.
- **`@flyingrobots/geordi-core`**: add `geordi-ir/1` validation coverage for valid IR, version
  mismatch, non-finite numbers, and malformed node props.
- **`@flyingrobots/geordi-compiler-core`**: add a compiler-to-core contract test proving emitted
  IR parses through the canonical JSON port and validates under the core-owned IR contract.
- **`@flyingrobots/geordi-runtime-webgl`**: add coverage for rendering `geordi-ir/1` through the
  new runtime preparation path.
- **`@flyingrobots/geordi-runtime-webgl`**: add runtime-bound IR validation, fail-loud prop
  lowering, and compiler-to-runtime contract coverage that compiles canonical AST JSON, parses
  emitted IR through the canonical JSON port, validates it as `geordi-ir/1`, and renders it.
- **`@flyingrobots/geordi-core`**: add canonical JSON port coverage for stable key order,
  `-0` normalization, nested non-finite-number rejection with paths, deterministic finite float
  spelling, and no hidden fixed-point scaling.
- **`@flyingrobots/geordi-runtime-webgl`**: add runtime profile export and unsupported profile
  rejection coverage.
- **Capability profile**: add core validation coverage for baseline feature requirements,
  compiler golden coverage for emitted requirements and receipt hashes, runtime rejection coverage
  for missing, malformed, and unsupported feature requirements, and package export smoke coverage
  for public capability symbols.
- **Feature registry**: add core coverage proving strict text features are known but not baseline,
  compiler coverage proving emitted IR and receipts stay locked to baseline requirements, and
  runtime coverage for supported subsets plus known-but-unsupported strict text requirements.
- **`@flyingrobots/geordi-compiler-core`**: add Group-only type-emission coverage and gate the
  generated-type `tsc` subprocess behind CI or `TSC_GATE=1` while resolving TypeScript through the
  package entrypoint.
- **`@flyingrobots/geordi-compiler-core`**: add source-location model, diagnostic formatter, and
  source-map artifact coverage.
- **`@flyingrobots/geordi-schema-graphql`**: add exact GraphQL source-span tests and an e2e source
  map assertion from IR node ID back to SDL field location.
- **`@flyingrobots/geordi-wesley-generator`**: add behavior contract tests for `plan()`, successful SDL-to-artifacts generation, and custom failure errors on bad SDL
- **`@flyingrobots/geordi-runtime-webgl`**: add canvas/context mock behavior tests for rendering the prepared scene contract and context-unavailable failure
- **`@flyingrobots/geordi-compiler-core`**: 74 new tests across sprint 3 — first batch: `stableStringify` (22), `parseInput` table-driven (9), `determinism` (3) → 36 tests; second batch: `validateAst` (15), `emitTypes` (19), `determinism` +4, `compile.golden` +3 → total 79 tests
- **`@flyingrobots/geordi-schema-graphql`**: 42 new tests — `extractScene` (10), `extractNodes` (10), `toCanonicalAst` (14), `e2e.terminal` (8)
- Cycle detection verifies Tier 2 is suppressed when Tier 1 errors present
- 4 rotated input orderings of the same scene produce byte-identical IR (SHA-256 verified)
- Parent-before-child ordering guaranteed in topological emitter output
- Receipt `inputHash` verified against `sha256(input.source)` in golden tests; two compilations of identical input produce byte-identical receipts
- E2E Terminal SDL fixture compiles to IR with identical SHA-256 on two consecutive runs
- Whitespace-reformatted SDL variant produces identical IR hash (determinism guarantee)
- **`@flyingrobots/geordi-gpvue`**: Add stable output-hash, receipt, source-map, and unsupported
  construct coverage for the rectangle-only GPVue fixture compiler.
- **Render-everywhere demos**: Add an end-to-end GPVue smoke path covering browser pixel probes and
  native Rust pixel probes against one compiled fixture artifact.
- **Bunny mesh milestone**: Add cross-language coverage for Stanford bunny asset hash, vertex and
  face counts, bounds, finite vertex coordinates, face index ranges, and malformed PLY failure
  paths.
- **Bunny mesh milestone**: Add focused browser and native gates for fixed-frame bunny metadata,
  nonblank wireframe output, native clippy, manifest validation, and sampled smoke frames `0`, `15`,
  and `60`.

### Bug Fixes

- **Bunny mesh milestone**: harden browser mesh-manifest cross-checks, reject invalid browser
  elapsed-time inputs, reject malformed mesh playback descriptors, and tighten TypeScript/Rust PLY
  parsers so extra element-header fields and trailing body rows fail loudly.
- `compiler-core/parseInput`: adapter-thrown `CompilerError` diagnostics are preserved instead of being wrapped as `GEORDI_E_INTERNAL_INVARIANT`; invalid GraphQL SDL keeps its source location through `compile()`
- `compiler-core/errors`: add `DiagnosticsError` to carry collected diagnostics across adapter boundaries without losing error codes or locations
- `schema-graphql/adapter`: missing-scene extraction now reports `GEORDI_E_SCENE_MISSING` through `compile()` without duplicate internal-invariant diagnostics
- `schema-graphql/directives`: replace unsafe directive argument casts with typed runtime readers for `@geordi_scene` and `@geordi_node`; wrong literal types, non-finite numeric literals, and invalid `props` JSON object payloads emit `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE`
- `schema-graphql/directives`: `geordi_bind` and `geordi_style` now fail loudly with `GEORDI_E_FEATURE_NOT_IMPLEMENTED` instead of being silently ignored
- `compiler-core/compile`: `emit.binaryPack: true` now fails before any artifacts are emitted, matching the hard-failure behavior of other unsupported artifact targets
- `compiler-core/compile`: removed wall-clock `elapsedMs` from `CompileMetadata`; compile results now remain deterministic for identical inputs
- `emitIr`: O(n²) `shift()`+re-sort queue replaced with `qi`-pointer dequeue and batch merge of newly-ready children — O(n log n) for tree-structured graphs
- `schema-graphql/adapter`: diagnostic message now embedded in thrown `Error` when `extractScene` fails; "see diagnostics" was a lie when caller omitted the `diagnostics` array
- `schema-graphql/extractNodes`: `knownGeordiDirs` `Set` was re-allocated inside a nested loop on every call; hoisted to module-level constant
- `schema-graphql/extractNodes`: invalid `props` JSON argument now emits a `W_UNUSED_FIELD` warning instead of silently discarding the value
- `identifiers`: `buildIdentifierMap` now throws immediately on duplicate source strings instead of silently producing a corrupt output `Map`
- `test/determinism`: rotation test loop corrected to produce 4 distinct orderings, matching its description (old loop generated 4 unique rotations but iterated 10 times)
- `emitIr`: `IR_VERSION`, `IR_ARTIFACT_KEY`, `IR_RECEIPT_KEY` exported as named constants; magic string literals removed from `compile.ts` and `emitIr.ts`
- `identifiers`: `RESERVED.has(result.toLowerCase())` removed — PascalCase output like `'Delete'` is a valid TypeScript identifier; only exact-case match is checked
- `parseGraphql`: SDL wrapped in `Source(sdl, filename)` so the returned `DocumentNode` carries filename metadata through to downstream diagnostics
- `test/determinism`: shuffle fixture aligned with `BASE_INPUT` — added `visible: true` to all nodes and `units: 'px'` to scene
- `docs/ERROR_CODES.md`: corrected `Rect` required props example — only `width` and `height` are required; `x` and `y` are optional
- `runtime-webgl`: runtime rendering now validates IR before preparing draw-ready scenes and
  throws custom runtime errors for invalid IR, unsupported node kinds, and invalid required node
  props instead of silently falling back to invisible geometry or empty content.

- Invalid JSON input no longer emits `GEORDI_E_INTERNAL_INVARIANT`; now correctly emits `GEORDI_E_INPUT_INVALID_JSON`
- Invalid GraphQL SDL input now emits `GEORDI_E_INPUT_INVALID_SDL` instead of `GEORDI_E_INTERNAL_INVARIANT`
- `NaN` scene dimensions now correctly rejected by `sceneDimensions` validation rule
- `E_CYCLE_DETECTED` no longer spuriously triggered when duplicate node IDs are present
- `NodeId` union in emitted TypeScript types is now sorted lexicographically for deterministic output
- `emit.jsonSchema: true` no longer leaves partial artifacts on error — guard runs before any emission
- `metadata.irVersion` now correctly reflects artifact presence rather than `ok` flag

### Documentation

- Add the accepted design for a fixed-point numeric profile (`geordi-fixed-q32.32/1`) and a
  ray-traced 3D scene profile (`geordi-ray-traced-scene/1`) for the lumen ray tracer, with the
  maintainer's decisions, alternatives and proof gates, in
  `docs/design/2026-11-fixed-point-and-ray-traced-scene-profiles.md` (#152). Design only; no
  behavior changes.
- Add a Wesley common-type generation drift-correction doc requiring shared TypeScript/Rust
  serialized contract DTOs to be generated from one schema rather than hand-maintained in parallel.
- Add a glyph tooling spike proposal covering market research, import/inspect/preview/debug
  workflows, and a 15-slice implementation spike for user-facing strict text tooling.
- `docs/ERROR_CODES.md`: Added `GEORDI_E_INPUT_INVALID_JSON` and `GEORDI_E_INPUT_INVALID_SDL` entries
- `docs/ERROR_CODES.md`: Corrected `GEORDI_E_REF_TARGET_NOT_FOUND` — `refKind` detail is `"animation"` only; bindings use `GEORDI_E_BIND_TARGET_NOT_FOUND`
- Render-everywhere docs now describe the completed bunny milestone, browser/native bunny commands,
  claim boundaries, and the browser scene switcher.

### Post-Sprint-3 PR Feedback (Round 5)

- `schema-graphql/extractNodes`: removed redundant `!== 'geordi_node'` guard — `geordi_node` is already in `KNOWN_GEORDI_DIRS`, so the outer check was dead code
- `schema-graphql/extractNodes`: props JSON that parses successfully but is not an object (e.g. arrays, primitives) now emits `E_DIRECTIVE_ARG_INVALID_TYPE` error — previously discarded silently
- `schema-graphql/parseGraphql`: extracted `filename ?? '<inline>'` to `effectiveName` const — eliminates triple repetition in the function body
- `errors/codes.ts`: moved `E_FEATURE_NOT_IMPLEMENTED` out of "Emit / runtime" to its own "General / cross-phase" section with a clarifying JSDoc; added `@deprecated` note on `W_BINARY_PACK_NOT_IMPLEMENTED`
- `test/validateAst`: added `validateCanonicalAst(undefined)` test + `NaN`/`Infinity` dimension tests (3 new tests, 19 total)
- `test/emitTypes`: pinned exact expected values for `toTypeIdentifier` loose assertions (`'🚀'` → `'Anonymous'`, `'type'` → `'Type'`); pinned collision winner per bytewise ordering
- `test/stableStringify`: added NaN, Infinity, -Infinity, and top-level-undefined serialization contract tests (4 new tests, 26 total)

### Post-Sprint-3 PR Feedback (Round 4)

- `emitIr`: `normalizeZIndex` now guards against `NaN`/`Infinity` via `Number.isFinite` — previously these values passed through and corrupted the topological sort comparator
- `emitIr`: `emitReceiptArtifact` parameter widened to `ReadonlyArray<string>` to match the readonly `VALIDATION_RULE_IDS` export
- `validateAst`: `VALIDATION_RULE_IDS` exported as `ReadonlyArray<string>` — prevents external mutation of the rule-ID array used in the receipt fingerprint
- `schema-graphql/extractNodes`: invalid `props` JSON now emits `E_DIRECTIVE_ARG_INVALID_TYPE` (not `W_UNUSED_FIELD`) — more precise error classification
- `schema-graphql`: extracted shared `nodeSourceRef` utility into `src/parse/sourceRef.ts` — eliminates verbatim duplication across `extractScene.ts` and `extractNodes.ts`
- `test/validateAst`: renamed misleading "deep spiral with cycle at tip" test description to "complete ring cycle" — the fixture is a fully-cyclic ring, not a spiral
- `test/e2e.terminal`: removed redundant `sha256` assertion from determinism test — string equality already implies hash equality
- `test/determinism`: parent-before-child and tie-breaking fixtures now include `visible: true` on nodes and `units: 'px'` on scene, matching `BASE_INPUT` shape
