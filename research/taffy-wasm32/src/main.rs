//! Native runner: prints the experiment's byte stream as JSON Lines, one line
//! per tree, so `run.mjs` can compare it with the wasm32 module's bytes.

use std::io::Write;

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}

fn main() -> std::io::Result<()> {
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    if std::env::args().any(|arg| arg == "--help") {
        writeln!(
            out,
            r#"{{"_schema":{{"id":"geordi.research.taffy_wasm32.help","version":"1.0.0"}},"kind":"help","description":"Prints the Taffy layout dump of flyingrobots/geordi#136 as one JSON line per tree. Run research/taffy-wasm32/run.mjs to compare targets."}}"#
        )?;
        return Ok(());
    }
    let bytes = taffy_wasm32_determinism::dump();
    writeln!(
        out,
        r#"{{"_schema":{{"id":"geordi.research.taffy_wasm32.dump","version":"1.0.0"}},"kind":"dump","bytes":"{}"}}"#,
        hex(&bytes)
    )?;
    Ok(())
}
