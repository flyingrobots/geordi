# Geordi Design Pack

**Status**: Draft
**Date**: 2026-05-23
**Baseline**: `main` after design-pack merge `1719019`

This directory holds implementation design documents for the next post-capability-profile P0
sequence. The design pack is intentionally separate from [`../V0_DESIGN_LAWS.md`](../V0_DESIGN_LAWS.md):
the laws define product semantics, while these documents define the next implementation slices.

## Slice Map

| Slice | Working Title | Design Document |
| ---: | --- | --- |
| 1 | Refresh operating docs post-merge | [`2026-05-operating-docs-and-pr-gates.md`](./2026-05-operating-docs-and-pr-gates.md) |
| 2 | Backlog strict text profile | [`2026-05-strict-text-font-profile.md`](./2026-05-strict-text-font-profile.md) |
| 3 | Feature registry split | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 4 | Strict text feature vocabulary | [`2026-05-strict-text-font-profile.md`](./2026-05-strict-text-font-profile.md) |
| 5 | Runtime feature support model | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 6 | Capability subset tests | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 7 | Compiler baseline requirement lock | [`2026-05-feature-registry-runtime-capabilities.md`](./2026-05-feature-registry-runtime-capabilities.md) |
| 8 | Issue #6: Group zero-required-props type test | [`2026-05-compiler-test-hardening.md`](./2026-05-compiler-test-hardening.md) |
| 9 | Issue #5: CI-gated generated-type TSC check | [`2026-05-compiler-test-hardening.md`](./2026-05-compiler-test-hardening.md) |
| 10 | Final gates and PR | [`2026-05-operating-docs-and-pr-gates.md`](./2026-05-operating-docs-and-pr-gates.md) |

## Common Invariants

All slices must preserve these invariants:

- No rebase, amend, or force git operations.
- One concept per commit when execution starts.
- All production JSON ingress and egress remains behind the core JSON port.
- All thrown errors remain custom `Error` subclasses.
- Capability failures are hard failures, not best-effort rendering.
- Compiler emission of baseline IR requirements must not silently grow when future known features
  are added.
- Local validation must include the relevant package gate plus final full gates before PR.

## Full Gate

The final slice should run:

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

## Non-Goals

This design pack does not implement strict text shaping, matrix operation-order law, binary IR
packing, or a CLI package. It prepares the contracts that make those later changes explicit.
