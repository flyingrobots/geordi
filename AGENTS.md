# AGENTS.md

NEVER amend git commits, just make a new commit.

NEVER use git rebase. Extremely rare exceptions are permitted only when histories diverge, and
only after asking the user and explaining why it must be done. Use regular git merge.

NEVER EVER force any git operation. If you find yourself in this situation, you already screwed up.
Tell the user what happened and what the available options are.

`codex-think` exists and is available on PATH. Use it deliberately:

- Use `codex-think --remember --json` when starting a new session or regaining context after a
  context shift.
- Use `codex-think "..." --json` to capture thoughts whenever a cycle is closed.
- Use `codex-think "..." --json` to capture thoughts whenever there is a significant event worth
  preserving across turns, repos, or agents.

Treat Think as a memory and coordination layer, not as the source of repo truth. Anchor strong
claims back to files, commits, commands, or other inspectable evidence.

## Work Tracking

GitHub Issues are the only tracker for planned work, debt, and execution order. Do not create or
maintain in-repo planning files such as `BEARING.md`, `BACKLOG.md`, slice checklists, or DAG status
files.

- File new work with a template from `.github/ISSUE_TEMPLATE/`. Choose the card type that matches
  what is known: Feature, Bug, Decision, Research, Investigation, Spike, or Task.
- Write cards in ASD-STE100. Keep the frontmatter block, the type heading, and the LLM prompt block
  at the top of each card.
- One executable issue leads to one pull request. Put `Closes #N` in the pull request body.
- Each card starts with `issue-dag/1` frontmatter: the first fenced `yaml` block, with `.dag`, `.id`,
  `.kind`, and (for tasks) `.type` and `.blocked_by`. Keys that start with `.` are the
  machine-readable contract; other keys are notes. See the `issue-dag` skill's
  `docs/frontmatter-model.md`.
- Record prerequisites in `.blocked_by`, as `#N` or `owner/repo#N`. A milestone lists its members in
  `.children`. GitHub sub-issues and blocked-by links are an optional mirror; the frontmatter wins.
- Labels are for people. No tool reads them.
- When work is done, close the issue through its pull request. Record a decision or finding on the
  card that owns it.
- Design records in `docs/design/` explain decisions. They do not track status. The slice plans and
  DAG files there are historical records.
