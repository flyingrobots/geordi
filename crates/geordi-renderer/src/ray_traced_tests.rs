use super::{
    GeordiRayTracedArtifactProfile, GeordiRayTracedRuntimeProfile, RenderedImage,
    assert_ray_traced_runtime_profile,
};
use geordi_ir::{
    GEORDI_FIXED_Q32_32_NUMERIC_PROFILE, GEORDI_NUMERIC_PROFILE,
    GEORDI_RAY_TRACED_INTEGRATOR_DIFFUSE_PATH, GEORDI_RAY_TRACED_KNOWN_REQUIREMENTS,
    GEORDI_RAY_TRACED_MESH_LAYOUT_BUNNY_PLY_BINARY_LE_F32,
    GEORDI_RAY_TRACED_OUTPUT_RGBA8_SRGB_OPAQUE, GEORDI_RAY_TRACED_RECONSTRUCTION_BOX_FILTER,
    GEORDI_RAY_TRACED_SCENE_VERSION, GeordiRayTracedScene, load_geordi_ray_traced_scene,
};
use std::error::Error;
use std::path::PathBuf;

type TestResult = Result<(), Box<dyn Error>>;
type SceneMutation = fn(&mut GeordiRayTracedScene);

const ARTIFACTS: &[GeordiRayTracedArtifactProfile] = &[GeordiRayTracedArtifactProfile {
    scene_version: GEORDI_RAY_TRACED_SCENE_VERSION,
    numeric_profile: GEORDI_FIXED_Q32_32_NUMERIC_PROFILE,
}];

/// A test-only profile that implements the reference fixture's placeholder identities.
const TEST_PROFILE: GeordiRayTracedRuntimeProfile = GeordiRayTracedRuntimeProfile {
    artifacts: ARTIFACTS,
    requirements: GEORDI_RAY_TRACED_KNOWN_REQUIREMENTS,
    mesh_layouts: &[GEORDI_RAY_TRACED_MESH_LAYOUT_BUNNY_PLY_BINARY_LE_F32],
    integrators: &[GEORDI_RAY_TRACED_INTEGRATOR_DIFFUSE_PATH],
    samplers: &["fixture-placeholder-sampler/1"],
    tone_curves: &["fixture-placeholder-tone-curve/1"],
    reconstructions: &[GEORDI_RAY_TRACED_RECONSTRUCTION_BOX_FILTER],
    outputs: &[GEORDI_RAY_TRACED_OUTPUT_RGBA8_SRGB_OPAQUE],
};

fn reference_scene() -> Result<GeordiRayTracedScene, Box<dyn Error>> {
    Ok(load_geordi_ray_traced_scene(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/ray-traced-scene/reference.rt-scene.geordi.json"),
    )?)
}

#[test]
fn from_rgba8_accepts_exactly_width_times_height_times_four_bytes() -> TestResult {
    let image = RenderedImage::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 255, 0, 255])?;
    assert_eq!((image.width(), image.height()), (2, 1));
    assert_eq!(image.pixel_at(1, 0), Some([0, 255, 0, 255]));
    assert_eq!(image.pixel_at(2, 0), None);
    // Oracle: Python hashlib.sha256 over the same eight bytes.
    assert_eq!(
        image.image_hash(),
        "sha256:8e56467a23ff16f4059b738417081abf48600e4d0d9958217178f2d5d4ca93f8"
    );
    assert!(
        RenderedImage::from_rgba8(0, 7, Vec::new())?
            .rgba()
            .is_empty()
    );
    Ok(())
}

#[test]
fn from_rgba8_matches_the_internal_zeroed_constructor() -> TestResult {
    assert_eq!(
        RenderedImage::from_rgba8(3, 2, vec![0; 24])?,
        RenderedImage::new(3, 2)?
    );
    Ok(())
}

#[test]
fn from_rgba8_rejects_wrong_lengths_on_both_sides() -> TestResult {
    for len in [23, 25, 0] {
        let error = RenderedImage::from_rgba8(3, 2, vec![0; len])
            .err()
            .ok_or("wrong length was accepted")?;
        assert_eq!(error.expected_len(), Some(24));
        assert_eq!(error.actual_len(), len);
    }
    Ok(())
}

#[test]
fn from_rgba8_rejects_overflowing_dimensions() -> TestResult {
    for (width, height) in [(usize::MAX, 2), (usize::MAX / 4 + 1, 1), (2, usize::MAX)] {
        let error = RenderedImage::from_rgba8(width, height, Vec::new())
            .err()
            .ok_or("overflowing size was accepted")?;
        assert_eq!(error.expected_len(), None);
        assert_eq!((error.width(), error.height()), (width, height));
    }
    Ok(())
}

#[test]
fn ray_traced_profile_accepts_the_reference_scene() -> TestResult {
    assert_ray_traced_runtime_profile(&reference_scene()?, &TEST_PROFILE)?;
    Ok(())
}

#[test]
fn ray_traced_profile_rejects_an_unsupported_artifact_pair_first() -> TestResult {
    let mut scene = reference_scene()?;
    scene.numeric_profile = GEORDI_NUMERIC_PROFILE.to_owned();
    scene.render.sampler = "other-sampler/1".to_owned();
    let error = assert_ray_traced_runtime_profile(&scene, &TEST_PROFILE)
        .err()
        .ok_or("binary64 scene was accepted")?;
    assert_eq!(
        error.requirement(),
        "sceneVersion=geordi-ray-traced-scene/1+numericProfile=geordi-finite-binary64/1"
    );
    assert_eq!(
        error.supported(),
        "artifacts=geordi-ray-traced-scene/1+geordi-fixed-q32.32/1"
    );
    Ok(())
}

#[test]
fn ray_traced_profile_rejects_each_unimplemented_identity() -> TestResult {
    let cases: [(SceneMutation, &str); 7] = [
        (
            |scene| scene.requires.push("light.point".to_owned()),
            "requires=light.point",
        ),
        (
            |scene| scene.meshes[0].layout = "x/1".to_owned(),
            "layout=x/1",
        ),
        (
            |scene| scene.render.integrator = "x/1".to_owned(),
            "integrator=x/1",
        ),
        (
            |scene| scene.render.sampler = "x/1".to_owned(),
            "sampler=x/1",
        ),
        (
            |scene| scene.render.tone_curve = "x/1".to_owned(),
            "toneCurve=x/1",
        ),
        (
            |scene| scene.render.reconstruction = "x/1".to_owned(),
            "reconstruction=x/1",
        ),
        (|scene| scene.render.output = "x/1".to_owned(), "output=x/1"),
    ];
    for (mutate, expected) in cases {
        let mut scene = reference_scene()?;
        mutate(&mut scene);
        let error = assert_ray_traced_runtime_profile(&scene, &TEST_PROFILE)
            .err()
            .ok_or_else(|| format!("{expected} was accepted"))?;
        assert_eq!(error.requirement(), expected);
    }
    Ok(())
}
