# Contributing

Run `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm test:docs` before opening a
pull request.

## Public contracts

A pull request that changes a public contract (a serialized format's schema or canonical example
hashes, a public diagnostic code, a public Rust item that carries a contract, or a CLI message
schema) needs a change record in `contracts/changes/`. `pnpm contracts:check` compares your branch
with its merge base and lists what it found. See [`docs/contract-gate.md`](docs/contract-gate.md).

## Shared protocol strings

Do not write string literals for artifact paths, IR versions, or other shared protocol strings.
`@flyingrobots/geordi-core` owns them; import the constant instead.

| Literal | Constant |
| --- | --- |
| `scene.geordi.json` | `GEORDI_IR_ARTIFACT_KEY` |
| `scene.geordi.json.receipt` | `GEORDI_IR_RECEIPT_KEY` |
| `geordi-ir/1` | `GEORDI_IR_VERSION` |

All three live in `packages/core/src/domain/models/GeordiIr.ts`. A change to an artifact path or IR
version is then one edit, and packages cannot disagree about artifact names.

`pnpm lint` runs `scripts/check-core-artifact-literals.mjs`, which fails on a quoted restatement of
one of these literals in a tracked source file. `packages/core`, `*.test.*` files (which assert the
literal values as independent oracles) and checked-in fixtures are exempt. The Rust crates keep their
own constants.
