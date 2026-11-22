//! The bunny demo's camera, projection, depth-range test and viewport mapping on Bunny Q32.32.
//!
//! This module owns the path from a world-space position to a continuous viewport position. Every
//! step is a Bunny 0.7.1 function:
//!
//! 1. `FixedMat4::try_look_at` builds `view_from_world` (camera looks down `-Z`).
//! 2. Two `FixedPlane3` planes in view space keep points whose distance in front of the camera is
//!    in `[near, far]`, both ends included (`PlaneSide::On` is kept).
//! 3. `FixedMat4::try_perspective` builds `clip_from_view`; NDC is clip `xyz` divided by
//!    `w = -z_view` with `FixedQ32_32::checked_div`.
//! 4. `Viewport::try_ndc_to_viewport` maps NDC to pixels: origin top-left, `y` down, integers on
//!    pixel corners.
//!
//! Bunny's `FixedMat4` has no point-transform method yet, so the affine rows of each matrix are
//! read into a `FixedAffine3` and applied with `checked_transform_point`. The two row shapes this
//! relies on (`(0, 0, 0, 1)` for the view matrix, `(0, 0, -1, 0)` for the projection) are Bunny's
//! documented contract and are checked when the projection is built.

use super::q32_boundary::{fixed_from_f64, fixed_from_u32};
use bunny_geom::{FixedPlane3, PlaneSide};
use bunny_linalg::{
    FixedAffine3, FixedMat3, FixedMat4, FixedVec3, LookAtError, ProjectionError, Viewport,
    ViewportError,
};
use bunny_num::FixedQ32_32;

/// Binary64 camera and projection parameters as the fixture states them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct FixedProjectionSpec {
    pub(super) eye: [f64; 3],
    pub(super) far: f64,
    pub(super) height: usize,
    pub(super) near: f64,
    pub(super) target: [f64; 3],
    pub(super) up: [f64; 3],
    pub(super) vertical_fov_radians: f64,
    pub(super) width: usize,
}

/// Why the fixture's camera or projection cannot be built in Q32.32.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum FixedProjectionError {
    /// A binary64 input is outside the accepted Q32.32 range; the value is the fixture field.
    Unrepresentable(FixedProjectionField),
    /// Bunny refused the look-at camera.
    LookAt(LookAtError),
    /// Bunny refused the perspective parameters.
    Projection(ProjectionError),
    /// Bunny refused the viewport size, or it does not fit `u32` pixels.
    Viewport(Option<ViewportError>),
    /// A Bunny matrix did not have the row shape its documentation states.
    UnexpectedMatrixRow,
}

/// The fixture field a conversion failure refers to.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum FixedProjectionField {
    Eye,
    Far,
    Near,
    Target,
    TanHalfVerticalFov,
    Up,
}

/// A camera and perspective projection ready to map world positions to viewport positions.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct FixedProjection {
    clip_xyz_from_view: FixedAffine3,
    far_plane: FixedPlane3,
    near_plane: FixedPlane3,
    view_from_world: FixedAffine3,
    viewport: Viewport,
}

impl FixedProjection {
    /// Converts the fixture's binary64 parameters and builds the Bunny matrices.
    ///
    /// The tangent of half the vertical field of view is computed in binary64 and then rounded to
    /// Q32.32, because Bunny 0.7.1 has no tangent; Bunny's perspective builder takes that tangent.
    pub(super) fn try_new(spec: &FixedProjectionSpec) -> Result<Self, FixedProjectionError> {
        use FixedProjectionField as Field;
        let eye = fixed_vec3(spec.eye, Field::Eye)?;
        let target = fixed_vec3(spec.target, Field::Target)?;
        let up = fixed_vec3(spec.up, Field::Up)?;
        let near = fixed_scalar(spec.near, Field::Near)?;
        let far = fixed_scalar(spec.far, Field::Far)?;
        let tan_half_fov = fixed_scalar(
            (spec.vertical_fov_radians / 2.0).tan(),
            Field::TanHalfVerticalFov,
        )?;
        let viewport = viewport(spec.width, spec.height)?;
        let aspect = aspect_ratio(viewport)?;

        let view = FixedMat4::try_look_at(eye, target, up).map_err(FixedProjectionError::LookAt)?;
        let projection = FixedMat4::try_perspective(tan_half_fov, aspect, near, far)
            .map_err(FixedProjectionError::Projection)?;
        let zero = FixedQ32_32::ZERO;
        let minus_one = FixedQ32_32::from_raw(-(1_i64 << 32));
        if view.row3() != (zero, zero, zero, FixedQ32_32::ONE)
            || projection.row3() != (zero, zero, minus_one, zero)
        {
            return Err(FixedProjectionError::UnexpectedMatrixRow);
        }

        Ok(Self {
            clip_xyz_from_view: affine_rows(projection),
            far_plane: FixedPlane3::new(
                FixedVec3::new(zero, zero, FixedQ32_32::ONE),
                far.checked_neg()
                    .ok_or(FixedProjectionError::Unrepresentable(Field::Far))?,
            ),
            near_plane: FixedPlane3::new(FixedVec3::new(zero, zero, minus_one), near),
            view_from_world: affine_rows(view),
            viewport,
        })
    }

    /// Maps a world-space position to a continuous viewport position.
    ///
    /// Returns `None` when the point is nearer than `near` or farther than `far` from the camera,
    /// or when a checked Q32.32 step overflows. The demo draws no edge with such an endpoint.
    pub(super) fn project(&self, world: FixedVec3) -> Option<FixedVec3> {
        let view = self.view_from_world.checked_transform_point(world)?;
        for plane in [self.near_plane, self.far_plane] {
            if plane.classify(view)? == PlaneSide::Behind {
                return None;
            }
        }

        let clip = self.clip_xyz_from_view.checked_transform_point(view)?;
        let w = view.z.checked_neg()?;
        let ndc = FixedVec3::new(
            clip.x.checked_div(w)?,
            clip.y.checked_div(w)?,
            clip.z.checked_div(w)?,
        );
        self.viewport.try_ndc_to_viewport(ndc).ok()
    }
}

impl FixedProjectionError {
    /// The fixture JSON path and the validation message for this error.
    pub(super) fn manifest_issue(self) -> (&'static str, String) {
        match self {
            Self::Unrepresentable(field) => {
                let (path, label) = match field {
                    FixedProjectionField::Eye => ("$.camera.eye", "Camera eye"),
                    FixedProjectionField::Far => ("$.projection.far", "Projection far"),
                    FixedProjectionField::Near => ("$.projection.near", "Projection near"),
                    FixedProjectionField::Target => ("$.camera.target", "Camera target"),
                    FixedProjectionField::TanHalfVerticalFov => (
                        "$.projection.verticalFovRadians",
                        "Tangent of half the projection vertical FOV",
                    ),
                    FixedProjectionField::Up => ("$.camera.up", "Camera up"),
                };
                (
                    path,
                    format!("{label} must be within the Q32.32 safe-integer range"),
                )
            }
            Self::LookAt(LookAtError::CoincidentEyeTarget) => (
                "$.camera.target",
                "Camera target must differ from camera eye in Q32.32".to_owned(),
            ),
            Self::LookAt(LookAtError::ParallelUp) => (
                "$.camera.up",
                "Camera up must not be parallel to view direction".to_owned(),
            ),
            Self::LookAt(LookAtError::Overflow) => (
                "$.camera.eye",
                "Camera view matrix must fit the Q32.32 range".to_owned(),
            ),
            Self::Projection(error) => (
                "$.projection",
                format!("Projection must be buildable in Q32.32: {error}"),
            ),
            Self::Viewport(_) => (
                "$.projection.viewport",
                "Projection viewport must fit Q32.32 pixel coordinates".to_owned(),
            ),
            Self::UnexpectedMatrixRow => (
                "$.projection",
                "Bunny returned a matrix row shape this demo does not support".to_owned(),
            ),
        }
    }
}

fn fixed_scalar(
    value: f64,
    field: FixedProjectionField,
) -> Result<FixedQ32_32, FixedProjectionError> {
    fixed_from_f64(value).ok_or(FixedProjectionError::Unrepresentable(field))
}

fn fixed_vec3(
    value: [f64; 3],
    field: FixedProjectionField,
) -> Result<FixedVec3, FixedProjectionError> {
    Ok(FixedVec3::new(
        fixed_scalar(value[0], field)?,
        fixed_scalar(value[1], field)?,
        fixed_scalar(value[2], field)?,
    ))
}

fn viewport(width: usize, height: usize) -> Result<Viewport, FixedProjectionError> {
    let width = u32::try_from(width).map_err(|_| FixedProjectionError::Viewport(None))?;
    let height = u32::try_from(height).map_err(|_| FixedProjectionError::Viewport(None))?;
    Viewport::try_new(width, height).map_err(|error| FixedProjectionError::Viewport(Some(error)))
}

fn aspect_ratio(viewport: Viewport) -> Result<FixedQ32_32, FixedProjectionError> {
    let width = fixed_from_u32(viewport.width()).ok_or(FixedProjectionError::Viewport(None))?;
    let height = fixed_from_u32(viewport.height()).ok_or(FixedProjectionError::Viewport(None))?;
    width
        .checked_div(height)
        .ok_or(FixedProjectionError::Viewport(None))
}

/// The top three rows of a matrix whose last row is checked by the caller, as an affine transform.
const fn affine_rows(matrix: FixedMat4) -> FixedAffine3 {
    let (row0, row1, row2) = (matrix.row0(), matrix.row1(), matrix.row2());
    FixedAffine3::from_parts(
        FixedMat3::from_rows(
            FixedVec3::new(row0.0, row0.1, row0.2),
            FixedVec3::new(row1.0, row1.1, row1.2),
            FixedVec3::new(row2.0, row2.1, row2.2),
        ),
        FixedVec3::new(row0.3, row1.3, row2.3),
    )
}

#[cfg(test)]
mod tests;
