//! Rust types and JSON-boundary loaders for Geordi IR artifacts.

use serde::Deserialize;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};

/// Current supported Geordi IR version.
pub const GEORDI_IR_VERSION: &str = "geordi-ir/1";

/// Current supported Geordi numeric profile.
pub const GEORDI_NUMERIC_PROFILE: &str = "geordi-finite-binary64/1";

/// Typed rectangle-only subset of a `scene.geordi.json` artifact.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiIr {
    /// IR schema version.
    pub ir_version: String,
    /// Floating-point determinism profile.
    pub numeric_profile: String,
    /// Required Geordi feature profile entries.
    pub requires: Vec<String>,
    /// Scene-level metadata and canvas dimensions.
    pub scene: GeordiScene,
    /// Draw-order-preserving node list.
    pub nodes: Vec<GeordiNode>,
}

/// Scene-level metadata for a Geordi artifact.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiScene {
    /// Stable scene identifier.
    pub id: String,
    /// Scene width in scene units.
    pub width: f64,
    /// Scene height in scene units.
    pub height: f64,
    /// Optional scene units. The render-everywhere MVP uses `px`.
    pub units: Option<String>,
    /// Optional background color metadata.
    pub background: Option<String>,
}

/// Rectangle-only render node accepted by the Rust MVP.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiNode {
    /// Stable node identifier.
    pub id: String,
    /// Node kind. Slice 11 validation narrows this to `Rect`.
    pub kind: String,
    /// Optional parent node identifier.
    pub parent_id: Option<String>,
    /// Optional explicit z index.
    pub z_index: Option<f64>,
    /// Optional visibility flag.
    pub visible: Option<bool>,
    /// Optional authoring lock flag.
    pub locked: Option<bool>,
    /// Rectangle properties for the native MVP subset.
    pub props: GeordiRectProps,
}

/// Solid rectangle properties for the Rust render-everywhere MVP.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GeordiRectProps {
    /// Left coordinate in scene units.
    pub x: f64,
    /// Top coordinate in scene units.
    pub y: f64,
    /// Rectangle width in scene units.
    pub width: f64,
    /// Rectangle height in scene units.
    pub height: f64,
    /// Solid fill color in `#rrggbb` form.
    pub fill: String,
}

/// Custom error returned when parsing a Geordi IR JSON string fails.
#[derive(Debug)]
pub struct GeordiIrParseError {
    source: serde_json::Error,
}

impl GeordiIrParseError {
    const fn new(source: serde_json::Error) -> Self {
        Self { source }
    }
}

impl Display for GeordiIrParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Geordi IR parse failed")
    }
}

impl Error for GeordiIrParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.source)
    }
}

/// Custom error returned when loading a Geordi IR artifact from disk fails.
#[derive(Debug)]
pub struct GeordiIrLoadError {
    path: PathBuf,
    source: GeordiIrLoadErrorSource,
}

#[derive(Debug)]
enum GeordiIrLoadErrorSource {
    File(std::io::Error),
    Parse(GeordiIrParseError),
}

impl GeordiIrLoadError {
    const fn file(path: PathBuf, source: std::io::Error) -> Self {
        Self {
            path,
            source: GeordiIrLoadErrorSource::File(source),
        }
    }

    const fn parse(path: PathBuf, source: GeordiIrParseError) -> Self {
        Self {
            path,
            source: GeordiIrLoadErrorSource::Parse(source),
        }
    }

    /// Path that failed to load.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Display for GeordiIrLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "Geordi IR load failed: {}", self.path.display())
    }
}

impl Error for GeordiIrLoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.source {
            GeordiIrLoadErrorSource::File(source) => Some(source),
            GeordiIrLoadErrorSource::Parse(source) => Some(source),
        }
    }
}

/// Parse a Geordi IR JSON string into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiIrParseError` when the source is not valid JSON or does not match the
/// rectangle-only Rust MVP subset.
pub fn parse_geordi_ir(source: &str) -> Result<GeordiIr, GeordiIrParseError> {
    serde_json::from_str(source).map_err(GeordiIrParseError::new)
}

/// Load a Geordi IR artifact from a path into typed Rust structs.
///
/// # Errors
///
/// Returns `GeordiIrLoadError` when the file cannot be read or its contents cannot be parsed as
/// the rectangle-only Rust MVP subset.
pub fn load_geordi_ir(path: impl AsRef<Path>) -> Result<GeordiIr, GeordiIrLoadError> {
    let path = path.as_ref();
    let source = fs::read_to_string(path)
        .map_err(|error| GeordiIrLoadError::file(path.to_path_buf(), error))?;

    parse_geordi_ir(&source).map_err(|error| GeordiIrLoadError::parse(path.to_path_buf(), error))
}

#[cfg(test)]
mod tests {
    use super::{GeordiIrLoadError, GeordiIrParseError, load_geordi_ir, parse_geordi_ir};
    use std::error::Error;
    use std::fmt::{Display, Formatter};
    use std::path::PathBuf;

    #[derive(Debug)]
    enum GeordiIrTestError {
        Load(GeordiIrLoadError),
        Parse(GeordiIrParseError),
    }

    impl Display for GeordiIrTestError {
        fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("Geordi IR test failed")
        }
    }

    impl Error for GeordiIrTestError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            match self {
                Self::Load(source) => Some(source),
                Self::Parse(source) => Some(source),
            }
        }
    }

    impl From<GeordiIrLoadError> for GeordiIrTestError {
        fn from(error: GeordiIrLoadError) -> Self {
            Self::Load(error)
        }
    }

    impl From<GeordiIrParseError> for GeordiIrTestError {
        fn from(error: GeordiIrParseError) -> Self {
            Self::Parse(error)
        }
    }

    #[test]
    fn loads_the_shared_hello_panel_fixture() -> Result<(), GeordiIrTestError> {
        let ir = load_geordi_ir(fixture_path("hello-panel/scene.geordi.json"))?;

        assert_eq!(ir.ir_version, "geordi-ir/1");
        assert_eq!(ir.numeric_profile, "geordi-finite-binary64/1");
        assert_eq!(ir.scene.id, "render-everywhere:hello-panel");
        assert_exact_float(ir.scene.width, 640.0);
        assert_exact_float(ir.scene.height, 360.0);
        assert_eq!(ir.nodes.len(), 8);
        assert_eq!(ir.nodes[0].id, "background");
        assert_eq!(ir.nodes[0].props.fill, "#101820");

        Ok(())
    }

    #[test]
    fn parses_the_rectangle_subset_without_leaking_json_values() -> Result<(), GeordiIrTestError> {
        let source = r##"{
          "irVersion": "geordi-ir/1",
          "numericProfile": "geordi-finite-binary64/1",
          "requires": ["geordi/core/1", "layout.resolved", "shape.rect", "paint.solid"],
          "scene": { "id": "test", "width": 1, "height": 1, "units": "px" },
          "nodes": [
            {
              "id": "pixel",
              "kind": "Rect",
              "props": {
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "fill": "#ffffff"
              }
            }
          ]
        }"##;

        let ir = parse_geordi_ir(source)?;

        assert_exact_float(ir.nodes[0].props.width, 1.0);
        assert_exact_float(ir.nodes[0].props.height, 1.0);

        Ok(())
    }

    #[test]
    fn rejects_malformed_json_with_a_custom_parse_error() {
        let result = parse_geordi_ir("{");

        assert!(result.is_err());
    }

    fn fixture_path(path: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere")
            .join(path)
    }

    fn assert_exact_float(actual: f64, expected: f64) {
        assert_eq!(actual.to_bits(), expected.to_bits());
    }
}
