# Nondeterminism Rules For Canonical Paths

**Gate**: `pnpm check:determinism` (also run by `pnpm lint`, by CI and by the tracked pre-push hook)
**Rust scan**: `scripts/ban-nondeterminism.mjs`, with waivers in `.ban-nondeterminism-allowlist`
**TypeScript rule**: ESLint `nondeterminism/ban`, from `scripts/eslint-plugin-nondeterminism.mjs`
**Rule table**: `scripts/lib/nondeterminism.mjs` (rule IDs, Rust patterns, TypeScript selectors, scopes)
**Tests**: `scripts/ban-nondeterminism.test.mjs`, `scripts/eslint-nondeterminism.test.mjs`

Geordi's contract is `pixels = render(ir, viewport, assetPack, runtimeProfile)` with receipts over
the output. The deterministic profiles (`geordi-fixed-q32.32/1`, `geordi-ray-traced-scene/1`) hold
only if the code that validates, canonicalizes, hashes and receipts them does not depend on the
host. This page lists which code that is, which sources of host dependence are banned there, and how
to request an exception.

## Where the rule IDs come from

The IDs are Echo's: `scripts/ban-nondeterminism.sh` in the Echo repository, with its
`.ban-nondeterminism-allowlist`. Bunny maps the same IDs onto its Code Dojo gate
(`docs/CODE_DOJO.md` in flyingrobots/bunny). One ID means one ban in all three repositories.

- The Rust patterns are Echo's, one entry per row of Echo's script, translated from ripgrep to
  JavaScript so the scan has no dependency beyond Node. Echo's own rows that are specific to
  `warp-core` (its serialization-boundary guard) are not carried.
- The allowlist row format is Echo's: `<rule-id> <path> <reason>`. A row without a reason refuses
  the whole file.
- Bunny's lesson, that the checker is itself tested, is applied here: every rule has a snippet it
  must report and one it must not, in both test files.
- `host-locale` is Geordi's own and is not an Echo rule. Every other ID is Echo's.

## Canonical paths

A path is canonical when its output is, or feeds, an artifact, a hash or a receipt that a second
host must reproduce byte for byte. Display runtimes are not canonical: they legitimately use
floats, clocks and the network. Scanning the whole repository would need so many waivers that the
list would stop meaning anything.

### Rust

| Path | Why it is canonical |
| --- | --- |
| `crates/geordi-ir` | Validates the IR, the strict-text, font-pack and ray-traced scene artifacts, defines the canonical encoding, the SHA-256 hashes and the receipts. |
| `crates/geordi-renderer` | Negotiates the runtime profile and builds the `RenderedImage` whose pixels are hashed into the render receipt. |

Every `.rs` file below these directories is scanned, inline test modules and `tests.rs` files
included: a golden value that depends on the clock or the environment is not a golden value.

Not scanned, and why:

- `crates/geordi-mesh` parses mesh assets for the render-everywhere demos; it produces input, not a
  canonical artifact.
- `crates/geordi-bijou-shadergen` and `crates/geordi-bijou-wgpu-proof` are generators and a GPU
  proof host. Their determinism is checked by their own drift gates and receipts.
- `examples/` and `research/` are demonstrations and experiments.

### TypeScript

| Path | Why it is canonical |
| --- | --- |
| `packages/core/src` | IR types, validation and the canonical JSON port (sorted keys, no non-finite numbers). |
| `packages/compiler-core/src` | The IR emitter, the validation engine and the determinism receipt. |
| `packages/schema-graphql/src` | Lowers GraphQL SDL into the canonical AST the compiler hashes. |
| `packages/wesley-generator/src` | Maps compiler artifacts to generated output paths and bytes. |
| `packages/profunctor-page/src` | The Profunctor Page lowerer, whose digests are pinned. |
| `packages/bijou-gpu/src/{atlas,numeric,packed-cells,prepare,procedural,procedural-table,receipt,reference}.ts` | The packed-cell ABI, the integer numeric law, the receipt validator and the CPU reference oracle. |

Test files beside these are scanned too, except that they may build `NaN` and the infinities
(see `float-sentinel` below).

Not scanned, and why: the presenters and browser code in `packages/bijou-gpu` (WebGL2, WebGPU,
Canvas 2D, the glyph-atlas browser rasterizer), `packages/runtime-webgl`, `packages/render-fixture`,
`packages/gpvue`, `packages/text-prep` and `examples/`. They draw, run in a browser, read the
filesystem or are tooling around the canonical output, and use floats, timers and the DOM by
design.

## Rules

A banned source reports `[<rule-id>] <message>`. "Rust" is the pattern scan; "TypeScript" is the
ESLint rule.

| Rule ID | Rust (Echo's patterns) | TypeScript |
| --- | --- | --- |
| `time-system` | `SystemTime` | `Date.now`, `new Date()` with no argument, `Date()`, `Temporal.Now` |
| `time-instant` | `Instant` | `performance.now`, `process.hrtime`, `process.uptime`, `requestAnimationFrame` |
| `thread-sleep` | `std::thread::sleep`, `tokio`/`async_std` `time::sleep` | `setTimeout`, `setInterval`, `setImmediate`, `Atomics.wait` |
| `host-parallelism` | `available_parallelism` | `hardwareConcurrency`, `availableParallelism`, `new Worker`, `new SharedWorker` |
| `random` | `rand::`, `getrandom::`, `fastrand::` | `Math.random`, `crypto.getRandomValues`, `randomUUID`, `randomBytes`, `randomInt`, `randomFill` |
| `host-callback` | `js_sys::Function`, `wasm_bindgen` closures | not applicable in TypeScript |
| `network` | `std::net::`, `reqwest::`, `ureq::` | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `node:http`, `node:https`, `node:net` and the like |
| `unordered-container` | `HashMap`, `HashSet`, `FxHashMap`, `FxHashSet` | `Object.keys`/`entries`/`values` unless sorted at once, and `for...in` |
| `hand-hashed-table` | the words "open addressing" | not applicable in TypeScript |
| `json-serialization` | `serde_json::` | not a TypeScript rule: `JSON.parse` and `JSON.stringify` are already routed through the `JsonPort` by `no-restricted-syntax` |
| `wasm-serde` | `serde_wasm_bindgen::` | not applicable in TypeScript |
| `float-sentinel` | `f32::NAN`, `f64::INFINITY`, `NEG_INFINITY` | `NaN`, `Infinity`, `Number.NaN`, `Number.POSITIVE_INFINITY`, `Number.NEGATIVE_INFINITY` |
| `float-op` | `.sin(`, `.cos(`, `.tan(`, `.sqrt(`, `.pow(` | `Math.sin`, `cos`, `tan`, `sqrt`, `pow`, `exp`, `log` and the other `Math` functions that are implementation-defined; `**` unless a literal base has a literal integer exponent (`2 ** 32`) |
| `std-env` | `std::env` | `process.env`, `process.argv`, `process.cwd`, `process.platform`, `import.meta.env`, `node:os` |
| `std-fs` | `std::fs`, `fs::read` and the other `fs::` calls | importing or requiring `fs`, `node:fs`, `fs/promises` |
| `std-process` | `std::process`, `process::exit`, `process::id` | `process.exit`, `process.pid`, `process.stdout` and the like, `node:child_process`, `node:worker_threads` |
| `host-locale` (Geordi's own) | not applicable in Rust | `toLocaleString` and its siblings, `localeCompare`, `Intl`, the local-time `Date` getters |

Two TypeScript readings are looser than the plain words. `unordered-container` bans the key order
of a plain object where it can reach output: sorting the keys at once (`Object.keys(x).sort(...)`)
is the accepted form, as `packages/core/src/ports/json.ts` does. A JavaScript `Map` or `Set`
iterates in insertion order and is not banned. `float-sentinel` is not banned in test files of the
canonical packages, because they construct `NaN` and the infinities as input to prove the canonical
code rejects them.

The Rust scan is line-oriented and also matches comments, as Echo's does. If a pattern hits
something that is not the banned source, refactor the line before waiving it.

## Running it

```bash
pnpm check:determinism              # the Rust scan, then ESLint over the canonical TypeScript
node scripts/ban-nondeterminism.mjs # the Rust scan alone
node scripts/ban-nondeterminism.mjs --schema
node scripts/ban-nondeterminism.mjs --human
```

The Rust scan writes JSON Lines on stdout and stderr: one `finding` line per unwaived hit, then one
`result` line with the verdict and the waivers that were used, counted by rule. Errors are lines on
stderr. `--help` and `--schema` print the message schemas, which are in
`schemas/geordi-ban-nondeterminism/`. `--human` writes prose. The exit status is 0 when clean, 1 on
findings and 2 on a usage error or a malformed allowlist. The environment variables
`DETERMINISM_PATHS` and `DETERMINISM_ALLOWLIST` are honoured as in Echo.

Where it runs:

- CI: the step "Ban nondeterminism in the canonical paths" runs `pnpm check:determinism`, and
  `pnpm lint` runs both halves again.
- The tracked hook: `.githooks/pre-push` runs `pnpm check:determinism`. Enable it once per clone
  with `git config core.hooksPath .githooks`.
- `pnpm test` runs the rules' own tests (`pnpm test:lint-rules`). Run them once with `CI=true`
  before pushing: with `CI` set, typescript-eslint lints the file on disk rather than the text it
  is given, and `scripts/eslint-nondeterminism.test.mjs` sets `TSESTREE_SINGLE_RUN=false` for that
  reason.

## Requesting an exemption

Fix the code first. An exemption is for a source that is confined and cannot reach a canonical
output, and it states why. There are three forms, from narrowest:

1. **One line.** A comment on the line or the line above:
   `// ban-nondeterminism: allow(<rule-id>) <reason>`.
2. **A region.** `// ban-nondeterminism: allow-begin(<rule-id>) <reason>` to
   `// ban-nondeterminism: allow-end(<rule-id>)`.
3. **A row in `.ban-nondeterminism-allowlist`**, Echo's format: `<rule-id> <path> <reason>`. The
   path is a glob and the row waives that one rule for every line of those files. Use it only when
   a file is entirely the exception, such as a test file that reads fixtures.

Both inline forms work in Rust and in TypeScript, and both need a reason: a waiver with no reason
waives nothing. A waiver names exactly one rule. List a new exemption in the pull request, with its
rule ID and why the source is confined.

Do not exempt a directory. A scope change, such as adding a crate or package, edits
`CANONICAL_RUST_PATHS` or `CANONICAL_TS_FILES` in `scripts/lib/nondeterminism.mjs` and this page.

## Exemptions on `main`

Counts are lines (Rust) or nodes (TypeScript) that a waiver covers.

| Rule ID | Where | Count | Why the source is confined |
| --- | --- | --- | --- |
| `json-serialization` | `crates/geordi-ir/src/lib.rs`, `ray_traced_scene.rs`, `ray_traced_scene/tests.rs` (allowlist rows) | 41 | `serde_json` is the artifact codec. Canonical bytes are `to_string_pretty` over an ordered `Value`; `preserve_order` is off in the workspace. |
| `std-fs` | `crates/geordi-ir/src/lib.rs` and `ray_traced_scene.rs` (artifact loaders, inline) | 16 | Each loader reads the bytes the caller names and returns a function of them; paths stay inside the repository root. |
| `std-fs` | `crates/geordi-ir` tests (inline, and the `ray_traced_scene/tests.rs` allowlist row) | 14 | Test fixture I/O only. |
| `float-sentinel` | `crates/geordi-ir/src/lib.rs` test | 2 | Input that proves validation rejects non-finite numbers. |
| `time-system`, `std-env`, `std-process` | `crates/geordi-ir/src/lib.rs` `unique_temp_path` | 1 each | Names a test fixture's temporary directory; the name never reaches an assertion. |
| `unordered-container` | `packages/bijou-gpu/src/receipt.ts`, `packages/profunctor-page/src/{lower,parse}.ts`, `packages/wesley-generator/src/GeordiGeneratorPlugin.ts` | 6 | Iteration follows the input document's key order, a function of the input bytes alone. |
| `unordered-container` | `packages/core/src/ports/json.test.ts` | 3 | The test asserts the canonical key order itself. |
| `std-fs` | `packages/profunctor-page/src/{lower,parse}.test.ts` | 2 | Test fixture I/O only. |
| `host-locale` | `packages/bijou-gpu/src/packed-cells.ts` | 1 | See below. |

### Known limits

- `host-locale` in `segmentGraphemes`: the locale is pinned to `en`, but `Intl.Segmenter` takes its
  grapheme boundaries from the host's Unicode tables, so two hosts with different ICU versions can
  disagree on newly assigned sequences. The width-1 glyph policy depends on it. Closing this needs a
  bundled segmenter; it is not done here.
- Where `unordered-container` is waived because order follows the input document, two documents that
  differ only in key order can lower to different bytes (for example the token bindings in
  `packages/profunctor-page/src/lower.ts`). That is deterministic, not host-dependent, and changing
  it would change pinned digests, so it is recorded rather than altered.
- The Rust scan reads text, not syntax. A banned type that reaches a file only through another
  crate's inferred return type is invisible to it, and it does not inspect dependencies. Bunny's
  syntax-aware gate closes both; Echo's script has the same limits.
- The checks do not run where a hook is not installed or where `--no-verify` is used; CI is the gate
  that always applies.
