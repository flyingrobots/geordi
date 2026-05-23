//! Native Rust harness for the Geordi render-everywhere fixture.

use geordi_ir::{
    GEORDI_CORE_PROFILE, GEORDI_IR_VERSION, GEORDI_NUMERIC_PROFILE, GeordiIr, GeordiIrLoadError,
    GeordiIrValidationError, load_geordi_ir, validate_geordi_ir,
};
use geordi_renderer::{
    GeordiRenderError, GeordiRuntimeUnsupportedProfileError, RenderedImage,
    assert_native_runtime_profile, render_geordi_to_image,
};
use minifb::{Key, Window, WindowOptions};
use serde::Deserialize;
use std::env;
use std::error::Error;
use std::ffi::{OsStr, OsString};
use std::fmt::{Display, Formatter};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const FIXTURE_MANIFEST_PATH: &str = "fixture.json";
const RENDER_FIXTURE_VERSION: &str = "geordi-render-fixture/1";
const HASH_PREFIX: &str = "sha256:";
const HASH_HEX_LENGTH: usize = 64;
fn main() -> Result<(), NativeAppError> {
    run_from_env(env::args_os())
}

fn run_from_env(args: impl IntoIterator<Item = OsString>) -> Result<(), NativeAppError> {
    let args = NativeArgs::parse(args)?;
    let loaded = load_fixture(&args.fixture_dir)?;
    write_fixture_summary(&mut io::stdout().lock(), &loaded)?;

    match args.mode {
        NativeMode::Check => Ok(()),
        NativeMode::Window => {
            open_fixture_window(&loaded)?;
            Ok(())
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum NativeMode {
    Check,
    Window,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct NativeArgs {
    fixture_dir: PathBuf,
    mode: NativeMode,
}

impl NativeArgs {
    fn parse(args: impl IntoIterator<Item = OsString>) -> Result<Self, NativeArgsError> {
        let values = args.into_iter().skip(1).collect::<Vec<_>>();
        match values.as_slice() {
            [flag, fixture_dir] if flag == OsStr::new("--check") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                mode: NativeMode::Check,
            }),
            [fixture_dir] => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                mode: NativeMode::Window,
            }),
            _ => Err(NativeArgsError),
        }
    }
}

#[derive(Debug)]
struct LoadedFixture {
    image: RenderedImage,
    ir: GeordiIr,
    manifest: RenderFixtureManifest,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RenderFixtureManifest {
    artifact_hash: String,
    canvas: RenderFixtureCanvas,
    fixture_version: String,
    id: String,
    pixel_probes: Vec<RenderFixturePixelProbe>,
    receipt_path: String,
    runtime_profile: RenderFixtureRuntimeProfile,
    scene_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RenderFixtureCanvas {
    height: usize,
    width: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RenderFixturePixelProbe {
    id: String,
    rgba: [u8; 4],
    x: usize,
    y: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RenderFixtureRuntimeProfile {
    ir_version: String,
    numeric_profile: String,
    requires: Vec<String>,
}

#[derive(Debug)]
enum NativeAppError {
    Args(NativeArgsError),
    IrLoad(GeordiIrLoadError),
    IrValidation(GeordiIrValidationError),
    ManifestLoad(NativeManifestLoadError),
    ManifestParse(NativeManifestParseError),
    ManifestValidation(NativeManifestValidationError),
    Output(NativeOutputError),
    Render(GeordiRenderError),
    RuntimeProfile(GeordiRuntimeUnsupportedProfileError),
    Window(NativeWindowError),
}

impl Display for NativeAppError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native render-everywhere harness failed")
    }
}

impl Error for NativeAppError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Args(source) => Some(source),
            Self::IrLoad(source) => Some(source),
            Self::IrValidation(source) => Some(source),
            Self::ManifestLoad(source) => Some(source),
            Self::ManifestParse(source) => Some(source),
            Self::ManifestValidation(source) => Some(source),
            Self::Output(source) => Some(source),
            Self::Render(source) => Some(source),
            Self::RuntimeProfile(source) => Some(source),
            Self::Window(source) => Some(source),
        }
    }
}

impl From<NativeArgsError> for NativeAppError {
    fn from(error: NativeArgsError) -> Self {
        Self::Args(error)
    }
}

impl From<GeordiIrLoadError> for NativeAppError {
    fn from(error: GeordiIrLoadError) -> Self {
        Self::IrLoad(error)
    }
}

impl From<GeordiIrValidationError> for NativeAppError {
    fn from(error: GeordiIrValidationError) -> Self {
        Self::IrValidation(error)
    }
}

impl From<NativeManifestLoadError> for NativeAppError {
    fn from(error: NativeManifestLoadError) -> Self {
        Self::ManifestLoad(error)
    }
}

impl From<NativeManifestParseError> for NativeAppError {
    fn from(error: NativeManifestParseError) -> Self {
        Self::ManifestParse(error)
    }
}

impl From<NativeManifestValidationError> for NativeAppError {
    fn from(error: NativeManifestValidationError) -> Self {
        Self::ManifestValidation(error)
    }
}

impl From<NativeOutputError> for NativeAppError {
    fn from(error: NativeOutputError) -> Self {
        Self::Output(error)
    }
}

impl From<GeordiRenderError> for NativeAppError {
    fn from(error: GeordiRenderError) -> Self {
        Self::Render(error)
    }
}

impl From<GeordiRuntimeUnsupportedProfileError> for NativeAppError {
    fn from(error: GeordiRuntimeUnsupportedProfileError) -> Self {
        Self::RuntimeProfile(error)
    }
}

impl From<NativeWindowError> for NativeAppError {
    fn from(error: NativeWindowError) -> Self {
        Self::Window(error)
    }
}

#[derive(Debug)]
struct NativeArgsError;

impl Display for NativeArgsError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Usage: native-render-everywhere [--check] <fixture-dir>")
    }
}

impl Error for NativeArgsError {}

#[derive(Debug)]
struct NativeManifestLoadError {
    path: PathBuf,
    source: io::Error,
}

impl NativeManifestLoadError {
    const fn new(path: PathBuf, source: io::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeManifestLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native fixture manifest load failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeManifestLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
struct NativeManifestParseError {
    path: PathBuf,
    source: serde_json::Error,
}

impl NativeManifestParseError {
    const fn new(path: PathBuf, source: serde_json::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeManifestParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native fixture manifest parse failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeManifestParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
struct NativeManifestValidationError {
    issues: Vec<NativeManifestValidationIssue>,
}

impl NativeManifestValidationError {
    const fn new(issues: Vec<NativeManifestValidationIssue>) -> Self {
        Self { issues }
    }
}

impl Display for NativeManifestValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(issue) = self.issues.first() {
            write!(
                formatter,
                "Native fixture manifest validation failed at {}: {}",
                issue.path, issue.message
            )
        } else {
            formatter.write_str("Native fixture manifest validation failed")
        }
    }
}

impl Error for NativeManifestValidationError {}

#[derive(Debug)]
struct NativeManifestValidationIssue {
    path: String,
    message: String,
}

impl NativeManifestValidationIssue {
    fn new(path: &str, message: &str) -> Self {
        Self {
            path: path.to_owned(),
            message: message.to_owned(),
        }
    }
}

#[derive(Debug)]
struct NativeOutputError {
    source: io::Error,
}

impl NativeOutputError {
    const fn new(source: io::Error) -> Self {
        Self { source }
    }
}

impl Display for NativeOutputError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native fixture summary output failed")
    }
}

impl Error for NativeOutputError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
struct NativeWindowError {
    source: NativeWindowErrorSource,
}

#[derive(Debug)]
enum NativeWindowErrorSource {
    BufferSize,
    Window(minifb::Error),
}

impl NativeWindowError {
    const fn buffer_size() -> Self {
        Self {
            source: NativeWindowErrorSource::BufferSize,
        }
    }

    const fn window(source: minifb::Error) -> Self {
        Self {
            source: NativeWindowErrorSource::Window(source),
        }
    }
}

impl Display for NativeWindowError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native fixture window failed")
    }
}

impl Error for NativeWindowError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            NativeWindowErrorSource::BufferSize => None,
            NativeWindowErrorSource::Window(source) => Some(source),
        }
    }
}

fn load_fixture(fixture_dir: &Path) -> Result<LoadedFixture, NativeAppError> {
    let manifest = load_manifest(&fixture_dir.join(FIXTURE_MANIFEST_PATH))?;
    validate_manifest(&manifest)?;

    let ir = load_geordi_ir(fixture_dir.join(&manifest.scene_path))?;
    validate_geordi_ir(&ir)?;
    validate_manifest_matches_ir(&manifest, &ir)?;
    assert_native_runtime_profile(&ir)?;
    let image = render_geordi_to_image(&ir)?;

    Ok(LoadedFixture {
        image,
        ir,
        manifest,
    })
}

fn load_manifest(path: &Path) -> Result<RenderFixtureManifest, NativeAppError> {
    let source = fs::read_to_string(path)
        .map_err(|error| NativeManifestLoadError::new(path.to_path_buf(), error))?;

    serde_json::from_str(&source)
        .map_err(|error| NativeManifestParseError::new(path.to_path_buf(), error).into())
}

fn validate_manifest(
    manifest: &RenderFixtureManifest,
) -> Result<(), NativeManifestValidationError> {
    let mut issues = Vec::new();

    validate_manifest_literal(
        &manifest.fixture_version,
        RENDER_FIXTURE_VERSION,
        "$.fixtureVersion",
        "Fixture version",
        &mut issues,
    );
    validate_manifest_non_empty(&manifest.id, "$.id", "Fixture id", &mut issues);
    validate_manifest_path(
        &manifest.scene_path,
        "$.scenePath",
        "Scene path",
        &mut issues,
    );
    validate_manifest_path(
        &manifest.receipt_path,
        "$.receiptPath",
        "Receipt path",
        &mut issues,
    );
    validate_manifest_hash(&manifest.artifact_hash, &mut issues);
    validate_manifest_canvas(&manifest.canvas, &mut issues);
    validate_manifest_runtime_profile(&manifest.runtime_profile, &mut issues);
    validate_manifest_pixel_probes(&manifest.pixel_probes, &manifest.canvas, &mut issues);

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeManifestValidationError::new(issues))
    }
}

fn validate_manifest_matches_ir(
    manifest: &RenderFixtureManifest,
    ir: &GeordiIr,
) -> Result<(), NativeManifestValidationError> {
    let mut issues = Vec::new();

    validate_manifest_literal(
        &manifest.runtime_profile.ir_version,
        &ir.ir_version,
        "$.runtimeProfile.irVersion",
        "Runtime profile IR version",
        &mut issues,
    );
    validate_manifest_literal(
        &manifest.runtime_profile.numeric_profile,
        &ir.numeric_profile,
        "$.runtimeProfile.numericProfile",
        "Runtime profile numeric profile",
        &mut issues,
    );

    if manifest.runtime_profile.requires != ir.requires {
        push_manifest_issue(
            &mut issues,
            "$.runtimeProfile.requires",
            "Runtime profile requirements must match the IR requirements",
        );
    }

    if !scene_dimension_matches_usize(ir.scene.width, manifest.canvas.width) {
        push_manifest_issue(
            &mut issues,
            "$.canvas.width",
            "Canvas width must match the IR scene width",
        );
    }

    if !scene_dimension_matches_usize(ir.scene.height, manifest.canvas.height) {
        push_manifest_issue(
            &mut issues,
            "$.canvas.height",
            "Canvas height must match the IR scene height",
        );
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeManifestValidationError::new(issues))
    }
}

fn validate_manifest_runtime_profile(
    profile: &RenderFixtureRuntimeProfile,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    validate_manifest_literal(
        &profile.ir_version,
        GEORDI_IR_VERSION,
        "$.runtimeProfile.irVersion",
        "Runtime profile IR version",
        issues,
    );
    validate_manifest_literal(
        &profile.numeric_profile,
        GEORDI_NUMERIC_PROFILE,
        "$.runtimeProfile.numericProfile",
        "Runtime profile numeric profile",
        issues,
    );

    if !profile
        .requires
        .iter()
        .any(|requirement| requirement == GEORDI_CORE_PROFILE)
    {
        push_manifest_issue(
            issues,
            "$.runtimeProfile.requires",
            "Runtime profile requirements must include geordi/core/1",
        );
    }

    for (index, requirement) in profile.requires.iter().enumerate() {
        if profile
            .requires
            .iter()
            .take(index)
            .any(|seen| seen == requirement)
        {
            push_manifest_issue(
                issues,
                &format!("$.runtimeProfile.requires[{index}]"),
                "Runtime profile requirement must not be duplicated",
            );
        }
    }
}

fn scene_dimension_matches_usize(scene_dimension: f64, canvas_dimension: usize) -> bool {
    scene_dimension.is_finite()
        && scene_dimension.trunc().to_bits() == scene_dimension.to_bits()
        && format!("{scene_dimension:.0}") == canvas_dimension.to_string()
}

fn validate_manifest_canvas(
    canvas: &RenderFixtureCanvas,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    if canvas.width == 0 {
        push_manifest_issue(issues, "$.canvas.width", "Canvas width must be positive");
    }

    if canvas.height == 0 {
        push_manifest_issue(issues, "$.canvas.height", "Canvas height must be positive");
    }
}

fn validate_manifest_pixel_probes(
    probes: &[RenderFixturePixelProbe],
    canvas: &RenderFixtureCanvas,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    if probes.is_empty() {
        push_manifest_issue(issues, "$.pixelProbes", "Pixel probes must not be empty");
    }

    for (index, probe) in probes.iter().enumerate() {
        let path = format!("$.pixelProbes[{index}]");
        validate_manifest_non_empty(&probe.id, &format!("{path}.id"), "Pixel probe id", issues);

        if probe.x >= canvas.width {
            push_manifest_issue(
                issues,
                &format!("{path}.x"),
                "Pixel probe x coordinate must be inside the canvas",
            );
        }

        if probe.y >= canvas.height {
            push_manifest_issue(
                issues,
                &format!("{path}.y"),
                "Pixel probe y coordinate must be inside the canvas",
            );
        }

        if probe.rgba[3] != u8::MAX {
            push_manifest_issue(
                issues,
                &format!("{path}.rgba[3]"),
                "Pixel probe alpha channel must be opaque for the native MVP",
            );
        }
    }
}

fn validate_manifest_hash(hash: &str, issues: &mut Vec<NativeManifestValidationIssue>) {
    let digest = hash.strip_prefix(HASH_PREFIX);
    let valid = digest.is_some_and(|value| {
        value.len() == HASH_HEX_LENGTH
            && value
                .as_bytes()
                .iter()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
    });

    if !valid {
        push_manifest_issue(
            issues,
            "$.artifactHash",
            "Artifact hash must be a lowercase sha256 digest",
        );
    }
}

fn validate_manifest_path(
    value: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    validate_manifest_non_empty(value, path, label, issues);

    if value.starts_with('/') || value.contains("..") {
        push_manifest_issue(
            issues,
            path,
            "Fixture path must be relative and fixture-local",
        );
    }
}

fn validate_manifest_non_empty(
    value: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    if value.is_empty() {
        push_manifest_issue(issues, path, &format!("{label} must not be empty"));
    }
}

fn validate_manifest_literal(
    value: &str,
    expected: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    if value != expected {
        push_manifest_issue(issues, path, &format!("{label} must be {expected}"));
    }
}

fn push_manifest_issue(issues: &mut Vec<NativeManifestValidationIssue>, path: &str, message: &str) {
    issues.push(NativeManifestValidationIssue::new(path, message));
}

fn write_fixture_summary(
    writer: &mut impl Write,
    loaded: &LoadedFixture,
) -> Result<(), NativeOutputError> {
    writeln!(writer, "Geordi native fixture loaded").map_err(NativeOutputError::new)?;
    writeln!(writer, "id={}", loaded.manifest.id).map_err(NativeOutputError::new)?;
    writeln!(writer, "artifactHash={}", loaded.manifest.artifact_hash)
        .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "canvas={}x{}",
        loaded.manifest.canvas.width, loaded.manifest.canvas.height
    )
    .map_err(NativeOutputError::new)?;
    writeln!(writer, "scene={}", loaded.ir.scene.id).map_err(NativeOutputError::new)?;
    writeln!(writer, "requirements={}", loaded.ir.requires.join(","))
        .map_err(NativeOutputError::new)
}

fn open_fixture_window(loaded: &LoadedFixture) -> Result<(), NativeWindowError> {
    let width = loaded.manifest.canvas.width;
    let height = loaded.manifest.canvas.height;
    let buffer = minifb_buffer(&loaded.image)?;
    let mut window = Window::new(
        &window_title(loaded),
        width,
        height,
        WindowOptions::default(),
    )
    .map_err(NativeWindowError::window)?;

    while window.is_open() && !window.is_key_down(Key::Escape) {
        window
            .update_with_buffer(&buffer, width, height)
            .map_err(NativeWindowError::window)?;
    }

    Ok(())
}

fn minifb_buffer(image: &RenderedImage) -> Result<Vec<u32>, NativeWindowError> {
    let mut buffer = Vec::with_capacity(
        image
            .width()
            .checked_mul(image.height())
            .ok_or_else(NativeWindowError::buffer_size)?,
    );

    for rgba in image.rgba().chunks_exact(4) {
        let red = u32::from(rgba[0]);
        let green = u32::from(rgba[1]);
        let blue = u32::from(rgba[2]);
        buffer.push((red << 16) | (green << 8) | blue);
    }

    if buffer.is_empty() {
        return Err(NativeWindowError::buffer_size());
    }

    Ok(buffer)
}

fn window_title(loaded: &LoadedFixture) -> String {
    format!(
        "Geordi Native - {} - {}",
        loaded.manifest.id,
        short_hash(&loaded.manifest.artifact_hash)
    )
}

fn short_hash(hash: &str) -> String {
    let digest = hash.strip_prefix(HASH_PREFIX).map_or(hash, |value| value);

    digest.chars().take(12).collect()
}

#[cfg(test)]
mod tests {
    use super::{NativeAppError, NativeArgs, NativeMode, load_fixture, run_from_env};
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};

    #[test]
    fn check_mode_loads_and_reports_the_shared_fixture() -> Result<(), NativeAppError> {
        run_from_env([
            OsString::from("native-render-everywhere"),
            OsString::from("--check"),
            fixture_path("hello-panel").into_os_string(),
        ])
    }

    #[test]
    fn load_fixture_rejects_the_unsupported_strict_text_profile() {
        let result = load_fixture(&fixture_path("unsupported-strict-text"));

        assert!(matches!(result, Err(NativeAppError::RuntimeProfile(_))));
    }

    #[test]
    fn parses_check_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--check"),
            OsString::from("fixtures/render-everywhere/hello-panel"),
        ])?;

        assert_eq!(args.mode, NativeMode::Check);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/hello-panel")
        );
        Ok(())
    }

    fn fixture_path(path: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere")
            .join(path)
    }
}
