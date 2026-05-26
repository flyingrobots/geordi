//! Native Rust harness for the Geordi render-everywhere fixture.

pub mod bunny;

use geordi_ir::{
    GEORDI_CORE_PROFILE, GEORDI_IR_VERSION, GEORDI_NUMERIC_PROFILE, GeordiFontPackHashError,
    GeordiFontPackLoadError, GeordiIr, GeordiIrLoadError, GeordiIrValidationError,
    GeordiStrictTextFixtureLoadError, GeordiStrictTextFixtureManifest,
    GeordiStrictTextFixtureReceipt, GeordiStrictTextFixtureReceiptError,
    GeordiStrictTextFixtureValidationIssue, GeordiStrictTextOutlineEvidencePack,
    create_geordi_strict_text_fixture_receipt, geordi_sha256_from_bytes,
    load_geordi_font_pack_manifest, load_geordi_ir, load_geordi_strict_text_fixture_manifest,
    load_geordi_strict_text_outline_evidence_pack, validate_geordi_font_pack_hashes,
    validate_geordi_ir, validate_geordi_strict_text_fixture_manifest,
    validate_geordi_strict_text_font_references,
};
use geordi_renderer::{
    GeordiRenderError, GeordiRuntimeUnsupportedProfileError, GeordiStrictTextOutlineRenderReport,
    GeordiStrictTextRenderError, RenderedImage, assert_native_runtime_profile,
    render_geordi_to_image, render_strict_text_outline_glyphs_to_image,
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
const STRICT_TEXT_FIXTURE_ROOT_FROM_REPO: &str = "fixtures/render-everywhere/strict-text";
const STRICT_TEXT_FIXTURE_SUFFIX: &str = ".strict-text.geordi.json";
const STRICT_TEXT_OUTLINE_EVIDENCE_SUFFIX: &str = ".outline-evidence.geordi.json";
const STRICT_TEXT_PROBE_POLICY_SUFFIX: &str = ".probe-policy.geordi.json";
const STRICT_TEXT_PROBE_POLICY_VERSION: &str = "geordi-strict-text-probe-policy/1";
const STRICT_TEXT_PROBE_ANTI_ALIAS_EDGE_POLICY: &str =
    "edge-probes-are-non-stable-and-must-not-block";
const STRICT_TEXT_BOUNDS_SOURCE_OUTLINE_EVIDENCE: &str =
    "fixture-glyph-origins-plus-outline-evidence-bounds-floor-ceil-inclusive/1";
const STRICT_TEXT_SEMANTIC_TEXT_ROLE: &str = "non-rendering metadata; pixels follow glyph evidence";
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
        NativeMode::StrictTextReject => {
            let rejection = reject_strict_text_fixture(&args.fixture_dir)?;
            write_strict_text_rejection_summary(&mut io::stdout().lock(), &rejection)?;
            Ok(())
        }
        NativeMode::StrictTextSmoke => {
            let loaded = load_strict_text_fixture(
                &args.fixture_dir,
                args.strict_text_evidence_path.as_deref(),
            )?;
            write_strict_text_fixture_summary(&mut io::stdout().lock(), &loaded)?;
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
    StrictTextReject,
    StrictTextSmoke,
    Window,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct NativeArgs {
    fixture_dir: PathBuf,
    frame_index: u64,
    mode: NativeMode,
    strict_text_evidence_path: Option<PathBuf>,
}

impl NativeArgs {
    fn parse(args: impl IntoIterator<Item = OsString>) -> Result<Self, NativeArgsError> {
        let values = args.into_iter().skip(1).collect::<Vec<_>>();
        match values.as_slice() {
            [flag, fixture_dir] if flag == OsStr::new("--bunny-check") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::BunnyCheck,
                strict_text_evidence_path: None,
            }),
            [flag, fixture_dir] if flag == OsStr::new("--bunny-smoke") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::BunnySmoke,
                strict_text_evidence_path: None,
            }),
            [flag, fixture_dir] if flag == OsStr::new("--bunny-window") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::BunnyWindow,
                strict_text_evidence_path: None,
            }),
            [flag, fixture_path] if flag == OsStr::new("--strict-text-reject") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_path),
                frame_index: 0,
                mode: NativeMode::StrictTextReject,
                strict_text_evidence_path: None,
            }),
            [flag, fixture_path] if flag == OsStr::new("--strict-text-smoke") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_path),
                frame_index: 0,
                mode: NativeMode::StrictTextSmoke,
                strict_text_evidence_path: None,
            }),
            [flag, evidence_flag, evidence_path, fixture_path]
                if flag == OsStr::new("--strict-text-smoke")
                    && evidence_flag == OsStr::new("--evidence") =>
            {
                Ok(Self {
                    fixture_dir: PathBuf::from(fixture_path),
                    frame_index: 0,
                    mode: NativeMode::StrictTextSmoke,
                    strict_text_evidence_path: Some(PathBuf::from(evidence_path)),
                })
            }
            [flag, frame_flag, frame_index, fixture_dir]
                if flag == OsStr::new("--bunny-check") && frame_flag == OsStr::new("--frame") =>
            {
                Ok(Self {
                    fixture_dir: PathBuf::from(fixture_dir),
                    frame_index: parse_frame_index(frame_index)?,
                    mode: NativeMode::BunnyCheck,
                    strict_text_evidence_path: None,
                })
            }
            [flag, frame_flag, frame_index, fixture_dir]
                if flag == OsStr::new("--bunny-smoke") && frame_flag == OsStr::new("--frame") =>
            {
                Ok(Self {
                    fixture_dir: PathBuf::from(fixture_dir),
                    frame_index: parse_frame_index(frame_index)?,
                    mode: NativeMode::BunnySmoke,
                    strict_text_evidence_path: None,
                })
            }
            [flag, fixture_dir] if flag == OsStr::new("--check") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::Check,
                strict_text_evidence_path: None,
            }),
            [flag, fixture_dir] if flag == OsStr::new("--smoke") => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::Smoke,
                strict_text_evidence_path: None,
            }),
            [fixture_dir] => Ok(Self {
                fixture_dir: PathBuf::from(fixture_dir),
                frame_index: 0,
                mode: NativeMode::Window,
                strict_text_evidence_path: None,
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

#[derive(Debug)]
struct LoadedStrictTextFixture {
    evidence_path: PathBuf,
    fixture_path: PathBuf,
    image: RenderedImage,
    metadata: NativeStrictTextMetadataReport,
    probe_policy: NativeStrictTextProbePolicyReport,
    probes: Vec<NativeStrictTextProbeReport>,
    smoke: NativeStrictTextSmokeReport,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct NativeStrictTextMetadataReport {
    command_count: usize,
    draw_glyph_count: usize,
    evidence_hash: String,
    evidence_kind: String,
    evidence_pack_id: String,
    fixture_hash: String,
    fixture_id: String,
    font_pack_hash: String,
    font_pack_path: String,
    glyph_count: usize,
    glyph_run_hash: String,
    line_box_hash: String,
    position_encoding: String,
    renderer_name: &'static str,
    semantic_text_affects_pixels: bool,
    semantic_text_language: String,
    semantic_text_role: &'static str,
    semantic_text_source: String,
    text_profile: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct NativeStrictTextSmokeReport {
    max_x: usize,
    max_y: usize,
    min_x: usize,
    min_y: usize,
    nonblank_pixel_count: usize,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
enum NativeStrictTextProbeExpectation {
    #[serde(rename = "fill")]
    Fill,
    #[serde(rename = "transparent")]
    Transparent,
}

impl NativeStrictTextProbeExpectation {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Fill => "fill",
            Self::Transparent => "transparent",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
enum NativeStrictTextProbeTolerance {
    #[serde(rename = "alpha-zero")]
    AlphaZero,
    #[serde(rename = "exact-fill-rgba")]
    ExactFillRgba,
}

impl NativeStrictTextProbeTolerance {
    const fn as_str(self) -> &'static str {
        match self {
            Self::AlphaZero => "alpha-zero",
            Self::ExactFillRgba => "exact-fill-rgba",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
enum NativeStrictTextProbeStability {
    #[serde(rename = "background-outside-glyph-bounds")]
    BackgroundOutsideGlyphBounds,
    #[serde(rename = "interior-fill-away-from-edge")]
    InteriorFillAwayFromEdge,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct NativeStrictTextProbe {
    coordinate_source: String,
    expectation: NativeStrictTextProbeExpectation,
    id: String,
    purpose: String,
    stability: NativeStrictTextProbeStability,
    tolerance: NativeStrictTextProbeTolerance,
    x: usize,
    y: usize,
}

impl NativeStrictTextProbe {
    #[cfg(test)]
    fn fill(id: &str, x: usize, y: usize) -> Self {
        Self {
            coordinate_source: "test".to_owned(),
            expectation: NativeStrictTextProbeExpectation::Fill,
            id: id.to_owned(),
            purpose: "test".to_owned(),
            stability: NativeStrictTextProbeStability::InteriorFillAwayFromEdge,
            tolerance: NativeStrictTextProbeTolerance::ExactFillRgba,
            x,
            y,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct NativeStrictTextProbeReport {
    actual: [u8; 4],
    expectation: NativeStrictTextProbeExpectation,
    id: String,
    tolerance: NativeStrictTextProbeTolerance,
    x: usize,
    y: usize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct NativeStrictTextProbePolicy {
    allowed_nonblank_bounds: NativeStrictTextPixelBounds,
    anti_alias_edge_policy: String,
    bounds_source: String,
    canvas: NativeStrictTextProbePolicyCanvas,
    evidence_pack_id: String,
    evidence_pack_path: String,
    fill_rgba: [u8; 4],
    fixture_id: String,
    fixture_path: String,
    id: String,
    nonclaim: String,
    probe_policy_version: String,
    probes: Vec<NativeStrictTextProbe>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct NativeStrictTextPixelBounds {
    max_x: usize,
    max_y: usize,
    min_x: usize,
    min_y: usize,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct NativeStrictTextProbePolicyCanvas {
    height: usize,
    width: usize,
}

#[derive(Clone, Debug)]
struct NativeStrictTextProbePolicyReport {
    allowed_nonblank_bounds: NativeStrictTextPixelBounds,
    bounds_source: String,
    hash: String,
    id: String,
    path: PathBuf,
    version: String,
}

#[derive(Debug)]
struct NativeStrictTextFixtureRejection {
    path: PathBuf,
    issues: Vec<GeordiStrictTextFixtureValidationIssue>,
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
    FontPackHash(GeordiFontPackHashError),
    FontPackLoad(GeordiFontPackLoadError),
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
    StrictTextAccepted(NativeStrictTextFixtureAcceptedError),
    StrictTextBounds(NativeStrictTextBoundsError),
    StrictTextLoad(GeordiStrictTextFixtureLoadError),
    StrictTextPath(NativeStrictTextPathError),
    StrictTextProbe(NativeStrictTextProbeError),
    StrictTextProbePolicyLoad(NativeStrictTextProbePolicyLoadError),
    StrictTextProbePolicyParse(NativeStrictTextProbePolicyParseError),
    StrictTextProbePolicyValidation(NativeStrictTextProbePolicyValidationError),
    StrictTextReceipt(GeordiStrictTextFixtureReceiptError),
    StrictTextRender(GeordiStrictTextRenderError),
    StrictTextSmoke(NativeStrictTextSmokeError),
    StrictTextValidation(geordi_ir::GeordiStrictTextFixtureValidationError),
    StrictTextOutlineEvidenceLoad(geordi_ir::GeordiStrictTextOutlineEvidenceLoadError),
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
            Self::FontPackHash(source) => Some(source),
            Self::FontPackLoad(source) => Some(source),
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
            Self::StrictTextAccepted(source) => Some(source),
            Self::StrictTextBounds(source) => Some(source),
            Self::StrictTextLoad(source) => Some(source),
            Self::StrictTextPath(source) => Some(source),
            Self::StrictTextProbe(source) => Some(source),
            Self::StrictTextProbePolicyLoad(source) => Some(source),
            Self::StrictTextProbePolicyParse(source) => Some(source),
            Self::StrictTextProbePolicyValidation(source) => Some(source),
            Self::StrictTextReceipt(source) => Some(source),
            Self::StrictTextRender(source) => Some(source),
            Self::StrictTextSmoke(source) => Some(source),
            Self::StrictTextValidation(source) => Some(source),
            Self::StrictTextOutlineEvidenceLoad(source) => Some(source),
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

impl From<GeordiFontPackHashError> for NativeAppError {
    fn from(error: GeordiFontPackHashError) -> Self {
        Self::FontPackHash(error)
    }
}

impl From<GeordiFontPackLoadError> for NativeAppError {
    fn from(error: GeordiFontPackLoadError) -> Self {
        Self::FontPackLoad(error)
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

impl From<NativeStrictTextFixtureAcceptedError> for NativeAppError {
    fn from(error: NativeStrictTextFixtureAcceptedError) -> Self {
        Self::StrictTextAccepted(error)
    }
}

impl From<NativeStrictTextBoundsError> for NativeAppError {
    fn from(error: NativeStrictTextBoundsError) -> Self {
        Self::StrictTextBounds(error)
    }
}

impl From<GeordiStrictTextFixtureLoadError> for NativeAppError {
    fn from(error: GeordiStrictTextFixtureLoadError) -> Self {
        Self::StrictTextLoad(error)
    }
}

impl From<NativeStrictTextPathError> for NativeAppError {
    fn from(error: NativeStrictTextPathError) -> Self {
        Self::StrictTextPath(error)
    }
}

impl From<GeordiStrictTextRenderError> for NativeAppError {
    fn from(error: GeordiStrictTextRenderError) -> Self {
        Self::StrictTextRender(error)
    }
}

impl From<NativeStrictTextProbeError> for NativeAppError {
    fn from(error: NativeStrictTextProbeError) -> Self {
        Self::StrictTextProbe(error)
    }
}

impl From<NativeStrictTextProbePolicyLoadError> for NativeAppError {
    fn from(error: NativeStrictTextProbePolicyLoadError) -> Self {
        Self::StrictTextProbePolicyLoad(error)
    }
}

impl From<NativeStrictTextProbePolicyParseError> for NativeAppError {
    fn from(error: NativeStrictTextProbePolicyParseError) -> Self {
        Self::StrictTextProbePolicyParse(error)
    }
}

impl From<NativeStrictTextProbePolicyValidationError> for NativeAppError {
    fn from(error: NativeStrictTextProbePolicyValidationError) -> Self {
        Self::StrictTextProbePolicyValidation(error)
    }
}

impl From<GeordiStrictTextFixtureReceiptError> for NativeAppError {
    fn from(error: GeordiStrictTextFixtureReceiptError) -> Self {
        Self::StrictTextReceipt(error)
    }
}

impl From<NativeStrictTextSmokeError> for NativeAppError {
    fn from(error: NativeStrictTextSmokeError) -> Self {
        Self::StrictTextSmoke(error)
    }
}

impl From<geordi_ir::GeordiStrictTextFixtureValidationError> for NativeAppError {
    fn from(error: geordi_ir::GeordiStrictTextFixtureValidationError) -> Self {
        Self::StrictTextValidation(error)
    }
}

impl From<geordi_ir::GeordiStrictTextOutlineEvidenceLoadError> for NativeAppError {
    fn from(error: geordi_ir::GeordiStrictTextOutlineEvidenceLoadError) -> Self {
        Self::StrictTextOutlineEvidenceLoad(error)
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
            "Usage: native-render-everywhere [--check|--smoke|--bunny-check|--bunny-smoke|--bunny-window|--strict-text-reject|--strict-text-smoke [--evidence <outline-evidence>]] [--frame <index>] <fixture-dir-or-strict-text-fixture>",
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
struct NativeStrictTextFixtureAcceptedError {
    path: PathBuf,
}

impl NativeStrictTextFixtureAcceptedError {
    const fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl Display for NativeStrictTextFixtureAcceptedError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native strict text fixture rejection failed because {} was accepted",
            self.path.display()
        )
    }
}

impl Error for NativeStrictTextFixtureAcceptedError {}

#[derive(Debug)]
struct NativeStrictTextBoundsError {
    allowed: NativeStrictTextPixelBounds,
    actual: NativeStrictTextPixelBounds,
    fixture_id: String,
}

impl NativeStrictTextBoundsError {
    fn new(
        fixture_id: &str,
        actual: NativeStrictTextPixelBounds,
        allowed: NativeStrictTextPixelBounds,
    ) -> Self {
        Self {
            allowed,
            actual,
            fixture_id: fixture_id.to_owned(),
        }
    }
}

impl Display for NativeStrictTextBoundsError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native strict text nonblank bounds failed for {} actual {},{}..{},{} allowed {},{}..{},{}",
            self.fixture_id,
            self.actual.min_x,
            self.actual.min_y,
            self.actual.max_x,
            self.actual.max_y,
            self.allowed.min_x,
            self.allowed.min_y,
            self.allowed.max_x,
            self.allowed.max_y
        )
    }
}

impl Error for NativeStrictTextBoundsError {}

#[derive(Debug)]
struct NativeStrictTextPathError {
    message: &'static str,
    path: PathBuf,
}

impl NativeStrictTextPathError {
    fn new(path: impl Into<PathBuf>, message: &'static str) -> Self {
        Self {
            message,
            path: path.into(),
        }
    }
}

impl Display for NativeStrictTextPathError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native strict text fixture path failed for {}: {}",
            self.path.display(),
            self.message
        )
    }
}

impl Error for NativeStrictTextPathError {}

#[derive(Debug)]
struct NativeStrictTextSmokeError {
    source: NativeStrictTextSmokeErrorSource,
}

#[derive(Debug)]
enum NativeStrictTextSmokeErrorSource {
    Blank { height: usize, width: usize },
    PixelRead { x: usize, y: usize },
}

impl NativeStrictTextSmokeError {
    const fn blank(width: usize, height: usize) -> Self {
        Self {
            source: NativeStrictTextSmokeErrorSource::Blank { height, width },
        }
    }

    const fn pixel_read(x: usize, y: usize) -> Self {
        Self {
            source: NativeStrictTextSmokeErrorSource::PixelRead { x, y },
        }
    }
}

impl Display for NativeStrictTextSmokeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self.source {
            NativeStrictTextSmokeErrorSource::Blank { height, width } => write!(
                formatter,
                "Native strict text smoke failed because {width}x{height} output was blank"
            ),
            NativeStrictTextSmokeErrorSource::PixelRead { x, y } => write!(
                formatter,
                "Native strict text smoke failed because pixel {x},{y} could not be read"
            ),
        }
    }
}

impl Error for NativeStrictTextSmokeError {}

#[derive(Debug)]
struct NativeStrictTextProbeError {
    actual: Option<[u8; 4]>,
    expectation: NativeStrictTextProbeExpectation,
    fixture_id: String,
    probe_id: String,
    x: usize,
    y: usize,
}

impl NativeStrictTextProbeError {
    fn new(fixture_id: &str, probe: &NativeStrictTextProbe, actual: Option<[u8; 4]>) -> Self {
        Self {
            actual,
            expectation: probe.expectation,
            fixture_id: fixture_id.to_owned(),
            probe_id: probe.id.clone(),
            x: probe.x,
            y: probe.y,
        }
    }
}

impl Display for NativeStrictTextProbeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native strict text probe failed for {}:{} at {},{} expected {} actual {:?}",
            self.fixture_id,
            self.probe_id,
            self.x,
            self.y,
            self.expectation.as_str(),
            self.actual
        )
    }
}

impl Error for NativeStrictTextProbeError {}

#[derive(Debug)]
struct NativeStrictTextProbePolicyLoadError {
    path: PathBuf,
    source: io::Error,
}

impl NativeStrictTextProbePolicyLoadError {
    const fn new(path: PathBuf, source: io::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeStrictTextProbePolicyLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native strict text probe policy load failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeStrictTextProbePolicyLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
struct NativeStrictTextProbePolicyParseError {
    path: PathBuf,
    source: serde_json::Error,
}

impl NativeStrictTextProbePolicyParseError {
    const fn new(path: PathBuf, source: serde_json::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeStrictTextProbePolicyParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native strict text probe policy parse failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeStrictTextProbePolicyParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
struct NativeStrictTextProbePolicyValidationError {
    issues: Vec<NativeStrictTextProbePolicyValidationIssue>,
}

impl NativeStrictTextProbePolicyValidationError {
    const fn new(issues: Vec<NativeStrictTextProbePolicyValidationIssue>) -> Self {
        Self { issues }
    }
}

impl Display for NativeStrictTextProbePolicyValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(issue) = self.issues.first() {
            write!(
                formatter,
                "Native strict text probe policy validation failed at {}: {}",
                issue.path, issue.message
            )
        } else {
            formatter.write_str("Native strict text probe policy validation failed")
        }
    }
}

impl Error for NativeStrictTextProbePolicyValidationError {}

#[derive(Debug)]
struct NativeStrictTextProbePolicyValidationIssue {
    message: String,
    path: String,
}

impl NativeStrictTextProbePolicyValidationIssue {
    fn new(path: &str, message: &str) -> Self {
        Self {
            message: message.to_owned(),
            path: path.to_owned(),
        }
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

fn reject_strict_text_fixture(
    path: &Path,
) -> Result<NativeStrictTextFixtureRejection, NativeAppError> {
    let manifest = load_geordi_strict_text_fixture_manifest(path)?;

    match validate_geordi_strict_text_fixture_manifest(&manifest) {
        Ok(()) => Err(NativeStrictTextFixtureAcceptedError::new(path.to_path_buf()).into()),
        Err(error) => Ok(NativeStrictTextFixtureRejection {
            path: path.to_path_buf(),
            issues: error.issues().to_vec(),
        }),
    }
}

fn load_strict_text_fixture(
    fixture_argument: &Path,
    evidence_argument: Option<&Path>,
) -> Result<LoadedStrictTextFixture, NativeAppError> {
    let fixture_path = resolve_strict_text_argument_path(fixture_argument)?;
    let fixture = load_geordi_strict_text_fixture_manifest(&fixture_path)?;
    validate_geordi_strict_text_fixture_manifest(&fixture)?;
    let fixture_repo_path = repository_relative_path(&fixture_path)?;
    let receipt = create_geordi_strict_text_fixture_receipt(repository_root(), &fixture_repo_path)?;

    let font_pack_path = resolve_repo_relative_path(&fixture.font_pack_path)?;
    let font_pack = load_geordi_font_pack_manifest(&font_pack_path)?;
    validate_geordi_font_pack_hashes(&font_pack, repository_root())?;
    validate_geordi_strict_text_font_references(&fixture, &font_pack)?;

    let evidence_path = match evidence_argument {
        Some(path) => resolve_strict_text_argument_path(path)?,
        None => derive_strict_text_outline_evidence_path(&fixture_path)?,
    };
    let evidence = load_geordi_strict_text_outline_evidence_pack(&evidence_path)?;
    let evidence_bounds = strict_text_evidence_pixel_bounds(&fixture, &evidence);
    let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence)?;
    let metadata =
        create_strict_text_metadata_report(&fixture, &evidence_path, receipt, result.report)?;
    let smoke = assert_strict_text_visible(&result.image)?;
    let probe_policy_path = derive_strict_text_probe_policy_path(&fixture_path)?;
    let (probe_policy, probe_policy_report) = load_strict_text_probe_policy(&probe_policy_path)?;
    validate_strict_text_probe_policy(
        &probe_policy,
        &metadata,
        &fixture_repo_path,
        &repository_relative_path(&evidence_path)?,
        evidence_bounds,
        &result.image,
    )?;
    assert_strict_text_bounds_inside_policy(
        &metadata.fixture_id,
        &smoke,
        probe_policy.allowed_nonblank_bounds,
    )?;
    let probes = assert_strict_text_pixel_probes(
        &metadata.fixture_id,
        &result.image,
        probe_policy.fill_rgba,
        &probe_policy.probes,
    )?;

    Ok(LoadedStrictTextFixture {
        evidence_path,
        fixture_path,
        image: result.image,
        metadata,
        probe_policy: probe_policy_report,
        probes,
        smoke,
    })
}

fn create_strict_text_metadata_report(
    fixture: &GeordiStrictTextFixtureManifest,
    evidence_path: &Path,
    receipt: GeordiStrictTextFixtureReceipt,
    render_report: GeordiStrictTextOutlineRenderReport,
) -> Result<NativeStrictTextMetadataReport, NativeAppError> {
    let evidence_bytes = load_artifact_bytes(evidence_path)?;

    Ok(NativeStrictTextMetadataReport {
        command_count: render_report.command_count,
        draw_glyph_count: render_report.draw_glyph_count,
        evidence_hash: geordi_sha256_from_bytes(&evidence_bytes),
        evidence_kind: render_report.evidence_kind,
        evidence_pack_id: render_report.evidence_pack_id,
        fixture_hash: receipt.fixture_hash,
        fixture_id: render_report.fixture_id,
        font_pack_hash: receipt.font_pack_hash,
        font_pack_path: receipt.font_pack_path,
        glyph_count: render_report.glyph_count,
        glyph_run_hash: receipt.glyph_run_hash,
        line_box_hash: receipt.line_box_hash,
        position_encoding: receipt.position_encoding_profile,
        renderer_name: render_report.renderer_name,
        semantic_text_affects_pixels: receipt.semantic_text_affects_pixels,
        semantic_text_language: fixture.semantic_text.language.clone(),
        semantic_text_role: STRICT_TEXT_SEMANTIC_TEXT_ROLE,
        semantic_text_source: fixture.semantic_text.source.clone(),
        text_profile: render_report.text_profile,
    })
}

fn load_strict_text_probe_policy(
    path: &Path,
) -> Result<
    (
        NativeStrictTextProbePolicy,
        NativeStrictTextProbePolicyReport,
    ),
    NativeAppError,
> {
    let bytes = fs::read(path)
        .map_err(|error| NativeStrictTextProbePolicyLoadError::new(path.to_path_buf(), error))?;
    let policy = serde_json::from_slice::<NativeStrictTextProbePolicy>(&bytes)
        .map_err(|error| NativeStrictTextProbePolicyParseError::new(path.to_path_buf(), error))?;
    let report = NativeStrictTextProbePolicyReport {
        allowed_nonblank_bounds: policy.allowed_nonblank_bounds,
        bounds_source: policy.bounds_source.clone(),
        hash: geordi_sha256_from_bytes(&bytes),
        id: policy.id.clone(),
        path: path.to_path_buf(),
        version: policy.probe_policy_version.clone(),
    };

    Ok((policy, report))
}

fn strict_text_evidence_pixel_bounds(
    fixture: &GeordiStrictTextFixtureManifest,
    evidence: &GeordiStrictTextOutlineEvidencePack,
) -> Option<NativeStrictTextPixelBounds> {
    let evidence_by_glyph_id = evidence
        .glyphs
        .iter()
        .map(|glyph| (glyph.glyph_id, glyph))
        .collect::<std::collections::BTreeMap<_, _>>();
    let mut max_x = None::<usize>;
    let mut max_y = None::<usize>;
    let mut min_x = None::<usize>;
    let mut min_y = None::<usize>;

    for run in &fixture.glyph_runs {
        for glyph in &run.glyphs {
            let glyph_evidence = evidence_by_glyph_id.get(&glyph.glyph_id)?;
            if !glyph_evidence.draws {
                continue;
            }

            let left = glyph
                .x
                .checked_add(glyph.x_offset)?
                .checked_add(glyph_evidence.bounds.x)?;
            let top = glyph
                .y
                .checked_add(glyph.y_offset)?
                .checked_add(glyph_evidence.bounds.y)?;
            let right = left.checked_add(glyph_evidence.bounds.width)?;
            let bottom = top.checked_add(glyph_evidence.bounds.height)?;
            let glyph_min_x = fixed_floor_to_pixel(left)?;
            let glyph_min_y = fixed_floor_to_pixel(top)?;
            let glyph_max_x = fixed_ceil_to_inclusive_pixel(right)?;
            let glyph_max_y = fixed_ceil_to_inclusive_pixel(bottom)?;

            min_x = Some(min_x.map_or(glyph_min_x, |current| current.min(glyph_min_x)));
            min_y = Some(min_y.map_or(glyph_min_y, |current| current.min(glyph_min_y)));
            max_x = Some(max_x.map_or(glyph_max_x, |current| current.max(glyph_max_x)));
            max_y = Some(max_y.map_or(glyph_max_y, |current| current.max(glyph_max_y)));
        }
    }

    Some(NativeStrictTextPixelBounds {
        max_x: max_x?,
        max_y: max_y?,
        min_x: min_x?,
        min_y: min_y?,
    })
}

fn fixed_floor_to_pixel(value: i64) -> Option<usize> {
    usize::try_from(value.div_euclid(64)).ok()
}

fn fixed_ceil_to_inclusive_pixel(value: i64) -> Option<usize> {
    let quotient = value.div_euclid(64);
    let remainder = value.rem_euclid(64);
    let ceiling = if remainder == 0 {
        quotient
    } else {
        quotient.checked_add(1)?
    };

    usize::try_from(ceiling.checked_sub(1)?).ok()
}

fn validate_strict_text_probe_policy(
    policy: &NativeStrictTextProbePolicy,
    metadata: &NativeStrictTextMetadataReport,
    fixture_repo_path: &str,
    evidence_repo_path: &str,
    evidence_bounds: Option<NativeStrictTextPixelBounds>,
    image: &RenderedImage,
) -> Result<(), NativeStrictTextProbePolicyValidationError> {
    let mut issues = Vec::new();

    push_strict_text_probe_policy_literal_issue(
        &policy.probe_policy_version,
        STRICT_TEXT_PROBE_POLICY_VERSION,
        "$.probePolicyVersion",
        "Strict text probe policy version",
        &mut issues,
    );
    push_strict_text_probe_policy_literal_issue(
        &policy.anti_alias_edge_policy,
        STRICT_TEXT_PROBE_ANTI_ALIAS_EDGE_POLICY,
        "$.antiAliasEdgePolicy",
        "Strict text probe policy anti-alias edge policy",
        &mut issues,
    );
    push_strict_text_probe_policy_literal_issue(
        &policy.bounds_source,
        STRICT_TEXT_BOUNDS_SOURCE_OUTLINE_EVIDENCE,
        "$.boundsSource",
        "Strict text probe policy bounds source",
        &mut issues,
    );
    push_strict_text_probe_policy_literal_issue(
        &policy.fixture_id,
        &metadata.fixture_id,
        "$.fixtureId",
        "Strict text probe policy fixture id",
        &mut issues,
    );
    push_strict_text_probe_policy_literal_issue(
        &policy.fixture_path,
        fixture_repo_path,
        "$.fixturePath",
        "Strict text probe policy fixture path",
        &mut issues,
    );
    push_strict_text_probe_policy_literal_issue(
        &policy.evidence_pack_id,
        &metadata.evidence_pack_id,
        "$.evidencePackId",
        "Strict text probe policy evidence pack id",
        &mut issues,
    );
    push_strict_text_probe_policy_literal_issue(
        &policy.evidence_pack_path,
        evidence_repo_path,
        "$.evidencePackPath",
        "Strict text probe policy evidence pack path",
        &mut issues,
    );

    if policy.id.is_empty() {
        push_strict_text_probe_policy_issue(
            &mut issues,
            "$.id",
            "Strict text probe policy id must be non-empty",
        );
    }
    if policy.nonclaim.is_empty() {
        push_strict_text_probe_policy_issue(
            &mut issues,
            "$.nonclaim",
            "Strict text probe policy nonclaim must be non-empty",
        );
    }
    if policy.canvas.width != image.width() {
        push_strict_text_probe_policy_issue(
            &mut issues,
            "$.canvas.width",
            "Strict text probe policy canvas width must match rendered image",
        );
    }
    if policy.canvas.height != image.height() {
        push_strict_text_probe_policy_issue(
            &mut issues,
            "$.canvas.height",
            "Strict text probe policy canvas height must match rendered image",
        );
    }
    validate_strict_text_probe_policy_allowed_bounds(
        policy.allowed_nonblank_bounds,
        evidence_bounds,
        image,
        &mut issues,
    );

    validate_strict_text_probe_policy_probes(policy, image, &mut issues);

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeStrictTextProbePolicyValidationError::new(issues))
    }
}

fn validate_strict_text_probe_policy_allowed_bounds(
    allowed: NativeStrictTextPixelBounds,
    evidence_bounds: Option<NativeStrictTextPixelBounds>,
    image: &RenderedImage,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) {
    if allowed.min_x > allowed.max_x {
        push_strict_text_probe_policy_issue(
            issues,
            "$.allowedNonblankBounds",
            "Strict text probe policy allowed nonblank bounds minX must be <= maxX",
        );
    }
    if allowed.min_y > allowed.max_y {
        push_strict_text_probe_policy_issue(
            issues,
            "$.allowedNonblankBounds",
            "Strict text probe policy allowed nonblank bounds minY must be <= maxY",
        );
    }
    if allowed.max_x >= image.width() {
        push_strict_text_probe_policy_issue(
            issues,
            "$.allowedNonblankBounds.maxX",
            "Strict text probe policy allowed nonblank bounds maxX must be inside the canvas",
        );
    }
    if allowed.max_y >= image.height() {
        push_strict_text_probe_policy_issue(
            issues,
            "$.allowedNonblankBounds.maxY",
            "Strict text probe policy allowed nonblank bounds maxY must be inside the canvas",
        );
    }
    match evidence_bounds {
        Some(bounds) if allowed == bounds => {}
        Some(_bounds) => push_strict_text_probe_policy_issue(
            issues,
            "$.allowedNonblankBounds",
            "Strict text probe policy allowed nonblank bounds must match outline evidence bounds",
        ),
        None => push_strict_text_probe_policy_issue(
            issues,
            "$.allowedNonblankBounds",
            "Strict text probe policy allowed nonblank bounds could not be derived from evidence",
        ),
    }
}

fn validate_strict_text_probe_policy_probes(
    policy: &NativeStrictTextProbePolicy,
    image: &RenderedImage,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) {
    if policy.probes.is_empty() {
        push_strict_text_probe_policy_issue(
            issues,
            "$.probes",
            "Strict text probe policy probes must not be empty",
        );
        return;
    }

    let mut seen_ids = std::collections::BTreeSet::new();
    let mut fill_count = 0_usize;
    let mut transparent_count = 0_usize;
    for (index, probe) in policy.probes.iter().enumerate() {
        let path = format!("$.probes[{index}]");
        let (is_fill, is_transparent) =
            validate_strict_text_probe_policy_probe(probe, &path, image, &mut seen_ids, issues);
        fill_count += usize::from(is_fill);
        transparent_count += usize::from(is_transparent);
    }

    if fill_count == 0 {
        push_strict_text_probe_policy_issue(
            issues,
            "$.probes",
            "Strict text probe policy must include at least one fill probe",
        );
    }
    if transparent_count == 0 {
        push_strict_text_probe_policy_issue(
            issues,
            "$.probes",
            "Strict text probe policy must include at least one transparent probe",
        );
    }
}

fn validate_strict_text_probe_policy_probe<'a>(
    probe: &'a NativeStrictTextProbe,
    path: &str,
    image: &RenderedImage,
    seen_ids: &mut std::collections::BTreeSet<&'a str>,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) -> (bool, bool) {
    validate_strict_text_probe_policy_probe_metadata(probe, path, image, seen_ids, issues);
    match probe.expectation {
        NativeStrictTextProbeExpectation::Fill => {
            validate_strict_text_probe_policy_fill_probe(probe, path, issues);
            (true, false)
        }
        NativeStrictTextProbeExpectation::Transparent => {
            validate_strict_text_probe_policy_transparent_probe(probe, path, issues);
            (false, true)
        }
    }
}

fn validate_strict_text_probe_policy_probe_metadata<'a>(
    probe: &'a NativeStrictTextProbe,
    path: &str,
    image: &RenderedImage,
    seen_ids: &mut std::collections::BTreeSet<&'a str>,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) {
    if probe.id.is_empty() {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.id"),
            "Strict text probe policy probe id must be non-empty",
        );
    } else if !seen_ids.insert(probe.id.as_str()) {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.id"),
            "Strict text probe policy probe id must not be duplicated",
        );
    }
    if probe.purpose.is_empty() {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.purpose"),
            "Strict text probe policy probe purpose must be non-empty",
        );
    }
    if probe.coordinate_source.is_empty() {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.coordinateSource"),
            "Strict text probe policy probe coordinate source must be non-empty",
        );
    }
    if probe.x >= image.width() {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.x"),
            "Strict text probe policy probe x must be inside the canvas",
        );
    }
    if probe.y >= image.height() {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.y"),
            "Strict text probe policy probe y must be inside the canvas",
        );
    }
}

fn validate_strict_text_probe_policy_fill_probe(
    probe: &NativeStrictTextProbe,
    path: &str,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) {
    if probe.tolerance != NativeStrictTextProbeTolerance::ExactFillRgba {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.tolerance"),
            "Strict text fill probes must use exact-fill-rgba tolerance",
        );
    }
    if probe.stability != NativeStrictTextProbeStability::InteriorFillAwayFromEdge {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.stability"),
            "Strict text fill probes must be interior-fill-away-from-edge",
        );
    }
}

fn validate_strict_text_probe_policy_transparent_probe(
    probe: &NativeStrictTextProbe,
    path: &str,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) {
    if probe.tolerance != NativeStrictTextProbeTolerance::AlphaZero {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.tolerance"),
            "Strict text transparent probes must use alpha-zero tolerance",
        );
    }
    if probe.stability != NativeStrictTextProbeStability::BackgroundOutsideGlyphBounds {
        push_strict_text_probe_policy_issue(
            issues,
            &format!("{path}.stability"),
            "Strict text transparent probes must be background-outside-glyph-bounds",
        );
    }
}

fn push_strict_text_probe_policy_literal_issue(
    actual: &str,
    expected: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
) {
    if actual != expected {
        push_strict_text_probe_policy_issue(issues, path, &format!("{label} must be {expected}"));
    }
}

fn push_strict_text_probe_policy_issue(
    issues: &mut Vec<NativeStrictTextProbePolicyValidationIssue>,
    path: &str,
    message: &str,
) {
    issues.push(NativeStrictTextProbePolicyValidationIssue::new(
        path, message,
    ));
}

fn assert_strict_text_visible(
    image: &RenderedImage,
) -> Result<NativeStrictTextSmokeReport, NativeStrictTextSmokeError> {
    let mut count = 0_usize;
    let mut min_x = image.width();
    let mut min_y = image.height();
    let mut max_x = 0_usize;
    let mut max_y = 0_usize;

    for y in 0..image.height() {
        for x in 0..image.width() {
            let [red, green, blue, alpha] = image
                .pixel_at(x, y)
                .ok_or_else(|| NativeStrictTextSmokeError::pixel_read(x, y))?;
            if alpha > 0 && (red > 0 || green > 0 || blue > 0) {
                count += 1;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if count == 0 {
        return Err(NativeStrictTextSmokeError::blank(
            image.width(),
            image.height(),
        ));
    }

    Ok(NativeStrictTextSmokeReport {
        max_x,
        max_y,
        min_x,
        min_y,
        nonblank_pixel_count: count,
    })
}

fn assert_strict_text_bounds_inside_policy(
    fixture_id: &str,
    smoke: &NativeStrictTextSmokeReport,
    allowed: NativeStrictTextPixelBounds,
) -> Result<(), NativeStrictTextBoundsError> {
    let actual = NativeStrictTextPixelBounds {
        max_x: smoke.max_x,
        max_y: smoke.max_y,
        min_x: smoke.min_x,
        min_y: smoke.min_y,
    };
    if actual.min_x < allowed.min_x
        || actual.min_y < allowed.min_y
        || actual.max_x > allowed.max_x
        || actual.max_y > allowed.max_y
    {
        return Err(NativeStrictTextBoundsError::new(
            fixture_id, actual, allowed,
        ));
    }

    Ok(())
}

fn assert_strict_text_pixel_probes(
    fixture_id: &str,
    image: &RenderedImage,
    fill_rgba: [u8; 4],
    probes: &[NativeStrictTextProbe],
) -> Result<Vec<NativeStrictTextProbeReport>, NativeStrictTextProbeError> {
    let mut reports = Vec::with_capacity(probes.len());
    for probe in probes {
        let actual = image
            .pixel_at(probe.x, probe.y)
            .ok_or_else(|| NativeStrictTextProbeError::new(fixture_id, probe, None))?;
        let passes = match (probe.expectation, probe.tolerance) {
            (
                NativeStrictTextProbeExpectation::Fill,
                NativeStrictTextProbeTolerance::ExactFillRgba,
            ) => actual == fill_rgba,
            (
                NativeStrictTextProbeExpectation::Transparent,
                NativeStrictTextProbeTolerance::AlphaZero,
            ) => actual[3] == 0,
            _ => false,
        };
        if !passes {
            return Err(NativeStrictTextProbeError::new(
                fixture_id,
                probe,
                Some(actual),
            ));
        }
        reports.push(NativeStrictTextProbeReport {
            actual,
            expectation: probe.expectation,
            id: probe.id.clone(),
            tolerance: probe.tolerance,
            x: probe.x,
            y: probe.y,
        });
    }

    Ok(reports)
}

fn resolve_strict_text_argument_path(
    argument: &Path,
) -> Result<PathBuf, NativeStrictTextPathError> {
    let value = argument.to_str().ok_or_else(|| {
        NativeStrictTextPathError::new(argument, "path must be valid UTF-8 for fixture mode")
    })?;
    if value.is_empty() || !is_fixture_local_relative_path(value) {
        return Err(NativeStrictTextPathError::new(
            argument,
            "path must be relative and stay inside the strict text fixture root",
        ));
    }

    let relative_path = Path::new(value);
    let strict_text_root = Path::new(STRICT_TEXT_FIXTURE_ROOT_FROM_REPO);
    if relative_path.starts_with(strict_text_root) {
        Ok(repository_root().join(relative_path))
    } else {
        Ok(repository_root().join(strict_text_root).join(relative_path))
    }
}

fn resolve_repo_relative_path(value: &str) -> Result<PathBuf, NativeStrictTextPathError> {
    if value.is_empty() || !is_fixture_local_relative_path(value) {
        return Err(NativeStrictTextPathError::new(
            PathBuf::from(value),
            "repository path must be relative and fixture-local",
        ));
    }

    Ok(repository_root().join(value))
}

fn repository_relative_path(path: &Path) -> Result<String, NativeStrictTextPathError> {
    let root = repository_root();
    let relative = path.strip_prefix(&root).map_err(|_error| {
        NativeStrictTextPathError::new(path, "path must stay inside the repository root")
    })?;
    let value = relative.to_str().ok_or_else(|| {
        NativeStrictTextPathError::new(path, "path must be valid UTF-8 for fixture mode")
    })?;
    if value.is_empty() || !is_fixture_local_relative_path(value) {
        return Err(NativeStrictTextPathError::new(
            path,
            "repository path must be relative and fixture-local",
        ));
    }

    Ok(value.to_owned())
}

fn derive_strict_text_outline_evidence_path(
    fixture_path: &Path,
) -> Result<PathBuf, NativeStrictTextPathError> {
    let file_name = fixture_path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| {
            NativeStrictTextPathError::new(
                fixture_path,
                "strict text fixture file name must be valid UTF-8",
            )
        })?;
    let fixture_prefix = file_name
        .strip_suffix(STRICT_TEXT_FIXTURE_SUFFIX)
        .ok_or_else(|| {
            NativeStrictTextPathError::new(
                fixture_path,
                "strict text fixture file name must end with .strict-text.geordi.json",
            )
        })?;
    let evidence_file_name = format!("{fixture_prefix}{STRICT_TEXT_OUTLINE_EVIDENCE_SUFFIX}");

    Ok(fixture_path.with_file_name(evidence_file_name))
}

fn derive_strict_text_probe_policy_path(
    fixture_path: &Path,
) -> Result<PathBuf, NativeStrictTextPathError> {
    let file_name = fixture_path
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| {
            NativeStrictTextPathError::new(
                fixture_path,
                "strict text fixture file name must be valid UTF-8",
            )
        })?;
    let fixture_prefix = file_name
        .strip_suffix(STRICT_TEXT_FIXTURE_SUFFIX)
        .ok_or_else(|| {
            NativeStrictTextPathError::new(
                fixture_path,
                "strict text fixture file name must end with .strict-text.geordi.json",
            )
        })?;
    let probe_policy_file_name = format!("{fixture_prefix}{STRICT_TEXT_PROBE_POLICY_SUFFIX}");

    Ok(fixture_path.with_file_name(probe_policy_file_name))
}

fn repository_root() -> PathBuf {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    fs::canonicalize(&root).unwrap_or(root)
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

fn write_strict_text_rejection_summary(
    writer: &mut impl Write,
    rejection: &NativeStrictTextFixtureRejection,
) -> Result<(), NativeOutputError> {
    writeln!(writer, "Geordi native strict text fixture rejected")
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "rendererName={NATIVE_RENDERER_NAME}").map_err(NativeOutputError::new)?;
    writeln!(writer, "strictTextFixture={}", rejection.path.display())
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "rejected=true").map_err(NativeOutputError::new)?;
    for issue in &rejection.issues {
        writeln!(writer, "issue={}: {}", issue.path, issue.message)
            .map_err(NativeOutputError::new)?;
    }
    Ok(())
}

fn write_strict_text_fixture_summary(
    writer: &mut impl Write,
    loaded: &LoadedStrictTextFixture,
) -> Result<(), NativeOutputError> {
    let report = &loaded.metadata;

    writeln!(writer, "Geordi native strict text fixture loaded").map_err(NativeOutputError::new)?;
    writeln!(writer, "rendererName={}", report.renderer_name).map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "strictTextFixture={}",
        loaded.fixture_path.display()
    )
    .map_err(NativeOutputError::new)?;
    writeln!(writer, "outlineEvidence={}", loaded.evidence_path.display())
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "fixtureId={}", report.fixture_id).map_err(NativeOutputError::new)?;
    writeln!(writer, "fixtureHash={}", report.fixture_hash).map_err(NativeOutputError::new)?;
    writeln!(writer, "fontPackPath={}", report.font_pack_path).map_err(NativeOutputError::new)?;
    writeln!(writer, "fontPackHash={}", report.font_pack_hash).map_err(NativeOutputError::new)?;
    writeln!(writer, "glyphRunHash={}", report.glyph_run_hash).map_err(NativeOutputError::new)?;
    writeln!(writer, "lineBoxHash={}", report.line_box_hash).map_err(NativeOutputError::new)?;
    writeln!(writer, "evidencePackId={}", report.evidence_pack_id)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "evidenceKind={}", report.evidence_kind).map_err(NativeOutputError::new)?;
    writeln!(writer, "evidenceHash={}", report.evidence_hash).map_err(NativeOutputError::new)?;
    writeln!(writer, "textProfile={}", report.text_profile).map_err(NativeOutputError::new)?;
    writeln!(writer, "positionEncoding={}", report.position_encoding)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "glyphCount={}", report.glyph_count).map_err(NativeOutputError::new)?;
    writeln!(writer, "drawGlyphCount={}", report.draw_glyph_count)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "commandCount={}", report.command_count).map_err(NativeOutputError::new)?;
    writeln!(writer, "semanticTextSource={}", report.semantic_text_source)
        .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "semanticTextLanguage={}",
        report.semantic_text_language
    )
    .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "semanticTextAffectsPixels={}",
        report.semantic_text_affects_pixels
    )
    .map_err(NativeOutputError::new)?;
    writeln!(writer, "semanticTextRole={}", report.semantic_text_role)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "probePolicy={}", loaded.probe_policy.path.display())
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "probePolicyId={}", loaded.probe_policy.id).map_err(NativeOutputError::new)?;
    writeln!(writer, "probePolicyVersion={}", loaded.probe_policy.version)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "probePolicyHash={}", loaded.probe_policy.hash)
        .map_err(NativeOutputError::new)?;
    writeln!(writer, "boundsSource={}", loaded.probe_policy.bounds_source)
        .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "allowedNonblankBounds={},{}..{},{}",
        loaded.probe_policy.allowed_nonblank_bounds.min_x,
        loaded.probe_policy.allowed_nonblank_bounds.min_y,
        loaded.probe_policy.allowed_nonblank_bounds.max_x,
        loaded.probe_policy.allowed_nonblank_bounds.max_y
    )
    .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "canvas={}x{}",
        loaded.image.width(),
        loaded.image.height()
    )
    .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "nonblankPixels={}",
        loaded.smoke.nonblank_pixel_count
    )
    .map_err(NativeOutputError::new)?;
    writeln!(
        writer,
        "nonblankBounds={},{}..{},{}",
        loaded.smoke.min_x, loaded.smoke.min_y, loaded.smoke.max_x, loaded.smoke.max_y
    )
    .map_err(NativeOutputError::new)?;
    writeln!(writer, "bounds=passed").map_err(NativeOutputError::new)?;
    for probe in &loaded.probes {
        writeln!(
            writer,
            "probe={} expected={} tolerance={} x={} y={} rgba={},{},{},{}",
            probe.id,
            probe.expectation.as_str(),
            probe.tolerance.as_str(),
            probe.x,
            probe.y,
            probe.actual[0],
            probe.actual[1],
            probe.actual[2],
            probe.actual[3]
        )
        .map_err(NativeOutputError::new)?;
    }
    writeln!(writer, "rendered=true").map_err(NativeOutputError::new)?;
    writeln!(writer, "smoke=passed").map_err(NativeOutputError::new)
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
        NativeAppError, NativeArgs, NativeMode, NativeStrictTextProbe, RenderFixtureSource,
        assert_pixel_probes, assert_strict_text_bounds_inside_policy,
        assert_strict_text_pixel_probes, assert_strict_text_visible, load_fixture, load_manifest,
        load_receipt, load_strict_text_fixture, load_strict_text_probe_policy,
        reject_strict_text_fixture, resolve_strict_text_argument_path, run_smoke,
        validate_manifest_path, validate_receipt_matches_manifest, validate_scene_artifact_hash,
        validate_strict_text_probe_policy, write_fixture_summary,
        write_strict_text_fixture_summary, write_strict_text_rejection_summary,
    };
    use geordi_ir::{
        load_geordi_strict_text_fixture_manifest, load_geordi_strict_text_outline_evidence_pack,
    };
    use geordi_renderer::render_strict_text_outline_glyphs_to_image;
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
    fn strict_text_reject_mode_rejects_committed_unsupported_fixture() -> Result<(), NativeAppError>
    {
        let rejection = reject_strict_text_fixture(&strict_text_fixture_path(
            "failures/unsupported-runtime-shaping.strict-text.geordi.json",
        ))?;
        let mut output = Vec::new();

        write_strict_text_rejection_summary(&mut output, &rejection)?;

        assert!(rejection.issues.iter().any(|issue| {
            issue.path == "$.features[3]" && issue.message == "Strict text feature is not supported"
        }));
        let text = output_text(&output);
        assert!(text.contains("Geordi native strict text fixture rejected"));
        assert!(text.contains("rendererName=rust-software-rectangles"));
        assert!(text.contains("rejected=true"));
        assert!(text.contains("issue=$.features[3]: Strict text feature is not supported"));
        Ok(())
    }

    #[test]
    fn strict_text_reject_mode_fails_when_fixture_is_accepted() {
        let result =
            reject_strict_text_fixture(&strict_text_fixture_path("geordi.strict-text.geordi.json"));

        assert!(matches!(result, Err(NativeAppError::StrictTextAccepted(_))));
    }

    #[test]
    fn strict_text_smoke_mode_loads_renders_and_reports_fixture() -> Result<(), NativeAppError> {
        let loaded = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Option::<&Path>::None,
        )?;
        let mut output = Vec::new();

        write_strict_text_fixture_summary(&mut output, &loaded)?;

        assert_eq!(loaded.image.width(), 192);
        assert_eq!(loaded.image.height(), 64);
        assert_eq!(loaded.smoke.nonblank_pixel_count, 2092);
        assert_eq!(loaded.smoke.min_x, 2);
        assert_eq!(loaded.smoke.min_y, 13);
        assert_eq!(loaded.smoke.max_x, 175);
        assert_eq!(loaded.smoke.max_y, 47);
        assert_eq!(loaded.probes.len(), 8);
        let text = output_text(&output);
        assert!(text.contains("Geordi native strict text fixture loaded"));
        assert!(text.contains("rendererName=rust-software-outline-glyphs"));
        assert!(text.contains("fixtureId=render-everywhere:strict-text:geordi"));
        assert!(text.contains(
            "fixtureHash=sha256:e3686b463296e0e7b019d7b014537a300f8fe6949a9053cf7d62067a978bf8c0"
        ));
        assert!(text.contains(
            "fontPackPath=fixtures/render-everywhere/assets/fonts/font-pack.geordi.json"
        ));
        assert!(text.contains(
            "fontPackHash=sha256:1b7ad58b48a3ad0d1aff0736ef014783945dc0a472de1f14b48c4211eb53533d"
        ));
        assert!(text.contains(
            "glyphRunHash=sha256:7b7551d5d6698fa00854b98aa15eef22436974163e60861d5454b725a4d2f472"
        ));
        assert!(text.contains(
            "lineBoxHash=sha256:6d0b4e63bd04bd33e7213240a173f86fb478f23fa4cd505514c0b8af425f1e10"
        ));
        assert!(
            text.contains("evidencePackId=render-everywhere:strict-text:geordi:outline-evidence")
        );
        assert!(text.contains("evidenceKind=outlinePaths"));
        assert!(text.contains(
            "evidenceHash=sha256:218890095219e9ce6753f2fef177d629a43b571ec37f01635dc31ba3601b4af3"
        ));
        assert!(text.contains("textProfile=geordi-strict-positioned-glyph-run/1"));
        assert!(text.contains("positionEncoding=geordi-fixed-26.6/1"));
        assert!(text.contains("glyphCount=6"));
        assert!(text.contains("drawGlyphCount=6"));
        assert!(text.contains("semanticTextSource=GEORDI"));
        assert!(text.contains("semanticTextLanguage=en"));
        assert!(text.contains("semanticTextAffectsPixels=false"));
        assert!(
            text.contains("semanticTextRole=non-rendering metadata; pixels follow glyph evidence")
        );
        assert!(text.contains("probePolicyId=render-everywhere:strict-text:geordi:probe-policy"));
        assert!(text.contains("probePolicyVersion=geordi-strict-text-probe-policy/1"));
        assert!(text.contains(
            "probePolicyHash=sha256:af60398eef0c062a86b9ca0bffe32b782a629254177bfc2cebe3f97a270e1b33"
        ));
        assert!(text.contains(
            "boundsSource=fixture-glyph-origins-plus-outline-evidence-bounds-floor-ceil-inclusive/1"
        ));
        assert!(text.contains("allowedNonblankBounds=2,13..176,48"));
        assert!(text.contains("canvas=192x64"));
        assert!(text.contains("nonblankPixels=2092"));
        assert!(text.contains("nonblankBounds=2,13..175,47"));
        assert!(text.contains("bounds=passed"));
        assert!(
            text.contains("probe=text-background-top expected=transparent tolerance=alpha-zero x=100 y=5 rgba=0,0,0,0")
        );
        assert!(text.contains("probe=text-g-fill-top expected=fill tolerance=exact-fill-rgba x=12 y=15 rgba=17,24,39,255"));
        assert!(text.contains("probe=text-i-fill-mid expected=fill tolerance=exact-fill-rgba x=172 y=30 rgba=17,24,39,255"));
        assert!(
            text.contains(
                "probe=text-background-bottom expected=transparent tolerance=alpha-zero x=180 y=55 rgba=0,0,0,0"
            )
        );
        assert!(text.contains("rendered=true"));
        assert!(text.contains("smoke=passed"));
        Ok(())
    }

    #[test]
    fn strict_text_smoke_mode_fails_on_blank_output() -> Result<(), NativeAppError> {
        let fixture = load_geordi_strict_text_fixture_manifest(strict_text_fixture_path(
            "geordi.strict-text.geordi.json",
        ))?;
        let mut evidence = load_geordi_strict_text_outline_evidence_pack(
            strict_text_fixture_path("geordi.outline-evidence.geordi.json"),
        )?;
        for glyph in &mut evidence.glyphs {
            glyph.draws = false;
            glyph.commands.clear();
        }
        let rendered = render_strict_text_outline_glyphs_to_image(&fixture, &evidence)?;

        let result = assert_strict_text_visible(&rendered.image);

        assert!(matches!(
            result,
            Err(super::NativeStrictTextSmokeError { .. })
        ));
        Ok(())
    }

    #[test]
    fn strict_text_probe_failures_are_custom_errors() -> Result<(), NativeAppError> {
        let loaded = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Option::<&Path>::None,
        )?;
        let bad_probe = [NativeStrictTextProbe::fill("bad-fill", 100, 5)];

        let result = assert_strict_text_pixel_probes(
            &loaded.metadata.fixture_id,
            &loaded.image,
            [17, 24, 39, 255],
            &bad_probe,
        );

        assert!(matches!(
            result,
            Err(super::NativeStrictTextProbeError { .. })
        ));
        Ok(())
    }

    #[test]
    fn strict_text_bounds_failures_are_custom_errors() -> Result<(), NativeAppError> {
        let loaded = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Option::<&Path>::None,
        )?;

        let result = assert_strict_text_bounds_inside_policy(
            &loaded.metadata.fixture_id,
            &loaded.smoke,
            super::NativeStrictTextPixelBounds {
                max_x: 174,
                max_y: 46,
                min_x: 3,
                min_y: 14,
            },
        );

        assert!(matches!(
            result,
            Err(super::NativeStrictTextBoundsError { .. })
        ));
        Ok(())
    }

    #[test]
    fn strict_text_probe_policy_validation_failures_are_custom_errors() -> Result<(), NativeAppError>
    {
        let loaded = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Option::<&Path>::None,
        )?;
        let (mut policy, _) = load_strict_text_probe_policy(&strict_text_fixture_path(
            "geordi.probe-policy.geordi.json",
        ))?;
        policy.probes[0].stability =
            super::NativeStrictTextProbeStability::InteriorFillAwayFromEdge;

        let result = validate_strict_text_probe_policy(
            &policy,
            &loaded.metadata,
            "fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json",
            "fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json",
            Some(policy.allowed_nonblank_bounds),
            &loaded.image,
        );

        assert!(matches!(
            result,
            Err(super::NativeStrictTextProbePolicyValidationError { .. })
        ));
        Ok(())
    }

    #[test]
    fn strict_text_smoke_mode_fails_on_invalid_outline_evidence() {
        let result = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Some(Path::new(
                "failures/bad-outline-command.outline-evidence.geordi.json",
            )),
        );

        assert!(matches!(result, Err(NativeAppError::StrictTextRender(_))));
    }

    #[test]
    fn strict_text_smoke_mode_fails_on_missing_glyph_evidence() {
        let result = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Some(Path::new(
                "failures/missing-glyph-evidence.outline-evidence.geordi.json",
            )),
        );

        assert!(matches!(result, Err(NativeAppError::StrictTextRender(_))));
    }

    #[test]
    fn strict_text_smoke_mode_fails_on_unreferenced_glyph_evidence() {
        let result = load_strict_text_fixture(
            Path::new("geordi.strict-text.geordi.json"),
            Some(Path::new(
                "failures/unknown-glyph-evidence.outline-evidence.geordi.json",
            )),
        );

        assert!(matches!(result, Err(NativeAppError::StrictTextRender(_))));
    }

    #[test]
    fn strict_text_smoke_mode_rejects_escaping_fixture_paths() {
        let result =
            resolve_strict_text_argument_path(Path::new("../geordi.strict-text.geordi.json"));

        assert!(matches!(
            result,
            Err(super::NativeStrictTextPathError { .. })
        ));
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
    fn parses_strict_text_reject_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--strict-text-reject"),
            OsString::from(
                "fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json",
            ),
        ])?;

        assert_eq!(args.mode, NativeMode::StrictTextReject);
        assert_eq!(args.frame_index, 0);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from(
                "fixtures/render-everywhere/strict-text/failures/unsupported-runtime-shaping.strict-text.geordi.json"
            )
        );
        Ok(())
    }

    #[test]
    fn parses_strict_text_smoke_mode_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--strict-text-smoke"),
            OsString::from("fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json"),
        ])?;

        assert_eq!(args.mode, NativeMode::StrictTextSmoke);
        assert_eq!(args.frame_index, 0);
        assert_eq!(args.strict_text_evidence_path, None);
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json")
        );
        Ok(())
    }

    #[test]
    fn parses_strict_text_smoke_evidence_override_arguments() -> Result<(), NativeAppError> {
        let args = NativeArgs::parse([
            OsString::from("native-render-everywhere"),
            OsString::from("--strict-text-smoke"),
            OsString::from("--evidence"),
            OsString::from("geordi.outline-evidence.geordi.json"),
            OsString::from("geordi.strict-text.geordi.json"),
        ])?;

        assert_eq!(args.mode, NativeMode::StrictTextSmoke);
        assert_eq!(
            args.strict_text_evidence_path,
            Some(PathBuf::from("geordi.outline-evidence.geordi.json"))
        );
        assert_eq!(
            args.fixture_dir,
            PathBuf::from("geordi.strict-text.geordi.json")
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

    fn strict_text_fixture_path(path: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere/strict-text")
            .join(path)
    }
}
