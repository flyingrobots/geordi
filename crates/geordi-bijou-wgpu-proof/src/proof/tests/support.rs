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

/// Directory of the checked-in native receipts.
pub(super) const RECEIPT_DIR: &str = "fixtures/bijou-gpu/native-wgpu";

/// Canvas of the conformance suite: an 8 x 7 grid of 8 x 16 cells plus a letterboxed remainder.
pub(super) const SUITE_CANVAS: (u32, u32) = (67, 117);

/// `(receipt stem, input fixture, canvas)` of one frame with a checked-in `gpu-probed` receipt.
pub(super) type ProvenFrame = (&'static str, &'static str, Option<(u32, u32)>);

/// `(receipt stem, input fixture, canvas)` of every frame with a checked-in `gpu-probed` receipt.
pub(super) const PROVEN_FRAMES: [ProvenFrame; 3] = [
    ("width1-paint", PAINT, Some(SUITE_CANVAS)),
    ("width1-erase", ERASE, Some(SUITE_CANVAS)),
    ("bijou-re036", BIJOU_FIXTURE, None),
];

/// Everything a render needs, loaded from the repository.
pub(super) struct Scene {
    pub(super) cells: PackedCells,
    pub(super) prepared: crate::PreparedCells,
    pub(super) pack: GlyphPack,
    pub(super) shader: crate::ShaderBundle,
    pub(super) frame: crate::FrameSpec,
}

impl Scene {
    pub(super) fn load(path: &str, canvas: Option<(u32, u32)>) -> Result<Self, Box<dyn Error>> {
        let pack = pack()?;
        let cells = parse_packed_cells(&read_repo(path)?, &pack)?;
        let prepared = crate::prepare_cells(&cells, &pack)?;
        let shader = crate::ShaderBundle::load(&repo_root())?;
        let frame = crate::FrameSpec::new(
            &prepared,
            &pack,
            canvas,
            crate::DEFAULT_FG,
            crate::DEFAULT_BG,
        )?;
        Ok(Self {
            cells,
            prepared,
            pack,
            shader,
            frame,
        })
    }

    pub(super) fn render(
        &self,
        policy: crate::AdapterPolicy,
    ) -> Result<crate::RenderOutcome, ProofError> {
        crate::render_offscreen(
            &self.shader,
            &self.prepared,
            &self.pack,
            &self.frame,
            policy,
        )
    }

    pub(super) fn receipt(&self, outcome: &crate::RenderOutcome) -> Value {
        crate::build_receipt(&self.parts(outcome))
    }

    pub(super) const fn parts<'a>(
        &'a self,
        outcome: &'a crate::RenderOutcome,
    ) -> crate::ReceiptParts<'a> {
        crate::ReceiptParts {
            cells: &self.cells,
            prepared: &self.prepared,
            pack: &self.pack,
            shader: &self.shader,
            frame: &self.frame,
            outcome,
        }
    }
}

/// A scratch directory under the system temporary directory, removed on drop.
pub(super) struct TempDir {
    pub(super) root: PathBuf,
}

impl TempDir {
    pub(super) fn new(name: &str) -> Result<Self, Box<dyn Error>> {
        let root = std::env::temp_dir().join(format!(
            "geordi-bijou-wgpu-proof-{}-{name}",
            std::process::id()
        ));
        if root.exists() {
            fs::remove_dir_all(&root)?;
        }
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    /// Copies repository-relative `paths` (files or directories) into the scratch directory.
    pub(super) fn with_repo_paths(self, paths: &[&str]) -> Result<Self, Box<dyn Error>> {
        for path in paths {
            copy_tree(&repo_root().join(path), &self.root.join(path))?;
        }
        Ok(self)
    }
}

fn copy_tree(from: &std::path::Path, to: &std::path::Path) -> Result<(), Box<dyn Error>> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        let _bytes = fs::copy(from, to)?;
    }
    Ok(())
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _unused = fs::remove_dir_all(&self.root);
    }
}
