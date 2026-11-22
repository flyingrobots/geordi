//! Constructed cases for the Q32.32 camera and projection path.
//!
//! Oracle: the perspective and viewport formulas of Bunny's coordinate law worked out by hand for
//! an axis-aligned camera, where every intermediate value is exact in Q32.32.

use super::{FixedProjection, FixedProjectionError, FixedProjectionField, FixedProjectionSpec};
use bunny_linalg::{FixedVec3, LookAtError, ProjectionError, ViewportError};
use bunny_num::FixedQ32_32;

const RAW_ONE: i64 = 1 << 32;

/// Camera at `z = 1` looking at the origin, `tan(fov / 2) = 1`, depth range `[0.5, 4]`.
fn axis_aligned_spec(width: usize, height: usize) -> FixedProjectionSpec {
    FixedProjectionSpec {
        eye: [0.0, 0.0, 1.0],
        far: 4.0,
        height,
        near: 0.5,
        target: [0.0, 0.0, 0.0],
        up: [0.0, 1.0, 0.0],
        // tan(pi / 4) is 0.9999999999999999 in binary64, which rounds to exactly 1 in Q32.32.
        vertical_fov_radians: std::f64::consts::FRAC_PI_2,
        width,
    }
}

fn point_raw(x: i64, y: i64, z: i64) -> FixedVec3 {
    FixedVec3::new(
        FixedQ32_32::from_raw(x),
        FixedQ32_32::from_raw(y),
        FixedQ32_32::from_raw(z),
    )
}

fn pixel_xy(projection: &FixedProjection, world: FixedVec3) -> Option<(i64, i64)> {
    projection
        .project(world)
        .map(|pixel| (pixel.x.raw(), pixel.y.raw()))
}

#[test]
fn axis_aligned_camera_maps_points_to_exact_pixel_positions() -> Result<(), FixedProjectionError> {
    let projection = FixedProjection::try_new(&axis_aligned_spec(512, 512))?;

    // At distance 1 with tan = 1, NDC equals the view-space x and y.
    assert_eq!(
        pixel_xy(&projection, point_raw(0, 0, 0)),
        Some((256 * RAW_ONE, 256 * RAW_ONE))
    );
    assert_eq!(
        pixel_xy(&projection, point_raw(RAW_ONE / 2, RAW_ONE / 4, 0)),
        Some((384 * RAW_ONE, 192 * RAW_ONE))
    );
    // NDC (-1, +1) is the top-left corner: pixel y runs down.
    assert_eq!(
        pixel_xy(&projection, point_raw(-RAW_ONE, RAW_ONE, 0)),
        Some((0, 0))
    );
    // At distance 2 the same offset lands half as far from the centre.
    assert_eq!(
        pixel_xy(&projection, point_raw(RAW_ONE, 0, -RAW_ONE)),
        Some((384 * RAW_ONE, 256 * RAW_ONE))
    );
    Ok(())
}

#[test]
fn projected_depth_runs_from_zero_at_near_to_one_at_far() -> Result<(), FixedProjectionError> {
    let projection = FixedProjection::try_new(&axis_aligned_spec(512, 512))?;
    let depth = |z_raw| {
        projection
            .project(point_raw(0, 0, z_raw))
            .map(|p| p.z.raw())
    };

    // Near plane at world z = 0.5, far plane at world z = -3.
    assert_eq!(depth(RAW_ONE / 2), Some(0));
    assert_eq!(depth(-3 * RAW_ONE), Some(RAW_ONE));
    Ok(())
}

#[test]
fn depth_range_keeps_both_planes_and_drops_points_one_raw_unit_outside()
-> Result<(), FixedProjectionError> {
    let projection = FixedProjection::try_new(&axis_aligned_spec(512, 512))?;
    let visible = |z_raw| projection.project(point_raw(0, 0, z_raw)).is_some();

    assert!(visible(RAW_ONE / 2), "point on the near plane is kept");
    assert!(
        !visible(RAW_ONE / 2 + 1),
        "point one raw unit nearer than near is dropped"
    );
    assert!(visible(-3 * RAW_ONE), "point on the far plane is kept");
    assert!(
        !visible(-3 * RAW_ONE - 1),
        "point one raw unit beyond far is dropped"
    );
    assert!(!visible(2 * RAW_ONE), "point behind the camera is dropped");
    Ok(())
}

#[test]
fn non_square_viewport_divides_x_by_the_aspect_ratio() -> Result<(), FixedProjectionError> {
    let projection = FixedProjection::try_new(&axis_aligned_spec(1024, 512))?;

    // aspect = 2, so view x = 1 at distance 1 is NDC x = 0.5: pixel (0.5 + 1) * 1024 / 2 = 768.
    assert_eq!(
        pixel_xy(&projection, point_raw(RAW_ONE, RAW_ONE / 2, 0)),
        Some((768 * RAW_ONE, 128 * RAW_ONE))
    );
    Ok(())
}

#[test]
fn degenerate_cameras_are_refused_with_bunny_look_at_errors() {
    let mut coincident = axis_aligned_spec(512, 512);
    coincident.target = coincident.eye;
    let mut parallel = axis_aligned_spec(512, 512);
    parallel.up = [0.0, 0.0, -2.0];

    assert_eq!(
        FixedProjection::try_new(&coincident),
        Err(FixedProjectionError::LookAt(
            LookAtError::CoincidentEyeTarget
        ))
    );
    assert_eq!(
        FixedProjection::try_new(&parallel),
        Err(FixedProjectionError::LookAt(LookAtError::ParallelUp))
    );
}

#[test]
fn invalid_projections_are_refused_with_bunny_projection_errors() {
    let mut depth = axis_aligned_spec(512, 512);
    depth.near = 4.0;
    // tan(2) is negative: a vertical field of view above pi has no perspective projection.
    let mut wide = axis_aligned_spec(512, 512);
    wide.vertical_fov_radians = 4.0;

    assert_eq!(
        FixedProjection::try_new(&depth),
        Err(FixedProjectionError::Projection(
            ProjectionError::InvalidDepthRange
        ))
    );
    assert_eq!(
        FixedProjection::try_new(&wide),
        Err(FixedProjectionError::Projection(
            ProjectionError::NonPositiveExtent
        ))
    );
}

#[test]
fn values_outside_the_q32_range_are_refused_with_their_field() {
    let mut eye = axis_aligned_spec(512, 512);
    eye.eye = [0.0, f64::NAN, 1.0];
    let mut far = axis_aligned_spec(512, 512);
    far.far = 3.0e6;
    // tan(pi / 2 - 1e-9) is about 1e9 units, raw 2^62: outside the safe-integer range.
    let mut fov = axis_aligned_spec(512, 512);
    fov.vertical_fov_radians = std::f64::consts::PI - 2.0e-9;

    assert_eq!(
        FixedProjection::try_new(&eye),
        Err(FixedProjectionError::Unrepresentable(
            FixedProjectionField::Eye
        ))
    );
    assert_eq!(
        FixedProjection::try_new(&far),
        Err(FixedProjectionError::Unrepresentable(
            FixedProjectionField::Far
        ))
    );
    assert_eq!(
        FixedProjection::try_new(&fov),
        Err(FixedProjectionError::Unrepresentable(
            FixedProjectionField::TanHalfVerticalFov
        ))
    );
}

#[test]
fn viewport_sizes_are_checked() {
    let empty = axis_aligned_spec(0, 512);
    let too_wide_for_q32 = axis_aligned_spec(1 << 31, 512);

    assert_eq!(
        FixedProjection::try_new(&empty),
        Err(FixedProjectionError::Viewport(Some(
            ViewportError::EmptyExtent
        )))
    );
    assert_eq!(
        FixedProjection::try_new(&too_wide_for_q32),
        Err(FixedProjectionError::Viewport(None))
    );
}

#[test]
fn errors_name_the_fixture_field_they_refer_to() {
    let cases = [
        (
            FixedProjectionError::LookAt(LookAtError::ParallelUp),
            "$.camera.up",
        ),
        (
            FixedProjectionError::LookAt(LookAtError::CoincidentEyeTarget),
            "$.camera.target",
        ),
        (
            FixedProjectionError::Unrepresentable(FixedProjectionField::TanHalfVerticalFov),
            "$.projection.verticalFovRadians",
        ),
        (
            FixedProjectionError::Projection(ProjectionError::InvalidDepthRange),
            "$.projection",
        ),
        (
            FixedProjectionError::Viewport(None),
            "$.projection.viewport",
        ),
    ];

    for (error, path) in cases {
        assert_eq!(error.manifest_issue().0, path, "{error:?}");
    }
}
