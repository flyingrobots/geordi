# Documentation Standards

**Status**: Current project policy for new and substantially changed
documentation.
**Applies to**: User, compiler, IR, renderer, fixture, release, and contributor
documentation in Geordi.
**Normative terms**: **MUST**, **SHOULD**, and **MAY** indicate requirement
strength.

## 1. Purpose

Documentation is part of Geordi's contract. Each page MUST have one primary
reader job:

- learn a supported path through a verified first result;
- complete an operational task;
- look up an exact artifact, API, profile, diagnostic, or command;
- understand a product law, ownership boundary, or tradeoff;
- troubleshoot an observable failure; or
- change the implementation and verify the result safely.

Do not make one page act as a tutorial, reference, roadmap, design record, and
release ledger simultaneously.

## 2. Corpus map

| Location | Job |
| --- | --- |
| `README.md` | Public front door, current claims, nonclaims, and deeper routes. |
| `docs/README.md` | Documentation spine and routing index. |
| `BEARING.md` | Active milestone, ordered slices, and current execution posture. |
| `BACKLOG.md` | Repository-owned debt and unscheduled work. |
| `docs/STATUS.md` | Stable summary of behavior on `main`. |
| `docs/ARCHITECTURE.md` | Current compiler, artifact, and runtime architecture. |
| `docs/V0_DESIGN_LAWS.md` | Current product and runtime laws. |
| `docs/design/` | Accepted, proposed, and historical design records. |
| `docs/render-everywhere.md` | Runnable render-everywhere guide and proof boundaries. |
| `docs/end-to-end.md` | Source-to-artifact-to-runtime explanation. |
| `docs/ERROR_CODES.md` | Stable diagnostic reference. |
| `docs/RUST_GATES.md` | Rust verification reference. |
| `CHANGELOG.md` | Release-visible historical ledger. |

New durable pages MUST be linked from `docs/README.md` or the relevant design
index. Do not create empty placeholder directories.

## 3. Page types

### 3.1 Living reference

A living reference describes current behavior on `main`. It MUST state exact
contracts, profiles, invariants, errors, supported usage, and known limits. It
MUST NOT present planned behavior as implemented.

### 3.2 Design and test plan

A design record explains a proposed or accepted change. An active execution
design MUST identify:

- the reader and system problem;
- authority and ownership boundaries;
- goals and explicit non-goals;
- versioned artifacts or interfaces;
- stable requirements;
- exact positive and negative evidence;
- dependency-ordered slices; and
- acceptance and completion conditions.

Planned work is not evidence. Mark it as planned and link its GitHub issue.

### 3.3 Tutorial

A tutorial MUST state prerequisites and starting state, follow a tested
known-good path, show expected intermediate and final results, and end with the
next appropriate document.

### 3.4 How-to guide

A how-to guide MUST lead with its expected result, identify blocking
prerequisites, provide the shortest safe procedure, show how to verify success,
and link to reference material instead of duplicating it.

### 3.5 Troubleshooting

Troubleshooting MUST begin with an observable symptom. List discriminating
checks before broad remedies, map signals to likely causes, provide concrete
recovery, and show how to verify the result.

### 3.6 Contributor guide

Contributor documentation SHOULD explain the system model and authority
boundary before listing files. Source links support that explanation; they do
not replace it.

## 4. Maintenance loop

For a meaningful behavior change:

1. Update or add design rationale when the decision or boundary changes.
2. Add the smallest deterministic executable evidence that fails for the
   missing behavior.
3. Implement the behavior.
4. Update the living reference after the behavior exists.
5. Record actual evidence and remaining nonclaims.
6. Update `README.md`, `docs/README.md`, `BEARING.md`, `BACKLOG.md`,
   `docs/STATUS.md`, and `CHANGELOG.md` when their owned posture changes.
7. Run documentation upkeep before opening the pull request.

Small fixes may scale this down, but current truth, evidence, and nonclaims must
remain explicit.

## 5. Examples and executable truth

User-facing examples MUST be syntactically valid, use supported behavior,
include enough context to run or interpret, identify destructive or privileged
actions before the command, and show an observable result when one exists.

A runnable example SHOULD be exercised in CI. An illustrative example MUST be
labeled illustrative. An abridged example MUST identify omitted content and
preserve the behavior being explained.

Every fenced block MUST declare a language or content type. Use `bash` or `sh`
for copyable shell commands, `text` for output, and the exact structured
language for artifacts. Do not include a shell prompt in a copyable command
block.

When output varies, identify the variable fields. Never invent output to make
an example appear complete.

## 6. Artifact and claim discipline

Geordi documentation MUST distinguish:

- authored source from generated evidence;
- semantic meaning from target rendering;
- source artifacts from receipts;
- supported capabilities from residuals;
- exact parity from coarse or structural witnesses; and
- current claims from future possibilities.

Every versioned artifact example MUST use its exact version string. Every
rendering claim MUST name the profile and evidence that supports it. A target
MUST NOT inherit a source target's claims without executable evidence.

Generated artifacts SHOULD name their generator or owning command and MUST NOT
be hand-edited when a checked generator owns their bytes.

## 7. Visuals and accessibility

Use a diagram, screenshot, render witness, or annotated artifact when it
answers a reader question that prose cannot answer as clearly.

Every informative visual MUST have meaningful alt text or adjacent text,
identify whether it is conceptual or exact, and avoid secrets or personal
data. Visuals MUST NOT rely on color, position, shape, or animation alone for
essential meaning.

A render witness MUST label its claim boundary. Screenshots and generated
images MUST NOT be the only source of commands, errors, or required
instructions.

## 8. Writing and Markdown

Write directly and precisely.

- Lead with the result, decision, warning, or blocking condition.
- Use present tense for current behavior.
- Prefer active voice when responsibility matters.
- Use imperative verbs for procedures.
- Avoid hype, vague reassurance, unnecessary apology, and excessive
  exclamation.
- Use canonical product, artifact, profile, command, and error names.
- Define unfamiliar terms on first use.
- Use inline code for commands, options, filenames, paths, fields, values,
  versions, profiles, and symbols.
- Use descriptive link text.
- Use tables only for genuinely two-dimensional lookup.
- Use numbered lists for ordered procedures and bullets for parallel facts.
- Keep one coherent idea per paragraph.

Do not describe a stable `E_*` diagnostic as a warning. Do not add untyped
artifact path or version literals to examples when an exported constant is the
documented implementation convention.

## 9. Safety

Before a destructive, privileged, costly, or irreversible command:

1. State the exact consequence and scope.
2. State required permissions.
3. Provide a dry run or safer alternative when one exists.
4. Provide rollback or backup guidance when applicable.
5. Explain how to verify the result.

Use fictional, context-safe placeholders. Never include real credentials,
tokens, personal identifiers, or production secrets.

## 10. Checks and enforcement

Run the repository documentation gate for documentation changes:

```bash
pnpm test:docs
git diff --check
```

When code, artifacts, or examples change, run the narrow package gate plus the
full gates named in `README.md` and the active design plan.

CI SHOULD block only on deterministic facts, including:

- trailing whitespace;
- fenced blocks without a language;
- `E_*` diagnostics mislabeled as warnings;
- broken repository paths where an offline checker exists;
- stale generated artifacts where a drift command exists;
- failed executable examples;
- invalid diagrams;
- widened claims without matching evidence; and
- changed public behavior without updated living documentation.

Sentence length, page length, passive voice, jargon density, bullet count,
suspected missing visuals, and external-link health remain review signals, not
universal merge gates.

## 11. Review checklist

Before documentation is complete:

- The page has one primary reader job.
- Current references describe only behavior on `main`.
- Planned work is labeled and linked to an issue or design.
- Examples use supported behavior and observable results.
- Artifact versions, profiles, claims, and nonclaims are exact.
- Visuals carry a textual equivalent and claim boundary.
- New durable pages are routed from `docs/README.md`.
- Changed behavior updates the owning roadmap, status, and release surfaces.
- Documentation and diff checks pass.

The objective is a corpus where readers, reviewers, tests, and agents can find
the authoritative page when they need it.
