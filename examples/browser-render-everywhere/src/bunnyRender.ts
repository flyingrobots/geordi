import {
  createRenderFixtureMeshPlaybackFrame,
  parseRenderFixtureAsciiPlyTriangleMesh,
  parseRenderFixtureMeshAssetManifest,
  parseRenderFixtureMeshFixtureManifest,
  type RenderFixtureMeshAssetManifest,
  type RenderFixtureMeshCamera,
  type RenderFixtureMeshFixtureManifest,
  type RenderFixtureMeshProjection,
  type RenderFixturePlyMesh,
  type RenderFixtureVector3,
} from '@flyingrobots/geordi-render-fixture';
import type { BrowserHarnessFetchText } from './browserRenderSmoke.js';
import type { BunnyFixtureAssets } from './bunnyAssets.js';

export const BUNNY_BROWSER_RENDERER_NAME = 'browser-canvas-wireframe-mesh' as const;
export const BUNNY_TRANSFORM_PROFILE = 'geordi-fixed-rate-rotation/1' as const;

interface ProjectedPoint {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
}

interface CameraBasis {
  readonly eye: RenderFixtureVector3;
  readonly forward: RenderFixtureVector3;
  readonly right: RenderFixtureVector3;
  readonly up: RenderFixtureVector3;
}

interface BunnyRenderContext {
  readonly axis: RenderFixtureVector3;
  readonly backgroundColor: string;
  readonly camera: CameraBasis;
  readonly focalLength: number;
  readonly materialColor: string;
  readonly projection: RenderFixtureMeshProjection;
}

export interface BunnyFrameReport {
  readonly angleRadians: number;
  readonly axis: RenderFixtureVector3;
  readonly assetHash: string;
  readonly faceCount: number;
  readonly fixtureId: string;
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
  readonly fixture: RenderFixtureMeshFixtureManifest;
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

export class BunnyHarnessManifestMeshMismatchError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('Browser bunny manifest mesh mismatch');
    this.name = new.target.name;
    this.path = path;
  }
}

export class BunnyHarnessFixtureAssetMismatchError extends Error {
  public readonly expected: string;
  public readonly actual: string;

  constructor(expected: string, actual: string) {
    super('Browser bunny fixture asset manifest mismatch');
    this.name = new.target.name;
    this.expected = expected;
    this.actual = actual;
  }
}

export class BunnyHarnessElapsedTimeError extends Error {
  public readonly elapsedMs: number;

  constructor(elapsedMs: number) {
    super('Browser bunny elapsed time failed');
    this.name = new.target.name;
    this.elapsedMs = elapsedMs;
  }
}

export class BunnyHarnessPlaybackSampleRateError extends Error {
  public readonly sampleRate: number;

  constructor(sampleRate: number) {
    super('Browser bunny playback sample rate failed');
    this.name = new.target.name;
    this.sampleRate = sampleRate;
  }
}

export class BunnyHarnessVectorNormalizationError extends Error {
  constructor() {
    super('Browser bunny vector normalization failed');
    this.name = new.target.name;
  }
}

export async function renderBunnyFixtureFrame(
  assets: BunnyFixtureAssets,
  frameIndex: number,
  fetchText: BrowserHarnessFetchText,
): Promise<BunnyRenderResult> {
  const fixtureSource = await fetchText(assets.fixtureUrl);
  const fixture = parseRenderFixtureMeshFixtureManifest(fixtureSource);
  if (fixture.assetManifestPath !== assets.assetManifestPath) {
    throw new BunnyHarnessFixtureAssetMismatchError(
      fixture.assetManifestPath,
      assets.assetManifestPath,
    );
  }

  const manifestSource = await fetchText(assets.manifestUrl);
  const manifest = parseRenderFixtureMeshAssetManifest(manifestSource);
  const plySource = await fetchText(assets.plyUrl);
  const actualHash = await sha256ArtifactHash(plySource);
  if (actualHash !== manifest.sha256) {
    throw new BunnyHarnessHashMismatchError(manifest.sha256, actualHash);
  }

  const mesh = parseRenderFixtureAsciiPlyTriangleMesh(plySource);
  const canvas = document.createElement('canvas');
  canvas.width = fixture.projection.viewport.width;
  canvas.height = fixture.projection.viewport.height;
  canvas.setAttribute('data-geordi-bunny-canvas', 'true');
  const report = renderBunnyFrameToCanvas(canvas, fixture, manifest, mesh, frameIndex);

  return {
    canvas,
    fixture,
    manifest,
    mesh,
    report,
  };
}

export function renderBunnyFrameToCanvas(
  canvas: HTMLCanvasElement,
  fixture: RenderFixtureMeshFixtureManifest,
  manifest: RenderFixtureMeshAssetManifest,
  mesh: RenderFixturePlyMesh,
  frameIndex: number,
): BunnyFrameReport {
  const report = createBunnyFrameReport(frameIndex, fixture, manifest, mesh);
  renderBunnyWireframe(canvas, mesh, fixture, report.angleRadians);

  return report;
}

export function createBunnyFrameReport(
  frameIndex: number,
  fixture: RenderFixtureMeshFixtureManifest,
  manifest: RenderFixtureMeshAssetManifest,
  mesh: RenderFixturePlyMesh,
): BunnyFrameReport {
  assertBunnyMeshMatchesManifest(manifest, mesh);
  const playbackFrame = createRenderFixtureMeshPlaybackFrame(fixture.playback, frameIndex);
  return {
    angleRadians: playbackFrame.angleRadians,
    axis: playbackFrame.axis,
    assetHash: manifest.sha256,
    faceCount: mesh.faces.length,
    fixtureId: fixture.id,
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

export function bunnyFrameIndexFromElapsedMs(elapsedMs: number, sampleRate: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new BunnyHarnessElapsedTimeError(elapsedMs);
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new BunnyHarnessPlaybackSampleRateError(sampleRate);
  }

  return Math.floor((elapsedMs / 1000) * sampleRate);
}

function assertBunnyMeshMatchesManifest(
  manifest: RenderFixtureMeshAssetManifest,
  mesh: RenderFixturePlyMesh,
): void {
  if (mesh.vertices.length !== manifest.counts.vertices) {
    throw new BunnyHarnessManifestMeshMismatchError('$.counts.vertices');
  }

  if (mesh.faces.length !== manifest.counts.faces) {
    throw new BunnyHarnessManifestMeshMismatchError('$.counts.faces');
  }

  if (!sameStringSequence(mesh.vertexProperties, manifest.vertexProperties)) {
    throw new BunnyHarnessManifestMeshMismatchError('$.vertexProperties');
  }

  if (!sameVector3(mesh.bounds.min, manifest.bounds.min)) {
    throw new BunnyHarnessManifestMeshMismatchError('$.bounds.min');
  }

  if (!sameVector3(mesh.bounds.max, manifest.bounds.max)) {
    throw new BunnyHarnessManifestMeshMismatchError('$.bounds.max');
  }
}

function sameStringSequence(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function sameVector3(left: RenderFixtureVector3, right: RenderFixtureVector3): boolean {
  return (
    Object.is(left[0], right[0]) &&
    Object.is(left[1], right[1]) &&
    Object.is(left[2], right[2])
  );
}

function renderBunnyWireframe(
  canvas: HTMLCanvasElement,
  mesh: RenderFixturePlyMesh,
  fixture: RenderFixtureMeshFixtureManifest,
  angleRadians: number,
): void {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new BunnyHarnessCanvasContextError();
  }

  const renderContext = createBunnyRenderContext(fixture);
  context.fillStyle = renderContext.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = renderContext.materialColor;
  context.lineWidth = 1;
  context.beginPath();

  for (const face of mesh.faces) {
    const first = projectPosition(vertexPosition(mesh, face[0]), renderContext, angleRadians);
    const second = projectPosition(vertexPosition(mesh, face[1]), renderContext, angleRadians);
    const third = projectPosition(vertexPosition(mesh, face[2]), renderContext, angleRadians);
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
  context: BunnyRenderContext,
  angleRadians: number,
): ProjectedPoint {
  const rotated = rotateAroundAxis(position, context.axis, angleRadians);
  const delta = subtractVector3(rotated, context.camera.eye);
  const cameraX = dotVector3(delta, context.camera.right);
  const cameraY = dotVector3(delta, context.camera.up);
  const depth = dotVector3(delta, context.camera.forward);

  if (depth < context.projection.near || depth > context.projection.far) {
    return {
      visible: false,
      x: 0,
      y: 0,
    };
  }

  const xNdc = (context.focalLength * cameraX) / depth;
  const yNdc = (context.focalLength * cameraY) / depth;

  return {
    visible: true,
    x: ((xNdc + 1) / 2) * context.projection.viewport.width,
    y: ((1 - yNdc) / 2) * context.projection.viewport.height,
  };
}

function createBunnyRenderContext(fixture: RenderFixtureMeshFixtureManifest): BunnyRenderContext {
  return {
    axis: normalizeVector3(fixture.playback.axis),
    backgroundColor: fixture.material.backgroundColor,
    camera: createCameraBasis(fixture.camera),
    focalLength: 1 / Math.tan(fixture.projection.verticalFovRadians / 2),
    materialColor: fixture.material.color,
    projection: fixture.projection,
  };
}

function createCameraBasis(camera: RenderFixtureMeshCamera): CameraBasis {
  const forward = normalizeVector3(subtractVector3(camera.target, camera.eye));
  const right = normalizeVector3(crossVector3(forward, camera.up));
  const up = normalizeVector3(crossVector3(right, forward));

  return {
    eye: camera.eye,
    forward,
    right,
    up,
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
  if (!Number.isFinite(length) || length <= 0) {
    throw new BunnyHarnessVectorNormalizationError();
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtractVector3(
  left: RenderFixtureVector3,
  right: RenderFixtureVector3,
): RenderFixtureVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dotVector3(left: RenderFixtureVector3, right: RenderFixtureVector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function crossVector3(
  left: RenderFixtureVector3,
  right: RenderFixtureVector3,
): RenderFixtureVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
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
