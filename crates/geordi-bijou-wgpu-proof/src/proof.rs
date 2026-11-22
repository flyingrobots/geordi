//! The proof pipeline: intake, preparation, rendering, receipt and command line.

#[cfg(test)]
mod tests;

mod error;
mod glyph_pack;
mod glyph_policy;
mod intake;
mod json;
mod prepare;
mod profile;

pub use error::{ErrorCode, ProofError};
pub use glyph_pack::{
    GLYPH_PACK_PATH, GLYPH_PACK_VERSION, GlyphKind, GlyphPack, GlyphSlot, PINNED_GLYPH_PACK_SHA256,
};
pub use intake::{
    CELL_STRIDE, MAX_CELLS, MAX_DIMENSION, MAX_INPUT_BYTES, PackedCells, parse_packed_cells,
};
pub use prepare::{AtlasGlyphUse, PreparedCells, prepare_cells};
pub use profile::{BACKEND_PROFILE, MAX_CELL_PX, MAX_TEXTURE_PX};
