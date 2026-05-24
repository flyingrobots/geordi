import bunnyMeshManifestUrl from '../../../fixtures/render-everywhere/assets/stanford-bunny/bunny.mesh.json?url';
import bunnyPlyUrl from '../../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply?url';

export interface BunnyFixtureAssets {
  readonly manifestUrl: string;
  readonly plyUrl: string;
}

export const STANFORD_BUNNY_ASSETS: BunnyFixtureAssets = {
  manifestUrl: bunnyMeshManifestUrl,
  plyUrl: bunnyPlyUrl,
} as const;
