//! Native Rust runtime profile checks and rectangle rendering for Geordi IR artifacts.

use geordi_ir::{
    GEORDI_IR_VERSION, GEORDI_NUMERIC_PROFILE, GeordiIr, GeordiIrValidationError,
    validate_geordi_ir,
};
use std::error::Error;
use std::fmt::{Display, Formatter};

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RenderRect {
    height: usize,
    width: usize,
    x: i64,
    y: i64,
}

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
        GeordiRenderError, GeordiRuntimeUnsupportedProfileError, assert_native_runtime_profile,
        render_geordi_to_image,
    };
    use geordi_ir::{GeordiIrLoadError, GeordiIrParseError, load_geordi_ir, parse_geordi_ir};
    use std::error::Error;
    use std::fmt::{Display, Formatter};
    use std::path::PathBuf;

    #[derive(Debug)]
    enum GeordiRendererTestError {
        Load(GeordiIrLoadError),
        Parse(GeordiIrParseError),
        Render(GeordiRenderError),
        Runtime(GeordiRuntimeUnsupportedProfileError),
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
                Self::Parse(source) => Some(source),
                Self::Render(source) => Some(source),
                Self::Runtime(source) => Some(source),
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
}
