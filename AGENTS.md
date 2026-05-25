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

## Render-Everywhere Slice Tracking

When `BEARING.md` names an active execution checklist, follow that checklist in order. The latest
active checklist is the strict positioned glyph-run text plan in `BEARING.md`, backed by
[`docs/design/2026-05-strict-positioned-glyph-run-dag.dot`](docs/design/2026-05-strict-positioned-glyph-run-dag.dot)
and
[`docs/design/2026-05-strict-positioned-glyph-run-dag.svg`](docs/design/2026-05-strict-positioned-glyph-run-dag.svg).
The latest completed render-everywhere checklist is
[`docs/design/2026-05-bunny-mesh-slice-plan.md`](docs/design/2026-05-bunny-mesh-slice-plan.md).

When executing slices:

- Pick an OPEN node from the active DAG, preferably the lowest-numbered OPEN node unless the user
  explicitly reprioritizes.
- Keep each slice scoped to its checklist acceptance criteria.
- Update the checklist from `- [ ]` to `- [x]` only when that slice is actually implemented,
  verified, and committed.
- Update the active DAG DOT node status and regenerate the SVG after each completed slice.
- Keep `BEARING.md` aligned when the active direction or slice order changes materially.
