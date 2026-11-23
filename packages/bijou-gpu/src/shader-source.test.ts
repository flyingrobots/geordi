import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonValue } from '@flyingrobots/geordi-core';
import { describe, expect, it } from 'vitest';

import { arr, nodeSha256, obj, str } from '../test/support.js';
import {
  BIJOU_SHADER_ARTIFACT_FILES,
  BIJOU_SHADER_MANIFEST_FILE,
  createInMemoryShaderSource,
  RendererFaultError,
  requireShaderText,
  webgl2FramedGlslSha256,
  type BijouShaderArtifactFile,
  type ShaderSourcePort,
} from './index.js';
import { createFileShaderSource } from './shader-source-node.js';
import { WEBGL2_BUNDLED_SHADER_SOURCE } from './shader-source-webgl2.js';
import { WEBGPU_BUNDLED_SHADER_SOURCE } from './shader-source-webgpu.js';

const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url));
const SHADER_DIR = join(PACKAGE_DIR, 'shaders');

function checkedIn(file: string): string {
  return readFileSync(join(SHADER_DIR, file), 'utf8');
}

interface ManifestArtifact {
  readonly file: BijouShaderArtifactFile;
  readonly sha256: string;
}

/** Every generated file the checked-in manifest names, with the digest it pins. */
function manifestArtifacts(): ManifestArtifact[] {
  const manifest = obj(parseJsonValue(checkedIn(BIJOU_SHADER_MANIFEST_FILE)), 'manifest');
  const files: ManifestArtifact[] = [];
  const base = (path: string): BijouShaderArtifactFile => {
    const name = path.split('/').at(-1) ?? '';
    const known = BIJOU_SHADER_ARTIFACT_FILES.find((file) => file === name);
    if (known === undefined) {
      throw new RendererFaultError('webgl2', `manifest names ${name}, which is not a known artifact`);
    }
    return known;
  };
  for (const entry of arr(manifest.shaders, 'shaders')) {
    const shader = obj(entry, 'shader');
    files.push({ file: base(str(shader.wgslPath, 'wgslPath')), sha256: str(shader.assembledWgslSha256, 'assembledWgslSha256') });
    for (const item of arr(shader.stages, 'stages')) {
      const stage = obj(item, 'stage');
      files.push({ file: base(str(stage.path, 'stage.path')), sha256: str(stage.sha256, 'stage.sha256') });
    }
  }
  return files;
}

function surfaceGlslDigest(): string {
  const manifest = obj(parseJsonValue(checkedIn(BIJOU_SHADER_MANIFEST_FILE)), 'manifest');
  const surface = arr(manifest.shaders, 'shaders')
    .map((entry) => obj(entry, 'shader'))
    .find((entry) => entry.id === 'bijou-surface');
  return str(surface?.generatedGlslSha256, 'generatedGlslSha256');
}

const BUNDLES: readonly { readonly name: string; readonly port: ShaderSourcePort; readonly files: readonly BijouShaderArtifactFile[] }[] = [
  {
    name: 'webgl2',
    port: WEBGL2_BUNDLED_SHADER_SOURCE,
    files: ['bijou-shaders.manifest.json', 'bijou-surface.vert.glsl', 'bijou-surface.frag.glsl'],
  },
  {
    name: 'webgpu',
    port: WEBGPU_BUNDLED_SHADER_SOURCE,
    files: ['bijou-shaders.manifest.json', 'bijou-surface.wgsl'],
  },
];

describe('bundled shader sources', () => {
  it('lists exactly the eight generated artifacts and the manifest the shader generator checks in', () => {
    const generated = manifestArtifacts().map((artifact) => artifact.file);
    expect([...BIJOU_SHADER_ARTIFACT_FILES].sort()).toEqual([BIJOU_SHADER_MANIFEST_FILE, ...generated].sort());
  });

  it.each(BUNDLES)('embeds the $name artifacts byte for byte: each SHA-256 equals the checked-in manifest', ({ port, files }) => {
    const pins = new Map(manifestArtifacts().map((artifact) => [artifact.file, artifact.sha256]));
    for (const file of files) {
      const text = requireShaderText(port, file, 'webgl2');
      if (file === BIJOU_SHADER_MANIFEST_FILE) {
        // The manifest has no digest of itself: the kernel receipt pins the file's SHA-256.
        expect(nodeSha256(text)).toBe(nodeSha256(readFileSync(join(SHADER_DIR, file))));
      } else {
        expect(nodeSha256(text)).toBe(pins.get(file));
      }
    }
  });

  it('frames the bundled WebGL2 stages to the manifest generatedGlslSha256', () => {
    expect(
      webgl2FramedGlslSha256([
        { file: 'bijou-surface.vert.glsl', source: requireShaderText(WEBGL2_BUNDLED_SHADER_SOURCE, 'bijou-surface.vert.glsl', 'webgl2') },
        { file: 'bijou-surface.frag.glsl', source: requireShaderText(WEBGL2_BUNDLED_SHADER_SOURCE, 'bijou-surface.frag.glsl', 'webgl2') },
      ]),
    ).toBe(surfaceGlslDigest());
  });

  it.each(BUNDLES)('keeps line feeds in the $name bundle: no carriage return survives a converted checkout', ({ port, files }) => {
    for (const file of files) {
      expect(requireShaderText(port, file, 'webgl2')).not.toContain('\r');
    }
  });

  it('carries only the artifacts of its own backend, so an unused backend costs no text', () => {
    expect(WEBGL2_BUNDLED_SHADER_SOURCE.readText('bijou-surface.wgsl')).toBeUndefined();
    expect(WEBGPU_BUNDLED_SHADER_SOURCE.readText('bijou-surface.vert.glsl')).toBeUndefined();
    expect(WEBGPU_BUNDLED_SHADER_SOURCE.readText('bijou-surface.frag.glsl')).toBeUndefined();
    for (const { port } of BUNDLES) {
      expect(port.readText('bijou-kernel-conformance.wgsl')).toBeUndefined();
    }
  });
});

describe('file shader source', () => {
  it('loads every generated artifact the manifest names from the package shaders directory, at its manifest digest', () => {
    const port = createFileShaderSource();
    for (const artifact of manifestArtifacts()) {
      expect(nodeSha256(requireShaderText(port, artifact.file, 'wgpu'))).toBe(artifact.sha256);
    }
    expect(port.readText(BIJOU_SHADER_MANIFEST_FILE)).toBe(checkedIn(BIJOU_SHADER_MANIFEST_FILE));
  });

  it.each(BUNDLES)('loads the same bytes as the bundled $name adapter', ({ port, files }) => {
    const disk = createFileShaderSource();
    for (const file of files) {
      expect(disk.readText(file)).toBe(port.readText(file));
    }
  });

  it('reads from a given directory, and yields nothing for an artifact missing there', () => {
    const directory = mkdtempSync(join(tmpdir(), 'geordi-bijou-shader-source-'));
    try {
      writeFileSync(join(directory, 'bijou-surface.vert.glsl'), checkedIn('bijou-surface.vert.glsl'));
      const port = createFileShaderSource({ directory });
      expect(port.readText('bijou-surface.vert.glsl')).toBe(checkedIn('bijou-surface.vert.glsl'));
      expect(port.readText('bijou-surface.frag.glsl')).toBeUndefined();
      expect(() => requireShaderText(port, 'bijou-surface.frag.glsl', 'webgl2')).toThrow(RendererFaultError);
      expect(port.description).toContain('file:');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('in-memory shader source', () => {
  it('returns the given text and refuses a missing artifact with a RendererFaultError naming it', () => {
    const port = createInMemoryShaderSource({ 'bijou-surface.wgsl': 'text' }, 'host');
    expect(port.readText('bijou-surface.wgsl')).toBe('text');
    expect(port.readText('bijou-surface.vert.glsl')).toBeUndefined();
    let thrown: RendererFaultError | null = null;
    try {
      requireShaderText(port, 'bijou-surface.vert.glsl', 'webgl2');
    } catch (error) {
      if (!(error instanceof RendererFaultError)) {
        throw error;
      }
      thrown = error;
    }
    expect(thrown?.backend).toBe('webgl2');
    expect(thrown?.detail).toContain('bijou-surface.vert.glsl');
    expect(thrown?.detail).toContain('host');
  });
});

/** Relative and bare module specifiers of one TypeScript source file. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const pattern of [/\bfrom\s+'([^']+)'/gu, /\bimport\s+'([^']+)'/gu, /\bimport\(\s*'([^']+)'\s*\)/gu]) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match.at(1);
      if (specifier !== undefined) {
        found.push(specifier);
      }
    }
  }
  return found;
}

/** Every module reachable from `root` through relative imports, with every specifier seen. */
function importGraph(root: string): { modules: Set<string>; specifiers: Set<string> } {
  const srcDir = fileURLToPath(new URL('./', import.meta.url));
  const modules = new Set<string>();
  const seen = new Set<string>();
  const queue = [join(srcDir, root)];
  while (queue.length > 0) {
    const file = queue.pop() ?? '';
    if (modules.has(file)) {
      continue;
    }
    modules.add(file);
    for (const specifier of specifiers(file)) {
      seen.add(specifier);
      if (specifier.startsWith('.')) {
        queue.push(join(file, '..', specifier.replace(/\.js$/u, '.ts')));
      }
    }
  }
  const relative = new Set([...modules].map((file) => file.slice(srcDir.length)));
  return { modules: relative, specifiers: seen };
}

describe('module boundaries', () => {
  it.each(['webgl2-presenter.ts', 'webgpu-presenter.ts', 'shader-source.ts'])(
    'the core module %s reaches no node: module, no ?raw specifier and no embedded shader text',
    (root) => {
      const graph = importGraph(root);
      expect([...graph.specifiers].filter((specifier) => specifier.startsWith('node:') || specifier.includes('?raw'))).toEqual([]);
      expect([...graph.modules].filter((module) => module.startsWith('generated/') || module.startsWith('shader-source-'))).toEqual([]);
    },
  );

  it('the browser entry point reaches no node: module and no file adapter, and wires both bundled adapters', () => {
    const graph = importGraph('index.ts');
    expect([...graph.specifiers].filter((specifier) => specifier.startsWith('node:') || specifier.includes('?raw'))).toEqual([]);
    expect(graph.modules.has('shader-source-node.ts')).toBe(false);
    // The composition roots wire the bundled adapters into the main entry point.
    expect(graph.modules.has('shader-source-webgl2.ts')).toBe(true);
    expect(graph.modules.has('shader-source-webgpu.ts')).toBe(true);
  });

  it('keeps each bundled adapter to its own backend text, so a bundler drops an unused one', () => {
    expect([...importGraph('shader-source-webgl2.ts').modules].sort()).toEqual([
      'errors.ts',
      'generated/bijou-shaders-manifest.generated.ts',
      'generated/bijou-surface-glsl.generated.ts',
      'shader-source-webgl2.ts',
      'shader-source.ts',
    ]);
    expect([...importGraph('shader-source-webgpu.ts').modules].sort()).toEqual([
      'errors.ts',
      'generated/bijou-shaders-manifest.generated.ts',
      'generated/bijou-surface-wgsl.generated.ts',
      'shader-source-webgpu.ts',
      'shader-source.ts',
    ]);
  });
});
});
