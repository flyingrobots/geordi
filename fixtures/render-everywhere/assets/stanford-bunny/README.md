# Stanford Bunny Render Asset

**Asset path**: `fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply`
**Asset manifest**: `fixtures/render-everywhere/assets/stanford-bunny/bunny.mesh.json`
**Fixture descriptor**: `fixtures/render-everywhere/assets/stanford-bunny/bunny.fixture.json`
**Source archive**: `https://graphics.stanford.edu/pub/3Dscanrep/bunny.tar.gz`
**Retrieved**: 2026-05-23

This PLY is the shared mesh sanity object for the bunny render-everywhere proof. It is loaded by the
browser harness and the native Rust harness from the same checked-in bytes. The bunny proof does not
claim pixel-identical 3D rasterization. It claims shared asset identity, shared parsed mesh metadata,
shared deterministic sampled-frame metadata, and nonblank render smoke coverage.

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
- Bounds min: `[-0.0943643, 0.0334143, -0.0616721]`
- Bounds max: `[0.0609346, 0.184813, 0.0584651]`

The `bunny.mesh.json` manifest records these values in the `geordi-mesh-asset/1` schema. The
`bunny.fixture.json` descriptor records the shared render intent: camera, perspective projection,
solid wireframe material colors, and fixed-rate rotation playback. Browser and native runtimes load
that same descriptor before rendering so the demo cannot drift into parallel hardcoded constants.

## Contract

The asset contract is:

- one canonical mesh asset: `bun_zipper_res3.ply`;
- one deterministic asset manifest: `bunny.mesh.json`;
- one deterministic fixture descriptor: `bunny.fixture.json`;
- one mesh profile: `geordi-ascii-ply-triangle-mesh/1`;
- one asset hash:
  `sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6`;
- one authored rotation axis from the fixture descriptor: `[3, 5, 2]`;
- one transform profile: `geordi-fixed-rate-rotation/1`;
- fixed-frame smoke samples at frame `0`, frame `15`, and frame `60`.

Both runtimes must validate the manifest and PLY bytes before rendering. A missing file, malformed
manifest, URL-scheme or non-fixture-local path, hash mismatch, unsupported PLY header, nonfinite
vertex, malformed face, bad face index, invalid perspective depth range, invalid retrieval date,
duplicate or empty vertex property, or zero rotation axis is a hard failure.

## Commands

Run browser unit tests for sampled frame metadata and canvas drawing:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere test
```

Run the browser end-to-end gate:

```bash
pnpm --filter @flyingrobots/geordi-example-browser-render-everywhere test:browser
```

Run native fixed-frame smoke:

```bash
cargo run -p native-render-everywhere -- --bunny-smoke fixtures/render-everywhere/assets/stanford-bunny
cargo run -p native-render-everywhere -- --bunny-smoke --frame 15 fixtures/render-everywhere/assets/stanford-bunny
cargo run -p native-render-everywhere -- --bunny-smoke --frame 60 fixtures/render-everywhere/assets/stanford-bunny
```

Run the native live window:

```bash
cargo run -p native-render-everywhere -- --bunny-window fixtures/render-everywhere/assets/stanford-bunny
```

Expected native smoke output includes:

```text
Geordi native bunny fixture loaded
rendererName=rust-software-wireframe-mesh
fixtureId=render-everywhere:stanford-bunny
assetHash=sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6
vertices=1889
faces=3851
frameIndex=60
seconds=1
angleRadians=0.7853981633974483
transformProfile=geordi-fixed-rate-rotation/1
smoke=passed
```

## Non-Claims

This asset proof does not claim:

- pixel-identical 3D rasterization across browser and native backends;
- a general mesh node inside core Geordi IR;
- texture, material, shader, or lighting support;
- arbitrary animation curves;
- text or font determinism.

Stanford asks users of the repository to acknowledge the source, allows research use and free
redistribution, and requires permission for commercial product use. Keep attribution with this file
whenever it is used in demo material.
