# Rust Gates

Rust support starts as a native render harness for the render-everywhere milestone. Keep Rust code
inside the Cargo workspace and inherit workspace lint settings for every crate.

## Pinned toolchain

`rust-toolchain.toml` pins Rust to exactly `1.96.0` (minimal profile, with `clippy` and `rustfmt`).
CI installs the toolchain that file names, so a new stable release cannot fail the gates on
unchanged code through newly added lints. The pin matches the dev-container image, which also
provides only 1.96.0. It satisfies the workspace `rust-version` of 1.93 and edition 2024.

To raise the pin deliberately: change `channel` in `rust-toolchain.toml` in a dedicated change,
run every gate below at the new version, fix or justify each new finding (do not silence lints
with `allow` attributes to satisfy a newer compiler), and update the dev-container image to the
same version in the same step.

Run these gates after adding or changing Rust code:

```bash
cargo metadata --format-version 1
cargo fmt --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Workspace Clippy settings deny the major lint groups plus explicit high-risk lints. The only
workspace-level allowance is `multiple_crate_versions`, because the native windowing stack currently
pulls a transitive `bitflags` version split that is outside Geordi code. Do not add duplicate direct
dependencies to Geordi crates.

The workspace starts without native rendering claims. The first supported native path is the
rectangle-only render-everywhere fixture defined in
[`design/2026-05-render-everywhere-slice-plan.md`](design/2026-05-render-everywhere-slice-plan.md).
