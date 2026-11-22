//! Shared fixtures and helpers.

use std::error::Error;
use std::fs;
use std::path::PathBuf;

use serde_json::{Value, json};

use crate::{ErrorCode, GLYPH_PACK_PATH, GlyphPack, PackedCells, ProofError, parse_packed_cells};

pub(super) type TestResult = Result<(), Box<dyn Error>>;

pub(super) const PAINT: &str = "fixtures/bijou-gpu/width1-paint.packed-bijou-cells.json";
pub(super) const ERASE: &str = "fixtures/bijou-gpu/width1-erase.packed-bijou-cells.json";
pub(super) const NEGATIVE_WIDE: &str = "fixtures/bijou-gpu/negative-width2.packed-bijou-cells.json";
pub(super) const SUITE: &str = "fixtures/bijou-gpu/width1-conformance-suite.json";
pub(super) const BIJOU_FIXTURE: &str = "fixtures/bijou-gpu/bijou/packed-bijou-cells.v1.json";
pub(super) const BIJOU_PROVENANCE: &str = "fixtures/bijou-gpu/bijou/provenance.json";

pub(super) fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

pub(super) fn read_repo(path: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    Ok(fs::read(repo_root().join(path))?)
}

pub(super) fn read_json(path: &str) -> Result<Value, Box<dyn Error>> {
    Ok(serde_json::from_slice(&read_repo(path)?)?)
}

pub(super) fn pack() -> Result<GlyphPack, Box<dyn Error>> {
    Ok(GlyphPack::parse(&read_repo(GLYPH_PACK_PATH)?)?)
}

pub(super) fn parse_fixture(path: &str) -> Result<PackedCells, Box<dyn Error>> {
    Ok(parse_packed_cells(&read_repo(path)?, &pack()?)?)
}

/// The suite manifest entry of frame `id`.
pub(super) fn suite_frame(id: &str) -> Result<Value, Box<dyn Error>> {
    let suite = read_json(SUITE)?;
    suite["frames"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|frame| frame["id"] == id)
        .cloned()
        .ok_or_else(|| format!("suite has no frame {id}").into())
}

/// The canonical empty cell: `U+0020`, `FLAG_EMPTY`, opacity 0, terminal-default colours.
pub(super) const EMPTY_CELL: [u8; 10] = [0x20, 0, 0, 0, 0, 0, 0, 0, 0x80, 0];

/// A well-formed `packed-bijou-cells/1` document over `cells`, row-major.
pub(super) fn receipt(width: u32, height: u32, cells: &[[u8; 10]], side_table: &[&str]) -> Value {
    let bytes: Vec<u8> = cells.iter().flatten().copied().collect();
    let owners = vec!["scene.root"; cells.len()];
    json!({
        "receiptVersion": "packed-bijou-cells/1",
        "widthCells": width,
        "heightCells": height,
        "cellFormatId": "bijou-packed-cell-u8x10-le/1",
        "glyphPolicyId": "unicode-grapheme-side-table/1",
        "bytes": bytes,
        "sideTable": side_table,
        "scene": {
            "sceneVersion": "ui-scene-ir/1",
            "sceneHash": "0".repeat(64),
            "nodeIds": ["scene.root"],
            "cellNodeIds": owners,
        },
        "focus": { "focusedNodeId": null, "focusableNodeIds": [] },
        "chroma": {
            "colorSpace": "srgb",
            "channelEncoding": "uint8",
            "alphaEncoding": "uint6",
            "terminalDefaultEncoding": "presence-bits",
        },
    })
}

/// A cell that draws `code` with the given flags, opaque, terminal-default colours.
pub(super) const fn cell(code: u16, flags: u8) -> [u8; 10] {
    let [low, high] = code.to_le_bytes();
    [low, high, 0, 0, 0, 0, 0, 0, flags, 0x3f]
}

pub(super) fn parse_value(document: &Value) -> Result<PackedCells, ProofError> {
    let pack = pack().map_err(|error| ProofError::new(ErrorCode::Io, "", error.to_string()))?;
    parse_packed_cells(document.to_string().as_bytes(), &pack)
}

/// Asserts that `document` is refused with `code` at `path`.
pub(super) fn assert_refused(document: &Value, code: ErrorCode, path: &str) {
    match parse_value(document) {
        Ok(_) => panic_free_fail(&format!("accepted a document that must fail at {path}")),
        Err(error) => {
            assert_eq!(
                (error.code.as_str(), error.path.as_str()),
                (code.as_str(), path),
                "{}",
                error.detail
            );
        }
    }
}

fn panic_free_fail(message: &str) {
    assert!(message.is_empty(), "{message}");
}
