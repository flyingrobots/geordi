import {
  createRenderFixtureMeshPlaybackFrame,
  parseRenderFixtureAsciiPlyTriangleMesh,
  parseRenderFixtureMeshAssetManifest,
  type RenderFixtureMeshAssetManifest,
  type RenderFixtureMeshPlayback,
  type RenderFixturePlyMesh,
  type RenderFixtureVector3,
} from '@flyingrobots/geordi-render-fixture';
import type { BrowserHarnessFetchText } from './browserRenderSmoke.js';
import type { BunnyFixtureAssets } from './bunnyAssets.js';

export const BUNNY_BROWSER_RENDERER_NAME = 'browser-canvas-wireframe-mesh' as const;
export const BUNNY_TRANSFORM_PROFILE = 'geordi-fixed-rate-rotation/1' as const;
export const BUNNY_RENDER_VIEWPORT_HEIGHT = 512 as const;
export const BUNNY_RENDER_VIEWPORT_WIDTH = 512 as const;
export const BUNNY_ROTATION_RADIANS_PER_SECOND = Math.PI / 4;
export const BUNNY_ROTATION_SAMPLE_RATE = 60 as const;

const BUNNY_BACKGROUND_COLOR = '#111827';
const BUNNY_MATERIAL_COLOR = '#d1d5db';
const BUNNY_CAMERA_EYE = [0, 0.1, 0.35] as const;
const BUNNY_VERTICAL_FOV_RADIANS = Math.PI / 4;
const BUNNY_FOCAL_LENGTH = 1 / Math.tan(BUNNY_VERTICAL_FOV_RADIANS / 2);
const BUNNY_ROTATION_AXIS = [3, 5, 2] as const;
const BUNNY_PLAYBACK: RenderFixtureMeshPlayback = {
  axis: BUNNY_ROTATION_AXIS,
  kind: 'fixed-rate-rotation',
  radiansPerSecond: BUNNY_ROTATION_RADIANS_PER_SECOND,
  sampleRate: BUNNY_ROTATION_SAMPLE_RATE,
};

interface ProjectedPoint {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
}

export interface BunnyFrameReport {
  readonly angleRadians: number;
  readonly axis: RenderFixtureVector3;
  readonly assetHash: string;
  readonly faceCount: number;
  readonly frameIndex: number;
  readonly normalizedAxis: RenderFixtureVector3;
  readonly radiansPerSecond: number;
  readonly rendererName: typeof BUNNY_BROWSER_RENDERER_NAME;
  readonly sampleRate: number;
  readonly seconds: number;
  readonly transformProfile: typeof BUNNY_TRANSFORM_PROFILE;
  readonly vertexCount: number;
}

export interface BunnyRenderResult {
  readonly canvas: HTMLCanvasElement;
  readonly manifest: RenderFixtureMeshAssetManifest;
  readonly mesh: RenderFixturePlyMesh;
  readonly report: BunnyFrameReport;
}

export class BunnyHarnessArtifactHashError extends Error {
  constructor() {
    super('Browser bunny asset hash failed');
    this.name = new.target.name;
  }
}

export class BunnyHarnessCanvasContextError extends Error {
  constructor() {
    super('Browser bunny canvas context failed');
    this.name = new.target.name;
  }
}

export class BunnyHarnessHashMismatchError extends Error {
  public readonly actual: string;
  public readonly expected: string;

  constructor(expected: string, actual: string) {
    super('Browser bunny asset hash mismatch');
    this.name = new.target.name;
    this.actual = actual;
    this.expected = expected;
  }
}

export class BunnyHarnessMeshIndexError extends Error {
  public readonly index: number;

  constructor(index: number) {
    super('Browser bunny mesh index failed');
    this.name = new.target.name;
    this.index = index;
  }
}

export async function renderBunnyFixtureFrame(
  assets: BunnyFixtureAssets,
  frameIndex: number,
  fetchText: BrowserHarnessFetchText,
): Promise<BunnyRenderResult> {
  const manifestSource = await fetchText(assets.manifestUrl);
  const manifest = parseRenderFixtureMeshAssetManifest(manifestSource);
  const plySource = await fetchText(assets.plyUrl);
  const actualHash = await sha256ArtifactHash(plySource);
  if (actualHash !== manifest.sha256) {
    throw new BunnyHarnessHashMismatchError(manifest.sha256, actualHash);
  }

  const mesh = parseRenderFixtureAsciiPlyTriangleMesh(plySource);
  const canvas = document.createElement('canvas');
  canvas.width = BUNNY_RENDER_VIEWPORT_WIDTH;
  canvas.height = BUNNY_RENDER_VIEWPORT_HEIGHT;
  canvas.setAttribute('data-geordi-bunny-canvas', 'true');
  const report = renderBunnyFrameToCanvas(canvas, manifest, mesh, frameIndex);

  return {
    canvas,
    manifest,
    mesh,
    report,
  };
}

export function renderBunnyFrameToCanvas(
  canvas: HTMLCanvasElement,
  manifest: RenderFixtureMeshAssetManifest,
  mesh: RenderFixturePlyMesh,
  frameIndex: number,
): BunnyFrameReport {
  const report = createBunnyFrameReport(frameIndex, manifest, mesh);
  renderBunnyWireframe(canvas, mesh, report.angleRadians);

  return report;
}

export function createBunnyFrameReport(
  frameIndex: number,
  manifest: RenderFixtureMeshAssetManifest,
  mesh: RenderFixturePlyMesh,
): BunnyFrameReport {
  const playbackFrame = createRenderFixtureMeshPlaybackFrame(BUNNY_PLAYBACK, frameIndex);
  return {
    angleRadians: playbackFrame.angleRadians,
    axis: playbackFrame.axis,
    assetHash: manifest.sha256,
    faceCount: mesh.faces.length,
    frameIndex: playbackFrame.frameIndex,
    normalizedAxis: playbackFrame.normalizedAxis,
    radiansPerSecond: playbackFrame.radiansPerSecond,
    rendererName: BUNNY_BROWSER_RENDERER_NAME,
    sampleRate: playbackFrame.sampleRate,
    seconds: playbackFrame.seconds,
    transformProfile: BUNNY_TRANSFORM_PROFILE,
    vertexCount: mesh.vertices.length,
  };
}

export function bunnyFrameIndexFromElapsedMs(elapsedMs: number): number {
  return Math.floor((elapsedMs / 1000) * BUNNY_ROTATION_SAMPLE_RATE);
}

function renderBunnyWireframe(
  canvas: HTMLCanvasElement,
  mesh: RenderFixturePlyMesh,
  angleRadians: number,
): void {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new BunnyHarnessCanvasContextError();
  }

  context.fillStyle = BUNNY_BACKGROUND_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = BUNNY_MATERIAL_COLOR;
  context.lineWidth = 1;
  context.beginPath();

  for (const face of mesh.faces) {
    const first = projectPosition(vertexPosition(mesh, face[0]), angleRadians);
    const second = projectPosition(vertexPosition(mesh, face[1]), angleRadians);
    const third = projectPosition(vertexPosition(mesh, face[2]), angleRadians);
    drawProjectedEdge(context, first, second);
    drawProjectedEdge(context, second, third);
    drawProjectedEdge(context, third, first);
  }

  context.stroke();
}

function vertexPosition(mesh: RenderFixturePlyMesh, index: number): RenderFixtureVector3 {
  const vertex = mesh.vertices.at(index);
  if (vertex === undefined) {
    throw new BunnyHarnessMeshIndexError(index);
  }

  return vertex.position;
}

function drawProjectedEdge(
  context: CanvasRenderingContext2D,
  first: ProjectedPoint,
  second: ProjectedPoint,
): void {
  if (!first.visible || !second.visible) {
    return;
  }

  context.moveTo(first.x, first.y);
  context.lineTo(second.x, second.y);
}

function projectPosition(
  position: RenderFixtureVector3,
  angleRadians: number,
): ProjectedPoint {
  const rotated = rotateAroundAxis(position, normalizeVector3(BUNNY_ROTATION_AXIS), angleRadians);
  const cameraX = rotated[0] - BUNNY_CAMERA_EYE[0];
  const cameraY = rotated[1] - BUNNY_CAMERA_EYE[1];
  const cameraZ = rotated[2] - BUNNY_CAMERA_EYE[2];
  const depth = -cameraZ;

  if (depth <= 0) {
    return {
      visible: false,
      x: 0,
      y: 0,
    };
  }

  const xNdc = (BUNNY_FOCAL_LENGTH * cameraX) / depth;
  const yNdc = (BUNNY_FOCAL_LENGTH * cameraY) / depth;

  return {
    visible: true,
    x: ((xNdc + 1) / 2) * BUNNY_RENDER_VIEWPORT_WIDTH,
    y: ((1 - yNdc) / 2) * BUNNY_RENDER_VIEWPORT_HEIGHT,
  };
}

function rotateAroundAxis(
  position: RenderFixtureVector3,
  axis: RenderFixtureVector3,
  angleRadians: number,
): RenderFixtureVector3 {
  const [axisX, axisY, axisZ] = axis;
  const [x, y, z] = position;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const dot = axisX * x + axisY * y + axisZ * z;

  return [
    x * cos + (axisY * z - axisZ * y) * sin + axisX * dot * (1 - cos),
    y * cos + (axisZ * x - axisX * z) * sin + axisY * dot * (1 - cos),
    z * cos + (axisX * y - axisY * x) * sin + axisZ * dot * (1 - cos),
  ];
}

function normalizeVector3(vector: RenderFixtureVector3): RenderFixtureVector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

async function sha256ArtifactHash(source: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(source);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

    return `sha256:${hexFromBytes(new Uint8Array(digest))}`;
  } catch {
    throw new BunnyHarnessArtifactHashError();
  }
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
