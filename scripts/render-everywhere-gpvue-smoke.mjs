import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseJsonValue, stringifyCanonicalJson } from '../packages/core/dist/index.js';
import { compileGpvueSource } from '../packages/gpvue/dist/index.js';

const FIXTURE_DIR = 'fixtures/render-everywhere/hello-panel';
const MANIFEST_PATH = `${FIXTURE_DIR}/fixture.json`;
const SOURCE_PATH = `${FIXTURE_DIR}/source.gpvue`;
const SCENE_ARTIFACT = 'scene.geordi.json';
const RECEIPT_ARTIFACT = 'scene.geordi.json.receipt';

class RenderEverywhereManifestShapeError extends Error {
  constructor() {
    super('Render-everywhere manifest must be a JSON object');
    this.name = new.target.name;
  }
}

class RenderEverywhereArtifactHashError extends Error {
  constructor() {
    super('Compiled GPVue artifact hash does not match fixture manifest');
    this.name = new.target.name;
  }
}

class RenderEverywhereCommandError extends Error {
  constructor(command) {
    super('Render-everywhere command failed');
    this.name = new.target.name;
    this.command = command;
  }
}

async function main() {
  const manifest = await loadManifest();
  const source = await readFile(SOURCE_PATH, 'utf8');
  const compiled = compileGpvueSource({
    filename: 'source.gpvue',
    source,
  });

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
    await writeFile(join(tempDir, SCENE_ARTIFACT), compiled.artifacts.ir.content, 'utf8');
    await writeFile(join(tempDir, RECEIPT_ARTIFACT), compiled.artifacts.receipt.content, 'utf8');

    run('pnpm', ['--filter', '@flyingrobots/geordi-example-browser-render-everywhere', 'test:browser'], {
      GEORDI_RENDER_EVERYWHERE_COMPILED_SCENE: join(tempDir, SCENE_ARTIFACT),
    });
    run('cargo', ['run', '-p', 'native-render-everywhere', '--', '--smoke', tempDir], {});
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function loadManifest() {
  const value = parseJsonValue(await readFile(MANIFEST_PATH, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RenderEverywhereManifestShapeError();
  }

  return value;
}

function run(command, args, env) {
  try {
    execFileSync(command, args, {
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
