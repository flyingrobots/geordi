//! `geordi-bijou-wgpu-proof`: bounded offscreen `wgpu` proof for `bijou-surface-gpu/1`.

use std::io;
use std::path::PathBuf;
use std::process::ExitCode;

// The library owns these dependencies; the binary only forwards to it.
use geordi_bijou_shadergen as _;
use pollster as _;
use serde_json as _;
use wgpu as _;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = geordi_bijou_wgpu_proof::run(
        &args,
        &PathBuf::from("."),
        &mut io::stdout().lock(),
        &mut io::stderr().lock(),
    );
    ExitCode::from(code)
}
