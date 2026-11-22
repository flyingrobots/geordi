//! The command line: every line is a JSON object that validates against its declared schema.

use std::error::Error;
use std::fs;
use std::path::Path;

use serde_json::{Value, json};

use super::support::{
    EMPTY_CELL, NEGATIVE_WIDE, PAINT, RECEIPT_DIR, TempDir, TestResult, read_repo, receipt,
    repo_root, suite_frame,
};
use crate::{ErrorCode, run};

const SCHEMA_DIR: &str = "schemas/geordi-bijou-wgpu-proof";
const KINDS: [&str; 8] = [
    "intake", "prepared", "adapter", "receipt", "result", "error", "help", "schema",
];

fn run_cli(args: &[&str], root: &Path) -> (u8, String, String) {
    let args: Vec<String> = args.iter().map(|arg| (*arg).to_owned()).collect();
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let code = run(&args, root, &mut stdout, &mut stderr);
    (
        code,
        String::from_utf8_lossy(&stdout).into_owned(),
        String::from_utf8_lossy(&stderr).into_owned(),
    )
}

fn repo_file(path: &str) -> String {
    repo_root().join(path).to_string_lossy().into_owned()
}

// ---------------------------------------------------------------------------------------------
// Minimal JSON Schema validator for the keywords the message schemas use.
// ---------------------------------------------------------------------------------------------

fn type_matches(name: &str, value: &Value) -> bool {
    match name {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.is_u64() || value.is_i64(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => false,
    }
}

fn validate(schema: &Value, value: &Value, at: &str) -> Result<(), String> {
    let Some(schema) = schema.as_object() else {
        return Err(format!("{at}: schema must be an object"));
    };
    for (keyword, rule) in schema {
        match keyword.as_str() {
            "$schema" | "$id" | "title" | "description" | "x-schema-id" | "x-schema-version" => {}
            "type" => {
                // A string names one type; an array names alternatives.
                let names: Vec<&str> = match rule {
                    Value::String(name) => vec![name.as_str()],
                    Value::Array(names) => names.iter().filter_map(Value::as_str).collect(),
                    _ => Vec::new(),
                };
                if !names.iter().any(|name| type_matches(name, value)) {
                    return Err(format!("{at}: expected {rule}, found {value}"));
                }
            }
            "const" => {
                if rule != value {
                    return Err(format!("{at}: expected {rule}, found {value}"));
                }
            }
            "enum" => {
                if !rule
                    .as_array()
                    .is_some_and(|options| options.contains(value))
                {
                    return Err(format!("{at}: {value} is not one of {rule}"));
                }
            }
            "minLength" => {
                let length = value.as_str().map(|text| text.chars().count() as u64);
                if value.is_string() && length < rule.as_u64() {
                    return Err(format!("{at}: minLength {rule} violated by {value}"));
                }
            }
            "minimum" => {
                if value.is_number() && value.as_u64() < rule.as_u64() {
                    return Err(format!("{at}: minimum {rule} violated by {value}"));
                }
            }
            "required" => {
                for name in rule.as_array().into_iter().flatten() {
                    let name = name.as_str().unwrap_or_default();
                    if value.get(name).is_none() {
                        return Err(format!("{at}: missing required member {name}"));
                    }
                }
            }
            "properties" => {
                for (name, member_schema) in rule.as_object().into_iter().flatten() {
                    if let Some(member) = value.get(name) {
                        validate(member_schema, member, &format!("{at}.{name}"))?;
                    }
                }
            }
            "additionalProperties" => {
                if rule != &Value::Bool(false) {
                    return Err(format!(
                        "{at}: only additionalProperties false is supported"
                    ));
                }
                let known = schema.get("properties").and_then(Value::as_object);
                for name in value
                    .as_object()
                    .into_iter()
                    .flat_map(|object| object.keys())
                {
                    if !known.is_some_and(|known| known.contains_key(name)) {
                        return Err(format!("{at}: unexpected member {name}"));
                    }
                }
            }
            "items" => {
                for (index, item) in value.as_array().into_iter().flatten().enumerate() {
                    validate(rule, item, &format!("{at}[{index}]"))?;
                }
            }
            other => return Err(format!("{at}: unsupported schema keyword {other}")),
        }
    }
    Ok(())
}

/// Asserts that every line of `stream` is a JSON object that validates against the checked-in
/// schema its `_schema` member names, and returns the parsed lines.
fn validated_lines(stream: &str) -> Result<Vec<Value>, Box<dyn Error>> {
    let mut lines = Vec::new();
    for line in stream.lines() {
        let value: Value = serde_json::from_str(line)
            .map_err(|error| format!("not a JSON line ({error}): {line}"))?;
        let id = value["_schema"]["id"]
            .as_str()
            .ok_or("no _schema.id")?
            .to_owned();
        let kind = value["kind"].as_str().ok_or("no kind")?;
        assert_eq!(id, format!("geordi.bijou_wgpu_proof.{kind}"), "{line}");
        assert_eq!(value["_schema"]["version"], "1.0.0", "{line}");
        let schema: Value = serde_json::from_slice(&read_repo(&format!(
            "{SCHEMA_DIR}/{}.schema.json",
            kind.replace('_', "-")
        ))?)?;
        assert_eq!(schema["x-schema-id"], id.as_str());
        assert_eq!(schema["x-schema-version"], "1.0.0");
        validate(&schema, &value, &id)?;
        lines.push(value);
    }
    Ok(lines)
}

fn kinds(lines: &[Value]) -> Vec<&str> {
    lines
        .iter()
        .filter_map(|line| line["kind"].as_str())
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Help, schemas, usage
// ---------------------------------------------------------------------------------------------

#[test]
fn every_help_schema_and_usage_line_validates_against_its_declared_schema() -> TestResult {
    let (code, stdout, stderr) = run_cli(&["--help"], &repo_root());
    assert_eq!((code, stderr.as_str()), (0, ""));
    let help = validated_lines(&stdout)?;
    assert_eq!(help[0]["kind"], "help");
    let described: Vec<&str> = help[1..]
        .iter()
        .filter_map(|line| line["describes"]["id"].as_str())
        .collect();
    assert_eq!(
        described,
        [
            "geordi.bijou_wgpu_proof.intake",
            "geordi.bijou_wgpu_proof.prepared",
            "geordi.bijou_wgpu_proof.adapter",
            "geordi.bijou_wgpu_proof.receipt",
            "geordi.bijou_wgpu_proof.result",
            "geordi.bijou_wgpu_proof.error",
        ],
        "the success output and every error type"
    );

    let (code, stdout, stderr) = run_cli(&["--schema"], &repo_root());
    assert_eq!((code, stderr.as_str()), (0, ""));
    let schemas = validated_lines(&stdout)?;
    assert_eq!(schemas.len(), KINDS.len());
    for (line, kind) in schemas.iter().zip(KINDS) {
        assert_eq!(
            line["describes"]["id"],
            format!("geordi.bijou_wgpu_proof.{kind}")
        );
        let on_disk: Value =
            serde_json::from_slice(&read_repo(&format!("{SCHEMA_DIR}/{kind}.schema.json"))?)?;
        assert_eq!(
            line["schema"], on_disk,
            "{kind}: the binary carries the checked-in schema"
        );
        assert_eq!(
            line["stream"],
            if kind == "error" { "stderr" } else { "stdout" }
        );
    }
    let error_schema: Value =
        serde_json::from_slice(&read_repo(&format!("{SCHEMA_DIR}/error.schema.json"))?)?;
    assert_eq!(
        error_schema["properties"]["code"]["enum"],
        json!(ErrorCode::ALL.map(ErrorCode::as_str)),
        "the error schema lists every error code"
    );

    let paint = repo_file(PAINT);
    for args in [
        &[][..],
        &["--frobnicate"],
        &["--render"],
        &["--render", &paint, "--schema"],
        &["--render", &paint, "--canvas", "67"],
        &["--render", &paint, "--canvas", "0x0"],
        &["--render", &paint, "--default-fg", "#e6edf3"],
        &["--render", &paint, "--expect-frame-sha256", "abc"],
        &["--render", &paint, "--repo-root"],
        &["--schema", "--deny-adapter"],
    ] {
        let (code, stdout, stderr) = run_cli(args, &repo_root());
        assert_eq!(code, 2, "{args:?}");
        assert_eq!(stdout, "", "{args:?}");
        let errors = validated_lines(&stderr)?;
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0]["code"], "GEORDI_E_BIJOU_WGPU_USAGE", "{args:?}");
    }
    Ok(())
}

#[test]
fn human_flag_switches_every_stream_to_prose() {
    let paint = repo_file(PAINT);
    for args in [
        &["--render", &paint, "--deny-adapter", "--human"][..],
        &["--humanize", "--help"],
        &["--schema", "--human"],
    ] {
        let (code, stdout, _) = run_cli(args, &repo_root());
        assert_eq!(code, 0, "{args:?}");
        assert_ne!(stdout, "");
        for line in stdout.lines().filter(|line| line.starts_with('{')) {
            assert!(
                serde_json::from_str::<Value>(line).is_err(),
                "{args:?}: {line}"
            );
        }
        let first = stdout.lines().next().unwrap_or_default();
        assert!(
            serde_json::from_str::<Value>(first).is_err(),
            "{args:?}: {first}"
        );
    }
    let (code, stdout, stderr) = run_cli(&["--human"], &repo_root());
    assert_eq!((code, stdout.as_str()), (2, ""));
    assert!(
        stderr.starts_with("error [GEORDI_E_BIJOU_WGPU_USAGE]: "),
        "{stderr}"
    );
}

// ---------------------------------------------------------------------------------------------
// The negative capability lane: deterministic on every host
// ---------------------------------------------------------------------------------------------

#[test]
fn a_denied_adapter_streams_a_typed_refusal_and_never_a_pass() -> TestResult {
    let temp = TempDir::new("cli-refusal")?;
    let out = temp.root.join("refusal.receipt.json");
    let out_arg = out.to_string_lossy().into_owned();
    let paint = repo_file(PAINT);
    let args = [
        "--render",
        &paint,
        "--canvas",
        "67x117",
        "--deny-adapter",
        "--receipt-out",
        &out_arg,
    ];
    let (code, stdout, stderr) = run_cli(&args, &repo_root());
    assert_eq!((code, stderr.as_str()), (0, ""));
    let lines = validated_lines(&stdout)?;
    assert_eq!(
        kinds(&lines),
        ["intake", "prepared", "adapter", "receipt", "result"]
    );

    let golden = suite_frame("paint")?;
    assert_eq!(lines[0]["inputReceiptSha256"], golden["inputReceiptSha256"]);
    assert_eq!(
        (&lines[0]["widthCells"], &lines[0]["heightCells"]),
        (&json!(8), &json!(7))
    );
    assert_eq!(
        lines[1]["preparedBufferSha256"],
        golden["preparedBufferSha256"]
    );
    assert_eq!(
        lines[1]["preparedLayout"],
        "bijou-surface-gpu/1 rgba32uint, 16 bytes per cell, little-endian"
    );
    assert_eq!(lines[1]["atlasUses"].as_array().map(Vec::len), Some(8));
    assert_eq!(lines[2]["available"], false);
    assert_eq!(lines[2]["policy"], "deny");
    assert_eq!(lines[2]["evidenceLevel"], "capability-refused");

    let result = &lines[4];
    assert_eq!(result["outcome"], "capability-refused");
    assert_eq!(result["hardwareGpuClaim"], false);
    assert_eq!(result["frameRgbaSha256"], Value::Null);
    assert_eq!(result["frameComparison"], "not-requested");
    assert_eq!(
        result["obstruction"]["code"],
        "GEORDI_E_BIJOU_BACKEND_UNAVAILABLE"
    );

    // The receipt line, the file written, and the checked-in refusal are the same document.
    let written = fs::read_to_string(&out)?;
    assert_eq!(
        serde_json::from_str::<Value>(&written)?,
        lines[3]["receipt"]
    );
    assert_eq!(lines[3]["receiptPath"], out_arg.as_str());
    assert_eq!(lines[3]["probeBindings"], json!([]));
    assert_eq!(
        written.as_bytes(),
        read_repo(&format!(
            "{RECEIPT_DIR}/width1-paint.capability-refused.receipt.json"
        ))?
    );

    // An expected digest cannot be confirmed by a refusal, and the result says so.
    let expected = golden["frameRgbaSha256"].as_str().ok_or("no golden")?;
    let args = [
        "--render",
        &paint,
        "--canvas",
        "67x117",
        "--deny-adapter",
        "--expect-frame-sha256",
        expected,
    ];
    let (code, stdout, _) = run_cli(&args, &repo_root());
    assert_eq!(code, 0);
    assert_eq!(validated_lines(&stdout)?[4]["frameComparison"], "not-run");
    Ok(())
}

#[test]
fn require_gpu_turns_a_refusal_into_a_failure() -> TestResult {
    let paint = repo_file(PAINT);
    let (code, stdout, stderr) = run_cli(
        &["--render", &paint, "--deny-adapter", "--require-gpu"],
        &repo_root(),
    );
    assert_eq!(code, 1);
    let lines = validated_lines(&stdout)?;
    assert_eq!(
        kinds(&lines),
        ["intake", "prepared", "adapter", "receipt"],
        "no result line"
    );
    assert_eq!(lines[3]["receipt"]["evidenceLevel"], "capability-refused");
    let errors = validated_lines(&stderr)?;
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0]["code"], "GEORDI_E_BIJOU_BACKEND_UNAVAILABLE");
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Refusals that precede any adapter request
// ---------------------------------------------------------------------------------------------

#[test]
fn invalid_input_is_refused_before_the_adapter_is_asked_for() -> TestResult {
    let (code, stdout, stderr) = run_cli(&["--render", &repo_file(NEGATIVE_WIDE)], &repo_root());
    assert_eq!((code, stdout.as_str()), (1, ""));
    let errors = validated_lines(&stderr)?;
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0]["code"], "GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH");
    assert_eq!(errors[0]["path"], "$.bytes[0]");

    // A grid wider than the profile's largest texture: valid cells, refused geometry.
    let temp = TempDir::new("cli-oversize")?;
    let wide = temp.root.join("wide.json");
    fs::write(
        &wide,
        receipt(1025, 1, &vec![EMPTY_CELL; 1025], &[]).to_string(),
    )?;
    let (code, stdout, stderr) = run_cli(&["--render", &wide.to_string_lossy()], &repo_root());
    assert_eq!(code, 1);
    assert_eq!(
        kinds(&validated_lines(&stdout)?),
        ["intake"],
        "no prepared, adapter or receipt line"
    );
    assert_eq!(
        validated_lines(&stderr)?[0]["code"],
        "GEORDI_E_BIJOU_WGPU_RESOURCE_LIMIT"
    );

    let (code, stdout, stderr) = run_cli(&["--render", "does/not/exist.json"], &repo_root());
    assert_eq!((code, stdout.as_str()), (1, ""));
    assert_eq!(
        validated_lines(&stderr)?[0]["code"],
        "GEORDI_E_BIJOU_WGPU_IO"
    );

    let paint = repo_file(PAINT);
    let (code, _, stderr) = run_cli(
        &[
            "--render",
            &paint,
            "--repo-root",
            &temp.root.to_string_lossy(),
        ],
        &repo_root(),
    );
    assert_eq!(code, 1);
    assert_eq!(
        validated_lines(&stderr)?[0]["code"],
        "GEORDI_E_BIJOU_WGPU_IO"
    );
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// The positive lane
// ---------------------------------------------------------------------------------------------

#[test]
#[ignore = "needs a wgpu adapter"]
fn rendering_streams_a_probed_receipt_and_checks_the_expected_frame_digest() -> TestResult {
    let paint = repo_file(PAINT);
    let golden = suite_frame("paint")?;
    let expected = golden["frameRgbaSha256"].as_str().ok_or("no golden")?;
    let args = [
        "--render",
        &paint,
        "--canvas",
        "67x117",
        "--expect-frame-sha256",
        expected,
    ];
    let (code, stdout, stderr) = run_cli(&args, &repo_root());
    assert_eq!((code, stderr.as_str()), (0, ""));
    let lines = validated_lines(&stdout)?;
    assert_eq!(
        kinds(&lines),
        ["intake", "prepared", "adapter", "receipt", "result"]
    );
    assert_eq!(
        lines[2]["available"], true,
        "no adapter: this host gives no pixel evidence"
    );
    let result = &lines[4];
    let outcome = result["outcome"].as_str().ok_or("no outcome")?;
    assert!(
        ["gpu-probed", "software-probed"].contains(&outcome),
        "{outcome}"
    );
    assert_eq!(result["hardwareGpuClaim"], outcome == "gpu-probed");
    assert_eq!(result["frameRgbaSha256"], expected);
    assert_eq!(result["frameComparison"], "match");
    assert_eq!(lines[3]["receipt"]["evidenceLevel"], outcome);
    assert_eq!(lines[3]["receipt"]["frameRgbaSha256"], expected);
    assert_eq!(lines[3]["probeBindings"].as_array().map(Vec::len), Some(57));

    let wrong = "0".repeat(64);
    let args = [
        "--render",
        &paint,
        "--canvas",
        "67x117",
        "--expect-frame-sha256",
        &wrong,
    ];
    let (code, stdout, stderr) = run_cli(&args, &repo_root());
    assert_eq!(code, 1);
    assert_eq!(
        kinds(&validated_lines(&stdout)?),
        ["intake", "prepared", "adapter", "receipt"]
    );
    assert_eq!(
        validated_lines(&stderr)?[0]["code"],
        "GEORDI_E_BIJOU_FRAME_HASH_MISMATCH"
    );
    Ok(())
}
