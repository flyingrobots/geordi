//! Native Rust harness for the Geordi render-everywhere fixture.

pub mod bunny;

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
use sha2::{Digest, Sha256};
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
const NATIVE_RENDERER_NAME: &str = "rust-software-rectangles";
fn main() -> Result<(), NativeAppError> {
    run_from_env(env::args_os())
}

fn run_from_env(args: impl IntoIterator<Item = OsString>) -> Result<(), NativeAppError> {
    let args = NativeArgs::parse(args)?;

    match args.mode {
        NativeMode::BunnyCheck => {
            let loaded = bunny::load_bunny_fixture(&args.fixture_dir, args.frame_index)?;
            bunny::write_bunny_summary(&mut io::stdout().lock(), &loaded)?;
            Ok(())
        }
        NativeMode::BunnySmoke => {
            bunny::run_bunny_smoke(
                &mut io::stdout().lock(),
                &args.fixture_dir,
                args.frame_index,
            )?;
            Ok(())
        }
        NativeMode::BunnyWindow => {
            bunny::open_bunny_window(&args.fixture_dir)?;
            Ok(())
        }
        NativeMode::Check => {
            let loaded = load_fixture(&args.fixture_dir)?;
            write_fixture_summary(&mut io::stdout().lock(), &loaded)?;
            Ok(())
        }
        NativeMode::Smoke => {
            let loaded = load_fixture(&args.fixture_dir)?;
            write_fixture_summary(&mut io::stdout().lock(), &loaded)?;
            run_smoke(&mut io::stdout().lock(), &loaded)
        }
        NativeMode::Window => {
            let loaded = load_fixture(&args.fixture_dir)?;
            write_fixture_summary(&mut io::stdout().lock(), &loaded)?;
            open_fixture_window(&loaded)?;
            Ok(())
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum NativeMode {
    BunnyCheck,
    BunnySmoke,
    BunnyWindow,
    Check,
    Smoke,
    Window,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct NativeArgs {
    fixture_dir: PathBuf,
    frame_index: u64,
    mode: NativeMode,
}

impl NativeArgs {
    fn parse(args: impl IntoIterator<Item = OsString>) -> Result<Self, NativeArgsError> {
        let values = args.into_iter().skip(1).collect::<Vec<_>>();
        match values.as_slice() {
            [flag, fixture_dir] if flag == OsStr::new("--bunny-check") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::BunnyCheck,
            }),
            [flag, fixture_dir] if flag == OsStr::new("--bunny-smoke") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::BunnySmoke,
            }),
            [flag, fixture_dir] if flag == OsStr::new("--bunny-window") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::BunnyWindow,
            }),
            [flag, frame_flag, frame_index, fixture_dir]
                if flag == OsStr::new("--bunny-check") && frame_flag == OsStr::new("--frame") =>
            {
                Ok(Self {
                    fixture_dir: PathBuf::from(fixture_dir),
                    frame_index: parse_frame_index(frame_index)?,
                    mode: NativeMode::BunnyCheck,
                })
            }
            [flag, frame_flag, frame_index, fixture_dir]
                if flag == OsStr::new("--bunny-smoke") && frame_flag == OsStr::new("--frame") =>
            {
                Ok(Self {
                    fixture_dir: PathBuf::from(fixture_dir),
                    frame_index: parse_frame_index(frame_index)?,
                    mode: NativeMode::BunnySmoke,
                })
            }
            [flag, fixture_dir] if flag == OsStr::new("--check") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::Check,
            }),
            [flag, fixture_dir] if flag == OsStr::new("--smoke") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::Smoke,
            }),
            [fixture_dir] => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::Window,
            }),
            _ => Err(NativeArgsError),
        }
    }
}

fn parse_frame_index(value: &OsStr) -> Result<u64, NativeArgsError> {
    let text = value.to_str().ok_or(NativeArgsError)?;
    text.parse::<u64>().map_err(|_error| NativeArgsError)
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
    source: RenderFixtureSource,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RenderFixtureReceipt {
    artifact_hash: String,
    artifact_hash_alg: String,
    artifact_path: String,
    fixture_id: String,
    fixture_version: String,
    ir_version: String,
    numeric_profile: String,
    requires: Vec<String>,
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase", tag = "kind")]
enum RenderFixtureSource {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "gpvue-draft", rename_all = "camelCase")]
    GpvueDraft { path: String },
    #[serde(rename = "gpvue", rename_all = "camelCase")]
    Gpvue {
        compiler: String,
        compiler_version: String,
        path: String,
    },
}

#[derive(Debug)]
enum NativeAppError {
    Args(NativeArgsError),
    ArtifactLoad(NativeArtifactLoadError),
    ArtifactValidation(NativeArtifactValidationError),
    Bunny(bunny::NativeBunnyError),
    IrLoad(GeordiIrLoadError),
    IrValidation(GeordiIrValidationError),
    ManifestLoad(NativeManifestLoadError),
    ManifestParse(NativeManifestParseError),
    ManifestValidation(NativeManifestValidationError),
    Output(NativeOutputError),
    PixelProbe(NativePixelProbeError),
    ReceiptParse(NativeReceiptParseError),
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
            Self::ArtifactLoad(source) => Some(source),
            Self::ArtifactValidation(source) => Some(source),
            Self::Bunny(source) => Some(source),
            Self::IrLoad(source) => Some(source),
            Self::IrValidation(source) => Some(source),
            Self::ManifestLoad(source) => Some(source),
            Self::ManifestParse(source) => Some(source),
            Self::ManifestValidation(source) => Some(source),
            Self::Output(source) => Some(source),
            Self::PixelProbe(source) => Some(source),
            Self::ReceiptParse(source) => Some(source),
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

impl From<NativeArtifactLoadError> for NativeAppError {
    fn from(error: NativeArtifactLoadError) -> Self {
        Self::ArtifactLoad(error)
    }
}

impl From<NativeArtifactValidationError> for NativeAppError {
    fn from(error: NativeArtifactValidationError) -> Self {
        Self::ArtifactValidation(error)
    }
}

impl From<bunny::NativeBunnyError> for NativeAppError {
    fn from(error: bunny::NativeBunnyError) -> Self {
        Self::Bunny(error)
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

impl From<NativePixelProbeError> for NativeAppError {
    fn from(error: NativePixelProbeError) -> Self {
        Self::PixelProbe(error)
    }
}

impl From<NativeReceiptParseError> for NativeAppError {
    fn from(error: NativeReceiptParseError) -> Self {
        Self::ReceiptParse(error)
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
        formatter.write_str(
            "Usage: native-render-everywhere [--check|--smoke|--bunny-check|--bunny-smoke|--bunny-window] [--frame <index>] <fixture-dir>",
        )
    }
}

impl Error for NativeArgsError {}

#[derive(Debug)]
struct NativeArtifactLoadError {
    path: PathBuf,
    source: io::Error,
}

impl NativeArtifactLoadError {
    const fn new(path: PathBuf, source: io::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeArtifactLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native fixture artifact load failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeArtifactLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
struct NativeArtifactValidationError {
    issues: Vec<NativeArtifactValidationIssue>,
}

impl NativeArtifactValidationError {
    const fn new(issues: Vec<NativeArtifactValidationIssue>) -> Self {
        Self { issues }
    }
}

impl Display for NativeArtifactValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(issue) = self.issues.first() {
            write!(
                formatter,
                "Native fixture artifact validation failed at {}: {}",
                issue.path, issue.message
            )
        } else {
            formatter.write_str("Native fixture artifact validation failed")
        }
    }
}

impl Error for NativeArtifactValidationError {}

#[derive(Debug)]
struct NativeArtifactValidationIssue {
    path: String,
    message: String,
}

impl NativeArtifactValidationIssue {
    fn new(path: &str, message: &str) -> Self {
        Self {
            path: path.to_owned(),
            message: message.to_owned(),
        }
    }
}

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
struct NativeReceiptParseError {
    path: PathBuf,
    source: serde_json::Error,
}

impl NativeReceiptParseError {
    const fn new(path: PathBuf, source: serde_json::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeReceiptParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native fixture receipt parse failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeReceiptParseError {
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
struct NativePixelProbeError {
    actual: Option<[u8; 4]>,
    expected: [u8; 4],
    fixture_id: String,
    probe_id: String,
    x: usize,
    y: usize,
}

impl NativePixelProbeError {
    fn new(fixture_id: &str, probe: &RenderFixturePixelProbe, actual: Option<[u8; 4]>) -> Self {
        Self {
            actual,
            expected: probe.rgba,
            fixture_id: fixture_id.to_owned(),
            probe_id: probe.id.clone(),
            x: probe.x,
            y: probe.y,
        }
    }
}

impl Display for NativePixelProbeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native pixel probe failed for {}:{} at {},{} expected {:?} actual {:?}",
            self.fixture_id, self.probe_id, self.x, self.y, self.expected, self.actual
        )
    }
}

impl Error for NativePixelProbeError {}

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

    let scene_path = fixture_dir.join(&manifest.scene_path);
    let scene_bytes = load_artifact_bytes(&scene_path)?;
    validate_scene_artifact_hash(&manifest, &scene_bytes)?;
    let receipt = load_receipt(&fixture_dir.join(&manifest.receipt_path))?;
    validate_receipt_matches_manifest(&manifest, &receipt)?;

    let ir = load_geordi_ir(scene_path)?;
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

fn load_artifact_bytes(path: &Path) -> Result<Vec<u8>, NativeArtifactLoadError> {
    fs::read(path).map_err(|error| NativeArtifactLoadError::new(path.to_path_buf(), error))
}

fn load_manifest(path: &Path) -> Result<RenderFixtureManifest, NativeAppError> {
    let source = fs::read_to_string(path)
        .map_err(|error| NativeManifestLoadError::new(path.to_path_buf(), error))?;

    serde_json::from_str(&source)
        .map_err(|error| NativeManifestParseError::new(path.to_path_buf(), error).into())
}

fn load_receipt(path: &Path) -> Result<RenderFixtureReceipt, NativeAppError> {
    let source = fs::read_to_string(path)
        .map_err(|error| NativeArtifactLoadError::new(path.to_path_buf(), error))?;

    serde_json::from_str(&source)
        .map_err(|error| NativeReceiptParseError::new(path.to_path_buf(), error).into())
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
    validate_manifest_source(&manifest.source, &mut issues);
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

fn validate_scene_artifact_hash(
    manifest: &RenderFixtureManifest,
    scene_bytes: &[u8],
) -> Result<(), NativeArtifactValidationError> {
    let actual_hash = sha256_artifact_hash(scene_bytes);

    if actual_hash == manifest.artifact_hash {
        Ok(())
    } else {
        Err(NativeArtifactValidationError::new(vec![
            NativeArtifactValidationIssue::new(
                "$.artifactHash",
                "Artifact hash must match the loaded scene bytes",
            ),
        ]))
    }
}

fn validate_receipt_matches_manifest(
    manifest: &RenderFixtureManifest,
    receipt: &RenderFixtureReceipt,
) -> Result<(), NativeArtifactValidationError> {
    let mut issues = Vec::new();

    validate_artifact_literal(
        &receipt.artifact_hash,
        &manifest.artifact_hash,
        "$.artifactHash",
        "Receipt artifact hash",
        &mut issues,
    );
    validate_artifact_literal(
        &receipt.artifact_hash_alg,
        "sha256",
        "$.artifactHashAlg",
        "Receipt artifact hash algorithm",
        &mut issues,
    );
    validate_artifact_literal(
        &receipt.artifact_path,
        &manifest.scene_path,
        "$.artifactPath",
        "Receipt artifact path",
        &mut issues,
    );
    validate_artifact_literal(
        &receipt.fixture_id,
        &manifest.id,
        "$.fixtureId",
        "Receipt fixture id",
        &mut issues,
    );
    validate_artifact_literal(
        &receipt.fixture_version,
        &manifest.fixture_version,
        "$.fixtureVersion",
        "Receipt fixture version",
        &mut issues,
    );
    validate_artifact_literal(
        &receipt.ir_version,
        &manifest.runtime_profile.ir_version,
        "$.irVersion",
        "Receipt IR version",
        &mut issues,
    );
    validate_artifact_literal(
        &receipt.numeric_profile,
        &manifest.runtime_profile.numeric_profile,
        "$.numericProfile",
        "Receipt numeric profile",
        &mut issues,
    );

    if receipt.requires != manifest.runtime_profile.requires {
        push_artifact_issue(
            &mut issues,
            "$.requires",
            "Receipt requirements must match the fixture runtime profile",
        );
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeArtifactValidationError::new(issues))
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

fn validate_manifest_source(
    source: &RenderFixtureSource,
    issues: &mut Vec<NativeManifestValidationIssue>,
) {
    match source {
        RenderFixtureSource::None => {}
        RenderFixtureSource::GpvueDraft { path } => {
            validate_manifest_path(path, "$.source.path", "GPVue draft source path", issues);
        }
        RenderFixtureSource::Gpvue {
            compiler,
            compiler_version,
            path,
        } => {
            validate_manifest_path(path, "$.source.path", "GPVue source path", issues);
            validate_manifest_non_empty(compiler, "$.source.compiler", "GPVue compiler", issues);
            validate_manifest_non_empty(
                compiler_version,
                "$.source.compilerVersion",
                "GPVue compiler version",
                issues,
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

    if !is_fixture_local_relative_path(value) {
        push_manifest_issue(
            issues,
            path,
            "Fixture path must be relative and fixture-local",
        );
    }
}

fn is_fixture_local_relative_path(value: &str) -> bool {
    !value.starts_with('/')
        && !value.contains('\\')
        && !value.contains("..")
        && !has_windows_drive_prefix(value)
}

fn has_windows_drive_prefix(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
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

fn validate_artifact_literal(
    value: &str,
    expected: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeArtifactValidationIssue>,
) {
    if value != expected {
        push_artifact_issue(issues, path, &format!("{label} must be {expected}"));
    }
}

fn push_artifact_issue(issues: &mut Vec<NativeArtifactValidationIssue>, path: &str, message: &str) {
    issues.push(NativeArtifactValidationIssue::new(path, message));
}

fn sha256_artifact_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hash = String::with_capacity(HASH_PREFIX.len() + HASH_HEX_LENGTH);
    hash.push_str(HASH_PREFIX);
    for byte in digest {
        push_hex_byte(&mut hash, byte);
    }

    hash
}

fn push_hex_byte(target: &mut String, byte: u8) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let high = usize::from(byte >> 4);
    let low = usize::from(byte & 0x0f);
    target.push(char::from(HEX[high]));
    target.push(char::from(HEX[low]));
}

fn write_fixture_summary(
    writer: &mut impl Write,
    loaded: &LoadedFixture,
) -> Result<(), NativeOutputError> {
    writeln!(writer, "Geordi native fixture loaded").map_err(NativeOutputError::new)?;
    writeln!(writer, "rendererName={NATIVE_RENDERER_NAME}").map_err(NativeOutputError::new)?;
    writeln!(writer, "fixtureId={}", loaded.manifest.id).map_err(NativeOutputError::new)?;
    writeln!(writer, "fixtureVersion={}", loaded.manifest.fixture_version)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "artifactHash={}", loaded.manifest.artifact_hash)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "irVersion={}", loaded.ir.ir_version).map_err(NativeOutputError::new)?;
    writeln!(writer, "numericProfile={}", loaded.ir.numeric_profile)
        .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "featureRequirements={}",
        loaded.ir.requires.join(", ")
    )
    .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "canvas={}x{}",
        loaded.manifest.canvas.width, loaded.manifest.canvas.height
    )
    .map_err(NativeOutputError::new)?;
    writeln!(writer, "scene={}", loaded.ir.scene.id).map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "shortHash={}",
        short_hash(&loaded.manifest.artifact_hash)
    )
    .map_err(NativeOutputError::new)
}

fn run_smoke(writer: &mut impl Write, loaded: &LoadedFixture) -> Result<(), NativeAppError> {
    assert_pixel_probes(loaded)?;
    writeln!(writer, "smoke=passed").map_err(NativeOutputError::new)?;
    Ok(())
}

fn assert_pixel_probes(loaded: &LoadedFixture) -> Result<(), NativePixelProbeError> {
    for probe in &loaded.manifest.pixel_probes {
        let actual = loaded.image.pixel_at(probe.x, probe.y);
        if actual != Some(probe.rgba) {
            return Err(NativePixelProbeError::new(
                &loaded.manifest.id,
                probe,
                actual,
            ));
        }
    }

    Ok(())
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
        "Geordi Native - {} - {} - {}",
        NATIVE_RENDERER_NAME,
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
    use super::{
        NativeAppError, NativeArgs, NativeMode, RenderFixtureSource, assert_pixel_probes,
        load_fixture, load_manifest, load_receipt, run_smoke, validate_manifest_path,
        validate_receipt_matches_manifest, validate_scene_artifact_hash, write_fixture_summary,
    };
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};

    #[test]
    fn check_mode_loads_and_reports_the_shared_fixture() -> Result<(), NativeAppError> {
        let loaded = load_fixture(&fixture_path("hello-panel"))?;
        let mut output = Vec::new();

        write_fixture_summary(&mut output, &loaded)?;

        let text = output_text(&output);
        assert!(text.contains("rendererName=rust-software-rectangles"));
        assert!(text.contains("fixtureId=render-everywhere:hello-panel"));
        assert!(text.contains(
            "artifactHash=sha256:30623d6141ba69c382c14c09eca9adedd40cb02644ff4ee9621de101da6b0082"
        ));
        assert!(text.contains("irVersion=geordi-ir/1"));
        assert!(text.contains("numericProfile=geordi-finite-binary64/1"));
        assert!(text.contains(
            "featureRequirements=geordi/core/1, layout.resolved, shape.rect, paint.solid"
        ));
        assert!(text.contains("shortHash=30623d6141ba"));
        assert!(matches!(
            loaded.manifest.source,
            RenderFixtureSource::Gpvue {
                ref compiler,
                ref compiler_version,
                ref path,
            } if compiler == "@flyingrobots/geordi-gpvue"
                && compiler_version == "0.1.0"
                && path == "source.gpvue"
        ));
        Ok(())
    }

    #[test]
    fn smoke_mode_renders_and_checks_the_shared_fixture() -> Result<(), NativeAppError> {
        let loaded = load_fixture(&fixture_path("hello-panel"))?;
        let mut output = Vec::new();

        run_smoke(&mut output, &loaded)?;

        assert!(!output.is_empty());
        Ok(())
    }

    #[test]
    fn load_fixture_rejects_the_unsupported_strict_text_profile() {
        let result = load_fixture(&fixture_path("unsupported-strict-text"));

        assert!(matches!(result, Err(NativeAppError::RuntimeProfile(_))));
    }

    #[test]
    fn artifact_hash_mismatch_is_a_custom_error() -> Result<(), NativeAppError> {
        let manifest = load_manifest(&fixture_path("hello-panel").join("fixture.json"))?;
        let result = validate_scene_artifact_hash(&manifest, b"not the fixture scene");

        assert!(result.is_err());
        Ok(())
    }

    #[test]
    fn receipt_hash_mismatch_is_a_custom_error() -> Result<(), NativeAppError> {
        let manifest = load_manifest(&fixture_path("hello-panel").join("fixture.json"))?;
        let mut receipt =
            load_receipt(&fixture_path("hello-panel").join("scene.geordi.json.receipt"))?;
        receipt.artifact_hash =
            "sha256:0000000000000000000000000000000000000000000000000000000000000000".to_owned();

        let result = validate_receipt_matches_manifest(&manifest, &receipt);

        assert!(result.is_err());
        Ok(())
    }

    #[test]
    fn manifest_paths_reject_windows_absolute_forms() {
        let mut issues = Vec::new();

        validate_manifest_path(
            "C:\\tmp\\scene.geordi.json",
            "$.scenePath",
            "Scene path",
            &mut issues,
        );
        validate_manifest_path(
            "\\\\server\\share\\scene.geordi.json",
            "$.receiptPath",
            "Receipt path",
            &mut issues,
        );

        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].path, "$.scenePath");
        assert_eq!(issues[1].path, "$.receiptPath");
    }

    #[test]
    fn pixel_probe_failures_are_custom_errors() -> Result<(), NativeAppError> {
        let mut loaded = load_fixture(&fixture_path("hello-panel"))?;
        loaded.manifest.pixel_probes[0].rgba = [0, 0, 0, 0];

        let result = assert_pixel_probes(&loaded);

        assert!(result.is_err());
        Ok(())
    }

    #[test]
    fn parses_check_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--check"),
            OsString::from("fixtures/render-everywhere/hello-panel"),
        ])?;

        assert_eq!(args.mode, NativeMode::Check);
        assert_eq!(args.frame_index, 0);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/hello-panel")
        );
        Ok(())
    }

    #[test]
    fn parses_smoke_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--smoke"),
            OsString::from("fixtures/render-everywhere/hello-panel"),
        ])?;

        assert_eq!(args.mode, NativeMode::Smoke);
        assert_eq!(args.frame_index, 0);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/hello-panel")
        );
        Ok(())
    }

    #[test]
    fn parses_bunny_check_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--bunny-check"),
            OsString::from("fixtures/render-everywhere/assets/stanford-bunny"),
        ])?;

        assert_eq!(args.mode, NativeMode::BunnyCheck);
        assert_eq!(args.frame_index, 0);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/assets/stanford-bunny")
        );
        Ok(())
    }

    #[test]
    fn parses_bunny_smoke_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--bunny-smoke"),
            OsString::from("fixtures/render-everywhere/assets/stanford-bunny"),
        ])?;

        assert_eq!(args.mode, NativeMode::BunnySmoke);
        assert_eq!(args.frame_index, 0);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/assets/stanford-bunny")
        );
        Ok(())
    }

    #[test]
    fn parses_bunny_window_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--bunny-window"),
            OsString::from("fixtures/render-everywhere/assets/stanford-bunny"),
        ])?;

        assert_eq!(args.mode, NativeMode::BunnyWindow);
        assert_eq!(args.frame_index, 0);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/assets/stanford-bunny")
        );
        Ok(())
    }

    #[test]
    fn parses_bunny_fixed_frame_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--bunny-smoke"),
            OsString::from("--frame"),
            OsString::from("60"),
            OsString::from("fixtures/render-everywhere/assets/stanford-bunny"),
        ])?;

        assert_eq!(args.mode, NativeMode::BunnySmoke);
        assert_eq!(args.frame_index, 60);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/assets/stanford-bunny")
        );
        Ok(())
    }

    #[test]
    fn rejects_invalid_bunny_fixed_frame_arguments() {
        let result = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--bunny-check"),
            OsString::from("--frame"),
            OsString::from("-1"),
            OsString::from("fixtures/render-everywhere/assets/stanford-bunny"),
        ]);

        assert!(result.is_err());
    }

    fn output_text(output: &[u8]) -> String {
        String::from_utf8_lossy(output).into_owned()
    }

    fn fixture_path(path: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere")
            .join(path)
    }
}
