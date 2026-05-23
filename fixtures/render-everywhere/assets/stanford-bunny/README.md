# Stanford Bunny Render Asset

**Asset path**: `fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply`
**Source archive**: `https://graphics.stanford.edu/pub/3Dscanrep/bunny.tar.gz`
**Retrieved**: 2026-05-23

This PLY is parked as the shared mesh sanity object for a future 3D render-everywhere fixture. It
is not part of the first browser/native proof, which remains rectangle-only until the 2D artifact,
browser harness, and native Rust harness are stable.

## Source

The file comes from Stanford Computer Graphics Laboratory's Stanford 3D Scanning Repository:

- archive SHA-256: `a5720bd96d158df403d153381b8411a727a1d73cff2f33dc9b212d6f75455b84`
- extracted path: `bunny/reconstruction/bun_zipper_res3.ply`
- committed asset SHA-256: `975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6`
- committed reconstruction README SHA-256:
  `b05569908cfe8f50cbd2babeec2c5453a2ae6e7ed739f238fdbd00a1854a06de`

The upstream reconstruction README is preserved beside the asset as
`STANFORD_RECONSTRUCTION_README.txt`. The committed PLY and README text have line-end whitespace
normalized for repository hygiene.

## Mesh Profile

- Format: ASCII PLY
- Vertices: 1889
- Faces: 3851
- Reconstruction: zipper output, resolution 3 decimation

## Usage Boundary

Use this model when the render-everywhere demo grows a 3D or mesh sanity path:

- one canonical mesh asset;
- one deterministic asset manifest;
- browser and native runtimes loading the same bytes;
- simple camera, material, and pixel probes that are defined outside platform-specific renderer
  defaults.

Stanford asks users of the repository to acknowledge the source, allows research use and free
redistribution, and requires permission for commercial product use. Keep attribution with this file
whenever it is used in demo material.
