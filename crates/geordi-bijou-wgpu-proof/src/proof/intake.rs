//! Strict intake of a `packed-bijou-cells/1` receipt.
//!
//! The checks mirror the conformance kit's validator (`packages/bijou-gpu/src/packed-cells.ts`),
//! which mirrors Bijou's. Where the kit decides glyph safety with grapheme segmentation and
//! Unicode properties, this host applies a closed glyph policy instead, so it accepts a subset
//! of what the kit accepts.

use std::collections::BTreeSet;

use geordi_bijou_shadergen::sha256_hex;
use serde_json::Value;

use super::error::{ErrorCode, ProofError};
use super::glyph_pack::GlyphPack;
use super::glyph_policy::{
    SIDE_TABLE_THRESHOLD, has_terminal_control, is_directly_encodable, is_wide, procedural_word0,
};
use super::json::{array_at, fail, integer_at, is_sha256_hex, literal_at, object_at};

/// Bytes per cell of `bijou-packed-cell-u8x10-le/1`.
pub const CELL_STRIDE: usize = 10;

/// Largest cell count of a `packed-bijou-cells/1` receipt.
pub const MAX_CELLS: u32 = 100_000;

/// Largest width or height, in cells, of a `packed-bijou-cells/1` receipt.
pub const MAX_DIMENSION: u32 = 9_999;

/// Largest input file the host reads.
pub const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

/// Largest side table of a `packed-bijou-cells/1` receipt.
const MAX_SIDE_TABLE_ENTRIES: usize = 0x1000;

const RECEIPT_VERSION: &str = "packed-bijou-cells/1";
const GLYPH_POLICY_ID: &str = "unicode-grapheme-side-table/1";
const SCENE_VERSION: &str = "ui-scene-ir/1";

const OFF_FLAGS: usize = 8;
const OFF_ALPHA: usize = 9;
const UNDERLINE_MASK: u8 = 0x30;
const FLAG_DASHED: u8 = 0x40;
const FLAG_FG_SET: u8 = 0x40;
const FLAG_BG_SET: u8 = 0x80;

const INVALID: ErrorCode = ErrorCode::InvalidPackedCells;

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
    if file_bytes.len() > MAX_INPUT_BYTES {
        return fail(
            INVALID,
            "$",
            format!("input exceeds {MAX_INPUT_BYTES} bytes"),
        );
    }
    let document: Value = serde_json::from_slice(file_bytes)
        .map_err(|error| ProofError::new(INVALID, "$", format!("not JSON: {error}")))?;
    let fields = [
        "receiptVersion",
        "widthCells",
        "heightCells",
        "cellFormatId",
        "glyphPolicyId",
        "bytes",
        "sideTable",
        "scene",
        "focus",
        "chroma",
    ];
    let record = object_at(&document, "$", &fields, INVALID)?;
    literal_at(
        &record["receiptVersion"],
        RECEIPT_VERSION,
        "$.receiptVersion",
        INVALID,
    )?;
    literal_at(
        &record["cellFormatId"],
        crate::CELL_FORMAT_ID,
        "$.cellFormatId",
        INVALID,
    )?;
    literal_at(
        &record["glyphPolicyId"],
        GLYPH_POLICY_ID,
        "$.glyphPolicyId",
        INVALID,
    )?;
    let width_cells = integer_at(
        &record["widthCells"],
        "$.widthCells",
        1,
        MAX_DIMENSION,
        INVALID,
    )?;
    let height_cells = integer_at(
        &record["heightCells"],
        "$.heightCells",
        1,
        MAX_DIMENSION,
        INVALID,
    )?;
    let cell_count = width_cells * height_cells;
    if cell_count > MAX_CELLS {
        return fail(INVALID, "$", format!("cell count exceeds {MAX_CELLS}"));
    }
    let cell_count = cell_count as usize;

    let bytes = bytes_at(&record["bytes"], cell_count * CELL_STRIDE)?;
    let side_table = side_table_at(&record["sideTable"], &bytes, pack)?;
    validate_colors_and_modifiers(&bytes)?;
    let node_ids = scene_at(&record["scene"], cell_count)?;
    focus_at(&record["focus"], &node_ids)?;
    chroma_at(&record["chroma"])?;

    Ok(PackedCells {
        width_cells,
        height_cells,
        bytes,
        side_table,
        input_receipt_sha256: sha256_hex(file_bytes),
    })
}

fn bytes_at(value: &Value, expected: usize) -> Result<Vec<u8>, ProofError> {
    let raw = array_at(value, "$.bytes", INVALID)?;
    if raw.len() != expected {
        return fail(
            INVALID,
            "$.bytes",
            format!("expected {expected} bytes, received {}", raw.len()),
        );
    }
    raw.iter()
        .enumerate()
        .map(|(index, item)| {
            item.as_u64()
                .and_then(|number| u8::try_from(number).ok())
                .map_or_else(
                    || {
                        fail(
                            INVALID,
                            format!("$.bytes[{index}]"),
                            "expected canonical unsigned byte 0..255",
                        )
                    },
                    Ok,
                )
        })
        .collect()
}

/// Refuses a grapheme the host cannot draw. `text` is already known to be free of controls.
fn require_drawable(text: &str, path: &str, pack: &GlyphPack) -> Result<(), ProofError> {
    if is_wide(text) {
        return fail(
            ErrorCode::UnsupportedWideGlyph,
            path,
            format!(
                "width-2 grapheme {} is not representable in bijou-surface-gpu/1",
                describe(text)
            ),
        );
    }
    if pack.has_grapheme(text) {
        return Ok(());
    }
    fail(
        ErrorCode::MissingGlyphSlot,
        path,
        format!(
            "grapheme {} has no slot in the pinned glyph pack",
            describe(text)
        ),
    )
}

/// `U+0041 U+0301`-style description of a string.
pub(super) fn describe(text: &str) -> String {
    text.chars()
        .map(|character| format!("U+{:04X}", u32::from(character)))
        .collect::<Vec<_>>()
        .join(" ")
}

fn side_table_at(value: &Value, bytes: &[u8], pack: &GlyphPack) -> Result<Vec<String>, ProofError> {
    let raw = array_at(value, "$.sideTable", INVALID)?;
    if raw.len() > MAX_SIDE_TABLE_ENTRIES {
        return fail(
            INVALID,
            "$.sideTable",
            format!("exceeds {MAX_SIDE_TABLE_ENTRIES} entries"),
        );
    }
    let mut side_table: Vec<String> = Vec::with_capacity(raw.len());
    for (index, item) in raw.iter().enumerate() {
        let path = format!("$.sideTable[{index}]");
        let text = match item.as_str() {
            Some(text) if !text.is_empty() && !has_terminal_control(text) => text,
            _ => {
                return fail(
                    INVALID,
                    path,
                    "expected one terminal-safe grapheme of width 1",
                );
            }
        };
        if !is_wide(text) && is_directly_encodable(text) {
            return fail(INVALID, path, "glyph must be encoded directly in its cell");
        }
        require_drawable(text, &path, pack)?;
        if side_table.iter().any(|seen| seen == text) {
            return fail(INVALID, path, "duplicate glyph");
        }
        side_table.push(text.to_owned());
    }

    let mut referenced = BTreeSet::new();
    for (cell, chunk) in bytes.as_chunks::<CELL_STRIDE>().0.iter().enumerate() {
        let path = format!("$.bytes[{}]", cell * CELL_STRIDE);
        let code = u16::from_le_bytes([chunk[0], chunk[1]]);
        if code >= SIDE_TABLE_THRESHOLD {
            let index = usize::from(code - SIDE_TABLE_THRESHOLD);
            if index >= side_table.len() {
                return fail(
                    INVALID,
                    path,
                    format!("side-table index {index} does not exist"),
                );
            }
            referenced.insert(index);
            continue;
        }
        let Some(character) = char::from_u32(u32::from(code)) else {
            return fail(INVALID, path, "direct glyph cannot be a UTF-16 surrogate");
        };
        let text = character.to_string();
        if has_terminal_control(&text) {
            return fail(
                INVALID,
                path,
                "direct glyph must be terminal safe and width 1",
            );
        }
        if character != ' ' && procedural_word0(code).is_none() {
            require_drawable(&text, &path, pack)?;
        }
    }
    if let Some(unused) = (0..side_table.len()).find(|index| !referenced.contains(index)) {
        return fail(
            INVALID,
            format!("$.sideTable[{unused}]"),
            "glyph is not referenced by any cell",
        );
    }
    Ok(side_table)
}

fn validate_colors_and_modifiers(bytes: &[u8]) -> Result<(), ProofError> {
    for (cell, chunk) in bytes.as_chunks::<CELL_STRIDE>().0.iter().enumerate() {
        let offset = cell * CELL_STRIDE;
        let alpha = chunk[OFF_ALPHA];
        for (presence, channels) in [(FLAG_FG_SET, 2..5), (FLAG_BG_SET, 5..8)] {
            if alpha & presence != 0 {
                continue;
            }
            if let Some(channel) = channels.into_iter().find(|channel| chunk[*channel] != 0) {
                return fail(
                    INVALID,
                    format!("$.bytes[{}]", offset + channel),
                    "terminal-default color channels must be zero",
                );
            }
        }
        let flags = chunk[OFF_FLAGS];
        if flags & FLAG_DASHED != 0 && flags & UNDERLINE_MASK != UNDERLINE_MASK {
            return fail(
                INVALID,
                format!("$.bytes[{}]", offset + OFF_FLAGS),
                "dashed flag requires dotted/dashed underline bits",
            );
        }
    }
    Ok(())
}

/// A canonical id: non-empty, no leading or trailing white space, no control characters.
fn canonical_id_at<'a>(value: &'a Value, path: &str) -> Result<&'a str, ProofError> {
    // JavaScript's `trim` also removes U+FEFF, which Rust's does not.
    let trimmed = |text: &str| {
        text.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
            .len()
    };
    match value.as_str() {
        Some(text)
            if !text.is_empty() && trimmed(text) == text.len() && !has_terminal_control(text) =>
        {
            Ok(text)
        }
        _ => fail(INVALID, path, "expected a canonical non-empty id"),
    }
}

fn unique_ids_at<'a>(value: &'a Value, path: &str) -> Result<Vec<&'a str>, ProofError> {
    let mut ids: Vec<&str> = Vec::new();
    for (index, item) in array_at(value, path, INVALID)?.iter().enumerate() {
        let item_path = format!("{path}[{index}]");
        let id = canonical_id_at(item, &item_path)?;
        if ids.contains(&id) {
            return fail(INVALID, item_path, "duplicate id");
        }
        ids.push(id);
    }
    Ok(ids)
}

fn scene_at(value: &Value, cell_count: usize) -> Result<Vec<&str>, ProofError> {
    let fields = ["sceneVersion", "sceneHash", "nodeIds", "cellNodeIds"];
    let record = object_at(value, "$.scene", &fields, INVALID)?;
    literal_at(
        &record["sceneVersion"],
        SCENE_VERSION,
        "$.scene.sceneVersion",
        INVALID,
    )?;
    if !record["sceneHash"].as_str().is_some_and(is_sha256_hex) {
        return fail(
            INVALID,
            "$.scene.sceneHash",
            "expected a lowercase SHA-256 digest",
        );
    }
    let node_ids = unique_ids_at(&record["nodeIds"], "$.scene.nodeIds")?;
    if node_ids.is_empty() {
        return fail(INVALID, "$.scene.nodeIds", "cannot be empty");
    }
    let owners = array_at(&record["cellNodeIds"], "$.scene.cellNodeIds", INVALID)?;
    if owners.len() != cell_count {
        return fail(
            INVALID,
            "$.scene.cellNodeIds",
            format!("expected {cell_count} cell owners"),
        );
    }
    let known: BTreeSet<&str> = node_ids.iter().copied().collect();
    for (index, owner) in owners.iter().enumerate() {
        let path = format!("$.scene.cellNodeIds[{index}]");
        if !known.contains(canonical_id_at(owner, &path)?) {
            return fail(INVALID, path, "owner is not a declared node");
        }
    }
    Ok(node_ids)
}

fn focus_at(value: &Value, node_ids: &[&str]) -> Result<(), ProofError> {
    let record = object_at(
        value,
        "$.focus",
        &["focusedNodeId", "focusableNodeIds"],
        INVALID,
    )?;
    let focusable = unique_ids_at(&record["focusableNodeIds"], "$.focus.focusableNodeIds")?;
    if let Some(index) = focusable.iter().position(|id| !node_ids.contains(id)) {
        return fail(
            INVALID,
            format!("$.focus.focusableNodeIds[{index}]"),
            "focusable id is not a declared scene node",
        );
    }
    let focused = &record["focusedNodeId"];
    if !focused.is_null() {
        let id = canonical_id_at(focused, "$.focus.focusedNodeId")?;
        if !focusable.contains(&id) {
            return fail(
                INVALID,
                "$.focus.focusedNodeId",
                "focused id is not in focusableNodeIds",
            );
        }
    }
    Ok(())
}

fn chroma_at(value: &Value) -> Result<(), ProofError> {
    let literals = [
        ("colorSpace", "srgb"),
        ("channelEncoding", "uint8"),
        ("alphaEncoding", "uint6"),
        ("terminalDefaultEncoding", "presence-bits"),
    ];
    let fields = literals.map(|(field, _)| field);
    let record = object_at(value, "$.chroma", &fields, INVALID)?;
    for (field, expected) in literals {
        literal_at(
            &record[field],
            expected,
            &format!("$.chroma.{field}"),
            INVALID,
        )?;
    }
    Ok(())
}
