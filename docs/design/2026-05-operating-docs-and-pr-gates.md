# Operating Docs and PR Gates Design

**Status**: Draft
**Date**: 2026-05-23
**Slices Covered**: 1 and 10

## Problem

After each stabilization merge, the repo's operating documents can drift from the actual `main`
state. `BEARING.md` currently records the capability-profile branch context, while the branch has
already merged. The next implementation pass also needs a repeatable PR gate that is stricter than
"tests seemed fine locally."

## Goals

- Keep `BEARING.md`, `docs/STATUS.md`, and `BACKLOG.md` aligned with `origin/main`.
- Record the active baseline commit and next P0 direction before implementation starts.
- Use a deterministic final gate before opening or merging PRs.
- Keep status documents factual: completed work, current test counts, and current next moves.

## Non-Goals

- Do not introduce release automation.
- Do not replace GitHub Actions.
- Do not move backlog ownership out of `BACKLOG.md` and GitHub issues.
- Do not make design docs the source of truth for implementation status after code lands.

## Slice 1 Design: Refresh Operating Docs Post-Merge

### Inputs

- `git rev-parse --short origin/main`
- `git status --porcelain=v1 -b`
- `gh issue list --state open`
- Current `BEARING.md`, `BACKLOG.md`, and `docs/STATUS.md`

### Required Updates

`BEARING.md` should record:

- Current date.
- `main` baseline commit.
- Current branch or current operating branch.
- Completed capability-profile work as merged, not in-progress.
- Immediate moves in priority order.
- Open dependency state if known.

`docs/STATUS.md` should record:

- Current milestone name.
- Current package test counts after any implementation changes.
- Complete package status.
- Next moves that agree with `BEARING.md`.

`BACKLOG.md` should record:

- Completed P0 items as completed.
- Open GitHub-backed backlog issues by number.
- Any new P0 design item before implementation begins.

### Acceptance Criteria

- Docs contain no stale branch names from completed work unless used as historical context.
- `BEARING.md` and `docs/STATUS.md` agree on next immediate moves.
- `BACKLOG.md` agrees with `gh issue list --state open` for GitHub-backed backlog items.
- `pnpm test:docs` passes.

## Slice 10 Design: Final Gates and PR

### Local Gate

Before push:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:docs
pnpm test:package-names
pnpm test:repo-sludge
pnpm test:placeholders
pnpm test:exports
git diff --check
```

### PR Requirements

- Branch starts from current `origin/main`.
- PR targets `main`.
- PR body names:
  - what changed
  - why it changed
  - validation commands
  - any deliberate non-goals
- PR should be draft unless explicitly requested otherwise.
- CI must be green before merge.
- CodeRabbit cooldown or review state must be checked before merge when CodeRabbit runs.

### Merge Requirements

Merge is allowed only when:

- CI is green.
- The branch has no unpushed local commits.
- The worktree is clean.
- No unresolved requested-changes review blocks remain, unless the user explicitly authorizes an
  admin merge.

### Acceptance Criteria

- PR is open against `main`.
- Local gates are recorded in the PR body.
- GitHub checks are green or clearly reported as pending.
- After merge, local `main` is aligned to `origin/main`.

## Risks

- Documentation can become performative if it is updated without checking repo state.
- Test counts can drift if status docs are updated before the final `pnpm test`.
- Admin merge can hide process failures if used before CI is green.

## Verification

The design slice itself only changes documentation, so verification is:

```bash
pnpm test:docs
git diff --check
```
