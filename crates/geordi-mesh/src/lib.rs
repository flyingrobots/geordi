//! Mesh asset contracts for Geordi render-everywhere demos.

use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt::{Display, Formatter};

/// Prefix used by Geordi SHA-256 content identity strings.
pub const GEORDI_SHA256_PREFIX: &str = "sha256:";

/// Custom error returned when mesh asset bytes do not match the expected hash.
#[derive(Debug, Eq, PartialEq)]
pub struct MeshAssetHashMismatchError {
    actual: String,
    expected: String,
}

impl MeshAssetHashMismatchError {
    fn new(expected: &str, actual: String) -> Self {
        Self {
            actual,
            expected: expected.to_owned(),
        }
    }

    /// Actual `sha256:` hash computed from the supplied bytes.
    #[must_use]
    pub fn actual(&self) -> &str {
        &self.actual
    }

    /// Expected `sha256:` hash supplied by the asset manifest.
    #[must_use]
    pub fn expected(&self) -> &str {
        &self.expected
    }
}

impl Display for MeshAssetHashMismatchError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Mesh asset hash mismatch")
    }
}

impl Error for MeshAssetHashMismatchError {}

/// Compute a `sha256:` hash string from mesh asset bytes.
#[must_use]
pub fn mesh_asset_sha256_from_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{GEORDI_SHA256_PREFIX}{digest:x}")
}

/// Assert that mesh asset bytes match the expected `sha256:` hash.
///
/// # Errors
///
/// Returns `MeshAssetHashMismatchError` when the computed hash differs from `expected`.
pub fn assert_mesh_asset_sha256(
    bytes: &[u8],
    expected: &str,
) -> Result<String, MeshAssetHashMismatchError> {
    let actual = mesh_asset_sha256_from_bytes(bytes);
    if actual == expected {
        Ok(actual)
    } else {
        Err(MeshAssetHashMismatchError::new(expected, actual))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        MeshAssetHashMismatchError, assert_mesh_asset_sha256, mesh_asset_sha256_from_bytes,
    };
    use std::error::Error;
    use std::fs;
    use std::path::PathBuf;

    const BUNNY_HASH: &str =
        "sha256:975e7f9b160b4ea15b0e225e21b10828ebcf678df020d2f6a46aa408fdcf5cd6";

    #[test]
    fn computes_the_stanford_bunny_hash_from_committed_bytes() -> Result<(), Box<dyn Error>> {
        let bytes = fs::read(bunny_path())?;

        assert_eq!(mesh_asset_sha256_from_bytes(&bytes), BUNNY_HASH);
        Ok(())
    }

    #[test]
    fn returns_the_expected_hash_when_bytes_match() -> Result<(), Box<dyn Error>> {
        let bytes = fs::read(bunny_path())?;

        assert_eq!(assert_mesh_asset_sha256(&bytes, BUNNY_HASH)?, BUNNY_HASH);
        Ok(())
    }

    #[test]
    fn returns_a_custom_error_when_bytes_do_not_match() {
        let result = assert_mesh_asset_sha256(
            &[1, 2, 3],
            "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        );

        assert!(matches!(result, Err(MeshAssetHashMismatchError { .. })));
    }

    fn bunny_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply")
    }
}
