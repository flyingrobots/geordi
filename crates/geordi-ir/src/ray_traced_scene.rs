//! Rust DTOs, validation, hashing and receipts for `geordi-ray-traced-scene/1`.
//!
//! The scene artifact uses the `geordi-fixed-q32.32/1` numeric profile. Every check here uses
//! plain `i64` and `i128` integer arithmetic; nothing in this module depends on Bunny.
//! These DTOs are local Rust-only types; no TypeScript mirror exists.

use super::{
    GEORDI_HASH_ALGORITHM_SHA256, GEORDI_JSON_SAFE_INTEGER_MAX, geordi_sha256_from_bytes,
    is_fixture_local_path, is_geordi_sha256, path_stays_inside_root,
};
use serde::de::{self, Deserializer, Visitor};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};

/// Fixed-point numeric profile name: Q32.32 raw values stored as JSON integers.
pub const GEORDI_FIXED_Q32_32_NUMERIC_PROFILE: &str = "geordi-fixed-q32.32/1";

/// Raw value of exactly 1.0 under `geordi-fixed-q32.32/1` (`2^32`).
pub const GEORDI_FIXED_Q32_32_ONE_RAW: i64 = 1 << 32;

/// Largest raw value accepted by `geordi-fixed-q32.32/1` (`2^53 - 1`).
pub const GEORDI_FIXED_Q32_32_RAW_MAX: i64 = GEORDI_JSON_SAFE_INTEGER_MAX;

/// Smallest raw value accepted by `geordi-fixed-q32.32/1` (`-(2^53 - 1)`).
pub const GEORDI_FIXED_Q32_32_RAW_MIN: i64 = -GEORDI_JSON_SAFE_INTEGER_MAX;

/// Ray-traced scene artifact version.
pub const GEORDI_RAY_TRACED_SCENE_VERSION: &str = "geordi-ray-traced-scene/1";

/// Ray-traced render receipt version.
pub const GEORDI_RAY_TRACED_RENDER_RECEIPT_VERSION: &str = "geordi-ray-traced-render-receipt/1";

/// Feature profile entry every ray-traced scene must require.
pub const GEORDI_RAY_TRACED_3D_PROFILE: &str = "geordi/ray-traced-3d/1";

/// Requirement for content-addressed mesh assets.
pub const GEORDI_RAY_TRACED_FEATURE_ASSET_MESH: &str = "asset.mesh";

/// Requirement for triangle mesh primitives.
pub const GEORDI_RAY_TRACED_FEATURE_MESH_TRIANGLE: &str = "mesh.triangle";

/// Requirement for instances with affine transforms.
pub const GEORDI_RAY_TRACED_FEATURE_INSTANCE_AFFINE3: &str = "instance.affine3";

/// Requirement for the pinhole camera.
pub const GEORDI_RAY_TRACED_FEATURE_CAMERA_PINHOLE: &str = "camera.pinhole";

/// Requirement for diffuse materials.
pub const GEORDI_RAY_TRACED_FEATURE_MATERIAL_DIFFUSE: &str = "material.diffuse";

/// Requirement for the directional light.
pub const GEORDI_RAY_TRACED_FEATURE_LIGHT_DIRECTIONAL: &str = "light.directional";

/// Requirement for the uniform sky.
pub const GEORDI_RAY_TRACED_FEATURE_LIGHT_UNIFORM_SKY: &str = "light.uniform-sky";

/// Requirement vocabulary accepted by `geordi-ray-traced-scene/1`.
pub const GEORDI_RAY_TRACED_KNOWN_REQUIREMENTS: &[&str] = &[
    GEORDI_RAY_TRACED_3D_PROFILE,
    GEORDI_RAY_TRACED_FEATURE_ASSET_MESH,
    GEORDI_RAY_TRACED_FEATURE_MESH_TRIANGLE,
    GEORDI_RAY_TRACED_FEATURE_INSTANCE_AFFINE3,
    GEORDI_RAY_TRACED_FEATURE_CAMERA_PINHOLE,
    GEORDI_RAY_TRACED_FEATURE_MATERIAL_DIFFUSE,
    GEORDI_RAY_TRACED_FEATURE_LIGHT_DIRECTIONAL,
    GEORDI_RAY_TRACED_FEATURE_LIGHT_UNIFORM_SKY,
];

/// The only mesh decode layout accepted in version 1.
pub const GEORDI_RAY_TRACED_MESH_LAYOUT_BUNNY_PLY_BINARY_LE_F32: &str = "bunny-ply-binary-le-f32/1";

/// The only integrator identity accepted in version 1.
pub const GEORDI_RAY_TRACED_INTEGRATOR_DIFFUSE_PATH: &str = "geordi-rt-diffuse-path/1";

/// The only reconstruction filter identity accepted in version 1.
pub const GEORDI_RAY_TRACED_RECONSTRUCTION_BOX_FILTER: &str = "geordi-box-filter/1";

/// The only output encoding identity accepted in version 1.
pub const GEORDI_RAY_TRACED_OUTPUT_RGBA8_SRGB_OPAQUE: &str = "geordi-rgba8-srgb-opaque/1";

/// Pixel format recorded by ray-traced render receipts.
pub const GEORDI_RAY_TRACED_PIXEL_FORMAT_RGBA8: &str = "rgba8";

/// Material kind accepted in version 1.
pub const GEORDI_RAY_TRACED_MATERIAL_KIND_DIFFUSE: &str = "diffuse";

/// Camera kind accepted in version 1.
pub const GEORDI_RAY_TRACED_CAMERA_KIND_PINHOLE: &str = "pinhole";

/// Directional light kind.
pub const GEORDI_RAY_TRACED_LIGHT_KIND_DIRECTIONAL: &str = "directional";

/// Uniform sky light kind.
pub const GEORDI_RAY_TRACED_LIGHT_KIND_UNIFORM_SKY: &str = "uniformSky";

/// Largest film width or height in pixels.
pub const GEORDI_RAY_TRACED_FILM_DIMENSION_MAX: i64 = 16_384;

/// Largest samples-per-pixel value.
pub const GEORDI_RAY_TRACED_SAMPLES_PER_PIXEL_MAX: i64 = 1024;

/// Largest sampler seed (`2^32 - 1`).
pub const GEORDI_RAY_TRACED_SEED_MAX: i64 = (1 << 32) - 1;

/// Largest maximum-bounce count.
pub const GEORDI_RAY_TRACED_MAX_BOUNCES_MAX: i64 = 1;

/// Largest `tanHalfFovY` raw value (`4.0`).
pub const GEORDI_RAY_TRACED_TAN_HALF_FOV_Y_MAX_RAW: i64 = 4 << 32;

/// Largest albedo channel raw value (`1.0`).
pub const GEORDI_RAY_TRACED_ALBEDO_MAX_RAW: i64 = 1 << 32;

/// Largest radiance channel raw value (`65536.0`).
pub const GEORDI_RAY_TRACED_RADIANCE_MAX_RAW: i64 = 65_536 << 32;

/// Largest total primitive count over all instances (`2^32 - 1`).
pub const GEORDI_RAY_TRACED_PRIMITIVE_COUNT_MAX: i64 = (1 << 32) - 1;

/// Exclusive coordinate magnitude limit of the runtime trace domain, in scene units.
pub const GEORDI_RAY_TRACED_TRACE_DOMAIN_UNITS: i64 = 256;

/// Exclusive transformed-bounds magnitude limit the validator applies, in scene units.
///
/// One unit below the trace domain, covering rounding in the runtime's vertex transform.
pub const GEORDI_RAY_TRACED_VALIDATOR_DOMAIN_UNITS: i64 = 255;

/// Diagnostic: the source is not JSON.
pub const GEORDI_E_RT_JSON_INVALID: &str = "GEORDI_E_RT_JSON_INVALID";
/// Diagnostic: an unknown field, a missing field, or a value of the wrong JSON type.
pub const GEORDI_E_RT_SCENE_SHAPE: &str = "GEORDI_E_RT_SCENE_SHAPE";
/// Diagnostic: a number has a fraction or exponent, or a governed field is not a number.
pub const GEORDI_E_RT_NUMBER_NOT_INTEGER: &str = "GEORDI_E_RT_NUMBER_NOT_INTEGER";
/// Diagnostic: an integer is outside `-(2^53 - 1)..=2^53 - 1`.
pub const GEORDI_E_RT_NUMBER_OUT_OF_RANGE: &str = "GEORDI_E_RT_NUMBER_OUT_OF_RANGE";
/// Diagnostic: `sceneVersion` is not supported.
pub const GEORDI_E_RT_SCENE_VERSION_UNSUPPORTED: &str = "GEORDI_E_RT_SCENE_VERSION_UNSUPPORTED";
/// Diagnostic: `numericProfile` is not supported.
pub const GEORDI_E_RT_NUMERIC_PROFILE_UNSUPPORTED: &str = "GEORDI_E_RT_NUMERIC_PROFILE_UNSUPPORTED";
/// Diagnostic: a requirement is outside the version 1 vocabulary.
pub const GEORDI_E_RT_REQUIREMENT_UNKNOWN: &str = "GEORDI_E_RT_REQUIREMENT_UNKNOWN";
/// Diagnostic: a requirement is listed twice.
pub const GEORDI_E_RT_REQUIREMENT_DUPLICATE: &str = "GEORDI_E_RT_REQUIREMENT_DUPLICATE";
/// Diagnostic: the profile requirement or a feature the scene uses is not required.
pub const GEORDI_E_RT_REQUIREMENT_MISSING: &str = "GEORDI_E_RT_REQUIREMENT_MISSING";
/// Diagnostic: an id is empty.
pub const GEORDI_E_RT_ID_EMPTY: &str = "GEORDI_E_RT_ID_EMPTY";
/// Diagnostic: an id is repeated within its collection.
pub const GEORDI_E_RT_ID_DUPLICATE: &str = "GEORDI_E_RT_ID_DUPLICATE";
/// Diagnostic: an instance names a mesh that is not declared.
pub const GEORDI_E_RT_MESH_REFERENCE_UNKNOWN: &str = "GEORDI_E_RT_MESH_REFERENCE_UNKNOWN";
/// Diagnostic: an instance names a material that is not declared.
pub const GEORDI_E_RT_MATERIAL_REFERENCE_UNKNOWN: &str = "GEORDI_E_RT_MATERIAL_REFERENCE_UNKNOWN";
/// Diagnostic: a mesh path is not a relative fixture-local path.
pub const GEORDI_E_RT_MESH_PATH_INVALID: &str = "GEORDI_E_RT_MESH_PATH_INVALID";
/// Diagnostic: a mesh hash is not `sha256:` followed by 64 lowercase hex digits.
pub const GEORDI_E_RT_MESH_HASH_INVALID: &str = "GEORDI_E_RT_MESH_HASH_INVALID";
/// Diagnostic: a mesh layout identity is not supported.
pub const GEORDI_E_RT_MESH_LAYOUT_UNSUPPORTED: &str = "GEORDI_E_RT_MESH_LAYOUT_UNSUPPORTED";
/// Diagnostic: a declared mesh count is negative.
pub const GEORDI_E_RT_MESH_COUNT_INVALID: &str = "GEORDI_E_RT_MESH_COUNT_INVALID";
/// Diagnostic: declared mesh bounds have `min` above `max` on an axis.
pub const GEORDI_E_RT_MESH_BOUNDS_INVALID: &str = "GEORDI_E_RT_MESH_BOUNDS_INVALID";
/// Diagnostic: a mesh file cannot be read.
pub const GEORDI_E_RT_MESH_FILE_MISSING: &str = "GEORDI_E_RT_MESH_FILE_MISSING";
/// Diagnostic: a mesh file resolves outside the fixture root.
pub const GEORDI_E_RT_MESH_FILE_OUTSIDE_ROOT: &str = "GEORDI_E_RT_MESH_FILE_OUTSIDE_ROOT";
/// Diagnostic: mesh file bytes do not match the declared hash.
pub const GEORDI_E_RT_MESH_HASH_MISMATCH: &str = "GEORDI_E_RT_MESH_HASH_MISMATCH";
/// Diagnostic: a material kind is not supported.
pub const GEORDI_E_RT_MATERIAL_UNSUPPORTED: &str = "GEORDI_E_RT_MATERIAL_UNSUPPORTED";
/// Diagnostic: an albedo channel is outside `[0, 1]`.
pub const GEORDI_E_RT_ALBEDO_OUT_OF_RANGE: &str = "GEORDI_E_RT_ALBEDO_OUT_OF_RANGE";
/// Diagnostic: a camera kind is not supported.
pub const GEORDI_E_RT_CAMERA_UNSUPPORTED: &str = "GEORDI_E_RT_CAMERA_UNSUPPORTED";
/// Diagnostic: the camera `forward` or `up` is zero, or they are parallel.
pub const GEORDI_E_RT_CAMERA_DEGENERATE: &str = "GEORDI_E_RT_CAMERA_DEGENERATE";
/// Diagnostic: `tanHalfFovY` is outside `(0, 4]`.
pub const GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE: &str = "GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE";
/// Diagnostic: the scene can leave the trace domain.
pub const GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED: &str = "GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED";
/// Diagnostic: the total primitive count exceeds `2^32 - 1`.
pub const GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED: &str = "GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED";
/// Diagnostic: a light kind is not supported.
pub const GEORDI_E_RT_LIGHT_UNSUPPORTED: &str = "GEORDI_E_RT_LIGHT_UNSUPPORTED";
/// Diagnostic: a light has a field its kind forbids, or lacks one its kind needs.
pub const GEORDI_E_RT_LIGHT_FIELD_INVALID: &str = "GEORDI_E_RT_LIGHT_FIELD_INVALID";
/// Diagnostic: the largest `towardLight` component magnitude is not exactly 1.0.
pub const GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED: &str = "GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED";
/// Diagnostic: a radiance channel is outside `[0, 65536]`.
pub const GEORDI_E_RT_RADIANCE_OUT_OF_RANGE: &str = "GEORDI_E_RT_RADIANCE_OUT_OF_RANGE";
/// Diagnostic: more than one directional light.
pub const GEORDI_E_RT_DIRECTIONAL_LIGHT_COUNT: &str = "GEORDI_E_RT_DIRECTIONAL_LIGHT_COUNT";
/// Diagnostic: not exactly one uniform sky.
pub const GEORDI_E_RT_SKY_COUNT: &str = "GEORDI_E_RT_SKY_COUNT";
/// Diagnostic: film width or height is outside `1..=16384`.
pub const GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE: &str = "GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE";
/// Diagnostic: the integrator identity is not supported.
pub const GEORDI_E_RT_INTEGRATOR_UNSUPPORTED: &str = "GEORDI_E_RT_INTEGRATOR_UNSUPPORTED";
/// Diagnostic: the sampler identity is not a well-formed versioned identity.
pub const GEORDI_E_RT_SAMPLER_IDENTITY_INVALID: &str = "GEORDI_E_RT_SAMPLER_IDENTITY_INVALID";
/// Diagnostic: the tone curve identity is not a well-formed versioned identity.
pub const GEORDI_E_RT_TONE_CURVE_IDENTITY_INVALID: &str = "GEORDI_E_RT_TONE_CURVE_IDENTITY_INVALID";
/// Diagnostic: the reconstruction identity is not supported.
pub const GEORDI_E_RT_RECONSTRUCTION_UNSUPPORTED: &str = "GEORDI_E_RT_RECONSTRUCTION_UNSUPPORTED";
/// Diagnostic: the output encoding identity is not supported.
pub const GEORDI_E_RT_OUTPUT_UNSUPPORTED: &str = "GEORDI_E_RT_OUTPUT_UNSUPPORTED";
/// Diagnostic: `samplesPerPixel` is not a power of two in `1..=1024`.
pub const GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID: &str = "GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID";
/// Diagnostic: `seed` is outside `0..=2^32 - 1`.
pub const GEORDI_E_RT_SEED_OUT_OF_RANGE: &str = "GEORDI_E_RT_SEED_OUT_OF_RANGE";
/// Diagnostic: `maxBounces` is outside `0..=1`.
pub const GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE: &str = "GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE";
/// Diagnostic: the rendered image size differs from the film size.
pub const GEORDI_E_RT_VIEWPORT_MISMATCH: &str = "GEORDI_E_RT_VIEWPORT_MISMATCH";
/// Diagnostic: a receipt has an unknown field, a missing field, or a wrong JSON type.
pub const GEORDI_E_RT_RECEIPT_SHAPE: &str = "GEORDI_E_RT_RECEIPT_SHAPE";
/// Diagnostic: a receipt field violates the receipt contract.
pub const GEORDI_E_RT_RECEIPT_FIELD_INVALID: &str = "GEORDI_E_RT_RECEIPT_FIELD_INVALID";

const NUMBER_CODES: &[&str] = &[
    GEORDI_E_RT_NUMBER_NOT_INTEGER,
    GEORDI_E_RT_NUMBER_OUT_OF_RANGE,
];

/// `GEORDI_RAY_TRACED_VALIDATOR_DOMAIN_UNITS` at scale `2^64` (a Q32.32 product's scale).
const VALIDATOR_DOMAIN_LIMIT_SCALED: u128 = 255 << 64;
/// `GEORDI_RAY_TRACED_TRACE_DOMAIN_UNITS` as a Q32.32 raw magnitude.
const TRACE_DOMAIN_LIMIT_RAW: u64 = 256 << 32;

/// One `geordi-fixed-q32.32/1` number: a raw value `r` meaning exactly `r / 2^32`.
///
/// A value of this type always holds a raw value in
/// `GEORDI_FIXED_Q32_32_RAW_MIN..=GEORDI_FIXED_Q32_32_RAW_MAX`. It deserializes only from a JSON
/// integer token in that range; fractions, exponents, strings, booleans and `null` are rejected.
/// Runtimes that compute with these values are expected to use the arithmetic of Bunny's numeric
/// constitution (`docs/NUMERIC_CONSTITUTION.md` in flyingrobots/bunny).
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct GeordiFixedQ32_32(i64);

impl GeordiFixedQ32_32 {
    /// Wrap a raw value, or return `None` when it is outside the profile range.
    #[must_use]
    pub const fn from_raw(raw: i64) -> Option<Self> {
        if is_fixed_q32_32_raw_in_range(raw) {
            Some(Self(raw))
        } else {
            None
        }
    }

    /// The raw signed integer.
    #[must_use]
    pub const fn raw(self) -> i64 {
        self.0
    }
}

const fn is_fixed_q32_32_raw_in_range(raw: i64) -> bool {
    raw >= GEORDI_FIXED_Q32_32_RAW_MIN && raw <= GEORDI_FIXED_Q32_32_RAW_MAX
}

impl<'de> Deserialize<'de> for GeordiFixedQ32_32 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_i64(FixedQ32_32Visitor)
    }
}

struct FixedQ32_32Visitor;

impl Visitor<'_> for FixedQ32_32Visitor {
    type Value = GeordiFixedQ32_32;

    fn expecting(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{GEORDI_E_RT_NUMBER_NOT_INTEGER}: a {GEORDI_FIXED_Q32_32_NUMERIC_PROFILE} raw value \
             written as a JSON integer"
        )
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        GeordiFixedQ32_32::from_raw(value).ok_or_else(|| out_of_range_error(&value))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        i64::try_from(value)
            .ok()
            .and_then(GeordiFixedQ32_32::from_raw)
            .ok_or_else(|| out_of_range_error(&value))
    }
}

fn out_of_range_error<E: de::Error>(value: &dyn Display) -> E {
    E::custom(format!(
        "{GEORDI_E_RT_NUMBER_OUT_OF_RANGE}: {GEORDI_FIXED_Q32_32_NUMERIC_PROFILE} raw value {value} \
         is outside -(2^53 - 1)..=2^53 - 1"
    ))
}

fn deserialize_present_vec3<'de, D>(
    deserializer: D,
) -> Result<Option<[GeordiFixedQ32_32; 3]>, D::Error>
where
    D: Deserializer<'de>,
{
    <[GeordiFixedQ32_32; 3]>::deserialize(deserializer).map(Some)
}

/// A `geordi-ray-traced-scene/1` artifact.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedScene {
    /// Scene artifact version.
    pub scene_version: String,
    /// Numeric profile governing every scalar field.
    pub numeric_profile: String,
    /// Stable scene identifier.
    pub id: String,
    /// Required feature profile entries.
    pub requires: Vec<String>,
    /// Content-addressed triangle meshes.
    pub meshes: Vec<GeordiRayTracedMesh>,
    /// Surface materials.
    pub materials: Vec<GeordiRayTracedMaterial>,
    /// Mesh instances, in primitive order.
    pub instances: Vec<GeordiRayTracedInstance>,
    /// The pinhole camera.
    pub camera: GeordiRayTracedCamera,
    /// Lights: at most one directional light and exactly one uniform sky.
    pub lights: Vec<GeordiRayTracedLight>,
    /// Output image size.
    pub film: GeordiRayTracedFilm,
    /// Pixel-affecting render settings.
    pub render: GeordiRayTracedRenderSettings,
}

/// One triangle mesh referenced by content hash.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedMesh {
    /// Mesh identifier, unique among meshes.
    pub id: String,
    /// Fixture-relative path to the mesh bytes.
    pub path: String,
    /// `sha256:` digest of the mesh bytes.
    pub sha256: String,
    /// Decode layout identity.
    pub layout: String,
    /// Declared vertex and triangle counts.
    pub counts: GeordiRayTracedMeshCounts,
    /// Declared axis-aligned bounds in mesh-local units.
    pub bounds: GeordiRayTracedMeshBounds,
}

/// Declared mesh element counts.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedMeshCounts {
    /// Vertex count.
    pub vertices: i64,
    /// Triangle count.
    pub triangles: i64,
}

/// Declared mesh bounds as Q32.32 points.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedMeshBounds {
    /// Minimum corner.
    pub min: [GeordiFixedQ32_32; 3],
    /// Maximum corner.
    pub max: [GeordiFixedQ32_32; 3],
}

/// One surface material.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedMaterial {
    /// Material identifier, unique among materials.
    pub id: String,
    /// Material kind; version 1 accepts `diffuse`.
    pub kind: String,
    /// Linear-light reflectance per channel, each in `[0, 1]`.
    pub albedo: [GeordiFixedQ32_32; 3],
}

/// One mesh instance.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedInstance {
    /// Instance identifier, unique among instances.
    pub id: String,
    /// Referenced mesh id.
    pub mesh: String,
    /// Referenced material id.
    pub material: String,
    /// Transform from mesh-local to world coordinates.
    pub world_from_mesh: GeordiRayTracedAffine3,
}

/// A Q32.32 affine transform: a 3x3 linear part and a translation.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedAffine3 {
    /// Linear part in column-major order: entry `column * 3 + row`.
    pub linear_column_major: [GeordiFixedQ32_32; 9],
    /// Translation.
    pub translation: [GeordiFixedQ32_32; 3],
}

/// The pinhole camera.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedCamera {
    /// Camera kind; version 1 accepts `pinhole`.
    pub kind: String,
    /// Eye position in world coordinates.
    pub position: [GeordiFixedQ32_32; 3],
    /// Look direction; need not be unit length.
    pub forward: [GeordiFixedQ32_32; 3],
    /// Up direction; need not be unit length.
    pub up: [GeordiFixedQ32_32; 3],
    /// Tangent of half the vertical field of view, in `(0, 4]`.
    pub tan_half_fov_y: GeordiFixedQ32_32,
}

/// One light. `kind` selects which fields apply.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedLight {
    /// Light kind: `directional` or `uniformSky`.
    pub kind: String,
    /// Light identifier, unique among lights.
    pub id: String,
    /// Direction from a surface toward a directional light. Required for `directional`;
    /// forbidden for `uniformSky`.
    #[serde(default, deserialize_with = "deserialize_present_vec3")]
    pub toward_light: Option<[GeordiFixedQ32_32; 3]>,
    /// Linear-light radiance per channel, each in `[0, 65536]`.
    pub radiance: [GeordiFixedQ32_32; 3],
}

/// Output image size.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedFilm {
    /// Width in pixels, `1..=16384`.
    pub width: i64,
    /// Height in pixels, `1..=16384`.
    pub height: i64,
}

/// Pixel-affecting render settings.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedRenderSettings {
    /// Integrator identity.
    pub integrator: String,
    /// Samples per pixel, a power of two in `1..=1024`.
    pub samples_per_pixel: i64,
    /// Sampler identity (Bunny-owned).
    pub sampler: String,
    /// Sampler seed, `0..=2^32 - 1`.
    pub seed: i64,
    /// Maximum bounces, `0..=1`.
    pub max_bounces: i64,
    /// Reconstruction filter identity.
    pub reconstruction: String,
    /// Tone curve identity (Bunny-owned).
    pub tone_curve: String,
    /// Output encoding identity.
    pub output: String,
}

/// One diagnostic for a ray-traced scene or receipt.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiRayTracedSceneIssue {
    /// Stable diagnostic code.
    pub code: String,
    /// JSON-path-like location of the invalid value (`$` when only a line and column are known).
    pub path: String,
    /// Human-readable message. Prose may change; the code is the stable identity.
    pub message: String,
}

impl GeordiRayTracedSceneIssue {
    fn new(code: &str, path: &str, message: &str) -> Self {
        Self {
            code: code.to_owned(),
            path: path.to_owned(),
            message: message.to_owned(),
        }
    }
}

/// Custom error returned when a ray-traced scene or receipt fails parsing or validation.
#[derive(Debug)]
pub struct GeordiRayTracedSceneError {
    issues: Vec<GeordiRayTracedSceneIssue>,
}

impl GeordiRayTracedSceneError {
    const fn new(issues: Vec<GeordiRayTracedSceneIssue>) -> Self {
        Self { issues }
    }

    fn single(code: &str, path: &str, message: &str) -> Self {
        Self::new(vec![GeordiRayTracedSceneIssue::new(code, path, message)])
    }

    /// Diagnostics in deterministic traversal order.
    #[must_use]
    pub fn issues(&self) -> &[GeordiRayTracedSceneIssue] {
        &self.issues
    }
}

impl Display for GeordiRayTracedSceneError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi ray-traced scene validation failed")
    }
}

impl Error for GeordiRayTracedSceneError {}

/// Custom error returned when loading a ray-traced scene from disk fails.
#[derive(Debug)]
pub struct GeordiRayTracedSceneLoadError {
    path: PathBuf,
    source: GeordiRayTracedSceneLoadErrorSource,
}

#[derive(Debug)]
enum GeordiRayTracedSceneLoadErrorSource {
    File(std::io::Error),
    Scene(GeordiRayTracedSceneError),
}

impl GeordiRayTracedSceneLoadError {
    /// Path that failed to load.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Scene diagnostics, when the file was read but did not parse.
    #[must_use]
    pub const fn scene_error(&self) -> Option<&GeordiRayTracedSceneError> {
        match &self.source {
            GeordiRayTracedSceneLoadErrorSource::Scene(source) => Some(source),
            GeordiRayTracedSceneLoadErrorSource::File(_) => None,
        }
    }
}

impl Display for GeordiRayTracedSceneLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Geordi ray-traced scene load failed: {}",
            self.path.display()
        )
    }
}

impl Error for GeordiRayTracedSceneLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiRayTracedSceneLoadErrorSource::File(source) => Some(source),
            GeordiRayTracedSceneLoadErrorSource::Scene(source) => Some(source),
        }
    }
}

/// One verified mesh asset.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiRayTracedMeshAssetVerification {
    /// Mesh id.
    pub mesh_id: String,
    /// Fixture-relative path that was read.
    pub path: String,
    /// Computed `sha256:` digest, equal to the declared one.
    pub sha256: String,
}

/// Parse a `geordi-ray-traced-scene/1` JSON string into typed Rust structs.
///
/// Every JSON number in the artifact must be an integer token (no fraction, no exponent, not
/// `-0`) within `-(2^53 - 1)..=2^53 - 1`. Number-token failures carry a JSON path; shape failures
/// (unknown or missing fields, wrong JSON types) carry the line and column in the message.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` with `GEORDI_E_RT_JSON_INVALID`,
/// `GEORDI_E_RT_NUMBER_NOT_INTEGER`, `GEORDI_E_RT_NUMBER_OUT_OF_RANGE` or
/// `GEORDI_E_RT_SCENE_SHAPE` diagnostics.
pub fn parse_geordi_ray_traced_scene(
    source: &str,
) -> Result<GeordiRayTracedScene, GeordiRayTracedSceneError> {
    parse_integer_only_json::<GeordiRayTracedScene>(source, GEORDI_E_RT_SCENE_SHAPE)
        .map(|(scene, _value)| scene)
}

/// Load a `geordi-ray-traced-scene/1` artifact from a path.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneLoadError` when the file cannot be read or does not parse.
pub fn load_geordi_ray_traced_scene(
    path: impl AsRef<Path>,
) -> Result<GeordiRayTracedScene, GeordiRayTracedSceneLoadError> {
    let path = path.as_ref();
    let source = fs::read_to_string(path).map_err(|error| GeordiRayTracedSceneLoadError {
        path: path.to_path_buf(),
        source: GeordiRayTracedSceneLoadErrorSource::File(error),
    })?;
    parse_geordi_ray_traced_scene(&source).map_err(|error| GeordiRayTracedSceneLoadError {
        path: path.to_path_buf(),
        source: GeordiRayTracedSceneLoadErrorSource::Scene(error),
    })
}

/// Canonical JSON bytes of a ray-traced scene: keys sorted, two-space indentation, final newline.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` when the source does not parse as a scene.
pub fn geordi_ray_traced_scene_canonical_json(
    source: &str,
) -> Result<String, GeordiRayTracedSceneError> {
    let (_scene, value) =
        parse_integer_only_json::<GeordiRayTracedScene>(source, GEORDI_E_RT_SCENE_SHAPE)?;
    canonical_json_string(&value)
}

/// The receipt `sceneHash`: `sha256:` over the canonical JSON bytes of the scene.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` when the source does not parse as a scene.
pub fn geordi_ray_traced_scene_hash(source: &str) -> Result<String, GeordiRayTracedSceneError> {
    geordi_ray_traced_scene_canonical_json(source)
        .map(|canonical| geordi_sha256_from_bytes(canonical.as_bytes()))
}

/// The receipt `imageHash`: `sha256:` over raw RGBA8 bytes, row-major, top row first.
///
/// Width, height, pixel format and encoding are not hashed here; the receipt records them.
#[must_use]
pub fn geordi_ray_traced_image_hash(rgba: &[u8]) -> String {
    geordi_sha256_from_bytes(rgba)
}

/// Validate a parsed `geordi-ray-traced-scene/1` artifact without reading mesh bytes.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` with every rule violation, in deterministic order.
pub fn validate_geordi_ray_traced_scene(
    scene: &GeordiRayTracedScene,
) -> Result<(), GeordiRayTracedSceneError> {
    let mut issues = Vec::new();
    validate_scene_header(scene, &mut issues);
    validate_requirements(scene, &mut issues);
    validate_meshes(&scene.meshes, &mut issues);
    validate_materials(&scene.materials, &mut issues);
    validate_instances(scene, &mut issues);
    validate_camera(&scene.camera, &mut issues);
    validate_lights(&scene.lights, &mut issues);
    validate_film(scene.film, &mut issues);
    validate_render_settings(&scene.render, &mut issues);
    finish(issues)
}

/// Verify that every declared mesh file exists inside `fixture_root` and matches its hash.
///
/// Mesh paths are resolved relative to `fixture_root`. Counts, bounds, layout and triangle
/// indices are checked by the runtime after decoding; this function does not decode mesh bytes.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` with `GEORDI_E_RT_MESH_PATH_INVALID`,
/// `GEORDI_E_RT_MESH_FILE_OUTSIDE_ROOT`, `GEORDI_E_RT_MESH_FILE_MISSING` or
/// `GEORDI_E_RT_MESH_HASH_MISMATCH` diagnostics.
pub fn validate_geordi_ray_traced_scene_mesh_assets(
    scene: &GeordiRayTracedScene,
    fixture_root: impl AsRef<Path>,
) -> Result<Vec<GeordiRayTracedMeshAssetVerification>, GeordiRayTracedSceneError> {
    let fixture_root = fixture_root.as_ref();
    let mut issues = Vec::new();
    let mut verifications = Vec::with_capacity(scene.meshes.len());
    for (index, mesh) in scene.meshes.iter().enumerate() {
        let path = format!("$.meshes[{index}].path");
        match read_mesh_asset(fixture_root, &mesh.path) {
            Ok(bytes) => {
                let sha256 = geordi_sha256_from_bytes(&bytes);
                if sha256 == mesh.sha256 {
                    verifications.push(GeordiRayTracedMeshAssetVerification {
                        mesh_id: mesh.id.clone(),
                        path: mesh.path.clone(),
                        sha256,
                    });
                } else {
                    issues.push(GeordiRayTracedSceneIssue::new(
                        GEORDI_E_RT_MESH_HASH_MISMATCH,
                        &format!("$.meshes[{index}].sha256"),
                        &format!(
                            "Mesh bytes hash to {sha256}, not the declared {}",
                            mesh.sha256
                        ),
                    ));
                }
            }
            Err((code, message)) => {
                issues.push(GeordiRayTracedSceneIssue::new(code, &path, &message));
            }
        }
    }
    finish(issues).map(|()| verifications)
}

fn read_mesh_asset(
    fixture_root: &Path,
    mesh_path: &str,
) -> Result<Vec<u8>, (&'static str, String)> {
    if !is_fixture_local_path(mesh_path) {
        return Err((
            GEORDI_E_RT_MESH_PATH_INVALID,
            "Mesh path must be a relative fixture-local path".to_owned(),
        ));
    }
    let missing = |error: std::io::Error| {
        (
            GEORDI_E_RT_MESH_FILE_MISSING,
            format!("Mesh file {mesh_path} cannot be read: {error}"),
        )
    };
    let canonical_root = fs::canonicalize(fixture_root).map_err(missing)?;
    let canonical_path = fs::canonicalize(fixture_root.join(mesh_path)).map_err(missing)?;
    if !path_stays_inside_root(&canonical_root, &canonical_path) {
        return Err((
            GEORDI_E_RT_MESH_FILE_OUTSIDE_ROOT,
            format!("Mesh file {mesh_path} resolves outside the fixture root"),
        ));
    }
    fs::read(&canonical_path).map_err(missing)
}

fn finish(issues: Vec<GeordiRayTracedSceneIssue>) -> Result<(), GeordiRayTracedSceneError> {
    if issues.is_empty() {
        Ok(())
    } else {
        Err(GeordiRayTracedSceneError::new(issues))
    }
}

fn push(issues: &mut Vec<GeordiRayTracedSceneIssue>, code: &str, path: &str, message: &str) {
    issues.push(GeordiRayTracedSceneIssue::new(code, path, message));
}

fn parse_integer_only_json<T>(
    source: &str,
    shape_code: &str,
) -> Result<(T, Value), GeordiRayTracedSceneError>
where
    T: for<'de> Deserialize<'de>,
{
    let value: Value = serde_json::from_str(source).map_err(|error| {
        GeordiRayTracedSceneError::single(GEORDI_E_RT_JSON_INVALID, "$", &error.to_string())
    })?;
    let mut issues = Vec::new();
    collect_number_token_issues(&value, "$", &mut issues);
    finish(issues)?;
    let typed = serde_json::from_str::<T>(source).map_err(|error| {
        let message = error.to_string();
        let code = NUMBER_CODES
            .iter()
            .copied()
            .find(|code| message.contains(code))
            .unwrap_or(shape_code);
        GeordiRayTracedSceneError::single(code, "$", &message)
    })?;
    Ok((typed, value))
}

/// Reject every JSON number that is not an integer token in the safe range.
///
/// `serde_json` reads `1.0`, `1e3` and `-0` as floating-point values and `1` as an integer, so a
/// float-valued number here is exactly a token with a fraction, an exponent, or a negative zero.
fn collect_number_token_issues(
    value: &Value,
    path: &str,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    match value {
        Value::Number(number) => {
            if let Some(raw) = number.as_i64() {
                if !is_fixed_q32_32_raw_in_range(raw) {
                    push(
                        issues,
                        GEORDI_E_RT_NUMBER_OUT_OF_RANGE,
                        path,
                        &format!("Integer {raw} is outside -(2^53 - 1)..=2^53 - 1"),
                    );
                }
            } else if number.is_u64() {
                push(
                    issues,
                    GEORDI_E_RT_NUMBER_OUT_OF_RANGE,
                    path,
                    &format!("Integer {number} is outside -(2^53 - 1)..=2^53 - 1"),
                );
            } else {
                push(
                    issues,
                    GEORDI_E_RT_NUMBER_NOT_INTEGER,
                    path,
                    "Number must be a JSON integer with no fraction, no exponent and no -0",
                );
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                collect_number_token_issues(item, &format!("{path}[{index}]"), issues);
            }
        }
        Value::Object(map) => {
            for (key, item) in map {
                collect_number_token_issues(item, &format!("{path}.{key}"), issues);
            }
        }
        Value::Null | Value::Bool(_) | Value::String(_) => {}
    }
}

fn canonical_json_string(value: &Value) -> Result<String, GeordiRayTracedSceneError> {
    let mut canonical = serde_json::to_string_pretty(value).map_err(|error| {
        GeordiRayTracedSceneError::single(GEORDI_E_RT_JSON_INVALID, "$", &error.to_string())
    })?;
    canonical.push('\n');
    Ok(canonical)
}

fn validate_scene_header(
    scene: &GeordiRayTracedScene,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    if scene.scene_version != GEORDI_RAY_TRACED_SCENE_VERSION {
        push(
            issues,
            GEORDI_E_RT_SCENE_VERSION_UNSUPPORTED,
            "$.sceneVersion",
            "Scene version is not supported",
        );
    }
    if scene.numeric_profile != GEORDI_FIXED_Q32_32_NUMERIC_PROFILE {
        push(
            issues,
            GEORDI_E_RT_NUMERIC_PROFILE_UNSUPPORTED,
            "$.numericProfile",
            "Ray-traced scenes require numericProfile geordi-fixed-q32.32/1",
        );
    }
    validate_id(&scene.id, "$.id", issues);
}

fn validate_requirements(
    scene: &GeordiRayTracedScene,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    let mut seen = Vec::<&str>::new();
    for (index, requirement) in scene.requires.iter().enumerate() {
        let path = format!("$.requires[{index}]");
        if !GEORDI_RAY_TRACED_KNOWN_REQUIREMENTS.contains(&requirement.as_str()) {
            push(
                issues,
                GEORDI_E_RT_REQUIREMENT_UNKNOWN,
                &path,
                "Requirement is not in the geordi-ray-traced-scene/1 vocabulary",
            );
        }
        if seen.contains(&requirement.as_str()) {
            push(
                issues,
                GEORDI_E_RT_REQUIREMENT_DUPLICATE,
                &path,
                "Requirement must not be duplicated",
            );
        }
        seen.push(requirement);
    }
    for feature in used_features(scene) {
        if !seen.contains(&feature) {
            push(
                issues,
                GEORDI_E_RT_REQUIREMENT_MISSING,
                "$.requires",
                &format!("Requirements must include {feature}"),
            );
        }
    }
}

/// The profile entry plus every feature the scene content uses, in vocabulary order.
fn used_features(scene: &GeordiRayTracedScene) -> Vec<&'static str> {
    let mut features = vec![GEORDI_RAY_TRACED_3D_PROFILE];
    if !scene.meshes.is_empty() {
        features.push(GEORDI_RAY_TRACED_FEATURE_ASSET_MESH);
        features.push(GEORDI_RAY_TRACED_FEATURE_MESH_TRIANGLE);
    }
    if !scene.instances.is_empty() {
        features.push(GEORDI_RAY_TRACED_FEATURE_INSTANCE_AFFINE3);
    }
    features.push(GEORDI_RAY_TRACED_FEATURE_CAMERA_PINHOLE);
    if !scene.materials.is_empty() {
        features.push(GEORDI_RAY_TRACED_FEATURE_MATERIAL_DIFFUSE);
    }
    let has_kind = |kind: &str| scene.lights.iter().any(|light| light.kind == kind);
    if has_kind(GEORDI_RAY_TRACED_LIGHT_KIND_DIRECTIONAL) {
        features.push(GEORDI_RAY_TRACED_FEATURE_LIGHT_DIRECTIONAL);
    }
    if has_kind(GEORDI_RAY_TRACED_LIGHT_KIND_UNIFORM_SKY) {
        features.push(GEORDI_RAY_TRACED_FEATURE_LIGHT_UNIFORM_SKY);
    }
    features
}

fn validate_id(id: &str, path: &str, issues: &mut Vec<GeordiRayTracedSceneIssue>) {
    if id.is_empty() {
        push(
            issues,
            GEORDI_E_RT_ID_EMPTY,
            path,
            "Id must be a non-empty string",
        );
    }
}

fn validate_unique_ids<'a>(
    ids: impl Iterator<Item = &'a str>,
    collection: &str,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    let mut seen = Vec::<&str>::new();
    for (index, id) in ids.enumerate() {
        let path = format!("$.{collection}[{index}].id");
        validate_id(id, &path, issues);
        if !id.is_empty() && seen.contains(&id) {
            push(
                issues,
                GEORDI_E_RT_ID_DUPLICATE,
                &path,
                &format!("Id {id} is already used in {collection}"),
            );
        }
        seen.push(id);
    }
}

fn validate_meshes(meshes: &[GeordiRayTracedMesh], issues: &mut Vec<GeordiRayTracedSceneIssue>) {
    validate_unique_ids(meshes.iter().map(|mesh| mesh.id.as_str()), "meshes", issues);
    for (index, mesh) in meshes.iter().enumerate() {
        let base = format!("$.meshes[{index}]");
        if !is_fixture_local_path(&mesh.path) {
            push(
                issues,
                GEORDI_E_RT_MESH_PATH_INVALID,
                &format!("{base}.path"),
                "Mesh path must be a relative fixture-local path",
            );
        }
        if !is_geordi_sha256(&mesh.sha256) {
            push(
                issues,
                GEORDI_E_RT_MESH_HASH_INVALID,
                &format!("{base}.sha256"),
                "Mesh hash must be sha256:<64 lowercase hex chars>",
            );
        }
        if mesh.layout != GEORDI_RAY_TRACED_MESH_LAYOUT_BUNNY_PLY_BINARY_LE_F32 {
            push(
                issues,
                GEORDI_E_RT_MESH_LAYOUT_UNSUPPORTED,
                &format!("{base}.layout"),
                "Mesh layout must be bunny-ply-binary-le-f32/1",
            );
        }
        for (field, count) in [
            ("vertices", mesh.counts.vertices),
            ("triangles", mesh.counts.triangles),
        ] {
            if count < 0 {
                push(
                    issues,
                    GEORDI_E_RT_MESH_COUNT_INVALID,
                    &format!("{base}.counts.{field}"),
                    "Mesh count must be non-negative",
                );
            }
        }
        for axis in 0..3 {
            if mesh.bounds.min[axis] > mesh.bounds.max[axis] {
                push(
                    issues,
                    GEORDI_E_RT_MESH_BOUNDS_INVALID,
                    &format!("{base}.bounds"),
                    &format!("Mesh bounds min[{axis}] must not exceed max[{axis}]"),
                );
            }
        }
    }
}

fn validate_materials(
    materials: &[GeordiRayTracedMaterial],
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    validate_unique_ids(
        materials.iter().map(|material| material.id.as_str()),
        "materials",
        issues,
    );
    for (index, material) in materials.iter().enumerate() {
        let base = format!("$.materials[{index}]");
        if material.kind != GEORDI_RAY_TRACED_MATERIAL_KIND_DIFFUSE {
            push(
                issues,
                GEORDI_E_RT_MATERIAL_UNSUPPORTED,
                &format!("{base}.kind"),
                "Material kind must be diffuse",
            );
        }
        validate_channels(
            &material.albedo,
            GEORDI_RAY_TRACED_ALBEDO_MAX_RAW,
            &format!("{base}.albedo"),
            GEORDI_E_RT_ALBEDO_OUT_OF_RANGE,
            "Albedo channel must be in [0, 1]",
            issues,
        );
    }
}

fn validate_channels(
    channels: &[GeordiFixedQ32_32; 3],
    max_raw: i64,
    path: &str,
    code: &str,
    message: &str,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    for (channel, value) in channels.iter().enumerate() {
        if !(0..=max_raw).contains(&value.raw()) {
            push(issues, code, &format!("{path}[{channel}]"), message);
        }
    }
}

fn validate_instances(scene: &GeordiRayTracedScene, issues: &mut Vec<GeordiRayTracedSceneIssue>) {
    validate_unique_ids(
        scene.instances.iter().map(|instance| instance.id.as_str()),
        "instances",
        issues,
    );
    let mut primitive_count = 0_i128;
    for (index, instance) in scene.instances.iter().enumerate() {
        let base = format!("$.instances[{index}]");
        let mesh = scene.meshes.iter().find(|mesh| mesh.id == instance.mesh);
        if mesh.is_none() {
            push(
                issues,
                GEORDI_E_RT_MESH_REFERENCE_UNKNOWN,
                &format!("{base}.mesh"),
                &format!("Instance names undeclared mesh {}", instance.mesh),
            );
        }
        if !scene
            .materials
            .iter()
            .any(|material| material.id == instance.material)
        {
            push(
                issues,
                GEORDI_E_RT_MATERIAL_REFERENCE_UNKNOWN,
                &format!("{base}.material"),
                &format!("Instance names undeclared material {}", instance.material),
            );
        }
        if let Some(mesh) = mesh {
            primitive_count += i128::from(mesh.counts.triangles.max(0));
            if !transformed_bounds_inside_validator_domain(&instance.world_from_mesh, &mesh.bounds)
            {
                push(
                    issues,
                    GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED,
                    &format!("{base}.worldFromMesh"),
                    "A transformed corner of the declared mesh bounds is not below 255 units in \
                     magnitude",
                );
            }
        }
    }
    if primitive_count > i128::from(GEORDI_RAY_TRACED_PRIMITIVE_COUNT_MAX) {
        push(
            issues,
            GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED,
            "$.instances",
            &format!("Scene has {primitive_count} triangles in total; the limit is 2^32 - 1"),
        );
    }
}

/// Exact check that all eight transformed corners of `bounds` lie strictly below 255 units.
///
/// A coordinate is computed at scale `2^64` with no rounding: `sum(linear * corner) +
/// translation * 2^32`. Each product is below `2^106` in magnitude, so the sum fits `i128`.
fn transformed_bounds_inside_validator_domain(
    transform: &GeordiRayTracedAffine3,
    bounds: &GeordiRayTracedMeshBounds,
) -> bool {
    (0..8_usize).all(|corner_index| {
        let corner: [i128; 3] = std::array::from_fn(|axis| {
            let source = if corner_index & (1 << axis) == 0 {
                bounds.min[axis]
            } else {
                bounds.max[axis]
            };
            i128::from(source.raw())
        });
        (0..3).all(|row| {
            let mut scaled = i128::from(transform.translation[row].raw()) << 32;
            for (column, value) in corner.iter().enumerate() {
                scaled += i128::from(transform.linear_column_major[column * 3 + row].raw()) * value;
            }
            scaled.unsigned_abs() < VALIDATOR_DOMAIN_LIMIT_SCALED
        })
    })
}

fn validate_camera(camera: &GeordiRayTracedCamera, issues: &mut Vec<GeordiRayTracedSceneIssue>) {
    if camera.kind != GEORDI_RAY_TRACED_CAMERA_KIND_PINHOLE {
        push(
            issues,
            GEORDI_E_RT_CAMERA_UNSUPPORTED,
            "$.camera.kind",
            "Camera kind must be pinhole",
        );
    }
    for (axis, value) in camera.position.iter().enumerate() {
        if value.raw().unsigned_abs() >= TRACE_DOMAIN_LIMIT_RAW {
            push(
                issues,
                GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED,
                &format!("$.camera.position[{axis}]"),
                "Camera position must be below 256 units in magnitude",
            );
        }
    }
    let forward = vec3_i128(&camera.forward);
    let up = vec3_i128(&camera.up);
    if forward == [0; 3] {
        push(
            issues,
            GEORDI_E_RT_CAMERA_DEGENERATE,
            "$.camera.forward",
            "Camera forward must not be zero",
        );
    }
    if up == [0; 3] {
        push(
            issues,
            GEORDI_E_RT_CAMERA_DEGENERATE,
            "$.camera.up",
            "Camera up must not be zero",
        );
    }
    if forward != [0; 3] && up != [0; 3] && cross_i128(forward, up) == [0; 3] {
        push(
            issues,
            GEORDI_E_RT_CAMERA_DEGENERATE,
            "$.camera.up",
            "Camera up must not be parallel to forward",
        );
    }
    let tan = camera.tan_half_fov_y.raw();
    if tan <= 0 || tan > GEORDI_RAY_TRACED_TAN_HALF_FOV_Y_MAX_RAW {
        push(
            issues,
            GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE,
            "$.camera.tanHalfFovY",
            "tanHalfFovY must be in (0, 4]",
        );
    }
}

fn vec3_i128(vector: &[GeordiFixedQ32_32; 3]) -> [i128; 3] {
    vector.map(|value| i128::from(value.raw()))
}

/// Exact cross product; inputs are below `2^53`, so every product is below `2^106`.
const fn cross_i128(a: [i128; 3], b: [i128; 3]) -> [i128; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn validate_lights(lights: &[GeordiRayTracedLight], issues: &mut Vec<GeordiRayTracedSceneIssue>) {
    validate_unique_ids(
        lights.iter().map(|light| light.id.as_str()),
        "lights",
        issues,
    );
    let mut directional_count = 0_usize;
    let mut sky_count = 0_usize;
    for (index, light) in lights.iter().enumerate() {
        let base = format!("$.lights[{index}]");
        match light.kind.as_str() {
            GEORDI_RAY_TRACED_LIGHT_KIND_DIRECTIONAL => {
                directional_count += 1;
                validate_directional_light(light, &base, issues);
            }
            GEORDI_RAY_TRACED_LIGHT_KIND_UNIFORM_SKY => {
                sky_count += 1;
                if light.toward_light.is_some() {
                    push(
                        issues,
                        GEORDI_E_RT_LIGHT_FIELD_INVALID,
                        &format!("{base}.towardLight"),
                        "A uniformSky light must not have towardLight",
                    );
                }
            }
            _ => push(
                issues,
                GEORDI_E_RT_LIGHT_UNSUPPORTED,
                &format!("{base}.kind"),
                "Light kind must be directional or uniformSky",
            ),
        }
        validate_channels(
            &light.radiance,
            GEORDI_RAY_TRACED_RADIANCE_MAX_RAW,
            &format!("{base}.radiance"),
            GEORDI_E_RT_RADIANCE_OUT_OF_RANGE,
            "Radiance channel must be in [0, 65536]",
            issues,
        );
    }
    if directional_count > 1 {
        push(
            issues,
            GEORDI_E_RT_DIRECTIONAL_LIGHT_COUNT,
            "$.lights",
            "A scene has at most one directional light",
        );
    }
    if sky_count != 1 {
        push(
            issues,
            GEORDI_E_RT_SKY_COUNT,
            "$.lights",
            "A scene has exactly one uniformSky light",
        );
    }
}

fn validate_directional_light(
    light: &GeordiRayTracedLight,
    base: &str,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    let Some(toward_light) = light.toward_light else {
        push(
            issues,
            GEORDI_E_RT_LIGHT_FIELD_INVALID,
            &format!("{base}.towardLight"),
            "A directional light must have towardLight",
        );
        return;
    };
    let largest = toward_light
        .iter()
        .map(|value| value.raw().unsigned_abs())
        .max()
        .unwrap_or(0);
    if largest != GEORDI_FIXED_Q32_32_ONE_RAW.unsigned_abs() {
        push(
            issues,
            GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED,
            &format!("{base}.towardLight"),
            "The largest towardLight component magnitude must be exactly 1.0 (raw 4294967296)",
        );
    }
}

fn validate_film(film: GeordiRayTracedFilm, issues: &mut Vec<GeordiRayTracedSceneIssue>) {
    for (field, value) in [("width", film.width), ("height", film.height)] {
        if !(1..=GEORDI_RAY_TRACED_FILM_DIMENSION_MAX).contains(&value) {
            push(
                issues,
                GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE,
                &format!("$.film.{field}"),
                "Film width and height must be in 1..=16384",
            );
        }
    }
}

fn validate_render_settings(
    render: &GeordiRayTracedRenderSettings,
    issues: &mut Vec<GeordiRayTracedSceneIssue>,
) {
    let literal_checks = [
        (
            render.integrator.as_str(),
            GEORDI_RAY_TRACED_INTEGRATOR_DIFFUSE_PATH,
            "$.render.integrator",
            GEORDI_E_RT_INTEGRATOR_UNSUPPORTED,
        ),
        (
            render.reconstruction.as_str(),
            GEORDI_RAY_TRACED_RECONSTRUCTION_BOX_FILTER,
            "$.render.reconstruction",
            GEORDI_E_RT_RECONSTRUCTION_UNSUPPORTED,
        ),
        (
            render.output.as_str(),
            GEORDI_RAY_TRACED_OUTPUT_RGBA8_SRGB_OPAQUE,
            "$.render.output",
            GEORDI_E_RT_OUTPUT_UNSUPPORTED,
        ),
    ];
    for (actual, expected, path, code) in literal_checks {
        if actual != expected {
            push(issues, code, path, &format!("Identity must be {expected}"));
        }
    }
    if !is_versioned_identity(&render.sampler) {
        push(
            issues,
            GEORDI_E_RT_SAMPLER_IDENTITY_INVALID,
            "$.render.sampler",
            "Sampler must be a versioned identity such as name/1",
        );
    }
    if !is_versioned_identity(&render.tone_curve) {
        push(
            issues,
            GEORDI_E_RT_TONE_CURVE_IDENTITY_INVALID,
            "$.render.toneCurve",
            "Tone curve must be a versioned identity such as name/1",
        );
    }
    if !is_valid_samples_per_pixel(render.samples_per_pixel) {
        push(
            issues,
            GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID,
            "$.render.samplesPerPixel",
            "samplesPerPixel must be a power of two in 1..=1024",
        );
    }
    if !(0..=GEORDI_RAY_TRACED_SEED_MAX).contains(&render.seed) {
        push(
            issues,
            GEORDI_E_RT_SEED_OUT_OF_RANGE,
            "$.render.seed",
            "seed must be in 0..=4294967295",
        );
    }
    if !(0..=GEORDI_RAY_TRACED_MAX_BOUNCES_MAX).contains(&render.max_bounces) {
        push(
            issues,
            GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE,
            "$.render.maxBounces",
            "maxBounces must be 0 or 1",
        );
    }
}

fn is_valid_samples_per_pixel(value: i64) -> bool {
    (1..=GEORDI_RAY_TRACED_SAMPLES_PER_PIXEL_MAX).contains(&value)
        && u64::try_from(value).is_ok_and(u64::is_power_of_two)
}

/// A versioned identity: `name/N` where `name` is lowercase ASCII letters, digits, `-` and `.`
/// starting with a letter or digit, and `N` is a positive decimal integer without leading zeros.
fn is_versioned_identity(value: &str) -> bool {
    let Some((name, version)) = value.split_once('/') else {
        return false;
    };
    let name_ok = name
        .bytes()
        .next()
        .is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit())
        && name.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'.'
        });
    let version_ok = version.bytes().next().is_some_and(|first| first != b'0')
        && version.bytes().all(|byte| byte.is_ascii_digit());
    name_ok && version_ok
}

/// `geordi-ray-traced-render-receipt/1`.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedRenderReceipt {
    /// Receipt version.
    pub receipt_version: String,
    /// Hash algorithm for every hash in the receipt: `sha256`.
    pub hash_algorithm: String,
    /// Scene artifact version.
    pub scene_version: String,
    /// `sha256:` over the canonical scene JSON bytes.
    pub scene_hash: String,
    /// Path of the rendered scene artifact.
    pub scene_path: String,
    /// Numeric profile of the scene.
    pub numeric_profile: String,
    /// One entry per declared mesh, in scene order.
    pub assets: Vec<GeordiRayTracedReceiptAsset>,
    /// Integrator identity.
    pub integrator: String,
    /// Sampler identity.
    pub sampler: String,
    /// Sampler seed.
    pub seed: i64,
    /// Samples per pixel.
    pub samples_per_pixel: i64,
    /// Maximum bounces.
    pub max_bounces: i64,
    /// Reconstruction filter identity.
    pub reconstruction: String,
    /// Tone curve identity.
    pub tone_curve: String,
    /// Output encoding identity.
    pub output: String,
    /// Runtime that produced the image.
    pub runtime: GeordiRayTracedReceiptRuntime,
    /// Image shape, format, encoding and hash.
    pub image: GeordiRayTracedReceiptImage,
}

/// One mesh asset in a receipt.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedReceiptAsset {
    /// Mesh id.
    pub id: String,
    /// Fixture-relative mesh path.
    pub path: String,
    /// `sha256:` of the mesh bytes.
    pub sha256: String,
    /// Mesh decode layout identity.
    pub layout: String,
}

/// Runtime identity in a receipt. Receipts that differ only here describe the same render input.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedReceiptRuntime {
    /// Runtime name.
    pub name: String,
    /// Runtime version.
    pub version: String,
    /// Bunny revision the runtime was built from.
    pub bunny_revision: String,
}

/// Image fields in a receipt.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRayTracedReceiptImage {
    /// Width in pixels.
    pub width: i64,
    /// Height in pixels.
    pub height: i64,
    /// Pixel format: `rgba8`.
    pub pixel_format: String,
    /// Output encoding identity, equal to the scene's `render.output`.
    pub encoding: String,
    /// `sha256:` over the raw RGBA8 bytes.
    pub image_hash: String,
}

/// Build a receipt for one render of `scene_source`.
///
/// The scene is parsed and validated, its hash is computed from canonical bytes, and the image
/// size must equal the film size.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` when the scene does not parse or validate, the image size
/// differs from the film (`GEORDI_E_RT_VIEWPORT_MISMATCH`), or a receipt field is invalid.
pub fn create_geordi_ray_traced_render_receipt(
    scene_source: &str,
    scene_path: &str,
    runtime: GeordiRayTracedReceiptRuntime,
    image_width: usize,
    image_height: usize,
    image_hash: &str,
) -> Result<GeordiRayTracedRenderReceipt, GeordiRayTracedSceneError> {
    let scene = parse_geordi_ray_traced_scene(scene_source)?;
    validate_geordi_ray_traced_scene(&scene)?;
    let scene_hash = geordi_ray_traced_scene_hash(scene_source)?;
    let width = i64::try_from(image_width).ok();
    let height = i64::try_from(image_height).ok();
    if width != Some(scene.film.width) || height != Some(scene.film.height) {
        return Err(GeordiRayTracedSceneError::single(
            GEORDI_E_RT_VIEWPORT_MISMATCH,
            "$.film",
            &format!(
                "Image is {image_width}x{image_height}; the film is {}x{}",
                scene.film.width, scene.film.height
            ),
        ));
    }
    let receipt = GeordiRayTracedRenderReceipt {
        receipt_version: GEORDI_RAY_TRACED_RENDER_RECEIPT_VERSION.to_owned(),
        hash_algorithm: GEORDI_HASH_ALGORITHM_SHA256.to_owned(),
        scene_version: scene.scene_version,
        scene_hash,
        scene_path: scene_path.to_owned(),
        numeric_profile: scene.numeric_profile,
        assets: scene
            .meshes
            .into_iter()
            .map(|mesh| GeordiRayTracedReceiptAsset {
                id: mesh.id,
                path: mesh.path,
                sha256: mesh.sha256,
                layout: mesh.layout,
            })
            .collect(),
        integrator: scene.render.integrator,
        sampler: scene.render.sampler,
        seed: scene.render.seed,
        samples_per_pixel: scene.render.samples_per_pixel,
        max_bounces: scene.render.max_bounces,
        reconstruction: scene.render.reconstruction,
        tone_curve: scene.render.tone_curve,
        output: scene.render.output.clone(),
        runtime,
        image: GeordiRayTracedReceiptImage {
            width: scene.film.width,
            height: scene.film.height,
            pixel_format: GEORDI_RAY_TRACED_PIXEL_FORMAT_RGBA8.to_owned(),
            encoding: scene.render.output,
            image_hash: image_hash.to_owned(),
        },
    };
    validate_geordi_ray_traced_render_receipt(&receipt)?;
    Ok(receipt)
}

/// Parse a `geordi-ray-traced-render-receipt/1` JSON string.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` with `GEORDI_E_RT_JSON_INVALID`, number-token or
/// `GEORDI_E_RT_RECEIPT_SHAPE` diagnostics.
pub fn parse_geordi_ray_traced_render_receipt(
    source: &str,
) -> Result<GeordiRayTracedRenderReceipt, GeordiRayTracedSceneError> {
    parse_integer_only_json::<GeordiRayTracedRenderReceipt>(source, GEORDI_E_RT_RECEIPT_SHAPE)
        .map(|(receipt, _value)| receipt)
}

/// Validate the fields of a ray-traced render receipt.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` with `GEORDI_E_RT_RECEIPT_FIELD_INVALID` diagnostics.
pub fn validate_geordi_ray_traced_render_receipt(
    receipt: &GeordiRayTracedRenderReceipt,
) -> Result<(), GeordiRayTracedSceneError> {
    let mut issues = Vec::new();
    let mut require = |ok: bool, path: &str, message: &str| {
        if !ok {
            push(
                &mut issues,
                GEORDI_E_RT_RECEIPT_FIELD_INVALID,
                path,
                message,
            );
        }
    };
    require(
        receipt.receipt_version == GEORDI_RAY_TRACED_RENDER_RECEIPT_VERSION,
        "$.receiptVersion",
        "Receipt version is not supported",
    );
    require(
        receipt.hash_algorithm == GEORDI_HASH_ALGORITHM_SHA256,
        "$.hashAlgorithm",
        "Hash algorithm must be sha256",
    );
    require(
        receipt.scene_version == GEORDI_RAY_TRACED_SCENE_VERSION,
        "$.sceneVersion",
        "Scene version is not supported",
    );
    require(
        is_geordi_sha256(&receipt.scene_hash),
        "$.sceneHash",
        "Scene hash is malformed",
    );
    require(
        !receipt.scene_path.is_empty(),
        "$.scenePath",
        "Scene path must not be empty",
    );
    require(
        receipt.numeric_profile == GEORDI_FIXED_Q32_32_NUMERIC_PROFILE,
        "$.numericProfile",
        "Numeric profile must be geordi-fixed-q32.32/1",
    );
    for (index, asset) in receipt.assets.iter().enumerate() {
        require(
            !asset.id.is_empty() && is_fixture_local_path(&asset.path),
            &format!("$.assets[{index}]"),
            "Asset id must be non-empty and its path fixture-local",
        );
        require(
            is_geordi_sha256(&asset.sha256),
            &format!("$.assets[{index}].sha256"),
            "Asset hash is malformed",
        );
        require(
            asset.layout == GEORDI_RAY_TRACED_MESH_LAYOUT_BUNNY_PLY_BINARY_LE_F32,
            &format!("$.assets[{index}].layout"),
            "Asset layout is not supported",
        );
    }
    require(
        receipt.integrator == GEORDI_RAY_TRACED_INTEGRATOR_DIFFUSE_PATH,
        "$.integrator",
        "Integrator is not supported",
    );
    require(
        is_versioned_identity(&receipt.sampler),
        "$.sampler",
        "Sampler is malformed",
    );
    require(
        is_versioned_identity(&receipt.tone_curve),
        "$.toneCurve",
        "Tone curve is malformed",
    );
    require(
        (0..=GEORDI_RAY_TRACED_SEED_MAX).contains(&receipt.seed),
        "$.seed",
        "Seed is out of range",
    );
    require(
        is_valid_samples_per_pixel(receipt.samples_per_pixel),
        "$.samplesPerPixel",
        "samplesPerPixel is invalid",
    );
    require(
        (0..=GEORDI_RAY_TRACED_MAX_BOUNCES_MAX).contains(&receipt.max_bounces),
        "$.maxBounces",
        "maxBounces is out of range",
    );
    require(
        receipt.reconstruction == GEORDI_RAY_TRACED_RECONSTRUCTION_BOX_FILTER,
        "$.reconstruction",
        "Reconstruction is not supported",
    );
    require(
        receipt.output == GEORDI_RAY_TRACED_OUTPUT_RGBA8_SRGB_OPAQUE,
        "$.output",
        "Output is not supported",
    );
    validate_receipt_runtime_and_image(receipt, &mut require);
    finish(issues)
}

fn validate_receipt_runtime_and_image(
    receipt: &GeordiRayTracedRenderReceipt,
    require: &mut impl FnMut(bool, &str, &str),
) {
    let runtime = &receipt.runtime;
    require(
        !runtime.name.is_empty(),
        "$.runtime.name",
        "Runtime name must not be empty",
    );
    require(
        !runtime.version.is_empty(),
        "$.runtime.version",
        "Runtime version must not be empty",
    );
    require(
        !runtime.bunny_revision.is_empty(),
        "$.runtime.bunnyRevision",
        "Bunny revision must not be empty",
    );
    let image = &receipt.image;
    for (field, value) in [("width", image.width), ("height", image.height)] {
        require(
            (1..=GEORDI_RAY_TRACED_FILM_DIMENSION_MAX).contains(&value),
            &format!("$.image.{field}"),
            "Image dimension is out of range",
        );
    }
    require(
        image.pixel_format == GEORDI_RAY_TRACED_PIXEL_FORMAT_RGBA8,
        "$.image.pixelFormat",
        "Pixel format must be rgba8",
    );
    require(
        image.encoding == receipt.output,
        "$.image.encoding",
        "Image encoding must equal the output identity",
    );
    require(
        is_geordi_sha256(&image.image_hash),
        "$.image.imageHash",
        "Image hash is malformed",
    );
}

/// Canonical JSON bytes of a receipt: keys sorted, two-space indentation, final newline.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` if serialization fails.
pub fn geordi_ray_traced_render_receipt_canonical_json(
    receipt: &GeordiRayTracedRenderReceipt,
) -> Result<String, GeordiRayTracedSceneError> {
    let value = serde_json::to_value(receipt).map_err(|error| {
        GeordiRayTracedSceneError::single(GEORDI_E_RT_RECEIPT_SHAPE, "$", &error.to_string())
    })?;
    canonical_json_string(&value)
}

/// The receipt's own hash: `sha256:` over its canonical JSON bytes.
///
/// # Errors
///
/// Returns `GeordiRayTracedSceneError` if serialization fails.
pub fn geordi_ray_traced_render_receipt_hash(
    receipt: &GeordiRayTracedRenderReceipt,
) -> Result<String, GeordiRayTracedSceneError> {
    geordi_ray_traced_render_receipt_canonical_json(receipt)
        .map(|canonical| geordi_sha256_from_bytes(canonical.as_bytes()))
}

#[cfg(test)]
mod tests;
