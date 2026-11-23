// The two trees the contract gate compares: where they come from, and how their files are read.
//
// A tree is a directory. A git revision is materialised into a cache directory blob by blob
// (`git ls-tree` and `git cat-file --batch`), so the base is always the exact committed bytes of
// the merge base: no file the pull request could have edited, and none of the transformations
// `git archive` applies (`export-ignore`, `export-subst`). The head is the working tree by
// default.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { ContractGateError } from './errors.mjs';

function git(repo, args, options = {}) {
  return spawnSync('git', ['-C', repo, ...args], { encoding: options.encoding ?? 'utf8', maxBuffer: 1 << 30 });
}

function gitText(repo, args, code, message) {
  const result = git(repo, args);
  if (result.status !== 0) {
    throw new ContractGateError(code, `${message}: ${String(result.stderr).trim() || `git ${args.join(' ')} failed`}`);
  }
  return result.stdout.trim();
}

/** The full object name of a revision, or a BASE error. */
export function resolveRevision(repo, revision) {
  const result = git(repo, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]);
  if (result.status !== 0) {
    throw new ContractGateError(
      'GEORDI_E_CONTRACT_GATE_BASE',
      `cannot resolve ${revision} in ${repo}; fetch it first (in CI: actions/checkout with fetch-depth: 0)`,
    );
  }
  return result.stdout.trim();
}

/** The merge base of the selected head (default HEAD) and a base branch, or a BASE error. */
export function mergeBase(repo, baseRef, headRevision = 'HEAD') {
  const base = resolveRevision(repo, baseRef);
  const head = resolveRevision(repo, headRevision);
  const result = git(repo, ['merge-base', head, base]);
  if (result.status !== 0 || result.stdout.trim() === '') {
    const shallow = git(repo, ['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true';
    throw new ContractGateError(
      'GEORDI_E_CONTRACT_GATE_BASE',
      shallow
        ? `${headRevision} and ${baseRef} share no commit in this shallow clone; fetch full history so the merge base can be found: git fetch --unshallow origin (in CI: actions/checkout with fetch-depth: 0)`
        : `${headRevision} and ${baseRef} share no commit, so there is no merge base to compare with`,
    );
  }
  return result.stdout.trim();
}

/** Every blob of a commit as `{ mode, object, path }`, from `git ls-tree -r -z`. */
function listBlobs(repo, sha) {
  const listing = git(repo, ['ls-tree', '-r', '-z', '--full-tree', sha]);
  if (listing.status !== 0) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_BASE', `git ls-tree ${sha} failed: ${listing.stderr.trim()}`);
  }
  return listing.stdout
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [meta, path] = entry.split('\t');
      const [mode, type, object] = meta.split(' ');
      return { mode, type, object, path };
    })
    .filter((entry) => entry.type === 'blob');
}

/** The bytes of each blob, in order, from one `git cat-file --batch` run. */
function readBlobs(repo, objects) {
  const batch = spawnSync('git', ['-C', repo, 'cat-file', '--batch'], { input: `${objects.join('\n')}\n`, maxBuffer: 1 << 30 });
  if (batch.status !== 0) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_BASE', `git cat-file --batch failed: ${String(batch.stderr).trim()}`);
  }
  const out = batch.stdout;
  const blobs = [];
  let offset = 0;
  for (const object of objects) {
    const newline = out.indexOf(0x0a, offset);
    const header = out.subarray(offset, newline).toString('utf8').split(' ');
    if (header[0] !== object || header[1] !== 'blob') {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_BASE', `git cat-file --batch returned ${header.join(' ')} for ${object}`);
    }
    const size = Number(header[2]);
    blobs.push(out.subarray(newline + 1, newline + 1 + size));
    offset = newline + 1 + size + 1;
  }
  return blobs;
}

/** Extract a commit's exact blobs into `<cacheRoot>/trees/<sha>` once, and return the directory. */
export function materialiseRevision(repo, sha, cacheRoot) {
  const dir = join(cacheRoot, 'trees', sha);
  if (existsSync(join(dir, '.contract-gate-complete'))) {
    return dir;
  }
  const staging = `${dir}.${String(process.pid)}.partial`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const entries = listBlobs(repo, sha);
  const blobs = readBlobs(repo, entries.map((entry) => entry.object));
  entries.forEach((entry, index) => {
    const target = join(staging, ...entry.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    if (entry.mode === '120000') {
      symlinkSync(blobs[index].toString('utf8'), target);
    } else {
      writeFileSync(target, blobs[index]);
    }
  });
  writeFileSync(join(staging, '.contract-gate-complete'), `${sha}\n`);
  rmSync(dir, { recursive: true, force: true });
  renameSync(staging, dir);
  return dir;
}

/** Whether `dir` is inside a git work tree. */
export function isGitWorkTree(dir) {
  return git(dir, ['rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true';
}

export function gitTopLevel(dir) {
  return gitText(dir, ['rev-parse', '--show-toplevel'], 'GEORDI_E_CONTRACT_GATE_BASE', `${dir} is not a git work tree`);
}

/** Read-only view of one tree. Paths are repository-relative with `/` separators. */
export class Tree {
  constructor(dir, description) {
    this.dir = resolve(dir);
    this.description = description;
  }

  /** The absolute path of a repository-relative path; it may not leave the tree. */
  absolute(path) {
    const absolute = resolve(this.dir, ...path.split('/'));
    const inside = relative(this.dir, absolute);
    if (inside === '..' || inside.startsWith(`..${sep}`) || resolve(inside) === inside) {
      throw new ContractGateError('GEORDI_E_CONTRACT_GATE_REGISTRY', `${path} resolves outside the tree ${this.description}`, [path]);
    }
    return absolute;
  }

  exists(path) {
    return existsSync(this.absolute(path));
  }

  /** The bytes of a file, or null when it does not exist. */
  bytes(path) {
    const absolute = this.absolute(path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      return null;
    }
    return readFileSync(absolute);
  }

  /** The text of a file with CRLF line endings read as LF, or null. */
  text(path) {
    const bytes = this.bytes(path);
    return bytes === null ? null : bytes.toString('utf8').replace(/\r\n/gu, '\n');
  }

  /** Names of the files in a directory that end with `suffix`, sorted, or [] when absent. */
  list(path, suffix) {
    const absolute = this.absolute(path);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      return [];
    }
    return readdirSync(absolute)
      .filter((name) => name.endsWith(suffix) && statSync(join(absolute, name)).isFile())
      .sort();
  }
}
