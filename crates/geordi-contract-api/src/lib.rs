//! Public-item snapshot of Rust source files (stub: implementation follows its tests).

use std::io::Write;

use quote as _;
use serde_json as _;
use syn as _;

#[cfg(test)]
mod tests;

/// `(message type, stream, JSON Schema)` of every message this command writes.
pub const SCHEMAS: [(&str, &str, &str); 0] = [];

/// One public item.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ApiItem {
    /// Item key.
    pub key: String,
    /// Normalised signature.
    pub signature: String,
    /// Value of a string constant.
    pub string_value: Option<String>,
    /// Source path of a re-export.
    pub reexport_from: Option<String>,
    /// `#[non_exhaustive]` on a struct or enum.
    pub non_exhaustive: bool,
    /// Whether every field of a struct is public.
    pub fields_all_public: Option<bool>,
}

/// Snapshot failure.
#[derive(Debug)]
pub enum ApiError {
    /// The source is not Rust.
    Parse {
        /// Parser message.
        detail: String,
    },
}

/// Public items of one source file.
///
/// # Errors
///
/// Always, until implemented.
pub fn public_items(_source: &str) -> Result<Vec<ApiItem>, ApiError> {
    Err(ApiError::Parse {
        detail: "not implemented".to_owned(),
    })
}

/// Runs the command line.
pub fn run(_args: &[String], _stdout: &mut dyn Write, _stderr: &mut dyn Write) -> u8 {
    1
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse { detail } => formatter.write_str(detail),
        }
    }
}

impl std::error::Error for ApiError {}
