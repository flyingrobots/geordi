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
