//! Rust types and JSON-boundary loaders for Geordi IR artifacts.

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Current supported Geordi IR version.
pub const GEORDI_IR_VERSION: &str = "geordi-ir/1";

/// Current supported Geordi numeric profile.
pub const GEORDI_NUMERIC_PROFILE: &str = "geordi-finite-binary64/1";

/// Required core Geordi feature profile entry.
pub const GEORDI_CORE_PROFILE: &str = "geordi/core/1";

/// Current supported strict text font-pack manifest version.
pub const GEORDI_FONT_PACK_VERSION: &str = "geordi-font-pack/1";

/// Current supported strict text font asset format.
pub const GEORDI_FONT_FORMAT_TTF: &str = "ttf";

/// Current supported upstream license-byte normalization profile.
pub const GEORDI_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE: &str =
    "trim-trailing-ascii-whitespace/1";

/// Current supported strict text fixture version.
pub const GEORDI_STRICT_TEXT_FIXTURE_VERSION: &str = "geordi-strict-text-fixture/1";

/// Current supported strict positioned glyph-run profile.
pub const GEORDI_STRICT_POSITIONED_GLYPH_RUN_PROFILE: &str = "geordi-strict-positioned-glyph-run/1";

/// Current supported fixed-point encoding for glyph positions.
pub const GEORDI_FIXED_26_6_POSITION_ENCODING: &str = "geordi-fixed-26.6/1";

/// Required feature for strict positioned glyph-run evidence.
pub const GEORDI_TEXT_FEATURE_POSITIONED_GLYPH_RUNS: &str = "text.positionedGlyphRuns";

/// Required feature for strict text font-pack evidence.
pub const GEORDI_TEXT_FEATURE_FONT_PACK: &str = "text.fontPack";

/// Required feature for strict text line-box evidence.
pub const GEORDI_TEXT_FEATURE_LINE_BOXES: &str = "text.lineBoxes";

/// Prefix used by Geordi SHA-256 content identity strings.
pub const GEORDI_SHA256_PREFIX: &str = "sha256:";

const GEORDI_JSON_SAFE_INTEGER_MAX: i64 = 9_007_199_254_740_991;

const GEORDI_KNOWN_FEATURES: &[&str] = &[
    GEORDI_CORE_PROFILE,
    "layout.resolved",
    "shape.group",
    "shape.image",
    "shape.rect",
    "shape.text",
    "paint.solid",
    "stroke.solid",
    "paint.opacity",
    "shape.cornerRadius",
    "text.fill",
    "text.raw-runtime-shaping",
    "text.fontPack",
    "text.shapingProfile",
    "text.lineBreakProfile",
    "text.fallbackChain",
    "text.glyphRuns",
    "text.lineBoxes",
    "asset.mesh",
    "mesh.triangle",
    "transform.matrix4",
    "camera.perspective",
    "projection.perspective",
    "depth.z-buffer",
    "material.solid",
    "playback.fixed-rate-rotation",
];

/// Content-addressed font-pack manifest used by strict positioned glyph-run fixtures.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiFontPackManifest {
    /// Font-pack schema version.
    pub font_pack_version: String,
    /// Font faces available to strict text fixtures.
    pub fonts: Vec<GeordiFontFace>,
}

/// One content-addressed font face available to strict text fixtures.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiFontFace {
    /// Stable font identifier used by glyph runs.
    pub id: String,
    /// Font file format.
    pub format: String,
    /// Repository-relative path to the font file.
    pub path: String,
    /// Content hash of the font file.
    pub sha256: String,
    /// Zero-based face index inside the font container.
    pub face_index: u32,
    /// Human-readable font family name.
    pub family_name: String,
    /// Human-readable font style name.
    pub style_name: String,
    /// Numeric OpenType weight.
    pub weight: u32,
    /// Redistribution and license proof for the font face.
    pub license: GeordiFontLicense,
    /// Upstream source proof for the font face.
    pub source: GeordiFontSource,
}

/// Redistribution and license proof for one font face.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiFontLicense {
    /// Human-readable license name.
    pub name: String,
    /// Repository-relative path to the checked-in license file.
    pub path: String,
    /// Whether the license permits redistribution in the fixture pack.
    pub redistribution_allowed: bool,
    /// Reserved font names declared by the license, if any.
    pub reserved_font_names: Vec<String>,
    /// Content hash of the checked-in license file.
    pub sha256: String,
}

/// Upstream source proof for one font face.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiFontSource {
    /// Upstream repository URL.
    pub repository: String,
    /// Upstream commit used as the source of truth.
    pub commit: String,
    /// Upstream path to the font file.
    pub path: String,
    /// Upstream path to the license file.
    pub license_path: String,
    /// Content hash of the upstream font bytes.
    pub font_sha256: String,
    /// Content hash of the upstream license bytes.
    pub license_sha256: String,
    /// License normalization profile used before hashing upstream license bytes.
    pub license_normalization: String,
}

/// Strict positioned glyph-run fixture manifest.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiStrictTextFixtureManifest {
    /// Strict text fixture schema version.
    pub fixture_version: String,
    /// Stable fixture identifier.
    pub id: String,
    /// Strict text profile name.
    pub text_profile: String,
    /// Fixed-point coordinate encoding.
    pub position_encoding: String,
    /// Repository-relative path to the font pack manifest.
    pub font_pack_path: String,
    /// Required strict text features.
    pub features: Vec<String>,
    /// Non-rendering semantic/source text metadata.
    pub semantic_text: GeordiStrictTextSemanticText,
    /// Explicit line boxes used by glyph runs.
    pub line_boxes: Vec<GeordiStrictTextLineBox>,
    /// Positioned glyph runs.
    pub glyph_runs: Vec<GeordiGlyphRun>,
}

/// Non-rendering semantic/source text metadata.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiStrictTextSemanticText {
    /// Whether this text metadata affects rendered pixels. Strict fixtures require `false`.
    pub affects_pixels: bool,
    /// BCP-47-like language tag for semantic/debug use.
    pub language: String,
    /// Source string for semantic/debug use.
    pub source: String,
}

/// Explicit fixed-point line box used by positioned glyph runs.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiStrictTextLineBox {
    /// Stable line box identifier.
    pub id: String,
    /// Fixed-point x coordinate.
    pub x: i64,
    /// Fixed-point y coordinate.
    pub y: i64,
    /// Fixed-point line box width.
    pub width: i64,
    /// Fixed-point line box height.
    pub height: i64,
    /// Fixed-point baseline y coordinate.
    pub baseline_y: i64,
}

/// One positioned glyph run.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiGlyphRun {
    /// Stable glyph-run identifier.
    pub id: String,
    /// Font id resolved through the referenced font pack.
    pub font_id: String,
    /// Line box id resolved through the fixture line boxes.
    pub line_box_id: String,
    /// Positioned glyphs in draw order.
    pub glyphs: Vec<GeordiPositionedGlyph>,
}

/// One positioned glyph in a strict text fixture.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiPositionedGlyph {
    /// Font-local glyph id.
    pub glyph_id: i64,
    /// Fixed-point glyph origin x coordinate.
    pub x: i64,
    /// Fixed-point glyph origin y coordinate.
    pub y: i64,
    /// Fixed-point x offset.
    pub x_offset: i64,
    /// Fixed-point y offset.
    pub y_offset: i64,
    /// Fixed-point advance.
    pub advance: i64,
}

/// Kind of font-pack artifact hash verified by the Rust boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GeordiFontPackHashArtifactKind {
    /// Font binary bytes.
    Font,
    /// Font license text bytes.
    License,
}

/// One successful font-pack hash verification result.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiFontPackHashVerification {
    /// Font id whose asset was checked.
    pub font_id: String,
    /// Kind of checked asset.
    pub kind: GeordiFontPackHashArtifactKind,
    /// Repository-relative checked path.
    pub path: String,
    /// Computed `sha256:` digest.
    pub sha256: String,
}

/// Typed rectangle-only subset of a `scene.geordi.json` artifact.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiIr {
    /// IR schema version.
    pub ir_version: String,
    /// Floating-point determinism profile.
    pub numeric_profile: String,
    /// Required Geordi feature profile entries.
    pub requires: Vec<String>,
    /// Scene-level metadata and canvas dimensions.
    pub scene: GeordiScene,
    /// Draw-order-preserving node list.
    pub nodes: Vec<GeordiNode>,
}

/// Scene-level metadata for a Geordi artifact.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiScene {
    /// Stable scene identifier.
    pub id: String,
    /// Scene width in scene units.
    pub width: f64,
    /// Scene height in scene units.
    pub height: f64,
    /// Optional scene units. The render-everywhere MVP uses `px`.
    pub units: Option<String>,
    /// Optional background color metadata.
    pub background: Option<String>,
}

/// Rectangle-only render node accepted by the Rust MVP.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiNode {
    /// Stable node identifier.
    pub id: String,
    /// Node kind. Slice 11 validation narrows this to `Rect`.
    pub kind: String,
    /// Optional parent node identifier.
    pub parent_id: Option<String>,
    /// Optional explicit z index.
    pub z_index: Option<f64>,
    /// Optional visibility flag.
    pub visible: Option<bool>,
    /// Optional authoring lock flag.
    pub locked: Option<bool>,
    /// Rectangle properties for the native MVP subset.
    pub props: GeordiRectProps,
}

/// Solid rectangle properties for the Rust render-everywhere MVP.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRectProps {
    /// Left coordinate in scene units.
    pub x: f64,
    /// Top coordinate in scene units.
    pub y: f64,
    /// Rectangle width in scene units.
    pub width: f64,
    /// Rectangle height in scene units.
    pub height: f64,
    /// Solid fill color in `#rrggbb` form.
    pub fill: String,
}

/// Custom error returned when parsing a Geordi IR JSON string fails.
#[derive(Debug)]
pub struct GeordiIrParseError {
    source: serde_json::Error,
}

impl GeordiIrParseError {
    const fn new(source: serde_json::Error) -> Self {
        Self { source }
    }
}

impl Display for GeordiIrParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi IR parse failed")
    }
}

impl Error for GeordiIrParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

/// Custom error returned when parsing a Geordi font-pack JSON string fails.
#[derive(Debug)]
pub struct GeordiFontPackParseError {
    source: serde_json::Error,
}

impl GeordiFontPackParseError {
    const fn new(source: serde_json::Error) -> Self {
        Self { source }
    }
}

impl Display for GeordiFontPackParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi font pack parse failed")
    }
}

impl Error for GeordiFontPackParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

/// Custom error returned when parsing a Geordi strict text fixture JSON string fails.
#[derive(Debug)]
pub struct GeordiStrictTextFixtureParseError {
    source: serde_json::Error,
}

impl GeordiStrictTextFixtureParseError {
    const fn new(source: serde_json::Error) -> Self {
        Self { source }
    }
}

impl Display for GeordiStrictTextFixtureParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi strict text fixture parse failed")
    }
}

impl Error for GeordiStrictTextFixtureParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

/// Custom error returned when loading a Geordi IR artifact from disk fails.
#[derive(Debug)]
pub struct GeordiIrLoadError {
    path: PathBuf,
    source: GeordiIrLoadErrorSource,
}

#[derive(Debug)]
enum GeordiIrLoadErrorSource {
    File(std::io::Error),
    Parse(GeordiIrParseError),
}

impl GeordiIrLoadError {
    const fn file(path: PathBuf, source: std::io::Error) -> Self {
        Self {
            path,
            source: GeordiIrLoadErrorSource::File(source),
        }
    }

    const fn parse(path: PathBuf, source: GeordiIrParseError) -> Self {
        Self {
            path,
            source: GeordiIrLoadErrorSource::Parse(source),
        }
    }

    /// Path that failed to load.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Display for GeordiIrLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "Geordi IR load failed: {}", self.path.display())
    }
}

impl Error for GeordiIrLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiIrLoadErrorSource::File(source) => Some(source),
            GeordiIrLoadErrorSource::Parse(source) => Some(source),
        }
    }
}

/// Custom error returned when loading a Geordi font-pack manifest from disk fails.
#[derive(Debug)]
pub struct GeordiFontPackLoadError {
    path: PathBuf,
    source: GeordiFontPackLoadErrorSource,
}

#[derive(Debug)]
enum GeordiFontPackLoadErrorSource {
    File(std::io::Error),
    Parse(GeordiFontPackParseError),
}

impl GeordiFontPackLoadError {
    const fn file(path: PathBuf, source: std::io::Error) -> Self {
        Self {
            path,
            source: GeordiFontPackLoadErrorSource::File(source),
        }
    }

    const fn parse(path: PathBuf, source: GeordiFontPackParseError) -> Self {
        Self {
            path,
            source: GeordiFontPackLoadErrorSource::Parse(source),
        }
    }

    /// Path that failed to load.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Display for GeordiFontPackLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Geordi font pack load failed: {}",
            self.path.display()
        )
    }
}

impl Error for GeordiFontPackLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiFontPackLoadErrorSource::File(source) => Some(source),
            GeordiFontPackLoadErrorSource::Parse(source) => Some(source),
        }
    }
}

/// Custom error returned when loading a Geordi strict text fixture from disk fails.
#[derive(Debug)]
pub struct GeordiStrictTextFixtureLoadError {
    path: PathBuf,
    source: GeordiStrictTextFixtureLoadErrorSource,
}

#[derive(Debug)]
enum GeordiStrictTextFixtureLoadErrorSource {
    File(std::io::Error),
    Parse(GeordiStrictTextFixtureParseError),
}

impl GeordiStrictTextFixtureLoadError {
    const fn file(path: PathBuf, source: std::io::Error) -> Self {
        Self {
            path,
            source: GeordiStrictTextFixtureLoadErrorSource::File(source),
        }
    }

    const fn parse(path: PathBuf, source: GeordiStrictTextFixtureParseError) -> Self {
        Self {
            path,
            source: GeordiStrictTextFixtureLoadErrorSource::Parse(source),
        }
    }

    /// Path that failed to load.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Display for GeordiStrictTextFixtureLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Geordi strict text fixture load failed: {}",
            self.path.display()
        )
    }
}

impl Error for GeordiStrictTextFixtureLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiStrictTextFixtureLoadErrorSource::File(source) => Some(source),
            GeordiStrictTextFixtureLoadErrorSource::Parse(source) => Some(source),
        }
    }
}

/// Custom error returned when font-pack asset hash verification fails.
#[derive(Debug)]
pub struct GeordiFontPackHashError {
    font_id: String,
    kind: GeordiFontPackHashArtifactKind,
    path: String,
    source: GeordiFontPackHashErrorSource,
}

#[derive(Debug)]
enum GeordiFontPackHashErrorSource {
    EscapedPath,
    InvalidManifest { message: String },
    Read(std::io::Error),
    Mismatch { actual: String, expected: String },
}

impl GeordiFontPackHashError {
    fn escaped_path(font_id: &str, kind: GeordiFontPackHashArtifactKind, path: &str) -> Self {
        Self {
            font_id: font_id.to_owned(),
            kind,
            path: path.to_owned(),
            source: GeordiFontPackHashErrorSource::EscapedPath,
        }
    }

    fn invalid_manifest(path: &str, message: &str) -> Self {
        Self {
            font_id: String::new(),
            kind: GeordiFontPackHashArtifactKind::Font,
            path: path.to_owned(),
            source: GeordiFontPackHashErrorSource::InvalidManifest {
                message: message.to_owned(),
            },
        }
    }

    fn read(
        font_id: &str,
        kind: GeordiFontPackHashArtifactKind,
        path: &str,
        source: std::io::Error,
    ) -> Self {
        Self {
            font_id: font_id.to_owned(),
            kind,
            path: path.to_owned(),
            source: GeordiFontPackHashErrorSource::Read(source),
        }
    }

    fn mismatch(
        font_id: &str,
        kind: GeordiFontPackHashArtifactKind,
        path: &str,
        expected: &str,
        actual: String,
    ) -> Self {
        Self {
            font_id: font_id.to_owned(),
            kind,
            path: path.to_owned(),
            source: GeordiFontPackHashErrorSource::Mismatch {
                actual,
                expected: expected.to_owned(),
            },
        }
    }

    /// Font id whose asset failed verification.
    #[must_use]
    pub fn font_id(&self) -> &str {
        &self.font_id
    }

    /// Kind of asset that failed verification.
    #[must_use]
    pub const fn kind(&self) -> GeordiFontPackHashArtifactKind {
        self.kind
    }

    /// Repository-relative path that failed verification.
    #[must_use]
    pub fn path(&self) -> &str {
        &self.path
    }

    /// Actual hash when the failure was a hash mismatch.
    #[must_use]
    pub fn actual(&self) -> Option<&str> {
        match &self.source {
            GeordiFontPackHashErrorSource::Mismatch { actual, .. } => Some(actual),
            GeordiFontPackHashErrorSource::EscapedPath
            | GeordiFontPackHashErrorSource::InvalidManifest { .. }
            | GeordiFontPackHashErrorSource::Read(_) => None,
        }
    }

    /// Expected hash when the failure was a hash mismatch.
    #[must_use]
    pub fn expected(&self) -> Option<&str> {
        match &self.source {
            GeordiFontPackHashErrorSource::Mismatch { expected, .. } => Some(expected),
            GeordiFontPackHashErrorSource::EscapedPath
            | GeordiFontPackHashErrorSource::InvalidManifest { .. }
            | GeordiFontPackHashErrorSource::Read(_) => None,
        }
    }

    /// Manifest contract failure message when hash verification rejected structure before I/O.
    #[must_use]
    pub fn manifest_message(&self) -> Option<&str> {
        match &self.source {
            GeordiFontPackHashErrorSource::InvalidManifest { message } => Some(message),
            GeordiFontPackHashErrorSource::EscapedPath
            | GeordiFontPackHashErrorSource::Read(_)
            | GeordiFontPackHashErrorSource::Mismatch { .. } => None,
        }
    }
}

impl Display for GeordiFontPackHashError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi font pack hash verification failed")
    }
}

impl Error for GeordiFontPackHashError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiFontPackHashErrorSource::Read(source) => Some(source),
            GeordiFontPackHashErrorSource::EscapedPath
            | GeordiFontPackHashErrorSource::InvalidManifest { .. }
            | GeordiFontPackHashErrorSource::Mismatch { .. } => None,
        }
    }
}

/// One structural validation failure for a Geordi IR artifact.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiIrValidationIssue {
    /// JSON-path-like location of the invalid field.
    pub path: String,
    /// Human-readable validation message.
    pub message: String,
}

impl GeordiIrValidationIssue {
    fn new(path: &str, message: &str) -> Self {
        Self {
            path: path.to_owned(),
            message: message.to_owned(),
        }
    }
}

/// Custom error returned when typed Geordi IR validation fails.
#[derive(Debug)]
pub struct GeordiIrValidationError {
    issues: Vec<GeordiIrValidationIssue>,
}

impl GeordiIrValidationError {
    const fn new(issues: Vec<GeordiIrValidationIssue>) -> Self {
        Self { issues }
    }

    /// Validation issues collected in deterministic traversal order.
    #[must_use]
    pub fn issues(&self) -> &[GeordiIrValidationIssue] {
        &self.issues
    }
}

impl Display for GeordiIrValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi IR validation failed")
    }
}

impl Error for GeordiIrValidationError {}

/// One structural validation failure for a Geordi strict text fixture.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiStrictTextFixtureValidationIssue {
    /// JSON-path-like location of the invalid field.
    pub path: String,
    /// Human-readable validation message.
    pub message: String,
}

impl GeordiStrictTextFixtureValidationIssue {
    fn new(path: &str, message: &str) -> Self {
        Self {
            path: path.to_owned(),
            message: message.to_owned(),
        }
    }
}

/// Custom error returned when typed strict text fixture validation fails.
#[derive(Debug)]
pub struct GeordiStrictTextFixtureValidationError {
    issues: Vec<GeordiStrictTextFixtureValidationIssue>,
}

impl GeordiStrictTextFixtureValidationError {
    const fn new(issues: Vec<GeordiStrictTextFixtureValidationIssue>) -> Self {
        Self { issues }
    }

    /// Validation issues collected in deterministic traversal order.
    #[must_use]
    pub fn issues(&self) -> &[GeordiStrictTextFixtureValidationIssue] {
        &self.issues
    }
}

impl Display for GeordiStrictTextFixtureValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi strict text fixture validation failed")
    }
}

impl Error for GeordiStrictTextFixtureValidationError {}

/// Parse a Geordi IR JSON string into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiIrParseError` when the source is not valid JSON or does not match the
/// rectangle-only Rust MVP subset.
pub fn parse_geordi_ir(source: &str) -> Result<GeordiIr, GeordiIrParseError> {
    serde_json::from_str(source).map_err(GeordiIrParseError::new)
}

/// Parse a Geordi font-pack JSON string into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiFontPackParseError` when the source is not valid JSON or does not match the
/// strict font-pack manifest shape.
pub fn parse_geordi_font_pack_manifest(
    source: &str,
) -> Result<GeordiFontPackManifest, GeordiFontPackParseError> {
    serde_json::from_str(source).map_err(GeordiFontPackParseError::new)
}

/// Parse a Geordi strict text fixture JSON string into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiStrictTextFixtureParseError` when the source is not valid JSON or does not match
/// the strict text fixture manifest shape.
pub fn parse_geordi_strict_text_fixture_manifest(
    source: &str,
) -> Result<GeordiStrictTextFixtureManifest, GeordiStrictTextFixtureParseError> {
    serde_json::from_str(source).map_err(GeordiStrictTextFixtureParseError::new)
}

/// Load a Geordi IR artifact from a path into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiIrLoadError` when the file cannot be read or its contents cannot be parsed as
/// the rectangle-only Rust MVP subset.
pub fn load_geordi_ir(path: impl AsRef<Path>) -> Result<GeordiIr, GeordiIrLoadError> {
    let path = path.as_ref();
    let source = fs::read_to_string(path)
        .map_err(|error| GeordiIrLoadError::file(path.to_path_buf(), error))?;

    parse_geordi_ir(&source).map_err(|error| GeordiIrLoadError::parse(path.to_path_buf(), error))
}

/// Load a Geordi font-pack manifest from a path into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiFontPackLoadError` when the file cannot be read or its contents cannot be parsed
/// as a strict font-pack manifest.
pub fn load_geordi_font_pack_manifest(
    path: impl AsRef<Path>,
) -> Result<GeordiFontPackManifest, GeordiFontPackLoadError> {
    let path = path.as_ref();
    let source = fs::read_to_string(path)
        .map_err(|error| GeordiFontPackLoadError::file(path.to_path_buf(), error))?;

    parse_geordi_font_pack_manifest(&source)
        .map_err(|error| GeordiFontPackLoadError::parse(path.to_path_buf(), error))
}

/// Load a Geordi strict text fixture from a path into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiStrictTextFixtureLoadError` when the file cannot be read or its contents cannot be
/// parsed as a strict text fixture manifest.
pub fn load_geordi_strict_text_fixture_manifest(
    path: impl AsRef<Path>,
) -> Result<GeordiStrictTextFixtureManifest, GeordiStrictTextFixtureLoadError> {
    let path = path.as_ref();
    let source = fs::read_to_string(path)
        .map_err(|error| GeordiStrictTextFixtureLoadError::file(path.to_path_buf(), error))?;

    parse_geordi_strict_text_fixture_manifest(&source)
        .map_err(|error| GeordiStrictTextFixtureLoadError::parse(path.to_path_buf(), error))
}

/// Compute a `sha256:` hash string from font-pack asset bytes.
#[must_use]
pub fn geordi_sha256_from_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{GEORDI_SHA256_PREFIX}{digest:x}")
}

/// Verify all font and license hashes declared by a font-pack manifest.
///
/// # Errors
///
/// Returns `GeordiFontPackHashError` when a declared path escapes the repository root, cannot be
/// read, or hashes to bytes other than the declared `sha256:` digest.
pub fn validate_geordi_font_pack_hashes(
    manifest: &GeordiFontPackManifest,
    repository_root: impl AsRef<Path>,
) -> Result<Vec<GeordiFontPackHashVerification>, GeordiFontPackHashError> {
    validate_geordi_font_pack_manifest_contract(manifest)?;

    let repository_root = repository_root.as_ref();
    let mut verifications = Vec::with_capacity(manifest.fonts.len() * 2);

    for font in &manifest.fonts {
        verifications.push(validate_geordi_font_pack_asset_hash(
            repository_root,
            &font.id,
            GeordiFontPackHashArtifactKind::Font,
            &font.path,
            &font.sha256,
        )?);
        verifications.push(validate_geordi_font_pack_asset_hash(
            repository_root,
            &font.id,
            GeordiFontPackHashArtifactKind::License,
            &font.license.path,
            &font.license.sha256,
        )?);
    }

    Ok(verifications)
}

fn validate_geordi_font_pack_manifest_contract(
    manifest: &GeordiFontPackManifest,
) -> Result<(), GeordiFontPackHashError> {
    if manifest.font_pack_version != GEORDI_FONT_PACK_VERSION {
        return Err(GeordiFontPackHashError::invalid_manifest(
            "$.fontPackVersion",
            "Font pack version is not supported",
        ));
    }

    if manifest.fonts.is_empty() {
        return Err(GeordiFontPackHashError::invalid_manifest(
            "$.fonts",
            "Font pack fonts must not be empty",
        ));
    }

    let mut font_ids = Vec::<&str>::new();
    for (index, font) in manifest.fonts.iter().enumerate() {
        let font_path = format!("$.fonts[{index}]");
        validate_font_pack_non_empty(&font.id, &format!("{font_path}.id"), "Font id")?;
        if font_ids.contains(&font.id.as_str()) {
            return Err(GeordiFontPackHashError::invalid_manifest(
                &format!("{font_path}.id"),
                "Font id must not be duplicated",
            ));
        }
        font_ids.push(&font.id);

        if font.format != GEORDI_FONT_FORMAT_TTF {
            return Err(GeordiFontPackHashError::invalid_manifest(
                &format!("{font_path}.format"),
                "Font format is not supported",
            ));
        }
        validate_font_pack_local_path(&font.path, &format!("{font_path}.path"), "Font path")?;
        validate_font_pack_hash(&font.sha256, &format!("{font_path}.sha256"), "Font hash")?;
        if font.weight == 0 || font.weight > 1000 {
            return Err(GeordiFontPackHashError::invalid_manifest(
                &format!("{font_path}.weight"),
                "Font weight must be an integer from 1 through 1000",
            ));
        }
        validate_font_pack_non_empty(
            &font.family_name,
            &format!("{font_path}.familyName"),
            "Font family name",
        )?;
        validate_font_pack_non_empty(
            &font.style_name,
            &format!("{font_path}.styleName"),
            "Font style name",
        )?;
        validate_font_pack_license_contract(&font.license, &font_path)?;
        validate_font_pack_source_contract(&font.source, &font_path)?;
    }

    Ok(())
}

fn validate_font_pack_license_contract(
    license: &GeordiFontLicense,
    font_path: &str,
) -> Result<(), GeordiFontPackHashError> {
    validate_font_pack_non_empty(
        &license.name,
        &format!("{font_path}.license.name"),
        "Font license name",
    )?;
    validate_font_pack_local_path(
        &license.path,
        &format!("{font_path}.license.path"),
        "Font license path",
    )?;
    validate_font_pack_hash(
        &license.sha256,
        &format!("{font_path}.license.sha256"),
        "Font license hash",
    )?;

    let mut names = Vec::<&str>::new();
    for (index, name) in license.reserved_font_names.iter().enumerate() {
        let name_path = format!("{font_path}.license.reservedFontNames[{index}]");
        validate_font_pack_non_empty(name, &name_path, "Reserved font name")?;
        if names.contains(&name.as_str()) {
            return Err(GeordiFontPackHashError::invalid_manifest(
                &name_path,
                "Reserved font name must not be duplicated",
            ));
        }
        names.push(name);
    }

    Ok(())
}

fn validate_font_pack_source_contract(
    source: &GeordiFontSource,
    font_path: &str,
) -> Result<(), GeordiFontPackHashError> {
    validate_font_pack_non_empty(
        &source.repository,
        &format!("{font_path}.source.repository"),
        "Font source repository",
    )?;
    if !is_full_lowercase_hex(&source.commit, 40) {
        return Err(GeordiFontPackHashError::invalid_manifest(
            &format!("{font_path}.source.commit"),
            "Font source commit must be a lowercase full git commit hash",
        ));
    }
    validate_font_pack_non_empty(
        &source.path,
        &format!("{font_path}.source.path"),
        "Font source path",
    )?;
    validate_font_pack_non_empty(
        &source.license_path,
        &format!("{font_path}.source.licensePath"),
        "Font source license path",
    )?;
    validate_font_pack_hash(
        &source.font_sha256,
        &format!("{font_path}.source.fontSha256"),
        "Font source font hash",
    )?;
    validate_font_pack_hash(
        &source.license_sha256,
        &format!("{font_path}.source.licenseSha256"),
        "Font source license hash",
    )?;
    if source.license_normalization
        != GEORDI_FONT_LICENSE_NORMALIZATION_TRIM_TRAILING_ASCII_WHITESPACE
    {
        return Err(GeordiFontPackHashError::invalid_manifest(
            &format!("{font_path}.source.licenseNormalization"),
            "Font source license normalization is not supported",
        ));
    }

    Ok(())
}

fn validate_font_pack_non_empty(
    value: &str,
    path: &str,
    label: &str,
) -> Result<(), GeordiFontPackHashError> {
    if value.is_empty() {
        return Err(GeordiFontPackHashError::invalid_manifest(
            path,
            &format!("{label} must be a non-empty string"),
        ));
    }

    Ok(())
}

fn validate_font_pack_local_path(
    value: &str,
    path: &str,
    label: &str,
) -> Result<(), GeordiFontPackHashError> {
    validate_font_pack_non_empty(value, path, label)?;
    if !is_fixture_local_path(value) {
        return Err(GeordiFontPackHashError::invalid_manifest(
            path,
            &format!("{label} must be a relative fixture-local path"),
        ));
    }

    Ok(())
}

fn validate_font_pack_hash(
    value: &str,
    path: &str,
    label: &str,
) -> Result<(), GeordiFontPackHashError> {
    if !is_geordi_sha256(value) {
        return Err(GeordiFontPackHashError::invalid_manifest(
            path,
            &format!("{label} must be a lowercase sha256 hex digest"),
        ));
    }

    Ok(())
}

/// Validate typed strict text fixture semantics beyond JSON shape.
///
/// # Errors
///
/// Returns `GeordiStrictTextFixtureValidationError` when strict text line boxes or positioned glyph
/// fields violate the fixed-point glyph-run contract.
pub fn validate_geordi_strict_text_fixture_manifest(
    manifest: &GeordiStrictTextFixtureManifest,
) -> Result<(), GeordiStrictTextFixtureValidationError> {
    let mut issues = Vec::new();

    validate_strict_text_fixture_contract(manifest, &mut issues);
    let line_box_ids = validate_strict_text_line_boxes(manifest, &mut issues);
    validate_strict_text_glyphs(manifest, &line_box_ids, &mut issues);

    if issues.is_empty() {
        Ok(())
    } else {
        Err(GeordiStrictTextFixtureValidationError::new(issues))
    }
}

/// Validate typed Geordi IR for the rectangle-only Rust MVP subset.
///
/// # Errors
///
/// Returns `GeordiIrValidationError` when the IR uses an invalid version, numeric profile, unknown
/// feature requirement, unsupported node kind, non-finite number, invalid dimensions, or malformed
/// rectangle properties.
pub fn validate_geordi_ir(ir: &GeordiIr) -> Result<(), GeordiIrValidationError> {
    let mut issues = Vec::new();

    validate_version(ir, &mut issues);
    validate_requirements(ir, &mut issues);
    validate_scene(&ir.scene, &mut issues);
    validate_nodes(&ir.nodes, &mut issues);

    if issues.is_empty() {
        Ok(())
    } else {
        Err(GeordiIrValidationError::new(issues))
    }
}

fn validate_geordi_font_pack_asset_hash(
    repository_root: &Path,
    font_id: &str,
    kind: GeordiFontPackHashArtifactKind,
    fixture_path: &str,
    expected: &str,
) -> Result<GeordiFontPackHashVerification, GeordiFontPackHashError> {
    if !is_fixture_local_path(fixture_path) {
        return Err(GeordiFontPackHashError::escaped_path(
            font_id,
            kind,
            fixture_path,
        ));
    }

    let target_path = resolve_fixture_local_path(repository_root, font_id, kind, fixture_path)?;

    let bytes = fs::read(target_path)
        .map_err(|error| GeordiFontPackHashError::read(font_id, kind, fixture_path, error))?;
    let actual = geordi_sha256_from_bytes(&bytes);
    if actual != expected {
        return Err(GeordiFontPackHashError::mismatch(
            font_id,
            kind,
            fixture_path,
            expected,
            actual,
        ));
    }

    Ok(GeordiFontPackHashVerification {
        font_id: font_id.to_owned(),
        kind,
        path: fixture_path.to_owned(),
        sha256: actual,
    })
}

fn validate_strict_text_fixture_contract(
    manifest: &GeordiStrictTextFixtureManifest,
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
) {
    if manifest.fixture_version != GEORDI_STRICT_TEXT_FIXTURE_VERSION {
        push_strict_text_issue(
            issues,
            "$.fixtureVersion",
            "Strict text fixture version is not supported",
        );
    }
    if manifest.text_profile != GEORDI_STRICT_POSITIONED_GLYPH_RUN_PROFILE {
        push_strict_text_issue(
            issues,
            "$.textProfile",
            "Strict text profile is not supported",
        );
    }
    if manifest.position_encoding != GEORDI_FIXED_26_6_POSITION_ENCODING {
        push_strict_text_issue(
            issues,
            "$.positionEncoding",
            "Strict text position encoding is not supported",
        );
    }
    if !is_fixture_local_path(&manifest.font_pack_path) {
        push_strict_text_issue(
            issues,
            "$.fontPackPath",
            "Strict text font pack path must be a relative fixture-local path",
        );
    }
    validate_strict_text_features(manifest, issues);
    if manifest.semantic_text.affects_pixels {
        push_strict_text_issue(
            issues,
            "$.semanticText.affectsPixels",
            "Semantic text must not affect pixels",
        );
    }
    if manifest.semantic_text.language.is_empty() {
        push_strict_text_issue(
            issues,
            "$.semanticText.language",
            "Semantic text language must be a non-empty string",
        );
    }
    if manifest.semantic_text.source.is_empty() {
        push_strict_text_issue(
            issues,
            "$.semanticText.source",
            "Semantic text source must be a non-empty string",
        );
    }
}

fn validate_strict_text_features(
    manifest: &GeordiStrictTextFixtureManifest,
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
) {
    let required = [
        GEORDI_TEXT_FEATURE_POSITIONED_GLYPH_RUNS,
        GEORDI_TEXT_FEATURE_FONT_PACK,
        GEORDI_TEXT_FEATURE_LINE_BOXES,
    ];
    let mut seen = Vec::<&str>::new();

    for (index, feature) in manifest.features.iter().enumerate() {
        let path = format!("$.features[{index}]");
        if !required.contains(&feature.as_str()) {
            push_strict_text_issue(issues, &path, "Strict text feature is not supported");
        }
        if seen.contains(&feature.as_str()) {
            push_strict_text_issue(issues, &path, "Strict text feature must not be duplicated");
        }
        seen.push(feature);
    }

    for feature in required {
        if !seen.contains(&feature) {
            push_strict_text_issue(
                issues,
                "$.features",
                &format!("Strict text features must include {feature}"),
            );
        }
    }
}

fn validate_strict_text_line_boxes<'a>(
    manifest: &'a GeordiStrictTextFixtureManifest,
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
) -> Vec<&'a str> {
    let mut line_box_ids = Vec::<&str>::new();
    for (line_box_index, line_box) in manifest.line_boxes.iter().enumerate() {
        let line_box_path = format!("$.lineBoxes[{line_box_index}]");
        if line_box.id.is_empty() {
            push_strict_text_issue(
                issues,
                &format!("{line_box_path}.id"),
                "Strict text line box id must be a non-empty string",
            );
        } else if line_box_ids.contains(&line_box.id.as_str()) {
            push_strict_text_issue(
                issues,
                &format!("{line_box_path}.id"),
                "Strict text line box id must not be duplicated",
            );
        } else {
            line_box_ids.push(&line_box.id);
        }
        validate_strict_text_safe_integer(
            line_box.x,
            &format!("{line_box_path}.x"),
            "Strict text line box x",
            issues,
        );
        validate_strict_text_safe_integer(
            line_box.y,
            &format!("{line_box_path}.y"),
            "Strict text line box y",
            issues,
        );
        validate_strict_text_safe_non_negative_integer(
            line_box.width,
            &format!("{line_box_path}.width"),
            "Strict text line box width",
            issues,
        );
        validate_strict_text_safe_non_negative_integer(
            line_box.height,
            &format!("{line_box_path}.height"),
            "Strict text line box height",
            issues,
        );
        validate_strict_text_safe_integer(
            line_box.baseline_y,
            &format!("{line_box_path}.baselineY"),
            "Strict text line box baseline y",
            issues,
        );
    }

    line_box_ids
}

fn validate_strict_text_glyphs(
    manifest: &GeordiStrictTextFixtureManifest,
    line_box_ids: &[&str],
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
) {
    let mut run_ids = Vec::<&str>::new();
    for (run_index, run) in manifest.glyph_runs.iter().enumerate() {
        let run_path = format!("$.glyphRuns[{run_index}]");
        if run.id.is_empty() {
            push_strict_text_issue(
                issues,
                &format!("{run_path}.id"),
                "Strict text glyph run id must be a non-empty string",
            );
        } else if run_ids.contains(&run.id.as_str()) {
            push_strict_text_issue(
                issues,
                &format!("{run_path}.id"),
                "Strict text glyph run id must not be duplicated",
            );
        } else {
            run_ids.push(&run.id);
        }
        if run.font_id.is_empty() {
            push_strict_text_issue(
                issues,
                &format!("{run_path}.fontId"),
                "Strict text glyph run font id must be a non-empty string",
            );
        }
        if run.line_box_id.is_empty() {
            push_strict_text_issue(
                issues,
                &format!("{run_path}.lineBoxId"),
                "Strict text glyph run line box id must be a non-empty string",
            );
        } else if !line_box_ids.contains(&run.line_box_id.as_str()) {
            push_strict_text_issue(
                issues,
                &format!("{run_path}.lineBoxId"),
                "Strict text glyph run line box id must reference an existing line box",
            );
        }

        for (glyph_index, glyph) in run.glyphs.iter().enumerate() {
            let glyph_path = format!("$.glyphRuns[{run_index}].glyphs[{glyph_index}]");
            validate_strict_text_safe_non_negative_integer(
                glyph.glyph_id,
                &format!("{glyph_path}.glyphId"),
                "Strict text glyph id",
                issues,
            );
            validate_strict_text_safe_integer(
                glyph.x,
                &format!("{glyph_path}.x"),
                "Strict text glyph x",
                issues,
            );
            validate_strict_text_safe_integer(
                glyph.y,
                &format!("{glyph_path}.y"),
                "Strict text glyph y",
                issues,
            );
            validate_strict_text_safe_integer(
                glyph.x_offset,
                &format!("{glyph_path}.xOffset"),
                "Strict text glyph x offset",
                issues,
            );
            validate_strict_text_safe_integer(
                glyph.y_offset,
                &format!("{glyph_path}.yOffset"),
                "Strict text glyph y offset",
                issues,
            );
            validate_strict_text_safe_non_negative_integer(
                glyph.advance,
                &format!("{glyph_path}.advance"),
                "Strict text glyph advance",
                issues,
            );
        }
    }
}

fn validate_strict_text_safe_integer(
    value: i64,
    path: &str,
    label: &str,
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
) {
    if !(-GEORDI_JSON_SAFE_INTEGER_MAX..=GEORDI_JSON_SAFE_INTEGER_MAX).contains(&value) {
        push_strict_text_issue(issues, path, &format!("{label} must be a safe integer"));
    }
}

fn validate_strict_text_safe_non_negative_integer(
    value: i64,
    path: &str,
    label: &str,
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
) {
    if !(0..=GEORDI_JSON_SAFE_INTEGER_MAX).contains(&value) {
        push_strict_text_issue(
            issues,
            path,
            &format!("{label} must be a safe non-negative integer"),
        );
    }
}

fn push_strict_text_issue(
    issues: &mut Vec<GeordiStrictTextFixtureValidationIssue>,
    path: &str,
    message: &str,
) {
    issues.push(GeordiStrictTextFixtureValidationIssue::new(path, message));
}

fn is_fixture_local_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && !has_path_scheme(path)
        && Path::new(path)
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn has_path_scheme(path: &str) -> bool {
    let mut chars = path.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return false,
    }

    for character in chars {
        if character == ':' {
            return true;
        }
        if character == '/' || character == '\\' {
            return false;
        }
        if !(character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')) {
            return false;
        }
    }

    false
}

fn is_geordi_sha256(value: &str) -> bool {
    let hex = value.strip_prefix(GEORDI_SHA256_PREFIX).unwrap_or_default();
    is_full_lowercase_hex(hex, 64)
}

fn is_full_lowercase_hex(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

fn resolve_fixture_local_path(
    repository_root: &Path,
    font_id: &str,
    kind: GeordiFontPackHashArtifactKind,
    fixture_path: &str,
) -> Result<PathBuf, GeordiFontPackHashError> {
    let lexical_path = repository_root.join(fixture_path);
    if !path_stays_inside_root(repository_root, &lexical_path) {
        return Err(GeordiFontPackHashError::escaped_path(
            font_id,
            kind,
            fixture_path,
        ));
    }

    let canonical_root = fs::canonicalize(repository_root)
        .map_err(|error| GeordiFontPackHashError::read(font_id, kind, fixture_path, error))?;
    let canonical_path = fs::canonicalize(&lexical_path)
        .map_err(|error| GeordiFontPackHashError::read(font_id, kind, fixture_path, error))?;
    if !path_stays_inside_root(&canonical_root, &canonical_path) {
        return Err(GeordiFontPackHashError::escaped_path(
            font_id,
            kind,
            fixture_path,
        ));
    }

    Ok(canonical_path)
}

fn path_stays_inside_root(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root)
        .is_ok_and(|relative| !relative.as_os_str().is_empty())
}

fn validate_version(ir: &GeordiIr, issues: &mut Vec<GeordiIrValidationIssue>) {
    if ir.ir_version != GEORDI_IR_VERSION {
        push_issue(issues, "$.irVersion", "IR version is not supported");
    }

    if ir.numeric_profile != GEORDI_NUMERIC_PROFILE {
        push_issue(
            issues,
            "$.numericProfile",
            "IR numeric profile is not supported",
        );
    }
}

fn validate_requirements(ir: &GeordiIr, issues: &mut Vec<GeordiIrValidationIssue>) {
    let mut includes_core_profile = false;
    let mut seen = Vec::<&str>::new();

    for (index, requirement) in ir.requires.iter().enumerate() {
        let path = format!("$.requires[{index}]");
        if !GEORDI_KNOWN_FEATURES.contains(&requirement.as_str()) {
            push_issue(
                issues,
                &path,
                "IR requirement is not supported by this IR version",
            );
        }

        if seen.contains(&requirement.as_str()) {
            push_issue(issues, &path, "IR requirement must not be duplicated");
        }
        seen.push(requirement);

        if requirement == GEORDI_CORE_PROFILE {
            includes_core_profile = true;
        }
    }

    if !includes_core_profile {
        push_issue(
            issues,
            "$.requires",
            "IR requirements must include geordi/core/1",
        );
    }
}

fn validate_scene(scene: &GeordiScene, issues: &mut Vec<GeordiIrValidationIssue>) {
    if scene.id.is_empty() {
        push_issue(issues, "$.scene.id", "Scene id must not be empty");
    }

    validate_positive_finite(scene.width, "$.scene.width", "Scene width", issues);
    validate_positive_finite(scene.height, "$.scene.height", "Scene height", issues);

    if scene.units.as_deref().is_some_and(|units| units != "px") {
        push_issue(
            issues,
            "$.scene.units",
            "Scene units must be px when present",
        );
    }
}

fn validate_nodes(nodes: &[GeordiNode], issues: &mut Vec<GeordiIrValidationIssue>) {
    let mut seen = Vec::<&str>::new();

    for (index, node) in nodes.iter().enumerate() {
        let path = format!("$.nodes[{index}]");
        validate_node(node, &path, issues);

        if seen.contains(&node.id.as_str()) {
            push_issue(
                issues,
                &format!("{path}.id"),
                "Node id must not be duplicated",
            );
        }
        seen.push(&node.id);
    }
}

fn validate_node(node: &GeordiNode, path: &str, issues: &mut Vec<GeordiIrValidationIssue>) {
    if node.id.is_empty() {
        push_issue(issues, &format!("{path}.id"), "Node id must not be empty");
    }

    if node.kind != "Rect" {
        push_issue(
            issues,
            &format!("{path}.kind"),
            "Node kind is not supported by the Rust MVP",
        );
    }

    if node.parent_id.as_deref().is_some_and(str::is_empty) {
        push_issue(
            issues,
            &format!("{path}.parentId"),
            "Parent id must not be empty when present",
        );
    }

    if node.z_index.is_some_and(|value| !value.is_finite()) {
        push_issue(
            issues,
            &format!("{path}.zIndex"),
            "Node z index must be finite when present",
        );
    }

    validate_rect_props(&node.props, &format!("{path}.props"), issues);
}

fn validate_rect_props(
    props: &GeordiRectProps,
    path: &str,
    issues: &mut Vec<GeordiIrValidationIssue>,
) {
    validate_finite(props.x, &format!("{path}.x"), "Rect x", issues);
    validate_finite(props.y, &format!("{path}.y"), "Rect y", issues);
    validate_positive_finite(props.width, &format!("{path}.width"), "Rect width", issues);
    validate_positive_finite(
        props.height,
        &format!("{path}.height"),
        "Rect height",
        issues,
    );

    if !is_hex_color(&props.fill) {
        push_issue(
            issues,
            &format!("{path}.fill"),
            "Rect fill must be lowercase #rrggbb",
        );
    }
}

fn validate_finite(value: f64, path: &str, label: &str, issues: &mut Vec<GeordiIrValidationIssue>) {
    if !value.is_finite() {
        push_issue(issues, path, &format!("{label} must be finite"));
    }
}

fn validate_positive_finite(
    value: f64,
    path: &str,
    label: &str,
    issues: &mut Vec<GeordiIrValidationIssue>,
) {
    if !value.is_finite() || value <= 0.0 {
        push_issue(
            issues,
            path,
            &format!("{label} must be positive and finite"),
        );
    }
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes[0] == b'#'
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

fn push_issue(issues: &mut Vec<GeordiIrValidationIssue>, path: &str, message: &str) {
    issues.push(GeordiIrValidationIssue::new(path, message));
}

#[cfg(test)]
mod tests {
    use super::{
        GEORDI_FONT_FORMAT_TTF, GEORDI_FONT_PACK_VERSION, GEORDI_JSON_SAFE_INTEGER_MAX,
        GEORDI_TEXT_FEATURE_POSITIONED_GLYPH_RUNS, GeordiFontPackHashArtifactKind,
        GeordiFontPackHashError, GeordiFontPackLoadError, GeordiFontPackParseError,
        GeordiIrLoadError, GeordiIrParseError, GeordiIrValidationError,
        GeordiStrictTextFixtureParseError, GeordiStrictTextFixtureValidationError,
        geordi_sha256_from_bytes, load_geordi_font_pack_manifest, load_geordi_ir,
        parse_geordi_font_pack_manifest, parse_geordi_ir,
        parse_geordi_strict_text_fixture_manifest, validate_geordi_font_pack_hashes,
        validate_geordi_ir, validate_geordi_strict_text_fixture_manifest,
    };
    use std::error::Error;
    use std::fmt::{Display, Formatter};
    use std::path::PathBuf;

    #[derive(Debug)]
    enum GeordiIrTestError {
        FontPackLoad(GeordiFontPackLoadError),
        FontPackHash(GeordiFontPackHashError),
        FontPackParse(GeordiFontPackParseError),
        Io(std::io::Error),
        Load(GeordiIrLoadError),
        Parse(GeordiIrParseError),
        ExpectedFailure,
        StrictTextParse(GeordiStrictTextFixtureParseError),
        StrictTextValidation(GeordiStrictTextFixtureValidationError),
        Validation(GeordiIrValidationError),
    }

    impl Display for GeordiIrTestError {
        fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("Geordi IR test failed")
        }
    }

    impl Error for GeordiIrTestError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            match self {
                Self::FontPackLoad(source) => Some(source),
                Self::FontPackHash(source) => Some(source),
                Self::FontPackParse(source) => Some(source),
                Self::Io(source) => Some(source),
                Self::Load(source) => Some(source),
                Self::Parse(source) => Some(source),
                Self::ExpectedFailure => None,
                Self::StrictTextParse(source) => Some(source),
                Self::StrictTextValidation(source) => Some(source),
                Self::Validation(source) => Some(source),
            }
        }
    }

    impl From<GeordiIrLoadError> for GeordiIrTestError {
        fn from(error: GeordiIrLoadError) -> Self {
            Self::Load(error)
        }
    }

    impl From<std::io::Error> for GeordiIrTestError {
        fn from(error: std::io::Error) -> Self {
            Self::Io(error)
        }
    }

    impl From<GeordiFontPackLoadError> for GeordiIrTestError {
        fn from(error: GeordiFontPackLoadError) -> Self {
            Self::FontPackLoad(error)
        }
    }

    impl From<GeordiFontPackHashError> for GeordiIrTestError {
        fn from(error: GeordiFontPackHashError) -> Self {
            Self::FontPackHash(error)
        }
    }

    impl From<GeordiIrParseError> for GeordiIrTestError {
        fn from(error: GeordiIrParseError) -> Self {
            Self::Parse(error)
        }
    }

    impl From<GeordiFontPackParseError> for GeordiIrTestError {
        fn from(error: GeordiFontPackParseError) -> Self {
            Self::FontPackParse(error)
        }
    }

    impl From<GeordiStrictTextFixtureParseError> for GeordiIrTestError {
        fn from(error: GeordiStrictTextFixtureParseError) -> Self {
            Self::StrictTextParse(error)
        }
    }

    impl From<GeordiStrictTextFixtureValidationError> for GeordiIrTestError {
        fn from(error: GeordiStrictTextFixtureValidationError) -> Self {
            Self::StrictTextValidation(error)
        }
    }

    impl From<GeordiIrValidationError> for GeordiIrTestError {
        fn from(error: GeordiIrValidationError) -> Self {
            Self::Validation(error)
        }
    }

    #[test]
    fn loads_and_validates_the_shared_hello_panel_fixture() -> Result<(), GeordiIrTestError> {
        let ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        validate_geordi_ir(&ir)?;

        assert_eq!(ir.ir_version, "geordi-ir/1");
        assert_eq!(ir.numeric_profile, "geordi-finite-binary64/1");
        assert_eq!(ir.scene.id, "render-everywhere:hello-panel");
        assert_exact_float(ir.scene.width, 640.0);
        assert_exact_float(ir.scene.height, 360.0);
        assert_eq!(ir.nodes.len(), 8);
        assert_eq!(ir.nodes[0].id, "background");
        assert_eq!(ir.nodes[0].props.fill, "#101820");

        Ok(())
    }

    #[test]
    fn loads_the_shared_font_pack_manifest() -> Result<(), GeordiIrTestError> {
        let manifest =
            load_geordi_font_pack_manifest(fixture_path("assets/fonts/font-pack.geordi.json"))?;

        assert_eq!(manifest.font_pack_version, "geordi-font-pack/1");
        assert_eq!(manifest.fonts.len(), 1);
        assert_eq!(manifest.fonts[0].id, "lato-regular");
        assert_eq!(manifest.fonts[0].format, "ttf");
        assert_eq!(manifest.fonts[0].face_index, 0);
        assert_eq!(manifest.fonts[0].family_name, "Lato");
        assert_eq!(manifest.fonts[0].style_name, "Regular");
        assert_eq!(manifest.fonts[0].weight, 400);
        assert_eq!(manifest.fonts[0].license.name, "SIL Open Font License 1.1");
        assert!(manifest.fonts[0].license.redistribution_allowed);
        assert_eq!(
            manifest.fonts[0].source.repository,
            "https://github.com/google/fonts"
        );

        Ok(())
    }

    #[test]
    fn verifies_shared_font_pack_hashes() -> Result<(), GeordiIrTestError> {
        let manifest =
            load_geordi_font_pack_manifest(fixture_path("assets/fonts/font-pack.geordi.json"))?;

        let verifications = validate_geordi_font_pack_hashes(&manifest, repository_root())?;

        assert_eq!(verifications.len(), 2);
        assert_eq!(verifications[0].font_id, "lato-regular");
        assert_eq!(verifications[0].kind, GeordiFontPackHashArtifactKind::Font);
        assert_eq!(
            verifications[0].sha256,
            "sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251"
        );
        assert_eq!(verifications[1].font_id, "lato-regular");
        assert_eq!(
            verifications[1].kind,
            GeordiFontPackHashArtifactKind::License
        );
        assert_eq!(
            verifications[1].sha256,
            "sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423"
        );

        Ok(())
    }

    #[test]
    fn hashes_font_pack_bytes_with_geordi_prefix() {
        assert_eq!(
            geordi_sha256_from_bytes(b"geordi"),
            "sha256:56d547e10e34985139e56ef160086a6d83bd5b4731c25569adf6b20b0565b535"
        );
    }

    #[test]
    fn rejects_font_pack_hash_mismatches_and_escaped_paths() -> Result<(), GeordiIrTestError> {
        let mut manifest =
            load_geordi_font_pack_manifest(fixture_path("assets/fonts/font-pack.geordi.json"))?;
        manifest.fonts[0].sha256 =
            "sha256:0000000000000000000000000000000000000000000000000000000000000000".to_owned();

        let mismatch = font_pack_hash_error(validate_geordi_font_pack_hashes(
            &manifest,
            repository_root(),
        ))?;

        assert_eq!(mismatch.font_id(), "lato-regular");
        assert_eq!(mismatch.kind(), GeordiFontPackHashArtifactKind::Font);
        assert_eq!(
            mismatch.expected(),
            Some("sha256:0000000000000000000000000000000000000000000000000000000000000000")
        );
        assert_eq!(
            mismatch.actual(),
            Some("sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251")
        );

        manifest.fonts[0].sha256 =
            "sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251".to_owned();
        manifest.fonts[0].path = "../Lato-Regular.ttf".to_owned();

        let escaped = font_pack_hash_error(validate_geordi_font_pack_hashes(
            &manifest,
            repository_root(),
        ))?;

        assert_eq!(escaped.path(), "$.fonts[0].path");

        Ok(())
    }

    #[test]
    fn rejects_structurally_invalid_font_pack_manifests_before_hashing()
    -> Result<(), GeordiIrTestError> {
        let mut manifest =
            load_geordi_font_pack_manifest(fixture_path("assets/fonts/font-pack.geordi.json"))?;

        manifest.font_pack_version = "geordi-font-pack/2".to_owned();
        let invalid_version = font_pack_hash_error(validate_geordi_font_pack_hashes(
            &manifest,
            repository_root(),
        ))?;
        assert_eq!(invalid_version.path(), "$.fontPackVersion");

        manifest.font_pack_version = GEORDI_FONT_PACK_VERSION.to_owned();
        manifest.fonts[0].format = "woff2".to_owned();
        let invalid_format = font_pack_hash_error(validate_geordi_font_pack_hashes(
            &manifest,
            repository_root(),
        ))?;
        assert_eq!(invalid_format.path(), "$.fonts[0].format");

        manifest.fonts[0].format = GEORDI_FONT_FORMAT_TTF.to_owned();
        manifest.fonts.push(manifest.fonts[0].clone());
        let duplicate_id = font_pack_hash_error(validate_geordi_font_pack_hashes(
            &manifest,
            repository_root(),
        ))?;
        assert_eq!(duplicate_id.path(), "$.fonts[1].id");

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rejects_font_pack_hash_symlinks_that_escape_repository_root() -> Result<(), GeordiIrTestError>
    {
        let temp_root = unique_temp_path("geordi-font-pack-root");
        let external_root = unique_temp_path("geordi-font-pack-external");
        let result = (|| -> Result<(), GeordiIrTestError> {
            std::fs::create_dir_all(&temp_root)?;
            std::fs::create_dir_all(&external_root)?;

            let external_font_path = external_root.join("external.ttf");
            let license_path = temp_root.join("license.txt");
            std::fs::write(&external_font_path, [1_u8, 2, 3])?;
            std::fs::write(&license_path, b"license")?;
            std::os::unix::fs::symlink(&external_font_path, temp_root.join("font.ttf"))?;

            let mut manifest =
                load_geordi_font_pack_manifest(fixture_path("assets/fonts/font-pack.geordi.json"))?;
            manifest.fonts[0].path = "font.ttf".to_owned();
            manifest.fonts[0].sha256 =
                geordi_sha256_from_bytes(&std::fs::read(&external_font_path)?);
            manifest.fonts[0].license.path = "license.txt".to_owned();
            manifest.fonts[0].license.sha256 =
                geordi_sha256_from_bytes(&std::fs::read(&license_path)?);

            let error =
                font_pack_hash_error(validate_geordi_font_pack_hashes(&manifest, &temp_root))?;

            assert_eq!(error.font_id(), "lato-regular");
            assert_eq!(error.kind(), GeordiFontPackHashArtifactKind::Font);
            assert_eq!(error.path(), "font.ttf");
            Ok(())
        })();

        drop(std::fs::remove_dir_all(&temp_root));
        drop(std::fs::remove_dir_all(&external_root));

        result
    }

    #[test]
    fn rejects_committed_bad_font_hash_failure_fixture() -> Result<(), GeordiIrTestError> {
        let manifest = load_geordi_font_pack_manifest(fixture_path(
            "assets/fonts/failures/bad-hash.font-pack.geordi.json",
        ))?;

        let error = font_pack_hash_error(validate_geordi_font_pack_hashes(
            &manifest,
            repository_root(),
        ))?;

        assert_eq!(error.font_id(), "lato-regular");
        assert_eq!(error.kind(), GeordiFontPackHashArtifactKind::Font);

        Ok(())
    }

    #[test]
    fn parses_font_pack_manifest_without_json_values() -> Result<(), GeordiIrTestError> {
        let source = r#"{
          "fontPackVersion": "geordi-font-pack/1",
          "fonts": [
            {
              "faceIndex": 0,
              "familyName": "Lato",
              "format": "ttf",
              "id": "lato-regular",
              "license": {
                "name": "SIL Open Font License 1.1",
                "path": "fixtures/render-everywhere/assets/fonts/lato/OFL.txt",
                "redistributionAllowed": true,
                "reservedFontNames": ["Lato"],
                "sha256": "sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423"
              },
              "path": "fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf",
              "sha256": "sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
              "source": {
                "commit": "c5b52261e8fde2d3b2592fa9d26ac525939c5e4c",
                "fontSha256": "sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
                "licenseNormalization": "trim-trailing-ascii-whitespace/1",
                "licensePath": "ofl/lato/OFL.txt",
                "licenseSha256": "sha256:74ba064d03f1f1c4a952da936c3eb71866c34404916734de3cae73b34357e59e",
                "path": "ofl/lato/Lato-Regular.ttf",
                "repository": "https://github.com/google/fonts"
              },
              "styleName": "Regular",
              "weight": 400
            }
          ]
        }"#;

        let manifest = parse_geordi_font_pack_manifest(source)?;

        assert_eq!(
            manifest.fonts[0].source.license_normalization,
            "trim-trailing-ascii-whitespace/1"
        );

        Ok(())
    }

    #[test]
    fn parses_strict_text_fixture_manifest_without_json_values() -> Result<(), GeordiIrTestError> {
        let source = r#"{
          "features": [
            "text.positionedGlyphRuns",
            "text.fontPack",
            "text.lineBoxes"
          ],
          "fixtureVersion": "geordi-strict-text-fixture/1",
          "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
          "glyphRuns": [
            {
              "fontId": "lato-regular",
              "glyphs": [
                {
                  "advance": 2048,
                  "glyphId": 43,
                  "x": 0,
                  "xOffset": 0,
                  "y": 3072,
                  "yOffset": 0
                }
              ],
              "id": "run-0",
              "lineBoxId": "line-0"
            }
          ],
          "id": "render-everywhere:strict-text:geordi",
          "lineBoxes": [
            {
              "baselineY": 3072,
              "height": 4096,
              "id": "line-0",
              "width": 12288,
              "x": 0,
              "y": 0
            }
          ],
          "positionEncoding": "geordi-fixed-26.6/1",
          "semanticText": {
            "affectsPixels": false,
            "language": "en",
            "source": "GEORDI"
          },
          "textProfile": "geordi-strict-positioned-glyph-run/1"
        }"#;

        let manifest = parse_geordi_strict_text_fixture_manifest(source)?;

        assert_eq!(
            manifest.text_profile,
            "geordi-strict-positioned-glyph-run/1"
        );
        assert_eq!(manifest.glyph_runs[0].glyphs[0].glyph_id, 43);
        assert!(!manifest.semantic_text.affects_pixels);

        Ok(())
    }

    #[test]
    fn rejects_malformed_strict_text_fixture_json_with_custom_error() {
        let result = parse_geordi_strict_text_fixture_manifest("{");

        assert!(result.is_err());
    }

    #[test]
    fn rejects_negative_strict_text_glyph_ids() -> Result<(), GeordiIrTestError> {
        let source = r#"{
          "features": ["text.positionedGlyphRuns", "text.fontPack", "text.lineBoxes"],
          "fixtureVersion": "geordi-strict-text-fixture/1",
          "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
          "glyphRuns": [
            {
              "fontId": "lato-regular",
              "glyphs": [
                {
                  "advance": 2048,
                  "glyphId": 43,
                  "x": 0,
                  "xOffset": 0,
                  "y": 3072,
                  "yOffset": 0
                }
              ],
              "id": "run-0",
              "lineBoxId": "line-0"
            }
          ],
          "id": "render-everywhere:strict-text:geordi",
          "lineBoxes": [
            { "baselineY": 3072, "height": 4096, "id": "line-0", "width": 12288, "x": 0, "y": 0 }
          ],
          "positionEncoding": "geordi-fixed-26.6/1",
          "semanticText": { "affectsPixels": false, "language": "en", "source": "GEORDI" },
          "textProfile": "geordi-strict-positioned-glyph-run/1"
        }"#;
        let mut manifest = parse_geordi_strict_text_fixture_manifest(source)?;
        manifest.glyph_runs[0].glyphs[0].glyph_id = -1;

        let paths =
            strict_text_validation_paths(validate_geordi_strict_text_fixture_manifest(&manifest));

        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].glyphId");
        Ok(())
    }

    #[test]
    fn rejects_invalid_strict_text_fixture_contract() -> Result<(), GeordiIrTestError> {
        let mut manifest = parse_geordi_strict_text_fixture_manifest(strict_text_fixture_source())?;
        manifest.fixture_version = "geordi-strict-text-fixture/2".to_owned();
        manifest.text_profile = "geordi-css-text/1".to_owned();
        manifest.position_encoding = "geordi-fixed-24.8/1".to_owned();
        manifest.font_pack_path = "https://example.test/font-pack.geordi.json".to_owned();
        manifest.features = vec![
            GEORDI_TEXT_FEATURE_POSITIONED_GLYPH_RUNS.to_owned(),
            GEORDI_TEXT_FEATURE_POSITIONED_GLYPH_RUNS.to_owned(),
            "text.host-font-fallback".to_owned(),
        ];
        manifest.semantic_text.affects_pixels = true;
        manifest.semantic_text.language.clear();
        manifest.semantic_text.source.clear();
        manifest.line_boxes.push(manifest.line_boxes[0].clone());
        let duplicate_run = manifest.glyph_runs[0].clone();
        manifest.glyph_runs[0].line_box_id = "missing-line".to_owned();
        manifest.glyph_runs.push(duplicate_run);

        let paths =
            strict_text_validation_paths(validate_geordi_strict_text_fixture_manifest(&manifest));

        assert_paths_include(&paths, "$.fixtureVersion");
        assert_paths_include(&paths, "$.textProfile");
        assert_paths_include(&paths, "$.positionEncoding");
        assert_paths_include(&paths, "$.fontPackPath");
        assert_paths_include(&paths, "$.features[1]");
        assert_paths_include(&paths, "$.features[2]");
        assert_paths_include(&paths, "$.features");
        assert_paths_include(&paths, "$.semanticText.affectsPixels");
        assert_paths_include(&paths, "$.semanticText.language");
        assert_paths_include(&paths, "$.semanticText.source");
        assert_paths_include(&paths, "$.lineBoxes[1].id");
        assert_paths_include(&paths, "$.glyphRuns[0].lineBoxId");
        assert_paths_include(&paths, "$.glyphRuns[1].id");
        Ok(())
    }

    #[test]
    fn rejects_unsafe_strict_text_glyph_integer_values() -> Result<(), GeordiIrTestError> {
        let mut manifest = parse_geordi_strict_text_fixture_manifest(strict_text_fixture_source())?;
        let unsafe_value = GEORDI_JSON_SAFE_INTEGER_MAX + 1;
        manifest.glyph_runs[0].glyphs[0].glyph_id = unsafe_value;
        manifest.glyph_runs[0].glyphs[0].x = unsafe_value;
        manifest.glyph_runs[0].glyphs[0].y = -unsafe_value;
        manifest.glyph_runs[0].glyphs[0].x_offset = unsafe_value;
        manifest.glyph_runs[0].glyphs[0].y_offset = -unsafe_value;
        manifest.glyph_runs[0].glyphs[0].advance = unsafe_value;

        let paths =
            strict_text_validation_paths(validate_geordi_strict_text_fixture_manifest(&manifest));

        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].glyphId");
        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].x");
        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].y");
        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].xOffset");
        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].yOffset");
        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].advance");
        Ok(())
    }

    #[test]
    fn rejects_unsafe_or_negative_strict_text_line_box_values() -> Result<(), GeordiIrTestError> {
        let mut manifest = parse_geordi_strict_text_fixture_manifest(strict_text_fixture_source())?;
        let unsafe_value = GEORDI_JSON_SAFE_INTEGER_MAX + 1;
        manifest.line_boxes[0].x = unsafe_value;
        manifest.line_boxes[0].y = -unsafe_value;
        manifest.line_boxes[0].width = -1;
        manifest.line_boxes[0].height = unsafe_value;
        manifest.line_boxes[0].baseline_y = unsafe_value;

        let paths =
            strict_text_validation_paths(validate_geordi_strict_text_fixture_manifest(&manifest));

        assert_paths_include(&paths, "$.lineBoxes[0].x");
        assert_paths_include(&paths, "$.lineBoxes[0].y");
        assert_paths_include(&paths, "$.lineBoxes[0].width");
        assert_paths_include(&paths, "$.lineBoxes[0].height");
        assert_paths_include(&paths, "$.lineBoxes[0].baselineY");
        Ok(())
    }

    #[test]
    fn rejects_fractional_strict_text_glyph_positions_at_parse_boundary() {
        let source = r#"{
          "features": ["text.positionedGlyphRuns", "text.fontPack", "text.lineBoxes"],
          "fixtureVersion": "geordi-strict-text-fixture/1",
          "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
          "glyphRuns": [
            {
              "fontId": "lato-regular",
              "glyphs": [
                { "advance": 2048, "glyphId": 43, "x": 0.5, "xOffset": 0, "y": 3072, "yOffset": 0 }
              ],
              "id": "run-0",
              "lineBoxId": "line-0"
            }
          ],
          "id": "render-everywhere:strict-text:geordi",
          "lineBoxes": [
            { "baselineY": 3072, "height": 4096, "id": "line-0", "width": 12288, "x": 0, "y": 0 }
          ],
          "positionEncoding": "geordi-fixed-26.6/1",
          "semanticText": { "affectsPixels": false, "language": "en", "source": "GEORDI" },
          "textProfile": "geordi-strict-positioned-glyph-run/1"
        }"#;

        let result = parse_geordi_strict_text_fixture_manifest(source);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_negative_strict_text_advances() -> Result<(), GeordiIrTestError> {
        let source = r#"{
          "features": ["text.positionedGlyphRuns", "text.fontPack", "text.lineBoxes"],
          "fixtureVersion": "geordi-strict-text-fixture/1",
          "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
          "glyphRuns": [
            {
              "fontId": "lato-regular",
              "glyphs": [
                {
                  "advance": 2048,
                  "glyphId": 43,
                  "x": 0,
                  "xOffset": 0,
                  "y": 3072,
                  "yOffset": 0
                }
              ],
              "id": "run-0",
              "lineBoxId": "line-0"
            }
          ],
          "id": "render-everywhere:strict-text:geordi",
          "lineBoxes": [
            { "baselineY": 3072, "height": 4096, "id": "line-0", "width": 12288, "x": 0, "y": 0 }
          ],
          "positionEncoding": "geordi-fixed-26.6/1",
          "semanticText": { "affectsPixels": false, "language": "en", "source": "GEORDI" },
          "textProfile": "geordi-strict-positioned-glyph-run/1"
        }"#;
        let mut manifest = parse_geordi_strict_text_fixture_manifest(source)?;
        manifest.glyph_runs[0].glyphs[0].advance = -1;

        let paths =
            strict_text_validation_paths(validate_geordi_strict_text_fixture_manifest(&manifest));

        assert_paths_include(&paths, "$.glyphRuns[0].glyphs[0].advance");
        Ok(())
    }

    #[test]
    fn rejects_fractional_strict_text_offsets_at_parse_boundary() {
        let source = r#"{
          "features": ["text.positionedGlyphRuns", "text.fontPack", "text.lineBoxes"],
          "fixtureVersion": "geordi-strict-text-fixture/1",
          "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
          "glyphRuns": [
            {
              "fontId": "lato-regular",
              "glyphs": [
                { "advance": 2048, "glyphId": 43, "x": 0, "xOffset": 0.5, "y": 3072, "yOffset": 0 }
              ],
              "id": "run-0",
              "lineBoxId": "line-0"
            }
          ],
          "id": "render-everywhere:strict-text:geordi",
          "lineBoxes": [
            { "baselineY": 3072, "height": 4096, "id": "line-0", "width": 12288, "x": 0, "y": 0 }
          ],
          "positionEncoding": "geordi-fixed-26.6/1",
          "semanticText": { "affectsPixels": false, "language": "en", "source": "GEORDI" },
          "textProfile": "geordi-strict-positioned-glyph-run/1"
        }"#;

        let result = parse_geordi_strict_text_fixture_manifest(source);

        assert!(result.is_err());
    }

    #[test]
    fn parses_the_rectangle_subset_without_leaking_json_values() -> Result<(), GeordiIrTestError> {
        let source = r##"{
          "irVersion": "geordi-ir/1",
          "numericProfile": "geordi-finite-binary64/1",
          "requires": ["geordi/core/1", "layout.resolved", "shape.rect", "paint.solid"],
          "scene": { "id": "test", "width": 1, "height": 1, "units": "px" },
          "nodes": [
            {
              "id": "pixel",
              "kind": "Rect",
              "props": {
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "fill": "#ffffff"
              }
            }
          ]
        }"##;

        let ir = parse_geordi_ir(source)?;

        assert_exact_float(ir.nodes[0].props.width, 1.0);
        assert_exact_float(ir.nodes[0].props.height, 1.0);

        Ok(())
    }

    #[test]
    fn rejects_malformed_json_with_a_custom_parse_error() {
        let result = parse_geordi_ir("{");

        assert!(result.is_err());
    }

    #[test]
    fn rejects_invalid_version_profile_and_requirements() -> Result<(), GeordiIrTestError> {
        let mut ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        ir.ir_version = "geordi-ir/2".to_owned();
        ir.numeric_profile = "geordi-float-anything/1".to_owned();
        ir.requires = vec![
            "layout.resolved".to_owned(),
            "layout.resolved".to_owned(),
            "effect.blur/1".to_owned(),
        ];

        let paths = validation_paths(validate_geordi_ir(&ir));

        assert_paths_include(&paths, "$.irVersion");
        assert_paths_include(&paths, "$.numericProfile");
        assert_paths_include(&paths, "$.requires");
        assert_paths_include(&paths, "$.requires[1]");
        assert_paths_include(&paths, "$.requires[2]");
        Ok(())
    }

    #[test]
    fn accepts_known_mesh_features_without_adding_them_to_rectangle_fixtures()
    -> Result<(), GeordiIrTestError> {
        let mut ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        ir.requires = vec![
            "geordi/core/1".to_owned(),
            "asset.mesh".to_owned(),
            "mesh.triangle".to_owned(),
            "transform.matrix4".to_owned(),
            "camera.perspective".to_owned(),
            "projection.perspective".to_owned(),
            "depth.z-buffer".to_owned(),
            "material.solid".to_owned(),
            "playback.fixed-rate-rotation".to_owned(),
        ];

        let paths = validation_paths(validate_geordi_ir(&ir));

        assert!(paths.is_empty());
        Ok(())
    }

    #[test]
    fn rejects_invalid_scene_and_rect_numbers() -> Result<(), GeordiIrTestError> {
        let mut ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        ir.scene.width = f64::NAN;
        ir.nodes[0].props.width = -1.0;
        ir.nodes[0].props.x = f64::INFINITY;

        let paths = validation_paths(validate_geordi_ir(&ir));

        assert_paths_include(&paths, "$.scene.width");
        assert_paths_include(&paths, "$.nodes[0].props.width");
        assert_paths_include(&paths, "$.nodes[0].props.x");
        Ok(())
    }

    #[test]
    fn rejects_unsupported_node_kinds_and_bad_rect_fill() -> Result<(), GeordiIrTestError> {
        let mut ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        ir.nodes[0].kind = "Circle".to_owned();
        ir.nodes[0].props.fill = "#FFFFFF".to_owned();

        let paths = validation_paths(validate_geordi_ir(&ir));

        assert_paths_include(&paths, "$.nodes[0].kind");
        assert_paths_include(&paths, "$.nodes[0].props.fill");
        Ok(())
    }

    fn fixture_path(path: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere")
            .join(path)
    }

    fn strict_text_fixture_source() -> &'static str {
        r#"{
          "features": ["text.positionedGlyphRuns", "text.fontPack", "text.lineBoxes"],
          "fixtureVersion": "geordi-strict-text-fixture/1",
          "fontPackPath": "fixtures/render-everywhere/assets/fonts/font-pack.geordi.json",
          "glyphRuns": [
            {
              "fontId": "lato-regular",
              "glyphs": [
                {
                  "advance": 2048,
                  "glyphId": 43,
                  "x": 0,
                  "xOffset": 0,
                  "y": 3072,
                  "yOffset": 0
                }
              ],
              "id": "run-0",
              "lineBoxId": "line-0"
            }
          ],
          "id": "render-everywhere:strict-text:geordi",
          "lineBoxes": [
            { "baselineY": 3072, "height": 4096, "id": "line-0", "width": 12288, "x": 0, "y": 0 }
          ],
          "positionEncoding": "geordi-fixed-26.6/1",
          "semanticText": { "affectsPixels": false, "language": "en", "source": "GEORDI" },
          "textProfile": "geordi-strict-positioned-glyph-run/1"
        }"#
    }

    fn unique_temp_path(prefix: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());

        std::env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()))
    }

    fn repository_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn assert_exact_float(actual: f64, expected: f64) {
        assert_eq!(actual.to_bits(), expected.to_bits());
    }

    fn validation_paths(result: Result<(), GeordiIrValidationError>) -> Vec<String> {
        match result {
            Ok(()) => Vec::new(),
            Err(error) => error
                .issues()
                .iter()
                .map(|issue| issue.path.clone())
                .collect(),
        }
    }

    fn strict_text_validation_paths(
        result: Result<(), GeordiStrictTextFixtureValidationError>,
    ) -> Vec<String> {
        match result {
            Ok(()) => Vec::new(),
            Err(error) => error
                .issues()
                .iter()
                .map(|issue| issue.path.clone())
                .collect(),
        }
    }

    fn font_pack_hash_error<T>(
        result: Result<T, GeordiFontPackHashError>,
    ) -> Result<GeordiFontPackHashError, GeordiIrTestError> {
        match result {
            Ok(_) => Err(GeordiIrTestError::ExpectedFailure),
            Err(error) => Ok(error),
        }
    }

    fn assert_paths_include(paths: &[String], path: &str) {
        let has_issue = paths.iter().any(|issue_path| issue_path == path);

        assert!(has_issue, "{path} missing from {paths:?}");
    }
}
