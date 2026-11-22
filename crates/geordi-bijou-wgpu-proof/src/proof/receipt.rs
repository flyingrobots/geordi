//! The `geordi-bijou-gpu-receipt/1` endpoint receipt of a run.

use serde_json::Value;

use super::frame::FrameSpec;
use super::glyph_pack::GlyphPack;
use super::gpu::RenderOutcome;
use super::intake::PackedCells;
use super::prepare::PreparedCells;
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

/// Builds the endpoint receipt.
///
/// A [`RenderOutcome::Unavailable`] outcome gives a `capability-refused` receipt with no frame
/// digest and no probes.
#[must_use]
pub const fn build_receipt(parts: &ReceiptParts<'_>) -> Value {
    let _unused = parts;
    Value::Null
}

/// Serializes a receipt as canonical JSON: sorted keys, two-space indent, one trailing newline.
#[must_use]
pub fn serialize_receipt(receipt: &Value) -> String {
    let _unused = receipt;
    String::new()
}

/// Binds each probe of a rendered frame to its source cell bytes and prepared record.
///
/// Empty when nothing was rendered.
#[must_use]
pub const fn probe_bindings(parts: &ReceiptParts<'_>) -> Vec<Value> {
    let _unused = parts;
    Vec::new()
}
