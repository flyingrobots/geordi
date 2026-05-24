import { describe, expect, it } from 'vitest';
import {
  parseRenderFixtureAsciiPlyTriangleMesh,
  type RenderFixtureMeshAssetManifest,
} from '@flyingrobots/geordi-render-fixture';
import {
  BUNNY_BROWSER_RENDERER_NAME,
  BUNNY_TRANSFORM_PROFILE,
  bunnyFrameIndexFromElapsedMs,
  createBunnyFrameReport,
  renderBunnyFrameToCanvas,
} from './bunnyRender.js';

const TEST_MESH_MANIFEST: RenderFixtureMeshAssetManifest = {
  assetPath: 'bunny.ply',
  assetVersion: 'geordi-mesh-asset/1',
  bounds: {
    max: [1, 1, 1],
    min: [0, 0, 0],
  },
  counts: {
    faces: 1,
    vertices: 3,
  },
  faceProperty: 'vertex_indices',
  format: {
    encoding: 'ascii',
    kind: 'ply',
    version: '1.0',
  },
  id: 'render-everywhere:stanford-bunny',
  meshProfile: 'geordi-ascii-ply-triangle-mesh/1',
  sha256: 'sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6',
  source: {
    attribution: 'test',
    retrieved: '2026-05-24',
    url: 'https://example.invalid/bunny.ply',
  },
  vertexProperties: ['x', 'y', 'z'],
};

const TEST_PLY_SOURCE = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
0 1 0
3 0 1 2
`;

interface DrawCall {
  readonly name: 'lineTo' | 'moveTo';
  readonly x: number;
  readonly y: number;
}

class FakeBunnyCanvasContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  readonly calls: DrawCall[] = [];

  beginPath(): void {
    return undefined;
  }

  fillRect(_x: number, _y: number, _width: number, _height: number): void {
    return undefined;
  }

  lineTo(x: number, y: number): void {
    this.calls.push({ name: 'lineTo', x, y });
  }

  moveTo(x: number, y: number): void {
    this.calls.push({ name: 'moveTo', x, y });
  }

  stroke(): void {
    return undefined;
  }
}

function makeFakeCanvas(context: FakeBunnyCanvasContext2D): HTMLCanvasElement {
  return {
    height: 512,
    getContext: (contextId: string) => (contextId === '2d' ? context : null),
    setAttribute: () => undefined,
    width: 512,
  } as object as HTMLCanvasElement;
}

describe('bunny render report', () => {
  it('derives deterministic fixed-rate frame metadata', () => {
    const mesh = parseRenderFixtureAsciiPlyTriangleMesh(TEST_PLY_SOURCE);

    const report = createBunnyFrameReport(15, TEST_MESH_MANIFEST, mesh);

    expect(report.rendererName).toBe(BUNNY_BROWSER_RENDERER_NAME);
    expect(report.transformProfile).toBe(BUNNY_TRANSFORM_PROFILE);
    expect(report.axis).toEqual([3, 5, 2]);
    expect(report.frameIndex).toBe(15);
    expect(report.sampleRate).toBe(60);
    expect(report.seconds).toBe(0.25);
    expect(report.radiansPerSecond).toBe(Math.PI / 4);
    expect(report.angleRadians).toBeCloseTo(Math.PI / 16);
    expect(report.assetHash).toBe(TEST_MESH_MANIFEST.sha256);
    expect(report.vertexCount).toBe(3);
    expect(report.faceCount).toBe(1);
    expect(report.normalizedAxis[0]).toBeCloseTo(0.4866642633922876);
    expect(report.normalizedAxis[1]).toBeCloseTo(0.8111071056538126);
    expect(report.normalizedAxis[2]).toBeCloseTo(0.32444284226152503);
  });

  it('exposes deterministic sampled frame metadata for browser rendering', () => {
    const mesh = parseRenderFixtureAsciiPlyTriangleMesh(TEST_PLY_SOURCE);
    const frame0 = createBunnyFrameReport(0, TEST_MESH_MANIFEST, mesh);
    const frame15 = createBunnyFrameReport(15, TEST_MESH_MANIFEST, mesh);
    const frame60 = createBunnyFrameReport(60, TEST_MESH_MANIFEST, mesh);
    const frames = [frame0, frame15, frame60];

    expect(frames.map((frame) => frame.frameIndex)).toEqual([0, 15, 60]);
    expect(frames.map((frame) => frame.seconds)).toEqual([0, 0.25, 1]);
    expect(frame0.angleRadians).toBe(0);
    expect(frame15.angleRadians).toBeCloseTo(Math.PI / 16);
    expect(frame60.angleRadians).toBeCloseTo(Math.PI / 4);
  });

  it('maps host elapsed time to deterministic frame indices', () => {
    expect(bunnyFrameIndexFromElapsedMs(0)).toBe(0);
    expect(bunnyFrameIndexFromElapsedMs(249)).toBe(14);
    expect(bunnyFrameIndexFromElapsedMs(250)).toBe(15);
    expect(bunnyFrameIndexFromElapsedMs(1000)).toBe(60);
  });

  it('renders fixed sampled browser frames through the canvas path', () => {
    const mesh = parseRenderFixtureAsciiPlyTriangleMesh(TEST_PLY_SOURCE);
    const context0 = new FakeBunnyCanvasContext2D();
    const context15 = new FakeBunnyCanvasContext2D();
    const context60 = new FakeBunnyCanvasContext2D();

    const frame0 = renderBunnyFrameToCanvas(makeFakeCanvas(context0), TEST_MESH_MANIFEST, mesh, 0);
    const frame15 = renderBunnyFrameToCanvas(
      makeFakeCanvas(context15),
      TEST_MESH_MANIFEST,
      mesh,
      15,
    );
    const frame60 = renderBunnyFrameToCanvas(
      makeFakeCanvas(context60),
      TEST_MESH_MANIFEST,
      mesh,
      60,
    );

    expect(frame0.frameIndex).toBe(0);
    expect(frame15.frameIndex).toBe(15);
    expect(frame60.frameIndex).toBe(60);
    expect(context0.calls.length).toBeGreaterThan(0);
    expect(context15.calls.length).toBeGreaterThan(0);
    expect(context60.calls.length).toBeGreaterThan(0);
    expect(context15.calls).not.toEqual(context0.calls);
    expect(context60.calls).not.toEqual(context0.calls);
  });
});
