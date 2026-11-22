//! The proof pipeline: intake, preparation, rendering, receipt and command line.

#[cfg(test)]
mod tests;

mod cli;
mod error;
mod frame;
mod glyph_pack;
mod glyph_policy;
mod gpu;
mod intake;
mod json;
mod prepare;
mod profile;
mod receipt;
mod shader;

pub use cli::run;
pub use error::{ErrorCode, ProofError};
pub use frame::{
    COPY_ROW_ALIGNMENT, DEFAULT_BG, DEFAULT_FG, FrameSpec, MAX_CELL_PROBES, format_hex_color,
    padded_bytes_per_row, parse_hex_color, strip_row_padding,
};
pub use glyph_pack::{
    GLYPH_PACK_PATH, GLYPH_PACK_VERSION, GlyphKind, GlyphPack, GlyphSlot, PINNED_GLYPH_PACK_SHA256,
};
pub use gpu::{
    AdapterIdentity, AdapterPolicy, DeviceClass, EvidenceLevel, RenderOutcome, render_offscreen,
};
pub use intake::{
    CELL_STRIDE, MAX_CELLS, MAX_DIMENSION, MAX_INPUT_BYTES, PackedCells, parse_packed_cells,
};
pub use prepare::{AtlasGlyphUse, PreparedCells, prepare_cells};
pub use profile::{BACKEND_PROFILE, MAX_CELL_PX, MAX_TEXTURE_PX};
pub use receipt::{
    RECEIPT_VERSION, ReceiptParts, build_receipt, probe_bindings, serialize_receipt,
};
pub use shader::{SURFACE_SHADER_ID, SURFACE_WGSL_PATH, ShaderBundle};
