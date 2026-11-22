//! Strict intake of a `packed-bijou-cells/1` receipt.

use crate::error::ProofError;
use crate::glyph_pack::{GlyphPack, not_implemented};

/// Bytes per cell of `bijou-packed-cell-u8x10-le/1`.
pub const CELL_STRIDE: usize = 10;

/// Largest cell count of a `packed-bijou-cells/1` receipt.
pub const MAX_CELLS: u32 = 100_000;

/// Largest width or height, in cells, of a `packed-bijou-cells/1` receipt.
pub const MAX_DIMENSION: u32 = 9_999;

/// Largest input file the host reads.
pub const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

/// A validated `packed-bijou-cells/1` receipt, reduced to what the host presents.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackedCells {
    /// Grid width in cells.
    pub width_cells: u32,
    /// Grid height in cells.
    pub height_cells: u32,
    /// Ten bytes per cell, row-major.
    pub bytes: Vec<u8>,
    /// Graphemes that cells reference by index.
    pub side_table: Vec<String>,
    /// SHA-256 of the exact input file bytes.
    pub input_receipt_sha256: String,
}

/// Strictly parses the bytes of a `packed-bijou-cells/1` receipt file.
///
/// The glyph policy is closed: a grapheme is accepted only if it is `U+0020`, a Braille, Block
/// Element or Box-Drawing code point, or a grapheme of the pinned glyph pack.
///
/// # Errors
///
/// Returns `GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH` for a width-2 grapheme,
/// `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` for a grapheme the host cannot draw, and
/// `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` for every other violation.
pub fn parse_packed_cells(file_bytes: &[u8], pack: &GlyphPack) -> Result<PackedCells, ProofError> {
    let _unused = (file_bytes, pack);
    Err(not_implemented())
}
