//! `geordi-contract-api`: snapshot the public items of Rust source files for the contract gate.

use std::io;
use std::process::ExitCode;

// The library owns these dependencies; the binary only forwards to it.
use quote as _;
use serde_json as _;
use syn as _;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = geordi_contract_api::run(&args, &mut io::stdout().lock(), &mut io::stderr().lock());
    ExitCode::from(code)
}
