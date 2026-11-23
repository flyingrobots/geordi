//! `geordi-bijou-shadergen`: assemble, generate and check the `bijou-surface-gpu/1` shaders.

use std::io;
use std::path::PathBuf;
use std::process::ExitCode;

// The library owns these dependencies; the binary only forwards to it.
use naga as _;
use serde_json as _;
use sha2 as _;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = geordi_bijou_shadergen::run(
        &args,
        &PathBuf::from("."),
        &mut io::stdout().lock(),
        &mut io::stderr().lock(),
    );
    ExitCode::from(code)
}
