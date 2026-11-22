//! Bounded offscreen `wgpu` proof for the `bijou-surface-gpu/1` ABI.
//!
//! The crate validates one `packed-bijou-cells/1` receipt, prepares the `rgba32uint` cell record
//! of the ABI on the CPU, and (in later modules) renders it offscreen with the canonical
//! `bijou-surface.wgsl`. It opens no window and produces no cells on the GPU.
//!
//! The ABI is frozen in `docs/design/2026-11-bijou-surface-gpu-abi.md`.

#[cfg(test)]
mod tests;

mod error;
mod glyph_pack;
mod intake;
mod prepare;

pub use error::{ErrorCode, ProofError};
pub use glyph_pack::{
    GLYPH_PACK_PATH, GLYPH_PACK_VERSION, GlyphKind, GlyphPack, GlyphSlot, PINNED_GLYPH_PACK_SHA256,
};
pub use intake::{
    CELL_STRIDE, MAX_CELLS, MAX_DIMENSION, MAX_INPUT_BYTES, PackedCells, parse_packed_cells,
};
pub use prepare::{AtlasGlyphUse, PreparedCells, prepare_cells};

/// Version of the ABI this host presents.
pub const GPU_ABI_VERSION: &str = geordi_bijou_shadergen::GPU_ABI_VERSION;

/// Identifier of Bijou's ten-byte interchange cell.
pub const CELL_FORMAT_ID: &str = "bijou-packed-cell-u8x10-le/1";
