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

const BUNNY_MANIFEST_PATH: &str = "bunny.mesh.json";
const BUNNY_RENDERER_NAME: &str = "rust-software-wireframe-mesh";
const BUNNY_TRANSFORM_PROFILE: &str = "geordi-fixed-rate-rotation/1";
const BUNNY_ASSET_VERSION: &str = "geordi-mesh-asset/1";
const BUNNY_MESH_PROFILE: &str = "geordi-ascii-ply-triangle-mesh/1";
const BUNNY_HASH_PREFIX: &str = "sha256:";
const BUNNY_HASH_HEX_LENGTH: usize = 64;
const BUNNY_RENDER_WIDTH: usize = 512;
const BUNNY_RENDER_HEIGHT: usize = 512;
const BUNNY_BACKGROUND_RGBA: [u8; 4] = [17, 24, 39, 255];
const BUNNY_MATERIAL_RGBA: [u8; 4] = [209, 213, 219, 255];
const BUNNY_CAMERA_EYE: [f64; 3] = [0.0, 0.1, 0.35];
const BUNNY_VERTICAL_FOV_RADIANS: f64 = std::f64::consts::FRAC_PI_4;
const BUNNY_ROTATION_AXIS: [f64; 3] = [3.0, 5.0, 2.0];
const BUNNY_ROTATION_RADIANS_PER_SECOND: f64 = std::f64::consts::FRAC_PI_4;
const BUNNY_ROTATION_SAMPLE_RATE_MILLIS: u128 = 60;
const BUNNY_ROTATION_SAMPLE_RATE: f64 = 60.0;

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
    image: BunnyImage,
    manifest: BunnyMeshAssetManifest,
    mesh: PlyMesh,
    report: BunnyFrameReport,
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

    fn non_background_pixels(&self) -> usize {
        self.rgba
            .chunks_exact(BUNNY_BACKGROUND_RGBA.len())
            .filter(|pixel| *pixel != BUNNY_BACKGROUND_RGBA)
            .count()
    }
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
    let manifest_path = asset_dir.join(BUNNY_MANIFEST_PATH);
    let manifest = load_bunny_manifest(&manifest_path)?;
    validate_bunny_manifest(&manifest)?;

    let asset_path = asset_dir.join(&manifest.asset_path);
    let asset_bytes = fs::read(&asset_path)
        .map_err(|error| NativeBunnyAssetLoadError::new(asset_path.clone(), error))?;
    let asset_hash = assert_mesh_asset_sha256(&asset_bytes, &manifest.sha256)?;
    let asset_source = String::from_utf8(asset_bytes)
        .map_err(|error| NativeBunnyAssetUtf8Error::new(asset_path, error))?;
    let mesh = parse_ascii_ply_triangle_mesh(&asset_source)?;
    validate_bunny_mesh_matches_manifest(&manifest, &mesh)?;

    let report = create_bunny_frame_report(frame_index, &asset_hash, &mesh);
    let image = render_bunny_wireframe(&mesh, report.angle_radians);

    Ok(LoadedBunnyFixture {
        image,
        manifest,
        mesh,
        report,
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
    writeln!(writer, "fixtureId={}", loaded.manifest.id).map_err(NativeBunnyOutputError::new)?;
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
    writeln!(writer, "cameraEye=0,0.1,0.35").map_err(NativeBunnyOutputError::new)?;
    writeln!(
        writer,
        "viewport={BUNNY_RENDER_WIDTH}x{BUNNY_RENDER_HEIGHT}"
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
    if loaded.image.non_background_pixels() == 0 {
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
        BUNNY_RENDER_WIDTH,
        BUNNY_RENDER_HEIGHT,
        WindowOptions::default(),
    )
    .map_err(NativeBunnyWindowError::window)?;
    let start = Instant::now();

    while window.is_open() && !window.is_key_down(Key::Escape) {
        let frame_index = bunny_frame_index_from_elapsed_ms(start.elapsed().as_millis());
        let report =
            create_bunny_frame_report(frame_index, &loaded.report.asset_hash, &loaded.mesh);
        let image = render_bunny_wireframe(&loaded.mesh, report.angle_radians);
        let buffer = minifb_buffer(&image)?;
        window
            .update_with_buffer(&buffer, BUNNY_RENDER_WIDTH, BUNNY_RENDER_HEIGHT)
            .map_err(NativeBunnyWindowError::window)?;
    }

    Ok(())
}

fn load_bunny_manifest(path: &Path) -> Result<BunnyMeshAssetManifest, NativeBunnyError> {
    let source = fs::read_to_string(path)
        .map_err(|error| NativeBunnyManifestLoadError::new(path.to_path_buf(), error))?;

    serde_json::from_str(&source)
        .map_err(|error| NativeBunnyManifestParseError::new(path.to_path_buf(), error).into())
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

fn create_bunny_frame_report(
    frame_index: u64,
    asset_hash: &str,
    mesh: &PlyMesh,
) -> BunnyFrameReport {
    let seconds = frame_index_to_seconds(frame_index);
    BunnyFrameReport {
        angle_radians: seconds * BUNNY_ROTATION_RADIANS_PER_SECOND,
        asset_hash: asset_hash.to_owned(),
        face_count: mesh.faces.len(),
        frame_index,
        normalized_axis: normalize_vector3(BUNNY_ROTATION_AXIS),
        seconds,
        transform_profile: BUNNY_TRANSFORM_PROFILE,
        vertex_count: mesh.vertices.len(),
    }
}

fn frame_index_to_seconds(frame_index: u64) -> f64 {
    frame_index
        .to_string()
        .parse::<f64>()
        .map_or(0.0, |value| value / BUNNY_ROTATION_SAMPLE_RATE)
}

fn bunny_frame_index_from_elapsed_ms(elapsed_ms: u128) -> u64 {
    let frames = elapsed_ms.saturating_mul(BUNNY_ROTATION_SAMPLE_RATE_MILLIS) / 1000;
    u64::try_from(frames).unwrap_or(u64::MAX)
}

fn render_bunny_wireframe(mesh: &PlyMesh, angle_radians: f64) -> BunnyImage {
    let mut image = BunnyImage::new(
        BUNNY_RENDER_WIDTH,
        BUNNY_RENDER_HEIGHT,
        BUNNY_BACKGROUND_RGBA,
    );
    let axis = normalize_vector3(BUNNY_ROTATION_AXIS);

    for face in &mesh.faces {
        let first = project_position(mesh.vertices[face[0]].position, axis, angle_radians);
        let second = project_position(mesh.vertices[face[1]].position, axis, angle_radians);
        let third = project_position(mesh.vertices[face[2]].position, axis, angle_radians);
        draw_projected_edge(&mut image, first, second);
        draw_projected_edge(&mut image, second, third);
        draw_projected_edge(&mut image, third, first);
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

    for rgba in image.rgba.chunks_exact(BUNNY_BACKGROUND_RGBA.len()) {
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
        loaded.manifest.id, loaded.report.frame_index
    )
}

fn draw_projected_edge(image: &mut BunnyImage, first: ProjectedPoint, second: ProjectedPoint) {
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

    draw_line(image, x0, y0, x1, y1);
}

fn draw_line(image: &mut BunnyImage, mut x0: i32, mut y0: i32, x1: i32, y1: i32) {
    let delta_x = (x1 - x0).abs();
    let step_x = if x0 < x1 { 1 } else { -1 };
    let delta_y = -(y1 - y0).abs();
    let step_y = if y0 < y1 { 1 } else { -1 };
    let mut error = delta_x + delta_y;

    loop {
        image.set_pixel(x0, y0, BUNNY_MATERIAL_RGBA);
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

fn project_position(position: [f64; 3], axis: [f64; 3], angle_radians: f64) -> ProjectedPoint {
    let rotated = rotate_around_axis(position, axis, angle_radians);
    let camera_x = rotated[0] - BUNNY_CAMERA_EYE[0];
    let camera_y = rotated[1] - BUNNY_CAMERA_EYE[1];
    let camera_z = rotated[2] - BUNNY_CAMERA_EYE[2];
    let depth = -camera_z;

    if depth <= 0.0 {
        return ProjectedPoint {
            visible: false,
            x: 0.0,
            y: 0.0,
        };
    }

    let focal_length = 1.0 / (BUNNY_VERTICAL_FOV_RADIANS / 2.0).tan();
    let x_ndc = (focal_length * camera_x) / depth;
    let y_ndc = (focal_length * camera_y) / depth;

    ProjectedPoint {
        visible: true,
        x: x_ndc.midpoint(1.0) * 512.0,
        y: (-y_ndc).midpoint(1.0) * 512.0,
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
        assert!(loaded.image.non_background_pixels() > 0);
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
        assert_eq!(bunny_frame_index_from_elapsed_ms(0), 0);
        assert_eq!(bunny_frame_index_from_elapsed_ms(249), 14);
        assert_eq!(bunny_frame_index_from_elapsed_ms(250), 15);
        assert_eq!(bunny_frame_index_from_elapsed_ms(1000), 60);
    }

    fn output_text(output: &[u8]) -> String {
        String::from_utf8_lossy(output).into_owned()
    }

    fn bunny_path() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere/assets/stanford-bunny")
    }
}
