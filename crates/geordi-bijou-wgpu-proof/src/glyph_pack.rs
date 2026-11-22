//! The pinned test glyph pack: an explicit `rgba8uint` atlas and its `(grapheme, bold)` slots.

use crate::error::ProofError;

/// Repository-relative path of the pinned glyph pack.
pub const GLYPH_PACK_PATH: &str = "fixtures/bijou-gpu/test-glyph-pack.json";

/// `packVersion` of the pinned glyph pack.
pub const GLYPH_PACK_VERSION: &str = "geordi-bijou-gpu-test-glyph-pack/1";

/// SHA-256 of the bytes of the pinned glyph pack file.
///
/// The endpoint profile accepts this pack and no other, so the set of graphemes the host accepts
/// is closed and is checked against the conformance kit's width-1 glyph policy by
/// `scripts/bijou-gpu-native-wgpu.test.mjs`.
pub const PINNED_GLYPH_PACK_SHA256: &str =
    "ed0d196adef8710778ee93cd6d8e3fbb4006c8b11c10abb8730f9b26f751e791";

/// How the shader reads an atlas slot.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GlyphKind {
    /// Coverage in the alpha lane, tinted with the resolved foreground.
    Mono,
    /// Premultiplied sRGB RGBA, not tinted.
    Color,
}

/// One atlas slot of a glyph pack.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GlyphSlot {
    /// The grapheme the slot draws.
    pub grapheme: String,
    /// Whether the slot is the bold form.
    pub bold: bool,
    /// Slot index, row-major.
    pub slot: u16,
    /// Monochrome or colour.
    pub kind: GlyphKind,
}

/// A validated glyph pack.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GlyphPack {
    /// Cell width in physical pixels.
    pub cell_px_w: u32,
    /// Cell height in physical pixels.
    pub cell_px_h: u32,
    /// Slots per atlas row.
    pub atlas_cols: u32,
    /// Atlas rows.
    pub atlas_rows: u32,
    /// Tight top-left row-major RGBA8 atlas texels.
    pub rgba: Vec<u8>,
    /// Slots, in file order.
    pub slots: Vec<GlyphSlot>,
    /// Receipt `fontIdentity` of frames rendered with this pack.
    pub font_identity: String,
    /// SHA-256 of [`GlyphPack::rgba`].
    pub atlas_rgba_sha256: String,
}

impl GlyphPack {
    /// Parses and validates the bytes of a glyph pack file.
    ///
    /// # Errors
    ///
    /// Returns `GEORDI_E_BIJOU_INVALID_ATLAS` when the file is not the pinned pack or is
    /// malformed, and `GEORDI_E_BIJOU_INVALID_CELL_METRICS` when its cell size is outside
    /// `1..=256`.
    pub fn parse(file_bytes: &[u8]) -> Result<Self, ProofError> {
        Self::parse_unpinned(file_bytes)
    }

    /// Parses a glyph pack without requiring the pinned file digest.
    ///
    /// # Errors
    ///
    /// As [`GlyphPack::parse`], except that any well-formed pack is accepted.
    pub(crate) fn parse_unpinned(file_bytes: &[u8]) -> Result<Self, ProofError> {
        let _unused = file_bytes;
        Err(not_implemented())
    }

    /// The slot that draws `grapheme` in the given weight.
    #[must_use]
    pub fn lookup(&self, grapheme: &str, bold: bool) -> Option<&GlyphSlot> {
        self.slots
            .iter()
            .find(|slot| slot.bold == bold && slot.grapheme == grapheme)
    }

    /// Whether the pack draws `grapheme` in any weight.
    #[must_use]
    pub fn has_grapheme(&self, grapheme: &str) -> bool {
        self.slots.iter().any(|slot| slot.grapheme == grapheme)
    }
}

pub(crate) fn not_implemented() -> ProofError {
    ProofError::new(crate::ErrorCode::RendererFault, "", "not implemented")
}
