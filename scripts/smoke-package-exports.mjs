import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { parseJsonValue } from '../packages/core/dist/index.js';

const checks = [
  {
    packageName: '@flyingrobots/geordi-core',
    packageDir: 'packages/core',
    exports: [
      'GEORDI_BASELINE_FEATURES',
      'GEORDI_CORE_PROFILE',
      'GEORDI_KNOWN_FEATURES',
      'GEORDI_MESH_FEATURES',
      'GEORDI_NUMERIC_PROFILE',
      'GEORDI_STRICT_TEXT_FEATURES',
      'isGeordiFeatureRequirement',
      'isGeordiScene',
      'isRectNode',
      'parseJsonValue',
    ],
  },
  {
    packageName: '@flyingrobots/geordi-compiler-core',
    packageDir: 'packages/compiler-core',
    exports: ['compile', 'deterministicId', 'hashString'],
  },
  {
    packageName: '@flyingrobots/geordi-schema-graphql',
    packageDir: 'packages/schema-graphql',
    exports: ['graphqlToCanonicalAst', 'geordiNodeDirective'],
  },
  {
    packageName: '@flyingrobots/geordi-runtime-webgl',
    packageDir: 'packages/runtime-webgl',
    exports: [
      'GEORDI_WEBGL_RUNTIME_PROFILE',
      'GeordiRuntimeUnsupportedProfileError',
      'GeordiWebGLRenderer',
      'assertSupportedRuntimeProfile',
      'renderGeordiToCanvas',
    ],
  },
  {
    packageName: '@flyingrobots/geordi-render-fixture',
    packageDir: 'packages/render-fixture',
    exports: [
      'RENDER_FIXTURE_ASCII_PLY_TRIANGLE_MESH_PROFILE',
      'RENDER_FIXTURE_MESH_ASSET_VERSION',
      'RENDER_FIXTURE_MESH_FIXTURE_VERSION',
      'RENDER_FIXTURE_STRICT_TEXT_SHAPING_PROFILE_TEXT_PREP_FINGERPRINT',
      'RENDER_FIXTURE_VERSION',
      'RenderFixtureInvalidMeshAssetManifestError',
      'RenderFixtureInvalidManifestError',
      'RenderFixturePlyHeaderError',
      'RenderFixturePixelProbeError',
      'assertRenderFixturePixelProbe',
      'parseRenderFixtureAsciiPlyTriangleMesh',
      'parseRenderFixtureMeshAssetManifest',
      'parseRenderFixtureMeshFixtureManifest',
      'parseRenderFixtureManifest',
      'validateRenderFixtureMeshAssetManifest',
      'validateRenderFixtureMeshFixtureManifest',
      'validateRenderFixtureManifest',
    ],
  },
  {
    packageName: '@flyingrobots/geordi-render-fixture/node',
    packageDir: 'packages/render-fixture',
    exportPath: './node',
    exports: [
      'RenderFixtureHashMismatchError',
      'assertRenderFixtureSha256',
      'renderFixtureSha256FromBytes',
    ],
  },
  {
    packageName: '@flyingrobots/geordi-gpvue',
    packageDir: 'packages/gpvue',
    exports: [
      'GpvueDuplicateNodeIdError',
      'GpvueUnsupportedConstructError',
      'compileGpvueSource',
    ],
  },
  {
    packageName: '@flyingrobots/geordi-text-prep',
    packageDir: 'packages/text-prep',
    exports: [
      'TEXT_PREP_GENERATION_PLAN_VERSION',
      'TEXT_PREP_INPUT_VERSION',
      'TextPrepValidationError',
      'createTextPrepStrictTextFixture',
      'prepareTextPrepArtifacts',
      'prepareTextPrepGenerationPlan',
      'serializeTextPrepStrictTextFixture',
      'validateTextPrepInput',
    ],
  },
  {
    packageName: '@flyingrobots/geordi-text-prep/cli',
    packageDir: 'packages/text-prep',
    exportPath: './cli',
    exports: ['runTextPrepCli'],
  },
  {
    packageName: '@flyingrobots/geordi-wesley-generator',
    packageDir: 'packages/wesley-generator',
    exports: ['GeordiGeneratorPlugin'],
  },
];

class PackageExportEntrypointMissingError extends Error {
  constructor(packageName) {
    super(`${packageName} has no public import entrypoint`);
    this.name = new.target.name;
  }
}

class PackageNamedExportMissingError extends Error {
  constructor(packageName, exportName) {
    super(`${packageName} is missing export ${exportName}`);
    this.name = new.target.name;
  }
}

class PackageJsonShapeError extends Error {
  constructor(packageName) {
    super(`${packageName} package.json must be a JSON object`);
    this.name = new.target.name;
  }
}

for (const check of checks) {
  const packageJson = parseJsonValue(await readFile(`${check.packageDir}/package.json`, 'utf8'));
  if (typeof packageJson !== 'object' || packageJson === null || Array.isArray(packageJson)) {
    throw new PackageJsonShapeError(check.packageName);
  }

  const exportPath = check.exportPath ?? '.';
  const exportConfig = packageJson.exports?.[exportPath];
  const importPath =
    typeof exportConfig === 'object' && exportConfig !== null
      ? exportConfig.import
      : exportPath === '.'
        ? packageJson.main
        : undefined;
  if (!importPath) {
    throw new PackageExportEntrypointMissingError(check.packageName);
  }

  const mod = await import(pathToFileURL(`${process.cwd()}/${check.packageDir}/${importPath}`).href);
  for (const exportName of check.exports) {
    if (!(exportName in mod)) {
      throw new PackageNamedExportMissingError(check.packageName, exportName);
    }
  }
}

process.stdout.write(`Imported ${checks.length} package entrypoints successfully.\n`);
