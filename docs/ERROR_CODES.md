# Geordi Error Codes

All compiler errors use stable, documented error codes. Never ignore or suppress error codes in logs or diagnostics.

## Error Code Format

- **Prefix**: `GEORDI_`
- **Severity**: `E_` (error) or `W_` (warning)
- **Category**: Short descriptor (e.g., `SCENE`, `NODE`, `DIRECTIVE`)

## Input / Parse Errors

### `GEORDI_E_INPUT_EMPTY`

**Severity**: Error
**Message**: Input source is empty
**Fix**: Provide non-empty SDL or canonical AST JSON input

### `GEORDI_E_INPUT_INVALID_JSON`

**Severity**: Error
**Message**: Invalid JSON for canonical AST input
**Fix**: Ensure the input is valid JSON. Check for syntax errors like trailing commas, unquoted keys, or encoding issues. This is a user-facing error, not a compiler bug.

### `GEORDI_E_INPUT_INVALID_SDL`

**Severity**: Error
**Message**: Invalid GraphQL SDL input
**Fix**: Ensure the input is valid GraphQL SDL. Check for syntax errors in directives, type definitions, or field declarations. This is a user-facing error, not a compiler bug.

### `GEORDI_E_SCENE_MISSING`

**Severity**: Error
**Message**: Scene definition is missing or invalid
**Fix**: Add `@geordi_scene` directive to exactly one GraphQL type, or ensure canonical AST has valid `scene` object

### `GEORDI_E_SCENE_MULTIPLE`

**Severity**: Error
**Message**: Multiple scene definitions found
**Fix**: Only one GraphQL type can have the `@geordi_scene` directive

### `GEORDI_E_VERSION_UNSUPPORTED`

**Severity**: Error
**Message**: Unsupported version in directive or AST
**Fix**: Use `v: "1"` in `@geordi_scene` directive or `astVersion: "1"` in canonical AST

### `GEORDI_E_DIRECTIVE_UNKNOWN`

**Severity**: Error
**Message**: Unknown Geordi directive
**Fix**: Check directive spelling. Supported: `@geordi_scene`, `@geordi_node`, `@geordi_bind`, `@geordi_style`

### `GEORDI_E_DIRECTIVE_ARG_UNKNOWN`

**Severity**: Error
**Message**: Unknown argument in Geordi directive
**Fix**: Remove invalid argument or check spelling against directive spec

### `GEORDI_E_DIRECTIVE_ARG_INVALID_TYPE`

**Severity**: Error
**Message**: Directive argument has wrong type
**Fix**: Check directive spec for correct argument types (Int, String, Float, Boolean, etc.)

### `GEORDI_E_DIRECTIVE_ARG_MISSING`

**Severity**: Error
**Message**: Required directive argument is missing
**Fix**: Provide all required arguments. Example: `@geordi_scene(v: "1", width: 800, height: 600)`

## Validation Errors

### `GEORDI_E_SCENE_DIMENSIONS_INVALID`

**Severity**: Error
**Message**: Scene width/height must be > 0
**Fix**: Provide positive integers for scene dimensions

### `GEORDI_E_NODE_KIND_INVALID`

**Severity**: Error
**Message**: Invalid node kind
**Fix**: Use valid node kinds: `Rect`, `Text`, `Image`, `Group`, `Line`, `Ellipse`, `Path`

### `GEORDI_E_NODE_DUPLICATE_ID`

**Severity**: Error
**Message**: Duplicate node ID found
**Fix**: Ensure all node IDs are unique within the scene

### `GEORDI_E_PARENT_NOT_FOUND`

**Severity**: Error
**Message**: Parent node ID does not exist
**Fix**: Reference only nodes that exist in the scene

### `GEORDI_E_CYCLE_DETECTED`

**Severity**: Error
**Message**: Circular parent-child relationship detected
**Fix**: Remove cycles in node hierarchy

### `GEORDI_E_PROP_REQUIRED_MISSING`

**Severity**: Error
**Message**: Required property is missing for node kind
**Fix**: Provide all required properties. Example: `Rect` requires `width`, `height` (`x` and `y` are optional)

### `GEORDI_E_PROP_INVALID_VALUE`

**Severity**: Error
**Message**: Property value is invalid
**Fix**: Check property value type and range. Example: `opacity` must be 0-1

### `GEORDI_E_BIND_TARGET_NOT_FOUND`

**Severity**: Error
**Message**: Binding target node does not exist
**Fix**: Reference only nodes that exist in the scene. Note: animation target mismatches use `GEORDI_E_REF_TARGET_NOT_FOUND`.

### `GEORDI_E_REF_TARGET_NOT_FOUND`

**Severity**: Error
**Message**: Referenced target node does not exist
**Details**: `refKind: "animation"` — emitted when an animation references a non-existent node (binding mismatches use `GEORDI_E_BIND_TARGET_NOT_FOUND`)
**Fix**: Reference only nodes that exist in the scene

### `GEORDI_E_BIND_EXPR_INVALID`

**Severity**: Error
**Message**: Binding expression is invalid
**Fix**: Check expression syntax (v0.1 uses string expressions)

## Emit / Runtime Errors

### `GEORDI_E_EMIT_TARGET_UNSUPPORTED`

**Severity**: Error
**Message**: Unsupported emit target
**Fix**: Use `target: 'geordi-ir'` (only supported target in v0.1)

### `GEORDI_E_FEATURE_NOT_IMPLEMENTED`

**Severity**: Error
**Message**: Requested feature is not yet implemented
**Details**: `feature` — name of the requested feature (e.g. `"jsonSchema"`)
**Fix**: Remove the unsupported option from your emit config. Check the changelog for implementation status.

### `GEORDI_E_INTERNAL_INVARIANT`

**Severity**: Error
**Message**: Internal compiler error (invariant violation)
**Fix**: This is a bug. Report with minimal reproduction case

## Ray-Traced Scene Errors

These diagnostics come from the Rust `geordi-ray-traced-scene/1` parser, validator, asset check
and receipt functions in `crates/geordi-ir`. Each is reported as a `GeordiRayTracedSceneIssue`
with a JSON path. Field-level detail is in
[`ray-traced-scene-profile.md`](./ray-traced-scene-profile.md).

### `GEORDI_E_RT_JSON_INVALID`

**Severity**: Error
**Message**: The source is not JSON
**Fix**: Write valid JSON; the message gives the line and column.

### `GEORDI_E_RT_SCENE_SHAPE`

**Severity**: Error
**Message**: An unknown field, a missing field, or a value of the wrong JSON type
**Fix**: Remove unknown fields, add missing ones, and use the JSON type the reference names.

### `GEORDI_E_RT_NUMBER_NOT_INTEGER`

**Severity**: Error
**Message**: A number has a fraction or exponent, or a governed field is not a number
**Fix**: Write the raw value as a JSON integer: `4294967296`, not `1.0`, `1e0`, `-0` or `"4294967296"`.

### `GEORDI_E_RT_NUMBER_OUT_OF_RANGE`

**Severity**: Error
**Message**: An integer is outside `-(2^53 - 1)..=2^53 - 1`
**Fix**: Keep every integer within `-(2^53 - 1)..=2^53 - 1`.

### `GEORDI_E_RT_SCENE_VERSION_UNSUPPORTED`

**Severity**: Error
**Message**: `sceneVersion` is not supported
**Fix**: Use `sceneVersion: "geordi-ray-traced-scene/1"`.

### `GEORDI_E_RT_NUMERIC_PROFILE_UNSUPPORTED`

**Severity**: Error
**Message**: `numericProfile` is not supported
**Fix**: Use `numericProfile: "geordi-fixed-q32.32/1"`.

### `GEORDI_E_RT_REQUIREMENT_UNKNOWN`

**Severity**: Error
**Message**: A requirement is outside the version 1 vocabulary
**Fix**: Use only the version 1 requirement vocabulary.

### `GEORDI_E_RT_REQUIREMENT_DUPLICATE`

**Severity**: Error
**Message**: A requirement is listed twice
**Fix**: List each requirement once.

### `GEORDI_E_RT_REQUIREMENT_MISSING`

**Severity**: Error
**Message**: The profile requirement or a feature the scene uses is not required
**Fix**: Require `geordi/ray-traced-3d/1` and every feature the scene content uses.

### `GEORDI_E_RT_ID_EMPTY`

**Severity**: Error
**Message**: An id is empty
**Fix**: Give the scene and every mesh, material, instance and light a non-empty id.

### `GEORDI_E_RT_ID_DUPLICATE`

**Severity**: Error
**Message**: An id is repeated within its collection
**Fix**: Make ids unique within each collection.

### `GEORDI_E_RT_MESH_REFERENCE_UNKNOWN`

**Severity**: Error
**Message**: An instance names a mesh that is not declared
**Fix**: Name a mesh declared in `meshes`.

### `GEORDI_E_RT_MATERIAL_REFERENCE_UNKNOWN`

**Severity**: Error
**Message**: An instance names a material that is not declared
**Fix**: Name a material declared in `materials`.

### `GEORDI_E_RT_MESH_PATH_INVALID`

**Severity**: Error
**Message**: A mesh path is not a relative fixture-local path
**Fix**: Use a relative POSIX path inside the fixture root, with no `..`, scheme or backslash.

### `GEORDI_E_RT_MESH_HASH_INVALID`

**Severity**: Error
**Message**: A mesh hash is not `sha256:` followed by 64 lowercase hex digits
**Fix**: Write `sha256:` followed by 64 lowercase hex digits.

### `GEORDI_E_RT_MESH_LAYOUT_UNSUPPORTED`

**Severity**: Error
**Message**: A mesh layout identity is not supported
**Fix**: Use `bunny-ply-binary-le-f32/1`.

### `GEORDI_E_RT_MESH_COUNT_INVALID`

**Severity**: Error
**Message**: A declared mesh count is negative
**Fix**: Declare non-negative vertex and triangle counts.

### `GEORDI_E_RT_MESH_BOUNDS_INVALID`

**Severity**: Error
**Message**: Declared mesh bounds have `min` above `max` on an axis
**Fix**: Declare `min` no greater than `max` on every axis.

### `GEORDI_E_RT_MESH_FILE_MISSING`

**Severity**: Error
**Message**: A mesh file cannot be read
**Fix**: Commit the mesh file at the declared path under the fixture root.

### `GEORDI_E_RT_MESH_FILE_OUTSIDE_ROOT`

**Severity**: Error
**Message**: A mesh file resolves outside the fixture root
**Fix**: Keep the mesh file, and any symlink target, inside the fixture root.

### `GEORDI_E_RT_MESH_HASH_MISMATCH`

**Severity**: Error
**Message**: Mesh file bytes do not match the declared hash
**Fix**: Recompute the declared hash from the committed bytes, or restore the bytes.

### `GEORDI_E_RT_MATERIAL_UNSUPPORTED`

**Severity**: Error
**Message**: A material kind is not supported
**Fix**: Use `kind: "diffuse"`.

### `GEORDI_E_RT_ALBEDO_OUT_OF_RANGE`

**Severity**: Error
**Message**: An albedo channel is outside `[0, 1]`
**Fix**: Keep each albedo channel within raw `0..=4294967296` (`[0, 1]`).

### `GEORDI_E_RT_CAMERA_UNSUPPORTED`

**Severity**: Error
**Message**: A camera kind is not supported
**Fix**: Use `kind: "pinhole"`.

### `GEORDI_E_RT_CAMERA_DEGENERATE`

**Severity**: Error
**Message**: The camera `forward` or `up` is zero, or the sine of the angle between them is below `2^-15`
**Fix**: Give non-zero `forward` and `up` that are clearly not parallel: the sine of the angle between them must be at least `2^-15`.

### `GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE`

**Severity**: Error
**Message**: `tanHalfFovY` is outside `(0, 4]`
**Fix**: Keep `tanHalfFovY` within raw `1..=17179869184` (`(0, 4]`).

### `GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED`

**Severity**: Error
**Message**: The scene can leave the trace domain
**Fix**: Move or scale the instance so its transformed bounds stay below 255 units, and keep the camera below 256 units.

### `GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED`

**Severity**: Error
**Message**: The total primitive count exceeds `2^32 - 1`
**Fix**: Keep the total instanced triangle count at or below `2^32 - 1`.

### `GEORDI_E_RT_SCENE_EMPTY`

**Severity**: Error
**Message**: The instances contribute no triangle
**Fix**: Add an instance of a mesh whose `counts.triangles` is at least 1.

### `GEORDI_E_RT_LIGHT_UNSUPPORTED`

**Severity**: Error
**Message**: A light kind is not supported
**Fix**: Use `directional` or `uniformSky`.

### `GEORDI_E_RT_LIGHT_FIELD_INVALID`

**Severity**: Error
**Message**: A light has a field its kind forbids, or lacks one its kind needs
**Fix**: Give a directional light `towardLight`; omit it on the sky.

### `GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED`

**Severity**: Error
**Message**: The largest `towardLight` component magnitude is not exactly 1.0
**Fix**: Rescale `towardLight` so its largest component magnitude is raw `4294967296`.

### `GEORDI_E_RT_RADIANCE_OUT_OF_RANGE`

**Severity**: Error
**Message**: A radiance channel is outside `[0, 65536]`
**Fix**: Keep each radiance channel within raw `0..=281474976710656` (`[0, 65536]`).

### `GEORDI_E_RT_DIRECTIONAL_LIGHT_COUNT`

**Severity**: Error
**Message**: More than one directional light
**Fix**: Declare at most one directional light.

### `GEORDI_E_RT_SKY_COUNT`

**Severity**: Error
**Message**: Not exactly one uniform sky
**Fix**: Declare exactly one `uniformSky` light.

### `GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE`

**Severity**: Error
**Message**: Film width or height is outside `1..=16384`
**Fix**: Use a film width and height in `1..=16384`.

### `GEORDI_E_RT_INTEGRATOR_UNSUPPORTED`

**Severity**: Error
**Message**: The integrator identity is not supported
**Fix**: Use `geordi-rt-diffuse-path/1`.

### `GEORDI_E_RT_SAMPLER_IDENTITY_INVALID`

**Severity**: Error
**Message**: The sampler identity is not a well-formed versioned identity
**Fix**: Write the sampler as a versioned identity `name/N`.

### `GEORDI_E_RT_TONE_CURVE_IDENTITY_INVALID`

**Severity**: Error
**Message**: The tone curve identity is not a well-formed versioned identity
**Fix**: Write the tone curve as a versioned identity `name/N`.

### `GEORDI_E_RT_RECONSTRUCTION_UNSUPPORTED`

**Severity**: Error
**Message**: The reconstruction identity is not supported
**Fix**: Use `geordi-box-filter/1`.

### `GEORDI_E_RT_OUTPUT_UNSUPPORTED`

**Severity**: Error
**Message**: The output encoding identity is not supported
**Fix**: Use `geordi-rgba8-srgb-opaque/1`.

### `GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID`

**Severity**: Error
**Message**: `samplesPerPixel` is not a power of two in `1..=1024`
**Fix**: Use a power of two in `1..=1024`.

### `GEORDI_E_RT_SEED_OUT_OF_RANGE`

**Severity**: Error
**Message**: `seed` is outside `0..=2^32 - 1`
**Fix**: Use a seed in `0..=4294967295`.

### `GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE`

**Severity**: Error
**Message**: `maxBounces` is outside `0..=1`
**Fix**: Use `maxBounces` `0` or `1`.

### `GEORDI_E_RT_VIEWPORT_MISMATCH`

**Severity**: Error
**Message**: The rendered image size differs from the film size
**Fix**: Render at exactly the film width and height.

### `GEORDI_E_RT_RECEIPT_SHAPE`

**Severity**: Error
**Message**: A receipt has an unknown field, a missing field, or a wrong JSON type
**Fix**: Write every receipt field and no others, with the JSON types the reference names.

### `GEORDI_E_RT_RECEIPT_FIELD_INVALID`

**Severity**: Error
**Message**: A receipt field violates the receipt contract
**Fix**: Correct the named receipt field; the message states the rule.

## Bijou GPU Conformance Kit Errors

These come from `@flyingrobots/geordi-bijou-gpu`. Each is thrown as a named error class with a
`code` property; validation errors also carry a JSON `path` and a `detail`. Field-level detail is
in [`bijou-gpu-conformance-kit.md`](./bijou-gpu-conformance-kit.md), for the dirty-union packer in
[`bijou-gpu-surface-damage.md`](./bijou-gpu-surface-damage.md), and for the glyph atlas in
[`bijou-gpu-glyph-atlas.md`](./bijou-gpu-glyph-atlas.md).

### `GEORDI_E_BIJOU_BACKEND_UNAVAILABLE`

**Severity**: Error
**Message**: A presenter backend cannot be created on this host, or the canvas glyph rasterizer or the glyph atlas watcher found no canvas, 2D context, or browser host (`BackendUnavailableError`)
**Fix**: Not a defect. Report `capability-refused` evidence and choose another backend.

### `GEORDI_E_BIJOU_RENDERER_FAULT`

**Severity**: Error
**Message**: An available backend failed while preparing, drawing, or reading back a frame (`RendererFaultError`)
**Fix**: Investigate the backend failure named in `detail`.

### `GEORDI_E_BIJOU_DRAWING_BUFFER_MISMATCH`

**Severity**: Error
**Message**: The WebGL2 presenter found `drawingBufferWidth` or `drawingBufferHeight` different from the canvas size, so the browser clamped or altered the drawing buffer (`DrawingBufferMismatchError`)
**Fix**: Not a renderer fault. Present at a canvas size the browser does not clamp, below `MAX_RENDERBUFFER_SIZE` and the browser's drawing-buffer limits. The presenter draws nothing for that frame.

### `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH`

**Severity**: Error
**Message**: A cell or side-table entry holds a width-2 grapheme, or one was handed to a `GlyphAtlas` in strict canonical mode
**Fix**: `bijou-surface-gpu/1` presents width-1 cells only. Do not emit wide graphemes into canonical `packed-bijou-cells/1` or into a surface handed to `packSurfaceDamage()`.

### `GEORDI_E_BIJOU_INVALID_PACKED_CELLS`

**Severity**: Error
**Message**: A `packed-bijou-cells/1` receipt violates the canonical contract, or a `GlyphAtlas` in strict canonical mode was handed text that is not one terminal-safe width-1 grapheme
**Fix**: Correct the field at `path`; the receipt must pass Bijou's own validator. For the atlas, pass one grapheme per cell that Bijou's width-1 glyph policy accepts.

### `GEORDI_E_BIJOU_INVALID_CELL_METRICS`

**Severity**: Error
**Message**: `cellPxW` or `cellPxH` is not an integer in `1..256`, or a CSS cell size or device pixel ratio given to `snapCellMetrics()` is not finite and positive
**Fix**: Snap physical cell metrics into `1..256` at the host boundary.

### `GEORDI_E_BIJOU_INVALID_SURFACE`

**Severity**: Error
**Message**: A surface, canvas size, theme colour, probe coordinate, or packer state is malformed
**Fix**: Supply `widthCells * heightCells * 10` cell bytes, a canvas at least as large as the grid, uppercase `#RRGGBB` colours, and in-canvas probe coordinates. For `packSurfaceDamage()`, also supply at least `ceil(width * height / 32)` render-dirty words, a side-table entry for every side-table cell, and a state from `createSurfaceDamageState()`.

### `GEORDI_E_BIJOU_INVALID_ATLAS`

**Severity**: Error
**Message**: An atlas bitmap or slot map is malformed, a cell references a slot beyond the atlas capacity, a slot resolver returned a slot outside `0..65535`, the atlas generation advanced during two consecutive whole-grid packs, a `GlyphAtlas` was given a slot grid over 65536 slots, an empty `fontIdentity`, or an invalid canvas font, or its rasterizer returned a raster of the wrong length or with a non-byte value
**Fix**: Supply `atlasCols * cellPxW * atlasRows * cellPxH * 4` RGBA bytes and unique in-range slots. A glyph rasterizer returns exactly `cellPxW * cellPxH * 4` bytes. If the generation will not settle, the frame holds more glyphs than one atlas generation can; enlarge the atlas.

### `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT`

**Severity**: Error
**Message**: A grapheme has no atlas slot for its `(grapheme, bold)` key
**Fix**: Add the glyph to the atlas and slot map. There is no font fallback.

### `GEORDI_E_BIJOU_INVALID_PROCEDURAL_TABLE`

**Severity**: Error
**Message**: `procedural-glyphs.json` is malformed, a packed word disagrees with its fields, its text does not hash to `PROCEDURAL_GLYPH_TABLE_SHA256`, or a table given to `createCanvas2DSurfacePresenter()` differs from the pinned one
**Fix**: Restore the table pinned by the ABI, or omit `proceduralTable` to use the bundled one. `path` names the first failing field or word.

### `GEORDI_E_BIJOU_INVALID_RECEIPT`

**Severity**: Error
**Message**: A `geordi-bijou-gpu-receipt/1` document failed validation (`EndpointReceiptValidationError`)
**Fix**: Correct every entry in `issues`.

### `GEORDI_E_BIJOU_FRAME_HASH_MISMATCH`

**Severity**: Error
**Message**: `assertBitExactFrameHash` could not match a presenter receipt to the reference oracle frame (`FrameHashMismatchError`)
**Fix**: `detail` names which of four checks failed. The receipt carries no `frameRgbaSha256` (it is not probed evidence); its `canvasPxW` or `canvasPxH` differs from the oracle's; its `preparedBufferSha256` differs, meaning the prepared cells differ before any pixel is drawn, so compare the prepared buffers word by word; or its `frameRgbaSha256` differs, meaning at least one output byte differs, so compare pixel probes. Pixel probes can all match while the canvas size or the prepared buffer digest does not.

### `GEORDI_E_BIJOU_PIXEL_PROBE_MISMATCH`

**Severity**: Error
**Message**: One or more exact pixel probes did not match a frame (`PixelProbeMismatchError`)
**Fix**: Inspect `mismatches` for the expected and actual RGBA of each probe.

### `GEORDI_E_BIJOU_NUMERIC_DOMAIN`

**Severity**: Error
**Message**: An integer primitive received an operand that is not an unsigned 32-bit integer, or a zero divisor where none is permitted
**Fix**: This is a caller bug. Validate cell metrics before rendering.

## Bijou GPU Shader Generator

These come from `geordi-bijou-shadergen`. Each is the `code` of a
`geordi.bijou_shadergen.error` JSON line on stderr. The tool is described in
[`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md).

### `GEORDI_E_BIJOU_SHADERGEN_IO`

**Message**: A generator input or output file could not be read or written
**Fix**: Run the tool from the repository root or pass `--repo-root`; the message names the file.

### `GEORDI_E_BIJOU_SHADERGEN_BUNNY_DIGEST_MISMATCH`

**Message**: A vendored Bunny helper or vector fixture does not have its pinned SHA-256
**Fix**: Restore the exact bytes from the Bunny commit the design record pins. To adopt a new Bunny revision, follow [`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md#changing-a-shader).

### `GEORDI_E_BIJOU_SHADERGEN_GLYPH_TABLE_INVALID`

**Message**: `fixtures/bijou-gpu/procedural-glyphs.json` is not a `bijou-procedural-glyphs/1` table with 128 Box-Drawing and 32 Block Element entries in code point order
**Fix**: Correct the table entry the message names.

### `GEORDI_E_BIJOU_SHADERGEN_WGSL_PARSE`

**Message**: Pinned `naga` could not parse an assembled WGSL module
**Fix**: Fix the authored WGSL at the location in the `naga` diagnostic.

### `GEORDI_E_BIJOU_SHADERGEN_WGSL_VALIDATION`

**Message**: Pinned `naga` parsed an assembled WGSL module but rejected it
**Fix**: Fix the authored WGSL at the location in the `naga` diagnostic.

### `GEORDI_E_BIJOU_SHADERGEN_GLSL_WRITE`

**Message**: Pinned `naga` could not translate an entry point to GLSL ES 3.00
**Fix**: Use only WGSL features that GLSL ES 3.00 for WebGL supports; the message names the entry point.

### `GEORDI_E_BIJOU_SHADERGEN_USAGE`

**Message**: The command line is not valid
**Fix**: Pass exactly one of `--check`, `--write`, `--schema`, `--help`. Exit code 2.

### `GEORDI_E_BIJOU_SHADERGEN_DRIFT`

**Message**: Checked-in generated shader files differ from a fresh generation
**Fix**: Run `cargo run -p geordi-bijou-shadergen -- --write` and commit the regenerated files with the change that caused them.

## Bijou GPU Shader Sources Generator

These come from `scripts/generate-bijou-gpu-shader-sources.mjs`. Each is the `code` of a
`geordi.bijou_shader_sources.error` JSON line on stderr. The tool is described in
[`bijou-gpu-shaders.md`](./bijou-gpu-shaders.md#shader-sources).

### `GEORDI_E_BIJOU_SHADER_SOURCES_USAGE`

**Message**: The command line is not valid
**Fix**: Pass exactly one of `--check`, `--write`, `--schema`, `--help`, and a directory after `--repo-root`. Exit code 2.

### `GEORDI_E_BIJOU_SHADER_SOURCES_IO`

**Message**: A shader file to embed does not exist
**Fix**: Run `cargo run -p geordi-bijou-shadergen -- --write` to regenerate the shader artifacts.

### `GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH`

**Message**: A shader file or the procedural glyph table fixture contains a carriage return or does not hash to its pin (the manifest, or `PROCEDURAL_GLYPH_TABLE_SHA256`)
**Fix**: Check the file out with LF line endings (`.gitattributes` requires them), or regenerate the shader artifacts with `geordi-bijou-shadergen --write`. Never edit a generated file.

### `GEORDI_E_BIJOU_SHADER_SOURCES_DRIFT`

**Message**: The bundled shader-source or procedural-table modules, or the published table copy, differ from a fresh generation
**Fix**: Run `node scripts/generate-bijou-gpu-shader-sources.mjs --write` and commit the modules with the shader change that caused them.

### `GEORDI_E_BIJOU_SHADER_SOURCES_INTERNAL`

**Message**: An unexpected failure, including a missing `packages/core/dist`
**Fix**: Build `@flyingrobots/geordi-core` first (`pnpm --filter @flyingrobots/geordi-core build`), then rerun.

## Bijou GPU Native `wgpu` Proof

These come from `geordi-bijou-wgpu-proof`. Each is the `code` of a
`geordi.bijou_wgpu_proof.error` JSON line on stderr, or of the `obstruction` in a `result` line.
The proof also reports the kit codes `GEORDI_E_BIJOU_INVALID_PACKED_CELLS`,
`GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH`, `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT`,
`GEORDI_E_BIJOU_INVALID_ATLAS`, `GEORDI_E_BIJOU_INVALID_CELL_METRICS`,
`GEORDI_E_BIJOU_BACKEND_UNAVAILABLE`, `GEORDI_E_BIJOU_RENDERER_FAULT` and
`GEORDI_E_BIJOU_FRAME_HASH_MISMATCH` with the meanings above. The tool is described in
[`bijou-gpu-native-wgpu.md`](./bijou-gpu-native-wgpu.md).

### `GEORDI_E_BIJOU_WGPU_RESOURCE_LIMIT`

**Message**: The grid, the atlas or the canvas would need a texture edge above 8,192 texels, or the canvas is smaller than the grid
**Fix**: Render a smaller grid or canvas. The limit is the WebGPU default `maxTextureDimension2D`.

### `GEORDI_E_BIJOU_WGPU_SHADER_IDENTITY`

**Message**: `bijou-surface.wgsl`, the procedural glyph table or the Bunny pins are not the ones the implementation manifest and `geordi-bijou-shadergen` name
**Fix**: Restore the generated files with `cargo run -p geordi-bijou-shadergen -- --write` and commit them. Never edit the shader for the native host.

### `GEORDI_E_BIJOU_WGPU_HARDWARE_GPU_REQUIRED`

**Message**: `--require-gpu` was given, and the frame was rendered by a `Cpu` or `Other` adapter, so it is `software-probed`
**Fix**: Not a defect of the frame. Run on a host with a hardware adapter, or drop `--require-gpu` and report `software-probed` evidence.

### `GEORDI_E_BIJOU_WGPU_IO`

**Message**: An input, the glyph pack, the manifest or the shader could not be read, or the receipt could not be written
**Fix**: Run from the repository root or pass `--repo-root`; the `path` names the file.

### `GEORDI_E_BIJOU_WGPU_USAGE`

**Message**: The command line is not valid
**Fix**: Pass `--render <file>`, `--schema` or `--help`, with the flags in `--help`. Exit code 2.

## Warnings

### `GEORDI_W_UNUSED_FIELD`

**Severity**: Warning
**Message**: GraphQL field is not used by any Geordi directive
**Fix**: Remove unused field or add `@geordi_node` directive

### `GEORDI_W_STYLE_IGNORED_FOR_KIND`

**Severity**: Warning
**Message**: Style property ignored for this node kind
**Fix**: Remove inapplicable style properties

### `GEORDI_W_PROP_OVERRIDDEN`

**Severity**: Warning
**Message**: Property value overridden by later directive
**Fix**: Remove duplicate property definitions

### `GEORDI_W_BINARY_PACK_NOT_IMPLEMENTED`

**Severity**: Warning
**Status**: Deprecated; retained for historical compatibility.
**Message**: Binary pack requested but not implemented yet
**Fix**: New compiler paths should emit `GEORDI_E_FEATURE_NOT_IMPLEMENTED` with `details.feature = "binaryPack"` so unsupported binary output fails loudly.

## Error Handling Policy

1. **Errors (`GEORDI_E_*`)**: Compilation fails. Fix required before proceeding.
2. **Warnings (`GEORDI_W_*`)**: Compilation succeeds unless `failOnWarnings: true`.
3. **Internal errors**: Always file a bug report with reproduction case.

## Version History

- **v0.1.0**: Initial error code taxonomy
