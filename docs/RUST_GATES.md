# Rust Gates

Rust support starts as a native render harness for the render-everywhere milestone. Keep Rust code
inside the Cargo workspace and inherit workspace lint settings for every crate.

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
