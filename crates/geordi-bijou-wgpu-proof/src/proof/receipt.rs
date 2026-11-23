//! The `geordi-bijou-gpu-receipt/1` endpoint receipt of a run.

use std::fmt::Write as _;

use geordi_bijou_shadergen::{BUNNY_PRIMITIVES, GPU_ABI_VERSION, sha256_hex};
use serde_json::{Value, json};

use super::frame::{FrameSpec, format_hex_color};
use super::glyph_pack::{GlyphKind, GlyphPack};
use super::gpu::RenderOutcome;
use super::intake::{CELL_STRIDE, PackedCells};
use super::prepare::PreparedCells;
use super::profile::BACKEND_PROFILE;
use super::shader::ShaderBundle;

/// Receipt `receiptVersion`.
pub const RECEIPT_VERSION: &str = "geordi-bijou-gpu-receipt/1";

/// Everything a receipt is derived from.
#[derive(Clone, Copy, Debug)]
pub struct ReceiptParts<'a> {
    /// The validated input.
    pub cells: &'a PackedCells,
    /// The prepared cell grid.
    pub prepared: &'a PreparedCells,
    /// The glyph pack.
    pub pack: &'a GlyphPack,
    /// The shader that was, or would have been, executed.
    pub shader: &'a ShaderBundle,
    /// Frame geometry and theme defaults.
    pub frame: &'a FrameSpec,
    /// What rendering produced.
    pub outcome: &'a RenderOutcome,
}

fn pixel(rgba: &[u8], frame: &FrameSpec, px: u32, py: u32) -> Value {
    let offset = (py as usize * frame.canvas_px_w as usize + px as usize) * 4;
    // An out-of-range read cannot happen for a frame of the declared size; null would fail the
    // receipt validator rather than invent a pixel.
    rgba.get(offset..offset + 4)
        .map_or(Value::Null, |channels| json!(channels))
}

/// Builds the endpoint receipt.
///
/// A [`RenderOutcome::Unavailable`] outcome gives a `capability-refused` receipt with no frame
/// digest and no probes.
#[must_use]
pub fn build_receipt(parts: &ReceiptParts<'_>) -> Value {
    let ReceiptParts {
        cells,
        prepared,
        pack,
        shader,
        frame,
        outcome,
    } = *parts;
    let (adapter, frame_sha256, probes) = match outcome {
        RenderOutcome::Rendered { rgba, adapter } => {
            let driver = [&adapter.backend, &adapter.driver, &adapter.driver_info]
                .into_iter()
                .filter(|part| !part.is_empty())
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join("; ");
            let probes: Vec<Value> = frame
                .probe_points()
                .into_iter()
                .map(|(px, py)| json!({ "px": px, "py": py, "rgba": pixel(rgba, frame, px, py) }))
                .collect();
            (
                json!({ "backend": "wgpu", "name": adapter.name, "driver": driver }),
                json!(sha256_hex(rgba)),
                probes,
            )
        }
        RenderOutcome::Unavailable { .. } => (
            json!({ "backend": "wgpu", "name": "", "driver": "" }),
            Value::Null,
            Vec::new(),
        ),
    };
    let bunny_primitives: Vec<Value> = BUNNY_PRIMITIVES
        .iter()
        .map(|primitive| {
            json!({
                "contractId": primitive.contract_id,
                "bunnyCommit": primitive.bunny_commit,
                "wgslSha256": primitive.wgsl_sha256,
                "vectorsSha256": primitive.vectors_sha256,
            })
        })
        .collect();
    json!({
        "receiptVersion": RECEIPT_VERSION,
        "gpuAbiVersion": GPU_ABI_VERSION,
        "cellFormatId": crate::CELL_FORMAT_ID,
        "inputReceiptSha256": cells.input_receipt_sha256,
        "preparedBufferSha256": prepared.sha256(),
        "proceduralTableSha256": shader.procedural_table_sha256,
        "bunnyPrimitives": bunny_primitives,
        "assembledWgslSha256": shader.assembled_wgsl_sha256,
        "generatedGlslSha256": null,
        "shaderSha256": shader.assembled_wgsl_sha256,
        // The artifact wgpu executes is the WGSL module itself.
        "executedArtifactSha256": shader.assembled_wgsl_sha256,
        "backendProfile": BACKEND_PROFILE,
        "adapter": adapter,
        "evidenceLevel": outcome.evidence_level().name(),
        "widthCells": frame.width_cells,
        "heightCells": frame.height_cells,
        "cellPx": { "width": frame.cell_px_w, "height": frame.cell_px_h },
        "canvasPxW": frame.canvas_px_w,
        "canvasPxH": frame.canvas_px_h,
        // Offscreen: one physical pixel per pixel, no display scale.
        "dpr": 1,
        "defaultFg": format_hex_color(frame.default_fg),
        "defaultBg": format_hex_color(frame.default_bg),
        "fontIdentity": pack.font_identity,
        // The atlas is uploaded once and never evicted.
        "atlasGeneration": 1,
        "atlasStats": {
            "usedSlots": pack.slots.len(),
            "capacity": pack.atlas_cols * pack.atlas_rows,
            "monoCount": pack.count(GlyphKind::Mono),
            "colorEmojiCount": pack.count(GlyphKind::Color),
        },
        "frameRgbaSha256": frame_sha256,
        "probePolicy": "integer-canonical-exact",
        "probes": probes,
    })
}

/// Serializes a receipt as canonical JSON: sorted keys, two-space indent, one trailing newline.
#[must_use]
pub fn serialize_receipt(receipt: &Value) -> String {
    // serde_json keeps object members in a sorted map, so the pretty printer emits sorted keys.
    format!("{receipt:#}\n")
}

fn hex(bytes: &[u8]) -> String {
    let mut text = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        // Writing to a String cannot fail.
        let _unused = write!(text, "{byte:02x}");
    }
    text
}

/// Binds each probe of a rendered frame to its source cell bytes and prepared record.
///
/// Each entry repeats the probe and adds the cell it falls in, the ten bytes of that cell in the
/// input receipt and the sixteen bytes of its prepared record. The bottom-right canvas pixel
/// belongs to no cell when the canvas is larger than the grid. Empty when nothing was rendered.
#[must_use]
pub fn probe_bindings(parts: &ReceiptParts<'_>) -> Vec<Value> {
    let RenderOutcome::Rendered { rgba, .. } = parts.outcome else {
        return Vec::new();
    };
    let frame = parts.frame;
    let prepared_bytes = parts.prepared.bytes();
    let bind = |px: u32, py: u32| {
        let (col, row) = (px / frame.cell_px_w, py / frame.cell_px_h);
        let in_grid = col < frame.width_cells && row < frame.height_cells;
        let index = row as usize * frame.width_cells as usize + col as usize;
        let source = parts
            .cells
            .bytes
            .get(index * CELL_STRIDE..(index + 1) * CELL_STRIDE);
        let prepared = prepared_bytes.get(index * 16..(index + 1) * 16);
        match (in_grid, source, prepared) {
            (true, Some(source), Some(prepared)) => json!({
                "px": px,
                "py": py,
                "rgba": pixel(rgba, frame, px, py),
                "cell": { "col": col, "row": row },
                "sourceCellHex": hex(source),
                "preparedCellHex": hex(prepared),
            }),
            _ => json!({
                "px": px,
                "py": py,
                "rgba": pixel(rgba, frame, px, py),
                "cell": null,
                "sourceCellHex": null,
                "preparedCellHex": null,
            }),
        }
    };
    frame
        .probe_points()
        .into_iter()
        .map(|(px, py)| bind(px, py))
        .collect()
}
