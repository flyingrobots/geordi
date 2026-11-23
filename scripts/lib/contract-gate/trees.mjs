// The two trees the contract gate compares: where they come from, and how their files are read.
//
// A tree is a directory. A git revision is materialised into a cache directory with
// `git archive`, so the base is always the committed bytes of the merge base and never a
// file the pull request could have edited. The head is the working tree by default.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

/** The merge base of HEAD and a base branch, or a BASE error that says why. */
export function mergeBase(repo, baseRef) {
  const base = resolveRevision(repo, baseRef);
  const head = resolveRevision(repo, 'HEAD');
  const result = git(repo, ['merge-base', head, base]);
  if (result.status !== 0 || result.stdout.trim() === '') {
    const shallow = git(repo, ['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true';
    throw new ContractGateError(
      'GEORDI_E_CONTRACT_GATE_BASE',
      shallow
        ? `HEAD and ${baseRef} share no commit in this shallow clone; fetch full history (actions/checkout fetch-depth: 0) so the merge base can be found`
        : `HEAD and ${baseRef} share no commit, so there is no merge base to compare with`,
    );
  }
  return result.stdout.trim();
}

/** Extract a commit into `<cacheRoot>/trees/<sha>` once, and return the directory. */
export function materialiseRevision(repo, sha, cacheRoot) {
  const dir = join(cacheRoot, 'trees', sha);
  if (existsSync(join(dir, '.contract-gate-complete'))) {
    return dir;
  }
  const staging = `${dir}.${String(process.pid)}.partial`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const archive = git(repo, ['archive', '--format=tar', sha], { encoding: 'buffer' });
  if (archive.status !== 0) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_BASE', `git archive ${sha} failed: ${String(archive.stderr).trim()}`);
  }
  const untar = spawnSync('tar', ['-x', '-C', staging], { input: archive.stdout, encoding: 'utf8' });
  if (untar.status !== 0) {
    throw new ContractGateError('GEORDI_E_CONTRACT_GATE_INTERNAL', `cannot extract ${sha}: ${untar.stderr.trim()}`);
  }
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

  absolute(path) {
    return join(this.dir, ...path.split('/'));
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
