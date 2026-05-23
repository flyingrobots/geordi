//! Native Rust runtime profile checks for Geordi IR artifacts.

use geordi_ir::{GEORDI_IR_VERSION, GEORDI_NUMERIC_PROFILE, GeordiIr};
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
    use super::{GeordiRuntimeUnsupportedProfileError, assert_native_runtime_profile};
    use geordi_ir::{GeordiIrLoadError, load_geordi_ir};
    use std::error::Error;
    use std::fmt::{Display, Formatter};
    use std::path::PathBuf;

    #[derive(Debug)]
    enum GeordiRendererTestError {
        Load(GeordiIrLoadError),
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
                Self::Runtime(source) => Some(source),
            }
        }
    }

    impl From<GeordiIrLoadError> for GeordiRendererTestError {
        fn from(error: GeordiIrLoadError) -> Self {
            Self::Load(error)
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
