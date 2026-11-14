//! Fidelity of the Bunny Q32.32 render path against the binary64 path it replaced.
//!
//! Oracles:
//!
//! - `binary64_reference` is the camera, projection and edge-drawing code of `bunny.rs` at commit
//!   `fe8b95b` (the last binary64 version), copied with only `pub(super)` visibility added. It is the
//!   differential oracle for the whole frame and for every projected position.
//! - The recorded digests are change detectors (class 5): SHA-256 of the RGBA bytes that commit
//!   `fe8b95b` rendered, recorded by running that commit, not this one.

use super::q32_boundary::fixed_to_f64;
use super::{
    BunnyImage, LoadedBunnyFixture, NativeBunnyError, bunny_fixed_projection,
    create_bunny_frame_report, load_bunny_fixture, normalize_vector3, project_mesh_position,
    render_bunny_wireframe, rotate_around_axis,
};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// One full turn: `2 pi / (pi / 4 rad/s) = 8 s` at 60 frames per second.
const FRAMES_PER_TURN: u64 = 480;

/// Error budget for one view-space coordinate of the Q32.32 path, in raw units (`2^-32`).
///
/// From Bunny's stated bounds, for a camera at most about one unit from the point: rounding the
/// rotated position and the eye (half a raw unit per coordinate, under 0.9 raw units each after
/// the dot product with a unit row), the look-at basis (at most one raw unit per component, so
/// under 2 raw units over an offset whose components sum to under 2), and the four rounded
/// products and the rounded translation entry (half a raw unit each, 2.5). That is under 7; the
/// budget is 8.
const VIEW_ERROR_RAW_UNITS: f64 = 8.0;

/// Allowance in pixels for the steps after the divide: half a raw NDC unit times half the
/// viewport (`256 * 2^-33`), the viewport floor (`2^-32`), and the binary64 reference's own error.
const PIXEL_SLACK_PX: f64 = 1.0 / 16_777_216.0;

/// The largest pixel distance the Q32.32 path may have from the binary64 path for one position.
///
/// A view-space error `e` moves NDC `x` by at most `focal / depth * (1 + |ndc|) * e`, and one NDC
/// unit is half the viewport in pixels.
fn position_bound_px(
    context: binary64_reference::ProjectionContext,
    position: [f64; 3],
    angle_radians: f64,
) -> f64 {
    let rotated = rotate_around_axis(position, context.axis, angle_radians);
    let delta = binary64_reference::subtract_vector3(rotated, context.camera.eye);
    let depth = binary64_reference::dot_vector3(delta, context.camera.forward);
    let ndc_x = context.focal_length * binary64_reference::dot_vector3(delta, context.camera.right);
    let ndc_y = context.focal_length * binary64_reference::dot_vector3(delta, context.camera.up);
    let ndc_extent = (ndc_x / depth).abs().max((ndc_y / depth).abs());
    let pixels_per_view_unit =
        context.width.max(context.height) / 2.0 * context.focal_length / depth;
    let view_error = VIEW_ERROR_RAW_UNITS / 4_294_967_296.0;
    (pixels_per_view_unit * (1.0 + ndc_extent)).mul_add(view_error, PIXEL_SLACK_PX)
}

mod binary64_reference {
    use super::super::{
        BunnyImage, BunnyMeshCamera, BunnyMeshFixtureManifest, BunnyRenderStyle, PlyMesh,
        draw_line, normalize_vector3, rotate_around_axis, rounded_i32,
    };

    #[derive(Clone, Copy, Debug, PartialEq)]
    pub(super) struct ProjectedPoint {
        pub(super) visible: bool,
        pub(super) x: f64,
        pub(super) y: f64,
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    pub(super) struct CameraBasis {
        pub(super) eye: [f64; 3],
        pub(super) forward: [f64; 3],
        pub(super) right: [f64; 3],
        pub(super) up: [f64; 3],
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    pub(super) struct ProjectionContext {
        pub(super) axis: [f64; 3],
        pub(super) camera: CameraBasis,
        pub(super) far: f64,
        pub(super) focal_length: f64,
        pub(super) height: f64,
        pub(super) near: f64,
        pub(super) width: f64,
    }

    pub(super) fn render_bunny_wireframe(
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

    pub(super) fn draw_projected_edge(
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

    pub(super) fn project_position(
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

    pub(super) fn projection_context(fixture: &BunnyMeshFixtureManifest) -> ProjectionContext {
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

    pub(super) fn camera_basis(camera: &BunnyMeshCamera) -> CameraBasis {
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

    pub(super) fn subtract_vector3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
        [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
    }

    pub(super) fn dot_vector3(left: [f64; 3], right: [f64; 3]) -> f64 {
        left[2].mul_add(right[2], left[0].mul_add(right[0], left[1] * right[1]))
    }

    pub(super) fn cross_vector3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
        [
            left[1].mul_add(right[2], -(left[2] * right[1])),
            left[2].mul_add(right[0], -(left[0] * right[2])),
            left[0].mul_add(right[1], -(left[1] * right[0])),
        ]
    }

    pub(super) fn usize_to_f64(value: usize) -> f64 {
        value.to_string().parse::<f64>().unwrap_or(0.0)
    }
}

fn bunny_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/render-everywhere/assets/stanford-bunny")
}

fn frame_angle(loaded: &LoadedBunnyFixture, frame_index: u64) -> f64 {
    create_bunny_frame_report(
        frame_index,
        &loaded.report.asset_hash,
        &loaded.mesh,
        &loaded.fixture,
    )
    .angle_radians
}

fn render_frame(loaded: &LoadedBunnyFixture, frame_index: u64) -> BunnyImage {
    render_bunny_wireframe(
        &loaded.mesh,
        &loaded.fixture,
        &loaded.projection,
        loaded.style,
        frame_angle(loaded, frame_index),
    )
}

fn differing_pixels(left: &BunnyImage, right: &BunnyImage) -> usize {
    left.rgba
        .chunks_exact(4)
        .zip(right.rgba.chunks_exact(4))
        .filter(|(left, right)| left != right)
        .count()
}

/// The number of positions compared, the largest per-axis pixel distance seen, and the largest
/// ratio of a distance to its bound.
#[derive(Debug, Default)]
struct PositionComparison {
    compared: usize,
    max_distance_px: f64,
    max_share_of_bound: f64,
}

impl PositionComparison {
    fn record(
        &mut self,
        fixed: Option<bunny_linalg::FixedVec3>,
        reference: binary64_reference::ProjectedPoint,
        bound_px: f64,
        case: &str,
    ) {
        assert_eq!(
            fixed.is_some(),
            reference.visible,
            "visibility differs for {case}"
        );
        let Some(fixed) = fixed else { return };
        let distance = (fixed_to_f64(fixed.x) - reference.x)
            .abs()
            .max((fixed_to_f64(fixed.y) - reference.y).abs());
        assert!(
            distance <= bound_px,
            "{case}: Q32.32 ({}, {}) vs binary64 ({}, {}) differ by {distance} px, bound {bound_px}",
            fixed_to_f64(fixed.x),
            fixed_to_f64(fixed.y),
            reference.x,
            reference.y
        );
        self.compared += 1;
        self.max_distance_px = self.max_distance_px.max(distance);
        self.max_share_of_bound = self.max_share_of_bound.max(distance / bound_px);
    }
}

/// `SplitMix64`, so the generated cases are the same on every run and every machine.
struct SplitMix64(u64);

impl SplitMix64 {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }

    /// A value in `[low, high)` from the top 21 bits of the next output.
    fn uniform(&mut self, low: f64, high: f64) -> f64 {
        let unit =
            f64::from(u32::try_from(self.next_u64() >> 43).unwrap_or(0)) / f64::from(1_u32 << 21);
        (high - low).mul_add(unit, low)
    }
}

#[test]
fn every_frame_of_a_full_turn_draws_the_same_pixels_as_the_binary64_path()
-> Result<(), NativeBunnyError> {
    let loaded = load_bunny_fixture(&bunny_path(), 0)?;

    for frame_index in 0..FRAMES_PER_TURN {
        let fixed = render_frame(&loaded, frame_index);
        let reference = binary64_reference::render_bunny_wireframe(
            &loaded.mesh,
            &loaded.fixture,
            loaded.style,
            frame_angle(&loaded, frame_index),
        );
        assert_eq!(
            differing_pixels(&fixed, &reference),
            0,
            "frame {frame_index}"
        );
    }
    Ok(())
}

#[test]
fn fixture_vertex_positions_stay_within_the_bound_of_the_binary64_path()
-> Result<(), NativeBunnyError> {
    let loaded = load_bunny_fixture(&bunny_path(), 0)?;
    let reference_context = binary64_reference::projection_context(&loaded.fixture);
    let axis = normalize_vector3(loaded.fixture.playback.axis);
    let mut comparison = PositionComparison::default();

    for frame_index in (0..FRAMES_PER_TURN).step_by(8) {
        let angle = frame_angle(&loaded, frame_index);
        for (vertex_index, vertex) in loaded.mesh.vertices.iter().enumerate() {
            comparison.record(
                project_mesh_position(vertex.position, axis, angle, &loaded.projection),
                binary64_reference::project_position(vertex.position, reference_context, angle),
                position_bound_px(reference_context, vertex.position, angle),
                &format!("frame {frame_index} vertex {vertex_index}"),
            );
        }
    }

    eprintln!("fixture positions: {comparison:?}");
    assert_eq!(comparison.compared, 60 * loaded.mesh.vertices.len());
    Ok(())
}

#[test]
fn generated_cameras_and_points_stay_within_the_bound_of_the_binary64_path()
-> Result<(), NativeBunnyError> {
    const SEED: u64 = 0x6765_6f72_6469_0154;
    const CAMERAS: usize = 2_000;
    const POINTS_PER_CAMERA: usize = 16;
    let mut fixture = load_bunny_fixture(&bunny_path(), 0)?.fixture;
    let mut random = SplitMix64(SEED);
    let mut comparison = PositionComparison::default();

    for camera_index in 0..CAMERAS {
        let target = [0.0, 0.1, 0.0].map(|centre: f64| centre + random.uniform(-0.05, 0.05));
        let height = random.uniform(-0.8, 0.8);
        let azimuth = random.uniform(0.0, std::f64::consts::TAU);
        let distance = random.uniform(0.3, 1.0);
        let ring = height.mul_add(-height, 1.0).sqrt();
        fixture.camera.target = target;
        fixture.camera.eye = [
            (distance * ring).mul_add(azimuth.cos(), target[0]),
            distance.mul_add(height, target[1]),
            (distance * ring).mul_add(azimuth.sin(), target[2]),
        ];
        fixture.projection.vertical_fov_radians = random.uniform(0.3, 1.5);
        let projection =
            bunny_fixed_projection(&fixture).map_err(NativeBunnyError::ManifestValidation)?;
        let reference_context = binary64_reference::projection_context(&fixture);
        let axis = normalize_vector3(fixture.playback.axis);

        for point_index in 0..POINTS_PER_CAMERA {
            let position = [0.0, 0.1, 0.0].map(|centre: f64| centre + random.uniform(-0.1, 0.1));
            let angle = random.uniform(0.0, std::f64::consts::TAU);
            comparison.record(
                project_mesh_position(position, axis, angle, &projection),
                binary64_reference::project_position(position, reference_context, angle),
                position_bound_px(reference_context, position, angle),
                &format!("seed {SEED:#x} camera {camera_index} point {point_index}"),
            );
        }
    }

    eprintln!("generated positions (seed {SEED:#x}): {comparison:?}");
    assert_eq!(comparison.compared, CAMERAS * POINTS_PER_CAMERA);
    Ok(())
}

#[test]
fn rendered_frames_match_the_digests_recorded_from_the_binary64_path()
-> Result<(), NativeBunnyError> {
    // Recorded at fe8b95b: SHA-256 of `render_bunny_wireframe(..).rgba` for each frame index.
    const RECORDED: [(u64, &str); 5] = [
        (
            0,
            "715b2be2d48e2a1390e8fe406b1cfe214b4570bd35e3b802d8aa5fad37e5bb46",
        ),
        (
            15,
            "9fb6af1c24a718cad4b26871221d404f45d77562dda28a19e7903f347a1234cd",
        ),
        (
            60,
            "0103d564e4c2cc184621b37babe326713aaf8f0387f217195c08afadf28b8ec5",
        ),
        (
            120,
            "bbd7422bec2faaf83915ff7289ede0ccd7e60632e2f865562da10adf543aeadf",
        ),
        (
            479,
            "b264a5f8fa9bff13f5f5451e0c9f5e562dc3632685bf091c0101e525a8476c86",
        ),
    ];
    let loaded = load_bunny_fixture(&bunny_path(), 0)?;

    for (frame_index, recorded) in RECORDED {
        let digest = Sha256::digest(&render_frame(&loaded, frame_index).rgba);
        assert_eq!(format!("{digest:x}"), recorded, "frame {frame_index}");
    }
    Ok(())
}
