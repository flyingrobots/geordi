//! Command line: JSON Lines on stdout and stderr by default, prose with `--human`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use geordi_bijou_shadergen::sha256_hex;
use serde_json::{Value, json};

use super::error::{ErrorCode, ProofError};
use super::frame::{DEFAULT_BG, DEFAULT_FG, FrameSpec, format_hex_color, parse_hex_color};
use super::glyph_pack::{GLYPH_PACK_PATH, GlyphPack};
use super::gpu::{AdapterPolicy, EvidenceLevel, RenderOutcome, render_offscreen};
use super::intake::{MAX_INPUT_BYTES, PackedCells, describe, parse_packed_cells};
use super::json::is_sha256_hex;
use super::prepare::{PreparedCells, prepare_cells};
use super::profile::BACKEND_PROFILE;
use super::receipt::{ReceiptParts, build_receipt, probe_bindings, serialize_receipt};
use super::shader::ShaderBundle;

/// Version of every message type this command writes.
const MESSAGE_VERSION: &str = "1.0.0";

/// Name of the prepared cell layout, as the `prepared` message reports it.
const PREPARED_LAYOUT: &str = "bijou-surface-gpu/1 rgba32uint, 16 bytes per cell, little-endian";

/// `(message type, stream, JSON Schema)` of every message this command writes.
const SCHEMAS: [(&str, &str, &str); 8] = [
    (
        "intake",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/intake.schema.json"),
    ),
    (
        "prepared",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/prepared.schema.json"),
    ),
    (
        "adapter",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/adapter.schema.json"),
    ),
    (
        "receipt",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/receipt.schema.json"),
    ),
    (
        "result",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/result.schema.json"),
    ),
    (
        "error",
        "stderr",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/error.schema.json"),
    ),
    (
        "help",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/help.schema.json"),
    ),
    (
        "schema",
        "stdout",
        include_str!("../../../../schemas/geordi-bijou-wgpu-proof/schema.schema.json"),
    ),
];

const USAGE: &str = "geordi-bijou-wgpu-proof (--render <packed-cells.json> | --schema | --help) [--repo-root <dir>] [--canvas <W>x<H>] [--default-fg <#RRGGBB>] [--default-bg <#RRGGBB>] [--receipt-out <file>] [--expect-frame-sha256 <hex>] [--require-gpu] [--deny-adapter] [--human]";

const OPTIONS: [(&str, &str); 12] = [
    (
        "--render <packed-cells.json>",
        "Validate a packed-bijou-cells/1 receipt, prepare it, render it offscreen with wgpu, read the pixels back and write the endpoint receipt.",
    ),
    (
        "--repo-root <dir>",
        "Repository root that holds the shader, its manifest and the glyph pack. Defaults to the current directory.",
    ),
    (
        "--canvas <W>x<H>",
        "Canvas size in physical pixels. Defaults to the exact size of the grid. Must not be smaller than the grid.",
    ),
    (
        "--default-fg <#RRGGBB>",
        "Default foreground, uppercase. Defaults to #E6EDF3.",
    ),
    (
        "--default-bg <#RRGGBB>",
        "Default background, uppercase. Defaults to #0D1117.",
    ),
    (
        "--receipt-out <file>",
        "Also write the endpoint receipt to this file as canonical JSON.",
    ),
    (
        "--expect-frame-sha256 <hex>",
        "Fail with GEORDI_E_BIJOU_FRAME_HASH_MISMATCH unless the frame read back hashes to this digest. Not checked when no frame is read back.",
    ),
    (
        "--require-gpu",
        "Fail unless a hardware GPU adapter executed the frame. A refusal or a software adapter exits 1.",
    ),
    (
        "--deny-adapter",
        "Request no adapter and report the backend as unavailable. The negative capability lane.",
    ),
    (
        "--schema",
        "Print the JSON Schema of every message type and exit 0.",
    ),
    (
        "--help",
        "Print this description and the schemas of the success and error output.",
    ),
    ("--human, --humanize", "Write prose instead of JSON Lines."),
];

const EXIT_CODES: [(u8, &str); 3] = [
    (
        0,
        "Success. Read `outcome` in the result line: `capability-refused` is a typed refusal, not a rendering pass.",
    ),
    (
        1,
        "The input was refused, rendering failed, or --require-gpu or --expect-frame-sha256 was not satisfied.",
    ),
    (2, "Invalid command line."),
];

struct RenderRequest {
    input: String,
    canvas: Option<(u32, u32)>,
    default_fg: [u8; 3],
    default_bg: [u8; 3],
    receipt_out: Option<String>,
    expect_frame_sha256: Option<String>,
    require_gpu: bool,
    policy: AdapterPolicy,
}

enum Mode {
    Render(Box<RenderRequest>),
    Schema,
    Help,
}

struct Invocation {
    mode: Mode,
    human: bool,
    repo_root: PathBuf,
}

fn usage(detail: impl Into<String>) -> ProofError {
    ProofError::new(ErrorCode::Usage, "", detail)
}

fn parse_canvas(text: &str) -> Option<(u32, u32)> {
    let (width, height) = text.split_once('x')?;
    let edge = |digits: &str| -> Option<u32> {
        if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        digits.parse().ok().filter(|value| *value >= 1)
    };
    Some((edge(width)?, edge(height)?))
}

fn parse(args: &[String], default_root: &Path) -> Result<Invocation, ProofError> {
    let human = args
        .iter()
        .any(|arg| arg == "--human" || arg == "--humanize");
    let mut modes: Vec<&str> = Vec::new();
    let mut render_only: Option<&str> = None;
    let mut request = RenderRequest {
        input: String::new(),
        canvas: None,
        default_fg: DEFAULT_FG,
        default_bg: DEFAULT_BG,
        receipt_out: None,
        expect_frame_sha256: None,
        require_gpu: false,
        policy: AdapterPolicy::Auto,
    };
    let mut repo_root = default_root.to_path_buf();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let flag = arg.as_str();
        let mut value = |what: &str| {
            rest.next()
                .cloned()
                .ok_or_else(|| usage(format!("{flag} needs {what}")))
        };
        match flag {
            "--human" | "--humanize" => {}
            "--schema" | "--help" | "-h" => modes.push(flag),
            "--render" => {
                request.input = value("a packed-bijou-cells/1 file")?;
                modes.push(flag);
            }
            "--repo-root" => repo_root = PathBuf::from(value("a directory")?),
            "--canvas" => {
                let text = value("a size such as 640x384")?;
                request.canvas = Some(parse_canvas(&text).ok_or_else(|| {
                    usage(format!(
                        "--canvas expects <W>x<H> in pixels, each at least 1: {text}"
                    ))
                })?);
                render_only = Some(flag);
            }
            "--default-fg" | "--default-bg" => {
                let text = value("a colour")?;
                let color = parse_hex_color(&text)
                    .ok_or_else(|| usage(format!("{flag} expects uppercase #RRGGBB: {text}")))?;
                if flag == "--default-fg" {
                    request.default_fg = color;
                } else {
                    request.default_bg = color;
                }
                render_only = Some(flag);
            }
            "--receipt-out" => {
                request.receipt_out = Some(value("a file")?);
                render_only = Some(flag);
            }
            "--expect-frame-sha256" => {
                let text = value("a digest")?;
                if !is_sha256_hex(&text) {
                    return Err(usage(format!(
                        "--expect-frame-sha256 expects 64 lowercase hexadecimal digits: {text}"
                    )));
                }
                request.expect_frame_sha256 = Some(text);
                render_only = Some(flag);
            }
            "--require-gpu" => {
                request.require_gpu = true;
                render_only = Some(flag);
            }
            "--deny-adapter" => {
                request.policy = AdapterPolicy::Deny;
                render_only = Some(flag);
            }
            other => return Err(usage(format!("unknown argument: {other}"))),
        }
    }
    let mode = match modes.as_slice() {
        [] => return Err(usage("choose one of --render, --schema, --help")),
        ["--render"] => Mode::Render(Box::new(request)),
        [mode] => {
            if let Some(flag) = render_only {
                return Err(usage(format!("{flag} applies only to --render")));
            }
            if *mode == "--schema" {
                Mode::Schema
            } else {
                Mode::Help
            }
        }
        _ => return Err(usage("choose exactly one of --render, --schema, --help")),
    };
    Ok(Invocation {
        mode,
        human,
        repo_root,
    })
}

fn tagged(kind: &str, mut body: Value) -> Value {
    body["_schema"] = json!({
        "id": format!("geordi.bijou_wgpu_proof.{kind}"),
        "version": MESSAGE_VERSION,
    });
    body["kind"] = json!(kind);
    body
}

/// Writes one message: a JSON line, or its prose form with `--human`.
struct Output<'a> {
    human: bool,
    stdout: &'a mut dyn Write,
}

impl Output<'_> {
    // A closed pipe is the only way these writes fail, and there is nowhere left to report it.
    fn message(&mut self, kind: &str, body: Value, prose: &str) {
        let _unused = if self.human {
            writeln!(self.stdout, "{prose}")
        } else {
            writeln!(self.stdout, "{}", tagged(kind, body))
        };
    }
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
                        "id": format!("geordi.bijou_wgpu_proof.{kind}"),
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

fn print_help(output: &mut Output<'_>) {
    let mut prose = format!("Usage: {USAGE}\n");
    let options: Vec<String> = OPTIONS
        .iter()
        .map(|(flag, description)| format!("\n  {flag}\n      {description}"))
        .collect();
    prose.push_str(&options.concat());
    prose.push_str("\n\nExit codes:");
    let codes: Vec<String> = EXIT_CODES
        .iter()
        .map(|(code, meaning)| format!("\n  {code}  {meaning}"))
        .collect();
    prose.push_str(&codes.concat());
    let body = json!({
        "command": "geordi-bijou-wgpu-proof",
        "summary": "Bounded offscreen wgpu proof for bijou-surface-gpu/1: validates one packed-bijou-cells/1 receipt, prepares the rgba32uint cell record, renders it with the canonical bijou-surface.wgsl into an rgba8uint target, reads the pixels back and writes a geordi-bijou-gpu-receipt/1 endpoint receipt. It opens no window.",
        "usage": USAGE,
        "options": OPTIONS
            .iter()
            .map(|(flag, description)| json!({ "flag": flag, "description": description }))
            .collect::<Vec<_>>(),
        "exitCodes": EXIT_CODES
            .iter()
            .map(|(code, meaning)| json!({ "code": code, "meaning": meaning }))
            .collect::<Vec<_>>(),
    });
    output.message("help", body, &prose);
    if !output.human {
        for line in schema_lines(&[
            "intake", "prepared", "adapter", "receipt", "result", "error",
        ]) {
            let _unused = writeln!(output.stdout, "{line}");
        }
    }
}

fn print_schemas(output: &mut Output<'_>) {
    let kinds = SCHEMAS.map(|(kind, _, _)| kind);
    for line in schema_lines(&kinds) {
        let _unused = if output.human {
            writeln!(
                output.stdout,
                "{} {MESSAGE_VERSION} ({})\n{:#}\n",
                line["describes"]["id"].as_str().unwrap_or_default(),
                line["stream"].as_str().unwrap_or_default(),
                line["schema"]
            )
        } else {
            writeln!(output.stdout, "{line}")
        };
    }
}

fn print_error(human: bool, error: &ProofError, stderr: &mut dyn Write) {
    let _unused = if human {
        writeln!(stderr, "error [{}]: {error}", error.code.as_str())
    } else {
        let body = json!({
            "code": error.code.as_str(),
            "message": error.to_string(),
            "path": error.path,
        });
        writeln!(stderr, "{}", tagged("error", body))
    };
}

fn read_file(path: &Path, shown: &str) -> Result<Vec<u8>, ProofError> {
    let io = |detail: String| ProofError::new(ErrorCode::Io, shown, detail);
    let length = fs::metadata(path)
        .map_err(|error| io(format!("cannot read: {error}")))?
        .len();
    if length > MAX_INPUT_BYTES as u64 {
        return Err(io(format!(
            "file is {length} bytes; the limit is {MAX_INPUT_BYTES}"
        )));
    }
    fs::read(path).map_err(|error| io(format!("cannot read: {error}")))
}

fn adapter_message(request: &RenderRequest, outcome: &RenderOutcome) -> (Value, String) {
    let policy = match request.policy {
        AdapterPolicy::Auto => "auto",
        AdapterPolicy::Deny => "deny",
    };
    let evidence = outcome.evidence_level().name();
    match outcome {
        RenderOutcome::Rendered { adapter, .. } => (
            json!({
                "policy": policy,
                "available": true,
                "evidenceLevel": evidence,
                "backend": adapter.backend,
                "name": adapter.name,
                "driver": adapter.driver,
                "driverInfo": adapter.driver_info,
                "deviceClass": adapter.device_class.name(),
                "vendor": adapter.vendor,
                "device": adapter.device,
                "detail": format!(
                    "frame executed by a {} adapter",
                    adapter.device_class.name()
                ),
            }),
            format!(
                "adapter: {} ({}, {}) -> {evidence}",
                adapter.name,
                adapter.backend,
                adapter.device_class.name()
            ),
        ),
        RenderOutcome::Unavailable { detail } => (
            json!({
                "policy": policy,
                "available": false,
                "evidenceLevel": evidence,
                "backend": null,
                "name": null,
                "driver": null,
                "driverInfo": null,
                "deviceClass": null,
                "vendor": null,
                "device": null,
                "detail": detail,
            }),
            format!("adapter: none -> {evidence}: {detail}"),
        ),
    }
}

/// Why a run supports no hardware GPU claim, or `None` when it does.
fn obstruction(outcome: &RenderOutcome) -> Option<ProofError> {
    match outcome {
        RenderOutcome::Unavailable { detail } => Some(ProofError::new(
            ErrorCode::BackendUnavailable,
            "",
            format!("no wgpu adapter executed the frame: {detail}"),
        )),
        RenderOutcome::Rendered { adapter, .. } => {
            (outcome.evidence_level() != EvidenceLevel::GpuProbed).then(|| {
                ProofError::new(
                    ErrorCode::HardwareGpuRequired,
                    "",
                    format!(
                        "adapter {} has device class {}; the frame is software-probed and supports no hardware GPU claim",
                        adapter.name,
                        adapter.device_class.name()
                    ),
                )
            })
        }
    }
}

fn render(
    request: &RenderRequest,
    repo_root: &Path,
    output: &mut Output<'_>,
) -> Result<(), ProofError> {
    let pack_bytes = read_file(&repo_root.join(GLYPH_PACK_PATH), GLYPH_PACK_PATH)?;
    let pack = GlyphPack::parse(&pack_bytes)?;
    let cells = parse_packed_cells(
        &read_file(Path::new(&request.input), &request.input)?,
        &pack,
    )?;
    emit_intake(request, &cells, output);

    let prepared = prepare_cells(&cells, &pack)?;
    let frame = FrameSpec::new(
        &prepared,
        &pack,
        request.canvas,
        request.default_fg,
        request.default_bg,
    )?;
    let shader = ShaderBundle::load(repo_root)?;
    emit_prepared(
        &prepared,
        &pack,
        &sha256_hex(&pack_bytes),
        &frame,
        &shader,
        output,
    );

    let outcome = render_offscreen(&shader, &prepared, &pack, &frame, request.policy)?;
    let (adapter_body, adapter_prose) = adapter_message(request, &outcome);
    output.message("adapter", adapter_body, &adapter_prose);

    let parts = ReceiptParts {
        cells: &cells,
        prepared: &prepared,
        pack: &pack,
        shader: &shader,
        frame: &frame,
        outcome: &outcome,
    };
    let frame_sha256 = emit_receipt(request, &parts, output)?;

    let obstruction = obstruction(&outcome);
    if request.require_gpu
        && let Some(error) = obstruction.clone()
    {
        return Err(error);
    }
    let frame_comparison = compare_frame(request.expect_frame_sha256.as_deref(), &frame_sha256)?;
    emit_result(
        outcome.evidence_level(),
        &frame_sha256,
        frame_comparison,
        obstruction,
        output,
    );
    Ok(())
}

fn emit_intake(request: &RenderRequest, cells: &PackedCells, output: &mut Output<'_>) {
    output.message(
        "intake",
        json!({
            "input": request.input,
            "inputReceiptSha256": cells.input_receipt_sha256,
            "cellFormatId": crate::CELL_FORMAT_ID,
            "widthCells": cells.width_cells,
            "heightCells": cells.height_cells,
            "cellCount": cells.width_cells * cells.height_cells,
            "sideTableEntries": cells.side_table.len(),
        }),
        &format!(
            "intake: {} is a valid {}x{} packed-bijou-cells/1 receipt (sha256 {})",
            request.input, cells.width_cells, cells.height_cells, cells.input_receipt_sha256
        ),
    );
}

fn emit_prepared(
    prepared: &PreparedCells,
    pack: &GlyphPack,
    glyph_pack_sha256: &str,
    frame: &FrameSpec,
    shader: &ShaderBundle,
    output: &mut Output<'_>,
) {
    let atlas_uses: Vec<Value> = prepared
        .atlas_uses
        .iter()
        .map(|entry| {
            json!({
                "grapheme": entry.grapheme,
                "codePoints": describe(&entry.grapheme),
                "bold": entry.bold,
                "slot": entry.slot,
                "kind": entry.kind.name(),
                "cells": entry.cells,
            })
        })
        .collect();
    let prepared_sha256 = prepared.sha256();
    output.message(
        "prepared",
        json!({
            "gpuAbiVersion": crate::GPU_ABI_VERSION,
            "backendProfile": BACKEND_PROFILE,
            "preparedLayout": PREPARED_LAYOUT,
            "preparedBufferSha256": prepared_sha256,
            "preparedByteLength": prepared.words.len() * 4,
            "cellPx": { "width": frame.cell_px_w, "height": frame.cell_px_h },
            "canvasPxW": frame.canvas_px_w,
            "canvasPxH": frame.canvas_px_h,
            "defaultFg": format_hex_color(frame.default_fg),
            "defaultBg": format_hex_color(frame.default_bg),
            "fontIdentity": pack.font_identity,
            "glyphPackSha256": glyph_pack_sha256,
            "atlasRgbaSha256": pack.atlas_rgba_sha256,
            "atlasUses": atlas_uses,
            "assembledWgslSha256": shader.assembled_wgsl_sha256,
            "shaderManifestSha256": shader.manifest_sha256,
        }),
        &format!(
            "prepared: {} cells -> {} bytes (sha256 {prepared_sha256}); canvas {}x{}; shader sha256 {}",
            prepared.words.len() / 4,
            prepared.words.len() * 4,
            frame.canvas_px_w,
            frame.canvas_px_h,
            shader.assembled_wgsl_sha256
        ),
    );
}

/// Builds the receipt, writes it when asked, streams the receipt line, and returns the frame
/// digest (`null` when no frame was read back).
fn emit_receipt(
    request: &RenderRequest,
    parts: &ReceiptParts<'_>,
    output: &mut Output<'_>,
) -> Result<Value, ProofError> {
    let receipt = build_receipt(parts);
    if let Some(path) = &request.receipt_out {
        fs::write(path, serialize_receipt(&receipt)).map_err(|error| {
            ProofError::new(
                ErrorCode::Io,
                path.as_str(),
                format!("cannot write: {error}"),
            )
        })?;
    }
    let frame_sha256 = receipt["frameRgbaSha256"].clone();
    let receipt_prose = format!(
        "receipt: {} evidence, frame sha256 {}{}",
        parts.outcome.evidence_level().name(),
        frame_sha256.as_str().unwrap_or("none"),
        request
            .receipt_out
            .as_ref()
            .map_or_else(String::new, |path| format!(", written to {path}"))
    );
    output.message(
        "receipt",
        json!({
            "receipt": receipt,
            "receiptPath": request.receipt_out,
            "probeBindings": probe_bindings(parts),
        }),
        &receipt_prose,
    );
    Ok(frame_sha256)
}

/// Compares the read-back digest with `--expect-frame-sha256`. A refusal has no digest, so the
/// comparison is `not-run` rather than a pass.
fn compare_frame(expected: Option<&str>, actual: &Value) -> Result<&'static str, ProofError> {
    match (expected, actual.as_str()) {
        (None, _) => Ok("not-requested"),
        (Some(_), None) => Ok("not-run"),
        (Some(expected), Some(actual)) if expected == actual => Ok("match"),
        (Some(expected), Some(actual)) => Err(ProofError::new(
            ErrorCode::FrameHashMismatch,
            "",
            format!("frame hashes to {actual}; expected {expected}"),
        )),
    }
}

fn emit_result(
    evidence: EvidenceLevel,
    frame_sha256: &Value,
    frame_comparison: &str,
    obstruction: Option<ProofError>,
    output: &mut Output<'_>,
) {
    let result_prose = format!(
        "result: {}{}",
        evidence.name(),
        obstruction
            .as_ref()
            .map_or_else(String::new, |error| format!(
                " - no hardware GPU claim: {error}"
            ))
    );
    output.message(
        "result",
        json!({
            "ok": true,
            "outcome": evidence.name(),
            "hardwareGpuClaim": evidence == EvidenceLevel::GpuProbed,
            "frameRgbaSha256": frame_sha256,
            "frameComparison": frame_comparison,
            "obstruction": obstruction.map(|error| json!({
                "code": error.code.as_str(),
                "detail": error.detail,
            })),
        }),
        &result_prose,
    );
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
    let human = args
        .iter()
        .any(|arg| arg == "--human" || arg == "--humanize");
    let invocation = match parse(args, default_root) {
        Ok(invocation) => invocation,
        Err(error) => {
            print_error(human, &error, stderr);
            return 2;
        }
    };
    let mut output = Output {
        human: invocation.human,
        stdout,
    };
    match invocation.mode {
        Mode::Help => {
            print_help(&mut output);
            0
        }
        Mode::Schema => {
            print_schemas(&mut output);
            0
        }
        Mode::Render(request) => match render(&request, &invocation.repo_root, &mut output) {
            Ok(()) => 0,
            Err(error) => {
                print_error(human, &error, stderr);
                1
            }
        },
    }
}
