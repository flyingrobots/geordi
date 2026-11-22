//! The canonical shader and the identity chain the receipt pins.

use std::path::Path;

use super::error::{ErrorCode, ProofError};

/// Repository-relative path of the assembled shader the host executes.
pub const SURFACE_WGSL_PATH: &str = "packages/bijou-gpu/shaders/bijou-surface.wgsl";

/// Manifest `id` of the shader the host executes.
pub const SURFACE_SHADER_ID: &str = "bijou-surface";

/// The assembled `bijou-surface.wgsl` and the digests that identify it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShaderBundle {
    /// The exact WGSL text handed to `wgpu`.
    pub wgsl: String,
    /// SHA-256 of the WGSL bytes; equal to the manifest's `assembledWgslSha256`.
    pub assembled_wgsl_sha256: String,
    /// SHA-256 of the implementation manifest file.
    pub manifest_sha256: String,
    /// SHA-256 of the procedural glyph table the shader was assembled from.
    pub procedural_table_sha256: String,
}

impl ShaderBundle {
    /// Reads the shader and its manifest from a repository checkout and checks their identity.
    ///
    /// # Errors
    ///
    /// Returns `GEORDI_E_BIJOU_WGPU_IO` when a file cannot be read and
    /// `GEORDI_E_BIJOU_WGPU_SHADER_IDENTITY` when the shader, the procedural glyph table or the
    /// Bunny pins are not the ones the manifest and the generator name.
    pub fn load(repo_root: &Path) -> Result<Self, ProofError> {
        let _unused = repo_root;
        Err(ProofError::new(
            ErrorCode::RendererFault,
            "",
            "not implemented",
        ))
    }
}
