//! Assembles the canonical `bijou-surface-gpu/1` WGSL shader and generates its GLSL ES 3.00 stages.
//!
//! The inputs are the authored WGSL sections, the vendored Bunny helper artifacts and the
//! procedural glyph table. The outputs are the assembled WGSL modules, one GLSL ES 3.00 file per
//! entry point, and a content-addressed implementation manifest. Every output is checked in, and
//! [`check`] reports any byte that differs from a fresh generation.

mod cli;
#[cfg(test)]
mod tests;

use std::error::Error;
use std::fmt::{Display, Formatter, Write as _};
use std::fs;
use std::path::Path;

use serde_json::Value;
use sha2::{Digest, Sha256};

// RED: the generator is not implemented yet; the tests use naga directly.
use naga as _;

pub use cli::run;

/// Exact `naga` version that parses, validates and translates the shaders.
pub const NAGA_VERSION: &str = "29.0.4";

/// `naga` features the generator is built with.
pub const NAGA_FEATURES: [&str; 2] = ["wgsl-in", "glsl-out"];

/// Version tag of the implementation manifest.
pub const MANIFEST_VERSION: &str = "geordi-bijou-gpu-shader-manifest/1";

/// GPU ABI the shaders implement.
pub const GPU_ABI_VERSION: &str = "bijou-surface-gpu/1";

/// Repository-relative directory that holds the shader sources and generated artifacts.
pub const SHADER_DIR: &str = "packages/bijou-gpu/shaders";

/// Repository-relative path of the implementation manifest.
pub const MANIFEST_PATH: &str = "packages/bijou-gpu/shaders/bijou-shaders.manifest.json";

/// Repository-relative path of the procedural glyph table.
pub const GLYPH_TABLE_PATH: &str = "fixtures/bijou-gpu/procedural-glyphs.json";

/// Name of the WGSL override that selects the fragment-coordinate origin.
pub const FRAG_ORIGIN_OVERRIDE: &str = "BIJOU_FRAG_ORIGIN_BOTTOM_LEFT";

/// One Bunny primitive artifact pinned by the `bijou-surface-gpu/1` ABI record.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BunnyPrimitive {
    /// Bunny contract identifier.
    pub contract_id: &'static str,
    /// Bunny commit the artifacts were taken from.
    pub bunny_commit: &'static str,
    /// Path of the WGSL helper inside the Bunny repository.
    pub upstream_wgsl_path: &'static str,
    /// Repository-relative path of the vendored WGSL helper.
    pub wgsl_path: &'static str,
    /// SHA-256 of the WGSL helper bytes.
    pub wgsl_sha256: &'static str,
    /// Path of the vector fixture inside the Bunny repository.
    pub upstream_vectors_path: &'static str,
    /// Repository-relative path of the vendored vector fixture.
    pub vectors_path: &'static str,
    /// SHA-256 of the vector fixture bytes.
    pub vectors_sha256: &'static str,
}

/// Bunny primitives adopted by the shaders, in assembly order.
pub const BUNNY_PRIMITIVES: [BunnyPrimitive; 2] = [
    BunnyPrimitive {
        contract_id: "bunny-u32-div-round-even/1",
        bunny_commit: "3b7fbad",
        upstream_wgsl_path: "crates/bunny-gpu/shaders/bunny_u32_div_round_even.wgsl",
        wgsl_path: "packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_div_round_even.wgsl",
        wgsl_sha256: "ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f",
        upstream_vectors_path: "crates/bunny-gpu/fixtures/u32_div_round_even_vectors.json",
        vectors_path: "fixtures/bijou-gpu/bunny/u32_div_round_even_vectors.json",
        vectors_sha256: "df265cc7233772e33347b04fa1f7a3e71f34566e4aa6af5cf3fecf23e2b044a6",
    },
    BunnyPrimitive {
        contract_id: "bunny-u32-ellipse-classify/1",
        bunny_commit: "292a2c3",
        upstream_wgsl_path: "crates/bunny-gpu/shaders/bunny_u32_ellipse_classify.wgsl",
        wgsl_path: "packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_ellipse_classify.wgsl",
        wgsl_sha256: "1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99",
        upstream_vectors_path: "crates/bunny-gpu/fixtures/u32_ellipse_classify_vectors.json",
        vectors_path: "fixtures/bijou-gpu/bunny/u32_ellipse_classify_vectors.json",
        vectors_sha256: "5f0ec6422de185e2ce7e832a7c1bce7ccde9b6f33e92b399f7c547191ef205e4",
    },
];

/// Pipeline stage of a shader entry point.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Stage {
    /// Vertex stage.
    Vertex,
    /// Fragment stage.
    Fragment,
}

impl Stage {
    /// Stage name used in the manifest.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Vertex => "vertex",
            Self::Fragment => "fragment",
        }
    }
}

/// One entry point translated to one GLSL ES 3.00 file.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StageSpec {
    /// Pipeline stage.
    pub stage: Stage,
    /// WGSL entry point name.
    pub entry_point: &'static str,
    /// File name of the generated GLSL, inside [`SHADER_DIR`].
    pub glsl_file: &'static str,
}

/// Texture format a binding expects. WGSL `texture_2d<u32>` does not carry it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TextureFormat {
    /// Bind group index.
    pub group: u32,
    /// Binding index.
    pub binding: u32,
    /// WebGPU texture format name.
    pub format: &'static str,
}

/// One assembled WGSL module and its GLSL stages.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ShaderSpec {
    /// Shader identifier used in the manifest.
    pub id: &'static str,
    /// File name of the authored WGSL section, inside `SHADER_DIR/src`.
    pub main_source: &'static str,
    /// File name of the assembled WGSL module, inside [`SHADER_DIR`].
    pub wgsl_file: &'static str,
    /// Whether the generated procedural glyph table is part of the module.
    pub glyph_table: bool,
    /// Entry points, in manifest order.
    pub stages: &'static [StageSpec],
    /// Texture formats of the texture bindings.
    pub texture_formats: &'static [TextureFormat],
}

/// The shaders this generator owns.
pub const SHADERS: [ShaderSpec; 2] = [
    ShaderSpec {
        id: "bijou-surface",
        main_source: "bijou-surface.main.wgsl",
        wgsl_file: "bijou-surface.wgsl",
        glyph_table: true,
        stages: &[
            StageSpec {
                stage: Stage::Vertex,
                entry_point: "vs_main",
                glsl_file: "bijou-surface.vert.glsl",
            },
            StageSpec {
                stage: Stage::Fragment,
                entry_point: "fs_main",
                glsl_file: "bijou-surface.frag.glsl",
            },
        ],
        texture_formats: &[
            TextureFormat {
                group: 0,
                binding: 1,
                format: "rgba32uint",
            },
            TextureFormat {
                group: 0,
                binding: 2,
                format: "rgba8uint",
            },
        ],
    },
    ShaderSpec {
        id: "bijou-kernel-conformance",
        main_source: "bijou-kernel-conformance.main.wgsl",
        wgsl_file: "bijou-kernel-conformance.wgsl",
        glyph_table: false,
        stages: &[
            StageSpec {
                stage: Stage::Vertex,
                entry_point: "vs_main",
                glsl_file: "bijou-kernel-conformance.vert.glsl",
            },
            StageSpec {
                stage: Stage::Fragment,
                entry_point: "fs_transport_canary",
                glsl_file: "bijou-kernel-conformance.transport-canary.frag.glsl",
            },
            StageSpec {
                stage: Stage::Fragment,
                entry_point: "fs_div_round_even",
                glsl_file: "bijou-kernel-conformance.div-round-even.frag.glsl",
            },
            StageSpec {
                stage: Stage::Fragment,
                entry_point: "fs_ellipse_classify",
                glsl_file: "bijou-kernel-conformance.ellipse-classify.frag.glsl",
            },
        ],
        texture_formats: &[TextureFormat {
            group: 0,
            binding: 0,
            format: "rgba32uint",
        }],
    },
];

/// Failure of generation, checking or writing.
#[derive(Debug)]
pub enum ShadergenError {
    /// A file could not be read or written.
    Io {
        /// Repository-relative path.
        path: String,
        /// Operating-system detail.
        detail: String,
    },
    /// A vendored Bunny artifact does not have its pinned SHA-256.
    BunnyDigestMismatch {
        /// Repository-relative path.
        path: String,
        /// Pinned digest.
        expected: String,
        /// Digest of the bytes on disk.
        actual: String,
    },
    /// The procedural glyph table does not have the expected shape.
    GlyphTableInvalid {
        /// What is wrong.
        detail: String,
    },
    /// `naga` could not parse an assembled WGSL module.
    WgslParse {
        /// Shader identifier.
        shader: String,
        /// `naga` diagnostic.
        detail: String,
    },
    /// `naga` rejected an assembled WGSL module.
    WgslValidation {
        /// Shader identifier.
        shader: String,
        /// `naga` diagnostic.
        detail: String,
    },
    /// `naga` could not translate an entry point to GLSL ES 3.00.
    GlslWrite {
        /// Shader identifier.
        shader: String,
        /// Entry point name.
        entry_point: String,
        /// `naga` diagnostic.
        detail: String,
    },
    /// The command line is not valid.
    Usage {
        /// What is wrong.
        detail: String,
    },
    /// Checked-in artifacts differ from a fresh generation.
    Drift {
        /// Repository-relative paths that differ or are missing.
        paths: Vec<String>,
    },
}

impl ShadergenError {
    /// Stable error code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Io { .. } => "GEORDI_E_BIJOU_SHADERGEN_IO",
            Self::BunnyDigestMismatch { .. } => "GEORDI_E_BIJOU_SHADERGEN_BUNNY_DIGEST_MISMATCH",
            Self::GlyphTableInvalid { .. } => "GEORDI_E_BIJOU_SHADERGEN_GLYPH_TABLE_INVALID",
            Self::WgslParse { .. } => "GEORDI_E_BIJOU_SHADERGEN_WGSL_PARSE",
            Self::WgslValidation { .. } => "GEORDI_E_BIJOU_SHADERGEN_WGSL_VALIDATION",
            Self::GlslWrite { .. } => "GEORDI_E_BIJOU_SHADERGEN_GLSL_WRITE",
            Self::Usage { .. } => "GEORDI_E_BIJOU_SHADERGEN_USAGE",
            Self::Drift { .. } => "GEORDI_E_BIJOU_SHADERGEN_DRIFT",
        }
    }

    /// Every stable error code, in declaration order.
    pub const CODES: [&'static str; 8] = [
        "GEORDI_E_BIJOU_SHADERGEN_IO",
        "GEORDI_E_BIJOU_SHADERGEN_BUNNY_DIGEST_MISMATCH",
        "GEORDI_E_BIJOU_SHADERGEN_GLYPH_TABLE_INVALID",
        "GEORDI_E_BIJOU_SHADERGEN_WGSL_PARSE",
        "GEORDI_E_BIJOU_SHADERGEN_WGSL_VALIDATION",
        "GEORDI_E_BIJOU_SHADERGEN_GLSL_WRITE",
        "GEORDI_E_BIJOU_SHADERGEN_USAGE",
        "GEORDI_E_BIJOU_SHADERGEN_DRIFT",
    ];
}

impl Display for ShadergenError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io { path, detail } => write!(formatter, "{path}: {detail}"),
            Self::BunnyDigestMismatch {
                path,
                expected,
                actual,
            } => write!(
                formatter,
                "{path}: SHA-256 is {actual}, but the pinned Bunny artifact is {expected}"
            ),
            Self::GlyphTableInvalid { detail } => {
                write!(formatter, "{GLYPH_TABLE_PATH}: {detail}")
            }
            Self::WgslParse { shader, detail } => {
                write!(formatter, "{shader}: naga could not parse the WGSL: {detail}")
            }
            Self::WgslValidation { shader, detail } => {
                write!(formatter, "{shader}: naga rejected the WGSL: {detail}")
            }
            Self::GlslWrite {
                shader,
                entry_point,
                detail,
            } => write!(
                formatter,
                "{shader}: naga could not translate {entry_point} to GLSL ES 3.00: {detail}"
            ),
            Self::Usage { detail } => write!(formatter, "{detail}"),
            Self::Drift { paths } => write!(
                formatter,
                "{} checked-in artifact(s) differ from a fresh generation: {}",
                paths.len(),
                paths.join(", ")
            ),
        }
    }
}

impl Error for ShadergenError {}

/// One generated file.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Artifact {
    /// Repository-relative path, with `/` separators.
    pub path: String,
    /// Exact bytes of the file.
    pub bytes: Vec<u8>,
}

/// How a generated file relates to the file on disk.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ArtifactState {
    /// `check`: the file on disk is byte-identical.
    Match,
    /// `check`: the file on disk differs.
    Drift,
    /// `check`: there is no file on disk.
    Missing,
    /// `write`: the file was created or replaced.
    Written,
    /// `write`: the file on disk was already byte-identical.
    Unchanged,
}

impl ArtifactState {
    /// State name used in output lines.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Match => "match",
            Self::Drift => "drift",
            Self::Missing => "missing",
            Self::Written => "written",
            Self::Unchanged => "unchanged",
        }
    }
}

/// Outcome for one generated file.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtifactStatus {
    /// Repository-relative path, with `/` separators.
    pub path: String,
    /// SHA-256 of the freshly generated bytes.
    pub sha256: String,
    /// Relation to the file on disk.
    pub state: ArtifactState,
}

/// Lowercase hexadecimal SHA-256 of `bytes`.
#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(64);
    for byte in digest {
        // Writing to a String cannot fail.
        let _unused = write!(hex, "{byte:02x}");
    }
    hex
}

/// Digest that identifies the full set of GLSL stages of one shader.
///
/// It is the SHA-256 of, for each stage in manifest order, the stage file name, a line feed, the
/// decimal byte length, a line feed, and the stage bytes.
#[must_use]
pub fn generated_glsl_sha256(stages: &[(&str, &[u8])]) -> String {
    let mut framed = Vec::new();
    for (file_name, bytes) in stages {
        framed.extend_from_slice(file_name.as_bytes());
        framed.push(b'\n');
        framed.extend_from_slice(bytes.len().to_string().as_bytes());
        framed.push(b'\n');
        framed.extend_from_slice(bytes);
    }
    sha256_hex(&framed)
}

fn read(repo_root: &Path, path: &str) -> Result<Vec<u8>, ShadergenError> {
    fs::read(repo_root.join(path)).map_err(|error| ShadergenError::Io {
        path: path.to_owned(),
        detail: error.to_string(),
    })
}

fn glyph_error(detail: impl Into<String>) -> ShadergenError {
    ShadergenError::GlyphTableInvalid {
        detail: detail.into(),
    }
}

fn glyph_entries(
    table: &Value,
    section: &str,
    start: u64,
    count: usize,
    bits: u32,
) -> Result<Vec<u32>, ShadergenError> {
    let entries = table
        .get(section)
        .and_then(|value| value.get("entries"))
        .and_then(Value::as_array)
        .ok_or_else(|| glyph_error(format!("{section}.entries must be an array")))?;
    if entries.len() != count {
        return Err(glyph_error(format!(
            "{section}.entries must hold {count} entries, found {}",
            entries.len()
        )));
    }
    let mut packed = Vec::with_capacity(count);
    for (index, entry) in entries.iter().enumerate() {
        let code_point = entry.get("codePoint").and_then(Value::as_u64);
        let expected = u64::try_from(index)
            .ok()
            .and_then(|offset| start.checked_add(offset));
        if code_point.is_none() || code_point != expected {
            return Err(glyph_error(format!(
                "{section}.entries[{index}].codePoint must be {}",
                expected.map_or_else(String::new, |value| value.to_string())
            )));
        }
        let value = entry
            .get("packedU32")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .filter(|value| value >> bits == 0)
            .ok_or_else(|| {
                glyph_error(format!(
                    "{section}.entries[{index}].packedU32 must be an integer below 2^{bits}"
                ))
            })?;
        packed.push(value);
    }
    Ok(packed)
}

fn wgsl_const_array(name: &str, values: &[u32]) -> String {
    let count = values.len();
    let mut out = format!("const {name}: array<u32, {count}> = array<u32, {count}>(\n");
    for row in values.chunks(8) {
        out.push_str("   ");
        for value in row {
            // Writing to a String cannot fail.
            let _unused = write!(out, " 0x{value:05x}u,");
        }
        out.push('\n');
    }
    out.push_str(");\n");
    out
}

/// Renders the WGSL `const` block for the procedural glyph table JSON.
///
/// # Errors
///
/// Returns [`ShadergenError::GlyphTableInvalid`] when the JSON is not a `bijou-procedural-glyphs/1`
/// table with 128 Box-Drawing and 32 Block Element entries in code point order.
pub fn glyph_table_wgsl(table_json: &[u8]) -> Result<String, ShadergenError> {
    let table: Value =
        serde_json::from_slice(table_json).map_err(|error| glyph_error(error.to_string()))?;
    if table.get("schemaVersion").and_then(Value::as_str) != Some("bijou-procedural-glyphs/1") {
        return Err(glyph_error(
            "schemaVersion must be bijou-procedural-glyphs/1",
        ));
    }
    let boxes = glyph_entries(&table, "boxDrawing", 0x2500, 128, 14)?;
    let blocks = glyph_entries(&table, "blockElements", 0x2580, 32, 18)?;
    let mut out = String::new();
    out.push_str("// BOX_GLYPHS[codePoint - 0x2500], 14 bits per entry.\n");
    out.push_str(&wgsl_const_array("BOX_GLYPHS", &boxes));
    out.push_str("\n// BLOCK_GLYPHS[codePoint - 0x2580], 18 bits per entry.\n");
    out.push_str(&wgsl_const_array("BLOCK_GLYPHS", &blocks));
    Ok(out)
}

/// Parses and validates a complete WGSL module with pinned `naga`.
///
/// `label` names the module in the error.
///
/// # Errors
///
/// Returns [`ShadergenError::WgslParse`] or [`ShadergenError::WgslValidation`] with the `naga`
/// diagnostic.
pub fn validate_wgsl(label: &str, wgsl: &str) -> Result<(), ShadergenError> {
    let _unused = wgsl;
    Err(ShadergenError::WgslValidation {
        shader: label.to_owned(),
        detail: "not implemented".to_owned(),
    })
}

/// Generates every artifact from the inputs under `repo_root`, without touching the disk.
///
/// The manifest is the last artifact.
///
/// # Errors
///
/// Returns a [`ShadergenError`] when an input is missing, a vendored Bunny artifact does not have
/// its pinned digest, the glyph table is malformed, or `naga` rejects a shader.
pub fn generate(repo_root: &Path) -> Result<Vec<Artifact>, ShadergenError> {
    let _table = read(repo_root, GLYPH_TABLE_PATH)?;
    Err(ShadergenError::Usage {
        detail: "not implemented".to_owned(),
    })
}

/// Compares a fresh generation with the files on disk. Never writes.
///
/// # Errors
///
/// Returns a [`ShadergenError`] when generation fails or a file on disk cannot be read.
pub fn check(repo_root: &Path) -> Result<Vec<ArtifactStatus>, ShadergenError> {
    compare(repo_root, false)
}

/// Writes every generated file that differs from the file on disk.
///
/// # Errors
///
/// Returns a [`ShadergenError`] when generation fails or a file cannot be read or written.
pub fn write(repo_root: &Path) -> Result<Vec<ArtifactStatus>, ShadergenError> {
    compare(repo_root, true)
}

fn compare(repo_root: &Path, write_changes: bool) -> Result<Vec<ArtifactStatus>, ShadergenError> {
    let mut statuses = Vec::new();
    for artifact in generate(repo_root)? {
        let target = repo_root.join(&artifact.path);
        let io_error = |error: std::io::Error| ShadergenError::Io {
            path: artifact.path.clone(),
            detail: error.to_string(),
        };
        let on_disk = match fs::read(&target) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(io_error(error)),
        };
        let identical = on_disk.as_deref() == Some(artifact.bytes.as_slice());
        let state = match (write_changes, identical, on_disk.is_some()) {
            (false, true, _) => ArtifactState::Match,
            (false, false, true) => ArtifactState::Drift,
            (false, false, false) => ArtifactState::Missing,
            (true, true, _) => ArtifactState::Unchanged,
            (true, false, _) => {
                fs::write(&target, &artifact.bytes).map_err(io_error)?;
                ArtifactState::Written
            }
        };
        statuses.push(ArtifactStatus {
            sha256: sha256_hex(&artifact.bytes),
            path: artifact.path,
            state,
        });
    }
    Ok(statuses)
}
