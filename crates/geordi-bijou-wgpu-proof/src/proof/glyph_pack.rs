//! The pinned test glyph pack: an explicit `rgba8uint` atlas and its `(grapheme, bold)` slots.

use geordi_bijou_shadergen::sha256_hex;
use serde_json::Value;

use super::error::{ErrorCode, ProofError};
use super::glyph_policy::{has_terminal_control, is_wide};
use super::json::{array_at, fail, integer_at, literal_at, object_at};
use super::profile::{MAX_CELL_PX, MAX_TEXTURE_PX};

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

const INVALID: ErrorCode = ErrorCode::InvalidAtlas;

/// How the shader reads an atlas slot.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GlyphKind {
    /// Coverage in the alpha lane, tinted with the resolved foreground.
    Mono,
    /// Premultiplied sRGB RGBA, not tinted.
    Color,
}

impl GlyphKind {
    /// `mono` or `color`, as the glyph pack file spells it.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Mono => "mono",
            Self::Color => "color",
        }
    }
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
    /// Parses and validates the bytes of the pinned glyph pack file.
    ///
    /// # Errors
    ///
    /// Returns `GEORDI_E_BIJOU_INVALID_ATLAS` when the file is not the pinned pack or is
    /// malformed, and `GEORDI_E_BIJOU_INVALID_CELL_METRICS` when its cell size is outside
    /// `1..=256`.
    pub fn parse(file_bytes: &[u8]) -> Result<Self, ProofError> {
        let digest = sha256_hex(file_bytes);
        if digest != PINNED_GLYPH_PACK_SHA256 {
            return fail(
                INVALID,
                GLYPH_PACK_PATH,
                format!(
                    "file hashes to {digest}; the endpoint profile pins {PINNED_GLYPH_PACK_SHA256}"
                ),
            );
        }
        Self::parse_unpinned(file_bytes)
    }

    /// Parses a glyph pack without requiring the pinned file digest.
    ///
    /// # Errors
    ///
    /// As [`GlyphPack::parse`], except that any well-formed pack is accepted.
    pub(super) fn parse_unpinned(file_bytes: &[u8]) -> Result<Self, ProofError> {
        let document: Value = serde_json::from_slice(file_bytes)
            .map_err(|error| ProofError::new(INVALID, "$", format!("not JSON: {error}")))?;
        let fields = [
            "atlasCols",
            "atlasRgbaHexRows",
            "atlasRgbaSha256",
            "atlasRows",
            "cellPx",
            "description",
            "fontIdentity",
            "packVersion",
            "slots",
        ];
        let record = object_at(&document, "$", &fields, INVALID)?;
        literal_at(
            &record["packVersion"],
            GLYPH_PACK_VERSION,
            "$.packVersion",
            INVALID,
        )?;

        let cell_px = object_at(&record["cellPx"], "$.cellPx", &["height", "width"], INVALID)?;
        let metrics = ErrorCode::InvalidCellMetrics;
        let cell_px_w = integer_at(&cell_px["width"], "$.cellPx.width", 1, MAX_CELL_PX, metrics)?;
        let cell_px_h = integer_at(
            &cell_px["height"],
            "$.cellPx.height",
            1,
            MAX_CELL_PX,
            metrics,
        )?;
        let atlas_cols = integer_at(
            &record["atlasCols"],
            "$.atlasCols",
            1,
            MAX_TEXTURE_PX / cell_px_w,
            INVALID,
        )?;
        let atlas_rows = integer_at(
            &record["atlasRows"],
            "$.atlasRows",
            1,
            MAX_TEXTURE_PX / cell_px_h,
            INVALID,
        )?;

        let rgba = atlas_texels(
            &record["atlasRgbaHexRows"],
            (atlas_cols * cell_px_w) as usize,
            (atlas_rows * cell_px_h) as usize,
        )?;
        let atlas_rgba_sha256 = sha256_hex(&rgba);
        literal_at(
            &record["atlasRgbaSha256"],
            &atlas_rgba_sha256,
            "$.atlasRgbaSha256",
            INVALID,
        )?;
        let font_identity = format!("{GLYPH_PACK_VERSION} sha256:{atlas_rgba_sha256}");
        literal_at(
            &record["fontIdentity"],
            &font_identity,
            "$.fontIdentity",
            INVALID,
        )?;

        let slots = slots_at(&record["slots"], atlas_cols * atlas_rows)?;
        Ok(Self {
            cell_px_w,
            cell_px_h,
            atlas_cols,
            atlas_rows,
            rgba,
            slots,
            font_identity,
            atlas_rgba_sha256,
        })
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

    /// Number of slots of the given kind.
    #[must_use]
    pub fn count(&self, kind: GlyphKind) -> usize {
        self.slots.iter().filter(|slot| slot.kind == kind).count()
    }
}

fn atlas_texels(value: &Value, width_px: usize, height_px: usize) -> Result<Vec<u8>, ProofError> {
    let path = "$.atlasRgbaHexRows";
    let rows = array_at(value, path, INVALID)?;
    if rows.len() != height_px {
        return fail(
            INVALID,
            path,
            format!("expected {height_px} pixel rows, received {}", rows.len()),
        );
    }
    let mut rgba = Vec::with_capacity(width_px * height_px * 4);
    for (index, row) in rows.iter().enumerate() {
        let row_path = format!("{path}[{index}]");
        let Some(text) = row.as_str() else {
            return fail(INVALID, row_path, "expected a hexadecimal string");
        };
        if text.len() != width_px * 8 {
            return fail(
                INVALID,
                row_path,
                format!("expected {} hexadecimal digits", width_px * 8),
            );
        }
        for pair in text.as_bytes().as_chunks::<2>().0 {
            let (Some(high), Some(low)) = (hex_digit(pair[0]), hex_digit(pair[1])) else {
                return fail(INVALID, row_path, "expected lowercase hexadecimal digits");
            };
            rgba.push((high << 4) | low);
        }
    }
    Ok(rgba)
}

const fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}

fn slots_at(value: &Value, capacity: u32) -> Result<Vec<GlyphSlot>, ProofError> {
    let mut slots: Vec<GlyphSlot> = Vec::new();
    for (index, entry) in array_at(value, "$.slots", INVALID)?.iter().enumerate() {
        let path = format!("$.slots[{index}]");
        let record = object_at(entry, &path, &["bold", "grapheme", "kind", "slot"], INVALID)?;
        let Some(bold) = record["bold"].as_bool() else {
            return fail(INVALID, format!("{path}.bold"), "expected a boolean");
        };
        let grapheme = match record["grapheme"].as_str() {
            Some(text) if !text.is_empty() && !has_terminal_control(text) && !is_wide(text) => text,
            _ => {
                return fail(
                    INVALID,
                    format!("{path}.grapheme"),
                    "expected one width-1 grapheme without control characters",
                );
            }
        };
        let kind = match record["kind"].as_str() {
            Some("mono") => GlyphKind::Mono,
            Some("color") => GlyphKind::Color,
            _ => {
                return fail(
                    INVALID,
                    format!("{path}.kind"),
                    "expected \"mono\" or \"color\"",
                );
            }
        };
        let slot_path = format!("{path}.slot");
        let slot = integer_at(
            &record["slot"],
            &slot_path,
            0,
            capacity.min(0x1_0000) - 1,
            INVALID,
        )?;
        let Ok(slot) = u16::try_from(slot) else {
            return fail(
                INVALID,
                slot_path,
                "expected an atlas slot index in 0..65535",
            );
        };
        if slots.iter().any(|other| other.slot == slot) {
            return fail(INVALID, slot_path, "slot is already assigned");
        }
        if slots
            .iter()
            .any(|other| other.bold == bold && other.grapheme == grapheme)
        {
            return fail(INVALID, path, "duplicate (grapheme, bold) key");
        }
        slots.push(GlyphSlot {
            grapheme: grapheme.to_owned(),
            bold,
            slot,
            kind,
        });
    }
    Ok(slots)
}
