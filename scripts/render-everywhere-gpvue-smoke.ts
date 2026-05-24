import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { stringifyCanonicalJson } from '@flyingrobots/geordi-core';
import { compileGpvueSource } from '@flyingrobots/geordi-gpvue';
import { parseRenderFixtureManifest } from '@flyingrobots/geordi-render-fixture';

const FIXTURE_DIR = 'fixtures/render-everywhere/hello-panel';
const MANIFEST_PATH = `${FIXTURE_DIR}/fixture.json`;
const SOURCE_PATH = `${FIXTURE_DIR}/source.gpvue`;
const SCENE_ARTIFACT = 'scene.geordi.json';
const RECEIPT_ARTIFACT = 'scene.geordi.json.receipt';
const SOURCE_MAP_ARTIFACT = 'scene.geordi.map.json';
const GPVUE_SOURCE_KIND = 'gpvue';

class RenderEverywhereArtifactHashError extends Error {
  constructor() {
    super('Compiled GPVue artifact hash does not match fixture manifest');
    this.name = new.target.name;
  }
}

class RenderEverywhereCommandError extends Error {
  public readonly command: string;

  constructor(command: string) {
    super('Render-everywhere command failed');
    this.name = new.target.name;
    this.command = command;
  }
}

class RenderEverywhereSourceKindError extends Error {
  constructor() {
    super('Render-everywhere fixture source kind is unsupported');
    this.name = new.target.name;
  }
}

class RenderEverywhereFixturePathError extends Error {
  public readonly fixturePath: string;

  constructor(fixturePath: string) {
    super('Render-everywhere fixture path escapes the temporary directory');
    this.name = new.target.name;
    this.fixturePath = fixturePath;
  }
}

async function main(): Promise<void> {
  const manifest = parseRenderFixtureManifest(await readFile(MANIFEST_PATH, 'utf8'));
  const source = await readFile(SOURCE_PATH, 'utf8');
  const compiled = compileGpvueSource({
    filename: 'source.gpvue',
    source,
  });

  if (manifest.source.kind !== GPVUE_SOURCE_KIND) {
    throw new RenderEverywhereSourceKindError();
  }

  const sourceArtifact = manifest.source.path;

  if (compiled.artifactHash !== manifest.artifactHash) {
    throw new RenderEverywhereArtifactHashError();
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'geordi-render-everywhere-'));
  try {
    await writeFile(
      join(tempDir, 'fixture.json'),
      `${stringifyCanonicalJson(manifest, { space: 2 })}\n`,
      'utf8',
    );
    await writeFixtureLocalFile(tempDir, sourceArtifact, source);
    await writeFile(join(tempDir, SCENE_ARTIFACT), compiled.artifacts.ir.content, 'utf8');
    await writeFile(join(tempDir, RECEIPT_ARTIFACT), compiled.artifacts.receipt.content, 'utf8');
    await writeFile(join(tempDir, SOURCE_MAP_ARTIFACT), compiled.artifacts.sourceMap.content, 'utf8');

    run('pnpm', ['--filter', '@flyingrobots/geordi-example-browser-render-everywhere', 'test:browser'], {
      GEORDI_RENDER_EVERYWHERE_COMPILED_MANIFEST: join(tempDir, 'fixture.json'),
      GEORDI_RENDER_EVERYWHERE_COMPILED_SCENE: join(tempDir, SCENE_ARTIFACT),
    });
    run('cargo', ['run', '-p', 'native-render-everywhere', '--', '--smoke', tempDir], {});
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function writeFixtureLocalFile(
  tempDir: string,
  fixturePath: string,
  content: string,
): Promise<void> {
  const tempRoot = resolve(tempDir);
  const targetPath = resolve(tempRoot, fixturePath);
  if (targetPath === tempRoot || !targetPath.startsWith(`${tempRoot}${sep}`)) {
    throw new RenderEverywhereFixturePathError(fixturePath);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv): void {
  try {
    execFileSync(command, Array.from(args), {
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
    });
  } catch {
    throw new RenderEverywhereCommandError(command);
  }
}

await main();
