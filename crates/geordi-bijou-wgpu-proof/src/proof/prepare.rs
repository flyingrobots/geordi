//! Deterministic CPU preparation of the `rgba32uint` cell record.
//!
//! The lowering is the one `prepareReferenceCells()` in the conformance kit performs; the two
//! must agree word for word, and the tests check that against the kit's digests.

use geordi_bijou_shadergen::sha256_hex;

use super::error::{ErrorCode, ProofError};
use super::glyph_pack::{GlyphKind, GlyphPack};
use super::glyph_policy::{SIDE_TABLE_THRESHOLD, procedural_word0};
use super::intake::{CELL_STRIDE, PackedCells, describe};
use super::json::fail;

const FLAG_BOLD: u8 = 0x01;
const FLAG_EMPTY: u8 = 0x80;
const GLYPH_KIND_ATLAS_MONO: u32 = 1;
const GLYPH_KIND_ATLAS_COLOR: u32 = 2;

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
        sha256_hex(&self.bytes())
    }
}

/// Lowers every validated cell into the prepared record.
///
/// # Errors
///
/// Returns `GEORDI_E_BIJOU_MISSING_GLYPH_SLOT` when a grapheme has no slot in the weight a cell
/// asks for, and `GEORDI_E_BIJOU_INVALID_PACKED_CELLS` when `cells` was not produced by
/// [`crate::parse_packed_cells`] and is inconsistent.
pub fn prepare_cells(cells: &PackedCells, pack: &GlyphPack) -> Result<PreparedCells, ProofError> {
    let cell_count = cells.width_cells as usize * cells.height_cells as usize;
    if cells.bytes.len() != cell_count * CELL_STRIDE {
        return fail(
            ErrorCode::InvalidPackedCells,
            "$.bytes",
            format!(
                "expected {} bytes, received {}",
                cell_count * CELL_STRIDE,
                cells.bytes.len()
            ),
        );
    }
    let mut words = Vec::with_capacity(cell_count * 4);
    let mut atlas_uses: Vec<AtlasGlyphUse> = Vec::new();
    for (cell, chunk) in cells.bytes.as_chunks::<CELL_STRIDE>().0.iter().enumerate() {
        let path = format!("$.bytes[{}]", cell * CELL_STRIDE);
        let flags = chunk[8];
        words.push(lower_glyph(cells, pack, chunk, &path, &mut atlas_uses)?);
        words.push(u32::from_le_bytes([chunk[2], chunk[3], chunk[4], flags]));
        words.push(u32::from_le_bytes([chunk[5], chunk[6], chunk[7], chunk[9]]));
        words.push(0);
    }
    atlas_uses.sort_by_key(|entry| entry.slot);
    Ok(PreparedCells {
        width_cells: cells.width_cells,
        height_cells: cells.height_cells,
        words,
        atlas_uses,
    })
}

/// `word0` of one cell: `glyph_kind` in bits 16..19 and `glyph_payload` in bits 0..15.
fn lower_glyph(
    cells: &PackedCells,
    pack: &GlyphPack,
    chunk: &[u8; CELL_STRIDE],
    path: &str,
    atlas_uses: &mut Vec<AtlasGlyphUse>,
) -> Result<u32, ProofError> {
    let code = u16::from_le_bytes([chunk[0], chunk[1]]);
    let flags = chunk[8];
    // Live CHAR_EMPTY, FLAG_EMPTY and ASCII space all lower to the empty glyph.
    if code == 0 || code == 0x20 || flags & FLAG_EMPTY != 0 {
        return Ok(0);
    }
    let grapheme = if code >= SIDE_TABLE_THRESHOLD {
        let index = usize::from(code - SIDE_TABLE_THRESHOLD);
        match cells.side_table.get(index) {
            Some(entry) => entry.clone(),
            None => {
                return fail(
                    ErrorCode::InvalidPackedCells,
                    path,
                    format!("side-table index {index} does not exist"),
                );
            }
        }
    } else {
        if let Some(word0) = procedural_word0(code) {
            return Ok(word0);
        }
        match char::from_u32(u32::from(code)) {
            Some(character) => character.to_string(),
            None => {
                return fail(
                    ErrorCode::InvalidPackedCells,
                    path,
                    "direct glyph cannot be a UTF-16 surrogate",
                );
            }
        }
    };

    let bold = flags & FLAG_BOLD != 0;
    let Some(slot) = pack.lookup(&grapheme, bold) else {
        // No host font fallback: a glyph without a declared slot is a refusal.
        return fail(
            ErrorCode::MissingGlyphSlot,
            path,
            format!(
                "no atlas slot for {}grapheme {}",
                if bold { "bold " } else { "" },
                describe(&grapheme)
            ),
        );
    };
    match atlas_uses.iter_mut().find(|entry| entry.slot == slot.slot) {
        Some(entry) => entry.cells += 1,
        None => atlas_uses.push(AtlasGlyphUse {
            grapheme: slot.grapheme.clone(),
            bold: slot.bold,
            slot: slot.slot,
            kind: slot.kind,
            cells: 1,
        }),
    }
    let kind = match slot.kind {
        GlyphKind::Mono => GLYPH_KIND_ATLAS_MONO,
        GlyphKind::Color => GLYPH_KIND_ATLAS_COLOR,
    };
    Ok((kind << 16) | u32::from(slot.slot))
}
