//! The canonical shader and the identity chain the receipt pins.

use std::fs;
use std::path::Path;

use geordi_bijou_shadergen::{
    BUNNY_PRIMITIVES, GLYPH_TABLE_PATH, GPU_ABI_VERSION, MANIFEST_PATH, sha256_hex,
};
use serde_json::Value;

use super::error::{ErrorCode, ProofError};
use super::json::fail;

/// Repository-relative path of the assembled shader the host executes.
pub const SURFACE_WGSL_PATH: &str = "packages/bijou-gpu/shaders/bijou-surface.wgsl";

/// Manifest `id` of the shader the host executes.
pub const SURFACE_SHADER_ID: &str = "bijou-surface";

const IDENTITY: ErrorCode = ErrorCode::ShaderIdentity;

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

fn read(repo_root: &Path, path: &str) -> Result<Vec<u8>, ProofError> {
    fs::read(repo_root.join(path))
        .map_err(|error| ProofError::new(ErrorCode::Io, path, format!("cannot read: {error}")))
}

impl ShaderBundle {
    /// Reads the shader and its manifest from a repository checkout and checks their identity.
    ///
    /// The host never assembles or edits WGSL. It executes the checked-in module, and only when
    /// that module, the procedural glyph table and the Bunny pins are the ones the
    /// implementation manifest of `geordi-bijou-shadergen` names.
    ///
    /// # Errors
    ///
    /// Returns `GEORDI_E_BIJOU_WGPU_IO` when a file cannot be read and
    /// `GEORDI_E_BIJOU_WGPU_SHADER_IDENTITY` when the shader, the procedural glyph table or the
    /// Bunny pins are not the ones the manifest and the generator name.
    pub fn load(repo_root: &Path) -> Result<Self, ProofError> {
        let manifest_bytes = read(repo_root, MANIFEST_PATH)?;
        let manifest: Value = serde_json::from_slice(&manifest_bytes).map_err(|error| {
            ProofError::new(IDENTITY, MANIFEST_PATH, format!("not JSON: {error}"))
        })?;
        if manifest["gpuAbiVersion"] != GPU_ABI_VERSION {
            return fail(
                IDENTITY,
                MANIFEST_PATH,
                format!("manifest is not for {GPU_ABI_VERSION}"),
            );
        }
        let pins = manifest["bunnyPrimitives"].as_array();
        let pinned = pins.is_some_and(|pins| {
            pins.len() == BUNNY_PRIMITIVES.len()
                && pins.iter().zip(BUNNY_PRIMITIVES).all(|(pin, primitive)| {
                    pin["contractId"] == primitive.contract_id
                        && pin["bunnyCommit"] == primitive.bunny_commit
                        && pin["wgslSha256"] == primitive.wgsl_sha256
                        && pin["vectorsSha256"] == primitive.vectors_sha256
                })
        });
        if !pinned {
            return fail(
                IDENTITY,
                MANIFEST_PATH,
                "bunnyPrimitives are not the pinned Bunny primitives",
            );
        }

        let table_sha256 = sha256_hex(&read(repo_root, GLYPH_TABLE_PATH)?);
        if manifest["proceduralTableSha256"] != table_sha256.as_str() {
            return fail(
                IDENTITY,
                GLYPH_TABLE_PATH,
                format!("file hashes to {table_sha256}; the manifest names another table"),
            );
        }

        let surface = manifest["shaders"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|shader| shader["id"] == SURFACE_SHADER_ID);
        let Some(surface) = surface else {
            return fail(
                IDENTITY,
                MANIFEST_PATH,
                format!("manifest has no {SURFACE_SHADER_ID} shader"),
            );
        };
        if surface["wgslPath"] != SURFACE_WGSL_PATH {
            return fail(
                IDENTITY,
                MANIFEST_PATH,
                format!("{SURFACE_SHADER_ID} is not at {SURFACE_WGSL_PATH}"),
            );
        }
        let wgsl_bytes = read(repo_root, SURFACE_WGSL_PATH)?;
        let assembled_wgsl_sha256 = sha256_hex(&wgsl_bytes);
        if surface["assembledWgslSha256"] != assembled_wgsl_sha256.as_str() {
            return fail(
                IDENTITY,
                SURFACE_WGSL_PATH,
                format!(
                    "file hashes to {assembled_wgsl_sha256}; the manifest pins {}",
                    surface["assembledWgslSha256"]
                ),
            );
        }
        let wgsl = String::from_utf8(wgsl_bytes)
            .map_err(|_| ProofError::new(IDENTITY, SURFACE_WGSL_PATH, "shader is not UTF-8"))?;
        Ok(Self {
            wgsl,
            assembled_wgsl_sha256,
            manifest_sha256: sha256_hex(&manifest_bytes),
            procedural_table_sha256: table_sha256,
        })
    }
}
