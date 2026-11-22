//! Command line: JSON Lines on stdout and stderr by default, prose with `--human`.

use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::{ArtifactState, ArtifactStatus, NAGA_VERSION, ShadergenError, check, write};

/// Version of every message type this command writes.
const MESSAGE_VERSION: &str = "1.0.0";

/// `(message type, stream, JSON Schema)` of every message this command writes.
pub(crate) const SCHEMAS: [(&str, &str, &str); 5] = [
    (
        "artifact",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/artifact.schema.json"),
    ),
    (
        "result",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/result.schema.json"),
    ),
    (
        "error",
        "stderr",
        include_str!("../../../schemas/geordi-bijou-shadergen/error.schema.json"),
    ),
    (
        "help",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/help.schema.json"),
    ),
    (
        "schema",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/schema.schema.json"),
    ),
];

const USAGE: &str = "geordi-bijou-shadergen (--check | --write | --schema | --help) [--repo-root <dir>] [--human]";

const OPTIONS: [(&str, &str); 6] = [
    (
        "--check",
        "Compare a fresh generation with the checked-in artifacts. Writes nothing. Exits 1 on any difference.",
    ),
    (
        "--write",
        "Write every generated artifact that differs from the file on disk.",
    ),
    (
        "--repo-root <dir>",
        "Repository root. Defaults to the current directory.",
    ),
    (
        "--schema",
        "Print the JSON Schema of every message type and exit 0.",
    ),
    (
        "--help",
        "Print this description and the schemas of the success and error output.",
    ),
    (
        "--human, --humanize",
        "Write prose instead of JSON Lines.",
    ),
];

const EXIT_CODES: [(u8, &str); 3] = [
    (0, "Success."),
    (1, "Generation failed or checked-in artifacts drifted."),
    (2, "Invalid command line."),
];

#[derive(Clone, Copy, Eq, PartialEq)]
enum Mode {
    Check,
    Write,
    Schema,
    Help,
}

struct Invocation {
    mode: Mode,
    human: bool,
    repo_root: PathBuf,
}

fn usage(detail: impl Into<String>) -> ShadergenError {
    ShadergenError::Usage {
        detail: detail.into(),
    }
}

fn parse(args: &[String], default_root: &Path) -> (bool, Result<Invocation, ShadergenError>) {
    let human = args
        .iter()
        .any(|arg| arg == "--human" || arg == "--humanize");
    let mut mode = None;
    let mut repo_root = default_root.to_path_buf();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let selected = match arg.as_str() {
            "--human" | "--humanize" => continue,
            "--check" => Mode::Check,
            "--write" => Mode::Write,
            "--schema" => Mode::Schema,
            "--help" | "-h" => Mode::Help,
            "--repo-root" => {
                let Some(value) = rest.next() else {
                    return (human, Err(usage("--repo-root needs a directory")));
                };
                repo_root = PathBuf::from(value);
                continue;
            }
            other => return (human, Err(usage(format!("unknown argument: {other}")))),
        };
        if mode.is_some_and(|previous| previous != selected) {
            return (
                human,
                Err(usage(
                    "choose exactly one of --check, --write, --schema, --help",
                )),
            );
        }
        mode = Some(selected);
    }
    let invocation = mode
        .map(|mode| Invocation {
            mode,
            human,
            repo_root,
        })
        .ok_or_else(|| usage("choose one of --check, --write, --schema, --help"));
    (human, invocation)
}

fn tagged(kind: &str, mut body: Value) -> Value {
    body["_schema"] = json!({
        "id": format!("geordi.bijou_shadergen.{kind}"),
        "version": MESSAGE_VERSION,
    });
    body["kind"] = json!(kind);
    body
}

// A closed pipe is the only way these writes fail, and there is nowhere left to report it.
fn emit(stream: &mut dyn Write, line: &Value) {
    let _unused = writeln!(stream, "{line}");
}

fn emit_text(stream: &mut dyn Write, text: &str) {
    let _unused = writeln!(stream, "{text}");
}

fn schema_lines(kinds: &[&str]) -> Vec<Value> {
    SCHEMAS
        .iter()
        .filter(|(kind, _, _)| kinds.contains(kind))
        .map(|(kind, stream, text)| {
            tagged(
                "schema",
                json!({
                    "describes": {
                        "id": format!("geordi.bijou_shadergen.{kind}"),
                        "version": MESSAGE_VERSION,
                    },
                    "stream": stream,
                    // The schema files are compiled in and covered by tests; null marks a
                    // corrupted build rather than hiding it.
                    "schema": serde_json::from_str::<Value>(text).unwrap_or(Value::Null),
                }),
            )
        })
        .collect()
}

fn help_line() -> Value {
    tagged(
        "help",
        json!({
            "command": "geordi-bijou-shadergen",
            "summary": "Assembles bijou-surface.wgsl from the pinned Bunny helpers and the procedural glyph table, translates it to GLSL ES 3.00 with pinned naga, and writes or checks the generated artifacts and their manifest.",
            "usage": USAGE,
            "options": OPTIONS
                .iter()
                .map(|(flag, description)| json!({ "flag": flag, "description": description }))
                .collect::<Vec<_>>(),
            "exitCodes": EXIT_CODES
                .iter()
                .map(|(code, meaning)| json!({ "code": code, "meaning": meaning }))
                .collect::<Vec<_>>(),
        }),
    )
}

fn print_help(human: bool, stdout: &mut dyn Write) {
    if human {
        emit_text(stdout, &format!("Usage: {USAGE}\n"));
        for (flag, description) in OPTIONS {
            emit_text(stdout, &format!("  {flag}\n      {description}"));
        }
        emit_text(stdout, "\nExit codes:");
        for (code, meaning) in EXIT_CODES {
            emit_text(stdout, &format!("  {code}  {meaning}"));
        }
        return;
    }
    emit(stdout, &help_line());
    for line in schema_lines(&["artifact", "result", "error"]) {
        emit(stdout, &line);
    }
}

fn print_schemas(human: bool, stdout: &mut dyn Write) {
    for line in schema_lines(&["artifact", "result", "error", "help", "schema"]) {
        if human {
            emit_text(
                stdout,
                &format!(
                    "{} {} ({})\n{:#}\n",
                    line["describes"]["id"].as_str().unwrap_or_default(),
                    MESSAGE_VERSION,
                    line["stream"].as_str().unwrap_or_default(),
                    line["schema"]
                ),
            );
        } else {
            emit(stdout, &line);
        }
    }
}

fn print_error(human: bool, error: &ShadergenError, stderr: &mut dyn Write) {
    if human {
        emit_text(stderr, &format!("error [{}]: {error}", error.code()));
        return;
    }
    let paths: Vec<&str> = match error {
        ShadergenError::Io { path, .. } | ShadergenError::BunnyDigestMismatch { path, .. } => {
            vec![path.as_str()]
        }
        ShadergenError::Drift { paths } => paths.iter().map(String::as_str).collect(),
        _ => Vec::new(),
    };
    emit(
        stderr,
        &tagged(
            "error",
            json!({ "code": error.code(), "message": error.to_string(), "paths": paths }),
        ),
    );
}

fn print_status(human: bool, mode: &str, status: &ArtifactStatus, stdout: &mut dyn Write) {
    if human {
        emit_text(
            stdout,
            &format!("{:<9} {}", status.state.name(), status.path),
        );
    } else {
        emit(
            stdout,
            &tagged(
                "artifact",
                json!({
                    "mode": mode,
                    "path": status.path,
                    "sha256": status.sha256,
                    "state": status.state.name(),
                }),
            ),
        );
    }
}

fn generate_mode(
    invocation: &Invocation,
    stdout: &mut dyn Write,
) -> Result<(), ShadergenError> {
    let (mode, statuses) = if invocation.mode == Mode::Write {
        ("write", write(&invocation.repo_root)?)
    } else {
        ("check", check(&invocation.repo_root)?)
    };
    for status in &statuses {
        print_status(invocation.human, mode, status, stdout);
    }
    let drifted: Vec<String> = statuses
        .iter()
        .filter(|status| matches!(status.state, ArtifactState::Drift | ArtifactState::Missing))
        .map(|status| status.path.clone())
        .collect();
    if !drifted.is_empty() {
        return Err(ShadergenError::Drift { paths: drifted });
    }
    if invocation.human {
        emit_text(
            stdout,
            &format!(
                "{mode}: {} artifact(s) agree with naga {NAGA_VERSION}",
                statuses.len()
            ),
        );
    } else {
        emit(
            stdout,
            &tagged(
                "result",
                json!({
                    "mode": mode,
                    "ok": true,
                    "artifacts": statuses.len(),
                    "nagaVersion": NAGA_VERSION,
                }),
            ),
        );
    }
    Ok(())
}

/// Runs the command line and returns the process exit code.
///
/// `args` excludes the program name. `default_root` is the repository root used when
/// `--repo-root` is absent. Every line written to `stdout` or `stderr` is one JSON object, unless
/// `--human` is present.
pub fn run(
    args: &[String],
    default_root: &Path,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
) -> u8 {
    let (human, parsed) = parse(args, default_root);
    let invocation = match parsed {
        Ok(invocation) => invocation,
        Err(error) => {
            print_error(human, &error, stderr);
            return 2;
        }
    };
    match invocation.mode {
        Mode::Help => {
            print_help(human, stdout);
            0
        }
        Mode::Schema => {
            print_schemas(human, stdout);
            0
        }
        Mode::Check | Mode::Write => match generate_mode(&invocation, stdout) {
            Ok(()) => 0,
            Err(error) => {
                print_error(human, &error, stderr);
                1
            }
        },
    }
}
