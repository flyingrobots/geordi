// Contract for flyingrobots/geordi#81: the Rust toolchain is pinned in rust-toolchain.toml with
// the wasm32 target, the workspace rust-version matches it, and CI installs from the file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("rust-toolchain.toml pins 1.96.0 with rustfmt, clippy and the wasm32 target", () => {
  const toml = read("rust-toolchain.toml");
  assert.match(toml, /^channel = "1\.96\.0"$/m);
  assert.match(toml, /^components = \[[^\]]*"rustfmt"[^\]]*\]$/m);
  assert.match(toml, /^components = \[[^\]]*"clippy"[^\]]*\]$/m);
  assert.match(toml, /^targets = \["wasm32-unknown-unknown"\]$/m);
});

test("workspace rust-version is 1.96", () => {
  assert.match(read("Cargo.toml"), /^rust-version = "1\.96"$/m);
});

test("CI installs Rust from rust-toolchain.toml and builds geordi-ir for wasm32", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.doesNotMatch(ci, /dtolnay\/rust-toolchain/);
  assert.match(ci, /rustup toolchain install\s*$/m);
  assert.doesNotMatch(ci, /rustup show active-toolchain \|\|/);
  assert.match(ci, /cargo build -p geordi-ir --target wasm32-unknown-unknown/);
});
