# Utah Teapot Render Asset

**Asset path**: `fixtures/render-everywhere/assets/utah-teapot/utah_teapot.obj`

This OBJ is parked as a shared render-everywhere asset for a future 3D sanity fixture. It is not
part of the first browser/native proof, which remains rectangle-only until the 2D artifact,
browser harness, and native Rust harness are stable.

## Intended Use

Use this model when the render-everywhere demo grows a 3D or mesh sanity path:

- one canonical mesh asset;
- one deterministic asset manifest;
- browser and native runtimes loading the same bytes;
- simple camera, material, and pixel probes that are defined outside platform-specific renderer
  defaults.

## Current Status

The OBJ header identifies the model as:

- Utah Teapot Model
- Version: 1975 - Martin Newell
- Triangle Mesh Resolution: 16

Before this asset is used in release packaging or public demo claims, confirm and document the
model provenance and license explicitly.
