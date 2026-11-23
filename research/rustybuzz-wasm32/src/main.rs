//! Native runner: prints the experiment's byte stream as one JSON line, so
//! `run.mjs` can compare it with the wasm32 module's bytes. With `--glyphs` it
//! prints one JSON line per shaped string instead, for reading.

use std::io::Write;

const SCHEMA: &str = r#""_schema":{"id":"geordi.research.rustybuzz_wasm32."#;

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}

fn word(bytes: &[u8], at: usize) -> u32 {
    bytes.get(at..at + 4).map_or(0, |slice| {
        u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]])
    })
}

fn json_string(text: &str) -> String {
    use std::fmt::Write as _;
    let mut out = String::from("\"");
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if u32::from(c) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", u32::from(c));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn main() -> std::io::Result<()> {
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--help") {
        writeln!(
            out,
            r#"{{{SCHEMA}help","version":"1.0.0"}},"kind":"help","description":"Prints the rustybuzz shaping dump of flyingrobots/geordi#137 as one JSON line; --glyphs prints one line per shaped string. Run research/rustybuzz-wasm32/run.mjs to compare targets."}}"#
        )?;
        return Ok(());
    }
    let bytes = rustybuzz_wasm32_determinism::dump();
    if !args.iter().any(|arg| arg == "--glyphs") {
        writeln!(
            out,
            r#"{{{SCHEMA}dump","version":"1.0.0"}},"kind":"dump","bytes":"{}"}}"#,
            hex(&bytes)
        )?;
        return Ok(());
    }
    let texts = rustybuzz_wasm32_determinism::strings();
    let runs = word(&bytes, 4) as usize;
    let mut offset = 8;
    for _ in 0..runs {
        let config = word(&bytes, offset) as usize;
        let string = word(&bytes, offset + 4) as usize;
        let count = word(&bytes, offset + 8) as usize;
        offset += 12;
        let mut glyphs = Vec::with_capacity(count);
        for _ in 0..count {
            let field = |index: usize| word(&bytes, offset + 4 * index);
            #[expect(
                clippy::cast_possible_wrap,
                reason = "the stream stores i32 values as their bits"
            )]
            let signed = |index: usize| field(index) as i32;
            glyphs.push(format!(
                "[{},{},{},{},{},{},{}]",
                field(0),
                field(1),
                field(2),
                signed(3),
                signed(4),
                signed(5),
                signed(6)
            ));
            offset += 28;
        }
        let name = rustybuzz_wasm32_determinism::CONFIGS
            .get(config)
            .map_or("?", |c| c.name);
        let text = texts.get(string).map_or("", String::as_str);
        writeln!(
            out,
            r#"{{{SCHEMA}glyphs","version":"1.0.0"}},"kind":"glyphs","config":"{name}","string":{string},"text":{},"glyphs":[{}]}}"#,
            json_string(text),
            glyphs.join(",")
        )?;
    }
    Ok(())
}
