//! Stanford bunny mesh rendering path for the native render-everywhere harness.

use geordi_mesh::{
    MeshAssetHashMismatchError, PlyMesh, PlyMeshParseError, assert_mesh_asset_sha256,
    parse_ascii_ply_triangle_mesh,
};
use minifb::{Key, Window, WindowOptions};
use serde::Deserialize;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::string::FromUtf8Error;
use std::time::Instant;

const BUNNY_FIXTURE_PATH: &str = "bunny.fixture.json";
const BUNNY_RENDERER_NAME: &str = "rust-software-wireframe-mesh";
const BUNNY_TRANSFORM_PROFILE: &str = "geordi-fixed-rate-rotation/1";
const BUNNY_FIXTURE_VERSION: &str = "geordi-mesh-render-fixture/1";
const BUNNY_ASSET_VERSION: &str = "geordi-mesh-asset/1";
const BUNNY_MESH_PROFILE: &str = "geordi-ascii-ply-triangle-mesh/1";
const BUNNY_HASH_PREFIX: &str = "sha256:";
const BUNNY_HASH_HEX_LENGTH: usize = 64;
const BUNNY_NUMERIC_PROFILE: &str = "geordi-finite-binary64/1";
const BUNNY_RUNTIME_REQUIREMENTS: [&str; 9] = [
    "geordi/core/1",
    "asset.mesh",
    "mesh.triangle",
    "transform.matrix4",
    "camera.perspective",
    "projection.perspective",
    "depth.z-buffer",
    "material.solid",
    "playback.fixed-rate-rotation",
];

/// Native bunny harness error boundary.
#[derive(Debug)]
pub enum NativeBunnyError {
    /// Mesh asset hash did not match the manifest.
    AssetHash(MeshAssetHashMismatchError),
    /// Mesh asset bytes could not be loaded.
    AssetLoad(NativeBunnyAssetLoadError),
    /// Mesh asset bytes were not UTF-8.
    AssetUtf8(NativeBunnyAssetUtf8Error),
    /// Mesh manifest could not be loaded.
    ManifestLoad(NativeBunnyManifestLoadError),
    /// Mesh manifest could not be parsed.
    ManifestParse(NativeBunnyManifestParseError),
    /// Mesh manifest failed local validation.
    ManifestValidation(NativeBunnyManifestValidationError),
    /// Mesh PLY source could not be parsed.
    MeshParse(PlyMeshParseError),
    /// Summary output failed.
    Output(NativeBunnyOutputError),
    /// Rendered image failed the smoke invariant.
    Smoke(NativeBunnySmokeError),
    /// Native bunny presentation window failed.
    Window(NativeBunnyWindowError),
}

impl Display for NativeBunnyError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native bunny harness failed")
    }
}

impl Error for NativeBunnyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::AssetHash(source) => Some(source),
            Self::AssetLoad(source) => Some(source),
            Self::AssetUtf8(source) => Some(source),
            Self::ManifestLoad(source) => Some(source),
            Self::ManifestParse(source) => Some(source),
            Self::ManifestValidation(source) => Some(source),
            Self::MeshParse(source) => Some(source),
            Self::Output(source) => Some(source),
            Self::Smoke(source) => Some(source),
            Self::Window(source) => Some(source),
        }
    }
}

impl From<MeshAssetHashMismatchError> for NativeBunnyError {
    fn from(error: MeshAssetHashMismatchError) -> Self {
        Self::AssetHash(error)
    }
}

impl From<NativeBunnyAssetLoadError> for NativeBunnyError {
    fn from(error: NativeBunnyAssetLoadError) -> Self {
        Self::AssetLoad(error)
    }
}

impl From<NativeBunnyAssetUtf8Error> for NativeBunnyError {
    fn from(error: NativeBunnyAssetUtf8Error) -> Self {
        Self::AssetUtf8(error)
    }
}

impl From<NativeBunnyManifestLoadError> for NativeBunnyError {
    fn from(error: NativeBunnyManifestLoadError) -> Self {
        Self::ManifestLoad(error)
    }
}

impl From<NativeBunnyManifestParseError> for NativeBunnyError {
    fn from(error: NativeBunnyManifestParseError) -> Self {
        Self::ManifestParse(error)
    }
}

impl From<NativeBunnyManifestValidationError> for NativeBunnyError {
    fn from(error: NativeBunnyManifestValidationError) -> Self {
        Self::ManifestValidation(error)
    }
}

impl From<PlyMeshParseError> for NativeBunnyError {
    fn from(error: PlyMeshParseError) -> Self {
        Self::MeshParse(error)
    }
}

impl From<NativeBunnyOutputError> for NativeBunnyError {
    fn from(error: NativeBunnyOutputError) -> Self {
        Self::Output(error)
    }
}

impl From<NativeBunnySmokeError> for NativeBunnyError {
    fn from(error: NativeBunnySmokeError) -> Self {
        Self::Smoke(error)
    }
}

impl From<NativeBunnyWindowError> for NativeBunnyError {
    fn from(error: NativeBunnyWindowError) -> Self {
        Self::Window(error)
    }
}

#[derive(Debug)]
/// Custom error for native bunny asset load failures.
pub struct NativeBunnyAssetLoadError {
    path: PathBuf,
    source: io::Error,
}

impl NativeBunnyAssetLoadError {
    const fn new(path: PathBuf, source: io::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeBunnyAssetLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native bunny asset load failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeBunnyAssetLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
/// Custom error for native bunny asset UTF-8 decode failures.
pub struct NativeBunnyAssetUtf8Error {
    path: PathBuf,
    source: FromUtf8Error,
}

impl NativeBunnyAssetUtf8Error {
    const fn new(path: PathBuf, source: FromUtf8Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeBunnyAssetUtf8Error {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native bunny asset UTF-8 decode failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeBunnyAssetUtf8Error {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
/// Custom error for native bunny manifest load failures.
pub struct NativeBunnyManifestLoadError {
    path: PathBuf,
    source: io::Error,
}

impl NativeBunnyManifestLoadError {
    const fn new(path: PathBuf, source: io::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeBunnyManifestLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native bunny manifest load failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeBunnyManifestLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
/// Custom error for native bunny manifest parse failures.
pub struct NativeBunnyManifestParseError {
    path: PathBuf,
    source: serde_json::Error,
}

impl NativeBunnyManifestParseError {
    const fn new(path: PathBuf, source: serde_json::Error) -> Self {
        Self { path, source }
    }
}

impl Display for NativeBunnyManifestParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Native bunny manifest parse failed: {}",
            self.path.display()
        )
    }
}

impl Error for NativeBunnyManifestParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
/// Custom error for native bunny manifest validation failures.
pub struct NativeBunnyManifestValidationError {
    issues: Vec<NativeBunnyManifestValidationIssue>,
}

impl NativeBunnyManifestValidationError {
    const fn new(issues: Vec<NativeBunnyManifestValidationIssue>) -> Self {
        Self { issues }
    }
}

impl Display for NativeBunnyManifestValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(issue) = self.issues.first() {
            write!(
                formatter,
                "Native bunny manifest validation failed at {}: {}",
                issue.path, issue.message
            )
        } else {
            formatter.write_str("Native bunny manifest validation failed")
        }
    }
}

impl Error for NativeBunnyManifestValidationError {}

#[derive(Debug)]
struct NativeBunnyManifestValidationIssue {
    path: String,
    message: String,
}

impl NativeBunnyManifestValidationIssue {
    fn new(path: &str, message: &str) -> Self {
        Self {
            path: path.to_owned(),
            message: message.to_owned(),
        }
    }
}

#[derive(Debug)]
/// Custom error for native bunny summary output failures.
pub struct NativeBunnyOutputError {
    source: io::Error,
}

impl NativeBunnyOutputError {
    const fn new(source: io::Error) -> Self {
        Self { source }
    }
}

impl Display for NativeBunnyOutputError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native bunny summary output failed")
    }
}

impl Error for NativeBunnyOutputError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

#[derive(Debug)]
/// Custom error for native bunny smoke invariant failures.
pub struct NativeBunnySmokeError;

impl Display for NativeBunnySmokeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native bunny smoke failed")
    }
}

impl Error for NativeBunnySmokeError {}

/// Custom error for native bunny presentation window failures.
#[derive(Debug)]
pub struct NativeBunnyWindowError {
    source: NativeBunnyWindowErrorSource,
}

#[derive(Debug)]
enum NativeBunnyWindowErrorSource {
    BufferSize,
    Window(minifb::Error),
}

impl NativeBunnyWindowError {
    const fn buffer_size() -> Self {
        Self {
            source: NativeBunnyWindowErrorSource::BufferSize,
        }
    }

    const fn window(source: minifb::Error) -> Self {
        Self {
            source: NativeBunnyWindowErrorSource::Window(source),
        }
    }
}

impl Display for NativeBunnyWindowError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Native bunny window failed")
    }
}

impl Error for NativeBunnyWindowError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            NativeBunnyWindowErrorSource::BufferSize => None,
            NativeBunnyWindowErrorSource::Window(source) => Some(source),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshFixtureManifest {
    asset_manifest_path: String,
    camera: BunnyMeshCamera,
    fixture_version: String,
    id: String,
    material: BunnyMeshMaterial,
    playback: BunnyMeshPlayback,
    projection: BunnyMeshProjection,
    runtime_profile: BunnyMeshRuntimeProfile,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshRuntimeProfile {
    numeric_profile: String,
    requires: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshCamera {
    coordinate_system: String,
    eye: [f64; 3],
    target: [f64; 3],
    up: [f64; 3],
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshProjection {
    far: f64,
    kind: String,
    near: f64,
    vertical_fov_radians: f64,
    viewport: BunnyMeshViewport,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshViewport {
    height: usize,
    width: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshMaterial {
    background_color: String,
    color: String,
    kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshPlayback {
    axis: [f64; 3],
    kind: String,
    radians_per_second: f64,
    sample_rate: u64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshAssetManifest {
    asset_path: String,
    asset_version: String,
    bounds: BunnyMeshAssetBounds,
    counts: BunnyMeshAssetCounts,
    face_property: String,
    format: BunnyMeshAssetFormat,
    id: String,
    mesh_profile: String,
    sha256: String,
    source: BunnyMeshAssetSource,
    vertex_properties: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshAssetBounds {
    max: [f64; 3],
    min: [f64; 3],
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshAssetCounts {
    faces: usize,
    vertices: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshAssetFormat {
    encoding: String,
    kind: String,
    version: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BunnyMeshAssetSource {
    attribution: String,
    retrieved: String,
    url: String,
}

/// Loaded native bunny fixture.
#[derive(Debug)]
pub struct LoadedBunnyFixture {
    fixture: BunnyMeshFixtureManifest,
    image: BunnyImage,
    mesh: PlyMesh,
    report: BunnyFrameReport,
    style: BunnyRenderStyle,
}

#[derive(Debug, Eq, PartialEq)]
struct BunnyImage {
    height: usize,
    rgba: Vec<u8>,
    width: usize,
}

impl BunnyImage {
    fn new(width: usize, height: usize, color: [u8; 4]) -> Self {
        let mut rgba = Vec::with_capacity(width * height * color.len());
        for _ in 0..(width * height) {
            rgba.extend_from_slice(&color);
        }

        Self {
            height,
            rgba,
            width,
        }
    }

    fn set_pixel(&mut self, x: i32, y: i32, color: [u8; 4]) {
        let Ok(x) = usize::try_from(x) else {
            return;
        };
        let Ok(y) = usize::try_from(y) else {
            return;
        };
        if x >= self.width || y >= self.height {
            return;
        }

        let offset = ((y * self.width) + x) * color.len();
        self.rgba[offset..offset + color.len()].copy_from_slice(&color);
    }

    fn non_background_pixels(&self, background: [u8; 4]) -> usize {
        self.rgba
            .chunks_exact(background.len())
            .filter(|pixel| *pixel != background)
            .count()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct BunnyRenderStyle {
    background: [u8; 4],
    material: [u8; 4],
}

#[derive(Debug, PartialEq)]
struct BunnyFrameReport {
    angle_radians: f64,
    asset_hash: String,
    face_count: usize,
    frame_index: u64,
    normalized_axis: [f64; 3],
    seconds: f64,
    transform_profile: &'static str,
    vertex_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ProjectedPoint {
    visible: bool,
    x: f64,
    y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct CameraBasis {
    eye: [f64; 3],
    forward: [f64; 3],
    right: [f64; 3],
    up: [f64; 3],
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ProjectionContext {
    axis: [f64; 3],
    camera: CameraBasis,
    far: f64,
    focal_length: f64,
    height: f64,
    near: f64,
    width: f64,
}

/// Load and render one native bunny frame.
///
/// # Errors
///
/// Returns `NativeBunnyError` when manifest loading, validation, asset hashing, mesh parsing, or
/// rendering fails.
pub fn load_bunny_fixture(
    asset_dir: &Path,
    frame_index: u64,
) -> Result<LoadedBunnyFixture, NativeBunnyError> {
    let fixture_path = asset_dir.join(BUNNY_FIXTURE_PATH);
    let fixture = load_bunny_fixture_manifest(&fixture_path)?;
    validate_bunny_fixture_manifest(&fixture)?;
    let style = bunny_render_style(&fixture)?;

    let manifest_path = asset_dir.join(&fixture.asset_manifest_path);
    let manifest = load_bunny_manifest(&manifest_path)?;
    validate_bunny_manifest(&manifest)?;
    validate_bunny_fixture_matches_manifest(&fixture, &manifest)?;

    let asset_path = asset_dir.join(&manifest.asset_path);
    let asset_bytes = fs::read(&asset_path)
        .map_err(|error| NativeBunnyAssetLoadError::new(asset_path.clone(), error))?;
    let asset_hash = assert_mesh_asset_sha256(&asset_bytes, &manifest.sha256)?;
    let asset_source = String::from_utf8(asset_bytes)
        .map_err(|error| NativeBunnyAssetUtf8Error::new(asset_path, error))?;
    let mesh = parse_ascii_ply_triangle_mesh(&asset_source)?;
    validate_bunny_mesh_matches_manifest(&manifest, &mesh)?;

    let report = create_bunny_frame_report(frame_index, &asset_hash, &mesh, &fixture);
    let image = render_bunny_wireframe(&mesh, &fixture, style, report.angle_radians);

    Ok(LoadedBunnyFixture {
        fixture,
        image,
        mesh,
        report,
        style,
    })
}

/// Write the native bunny frame report.
///
/// # Errors
///
/// Returns `NativeBunnyError` when summary output fails.
pub fn write_bunny_summary(
    writer: &mut impl Write,
    loaded: &LoadedBunnyFixture,
) -> Result<(), NativeBunnyError> {
    writeln!(writer, "Geordi native bunny fixture loaded").map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "rendererName={BUNNY_RENDERER_NAME}").map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "fixtureId={}", loaded.fixture.id).map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "assetHash={}", loaded.report.asset_hash)
        .map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "vertices={}", loaded.report.vertex_count)
        .map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "faces={}", loaded.report.face_count).map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "frameIndex={}", loaded.report.frame_index)
        .map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "seconds={}", loaded.report.seconds).map_err(NativeBunnyOutputError::new)?;
    writeln!(writer, "angleRadians={}", loaded.report.angle_radians)
        .map_err(NativeBunnyOutputError::new)?;
    writeln!(
        writer,
        "normalizedAxis={},{},{}",
        loaded.report.normalized_axis[0],
        loaded.report.normalized_axis[1],
        loaded.report.normalized_axis[2]
    )
    .map_err(NativeBunnyOutputError::new)?;
    writeln!(
        writer,
        "transformProfile={}",
        loaded.report.transform_profile
    )
    .map_err(NativeBunnyOutputError::new)?;
    writeln!(
        writer,
        "cameraEye={},{},{}",
        loaded.fixture.camera.eye[0], loaded.fixture.camera.eye[1], loaded.fixture.camera.eye[2]
    )
    .map_err(NativeBunnyOutputError::new)?;
    writeln!(
        writer,
        "viewport={}x{}",
        loaded.fixture.projection.viewport.width, loaded.fixture.projection.viewport.height
    )
    .map_err(NativeBunnyOutputError::new)?;
    Ok(())
}

/// Run the fixed-frame native bunny smoke path.
///
/// # Errors
///
/// Returns `NativeBunnyError` when loading, rendering, summary output, or smoke validation fails.
pub fn run_bunny_smoke(
    writer: &mut impl Write,
    asset_dir: &Path,
    frame_index: u64,
) -> Result<(), NativeBunnyError> {
    let loaded = load_bunny_fixture(asset_dir, frame_index)?;
    write_bunny_summary(writer, &loaded)?;
    if loaded.image.non_background_pixels(loaded.style.background) == 0 {
        return Err(NativeBunnySmokeError.into());
    }

    writeln!(writer, "smoke=passed").map_err(NativeBunnyOutputError::new)?;
    Ok(())
}

/// Open the live native bunny presentation window.
///
/// # Errors
///
/// Returns `NativeBunnyError` when loading, rendering, buffer conversion, or window presentation
/// fails.
pub fn open_bunny_window(asset_dir: &Path) -> Result<(), NativeBunnyError> {
    let loaded = load_bunny_fixture(asset_dir, 0)?;
    let mut window = Window::new(
        &bunny_window_title(&loaded),
        loaded.image.width,
        loaded.image.height,
        WindowOptions::default(),
    )
    .map_err(NativeBunnyWindowError::window)?;
    let start = Instant::now();

    while window.is_open() && !window.is_key_down(Key::Escape) {
        let frame_index = bunny_frame_index_from_elapsed_ms(
            start.elapsed().as_millis(),
            loaded.fixture.playback.sample_rate,
        );
        let report = create_bunny_frame_report(
            frame_index,
            &loaded.report.asset_hash,
            &loaded.mesh,
            &loaded.fixture,
        );
        let image = render_bunny_wireframe(
            &loaded.mesh,
            &loaded.fixture,
            loaded.style,
            report.angle_radians,
        );
        let buffer = minifb_buffer(&image)?;
        window
            .update_with_buffer(&buffer, image.width, image.height)
            .map_err(NativeBunnyWindowError::window)?;
    }

    Ok(())
}

fn load_bunny_fixture_manifest(path: &Path) -> Result<BunnyMeshFixtureManifest, NativeBunnyError> {
    let source = fs::read_to_string(path)
        .map_err(|error| NativeBunnyManifestLoadError::new(path.to_path_buf(), error))?;

    serde_json::from_str(&source)
        .map_err(|error| NativeBunnyManifestParseError::new(path.to_path_buf(), error).into())
}

fn load_bunny_manifest(path: &Path) -> Result<BunnyMeshAssetManifest, NativeBunnyError> {
    let source = fs::read_to_string(path)
        .map_err(|error| NativeBunnyManifestLoadError::new(path.to_path_buf(), error))?;

    serde_json::from_str(&source)
        .map_err(|error| NativeBunnyManifestParseError::new(path.to_path_buf(), error).into())
}

fn validate_bunny_fixture_manifest(
    fixture: &BunnyMeshFixtureManifest,
) -> Result<(), NativeBunnyManifestValidationError> {
    let mut issues = Vec::new();
    validate_literal(
        &fixture.fixture_version,
        BUNNY_FIXTURE_VERSION,
        "$.fixtureVersion",
        "Fixture version",
        &mut issues,
    );
    validate_non_empty(&fixture.id, "$.id", "Fixture id", &mut issues);
    validate_relative_path(
        &fixture.asset_manifest_path,
        "$.assetManifestPath",
        "Asset manifest path",
        &mut issues,
    );
    validate_mesh_runtime_profile(&fixture.runtime_profile, &mut issues);
    validate_mesh_camera(&fixture.camera, &mut issues);
    validate_mesh_projection(&fixture.projection, &mut issues);
    validate_mesh_material(&fixture.material, &mut issues);
    validate_mesh_playback(&fixture.playback, &mut issues);

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeBunnyManifestValidationError::new(issues))
    }
}

fn validate_bunny_manifest(
    manifest: &BunnyMeshAssetManifest,
) -> Result<(), NativeBunnyManifestValidationError> {
    let mut issues = Vec::new();

    validate_literal(
        &manifest.asset_version,
        BUNNY_ASSET_VERSION,
        "$.assetVersion",
        "Asset version",
        &mut issues,
    );
    validate_non_empty(&manifest.id, "$.id", "Asset id", &mut issues);
    validate_literal(
        &manifest.mesh_profile,
        BUNNY_MESH_PROFILE,
        "$.meshProfile",
        "Mesh profile",
        &mut issues,
    );
    validate_relative_path(
        &manifest.asset_path,
        "$.assetPath",
        "Asset path",
        &mut issues,
    );
    validate_hash(&manifest.sha256, &mut issues);
    validate_format(&manifest.format, &mut issues);
    validate_counts(&manifest.counts, &mut issues);
    validate_bounds(&manifest.bounds, &mut issues);
    validate_source(&manifest.source, &mut issues);
    validate_vertex_properties(&manifest.vertex_properties, &mut issues);
    validate_literal(
        &manifest.face_property,
        "vertex_indices",
        "$.faceProperty",
        "Face property",
        &mut issues,
    );

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeBunnyManifestValidationError::new(issues))
    }
}

fn validate_bunny_mesh_matches_manifest(
    manifest: &BunnyMeshAssetManifest,
    mesh: &PlyMesh,
) -> Result<(), NativeBunnyManifestValidationError> {
    let mut issues = Vec::new();

    if mesh.vertices.len() != manifest.counts.vertices {
        push_issue(
            &mut issues,
            "$.counts.vertices",
            "Manifest vertex count must match the parsed mesh",
        );
    }
    if mesh.faces.len() != manifest.counts.faces {
        push_issue(
            &mut issues,
            "$.counts.faces",
            "Manifest face count must match the parsed mesh",
        );
    }
    if mesh.vertex_properties != manifest.vertex_properties {
        push_issue(
            &mut issues,
            "$.vertexProperties",
            "Manifest vertex properties must match the parsed mesh",
        );
    }
    if vector_bits(mesh.bounds.min) != vector_bits(manifest.bounds.min) {
        push_issue(
            &mut issues,
            "$.bounds.min",
            "Manifest minimum bounds must match the parsed mesh",
        );
    }
    if vector_bits(mesh.bounds.max) != vector_bits(manifest.bounds.max) {
        push_issue(
            &mut issues,
            "$.bounds.max",
            "Manifest maximum bounds must match the parsed mesh",
        );
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(NativeBunnyManifestValidationError::new(issues))
    }
}

fn validate_bunny_fixture_matches_manifest(
    fixture: &BunnyMeshFixtureManifest,
    manifest: &BunnyMeshAssetManifest,
) -> Result<(), NativeBunnyManifestValidationError> {
    if fixture.id == manifest.id {
        Ok(())
    } else {
        Err(NativeBunnyManifestValidationError::new(vec![
            NativeBunnyManifestValidationIssue::new(
                "$.id",
                "Fixture id must match the mesh asset manifest id",
            ),
        ]))
    }
}

fn create_bunny_frame_report(
    frame_index: u64,
    asset_hash: &str,
    mesh: &PlyMesh,
    fixture: &BunnyMeshFixtureManifest,
) -> BunnyFrameReport {
    let seconds = frame_index_to_seconds(frame_index, fixture.playback.sample_rate);
    BunnyFrameReport {
        angle_radians: seconds * fixture.playback.radians_per_second,
        asset_hash: asset_hash.to_owned(),
        face_count: mesh.faces.len(),
        frame_index,
        normalized_axis: normalize_vector3(fixture.playback.axis),
        seconds,
        transform_profile: BUNNY_TRANSFORM_PROFILE,
        vertex_count: mesh.vertices.len(),
    }
}

fn frame_index_to_seconds(frame_index: u64, sample_rate: u64) -> f64 {
    let frame = frame_index.to_string().parse::<f64>().unwrap_or(0.0);
    let rate = sample_rate.to_string().parse::<f64>().unwrap_or(1.0);
    frame / rate
}

fn bunny_frame_index_from_elapsed_ms(elapsed_ms: u128, sample_rate: u64) -> u64 {
    let frames = elapsed_ms.saturating_mul(u128::from(sample_rate)) / 1000;
    u64::try_from(frames).unwrap_or(u64::MAX)
}

fn render_bunny_wireframe(
    mesh: &PlyMesh,
    fixture: &BunnyMeshFixtureManifest,
    style: BunnyRenderStyle,
    angle_radians: f64,
) -> BunnyImage {
    let mut image = BunnyImage::new(
        fixture.projection.viewport.width,
        fixture.projection.viewport.height,
        style.background,
    );
    let context = projection_context(fixture);

    for face in &mesh.faces {
        let first = project_position(mesh.vertices[face[0]].position, context, angle_radians);
        let second = project_position(mesh.vertices[face[1]].position, context, angle_radians);
        let third = project_position(mesh.vertices[face[2]].position, context, angle_radians);
        draw_projected_edge(&mut image, style.material, first, second);
        draw_projected_edge(&mut image, style.material, second, third);
        draw_projected_edge(&mut image, style.material, third, first);
    }

    image
}

fn minifb_buffer(image: &BunnyImage) -> Result<Vec<u32>, NativeBunnyWindowError> {
    let mut buffer = Vec::with_capacity(
        image
            .width
            .checked_mul(image.height)
            .ok_or_else(NativeBunnyWindowError::buffer_size)?,
    );

    for rgba in image.rgba.chunks_exact(4) {
        let red = u32::from(rgba[0]);
        let green = u32::from(rgba[1]);
        let blue = u32::from(rgba[2]);
        buffer.push((red << 16) | (green << 8) | blue);
    }

    if buffer.is_empty() {
        return Err(NativeBunnyWindowError::buffer_size());
    }

    Ok(buffer)
}

fn bunny_window_title(loaded: &LoadedBunnyFixture) -> String {
    format!(
        "Geordi Native - {BUNNY_RENDERER_NAME} - {} - frame {}",
        loaded.fixture.id, loaded.report.frame_index
    )
}

fn draw_projected_edge(
    image: &mut BunnyImage,
    color: [u8; 4],
    first: ProjectedPoint,
    second: ProjectedPoint,
) {
    if !first.visible || !second.visible {
        return;
    }

    let Some(x0) = rounded_i32(first.x) else {
        return;
    };
    let Some(y0) = rounded_i32(first.y) else {
        return;
    };
    let Some(x1) = rounded_i32(second.x) else {
        return;
    };
    let Some(y1) = rounded_i32(second.y) else {
        return;
    };

    draw_line(image, color, x0, y0, x1, y1);
}

fn draw_line(
    image: &mut BunnyImage,
    color: [u8; 4],
    mut x0: i32,
    mut y0: i32,
    x1: i32,
    y1: i32,
) {
    let delta_x = (x1 - x0).abs();
    let step_x = if x0 < x1 { 1 } else { -1 };
    let delta_y = -(y1 - y0).abs();
    let step_y = if y0 < y1 { 1 } else { -1 };
    let mut error = delta_x + delta_y;

    loop {
        image.set_pixel(x0, y0, color);
        if x0 == x1 && y0 == y1 {
            break;
        }

        let twice_error = error.saturating_mul(2);
        if twice_error >= delta_y {
            error += delta_y;
            x0 += step_x;
        }
        if twice_error <= delta_x {
            error += delta_x;
            y0 += step_y;
        }
    }
}

fn project_position(
    position: [f64; 3],
    context: ProjectionContext,
    angle_radians: f64,
) -> ProjectedPoint {
    let rotated = rotate_around_axis(position, context.axis, angle_radians);
    let delta = subtract_vector3(rotated, context.camera.eye);
    let camera_x = dot_vector3(delta, context.camera.right);
    let camera_y = dot_vector3(delta, context.camera.up);
    let depth = dot_vector3(delta, context.camera.forward);

    if depth < context.near || depth > context.far {
        return ProjectedPoint {
            visible: false,
            x: 0.0,
            y: 0.0,
        };
    }

    let x_ndc = (context.focal_length * camera_x) / depth;
    let y_ndc = (context.focal_length * camera_y) / depth;

    ProjectedPoint {
        visible: true,
        x: x_ndc.midpoint(1.0) * context.width,
        y: (-y_ndc).midpoint(1.0) * context.height,
    }
}

fn projection_context(fixture: &BunnyMeshFixtureManifest) -> ProjectionContext {
    ProjectionContext {
        axis: normalize_vector3(fixture.playback.axis),
        camera: camera_basis(&fixture.camera),
        far: fixture.projection.far,
        focal_length: 1.0 / (fixture.projection.vertical_fov_radians / 2.0).tan(),
        height: usize_to_f64(fixture.projection.viewport.height),
        near: fixture.projection.near,
        width: usize_to_f64(fixture.projection.viewport.width),
    }
}

fn camera_basis(camera: &BunnyMeshCamera) -> CameraBasis {
    let forward = normalize_vector3(subtract_vector3(camera.target, camera.eye));
    let right = normalize_vector3(cross_vector3(forward, camera.up));
    let up = normalize_vector3(cross_vector3(right, forward));

    CameraBasis {
        eye: camera.eye,
        forward,
        right,
        up,
    }
}

fn rotate_around_axis(position: [f64; 3], axis: [f64; 3], angle_radians: f64) -> [f64; 3] {
    let [axis_x, axis_y, axis_z] = axis;
    let [x, y, z] = position;
    let cos = angle_radians.cos();
    let sin = angle_radians.sin();
    let one_minus_cos = 1.0 - cos;
    let dot = axis_z.mul_add(z, axis_x.mul_add(x, axis_y * y));
    let cross_x = axis_y.mul_add(z, -(axis_z * y));
    let cross_y = axis_z.mul_add(x, -(axis_x * z));
    let cross_z = axis_x.mul_add(y, -(axis_y * x));

    [
        (axis_x * dot).mul_add(one_minus_cos, x.mul_add(cos, cross_x * sin)),
        (axis_y * dot).mul_add(one_minus_cos, y.mul_add(cos, cross_y * sin)),
        (axis_z * dot).mul_add(one_minus_cos, z.mul_add(cos, cross_z * sin)),
    ]
}

fn normalize_vector3(vector: [f64; 3]) -> [f64; 3] {
    let length = vector[2]
        .mul_add(
            vector[2],
            vector[0].mul_add(vector[0], vector[1] * vector[1]),
        )
        .sqrt();
    [vector[0] / length, vector[1] / length, vector[2] / length]
}

fn subtract_vector3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    [
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2],
    ]
}

fn dot_vector3(left: [f64; 3], right: [f64; 3]) -> f64 {
    left[2].mul_add(right[2], left[0].mul_add(right[0], left[1] * right[1]))
}

fn cross_vector3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    [
        left[1].mul_add(right[2], -(left[2] * right[1])),
        left[2].mul_add(right[0], -(left[0] * right[2])),
        left[0].mul_add(right[1], -(left[1] * right[0])),
    ]
}

fn usize_to_f64(value: usize) -> f64 {
    value.to_string().parse::<f64>().unwrap_or(0.0)
}

const fn vector_bits(vector: [f64; 3]) -> [u64; 3] {
    [
        vector[0].to_bits(),
        vector[1].to_bits(),
        vector[2].to_bits(),
    ]
}

fn rounded_i32(value: f64) -> Option<i32> {
    if !value.is_finite() {
        return None;
    }

    format!("{value:.0}").parse::<i32>().ok()
}

fn bunny_render_style(
    fixture: &BunnyMeshFixtureManifest,
) -> Result<BunnyRenderStyle, NativeBunnyManifestValidationError> {
    Ok(BunnyRenderStyle {
        background: hex_color_rgba(&fixture.material.background_color, "$.material.backgroundColor")?,
        material: hex_color_rgba(&fixture.material.color, "$.material.color")?,
    })
}

fn hex_color_rgba(
    value: &str,
    path: &str,
) -> Result<[u8; 4], NativeBunnyManifestValidationError> {
    if !is_hex_color(value) {
        return Err(NativeBunnyManifestValidationError::new(vec![
            NativeBunnyManifestValidationIssue::new(path, "Color must be lowercase #rrggbb"),
        ]));
    }

    let red = u8::from_str_radix(&value[1..3], 16).map_err(|_| {
        NativeBunnyManifestValidationError::new(vec![NativeBunnyManifestValidationIssue::new(
            path,
            "Color red channel must be hexadecimal",
        )])
    })?;
    let green = u8::from_str_radix(&value[3..5], 16).map_err(|_| {
        NativeBunnyManifestValidationError::new(vec![NativeBunnyManifestValidationIssue::new(
            path,
            "Color green channel must be hexadecimal",
        )])
    })?;
    let blue = u8::from_str_radix(&value[5..7], 16).map_err(|_| {
        NativeBunnyManifestValidationError::new(vec![NativeBunnyManifestValidationIssue::new(
            path,
            "Color blue channel must be hexadecimal",
        )])
    })?;

    Ok([red, green, blue, 255])
}

fn validate_mesh_runtime_profile(
    runtime_profile: &BunnyMeshRuntimeProfile,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_literal(
        &runtime_profile.numeric_profile,
        BUNNY_NUMERIC_PROFILE,
        "$.runtimeProfile.numericProfile",
        "Numeric profile",
        issues,
    );
    if runtime_profile.requires.len() != BUNNY_RUNTIME_REQUIREMENTS.len() {
        push_issue(
            issues,
            "$.runtimeProfile.requires",
            "Runtime requirements must match the bunny fixture contract",
        );
        return;
    }

    for (index, expected) in BUNNY_RUNTIME_REQUIREMENTS.iter().enumerate() {
        if runtime_profile.requires[index] != *expected {
            push_issue(
                issues,
                &format!("$.runtimeProfile.requires[{index}]"),
                "Runtime requirement must match the bunny fixture contract",
            );
        }
    }
}

fn validate_mesh_camera(
    camera: &BunnyMeshCamera,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_literal(
        &camera.coordinate_system,
        "right-handed",
        "$.camera.coordinateSystem",
        "Camera coordinate system",
        issues,
    );
    validate_vector3(&camera.eye, "$.camera.eye", "Camera eye", issues);
    validate_vector3(&camera.target, "$.camera.target", "Camera target", issues);
    validate_vector3(&camera.up, "$.camera.up", "Camera up", issues);
    if vector_bits(camera.eye) == vector_bits(camera.target) {
        push_issue(
            issues,
            "$.camera.target",
            "Camera target must differ from camera eye",
        );
    }
    if is_zero_vector3(camera.up) {
        push_issue(issues, "$.camera.up", "Camera up must be non-zero");
    }
    let forward = subtract_vector3(camera.target, camera.eye);
    if is_zero_vector3(cross_vector3(forward, camera.up)) {
        push_issue(
            issues,
            "$.camera.up",
            "Camera up must not be parallel to view direction",
        );
    }
}

fn validate_mesh_projection(
    projection: &BunnyMeshProjection,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_literal(
        &projection.kind,
        "perspective",
        "$.projection.kind",
        "Projection kind",
        issues,
    );
    validate_positive_finite(
        projection.vertical_fov_radians,
        "$.projection.verticalFovRadians",
        "Projection vertical FOV",
        issues,
    );
    validate_positive_finite(projection.near, "$.projection.near", "Projection near", issues);
    validate_positive_finite(projection.far, "$.projection.far", "Projection far", issues);
    if projection.viewport.width == 0 {
        push_issue(
            issues,
            "$.projection.viewport.width",
            "Projection viewport width must be positive",
        );
    }
    if projection.viewport.height == 0 {
        push_issue(
            issues,
            "$.projection.viewport.height",
            "Projection viewport height must be positive",
        );
    }
}

fn validate_mesh_material(
    material: &BunnyMeshMaterial,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_literal(
        &material.kind,
        "solid",
        "$.material.kind",
        "Material kind",
        issues,
    );
    validate_hex_color(&material.color, "$.material.color", "Material color", issues);
    validate_hex_color(
        &material.background_color,
        "$.material.backgroundColor",
        "Material background color",
        issues,
    );
}

fn validate_mesh_playback(
    playback: &BunnyMeshPlayback,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_literal(
        &playback.kind,
        "fixed-rate-rotation",
        "$.playback.kind",
        "Playback kind",
        issues,
    );
    validate_vector3(&playback.axis, "$.playback.axis", "Playback axis", issues);
    if is_zero_vector3(playback.axis) {
        push_issue(issues, "$.playback.axis", "Playback axis must be non-zero");
    }
    validate_positive_finite(
        playback.radians_per_second,
        "$.playback.radiansPerSecond",
        "Playback radians per second",
        issues,
    );
    if playback.sample_rate == 0 {
        push_issue(
            issues,
            "$.playback.sampleRate",
            "Playback sample rate must be positive",
        );
    }
}

fn validate_format(
    format: &BunnyMeshAssetFormat,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_literal(
        &format.encoding,
        "ascii",
        "$.format.encoding",
        "Format encoding",
        issues,
    );
    validate_literal(&format.kind, "ply", "$.format.kind", "Format kind", issues);
    validate_literal(
        &format.version,
        "1.0",
        "$.format.version",
        "Format version",
        issues,
    );
}

fn validate_counts(
    counts: &BunnyMeshAssetCounts,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    if counts.vertices == 0 {
        push_issue(issues, "$.counts.vertices", "Vertex count must be positive");
    }
    if counts.faces == 0 {
        push_issue(issues, "$.counts.faces", "Face count must be positive");
    }
}

fn validate_bounds(
    bounds: &BunnyMeshAssetBounds,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    for axis in 0..3 {
        if !bounds.min[axis].is_finite() {
            push_issue(issues, "$.bounds.min", "Minimum bounds must be finite");
        }
        if !bounds.max[axis].is_finite() {
            push_issue(issues, "$.bounds.max", "Maximum bounds must be finite");
        }
        if bounds.min[axis] > bounds.max[axis] {
            push_issue(
                issues,
                "$.bounds",
                "Minimum bounds must be less than or equal to maximum bounds",
            );
        }
    }
}

fn validate_source(
    source: &BunnyMeshAssetSource,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_non_empty(
        &source.attribution,
        "$.source.attribution",
        "Source attribution",
        issues,
    );
    validate_non_empty(
        &source.retrieved,
        "$.source.retrieved",
        "Source retrieval date",
        issues,
    );
    validate_non_empty(&source.url, "$.source.url", "Source URL", issues);
}

fn validate_vertex_properties(
    properties: &[String],
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    let starts_with_position = properties
        .get(0..3)
        .is_some_and(|slice| slice == ["x", "y", "z"]);
    if !starts_with_position {
        push_issue(
            issues,
            "$.vertexProperties",
            "Vertex properties must begin with x, y, z",
        );
    }
}

fn validate_hash(hash: &str, issues: &mut Vec<NativeBunnyManifestValidationIssue>) {
    let digest = hash.strip_prefix(BUNNY_HASH_PREFIX);
    let valid = digest.is_some_and(|value| {
        value.len() == BUNNY_HASH_HEX_LENGTH
            && value
                .as_bytes()
                .iter()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
    });

    if !valid {
        push_issue(
            issues,
            "$.sha256",
            "Mesh asset hash must be a lowercase sha256 digest",
        );
    }
}

fn validate_relative_path(
    value: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    validate_non_empty(value, path, label, issues);

    if !is_fixture_local_relative_path(value) {
        push_issue(issues, path, "Path must be relative and fixture-local");
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

fn validate_vector3(
    vector: &[f64; 3],
    path: &str,
    label: &str,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    for value in vector {
        if !value.is_finite() {
            push_issue(issues, path, &format!("{label} must contain finite numbers"));
            return;
        }
    }
}

fn validate_positive_finite(
    value: f64,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    if !value.is_finite() || value <= 0.0 {
        push_issue(issues, path, &format!("{label} must be positive and finite"));
    }
}

fn validate_hex_color(
    value: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    if !is_hex_color(value) {
        push_issue(issues, path, &format!("{label} must be lowercase #rrggbb"));
    }
}

fn is_hex_color(value: &str) -> bool {
    let Some(hex) = value.strip_prefix('#') else {
        return false;
    };
    hex.len() == 6
        && hex
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

fn is_zero_vector3(vector: [f64; 3]) -> bool {
    vector_bits(vector) == [0.0_f64.to_bits(), 0.0_f64.to_bits(), 0.0_f64.to_bits()]
}

fn validate_non_empty(
    value: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    if value.is_empty() {
        push_issue(issues, path, &format!("{label} must not be empty"));
    }
}

fn validate_literal(
    value: &str,
    expected: &str,
    path: &str,
    label: &str,
    issues: &mut Vec<NativeBunnyManifestValidationIssue>,
) {
    if value != expected {
        push_issue(issues, path, &format!("{label} must be {expected}"));
    }
}

fn push_issue(issues: &mut Vec<NativeBunnyManifestValidationIssue>, path: &str, message: &str) {
    issues.push(NativeBunnyManifestValidationIssue::new(path, message));
}

#[cfg(test)]
mod tests {
    use super::{
        BUNNY_RENDERER_NAME, NativeBunnyError, bunny_frame_index_from_elapsed_ms,
        load_bunny_fixture, run_bunny_smoke, write_bunny_summary,
    };
    use std::path::{Path, PathBuf};

    #[test]
    fn loads_and_reports_the_static_bunny_frame() -> Result<(), NativeBunnyError> {
        let loaded = load_bunny_fixture(&bunny_path(), 0)?;
        let mut output = Vec::new();

        write_bunny_summary(&mut output, &loaded)?;

        let text = output_text(&output);
        assert!(text.contains("rendererName=rust-software-wireframe-mesh"));
        assert!(text.contains("fixtureId=render-everywhere:stanford-bunny"));
        assert!(text.contains(
            "assetHash=sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6"
        ));
        assert!(text.contains("vertices=1889"));
        assert!(text.contains("faces=3851"));
        assert!(text.contains("frameIndex=0"));
        assert!(text.contains("transformProfile=geordi-fixed-rate-rotation/1"));
        assert_eq!(loaded.report.vertex_count, 1889);
        assert_eq!(loaded.report.face_count, 3851);
        assert!(loaded.image.non_background_pixels(loaded.style.background) > 0);
        Ok(())
    }

    #[test]
    fn smoke_mode_checks_nonblank_bunny_output() -> Result<(), NativeBunnyError> {
        let mut output = Vec::new();

        run_bunny_smoke(&mut output, &bunny_path(), 0)?;

        let text = output_text(&output);
        assert!(text.contains(BUNNY_RENDERER_NAME));
        assert!(text.contains("smoke=passed"));
        Ok(())
    }

    #[test]
    fn smoke_mode_checks_nonzero_sampled_bunny_frames() -> Result<(), NativeBunnyError> {
        for frame_index in [15, 60] {
            let mut output = Vec::new();

            run_bunny_smoke(&mut output, &bunny_path(), frame_index)?;

            let text = output_text(&output);
            assert!(text.contains(&format!("frameIndex={frame_index}")));
            assert!(text.contains("smoke=passed"));
        }

        Ok(())
    }

    #[test]
    fn derives_the_static_frame_report() -> Result<(), NativeBunnyError> {
        let loaded = load_bunny_fixture(&bunny_path(), 15)?;

        let report = loaded.report;

        assert_eq!(report.frame_index, 15);
        assert!((report.seconds - 0.25).abs() < 0.000_000_001);
        assert!((report.angle_radians - (std::f64::consts::PI / 16.0)).abs() < 0.000_000_001);
        assert!((report.normalized_axis[0] - 0.486_664_263_392_287_6).abs() < 0.000_000_001);
        assert!((report.normalized_axis[1] - 0.811_107_105_653_812_6).abs() < 0.000_000_001);
        assert!((report.normalized_axis[2] - 0.324_442_842_261_525_03).abs() < 0.000_000_001);
        Ok(())
    }

    #[test]
    fn maps_host_elapsed_time_to_native_frame_indices() {
        assert_eq!(bunny_frame_index_from_elapsed_ms(0, 60), 0);
        assert_eq!(bunny_frame_index_from_elapsed_ms(249, 60), 14);
        assert_eq!(bunny_frame_index_from_elapsed_ms(250, 60), 15);
        assert_eq!(bunny_frame_index_from_elapsed_ms(1000, 60), 60);
    }

    fn output_text(output: &[u8]) -> String {
        String::from_utf8_lossy(output).into_owned()
    }

    fn bunny_path() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere/assets/stanford-bunny")
    }
}
