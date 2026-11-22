//! Deterministic CPU preparation of the `rgba32uint` cell record.

use crate::error::ProofError;
use crate::glyph_pack::{GlyphKind, GlyphPack, not_implemented};
use crate::intake::PackedCells;

/// One atlas slot that at least one visible cell uses.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AtlasGlyphUse {
    /// The grapheme drawn.
    pub grapheme: String,
    /// Whether the bold form is drawn.
    pub bold: bool,
    /// Atlas slot index.
    pub slot: u16,
    /// Monochrome or colour.
    pub kind: GlyphKind,
    /// Number of cells that draw this slot.
    pub cells: u32,
}

/// The prepared `bijou-surface-gpu/1` cell grid.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedCells {
    /// Grid width in cells.
    pub width_cells: u32,
    /// Grid height in cells.
    pub height_cells: u32,
    /// Four `u32` lanes per cell, row-major.
    pub words: Vec<u32>,
    /// Atlas slots in use, ordered by slot index.
    pub atlas_uses: Vec<AtlasGlyphUse>,
}

impl PreparedCells {
    /// The canonical little-endian byte stream: 16 bytes per cell.
    #[must_use]
    pub fn bytes(&self) -> Vec<u8> {
        self.words
            .iter()
            .flat_map(|word| word.to_le_bytes())
            .collect()
    }

    /// `preparedBufferSha256`: the SHA-256 of [`PreparedCells::bytes`].
    #[must_use]
    pub fn sha256(&self) -> String {
        geordi_bijou_shadergen::sha256_hex(&self.bytes())
    }
}

/// Lowers every validated cell into the prepared record.
///
/// # Errors
///
/// Returns `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` when a grapheme has no slot in the weight a cell
/// asks for.
pub fn prepare_cells(cells: &PackedCells, pack: &GlyphPack) -> Result<PreparedCells, ProofError> {
    let _unused = (cells, pack);
    Err(not_implemented())
}
