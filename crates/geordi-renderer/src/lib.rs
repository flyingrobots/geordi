//! Native Rust runtime profile checks and rectangle rendering for Geordi IR artifacts.

use geordi_ir::{
    GEORDI_IR_VERSION, GEORDI_NUMERIC_PROFILE, GeordiGlyphRun, GeordiIr, GeordiIrValidationError,
    GeordiPositionedGlyph, GeordiStrictTextFixtureManifest, GeordiStrictTextFixtureValidationError,
    GeordiStrictTextOutlineCommand, GeordiStrictTextOutlineEvidenceGlyph,
    GeordiStrictTextOutlineEvidencePack, GeordiStrictTextOutlineEvidenceValidationError,
    validate_geordi_ir, validate_geordi_strict_text_evidence_coverage,
    validate_geordi_strict_text_evidence_line_boxes, validate_geordi_strict_text_fixture_manifest,
    validate_geordi_strict_text_outline_evidence_pack,
};
use std::collections::HashMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

/// Native Rust renderer name for strict text outline evidence.
pub const GEORDI_NATIVE_STRICT_TEXT_OUTLINE_RENDERER_NAME: &str = "rust-software-outline-glyphs";

/// Feature requirements supported by the native Rust render-everywhere MVP.
pub const GEORDI_NATIVE_RUNTIME_REQUIREMENTS: &[&str] = &[
    "geordi/core/1",
    "layout.resolved",
    "shape.rect",
    "paint.solid",
];

/// Native Rust runtime capability profile.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiNativeRuntimeProfile {
    /// Supported IR version.
    pub ir_version: &'static str,
    /// Supported numeric profile.
    pub numeric_profile: &'static str,
    /// Supported feature requirements.
    pub supported_requirements: &'static [&'static str],
}

/// Default native Rust runtime profile for the render-everywhere MVP.
pub const GEORDI_NATIVE_RUNTIME_PROFILE: GeordiNativeRuntimeProfile = GeordiNativeRuntimeProfile {
    ir_version: GEORDI_IR_VERSION,
    numeric_profile: GEORDI_NUMERIC_PROFILE,
    supported_requirements: GEORDI_NATIVE_RUNTIME_REQUIREMENTS,
};

/// Custom error returned when an IR artifact requires unsupported native runtime capability.
#[derive(Debug)]
pub struct GeordiRuntimeUnsupportedProfileError {
    requirement: String,
    supported: String,
}

impl GeordiRuntimeUnsupportedProfileError {
    const fn new(requirement: String, supported: String) -> Self {
        Self {
            requirement,
            supported,
        }
    }

    /// Requirement that failed profile negotiation.
    #[must_use]
    pub fn requirement(&self) -> &str {
        &self.requirement
    }

    /// Comma-separated supported requirement summary.
    #[must_use]
    pub fn supported(&self) -> &str {
        &self.supported
    }
}

impl Display for GeordiRuntimeUnsupportedProfileError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi runtime profile is unsupported")
    }
}

impl Error for GeordiRuntimeUnsupportedProfileError {}

/// In-memory RGBA8 render output.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenderedImage {
    height: usize,
    rgba: Vec<u8>,
    width: usize,
}

impl RenderedImage {
    fn new(width: usize, height: usize) -> Result<Self, GeordiRenderError> {
        let pixel_count = width
            .checked_mul(height)
            .ok_or_else(GeordiRenderError::buffer_size)?;
        let byte_count = pixel_count
            .checked_mul(4)
            .ok_or_else(GeordiRenderError::buffer_size)?;

        Ok(Self {
            height,
            rgba: vec![0; byte_count],
            width,
        })
    }

    /// Image width in pixels.
    #[must_use]
    pub const fn width(&self) -> usize {
        self.width
    }

    /// Image height in pixels.
    #[must_use]
    pub const fn height(&self) -> usize {
        self.height
    }

    /// RGBA8 bytes in row-major order.
    #[must_use]
    pub fn rgba(&self) -> &[u8] {
        &self.rgba
    }

    /// Sample a pixel from the rendered image.
    #[must_use]
    pub fn pixel_at(&self, x: usize, y: usize) -> Option<[u8; 4]> {
        if x >= self.width || y >= self.height {
            return None;
        }

        let index = self.pixel_byte_index(x, y)?;
        Some([
            self.rgba[index],
            self.rgba[index + 1],
            self.rgba[index + 2],
            self.rgba[index + 3],
        ])
    }

    fn set_pixel(&mut self, x: usize, y: usize, rgba: [u8; 4]) -> Result<(), GeordiRenderError> {
        let index = self
            .pixel_byte_index(x, y)
            .ok_or_else(GeordiRenderError::buffer_size)?;
        self.rgba[index] = rgba[0];
        self.rgba[index + 1] = rgba[1];
        self.rgba[index + 2] = rgba[2];
        self.rgba[index + 3] = rgba[3];
        Ok(())
    }

    fn pixel_byte_index(&self, x: usize, y: usize) -> Option<usize> {
        y.checked_mul(self.width)?.checked_add(x)?.checked_mul(4)
    }
}

/// Custom error returned when native software rendering fails.
#[derive(Debug)]
pub struct GeordiRenderError {
    source: GeordiRenderErrorSource,
}

#[derive(Debug)]
enum GeordiRenderErrorSource {
    BufferSize,
    Fill { fill: String, node_id: String },
    Integer { node_id: String, property: String },
    Profile(GeordiRuntimeUnsupportedProfileError),
    Validation(GeordiIrValidationError),
}

impl GeordiRenderError {
    const fn buffer_size() -> Self {
        Self {
            source: GeordiRenderErrorSource::BufferSize,
        }
    }

    fn fill(node_id: &str, fill: &str) -> Self {
        Self {
            source: GeordiRenderErrorSource::Fill {
                fill: fill.to_owned(),
                node_id: node_id.to_owned(),
            },
        }
    }

    fn integer(node_id: &str, property: &str) -> Self {
        Self {
            source: GeordiRenderErrorSource::Integer {
                node_id: node_id.to_owned(),
                property: property.to_owned(),
            },
        }
    }

    const fn profile(source: GeordiRuntimeUnsupportedProfileError) -> Self {
        Self {
            source: GeordiRenderErrorSource::Profile(source),
        }
    }

    const fn validation(source: GeordiIrValidationError) -> Self {
        Self {
            source: GeordiRenderErrorSource::Validation(source),
        }
    }
}

impl Display for GeordiRenderError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match &self.source {
            GeordiRenderErrorSource::BufferSize => {
                formatter.write_str("Geordi render buffer size failed")
            }
            GeordiRenderErrorSource::Fill { fill, node_id } => {
                write!(formatter, "Geordi render fill failed for {node_id}: {fill}")
            }
            GeordiRenderErrorSource::Integer { node_id, property } => {
                write!(
                    formatter,
                    "Geordi render integer conversion failed for {node_id}.{property}"
                )
            }
            GeordiRenderErrorSource::Profile(_) => {
                formatter.write_str("Geordi render runtime profile failed")
            }
            GeordiRenderErrorSource::Validation(_) => {
                formatter.write_str("Geordi render IR validation failed")
            }
        }
    }
}

impl Error for GeordiRenderError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiRenderErrorSource::Profile(source) => Some(source),
            GeordiRenderErrorSource::Validation(source) => Some(source),
            GeordiRenderErrorSource::BufferSize
            | GeordiRenderErrorSource::Fill { .. }
            | GeordiRenderErrorSource::Integer { .. } => None,
        }
    }
}

/// Metadata reported by the native strict text outline renderer.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiStrictTextOutlineRenderReport {
    /// Renderer identity.
    pub renderer_name: &'static str,
    /// Strict text fixture id.
    pub fixture_id: String,
    /// Outline evidence pack id.
    pub evidence_pack_id: String,
    /// Evidence kind used for drawing.
    pub evidence_kind: String,
    /// Strict text profile.
    pub text_profile: String,
    /// Total positioned glyphs encountered in the fixture.
    pub glyph_count: usize,
    /// Positioned glyphs that contributed drawing commands.
    pub draw_glyph_count: usize,
    /// Total outline commands consumed from drawing glyphs.
    pub command_count: usize,
}

/// Native strict text outline render output.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GeordiStrictTextOutlineRenderResult {
    /// Rendered RGBA8 image.
    pub image: RenderedImage,
    /// Deterministic render metadata.
    pub report: GeordiStrictTextOutlineRenderReport,
}

/// Custom error returned when native strict text outline rendering fails.
#[derive(Debug)]
pub struct GeordiStrictTextRenderError {
    source: GeordiStrictTextRenderErrorSource,
}

#[derive(Debug)]
enum GeordiStrictTextRenderErrorSource {
    BufferSize,
    CommandField { field: &'static str, op: String },
    Coordinate,
    EvidenceValidation(GeordiStrictTextOutlineEvidenceValidationError),
    FixtureValidation(GeordiStrictTextFixtureValidationError),
    Paint,
    UnsupportedCommand(String),
}

impl GeordiStrictTextRenderError {
    const fn buffer_size() -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::BufferSize,
        }
    }

    fn command_field(op: &str, field: &'static str) -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::CommandField {
                field,
                op: op.to_owned(),
            },
        }
    }

    const fn coordinate() -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::Coordinate,
        }
    }

    const fn evidence_validation(source: GeordiStrictTextOutlineEvidenceValidationError) -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::EvidenceValidation(source),
        }
    }

    const fn fixture_validation(source: GeordiStrictTextFixtureValidationError) -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::FixtureValidation(source),
        }
    }

    const fn paint() -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::Paint,
        }
    }

    fn unsupported_command(op: &str) -> Self {
        Self {
            source: GeordiStrictTextRenderErrorSource::UnsupportedCommand(op.to_owned()),
        }
    }
}

impl Display for GeordiStrictTextRenderError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match &self.source {
            GeordiStrictTextRenderErrorSource::BufferSize => {
                formatter.write_str("Geordi strict text render buffer size failed")
            }
            GeordiStrictTextRenderErrorSource::CommandField { field, op } => {
                write!(
                    formatter,
                    "Geordi strict text render command field failed for {op}.{field}"
                )
            }
            GeordiStrictTextRenderErrorSource::Coordinate => {
                formatter.write_str("Geordi strict text render coordinate failed")
            }
            GeordiStrictTextRenderErrorSource::EvidenceValidation(_) => {
                formatter.write_str("Geordi strict text render evidence validation failed")
            }
            GeordiStrictTextRenderErrorSource::FixtureValidation(_) => {
                formatter.write_str("Geordi strict text render fixture validation failed")
            }
            GeordiStrictTextRenderErrorSource::Paint => {
                formatter.write_str("Geordi strict text render paint failed")
            }
            GeordiStrictTextRenderErrorSource::UnsupportedCommand(op) => {
                write!(
                    formatter,
                    "Geordi strict text render command is unsupported: {op}"
                )
            }
        }
    }
}

impl Error for GeordiStrictTextRenderError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiStrictTextRenderErrorSource::EvidenceValidation(source) => Some(source),
            GeordiStrictTextRenderErrorSource::FixtureValidation(source) => Some(source),
            GeordiStrictTextRenderErrorSource::BufferSize
            | GeordiStrictTextRenderErrorSource::CommandField { .. }
            | GeordiStrictTextRenderErrorSource::Coordinate
            | GeordiStrictTextRenderErrorSource::Paint
            | GeordiStrictTextRenderErrorSource::UnsupportedCommand(_) => None,
        }
    }
}

/// Assert that an IR artifact can run on the native Rust render-everywhere MVP profile.
///
/// # Errors
///
/// Returns `GeordiRuntimeUnsupportedProfileError` when the IR version, numeric profile, or any
/// required feature is outside the native MVP profile.
pub fn assert_native_runtime_profile(
    ir: &GeordiIr,
) -> Result<(), GeordiRuntimeUnsupportedProfileError> {
    assert_profile_version(ir, &GEORDI_NATIVE_RUNTIME_PROFILE)?;
    assert_profile_requirements(ir, &GEORDI_NATIVE_RUNTIME_PROFILE)
}

/// Render a validated Geordi IR artifact into deterministic RGBA8 pixels.
///
/// # Errors
///
/// Returns `GeordiRenderError` if IR validation fails, runtime profile negotiation fails, scene
/// dimensions or rectangle properties cannot be represented as integer pixels, fill colors are
/// invalid, or the output buffer would overflow addressable memory.
pub fn render_geordi_to_image(ir: &GeordiIr) -> Result<RenderedImage, GeordiRenderError> {
    validate_geordi_ir(ir).map_err(GeordiRenderError::validation)?;
    assert_native_runtime_profile(ir).map_err(GeordiRenderError::profile)?;

    let width = scene_dimension_to_usize(ir.scene.width)?;
    let height = scene_dimension_to_usize(ir.scene.height)?;
    let mut image = RenderedImage::new(width, height)?;

    for node in &ir.nodes {
        let fill = parse_fill(&node.id, &node.props.fill)?;
        let rect = RenderRect::from_node(node)?;
        draw_rect(&mut image, rect, fill)?;
    }

    Ok(image)
}

/// Render a strict text fixture from validated outline evidence into deterministic RGBA8 pixels.
///
/// # Errors
///
/// Returns `GeordiStrictTextRenderError` when fixture validation fails, outline evidence validation
/// fails, the output image cannot be allocated, command coordinates cannot be represented, or the
/// first-profile solid fill paint cannot be lowered to RGBA8.
pub fn render_strict_text_outline_glyphs_to_image(
    fixture: &GeordiStrictTextFixtureManifest,
    evidence: &GeordiStrictTextOutlineEvidencePack,
) -> Result<GeordiStrictTextOutlineRenderResult, GeordiStrictTextRenderError> {
    validate_geordi_strict_text_fixture_manifest(fixture)
        .map_err(GeordiStrictTextRenderError::fixture_validation)?;
    validate_geordi_strict_text_outline_evidence_pack(evidence)
        .map_err(GeordiStrictTextRenderError::evidence_validation)?;
    validate_geordi_strict_text_evidence_coverage(fixture, evidence)
        .map_err(GeordiStrictTextRenderError::evidence_validation)?;
    validate_geordi_strict_text_evidence_line_boxes(fixture, evidence)
        .map_err(GeordiStrictTextRenderError::evidence_validation)?;

    let width = fixed_to_canvas_dimension(max_line_box_right(fixture)?)?;
    let height = fixed_to_canvas_dimension(max_line_box_bottom(fixture)?)?;
    let mut image = RenderedImage::new(width, height)
        .map_err(|_error| GeordiStrictTextRenderError::buffer_size())?;
    let paint = strict_text_paint(evidence)?;
    let render_paths = build_strict_text_render_paths(fixture, evidence)?;

    fill_strict_text_paths(&mut image, &render_paths.segments, paint)?;

    Ok(GeordiStrictTextOutlineRenderResult {
        image,
        report: GeordiStrictTextOutlineRenderReport {
            command_count: render_paths.command_count,
            draw_glyph_count: render_paths.draw_glyph_count,
            evidence_kind: evidence.evidence_kind.clone(),
            evidence_pack_id: evidence.id.clone(),
            fixture_id: fixture.id.clone(),
            glyph_count: render_paths.glyph_count,
            renderer_name: GEORDI_NATIVE_STRICT_TEXT_OUTLINE_RENDERER_NAME,
            text_profile: fixture.text_profile.clone(),
        },
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RenderRect {
    height: usize,
    width: usize,
    x: i64,
    y: i64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct StrictTextPoint {
    x: f64,
    y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct StrictTextSegment {
    end: StrictTextPoint,
    start: StrictTextPoint,
}

#[derive(Clone, Debug, PartialEq)]
struct StrictTextRenderPaths {
    command_count: usize,
    draw_glyph_count: usize,
    glyph_count: usize,
    segments: Vec<StrictTextSegment>,
}

const FIXED_26_6_SCALE: i64 = 64;
const QUADRATIC_FLATTENING_STEPS: u32 = 16;
const CUBIC_FLATTENING_STEPS: u32 = 24;

impl RenderRect {
    fn from_node(node: &geordi_ir::GeordiNode) -> Result<Self, GeordiRenderError> {
        Ok(Self {
            height: positive_dimension_to_usize(&node.id, "height", node.props.height)?,
            width: positive_dimension_to_usize(&node.id, "width", node.props.width)?,
            x: coordinate_to_i64(&node.id, "x", node.props.x)?,
            y: coordinate_to_i64(&node.id, "y", node.props.y)?,
        })
    }
}

fn draw_rect(
    image: &mut RenderedImage,
    rect: RenderRect,
    fill: [u8; 4],
) -> Result<(), GeordiRenderError> {
    let image_width = i64::try_from(image.width).map_err(|_| GeordiRenderError::buffer_size())?;
    let image_height = i64::try_from(image.height).map_err(|_| GeordiRenderError::buffer_size())?;
    let rect_width = i64::try_from(rect.width).map_err(|_| GeordiRenderError::buffer_size())?;
    let rect_height = i64::try_from(rect.height).map_err(|_| GeordiRenderError::buffer_size())?;

    let start_x = rect.x.max(0);
    let start_y = rect.y.max(0);
    let end_x = rect.x.saturating_add(rect_width).min(image_width).max(0);
    let end_y = rect.y.saturating_add(rect_height).min(image_height).max(0);

    for y in start_y..end_y {
        for x in start_x..end_x {
            image.set_pixel(
                usize::try_from(x).map_err(|_| GeordiRenderError::buffer_size())?,
                usize::try_from(y).map_err(|_| GeordiRenderError::buffer_size())?,
                fill,
            )?;
        }
    }

    Ok(())
}

fn max_line_box_right(
    fixture: &GeordiStrictTextFixtureManifest,
) -> Result<i64, GeordiStrictTextRenderError> {
    let mut right = 0_i64;
    for line_box in &fixture.line_boxes {
        let candidate = line_box
            .x
            .checked_add(line_box.width)
            .ok_or_else(GeordiStrictTextRenderError::coordinate)?;
        right = right.max(candidate);
    }

    Ok(right)
}

fn max_line_box_bottom(
    fixture: &GeordiStrictTextFixtureManifest,
) -> Result<i64, GeordiStrictTextRenderError> {
    let mut bottom = 0_i64;
    for line_box in &fixture.line_boxes {
        let candidate = line_box
            .y
            .checked_add(line_box.height)
            .ok_or_else(GeordiStrictTextRenderError::coordinate)?;
        bottom = bottom.max(candidate);
    }

    Ok(bottom)
}

fn fixed_to_canvas_dimension(value: i64) -> Result<usize, GeordiStrictTextRenderError> {
    if value < 0 || value % FIXED_26_6_SCALE != 0 {
        return Err(GeordiStrictTextRenderError::coordinate());
    }

    usize::try_from(value / FIXED_26_6_SCALE)
        .map_err(|_error| GeordiStrictTextRenderError::buffer_size())
}

fn strict_text_paint(
    evidence: &GeordiStrictTextOutlineEvidencePack,
) -> Result<[u8; 4], GeordiStrictTextRenderError> {
    if evidence.paint.rgba.len() != 4 {
        return Err(GeordiStrictTextRenderError::paint());
    }

    Ok([
        paint_channel(evidence.paint.rgba[0])?,
        paint_channel(evidence.paint.rgba[1])?,
        paint_channel(evidence.paint.rgba[2])?,
        paint_channel(evidence.paint.rgba[3])?,
    ])
}

fn paint_channel(value: i64) -> Result<u8, GeordiStrictTextRenderError> {
    u8::try_from(value).map_err(|_error| GeordiStrictTextRenderError::paint())
}

fn build_strict_text_render_paths(
    fixture: &GeordiStrictTextFixtureManifest,
    evidence: &GeordiStrictTextOutlineEvidencePack,
) -> Result<StrictTextRenderPaths, GeordiStrictTextRenderError> {
    let glyph_evidence = evidence
        .glyphs
        .iter()
        .map(|glyph| (glyph.glyph_id, glyph))
        .collect::<HashMap<_, _>>();
    let mut paths = StrictTextRenderPaths {
        command_count: 0,
        draw_glyph_count: 0,
        glyph_count: 0,
        segments: Vec::new(),
    };

    for run in &fixture.glyph_runs {
        for glyph in &run.glyphs {
            paths.glyph_count += 1;
            let Some(evidence_glyph) = glyph_evidence.get(&glyph.glyph_id) else {
                continue;
            };
            if !evidence_glyph.draws {
                continue;
            }

            paths.draw_glyph_count += 1;
            paths.command_count += evidence_glyph.commands.len();
            append_strict_text_glyph_segments(&mut paths.segments, run, glyph, evidence_glyph)?;
        }
    }

    Ok(paths)
}

fn append_strict_text_glyph_segments(
    segments: &mut Vec<StrictTextSegment>,
    run: &GeordiGlyphRun,
    positioned_glyph: &GeordiPositionedGlyph,
    evidence_glyph: &GeordiStrictTextOutlineEvidenceGlyph,
) -> Result<(), GeordiStrictTextRenderError> {
    let origin_x = positioned_glyph
        .x
        .checked_add(positioned_glyph.x_offset)
        .ok_or_else(GeordiStrictTextRenderError::coordinate)?;
    let origin_y = positioned_glyph
        .y
        .checked_add(positioned_glyph.y_offset)
        .ok_or_else(GeordiStrictTextRenderError::coordinate)?;
    let mut current = None;
    let mut contour_start = None;

    if run.font_id.is_empty() {
        return Ok(());
    }

    for command in &evidence_glyph.commands {
        match command.op.as_str() {
            "moveTo" => {
                let point = command_end_point(command, origin_x, origin_y)?;
                current = Some(point);
                contour_start = Some(point);
            }
            "lineTo" => {
                let start = current
                    .ok_or_else(|| GeordiStrictTextRenderError::command_field(&command.op, "x"))?;
                let end = command_end_point(command, origin_x, origin_y)?;
                segments.push(StrictTextSegment { end, start });
                current = Some(end);
            }
            "quadTo" => {
                let start = current
                    .ok_or_else(|| GeordiStrictTextRenderError::command_field(&command.op, "x"))?;
                let control = command_control_point(command, origin_x, origin_y, "cx", "cy")?;
                let end = command_end_point(command, origin_x, origin_y)?;
                append_quadratic_segments(segments, start, control, end);
                current = Some(end);
            }
            "cubicTo" => {
                let start = current
                    .ok_or_else(|| GeordiStrictTextRenderError::command_field(&command.op, "x"))?;
                let control_1 = command_control_point(command, origin_x, origin_y, "cx1", "cy1")?;
                let control_2 = command_control_point(command, origin_x, origin_y, "cx2", "cy2")?;
                let end = command_end_point(command, origin_x, origin_y)?;
                append_cubic_segments(segments, start, control_1, control_2, end);
                current = Some(end);
            }
            "closePath" => {
                let start = current
                    .ok_or_else(|| GeordiStrictTextRenderError::command_field(&command.op, "op"))?;
                let end = contour_start
                    .ok_or_else(|| GeordiStrictTextRenderError::command_field(&command.op, "op"))?;
                if start != end {
                    segments.push(StrictTextSegment { end, start });
                }
                current = None;
                contour_start = None;
            }
            op => return Err(GeordiStrictTextRenderError::unsupported_command(op)),
        }
    }

    Ok(())
}

fn command_end_point(
    command: &GeordiStrictTextOutlineCommand,
    origin_x: i64,
    origin_y: i64,
) -> Result<StrictTextPoint, GeordiStrictTextRenderError> {
    command_point(command, origin_x, origin_y, "x", "y")
}

fn command_control_point(
    command: &GeordiStrictTextOutlineCommand,
    origin_x: i64,
    origin_y: i64,
    x_field: &'static str,
    y_field: &'static str,
) -> Result<StrictTextPoint, GeordiStrictTextRenderError> {
    command_point(command, origin_x, origin_y, x_field, y_field)
}

fn command_point(
    command: &GeordiStrictTextOutlineCommand,
    origin_x: i64,
    origin_y: i64,
    x_field: &'static str,
    y_field: &'static str,
) -> Result<StrictTextPoint, GeordiStrictTextRenderError> {
    let x = command_coordinate(command, origin_x, x_field)?;
    let y = command_coordinate(command, origin_y, y_field)?;

    Ok(StrictTextPoint {
        x: fixed_to_f64(x)?,
        y: fixed_to_f64(y)?,
    })
}

fn command_coordinate(
    command: &GeordiStrictTextOutlineCommand,
    origin: i64,
    field: &'static str,
) -> Result<i64, GeordiStrictTextRenderError> {
    let value = match field {
        "x" => command.x,
        "y" => command.y,
        "cx" => command.cx,
        "cy" => command.cy,
        "cx1" => command.cx1,
        "cy1" => command.cy1,
        "cx2" => command.cx2,
        "cy2" => command.cy2,
        _ => {
            return Err(GeordiStrictTextRenderError::command_field(
                &command.op,
                field,
            ));
        }
    }
    .ok_or_else(|| GeordiStrictTextRenderError::command_field(&command.op, field))?;

    origin
        .checked_add(value)
        .ok_or_else(GeordiStrictTextRenderError::coordinate)
}

fn fixed_to_f64(value: i64) -> Result<f64, GeordiStrictTextRenderError> {
    value
        .to_string()
        .parse::<f64>()
        .map(|parsed| parsed / fixed_scale_f64())
        .map_err(|_error| GeordiStrictTextRenderError::coordinate())
}

const fn fixed_scale_f64() -> f64 {
    64.0
}

fn append_quadratic_segments(
    segments: &mut Vec<StrictTextSegment>,
    start: StrictTextPoint,
    control: StrictTextPoint,
    end: StrictTextPoint,
) {
    let mut previous = start;
    for step in 1..=QUADRATIC_FLATTENING_STEPS {
        let point = quadratic_point(
            start,
            control,
            end,
            f64::from(step) / f64::from(QUADRATIC_FLATTENING_STEPS),
        );
        segments.push(StrictTextSegment {
            end: point,
            start: previous,
        });
        previous = point;
    }
}

fn append_cubic_segments(
    segments: &mut Vec<StrictTextSegment>,
    start: StrictTextPoint,
    control_1: StrictTextPoint,
    control_2: StrictTextPoint,
    end: StrictTextPoint,
) {
    let mut previous = start;
    for step in 1..=CUBIC_FLATTENING_STEPS {
        let point = cubic_point(
            start,
            control_1,
            control_2,
            end,
            f64::from(step) / f64::from(CUBIC_FLATTENING_STEPS),
        );
        segments.push(StrictTextSegment {
            end: point,
            start: previous,
        });
        previous = point;
    }
}

fn quadratic_point(
    start: StrictTextPoint,
    control: StrictTextPoint,
    end: StrictTextPoint,
    t: f64,
) -> StrictTextPoint {
    let inverse = 1.0 - t;
    StrictTextPoint {
        x: inverse.mul_add(
            inverse * start.x,
            (2.0 * inverse * t).mul_add(control.x, t * t * end.x),
        ),
        y: inverse.mul_add(
            inverse * start.y,
            (2.0 * inverse * t).mul_add(control.y, t * t * end.y),
        ),
    }
}

fn cubic_point(
    start: StrictTextPoint,
    control_1: StrictTextPoint,
    control_2: StrictTextPoint,
    end: StrictTextPoint,
    t: f64,
) -> StrictTextPoint {
    let inverse = 1.0 - t;
    StrictTextPoint {
        x: (inverse * inverse * inverse).mul_add(
            start.x,
            (3.0 * inverse * inverse * t).mul_add(
                control_1.x,
                (3.0 * inverse * t * t).mul_add(control_2.x, t * t * t * end.x),
            ),
        ),
        y: (inverse * inverse * inverse).mul_add(
            start.y,
            (3.0 * inverse * inverse * t).mul_add(
                control_1.y,
                (3.0 * inverse * t * t).mul_add(control_2.y, t * t * t * end.y),
            ),
        ),
    }
}

fn fill_strict_text_paths(
    image: &mut RenderedImage,
    segments: &[StrictTextSegment],
    paint: [u8; 4],
) -> Result<(), GeordiStrictTextRenderError> {
    for y in 0..image.height {
        let sample_y = usize_to_f64(y)?.mul_add(1.0, 0.5);
        for x in 0..image.width {
            let sample_x = usize_to_f64(x)?.mul_add(1.0, 0.5);
            if nonzero_winding(segments, sample_x, sample_y) != 0 {
                image
                    .set_pixel(x, y, paint)
                    .map_err(|_error| GeordiStrictTextRenderError::buffer_size())?;
            }
        }
    }

    Ok(())
}

fn usize_to_f64(value: usize) -> Result<f64, GeordiStrictTextRenderError> {
    u32::try_from(value)
        .map(f64::from)
        .map_err(|_error| GeordiStrictTextRenderError::buffer_size())
}

fn nonzero_winding(segments: &[StrictTextSegment], sample_x: f64, sample_y: f64) -> i64 {
    let mut winding = 0_i64;

    for segment in segments {
        let start = segment.start;
        let end = segment.end;
        if (start.y <= sample_y && end.y > sample_y) || (start.y > sample_y && end.y <= sample_y) {
            let intersect_x =
                (sample_y - start.y).mul_add((end.x - start.x) / (end.y - start.y), start.x);
            if intersect_x > sample_x {
                if end.y > start.y {
                    winding += 1;
                } else {
                    winding -= 1;
                }
            }
        }
    }

    winding
}

fn scene_dimension_to_usize(value: f64) -> Result<usize, GeordiRenderError> {
    integer_f64_to_usize("__scene__", "dimension", value)
}

fn positive_dimension_to_usize(
    node_id: &str,
    property: &str,
    value: f64,
) -> Result<usize, GeordiRenderError> {
    if value <= 0.0 {
        return Err(GeordiRenderError::integer(node_id, property));
    }

    integer_f64_to_usize(node_id, property, value)
}

fn integer_f64_to_usize(
    node_id: &str,
    property: &str,
    value: f64,
) -> Result<usize, GeordiRenderError> {
    integer_f64_to_string(value)
        .and_then(|source| source.parse::<usize>().ok())
        .ok_or_else(|| GeordiRenderError::integer(node_id, property))
}

fn coordinate_to_i64(node_id: &str, property: &str, value: f64) -> Result<i64, GeordiRenderError> {
    integer_f64_to_string(value)
        .and_then(|source| source.parse::<i64>().ok())
        .ok_or_else(|| GeordiRenderError::integer(node_id, property))
}

fn integer_f64_to_string(value: f64) -> Option<String> {
    if value.is_finite() && value.trunc().to_bits() == value.to_bits() {
        Some(format!("{value:.0}"))
    } else {
        None
    }
}

fn parse_fill(node_id: &str, fill: &str) -> Result<[u8; 4], GeordiRenderError> {
    if fill.len() != 7 || !fill.starts_with('#') {
        return Err(GeordiRenderError::fill(node_id, fill));
    }

    let red = parse_fill_channel(node_id, fill, 1)?;
    let green = parse_fill_channel(node_id, fill, 3)?;
    let blue = parse_fill_channel(node_id, fill, 5)?;
    Ok([red, green, blue, u8::MAX])
}

fn parse_fill_channel(node_id: &str, fill: &str, start: usize) -> Result<u8, GeordiRenderError> {
    fill.get(start..start + 2)
        .and_then(|source| u8::from_str_radix(source, 16).ok())
        .ok_or_else(|| GeordiRenderError::fill(node_id, fill))
}

fn assert_profile_version(
    ir: &GeordiIr,
    profile: &GeordiNativeRuntimeProfile,
) -> Result<(), GeordiRuntimeUnsupportedProfileError> {
    if ir.ir_version != profile.ir_version {
        return Err(GeordiRuntimeUnsupportedProfileError::new(
            format!("irVersion={}", ir.ir_version),
            format!("irVersion={}", profile.ir_version),
        ));
    }

    if ir.numeric_profile != profile.numeric_profile {
        return Err(GeordiRuntimeUnsupportedProfileError::new(
            format!("numericProfile={}", ir.numeric_profile),
            format!("numericProfile={}", profile.numeric_profile),
        ));
    }

    Ok(())
}

fn assert_profile_requirements(
    ir: &GeordiIr,
    profile: &GeordiNativeRuntimeProfile,
) -> Result<(), GeordiRuntimeUnsupportedProfileError> {
    for requirement in &ir.requires {
        if !profile
            .supported_requirements
            .contains(&requirement.as_str())
        {
            return Err(GeordiRuntimeUnsupportedProfileError::new(
                format!("requires={requirement}"),
                supported_requirements(profile),
            ));
        }
    }

    Ok(())
}

fn supported_requirements(profile: &GeordiNativeRuntimeProfile) -> String {
    format!("requires={}", profile.supported_requirements.join(","))
}

#[cfg(test)]
mod tests {
    use super::{
        GeordiRenderError, GeordiRuntimeUnsupportedProfileError, GeordiStrictTextRenderError,
        GeordiStrictTextRenderErrorSource, assert_native_runtime_profile, render_geordi_to_image,
        render_strict_text_outline_glyphs_to_image,
    };
    use geordi_ir::{
        GeordiIrLoadError, GeordiIrParseError, GeordiStrictTextFixtureLoadError,
        GeordiStrictTextOutlineEvidenceLoadError, load_geordi_ir,
        load_geordi_strict_text_fixture_manifest, load_geordi_strict_text_outline_evidence_pack,
        parse_geordi_ir,
    };
    use std::error::Error;
    use std::fmt::{Display, Formatter};
    use std::path::PathBuf;

    #[derive(Debug)]
    enum GeordiRendererTestError {
        Load(GeordiIrLoadError),
        OutlineEvidenceLoad(GeordiStrictTextOutlineEvidenceLoadError),
        Parse(GeordiIrParseError),
        Render(GeordiRenderError),
        Runtime(GeordiRuntimeUnsupportedProfileError),
        StrictTextLoad(GeordiStrictTextFixtureLoadError),
        StrictTextRender(GeordiStrictTextRenderError),
    }

    impl Display for GeordiRendererTestError {
        fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("Geordi renderer test failed")
        }
    }

    impl Error for GeordiRendererTestError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            match self {
                Self::Load(source) => Some(source),
                Self::OutlineEvidenceLoad(source) => Some(source),
                Self::Parse(source) => Some(source),
                Self::Render(source) => Some(source),
                Self::Runtime(source) => Some(source),
                Self::StrictTextLoad(source) => Some(source),
                Self::StrictTextRender(source) => Some(source),
            }
        }
    }

    impl From<GeordiIrLoadError> for GeordiRendererTestError {
        fn from(error: GeordiIrLoadError) -> Self {
            Self::Load(error)
        }
    }

    impl From<GeordiIrParseError> for GeordiRendererTestError {
        fn from(error: GeordiIrParseError) -> Self {
            Self::Parse(error)
        }
    }

    impl From<GeordiStrictTextFixtureLoadError> for GeordiRendererTestError {
        fn from(error: GeordiStrictTextFixtureLoadError) -> Self {
            Self::StrictTextLoad(error)
        }
    }

    impl From<GeordiStrictTextOutlineEvidenceLoadError> for GeordiRendererTestError {
        fn from(error: GeordiStrictTextOutlineEvidenceLoadError) -> Self {
            Self::OutlineEvidenceLoad(error)
        }
    }

    impl From<GeordiRenderError> for GeordiRendererTestError {
        fn from(error: GeordiRenderError) -> Self {
            Self::Render(error)
        }
    }

    impl From<GeordiRuntimeUnsupportedProfileError> for GeordiRendererTestError {
        fn from(error: GeordiRuntimeUnsupportedProfileError) -> Self {
            Self::Runtime(error)
        }
    }

    impl From<GeordiStrictTextRenderError> for GeordiRendererTestError {
        fn from(error: GeordiStrictTextRenderError) -> Self {
            Self::StrictTextRender(error)
        }
    }

    #[test]
    fn accepts_the_shared_hello_panel_fixture() -> Result<(), GeordiRendererTestError> {
        let ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;

        assert_native_runtime_profile(&ir)?;

        Ok(())
    }

    #[test]
    fn rejects_known_but_unsupported_strict_text_feature() -> Result<(), GeordiRendererTestError> {
        let ir = load_geordi_ir(fixture_path("unsupported-strict-text/scene.geordi.json"))?;
        let result = assert_native_runtime_profile(&ir);

        let requirement = runtime_error_requirement(result);

        assert_eq!(requirement.as_deref(), Some("requires=text.fontPack"));
        Ok(())
    }

    #[test]
    fn rejects_unsupported_version_before_requirements() -> Result<(), GeordiRendererTestError> {
        let mut ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        ir.ir_version = "geordi-ir/2".to_owned();

        let requirement = runtime_error_requirement(assert_native_runtime_profile(&ir));

        assert_eq!(requirement.as_deref(), Some("irVersion=geordi-ir/2"));
        Ok(())
    }

    #[test]
    fn renders_the_shared_hello_panel_fixture() -> Result<(), GeordiRendererTestError> {
        let ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;
        let image = render_geordi_to_image(&ir)?;

        assert_eq!(image.width(), 640);
        assert_eq!(image.height(), 360);
        assert_eq!(image.pixel_at(8, 8), Some([16, 24, 32, 255]));
        assert_eq!(image.pixel_at(64, 80), Some([248, 250, 252, 255]));
        assert_eq!(image.pixel_at(64, 56), Some([45, 212, 191, 255]));
        assert_eq!(image.pixel_at(100, 230), Some([37, 99, 235, 255]));
        assert_eq!(image.pixel_at(510, 100), Some([34, 197, 94, 255]));

        Ok(())
    }

    #[test]
    fn renders_rectangles_in_ir_order() -> Result<(), GeordiRendererTestError> {
        let ir = parse_geordi_ir(
            r##"{
              "irVersion": "geordi-ir/1",
              "numericProfile": "geordi-finite-binary64/1",
              "requires": ["geordi/core/1", "layout.resolved", "shape.rect", "paint.solid"],
              "scene": { "id": "overlap", "width": 2, "height": 1, "units": "px" },
              "nodes": [
                {
                  "id": "red",
                  "kind": "Rect",
                  "props": { "x": 0, "y": 0, "width": 2, "height": 1, "fill": "#ff0000" }
                },
                {
                  "id": "blue",
                  "kind": "Rect",
                  "props": { "x": 1, "y": 0, "width": 1, "height": 1, "fill": "#0000ff" }
                }
              ]
            }"##,
        )?;

        let image = render_geordi_to_image(&ir)?;

        assert_eq!(image.pixel_at(0, 0), Some([255, 0, 0, 255]));
        assert_eq!(image.pixel_at(1, 0), Some([0, 0, 255, 255]));
        Ok(())
    }

    #[test]
    fn renders_strict_text_outline_evidence_to_native_image() -> Result<(), GeordiRendererTestError>
    {
        let fixture = load_geordi_strict_text_fixture_manifest(fixture_path(
            "strict-text/geordi.strict-text.geordi.json",
        ))?;
        let evidence = load_geordi_strict_text_outline_evidence_pack(fixture_path(
            "strict-text/geordi.outline-evidence.geordi.json",
        ))?;

        let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence)?;

        assert_eq!(result.image.width(), 192);
        assert_eq!(result.image.height(), 64);
        assert!(nonblank_pixel_count(&result.image) > 0);
        assert_eq!(result.report.renderer_name, "rust-software-outline-glyphs");
        assert_eq!(
            result.report.fixture_id,
            "render-everywhere:strict-text:geordi"
        );
        assert_eq!(
            result.report.evidence_pack_id,
            "render-everywhere:strict-text:geordi:outline-evidence"
        );
        assert_eq!(result.report.evidence_kind, "outlinePaths");
        assert_eq!(
            result.report.text_profile,
            "geordi-strict-positioned-glyph-run/1"
        );
        assert_eq!(result.report.glyph_count, 6);
        assert_eq!(result.report.draw_glyph_count, 6);
        assert!(result.report.command_count > 0);
        Ok(())
    }

    #[test]
    fn rejects_invalid_strict_text_outline_evidence_before_rendering()
    -> Result<(), GeordiRendererTestError> {
        let fixture = load_geordi_strict_text_fixture_manifest(fixture_path(
            "strict-text/geordi.strict-text.geordi.json",
        ))?;
        let evidence = load_geordi_strict_text_outline_evidence_pack(fixture_path(
            "strict-text/failures/bad-outline-command.outline-evidence.geordi.json",
        ))?;

        let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence);

        assert!(matches!(
            result,
            Err(GeordiStrictTextRenderError {
                source: GeordiStrictTextRenderErrorSource::EvidenceValidation(_)
            })
        ));
        Ok(())
    }

    #[test]
    fn rejects_unsupported_strict_text_evidence_paint_before_rendering()
    -> Result<(), GeordiRendererTestError> {
        let fixture = load_geordi_strict_text_fixture_manifest(fixture_path(
            "strict-text/geordi.strict-text.geordi.json",
        ))?;
        let evidence = load_geordi_strict_text_outline_evidence_pack(fixture_path(
            "strict-text/failures/unsupported-paint.outline-evidence.geordi.json",
        ))?;

        let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence);

        assert!(matches!(
            result,
            Err(GeordiStrictTextRenderError {
                source: GeordiStrictTextRenderErrorSource::EvidenceValidation(_)
            })
        ));
        Ok(())
    }

    #[test]
    fn rejects_missing_strict_text_glyph_evidence_before_rendering()
    -> Result<(), GeordiRendererTestError> {
        let fixture = load_geordi_strict_text_fixture_manifest(fixture_path(
            "strict-text/geordi.strict-text.geordi.json",
        ))?;
        let evidence = load_geordi_strict_text_outline_evidence_pack(fixture_path(
            "strict-text/failures/missing-glyph-evidence.outline-evidence.geordi.json",
        ))?;

        let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence);

        assert!(matches!(
            result,
            Err(GeordiStrictTextRenderError {
                source: GeordiStrictTextRenderErrorSource::EvidenceValidation(_)
            })
        ));
        Ok(())
    }

    #[test]
    fn rejects_unreferenced_strict_text_glyph_evidence_before_rendering()
    -> Result<(), GeordiRendererTestError> {
        let fixture = load_geordi_strict_text_fixture_manifest(fixture_path(
            "strict-text/geordi.strict-text.geordi.json",
        ))?;
        let evidence = load_geordi_strict_text_outline_evidence_pack(fixture_path(
            "strict-text/failures/unknown-glyph-evidence.outline-evidence.geordi.json",
        ))?;

        let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence);

        assert!(matches!(
            result,
            Err(GeordiStrictTextRenderError {
                source: GeordiStrictTextRenderErrorSource::EvidenceValidation(_)
            })
        ));
        Ok(())
    }

    #[test]
    fn rejects_strict_text_evidence_outside_line_boxes_before_rendering()
    -> Result<(), GeordiRendererTestError> {
        let fixture = load_geordi_strict_text_fixture_manifest(fixture_path(
            "strict-text/failures/bad-line-box.strict-text.geordi.json",
        ))?;
        let evidence = load_geordi_strict_text_outline_evidence_pack(fixture_path(
            "strict-text/geordi.outline-evidence.geordi.json",
        ))?;

        let result = render_strict_text_outline_glyphs_to_image(&fixture, &evidence);

        assert!(matches!(
            result,
            Err(GeordiStrictTextRenderError {
                source: GeordiStrictTextRenderErrorSource::EvidenceValidation(_)
            })
        ));
        Ok(())
    }

    fn runtime_error_requirement(
        result: Result<(), GeordiRuntimeUnsupportedProfileError>,
    ) -> Option<String> {
        match result {
            Ok(()) => None,
            Err(error) => Some(error.requirement().to_owned()),
        }
    }

    fn fixture_path(path: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere")
            .join(path)
    }

    fn nonblank_pixel_count(image: &super::RenderedImage) -> usize {
        let mut count = 0;
        for y in 0..image.height() {
            for x in 0..image.width() {
                if let Some([red, green, blue, alpha]) = image.pixel_at(x, y)
                    && alpha > 0
                    && (red > 0 || green > 0 || blue > 0)
                {
                    count += 1;
                }
            }
        }

        count
    }
}
