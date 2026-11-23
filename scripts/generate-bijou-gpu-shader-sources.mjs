// Generates (or, with --check, verifies) the bundled shader-source modules of
// @flyingrobots/geordi-bijou-gpu: TypeScript modules under
// packages/bijou-gpu/src/generated/ that embed the exact bytes of the
// checked-in shader artifacts and manifest in packages/bijou-gpu/shaders/, and
// the procedural glyph table fixture; the byte-identical copy of the table in
// packages/bijou-gpu/procedural/ is the file the package publishes.
//
//   node scripts/generate-bijou-gpu-shader-sources.mjs --check
//   node scripts/generate-bijou-gpu-shader-sources.mjs --write
//   node scripts/generate-bijou-gpu-shader-sources.mjs --schema
//   node scripts/generate-bijou-gpu-shader-sources.mjs --help
//
// Every embedded file must hash to the digest the manifest pins for it, so a
// checkout that converted line endings is refused instead of embedded. Each
// text is written as one JSON string literal on one line, so converting the
// line endings of a generated module does not change the bytes it embeds.
//
// Every line on stdout and stderr is one JSON object carrying `_schema`; the
// schemas are in schemas/geordi-bijou-shader-sources/. --human writes prose.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const COMMAND = 'generate-bijou-gpu-shader-sources';
const SCHEMA_VERSION = '1.0.0';
const SCHEMA_PREFIX = 'geordi.bijou_shader_sources.';
const SCRIPT_REPO_ROOT = resolve(import.meta.dirname, '..');
const SCHEMA_DIR = resolve(SCRIPT_REPO_ROOT, 'schemas', 'geordi-bijou-shader-sources');
const SHADER_DIR = 'packages/bijou-gpu/shaders';
const GENERATED_DIR = 'packages/bijou-gpu/src/generated';
const MANIFEST_FILE = 'bijou-shaders.manifest.json';
/** Hand-written pin of the canonical WebGPU shader, which the presenters verify against. */
const PIN_FILE = 'packages/bijou-gpu/src/surface-shader-pin.ts';
/** The procedural glyph table: the ABI fixture, its published copy, and the constant that pins it. */
const TABLE_FIXTURE = 'fixtures/bijou-gpu/procedural-glyphs.json';
const TABLE_COPY = 'packages/bijou-gpu/procedural/procedural-glyphs.json';
const TABLE_PIN_FILE = 'packages/bijou-gpu/src/procedural-table.ts';

/** The generated modules, each the named exports of the files it embeds. */
const MODULES = [
  {
    file: 'bijou-shaders-manifest.generated.ts',
    exports: [{ name: 'BIJOU_SHADERS_MANIFEST_TEXT', source: MANIFEST_FILE }],
  },
  {
    file: 'bijou-surface-glsl.generated.ts',
    exports: [
      { name: 'BIJOU_SURFACE_VERT_GLSL', source: 'bijou-surface.vert.glsl' },
      { name: 'BIJOU_SURFACE_FRAG_GLSL', source: 'bijou-surface.frag.glsl' },
    ],
  },
  {
    file: 'bijou-surface-wgsl.generated.ts',
    exports: [{ name: 'BIJOU_SURFACE_WGSL', source: 'bijou-surface.wgsl' }],
  },
  {
    file: 'bijou-procedural-glyphs.generated.ts',
    exports: [{ name: 'BIJOU_PROCEDURAL_GLYPHS_TEXT', source: TABLE_FIXTURE, repoPath: true }],
  },
];

const ERROR_EXIT = {
  GEORDI_E_BIJOU_SHADER_SOURCES_USAGE: 2,
  GEORDI_E_BIJOU_SHADER_SOURCES_IO: 1,
  GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH: 1,
  GEORDI_E_BIJOU_SHADER_SOURCES_DRIFT: 1,
  GEORDI_E_BIJOU_SHADER_SOURCES_INTERNAL: 1,
};

class ShaderSourcesError extends Error {
  constructor(code, message, paths = []) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.paths = paths;
  }
}

/** Set once the core package is loaded; until then errors fall back to a fixed-shape writer. */
let stringify = null;
let human = false;

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Escape a string as a JSON string literal without JSON.stringify, for the pre-load fallback. */
function quote(text) {
  return `"${String(text).replace(/[\\"\u0000-\u001f]/gu, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
}

function line(stream, record) {
  const text = stringify === null ? fallbackLine(record) : stringify(record);
  (stream === 'stderr' ? process.stderr : process.stdout).write(`${text}\n`);
}

function fallbackLine(record) {
  // Only the error message reaches this path: a flat object of strings and string arrays.
  const fields = Object.keys(record)
    .sort()
    .map((key) => {
      const value = record[key];
      if (Array.isArray(value)) {
        return `${quote(key)}:[${value.map(quote).join(',')}]`;
      }
      if (typeof value === 'object' && value !== null) {
        return `${quote(key)}:{"id":${quote(value.id)},"version":${quote(value.version)}}`;
      }
      return `${quote(key)}:${quote(value)}`;
    });
  return `{${fields.join(',')}}`;
}

function schemaRef(name) {
  return { id: `${SCHEMA_PREFIX}${name}`, version: SCHEMA_VERSION };
}

function emitArtifact(mode, path, text, state) {
  if (human) {
    process.stdout.write(`${state}: ${path}\n`);
    return;
  }
  line('stdout', { _schema: schemaRef('artifact'), kind: 'artifact', mode, path, sha256: sha256(text), state });
}

function emitError(error) {
  const code = error instanceof ShaderSourcesError ? error.code : 'GEORDI_E_BIJOU_SHADER_SOURCES_INTERNAL';
  const message = error instanceof Error ? error.message : String(error);
  const paths = error instanceof ShaderSourcesError ? error.paths : [];
  if (human) {
    process.stderr.write(`error ${code}: ${message}\n`);
  } else {
    line('stderr', { _schema: schemaRef('error'), kind: 'error', code, message: message || code, paths });
  }
  process.exitCode = ERROR_EXIT[code] ?? 1;
}

const OPTIONS = [
  { flag: '--check', description: 'Compare a fresh generation with the checked-in modules. Writes nothing. Exits 1 on any difference.' },
  { flag: '--write', description: 'Write every generated module that differs from the file on disk.' },
  { flag: '--repo-root <dir>', description: 'Repository root. Defaults to the repository that contains this script.' },
  { flag: '--schema', description: 'Print the JSON Schema of every message type and exit 0.' },
  { flag: '--help', description: 'Print this description, then the schemas of the success and error output.' },
  { flag: '--human, --humanize', description: 'Write prose instead of JSON Lines.' },
];

const SCHEMA_STREAMS = [
  ['artifact', 'stdout'],
  ['result', 'stdout'],
  ['error', 'stderr'],
  ['help', 'stdout'],
  ['schema', 'stdout'],
];

function emitSchemas() {
  for (const [name, stream] of SCHEMA_STREAMS) {
    const schema = parseJson(readFileSync(resolve(SCHEMA_DIR, `${name}.schema.json`), 'utf8'));
    if (human) {
      process.stdout.write(`${SCHEMA_PREFIX}${name} ${SCHEMA_VERSION} (${stream}): ${schema.description}\n`);
    } else {
      line('stdout', { _schema: schemaRef('schema'), kind: 'schema', describes: schemaRef(name), stream, schema });
    }
  }
}

function emitHelp() {
  const help = {
    command: COMMAND,
    summary:
      'Embed the exact bytes of the checked-in bijou-gpu shader artifacts, manifest and procedural glyph table in generated TypeScript modules, and keep the published copy of the table equal to the fixture, refusing any file whose SHA-256 is not its pin.',
    usage: 'node scripts/generate-bijou-gpu-shader-sources.mjs (--check | --write | --schema | --help) [--repo-root <dir>] [--human]',
    options: OPTIONS,
    exitCodes: [
      { code: 0, meaning: 'Success.' },
      { code: 1, meaning: 'A shader file is missing or not its manifest pin, or the generated modules drifted.' },
      { code: 2, meaning: 'Invalid command line.' },
    ],
  };
  if (human) {
    process.stdout.write(`${help.command}: ${help.summary}\n\nUsage: ${help.usage}\n\n`);
    for (const option of OPTIONS) {
      process.stdout.write(`  ${option.flag}\n      ${option.description}\n`);
    }
    process.stdout.write('\n');
  } else {
    line('stdout', { _schema: schemaRef('help'), kind: 'help', ...help });
  }
  emitSchemas();
}

let parseJson = null;

function parseArgs(argv) {
  const modes = [];
  let repoRoot = SCRIPT_REPO_ROOT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check' || arg === '--write' || arg === '--schema' || arg === '--help') {
      modes.push(arg.slice(2));
    } else if (arg === '--human' || arg === '--humanize') {
      human = true;
    } else if (arg === '--repo-root') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_USAGE', '--repo-root needs a directory');
      }
      repoRoot = resolve(value);
      index += 1;
    } else {
      throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_USAGE', `unknown argument ${arg}`);
    }
  }
  if (modes.length !== 1) {
    throw new ShaderSourcesError(
      'GEORDI_E_BIJOU_SHADER_SOURCES_USAGE',
      'exactly one of --check, --write, --schema and --help is required',
    );
  }
  return { mode: modes[0], repoRoot };
}

function readSource(repoRoot, file) {
  return readRepoFile(repoRoot, `${SHADER_DIR}/${file}`);
}

function readRepoFile(repoRoot, path) {
  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) {
    throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_IO', `${path} does not exist`, [path]);
  }
  return readFileSync(absolute, 'utf8');
}

/** The digest the manifest pins for each embedded artifact, by file name. */
function manifestPins(manifestText) {
  const manifest = parseJson(manifestText);
  const surface = Array.isArray(manifest?.shaders) ? manifest.shaders.find((entry) => entry?.id === 'bijou-surface') : undefined;
  if (surface === undefined || !Array.isArray(surface.stages)) {
    throw new ShaderSourcesError(
      'GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH',
      `${SHADER_DIR}/${MANIFEST_FILE} has no bijou-surface shader entry`,
      [`${SHADER_DIR}/${MANIFEST_FILE}`],
    );
  }
  const pins = new Map();
  const base = (path) => String(path).split('/').at(-1);
  pins.set(base(surface.wgslPath), surface.assembledWgslSha256);
  for (const stage of surface.stages) {
    pins.set(base(stage.path), stage.sha256);
  }
  return { pins, generatedGlslSha256: surface.generatedGlslSha256, stageFiles: surface.stages.map((stage) => base(stage.path)) };
}

function framedSha256(stages) {
  const hash = createHash('sha256');
  for (const { file, text } of stages) {
    const bytes = Buffer.from(text, 'utf8');
    hash.update(`${file}\n${String(bytes.length)}\n`, 'utf8');
    hash.update(bytes);
  }
  return hash.digest('hex');
}

/** Read every embedded file and check it against the manifest. */
function verifiedSources(repoRoot) {
  const texts = new Map();
  for (const module of MODULES) {
    for (const entry of module.exports) {
      texts.set(entry.source, entry.repoPath === true ? readRepoFile(repoRoot, entry.source) : readSource(repoRoot, entry.source));
    }
  }
  const manifestText = texts.get(MANIFEST_FILE);
  const { pins, generatedGlslSha256, stageFiles } = manifestPins(manifestText);
  verifyTable(repoRoot, manifestText, texts.get(TABLE_FIXTURE));
  for (const [file, text] of texts) {
    if (file === TABLE_FIXTURE) {
      continue;
    }
    const path = `${SHADER_DIR}/${file}`;
    if (text.includes('\r')) {
      throw new ShaderSourcesError(
        'GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH',
        `${path} contains a carriage return; check the file out with LF line endings`,
        [path],
      );
    }
    if (file === MANIFEST_FILE) {
      continue;
    }
    const digest = sha256(text);
    if (digest !== pins.get(file)) {
      throw new ShaderSourcesError(
        'GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH',
        `${path} has SHA-256 ${digest}, not the manifest pin ${String(pins.get(file))}`,
        [path],
      );
    }
  }
  const framed = framedSha256(stageFiles.map((file) => ({ file, text: texts.get(file) })));
  if (framed !== generatedGlslSha256) {
    throw new ShaderSourcesError(
      'GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH',
      `framed GLSL SHA-256 ${framed} is not the manifest generatedGlslSha256 ${String(generatedGlslSha256)}`,
      stageFiles.map((file) => `${SHADER_DIR}/${file}`),
    );
  }
  verifyPinFile(repoRoot, manifestText);
  return texts;
}

/** The value the pin file declares for `key`: a number or a quoted string, or `undefined`. */
function pinFileValue(text, key) {
  const match = new RegExp(`\\b${key}: (?:'([^']*)'|(\\d+))`, 'u').exec(text);
  if (match === null) {
    return undefined;
  }
  return match[1] ?? Number(match[2]);
}

/**
 * Check the pin the presenters verify against, hand-written in
 * packages/bijou-gpu/src/surface-shader-pin.ts, against the manifest: the
 * assembled WGSL digest, the binding map, the uniform layout and the texture
 * formats. A stale pin would make the WebGPU presenter refuse the shader it
 * ships, or accept one it should not, so the gate fails until it is updated.
 */
function verifyPinFile(repoRoot, manifestText) {
  const fail = (detail) => {
    throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH', `${PIN_FILE}: ${detail}`, [PIN_FILE]);
  };
  const absolute = resolve(repoRoot, PIN_FILE);
  if (!existsSync(absolute)) {
    throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_IO', `${PIN_FILE} does not exist`, [PIN_FILE]);
  }
  const text = readFileSync(absolute, 'utf8');
  const surface = parseJson(manifestText).shaders.find((entry) => entry?.id === 'bijou-surface');
  const bindingOf = (wgslName) => surface.bindings?.find((binding) => binding?.wgslName === wgslName);
  const uniforms = bindingOf('surface');
  const cells = bindingOf('cells');
  const atlas = bindingOf('glyph_atlas');
  const expected = {
    assembledWgslSha256: surface.assembledWgslSha256,
    group: uniforms?.group,
    uniformBinding: uniforms?.binding,
    cellsBinding: cells?.binding,
    atlasBinding: atlas?.binding,
    uniformByteSize: uniforms?.byteSize,
    cellsTextureFormat: cells?.textureFormat,
    atlasTextureFormat: atlas?.textureFormat,
    ...Object.fromEntries((uniforms?.members ?? []).map((member) => [member.name, member.byteOffset])),
  };
  for (const [key, value] of Object.entries(expected)) {
    const pinned = pinFileValue(text, key);
    if (pinned !== value) {
      fail(`${key} is ${String(pinned)}, but the manifest says ${String(value)}`);
    }
  }
}

/** The repository path of an embedded file. */
function entryPath(entry) {
  return entry.repoPath === true ? entry.source : `${SHADER_DIR}/${entry.source}`;
}

/**
 * Read the procedural glyph table fixture and check it: LF only, and the
 * digest pinned by both the shader manifest and `PROCEDURAL_GLYPH_TABLE_SHA256`.
 */
function verifyTable(repoRoot, manifestText, text) {
  const fail = (message, paths) => {
    throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_PIN_MISMATCH', message, paths);
  };
  if (text.includes('\r')) {
    fail(`${TABLE_FIXTURE} contains a carriage return; check the file out with LF line endings`, [TABLE_FIXTURE]);
  }
  const digest = sha256(text);
  const manifestPin = parseJson(manifestText).proceduralTableSha256;
  if (digest !== manifestPin) {
    fail(`${TABLE_FIXTURE} has SHA-256 ${digest}, not the manifest pin ${String(manifestPin)}`, [TABLE_FIXTURE]);
  }
  const pinFile = resolve(repoRoot, TABLE_PIN_FILE);
  if (!existsSync(pinFile)) {
    throw new ShaderSourcesError('GEORDI_E_BIJOU_SHADER_SOURCES_IO', `${TABLE_PIN_FILE} does not exist`, [TABLE_PIN_FILE]);
  }
  const constant = /PROCEDURAL_GLYPH_TABLE_SHA256\s*=\s*'([0-9a-f]*)'/u.exec(readFileSync(pinFile, 'utf8'));
  if (constant === null || constant[1] !== digest) {
    fail(`${TABLE_PIN_FILE}: PROCEDURAL_GLYPH_TABLE_SHA256 is ${String(constant?.[1])}, but ${TABLE_FIXTURE} has SHA-256 ${digest}`, [
      TABLE_PIN_FILE,
    ]);
  }
}

function renderModule(module, texts) {
  const lines = [
    '// Generated by scripts/generate-bijou-gpu-shader-sources.mjs. Do not edit.',
    '// Regenerate with: node scripts/generate-bijou-gpu-shader-sources.mjs --write',
    '//',
    '// Each constant is the exact text of one checked-in file, as one string literal.',
  ];
  for (const entry of module.exports) {
    const text = texts.get(entry.source);
    lines.push(
      '',
      `/** \`${entryPath(entry)}\`, SHA-256 \`${sha256(text)}\`. */`,
      `export const ${entry.name} =`,
      `  ${stringify(text)};`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function run(mode, repoRoot) {
  const texts = verifiedSources(repoRoot);
  const generated = MODULES.map((module) => ({
    path: `${GENERATED_DIR}/${module.file}`,
    text: renderModule(module, texts),
  }));
  const drifted = [];
  for (const { path, text } of generated) {
    const absolute = resolve(repoRoot, path);
    const current = existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
    if (mode === 'check') {
      const state = current === null ? 'missing' : current === text ? 'match' : 'drift';
      if (state !== 'match') {
        drifted.push(path);
      }
      emitArtifact(mode, path, text, state);
    } else if (current === text) {
      emitArtifact(mode, path, text, 'unchanged');
    } else {
      mkdirSync(dirname(absolute), { recursive: true });
      const temporary = `${absolute}.${String(process.pid)}.tmp`;
      writeFileSync(temporary, text);
      renameSync(temporary, absolute);
      emitArtifact(mode, path, text, 'written');
    }
  }
  // The published copy of the table: byte-identical to the fixture.
  const copyText = texts.get(TABLE_FIXTURE);
  const copyAbsolute = resolve(repoRoot, TABLE_COPY);
  const copyCurrent = existsSync(copyAbsolute) ? readFileSync(copyAbsolute, 'utf8') : null;
  if (mode === 'check') {
    const state = copyCurrent === null ? 'missing' : copyCurrent === copyText ? 'match' : 'drift';
    if (state !== 'match') {
      drifted.push(TABLE_COPY);
    }
    emitArtifact(mode, TABLE_COPY, copyText, state);
  } else if (copyCurrent === copyText) {
    emitArtifact(mode, TABLE_COPY, copyText, 'unchanged');
  } else {
    mkdirSync(dirname(copyAbsolute), { recursive: true });
    const temporary = `${copyAbsolute}.${String(process.pid)}.tmp`;
    writeFileSync(temporary, copyText);
    renameSync(temporary, copyAbsolute);
    emitArtifact(mode, TABLE_COPY, copyText, 'written');
  }
  const generatedDir = resolve(repoRoot, GENERATED_DIR);
  const known = new Set(MODULES.map((module) => module.file));
  const strays = mode === 'check' && existsSync(generatedDir)
    ? readdirSync(generatedDir)
        .filter((name) => !known.has(name))
        .map((name) => `${GENERATED_DIR}/${name}`)
    : [];
  if (drifted.length > 0 || strays.length > 0) {
    throw new ShaderSourcesError(
      'GEORDI_E_BIJOU_SHADER_SOURCES_DRIFT',
      `bundled shader sources and table are stale: ${[...drifted, ...strays].join(', ')}. Run: node scripts/generate-bijou-gpu-shader-sources.mjs --write`,
      [...drifted, ...strays],
    );
  }
  if (human) {
    process.stdout.write(`ok: ${mode} of ${String(generated.length)} modules and 1 file copy from ${String(texts.size)} shader files\n`);
  } else {
    line('stdout', {
      _schema: schemaRef('result'),
      kind: 'result',
      mode,
      ok: true,
      artifacts: generated.length + 1,
      sources: texts.size,
    });
  }
}

try {
  human = process.argv.includes('--human') || process.argv.includes('--humanize');
  const core = await import('../packages/core/dist/index.js').catch(() => {
    throw new ShaderSourcesError(
      'GEORDI_E_BIJOU_SHADER_SOURCES_INTERNAL',
      'packages/core/dist is missing; build @flyingrobots/geordi-core first',
    );
  });
  stringify = (value) => core.stringifyCanonicalJson(value);
  parseJson = (text) => core.parseJsonValue(text);
  const { mode, repoRoot } = parseArgs(process.argv.slice(2));
  if (mode === 'help') {
    emitHelp();
  } else if (mode === 'schema') {
    emitSchemas();
  } else {
    run(mode, repoRoot);
  }
} catch (error) {
  emitError(error);
}
