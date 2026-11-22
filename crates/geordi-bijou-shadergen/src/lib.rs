//! Assembles the canonical `bijou-surface-gpu/1` WGSL shader and generates its GLSL ES 3.00 stages.
//!
//! The inputs are the authored WGSL sections, the vendored Bunny helper artifacts and the
//! procedural glyph table. The outputs are the assembled WGSL modules, one GLSL ES 3.00 file per
//! entry point, and a content-addressed implementation manifest. Every output is checked in, and
//! [`check`] reports any byte that differs from a fresh generation.

#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter, Write as _};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use naga::back::glsl;
use naga::valid::{Capabilities, ValidationFlags, Validator};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

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
                write!(
                    formatter,
                    "{shader}: naga could not parse the WGSL: {detail}"
                )
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

fn read_text(repo_root: &Path, path: &str) -> Result<String, ShadergenError> {
    String::from_utf8(read(repo_root, path)?).map_err(|error| ShadergenError::Io {
        path: path.to_owned(),
        detail: error.to_string(),
    })
}

fn read_pinned(repo_root: &Path, path: &str, expected: &str) -> Result<Vec<u8>, ShadergenError> {
    let bytes = read(repo_root, path)?;
    let actual = sha256_hex(&bytes);
    if actual == expected {
        Ok(bytes)
    } else {
        Err(ShadergenError::BunnyDigestMismatch {
            path: path.to_owned(),
            expected: expected.to_owned(),
            actual,
        })
    }
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

struct Inputs {
    bunny_wgsl: Vec<String>,
    glyph_table_sha256: String,
    glyph_table_wgsl: String,
}

fn load_inputs(repo_root: &Path) -> Result<Inputs, ShadergenError> {
    let mut bunny_wgsl = Vec::with_capacity(BUNNY_PRIMITIVES.len());
    for primitive in &BUNNY_PRIMITIVES {
        let bytes = read_pinned(repo_root, primitive.wgsl_path, primitive.wgsl_sha256)?;
        let _vectors = read_pinned(repo_root, primitive.vectors_path, primitive.vectors_sha256)?;
        bunny_wgsl.push(
            String::from_utf8(bytes).map_err(|error| ShadergenError::Io {
                path: primitive.wgsl_path.to_owned(),
                detail: error.to_string(),
            })?,
        );
    }
    let table = read(repo_root, GLYPH_TABLE_PATH)?;
    Ok(Inputs {
        bunny_wgsl,
        glyph_table_sha256: sha256_hex(&table),
        glyph_table_wgsl: glyph_table_wgsl(&table)?,
    })
}

fn main_source_path(spec: &ShaderSpec) -> String {
    format!("{SHADER_DIR}/src/{}", spec.main_source)
}

fn assemble(spec: &ShaderSpec, inputs: &Inputs, main_source: &str) -> String {
    let rule = "// ".to_owned() + &"=".repeat(93) + "\n";
    let mut out = String::new();
    out.push_str("// GENERATED FILE. DO NOT EDIT.\n//\n");
    out.push_str("// Assembled by geordi-bijou-shadergen, in this order, from:\n");
    for primitive in &BUNNY_PRIMITIVES {
        let _unused = writeln!(
            out,
            "//   {} ({}, flyingrobots/bunny@{}, sha256 {})",
            primitive.wgsl_path,
            primitive.contract_id,
            primitive.bunny_commit,
            primitive.wgsl_sha256
        );
    }
    if spec.glyph_table {
        let _unused = writeln!(
            out,
            "//   {GLYPH_TABLE_PATH} (sha256 {})",
            inputs.glyph_table_sha256
        );
    }
    let _unused = writeln!(out, "//   {}", main_source_path(spec));
    out.push_str("//\n// Regenerate with: cargo run -p geordi-bijou-shadergen -- --write\n");
    for (primitive, wgsl) in BUNNY_PRIMITIVES.iter().zip(&inputs.bunny_wgsl) {
        out.push('\n');
        out.push_str(&rule);
        let _unused = writeln!(
            out,
            "// Begin {} (verbatim bytes of {})",
            primitive.contract_id, primitive.wgsl_path
        );
        out.push_str(&rule);
        out.push_str(wgsl);
        out.push_str(&rule);
        let _unused = writeln!(out, "// End {}", primitive.contract_id);
        out.push_str(&rule);
    }
    if spec.glyph_table {
        out.push('\n');
        out.push_str(&rule);
        let _unused = writeln!(
            out,
            "// Begin procedural glyph table (generated from {GLYPH_TABLE_PATH})"
        );
        out.push_str(&rule);
        out.push_str(&inputs.glyph_table_wgsl);
        out.push_str(&rule);
        out.push_str("// End procedural glyph table\n");
        out.push_str(&rule);
    }
    out.push('\n');
    out.push_str(main_source);
    out
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
    validate_module(label, wgsl)
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
    let inputs = load_inputs(repo_root)?;
    let mut artifacts = Vec::new();
    let mut shader_entries = Vec::with_capacity(SHADERS.len());
    for spec in &SHADERS {
        let source_path = main_source_path(spec);
        let main_source = read_text(repo_root, &source_path)?;
        let wgsl = assemble(spec, &inputs, &main_source);
        let translated = translate(spec, &wgsl)?;
        shader_entries.push(shader_entry(
            spec,
            &source_path,
            &main_source,
            &wgsl,
            &translated,
        ));
        artifacts.push(Artifact {
            path: format!("{SHADER_DIR}/{}", spec.wgsl_file),
            bytes: wgsl.into_bytes(),
        });
        for (stage, output) in spec.stages.iter().zip(translated.stages) {
            artifacts.push(Artifact {
                path: format!("{SHADER_DIR}/{}", stage.glsl_file),
                bytes: output.source.into_bytes(),
            });
        }
    }
    artifacts.push(Artifact {
        path: MANIFEST_PATH.to_owned(),
        bytes: render_manifest(&inputs.glyph_table_sha256, &shader_entries).into_bytes(),
    });
    Ok(artifacts)
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

// ---------------------------------------------------------------------------------------------
// WGSL validation and GLSL ES 3.00 translation with pinned naga
// ---------------------------------------------------------------------------------------------

/// `(group, binding)` of a resource.
type Slot = (u32, u32);

/// One translated entry point.
struct StageOutput {
    /// Exact GLSL ES 3.00 text written by `naga`.
    source: String,
    /// GLSL sampler uniform name of each texture binding the stage uses.
    texture_names: BTreeMap<Slot, String>,
    /// GLSL uniform block name of each uniform buffer binding the stage uses.
    block_names: BTreeMap<Slot, String>,
}

/// One member of a uniform buffer struct.
struct Member {
    name: String,
    type_name: String,
    offset: u32,
}

/// What a binding is.
enum BindingKind {
    /// Uniform buffer with a struct layout.
    UniformBuffer {
        type_name: String,
        size: u32,
        members: Vec<Member>,
    },
    /// Sampled texture.
    Texture { wgsl_type: String },
}

/// One `@group/@binding` resource of a WGSL module.
struct Binding {
    slot: Slot,
    wgsl_name: String,
    kind: BindingKind,
}

/// A validated module and its translated stages.
struct Translated {
    /// Stages in the order of [`ShaderSpec::stages`].
    stages: Vec<StageOutput>,
    /// Bindings in `(group, binding)` order.
    bindings: Vec<Binding>,
    /// Pipeline constants applied to every GLSL stage.
    pipeline_constants: BTreeMap<String, f64>,
}

/// GLSL version every stage is written for.
const GLSL_VERSION: glsl::Version = glsl::Version::Embedded {
    version: 300,
    is_webgl: true,
};

const fn scalar_name(scalar: naga::Scalar) -> &'static str {
    match (scalar.kind, scalar.width) {
        (naga::ScalarKind::Uint, 4) => "u32",
        (naga::ScalarKind::Sint, 4) => "i32",
        (naga::ScalarKind::Float, 4) => "f32",
        (naga::ScalarKind::Bool, _) => "bool",
        _ => "unsupported",
    }
}

fn type_name(module: &naga::Module, handle: naga::Handle<naga::Type>) -> String {
    let ty = &module.types[handle];
    match ty.inner {
        naga::TypeInner::Scalar(scalar) => scalar_name(scalar).to_owned(),
        naga::TypeInner::Vector { size, scalar } => {
            format!("vec{}<{}>", size as u8, scalar_name(scalar))
        }
        naga::TypeInner::Image {
            dim: naga::ImageDimension::D2,
            arrayed: false,
            class: naga::ImageClass::Sampled { kind, multi: false },
        } => format!(
            "texture_2d<{}>",
            scalar_name(naga::Scalar { kind, width: 4 })
        ),
        _ => ty.name.clone().unwrap_or_else(|| "unsupported".to_owned()),
    }
}

fn bindings(module: &naga::Module) -> Vec<Binding> {
    let mut found = Vec::new();
    for (_, variable) in module.global_variables.iter() {
        let Some(resource) = &variable.binding else {
            continue;
        };
        let kind = match &module.types[variable.ty].inner {
            naga::TypeInner::Struct { members, span } => BindingKind::UniformBuffer {
                type_name: type_name(module, variable.ty),
                size: *span,
                members: members
                    .iter()
                    .map(|member| Member {
                        name: member.name.clone().unwrap_or_default(),
                        type_name: type_name(module, member.ty),
                        offset: member.offset,
                    })
                    .collect(),
            },
            _ => BindingKind::Texture {
                wgsl_type: type_name(module, variable.ty),
            },
        };
        found.push(Binding {
            slot: (resource.group, resource.binding),
            wgsl_name: variable.name.clone().unwrap_or_default(),
            kind,
        });
    }
    found.sort_by_key(|binding| binding.slot);
    found
}

fn slot_of(module: &naga::Module, handle: naga::Handle<naga::GlobalVariable>) -> Option<Slot> {
    module.global_variables[handle]
        .binding
        .as_ref()
        .map(|resource| (resource.group, resource.binding))
}

fn translate_stage(
    spec: &ShaderSpec,
    stage: &StageSpec,
    module: &naga::Module,
    info: &naga::valid::ModuleInfo,
    constants: &naga::back::PipelineConstants,
) -> Result<StageOutput, ShadergenError> {
    let glsl_error = |detail: String| ShadergenError::GlslWrite {
        shader: spec.id.to_owned(),
        entry_point: stage.entry_point.to_owned(),
        detail,
    };
    let shader_stage = match stage.stage {
        Stage::Vertex => naga::ShaderStage::Vertex,
        Stage::Fragment => naga::ShaderStage::Fragment,
    };
    let (module, info) = naga::back::pipeline_constants::process_overrides(
        module,
        info,
        Some((shader_stage, stage.entry_point)),
        constants,
    )
    .map_err(|error| glsl_error(error.to_string()))?;
    let options = glsl::Options {
        version: GLSL_VERSION,
        writer_flags: glsl::WriterFlags::empty(),
        binding_map: glsl::BindingMap::default(),
        zero_initialize_workgroup_memory: true,
    };
    let pipeline_options = glsl::PipelineOptions {
        shader_stage,
        entry_point: stage.entry_point.to_owned(),
        multiview: None,
    };
    let mut source = String::new();
    let reflection = glsl::Writer::new(
        &mut source,
        &module,
        &info,
        &options,
        &pipeline_options,
        naga::proc::BoundsCheckPolicies::default(),
    )
    .and_then(|mut writer| writer.write())
    .map_err(|error| glsl_error(error.to_string()))?;

    let mut texture_names = BTreeMap::new();
    for (name, mapping) in &reflection.texture_mapping {
        if let Some(slot) = slot_of(&module, mapping.texture) {
            let _previous = texture_names.insert(slot, name.clone());
        }
    }
    let mut block_names = BTreeMap::new();
    for (handle, name) in &reflection.uniforms {
        if let Some(slot) = slot_of(&module, *handle) {
            let _previous = block_names.insert(slot, name.clone());
        }
    }
    Ok(StageOutput {
        source,
        texture_names,
        block_names,
    })
}

/// Parses and validates `wgsl`, then translates every stage of `spec`.
fn translate(spec: &ShaderSpec, wgsl: &str) -> Result<Translated, ShadergenError> {
    let module = naga::front::wgsl::parse_str(wgsl).map_err(|error| ShadergenError::WgslParse {
        shader: spec.id.to_owned(),
        detail: error.emit_to_string(wgsl),
    })?;
    let info = Validator::new(ValidationFlags::all(), Capabilities::empty())
        .validate(&module)
        .map_err(|error| ShadergenError::WgslValidation {
            shader: spec.id.to_owned(),
            detail: error.emit_to_string(wgsl),
        })?;

    let mut pipeline_constants = BTreeMap::new();
    let mut constants = naga::back::PipelineConstants::default();
    let has_origin_override = module
        .overrides
        .iter()
        .any(|(_, item)| item.name.as_deref() == Some(FRAG_ORIGIN_OVERRIDE));
    if has_origin_override {
        let _previous = constants.insert(FRAG_ORIGIN_OVERRIDE.to_owned(), 1.0);
        let _previous = pipeline_constants.insert(FRAG_ORIGIN_OVERRIDE.to_owned(), 1.0);
    }

    let mut stages = Vec::with_capacity(spec.stages.len());
    for stage in spec.stages {
        stages.push(translate_stage(spec, stage, &module, &info, &constants)?);
    }
    Ok(Translated {
        stages,
        bindings: bindings(&module),
        pipeline_constants,
    })
}

/// Parses and validates a complete WGSL module with pinned `naga`.
fn validate_module(shader: &str, wgsl: &str) -> Result<(), ShadergenError> {
    let module = naga::front::wgsl::parse_str(wgsl).map_err(|error| ShadergenError::WgslParse {
        shader: shader.to_owned(),
        detail: error.emit_to_string(wgsl),
    })?;
    Validator::new(ValidationFlags::all(), Capabilities::empty())
        .validate(&module)
        .map(|_info| ())
        .map_err(|error| ShadergenError::WgslValidation {
            shader: shader.to_owned(),
            detail: error.emit_to_string(wgsl),
        })
}

// ---------------------------------------------------------------------------------------------
// Content-addressed implementation manifest
// ---------------------------------------------------------------------------------------------

fn binding_entry(spec: &ShaderSpec, binding: &Binding, translated: &Translated) -> Value {
    let mut glsl = Map::new();
    for (stage, output) in spec.stages.iter().zip(&translated.stages) {
        let name = match binding.kind {
            BindingKind::UniformBuffer { .. } => output.block_names.get(&binding.slot),
            BindingKind::Texture { .. } => output.texture_names.get(&binding.slot),
        };
        let _previous = glsl.insert(
            stage.glsl_file.to_owned(),
            name.map_or(Value::Null, |name| Value::String(name.clone())),
        );
    }
    let mut entry = json!({
        "group": binding.slot.0,
        "binding": binding.slot.1,
        "wgslName": binding.wgsl_name,
        "glslNames": glsl,
    });
    match &binding.kind {
        BindingKind::UniformBuffer {
            type_name,
            size,
            members,
        } => {
            entry["kind"] = json!("uniform-buffer");
            entry["glslNameKind"] = json!("uniform-block");
            entry["wgslType"] = json!(type_name);
            entry["byteSize"] = json!(size);
            entry["members"] = members
                .iter()
                .map(|member| {
                    json!({
                        "name": member.name,
                        "wgslType": member.type_name,
                        "byteOffset": member.offset,
                    })
                })
                .collect();
        }
        BindingKind::Texture { wgsl_type } => {
            let format = spec
                .texture_formats
                .iter()
                .find(|format| (format.group, format.binding) == binding.slot)
                .map(|format| format.format);
            entry["kind"] = json!("texture");
            entry["glslNameKind"] = json!("sampler-uniform");
            entry["glslType"] = json!("usampler2D");
            entry["wgslType"] = json!(wgsl_type);
            entry["textureFormat"] = json!(format);
        }
    }
    entry
}

/// Manifest entry of one shader.
fn shader_entry(
    spec: &ShaderSpec,
    source_path: &str,
    main_source: &str,
    wgsl: &str,
    translated: &Translated,
) -> Value {
    let framed: Vec<(&str, &[u8])> = spec
        .stages
        .iter()
        .zip(&translated.stages)
        .map(|(stage, output)| (stage.glsl_file, output.source.as_bytes()))
        .collect();
    let stages: Vec<Value> = spec
        .stages
        .iter()
        .zip(&translated.stages)
        .map(|(stage, output)| {
            json!({
                "stage": stage.stage.name(),
                "entryPoint": stage.entry_point,
                "path": format!("{SHADER_DIR}/{}", stage.glsl_file),
                "sha256": sha256_hex(output.source.as_bytes()),
            })
        })
        .collect();
    let bindings: Vec<Value> = translated
        .bindings
        .iter()
        .map(|binding| binding_entry(spec, binding, translated))
        .collect();
    json!({
        "id": spec.id,
        "authoredSource": { "path": source_path, "sha256": sha256_hex(main_source.as_bytes()) },
        "includesProceduralTable": spec.glyph_table,
        "wgslPath": format!("{SHADER_DIR}/{}", spec.wgsl_file),
        "assembledWgslSha256": sha256_hex(wgsl.as_bytes()),
        "generatedGlslSha256": generated_glsl_sha256(&framed),
        "pipelineConstants": translated.pipeline_constants,
        "stages": stages,
        "bindings": bindings,
    })
}

/// Renders the manifest as pretty-printed JSON with sorted keys and a trailing line feed.
fn render_manifest(glyph_table_sha256: &str, shaders: &[Value]) -> String {
    let primitives: Vec<Value> = BUNNY_PRIMITIVES
        .iter()
        .map(|primitive| {
            json!({
                "contractId": primitive.contract_id,
                "bunnyRepository": "flyingrobots/bunny",
                "bunnyCommit": primitive.bunny_commit,
                "upstreamWgslPath": primitive.upstream_wgsl_path,
                "wgslPath": primitive.wgsl_path,
                "wgslSha256": primitive.wgsl_sha256,
                "upstreamVectorsPath": primitive.upstream_vectors_path,
                "vectorsPath": primitive.vectors_path,
                "vectorsSha256": primitive.vectors_sha256,
            })
        })
        .collect();
    let manifest = json!({
        "manifestVersion": MANIFEST_VERSION,
        "gpuAbiVersion": GPU_ABI_VERSION,
        "generator": {
            "name": env!("CARGO_PKG_NAME"),
            "version": env!("CARGO_PKG_VERSION"),
        },
        "naga": {
            "version": NAGA_VERSION,
            "features": NAGA_FEATURES,
            "validation": { "flags": "all", "capabilities": [] },
            "glslOptions": {
                "version": "300 es",
                "isWebgl": true,
                "writerFlags": [],
                "bindingMap": {},
                "zeroInitializeWorkgroupMemory": true,
                "boundsCheckPolicies": "default (unchecked)",
                "multiview": null,
            },
        },
        "fragmentOrigin": {
            "wgslOverride": FRAG_ORIGIN_OVERRIDE,
            "wgslDefault": "top-left",
            "glsl": "bottom-left, normalized by py = (canvasPx.y - 1u) - uint(gl_FragCoord.y)",
        },
        "generatedGlslSha256Rule": "SHA-256 of, for each stage in order: file name, LF, decimal byte length, LF, file bytes",
        "proceduralTablePath": GLYPH_TABLE_PATH,
        "proceduralTableSha256": glyph_table_sha256,
        "bunnyPrimitives": primitives,
        "shaders": shaders,
    });
    format!("{manifest:#}\n")
}

// ---------------------------------------------------------------------------------------------
// Command line: JSON Lines on stdout and stderr by default, prose with --human
// ---------------------------------------------------------------------------------------------

/// Version of every message type this command writes.
const MESSAGE_VERSION: &str = "1.0.0";

/// `(message type, stream, JSON Schema)` of every message this command writes.
const SCHEMAS: [(&str, &str, &str); 5] = [
    (
        "artifact",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/artifact.schema.json"),
    ),
    (
        "result",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/result.schema.json"),
    ),
    (
        "error",
        "stderr",
        include_str!("../../../schemas/geordi-bijou-shadergen/error.schema.json"),
    ),
    (
        "help",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/help.schema.json"),
    ),
    (
        "schema",
        "stdout",
        include_str!("../../../schemas/geordi-bijou-shadergen/schema.schema.json"),
    ),
];

const USAGE: &str =
    "geordi-bijou-shadergen (--check | --write | --schema | --help) [--repo-root <dir>] [--human]";

const OPTIONS: [(&str, &str); 6] = [
    (
        "--check",
        "Compare a fresh generation with the checked-in artifacts. Writes nothing. Exits 1 on any difference.",
    ),
    (
        "--write",
        "Write every generated artifact that differs from the file on disk.",
    ),
    (
        "--repo-root <dir>",
        "Repository root. Defaults to the current directory.",
    ),
    (
        "--schema",
        "Print the JSON Schema of every message type and exit 0.",
    ),
    (
        "--help",
        "Print this description and the schemas of the success and error output.",
    ),
    ("--human, --humanize", "Write prose instead of JSON Lines."),
];

const EXIT_CODES: [(u8, &str); 3] = [
    (0, "Success."),
    (1, "Generation failed or checked-in artifacts drifted."),
    (2, "Invalid command line."),
];

#[derive(Clone, Copy, Eq, PartialEq)]
enum Mode {
    Check,
    Write,
    Schema,
    Help,
}

struct Invocation {
    mode: Mode,
    human: bool,
    repo_root: PathBuf,
}

fn usage(detail: impl Into<String>) -> ShadergenError {
    ShadergenError::Usage {
        detail: detail.into(),
    }
}

fn parse(args: &[String], default_root: &Path) -> (bool, Result<Invocation, ShadergenError>) {
    let human = args
        .iter()
        .any(|arg| arg == "--human" || arg == "--humanize");
    let mut mode = None;
    let mut repo_root = default_root.to_path_buf();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let selected = match arg.as_str() {
            "--human" | "--humanize" => continue,
            "--check" => Mode::Check,
            "--write" => Mode::Write,
            "--schema" => Mode::Schema,
            "--help" | "-h" => Mode::Help,
            "--repo-root" => {
                let Some(value) = rest.next() else {
                    return (human, Err(usage("--repo-root needs a directory")));
                };
                repo_root = PathBuf::from(value);
                continue;
            }
            other => return (human, Err(usage(format!("unknown argument: {other}")))),
        };
        if mode.is_some_and(|previous| previous != selected) {
            return (
                human,
                Err(usage(
                    "choose exactly one of --check, --write, --schema, --help",
                )),
            );
        }
        mode = Some(selected);
    }
    let invocation = mode
        .map(|mode| Invocation {
            mode,
            human,
            repo_root,
        })
        .ok_or_else(|| usage("choose one of --check, --write, --schema, --help"));
    (human, invocation)
}

fn tagged(kind: &str, mut body: Value) -> Value {
    body["_schema"] = json!({
        "id": format!("geordi.bijou_shadergen.{kind}"),
        "version": MESSAGE_VERSION,
    });
    body["kind"] = json!(kind);
    body
}

// A closed pipe is the only way these writes fail, and there is nowhere left to report it.
fn emit(stream: &mut dyn Write, line: &Value) {
    let _unused = writeln!(stream, "{line}");
}

fn emit_text(stream: &mut dyn Write, text: &str) {
    let _unused = writeln!(stream, "{text}");
}

fn schema_lines(kinds: &[&str]) -> Vec<Value> {
    SCHEMAS
        .iter()
        .filter(|(kind, _, _)| kinds.contains(kind))
        .map(|(kind, stream, text)| {
            tagged(
                "schema",
                json!({
                    "describes": {
                        "id": format!("geordi.bijou_shadergen.{kind}"),
                        "version": MESSAGE_VERSION,
                    },
                    "stream": stream,
                    // The schema files are compiled in and covered by tests; null marks a
                    // corrupted build rather than hiding it.
                    "schema": serde_json::from_str::<Value>(text).unwrap_or(Value::Null),
                }),
            )
        })
        .collect()
}

fn help_line() -> Value {
    tagged(
        "help",
        json!({
            "command": "geordi-bijou-shadergen",
            "summary": "Assembles bijou-surface.wgsl from the pinned Bunny helpers and the procedural glyph table, translates it to GLSL ES 3.00 with pinned naga, and writes or checks the generated artifacts and their manifest.",
            "usage": USAGE,
            "options": OPTIONS
                .iter()
                .map(|(flag, description)| json!({ "flag": flag, "description": description }))
                .collect::<Vec<_>>(),
            "exitCodes": EXIT_CODES
                .iter()
                .map(|(code, meaning)| json!({ "code": code, "meaning": meaning }))
                .collect::<Vec<_>>(),
        }),
    )
}

fn print_help(human: bool, stdout: &mut dyn Write) {
    if human {
        emit_text(stdout, &format!("Usage: {USAGE}\n"));
        for (flag, description) in OPTIONS {
            emit_text(stdout, &format!("  {flag}\n      {description}"));
        }
        emit_text(stdout, "\nExit codes:");
        for (code, meaning) in EXIT_CODES {
            emit_text(stdout, &format!("  {code}  {meaning}"));
        }
        return;
    }
    emit(stdout, &help_line());
    for line in schema_lines(&["artifact", "result", "error"]) {
        emit(stdout, &line);
    }
}

fn print_schemas(human: bool, stdout: &mut dyn Write) {
    for line in schema_lines(&["artifact", "result", "error", "help", "schema"]) {
        if human {
            emit_text(
                stdout,
                &format!(
                    "{} {} ({})\n{:#}\n",
                    line["describes"]["id"].as_str().unwrap_or_default(),
                    MESSAGE_VERSION,
                    line["stream"].as_str().unwrap_or_default(),
                    line["schema"]
                ),
            );
        } else {
            emit(stdout, &line);
        }
    }
}

fn print_error(human: bool, error: &ShadergenError, stderr: &mut dyn Write) {
    if human {
        emit_text(stderr, &format!("error [{}]: {error}", error.code()));
        return;
    }
    let paths: Vec<&str> = match error {
        ShadergenError::Io { path, .. } | ShadergenError::BunnyDigestMismatch { path, .. } => {
            vec![path.as_str()]
        }
        ShadergenError::Drift { paths } => paths.iter().map(String::as_str).collect(),
        _ => Vec::new(),
    };
    emit(
        stderr,
        &tagged(
            "error",
            json!({ "code": error.code(), "message": error.to_string(), "paths": paths }),
        ),
    );
}

fn print_status(human: bool, mode: &str, status: &ArtifactStatus, stdout: &mut dyn Write) {
    if human {
        emit_text(
            stdout,
            &format!("{:<9} {}", status.state.name(), status.path),
        );
    } else {
        emit(
            stdout,
            &tagged(
                "artifact",
                json!({
                    "mode": mode,
                    "path": status.path,
                    "sha256": status.sha256,
                    "state": status.state.name(),
                }),
            ),
        );
    }
}

fn generate_mode(invocation: &Invocation, stdout: &mut dyn Write) -> Result<(), ShadergenError> {
    let (mode, statuses) = if invocation.mode == Mode::Write {
        ("write", write(&invocation.repo_root)?)
    } else {
        ("check", check(&invocation.repo_root)?)
    };
    for status in &statuses {
        print_status(invocation.human, mode, status, stdout);
    }
    let drifted: Vec<String> = statuses
        .iter()
        .filter(|status| matches!(status.state, ArtifactState::Drift | ArtifactState::Missing))
        .map(|status| status.path.clone())
        .collect();
    if !drifted.is_empty() {
        return Err(ShadergenError::Drift { paths: drifted });
    }
    if invocation.human {
        emit_text(
            stdout,
            &format!(
                "{mode}: {} artifact(s) agree with naga {NAGA_VERSION}",
                statuses.len()
            ),
        );
    } else {
        emit(
            stdout,
            &tagged(
                "result",
                json!({
                    "mode": mode,
                    "ok": true,
                    "artifacts": statuses.len(),
                    "nagaVersion": NAGA_VERSION,
                }),
            ),
        );
    }
    Ok(())
}

/// Runs the command line and returns the process exit code.
///
/// `args` excludes the program name. `default_root` is the repository root used when
/// `--repo-root` is absent. Every line written to `stdout` or `stderr` is one JSON object, unless
/// `--human` is present.
pub fn run(
    args: &[String],
    default_root: &Path,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
) -> u8 {
    let (human, parsed) = parse(args, default_root);
    let invocation = match parsed {
        Ok(invocation) => invocation,
        Err(error) => {
            print_error(human, &error, stderr);
            return 2;
        }
    };
    match invocation.mode {
        Mode::Help => {
            print_help(human, stdout);
            0
        }
        Mode::Schema => {
            print_schemas(human, stdout);
            0
        }
        Mode::Check | Mode::Write => match generate_mode(&invocation, stdout) {
            Ok(()) => 0,
            Err(error) => {
                print_error(human, &error, stderr);
                1
            }
        },
    }
}
