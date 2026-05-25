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

/// Prefix used by Geordi SHA-256 content identity strings.
pub const GEORDI_SHA256_PREFIX: &str = "sha256:";

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
            GeordiFontPackHashErrorSource::EscapedPath | GeordiFontPackHashErrorSource::Read(_) => {
                None
            }
        }
    }

    /// Expected hash when the failure was a hash mismatch.
    #[must_use]
    pub fn expected(&self) -> Option<&str> {
        match &self.source {
            GeordiFontPackHashErrorSource::Mismatch { expected, .. } => Some(expected),
            GeordiFontPackHashErrorSource::EscapedPath | GeordiFontPackHashErrorSource::Read(_) => {
                None
            }
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

    let bytes = fs::read(repository_root.join(fixture_path))
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

fn is_fixture_local_path(path: &str) -> bool {
    let path = Path::new(path);
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
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
        GeordiFontPackHashArtifactKind, GeordiFontPackHashError, GeordiFontPackLoadError,
        GeordiFontPackParseError, GeordiIrLoadError, GeordiIrParseError, GeordiIrValidationError,
        geordi_sha256_from_bytes, load_geordi_font_pack_manifest, load_geordi_ir,
        parse_geordi_font_pack_manifest, parse_geordi_ir, validate_geordi_font_pack_hashes,
        validate_geordi_ir,
    };
    use std::error::Error;
    use std::fmt::{Display, Formatter};
    use std::path::PathBuf;

    #[derive(Debug)]
    enum GeordiIrTestError {
        FontPackLoad(GeordiFontPackLoadError),
        FontPackHash(GeordiFontPackHashError),
        FontPackParse(GeordiFontPackParseError),
        Load(GeordiIrLoadError),
        Parse(GeordiIrParseError),
        ExpectedFailure,
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
                Self::Load(source) => Some(source),
                Self::Parse(source) => Some(source),
                Self::ExpectedFailure => None,
                Self::Validation(source) => Some(source),
            }
        }
    }

    impl From<GeordiIrLoadError> for GeordiIrTestError {
        fn from(error: GeordiIrLoadError) -> Self {
            Self::Load(error)
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

        assert_eq!(escaped.path(), "../Lato-Regular.ttf");

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

        assert!(has_issue);
    }
}
