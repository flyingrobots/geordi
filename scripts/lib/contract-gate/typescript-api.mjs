// The public TypeScript API of a tree's published packages (flyingrobots/geordi#219).
//
// A published package is a `packages/*/package.json` without `"private": true`. Its public entry
// points are its `exports` subpaths (or `types`/`main` when it has no `exports`). Each entry
// point that names a declaration file is mapped back to the TypeScript source it is built from
// (`outDir` -> `rootDir` of the package's own tsconfig), and the TypeScript compiler's type
// checker reads the exports of that source: every exported name, whether it can be used as a
// value or only as a type, its kind, the signatures of functions and constructors, and the
// members of interfaces, classes and object types, with inferred types written out.
//
// The base and the head are read by this same code. Module resolution is what makes the base
// honest: an import of a workspace package (`@flyingrobots/geordi-core`, or a subpath of one)
// resolves to that package's source in the SAME tree, through that tree's own package.json
// `exports`, never to the head's sources or to a built `dist/`. Every other bare import (a
// third-party package, `@types/*`, `vitest/globals`) resolves from the dependencies installed for
// the repository that runs the gate, as if imported from the same package directory there. A
// third-party resolution that leaves `node_modules` is refused, so a workspace symlink cannot
// smuggle the head's sources into the base. No network, no install, no build.
//
// Output is a Map: package directory -> { name, version, entries, exports }. Every string in it
// is free of absolute paths, and every collection is sorted, so the snapshot does not depend on
// where the tree lives, on file-system order, or on line endings.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

import { ContractGateError } from './errors.mjs';
import { ContractGateJsonError, parseJson, stringifyJson } from './json.mjs';

export const PACKAGES_DIR = 'packages';

const PROBE_NAME = '__contract_gate_probe__.ts';

function snapshotError(message, paths = []) {
  return new ContractGateError('GEORDI_E_CONTRACT_GATE_SNAPSHOT', message, paths);
}

let loaded = null;

/** The TypeScript compiler installed for the repository that runs the gate. */
function typescript(installRoot) {
  if (loaded?.root === installRoot) {
    return loaded.ts;
  }
  let ts;
  try {
    ts = createRequire(join(installRoot, 'package.json'))('typescript');
  } catch (error) {
    throw snapshotError(
      `cannot load the TypeScript compiler from ${installRoot}/node_modules for the TypeScript API snapshot; run pnpm install --frozen-lockfile first: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  loaded = { root: installRoot, ts };
  return ts;
}

function readManifest(tree, path) {
  const text = tree.text(path);
  if (text === null) {
    return null;
  }
  try {
    return parseJson(text);
  } catch (error) {
    if (error instanceof ContractGateJsonError) {
      throw snapshotError(`${tree.description}: ${path} is not JSON: ${error.message}`, [path]);
    }
    throw error;
  }
}

/** Every workspace package of a tree in a directory (default packages/), sorted by directory. */
export function workspacePackages(tree, directory = PACKAGES_DIR) {
  const root = tree.absolute(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }
  const packages = [];
  for (const name of readdirSync(root).sort()) {
    const dir = `${directory}/${name}`;
    const manifest = readManifest(tree, `${dir}/package.json`);
    if (manifest === null) {
      continue;
    }
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw snapshotError(`${tree.description}: ${dir}/package.json has no name`, [`${dir}/package.json`]);
    }
    packages.push({ dir, name: manifest.name, version: typeof manifest.version === 'string' ? manifest.version : null, private: manifest.private === true, manifest });
  }
  return packages;
}

/** The workspace packages a tree publishes: those not marked `"private": true`. */
export function publishedPackages(tree, directory = PACKAGES_DIR) {
  return workspacePackages(tree, directory).filter((pkg) => !pkg.private);
}

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

/** The `types` target of an export condition object, or its import/default target. */
function conditionTargets(value) {
  if (typeof value === 'string') {
    return { types: null, runtime: value };
  }
  if (Array.isArray(value)) {
    return conditionTargets(value[0] ?? null);
  }
  if (typeof value !== 'object' || value === null) {
    return { types: null, runtime: null };
  }
  let types = typeof value.types === 'string' ? value.types : null;
  let runtime = null;
  for (const [condition, target] of Object.entries(value)) {
    if (condition === 'types') {
      continue;
    }
    const inner = conditionTargets(target);
    types ??= inner.types;
    runtime ??= inner.runtime;
  }
  return { types, runtime };
}

/**
 * The entry points of a package manifest: subpath -> { types, runtime } with the targets as
 * written. A package with no `exports` has one entry, `.`, from `types` (or `typings`) and `main`.
 */
function entryPoints(manifest) {
  const entries = new Map();
  const { exports } = manifest;
  if (exports === undefined) {
    const types = typeof manifest.types === 'string' ? manifest.types : typeof manifest.typings === 'string' ? manifest.typings : null;
    const runtime = typeof manifest.main === 'string' ? manifest.main : null;
    if (types !== null || runtime !== null) {
      entries.set('.', { types, runtime });
    }
    return entries;
  }
  const isSubpathMap = typeof exports === 'object' && exports !== null && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith('.'));
  if (!isSubpathMap) {
    entries.set('.', conditionTargets(exports));
    return entries;
  }
  for (const subpath of Object.keys(exports).sort()) {
    entries.set(subpath, conditionTargets(exports[subpath]));
  }
  return entries;
}

function stripDotSlash(path) {
  return path.replace(/^\.\//u, '');
}

/** A declaration-file target (`./dist/x.d.ts`) mapped to its source under the config's rootDir. */
function declarationSource(tree, pkg, target, layout) {
  if (target === null || target.includes('*')) {
    return null;
  }
  const declaration = /^(.*)\.d\.(ts|mts|cts)$/u.exec(stripDotSlash(target));
  const javascript = /^(.*)\.(js|mjs|cjs)$/u.exec(stripDotSlash(target));
  const stem = declaration?.[1] ?? javascript?.[1] ?? null;
  if (stem === null) {
    return null;
  }
  const outDir = stripDotSlash(layout.outDir).replace(/\/$/u, '');
  const rootDir = stripDotSlash(layout.rootDir).replace(/\/$/u, '');
  const inside = outDir === '' ? stem : stem.startsWith(`${outDir}/`) ? stem.slice(outDir.length + 1) : null;
  if (inside === null) {
    return null;
  }
  const base = rootDir === '' ? inside : `${rootDir}/${inside}`;
  for (const extension of ['.ts', '.tsx', '.mts', '.cts']) {
    const path = `${pkg.dir}/${base}${extension}`;
    if (tree.bytes(path) !== null) {
      return path;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Compiler configuration, read from the tree
// ---------------------------------------------------------------------------------------------

/** The tsconfig files a package builds its declarations with: tsconfig.json, then `tsc -p` ones. */
function buildConfigs(tree, pkg) {
  const configs = [];
  if (tree.bytes(`${pkg.dir}/tsconfig.json`) !== null) {
    configs.push(`${pkg.dir}/tsconfig.json`);
  }
  const build = typeof pkg.manifest.scripts?.build === 'string' ? pkg.manifest.scripts.build : '';
  for (const match of build.matchAll(/\btsc\b[^&|;]*?(?:-p|--project)\s+(\S+)/gu)) {
    const path = `${pkg.dir}/${stripDotSlash(match[1])}`;
    if (!configs.includes(path) && tree.bytes(path) !== null) {
      configs.push(path);
    }
  }
  return configs;
}

function parseConfig(ts, tree, path) {
  const absolute = tree.absolute(path);
  const read = ts.readConfigFile(absolute, (file) => readFileSync(file, 'utf8'));
  if (read.error !== undefined) {
    throw snapshotError(`${tree.description}: cannot read ${path}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`, [path]);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(absolute), undefined, absolute);
  const errors = parsed.errors.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.code !== 18003);
  if (errors.length > 0) {
    throw snapshotError(`${tree.description}: ${path} is invalid: ${errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('; ')}`, [path]);
  }
  return { path, options: parsed.options, fileNames: new Set(parsed.fileNames.map((file) => file.split(sep).join('/'))) };
}

function layoutOf(tree, pkg, config) {
  const toRelative = (option, fallback) => (option === undefined ? fallback : relative(tree.absolute(pkg.dir), option).split(sep).join('/'));
  return { outDir: toRelative(config?.options.outDir, '.'), rootDir: toRelative(config?.options.rootDir, '.') };
}

// ---------------------------------------------------------------------------------------------
// Module resolution: workspace packages to this tree's sources, the rest to the installed deps
// ---------------------------------------------------------------------------------------------

function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

class Resolver {
  constructor(ts, tree, installRoot, packages) {
    this.ts = ts;
    this.tree = tree;
    this.treeRoot = tree.dir;
    this.installRoot = installRoot;
    this.byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    this.packages = packages;
    this.problems = [];
    this.layouts = new Map();
  }

  /** Whether a path is one of the tree's own files (not an installed dependency). */
  inTree(file) {
    const inside = relative(this.treeRoot, file);
    return inside !== '' && !inside.startsWith('..') && !inside.split(sep).includes('node_modules');
  }

  /** The directory in the installed repository that a tree file's bare imports resolve from. */
  installDirFor(file) {
    const inside = relative(this.treeRoot, file).split(sep).join('/');
    const pkg = this.packages.find((candidate) => inside.startsWith(`${candidate.dir}/`));
    if (pkg !== undefined) {
      const dir = join(this.installRoot, ...pkg.dir.split('/'));
      if (existsSync(join(dir, 'package.json'))) {
        return dir;
      }
    }
    return this.installRoot;
  }

  layout(pkg) {
    if (!this.layouts.has(pkg.dir)) {
      const path = `${pkg.dir}/tsconfig.json`;
      const config = this.tree.bytes(path) === null ? null : parseConfig(this.ts, this.tree, path);
      this.layouts.set(pkg.dir, layoutOf(this.tree, pkg, config));
    }
    return this.layouts.get(pkg.dir);
  }

  workspaceSource(specifier) {
    const pkg = this.byName.get(packageNameOf(specifier));
    if (pkg === undefined) {
      return undefined;
    }
    const subpath = specifier === pkg.name ? '.' : `.${specifier.slice(pkg.name.length)}`;
    const entry = entryPoints(pkg.manifest).get(subpath);
    const source = entry === undefined ? null : declarationSource(this.tree, pkg, entry.types ?? entry.runtime, this.layout(pkg));
    if (source === null) {
      this.problems.push(`${specifier} is a workspace package of this tree, but ${pkg.dir}/package.json exports no TypeScript source for ${subpath}`);
      return null;
    }
    return this.tree.absolute(source);
  }

  resolveModule(specifier, containingFile, options, host, mode) {
    const { ts } = this;
    const fromTree = this.inTree(containingFile);
    if (fromTree && !specifier.startsWith('.') && !specifier.startsWith('/')) {
      const workspace = this.workspaceSource(specifier);
      if (workspace === null) {
        return { resolvedModule: undefined };
      }
      if (workspace !== undefined) {
        return { resolvedModule: { resolvedFileName: workspace, extension: ts.extensionFromPath(workspace), isExternalLibraryImport: false } };
      }
      const linked = this.linkedOutsideNodeModules(specifier, containingFile);
      if (linked !== null) {
        this.problems.push(`${specifier} resolves outside node_modules (${linked}), so it is not an installed dependency: the installed repository links that name to workspace sources, which are not this tree's`);
        return { resolvedModule: undefined };
      }
      const from = join(this.installDirFor(containingFile), PROBE_NAME);
      const resolved = ts.resolveModuleName(specifier, from, options, host, undefined, undefined, mode);
      const file = resolved.resolvedModule?.resolvedFileName;
      if (file !== undefined) {
        const real = realpathSync(file);
        if (!real.split(sep).includes('node_modules')) {
          this.problems.push(`${specifier} resolves outside node_modules (${relative(this.installRoot, real).split(sep).join('/')}), so it is not an installed dependency; a workspace package must be imported by its package name`);
          return { resolvedModule: undefined };
        }
      }
      return resolved;
    }
    return ts.resolveModuleName(specifier, containingFile, options, host, undefined, undefined, mode);
  }

  /**
   * Where the installed node_modules directory of a bare specifier's package links outside any
   * node_modules (a workspace symlink), as a path relative to the install root; otherwise null.
   */
  linkedOutsideNodeModules(specifier, containingFile) {
    const name = packageNameOf(specifier);
    let dir = this.installDirFor(containingFile);
    for (;;) {
      const candidate = join(dir, 'node_modules', ...name.split('/'));
      if (existsSync(candidate)) {
        const real = realpathSync(candidate);
        return real.split(sep).includes('node_modules') ? null : relative(this.installRoot, real).split(sep).join('/');
      }
      if (dir === this.installRoot || dirname(dir) === dir) {
        return null;
      }
      dir = dirname(dir);
    }
  }

  resolveTypeReference(name, containingFile, options, host, mode) {
    const from = this.inTree(containingFile) || !existsSync(dirname(containingFile)) ? join(this.installDirFor(containingFile), PROBE_NAME) : containingFile;
    return this.ts.resolveTypeReferenceDirective(name, from, { ...options, typeRoots: this.typeRoots(containingFile) }, host, undefined, undefined, mode);
  }

  typeRoots(containingFile) {
    const roots = [];
    for (const dir of [this.installDirFor(containingFile), this.installRoot]) {
      const types = join(dir, 'node_modules', '@types');
      if (existsSync(types) && !roots.includes(types)) {
        roots.push(types);
      }
    }
    return roots;
  }
}

// ---------------------------------------------------------------------------------------------
// The program for one package and one tsconfig
// ---------------------------------------------------------------------------------------------

const sourceFileCache = new Map();

function createHost(ts, options, resolver, probes) {
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreate) => {
    if (probes.has(fileName)) {
      return ts.createSourceFile(fileName, probes.get(fileName), languageVersionOrOptions, true);
    }
    const version = typeof languageVersionOrOptions === 'object' ? `${String(languageVersionOrOptions.languageVersion)}:${String(languageVersionOrOptions.impliedNodeFormat)}` : String(languageVersionOrOptions);
    const key = `${fileName}\0${version}`;
    // Files outside the tree (the TypeScript lib files, installed declarations) are the same for
    // every program of a run; parse them once.
    if (!resolver.inTree(fileName) && sourceFileCache.has(key)) {
      return sourceFileCache.get(key);
    }
    const file = getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate);
    if (!resolver.inTree(fileName) && file !== undefined) {
      sourceFileCache.set(key, file);
    }
    return file;
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => probes.has(fileName) || fileExists(fileName);
  const readFile = host.readFile.bind(host);
  host.readFile = (fileName) => probes.get(fileName) ?? readFile(fileName);
  host.resolveModuleNameLiterals = (literals, containingFile, _redirected, compilerOptions, containingSourceFile) =>
    literals.map((literal) => resolver.resolveModule(literal.text, containingFile, compilerOptions, host, ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions)));
  host.resolveTypeReferenceDirectiveReferences = (references, containingFile, _redirected, compilerOptions, containingSourceFile) =>
    references.map((reference) => {
      const name = typeof reference === 'string' ? reference : reference.fileName.toLowerCase();
      const mode = typeof reference === 'string' || containingSourceFile === undefined ? undefined : ts.getModeForFileReference(reference, containingSourceFile.impliedNodeFormat);
      return resolver.resolveTypeReference(name, containingFile, compilerOptions, host, mode);
    });
  return host;
}

/**
 * Options that only steer emit or project builds, or that would redirect module resolution away
 * from this tree's own workspace sources (`paths`, `baseUrl`, `rootDirs`).
 */
const DROPPED_OPTIONS = new Set(['rootDir', 'outDir', 'declarationDir', 'tsBuildInfoFile', 'paths', 'baseUrl', 'rootDirs', 'composite', 'incremental', 'declaration', 'declarationMap', 'sourceMap', 'inlineSourceMap', 'emitDeclarationOnly', 'build']);

function programOptions(ts, config, resolver, pkgDir) {
  const options = Object.fromEntries(Object.entries(config.options).filter(([key]) => !DROPPED_OPTIONS.has(key)));
  options.noEmit = true;
  options.skipLibCheck = true;
  options.typeRoots = resolver.typeRoots(join(pkgDir, PROBE_NAME));
  // A probe file sits beside each entry source; it must not trip the package's own lint flags.
  options.noUnusedLocals = false;
  options.noUnusedParameters = false;
  if (options.moduleResolution === undefined) {
    options.moduleResolution = ts.ModuleResolutionKind.Bundler;
  }
  return options;
}

function diagnosticText(ts, diagnostic, treeRoot, installRoot) {
  const where =
    diagnostic.file === undefined
      ? ''
      : `${normalisePath(diagnostic.file.fileName, treeRoot, installRoot)}:${String(diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1)}: `;
  const message = typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText;
  return `${where}TS${String(diagnostic.code)} ${normaliseText(message, treeRoot, installRoot).replaceAll(treeRoot, '<tree>').replaceAll(installRoot, '<install>')}`;
}

// ---------------------------------------------------------------------------------------------
// Normalised text
// ---------------------------------------------------------------------------------------------

function normalisePath(file, treeRoot, installRoot) {
  const posix = file.split(sep).join('/');
  const modules = posix.lastIndexOf('/node_modules/');
  if (modules !== -1) {
    return posix.slice(modules + '/node_modules/'.length);
  }
  for (const root of [treeRoot, installRoot]) {
    const inside = relative(root, file);
    if (!inside.startsWith('..') && inside !== file) {
      return inside.split(sep).join('/');
    }
  }
  return posix;
}

function normaliseText(text, treeRoot, installRoot) {
  return text.replace(/import\("([^"]+)"\)/gu, (_match, path) => `import("${path.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(path) ? normalisePath(path, treeRoot, installRoot) : path}")`);
}

// ---------------------------------------------------------------------------------------------
// Reading the exports of an entry point
// ---------------------------------------------------------------------------------------------

class Reader {
  constructor(ts, checker, treeRoot, installRoot) {
    this.ts = ts;
    this.checker = checker;
    this.treeRoot = treeRoot;
    this.installRoot = installRoot;
    const flags = ts.NodeBuilderFlags;
    this.nodeFlags = flags.NoTruncation | flags.UseAliasDefinedOutsideCurrentScope | flags.WriteTypeArgumentsOfSignature | flags.IgnoreErrors;
    this.printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
    this.scratch = ts.createSourceFile('contract-gate-print.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  }

  print(node) {
    return this.printer.printNode(this.ts.EmitHint.Unspecified, node, this.scratch).replace(/\s*\n\s*/gu, ' ');
  }

  /**
   * A type as text, with the members of every union sorted. The checker orders a union by the
   * order its member types were created, which depends on what else the program contains; two
   * trees with the same declaration could otherwise print `1 | 2` and `2 | 1`.
   */
  typeText(type, extraFlags = 0) {
    const { ts } = this;
    const node = this.checker.typeToTypeNode(type, undefined, this.nodeFlags | extraFlags);
    if (node === undefined) {
      return this.text(this.checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation));
    }
    const sortUnions = (context) => {
      const visit = (child) => {
        const visited = ts.visitEachChild(child, visit, context);
        if (ts.isUnionTypeNode(visited)) {
          const members = visited.types.map((member) => ({ member, text: this.print(member) })).sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
          return ts.factory.updateUnionTypeNode(visited, ts.factory.createNodeArray(members.map((entry) => entry.member)));
        }
        return visited;
      };
      return (root) => ts.visitNode(root, visit);
    };
    const result = ts.transform(node, [sortUnions]);
    const text = this.print(result.transformed[0]);
    result.dispose();
    return this.text(text);
  }

  text(value) {
    return normaliseText(value, this.treeRoot, this.installRoot);
  }

  type(type) {
    return this.typeText(type);
  }

  typeParameters(parameters) {
    if (parameters === undefined || parameters.length === 0) {
      return '';
    }
    const each = parameters.map((parameter) => {
      const constraint = parameter.getConstraint();
      const fallback = parameter.getDefault();
      return `${parameter.symbol.name}${constraint === undefined ? '' : ` extends ${this.type(constraint)}`}${fallback === undefined ? '' : ` = ${this.type(fallback)}`}`;
    });
    return `<${each.join(', ')}>`;
  }

  /** A signature with parameter names left out: they are not part of the API. */
  signature(signature) {
    const { ts, checker } = this;
    const parameters = [];
    if (signature.thisParameter !== undefined) {
      parameters.push(`this: ${this.type(checker.getTypeOfSymbol(signature.thisParameter))}`);
    }
    for (const parameter of signature.getParameters()) {
      const declaration = parameter.valueDeclaration;
      const rest = declaration !== undefined && ts.isParameter(declaration) && declaration.dotDotDotToken !== undefined;
      const optional = declaration !== undefined && ts.isParameter(declaration) && checker.isOptionalParameter(declaration);
      parameters.push(`${rest ? '...' : ''}${optional ? '?' : ''}${this.type(checker.getTypeOfSymbol(parameter))}`);
    }
    const predicate = checker.getTypePredicateOfSignature(signature);
    let returns;
    if (predicate !== undefined) {
      const subject = predicate.parameterIndex === undefined ? 'this' : `$${String(predicate.parameterIndex)}`;
      const asserts = predicate.kind === ts.TypePredicateKind.AssertsThis || predicate.kind === ts.TypePredicateKind.AssertsIdentifier ? 'asserts ' : '';
      returns = `${asserts}${subject}${predicate.type === undefined ? '' : ` is ${this.type(predicate.type)}`}`;
    } else {
      returns = this.type(checker.getReturnTypeOfSignature(signature));
    }
    return `${this.typeParameters(signature.getTypeParameters())}(${parameters.join(', ')}) => ${returns}`;
  }

  signatures(type, kind) {
    return this.checker.getSignaturesOfType(type, kind).map((signature) => this.signature(signature));
  }

  /** Public members of an object type: name -> { optional, readonly, method, text }. */
  members(type, owner) {
    const { ts, checker } = this;
    const members = new Map();
    for (const property of checker.getPropertiesOfType(type)) {
      const name = property.name;
      if (name.startsWith('__#') || name === 'prototype') {
        continue;
      }
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const modifiers = declaration === undefined ? 0 : ts.getCombinedModifierFlags(declaration);
      if ((modifiers & ts.ModifierFlags.Private) !== 0 || (declaration !== undefined && declaration.name !== undefined && ts.isPrivateIdentifier(declaration.name))) {
        continue;
      }
      const flags = property.flags;
      const optional = (flags & ts.SymbolFlags.Optional) !== 0;
      const accessorOnly = (flags & ts.SymbolFlags.GetAccessor) !== 0 && (flags & ts.SymbolFlags.SetAccessor) === 0;
      const readonly = (modifiers & ts.ModifierFlags.Readonly) !== 0 || accessorOnly;
      const method = (flags & ts.SymbolFlags.Method) !== 0;
      const protectedMember = (modifiers & ts.ModifierFlags.Protected) !== 0;
      const memberType = checker.getTypeOfSymbol(property);
      const body = method ? this.signatures(memberType, ts.SignatureKind.Call).join('; ') : this.type(memberType);
      const text = `${protectedMember ? 'protected ' : ''}${readonly ? 'readonly ' : ''}${method ? 'method ' : ''}${name}${optional ? '?' : ''}: ${body}`;
      members.set(name, { optional, readonly, method, owner, text });
    }
    for (const info of checker.getIndexInfosOfType(type)) {
      const key = `[${this.type(info.keyType)}]`;
      members.set(key, { optional: true, readonly: info.isReadonly, method: false, owner, text: `${info.isReadonly ? 'readonly ' : ''}${key}: ${this.type(info.type)}` });
    }
    return members;
  }

  /** Whether an alias type is an object type whose members can be compared one by one. */
  decomposable(type) {
    const { ts } = this;
    if ((type.flags & ts.TypeFlags.Object) === 0) {
      return false;
    }
    const objectFlags = type.objectFlags ?? 0;
    return (objectFlags & ts.ObjectFlags.Mapped) === 0 && (objectFlags & (ts.ObjectFlags.Anonymous | ts.ObjectFlags.Interface | ts.ObjectFlags.Reference)) !== 0;
  }

  variableKind(symbol) {
    const { ts } = this;
    const declaration = symbol.valueDeclaration;
    if (declaration !== undefined && ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)) {
      const flags = declaration.parent.flags;
      return (flags & ts.NodeFlags.Const) !== 0 ? 'const' : (flags & ts.NodeFlags.Let) !== 0 ? 'let' : 'var';
    }
    return 'variable';
  }

  /**
   * One export: its kind, whether it is exported type-only (a value that the entry point lets
   * consumers use only as a type), signatures, members, and the text of the rest.
   */
  describe(symbol, typeOnly) {
    const { ts, checker } = this;
    const flags = symbol.flags;
    const kinds = [];
    const item = { kind: '', typeOnly, typeParameters: '', text: null, calls: [], constructs: [], members: new Map(), statics: new Map() };
    if ((flags & ts.SymbolFlags.Class) !== 0) {
      const declaration = symbol.declarations?.find((node) => ts.isClassDeclaration(node) || ts.isClassExpression(node));
      kinds.push(declaration !== undefined && (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Abstract) !== 0 ? 'abstract class' : 'class');
      const instance = checker.getDeclaredTypeOfSymbol(symbol);
      item.typeParameters = this.typeParameters(instance.typeParameters);
      const statics = checker.getTypeOfSymbol(symbol);
      item.constructs = this.signatures(statics, ts.SignatureKind.Construct);
      item.members = this.members(instance, 'class');
      item.statics = this.members(statics, 'class');
    } else if ((flags & ts.SymbolFlags.Interface) !== 0) {
      kinds.push('interface');
      const declared = checker.getDeclaredTypeOfSymbol(symbol);
      item.typeParameters = this.typeParameters(declared.typeParameters);
      item.calls = this.signatures(declared, ts.SignatureKind.Call);
      item.constructs = this.signatures(declared, ts.SignatureKind.Construct);
      item.members = this.members(declared, 'interface');
    } else if ((flags & ts.SymbolFlags.TypeAlias) !== 0) {
      kinds.push('type');
      const declared = checker.getDeclaredTypeOfSymbol(symbol);
      const parameters = checker.getTypeAliasTypeParameters?.(symbol) ?? symbol.declarations?.find((node) => ts.isTypeAliasDeclaration(node))?.typeParameters?.map((node) => checker.getTypeAtLocation(node));
      item.typeParameters = this.typeParameters(parameters);
      if (this.decomposable(declared) && checker.getSignaturesOfType(declared, ts.SignatureKind.Call).length === 0) {
        item.constructs = this.signatures(declared, ts.SignatureKind.Construct);
        item.members = this.members(declared, 'type');
      } else {
        item.text = this.typeText(declared, ts.NodeBuilderFlags.InTypeAlias);
      }
    }
    if ((flags & ts.SymbolFlags.Enum) !== 0) {
      kinds.push((flags & ts.SymbolFlags.ConstEnum) !== 0 ? 'const enum' : 'enum');
      for (const member of checker.getExportsOfModule(symbol)) {
        const declaration = member.valueDeclaration;
        const constant = declaration !== undefined && ts.isEnumMember(declaration) ? checker.getConstantValue(declaration) : undefined;
        item.members.set(member.name, { optional: false, readonly: true, method: false, owner: 'enum', text: `${member.name} = ${constant === undefined ? 'computed' : stringifyJson(constant)}` });
      }
    }
    if ((flags & ts.SymbolFlags.Function) !== 0) {
      kinds.push('function');
      item.calls = this.signatures(checker.getTypeOfSymbol(symbol), ts.SignatureKind.Call);
    }
    if ((flags & ts.SymbolFlags.Variable) !== 0) {
      kinds.push(this.variableKind(symbol));
      const text = this.type(checker.getTypeOfSymbol(symbol));
      // A type alias merged with a const keeps both: the alias's text, then the value's type.
      item.text = item.text === null ? text : `${item.text}; value: ${text}`;
    }
    if ((flags & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0 && kinds.length === 0) {
      kinds.push('namespace');
    }
    if (kinds.length === 0) {
      kinds.push('unknown');
      item.text = this.type(checker.getTypeOfSymbol(symbol));
    }
    item.kind = kinds.join(' + ');
    return item;
  }
}

/** The export names of a module that cannot be used as values: decided by the checker itself. */
function probeSource(entryFile, probeFile, names) {
  // The probe sits beside the entry source; `./x.js` names `./x.ts` under every resolution mode.
  let from = relative(dirname(probeFile), entryFile).split(sep).join('/').replace(/\.(m|c)?tsx?$/u, (extension) => extension.replace('ts', 'js').replace('x', ''));
  if (!from.startsWith('.')) {
    from = `./${from}`;
  }
  return [`import * as entry from ${stringifyJson(from)};`, ...names.map((name) => `void entry[${stringifyJson(name)}];`), ''].join('\n');
}

function readEntry(ts, program, reader, entryFile, probeFile, names, entryLabel, problems) {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) {
    problems.push(`${entryLabel} is not a module`);
    return new Map();
  }
  const typeOnly = new Set();
  const probe = program.getSourceFile(probeFile);
  for (const diagnostic of program.getSemanticDiagnostics(probe)) {
    const line = probe.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line;
    if (line === 0) {
      problems.push(`the probe cannot import ${entryLabel}: TS${String(diagnostic.code)} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    } else {
      typeOnly.add(names[line - 1]);
    }
  }
  const exports = new Map();
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const target = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    exports.set(symbol.name, reader.describe(target, (target.flags & ts.SymbolFlags.Value) !== 0 && typeOnly.has(symbol.name)));
  }
  return exports;
}

function valueCandidates(ts, program, entryFile) {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) {
    return [];
  }
  return checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => {
      const target = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
      return (target.flags & ts.SymbolFlags.Value) !== 0;
    })
    .map((symbol) => symbol.name)
    .sort();
}

// ---------------------------------------------------------------------------------------------
// The snapshot of a tree
// ---------------------------------------------------------------------------------------------

/**
 * The public TypeScript API of each of `dirs` (package directories) in a tree, computed from
 * the tree's own sources. Fails closed with GEORDI_E_CONTRACT_GATE_SNAPSHOT when a package's
 * API cannot be read exactly: a module that does not resolve, an entry with no source, or a
 * compiler error in the program.
 */
export function typescriptApis(tree, dirs, installRoot) {
  const result = new Map();
  if (dirs.length === 0) {
    return result;
  }
  const ts = typescript(installRoot);
  const packages = workspacePackages(tree);
  for (const dir of [...dirs].sort()) {
    const pkg = packages.find((candidate) => candidate.dir === dir);
    if (pkg === undefined) {
      throw snapshotError(`${tree.description}: ${dir}/package.json does not exist`, [`${dir}/package.json`]);
    }
    result.set(dir, packageApi(ts, tree, pkg, packages, installRoot));
  }
  return result;
}

function packageApi(ts, tree, pkg, packages, installRoot) {
  const resolver = new Resolver(ts, tree, installRoot, packages);
  const configs = buildConfigs(tree, pkg).map((path) => parseConfig(ts, tree, path));
  const layout = layoutOf(tree, pkg, configs[0] ?? null);
  const entries = new Map();
  const jobs = new Map();
  for (const [subpath, targets] of entryPoints(pkg.manifest)) {
    const source = declarationSource(tree, pkg, targets.types ?? targets.runtime, layout);
    if (source === null) {
      if (targets.types !== null) {
        throw snapshotError(
          `${tree.description}: ${pkg.dir}/package.json exports ${subpath} with types ${targets.types}, which maps to no TypeScript source under the package's rootDir`,
          [`${pkg.dir}/package.json`],
        );
      }
      entries.set(subpath, { typescript: false, target: targets.runtime ?? 'null' });
      continue;
    }
    const absolute = tree.absolute(source);
    const config = configs.find((candidate) => candidate.fileNames.has(absolute.split(sep).join('/')));
    if (config === undefined) {
      throw snapshotError(
        `${tree.description}: ${source}, the source of ${pkg.name} ${subpath}, is in none of the tsconfig files the package builds with (${configs.map((candidate) => candidate.path).join(', ') || 'none'})`,
        [source],
      );
    }
    entries.set(subpath, { typescript: true, target: 'typescript' });
    const list = jobs.get(config.path) ?? { config, entries: [] };
    list.entries.push({ subpath, source, absolute });
    jobs.set(config.path, list);
  }
  const exports = new Map();
  for (const { config, entries: jobEntries } of [...jobs.values()].sort((a, b) => (a.config.path < b.config.path ? -1 : 1))) {
    readProgram(ts, tree, pkg, resolver, installRoot, config, jobEntries, exports);
  }
  return { name: pkg.name, version: pkg.version, entries, exports: new Map([...exports].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
}

/** Read the entries of one package that build with one tsconfig into `exports`. */
function readProgram(ts, tree, pkg, resolver, installRoot, config, jobEntries, exports) {
  const options = programOptions(ts, config, resolver, tree.absolute(pkg.dir));
  // First pass: which exports have a value meaning. Second pass: probe each, then read.
  const plain = ts.createProgram({ rootNames: jobEntries.map((entry) => entry.absolute), options, host: createHost(ts, options, resolver, new Map()) });
  failOnErrors(ts, tree, pkg, plain, resolver, installRoot, config.path);
  const probes = new Map();
  const names = new Map();
  jobEntries.forEach((entry, index) => {
    const probeFile = join(dirname(entry.absolute), `__contract_gate_probe_${String(index)}__.ts`);
    const candidates = valueCandidates(ts, plain, entry.absolute);
    names.set(entry.subpath, { probeFile, candidates });
    probes.set(probeFile, probeSource(entry.absolute, probeFile, candidates));
  });
  const program = ts.createProgram({ rootNames: [...jobEntries.map((entry) => entry.absolute), ...probes.keys()], options, host: createHost(ts, options, resolver, probes), oldProgram: plain });
  const reader = new Reader(ts, program.getTypeChecker(), tree.dir, installRoot);
  const problems = [];
  for (const entry of jobEntries) {
    const { probeFile, candidates } = names.get(entry.subpath);
    for (const [name, item] of readEntry(ts, program, reader, entry.absolute, probeFile, candidates, `${pkg.name} ${entry.subpath}`, problems)) {
      exports.set(exportKey(entry.subpath, name), item);
    }
  }
  if (problems.length > 0) {
    throw snapshotError(`${tree.description}: cannot read the TypeScript API of ${pkg.name}: ${problems.join('; ')}`, [pkg.dir]);
  }
}

/** `name` for the root entry point, `./sub:name` for a subpath export. */
export function exportKey(subpath, name) {
  return subpath === '.' ? name : `${subpath}:${name}`;
}

function failOnErrors(ts, tree, pkg, program, resolver, installRoot, configPath) {
  const diagnostics = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics(), ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  const problems = [...resolver.problems, ...diagnostics.slice(0, 8).map((diagnostic) => diagnosticText(ts, diagnostic, tree.dir, installRoot))];
  if (problems.length > 0) {
    const more = diagnostics.length > 8 ? ` (and ${String(diagnostics.length - 8)} more)` : '';
    throw snapshotError(
      `${tree.description}: the TypeScript API of ${pkg.name} cannot be computed exactly, because its program (${configPath}, workspace packages resolved to this tree's sources) has errors: ${problems.join('; ')}${more}`,
      [pkg.dir],
    );
  }
}
