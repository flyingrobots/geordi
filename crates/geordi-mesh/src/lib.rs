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

/// One parsed PLY mesh vertex.
#[derive(Clone, Debug, PartialEq)]
pub struct PlyVertex {
    /// Vertex position in authored mesh coordinates.
    pub position: [f64; 3],
}

/// Mesh bounds computed from parsed vertex positions.
#[derive(Clone, Debug, PartialEq)]
pub struct PlyMeshBounds {
    /// Minimum x/y/z coordinate.
    pub min: [f64; 3],
    /// Maximum x/y/z coordinate.
    pub max: [f64; 3],
}

/// Parsed ASCII PLY triangle mesh.
#[derive(Clone, Debug, PartialEq)]
pub struct PlyMesh {
    /// Vertex properties declared by the PLY header.
    pub vertex_properties: Vec<String>,
    /// Parsed vertices.
    pub vertices: Vec<PlyVertex>,
    /// Triangle faces as vertex indices.
    pub faces: Vec<[usize; 3]>,
    /// Bounds computed from parsed vertices.
    pub bounds: PlyMeshBounds,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PlyHeader {
    vertex_count: usize,
    face_count: usize,
    vertex_start_index: usize,
    face_start_index: usize,
    vertex_properties: Vec<String>,
}

/// Custom error returned when the supported PLY header contract is violated.
#[derive(Debug, Eq, PartialEq)]
pub struct PlyHeaderError {
    line_number: usize,
    message: &'static str,
}

impl PlyHeaderError {
    const fn new(line_number: usize, message: &'static str) -> Self {
        Self {
            line_number,
            message,
        }
    }

    /// One-based source line number where the header failure was detected.
    #[must_use]
    pub const fn line_number(&self) -> usize {
        self.line_number
    }
}

impl Display for PlyHeaderError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("PLY header is unsupported")
    }
}

impl Error for PlyHeaderError {}

/// Custom error returned when a PLY vertex row is malformed.
#[derive(Debug, Eq, PartialEq)]
pub struct PlyVertexError {
    line_number: usize,
}

impl PlyVertexError {
    const fn new(line_number: usize) -> Self {
        Self { line_number }
    }

    /// One-based source line number where the vertex failure was detected.
    #[must_use]
    pub const fn line_number(&self) -> usize {
        self.line_number
    }
}

impl Display for PlyVertexError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("PLY vertex row is invalid")
    }
}

impl Error for PlyVertexError {}

/// Custom error returned when a PLY face row is malformed.
#[derive(Debug, Eq, PartialEq)]
pub struct PlyFaceError {
    line_number: usize,
}

impl PlyFaceError {
    const fn new(line_number: usize) -> Self {
        Self { line_number }
    }

    /// One-based source line number where the face failure was detected.
    #[must_use]
    pub const fn line_number(&self) -> usize {
        self.line_number
    }
}

impl Display for PlyFaceError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("PLY triangle face row is invalid")
    }
}

impl Error for PlyFaceError {}

/// Custom error returned when parsing a PLY mesh fails.
#[derive(Debug, Eq, PartialEq)]
pub enum PlyMeshParseError {
    /// Header failure.
    Header(PlyHeaderError),
    /// Vertex row failure.
    Vertex(PlyVertexError),
    /// Face row failure.
    Face(PlyFaceError),
}

impl Display for PlyMeshParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("PLY mesh parse failed")
    }
}

impl Error for PlyMeshParseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(source) => Some(source),
            Self::Vertex(source) => Some(source),
            Self::Face(source) => Some(source),
        }
    }
}

impl From<PlyHeaderError> for PlyMeshParseError {
    fn from(error: PlyHeaderError) -> Self {
        Self::Header(error)
    }
}

impl From<PlyVertexError> for PlyMeshParseError {
    fn from(error: PlyVertexError) -> Self {
        Self::Vertex(error)
    }
}

impl From<PlyFaceError> for PlyMeshParseError {
    fn from(error: PlyFaceError) -> Self {
        Self::Face(error)
    }
}

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

/// Parse the supported ASCII PLY triangle mesh subset.
///
/// # Errors
///
/// Returns `PlyMeshParseError` when the header, vertex rows, or face rows violate the supported
/// `geordi-ascii-ply-triangle-mesh/1` subset.
pub fn parse_ascii_ply_triangle_mesh(source: &str) -> Result<PlyMesh, PlyMeshParseError> {
    let lines: Vec<&str> = source.lines().collect();
    let header = parse_ply_header(&lines)?;
    let vertices = parse_ply_vertices(&lines, &header)?;
    let faces = parse_ply_faces(&lines, &header, vertices.len())?;
    let bounds = bounds_from_vertices(&vertices)?;

    Ok(PlyMesh {
        vertex_properties: header.vertex_properties,
        vertices,
        faces,
        bounds,
    })
}

fn parse_ply_header(lines: &[&str]) -> Result<PlyHeader, PlyHeaderError> {
    if line_at(lines, 0)?.trim() != "ply" {
        return Err(PlyHeaderError::new(1, "PLY source must start with ply"));
    }

    let mut current_element = "";
    let mut face_count = None;
    let mut face_property_found = false;
    let mut vertex_count = None;
    let mut vertex_properties = Vec::<String>::new();

    for index in 1..lines.len() {
        let line_number = index + 1;
        let line = line_at(lines, index)?.trim();
        if line == "end_header" {
            let vertex_count = vertex_count
                .ok_or_else(|| PlyHeaderError::new(line_number, "PLY vertex count is missing"))?;
            let face_count = face_count
                .ok_or_else(|| PlyHeaderError::new(line_number, "PLY face count is missing"))?;
            if !face_property_found {
                return Err(PlyHeaderError::new(
                    line_number,
                    "PLY face property is missing",
                ));
            }
            assert_vertex_position_properties(&vertex_properties, line_number)?;
            let vertex_start_index = index + 1;
            return Ok(PlyHeader {
                face_count,
                face_start_index: vertex_start_index + vertex_count,
                vertex_count,
                vertex_properties,
                vertex_start_index,
            });
        }

        if line.is_empty() || line.starts_with("comment ") || line == "format ascii 1.0" {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.as_slice().get(0..2) == Some(&["element", "vertex"]) {
            vertex_count = Some(parse_positive_count(parts.get(2).copied(), line_number)?);
            current_element = "vertex";
            continue;
        }

        if parts.as_slice().get(0..2) == Some(&["element", "face"]) {
            face_count = Some(parse_positive_count(parts.get(2).copied(), line_number)?);
            current_element = "face";
            continue;
        }

        if parts.first() == Some(&"property") && current_element == "vertex" {
            if parts.len() != 3 {
                return Err(PlyHeaderError::new(
                    line_number,
                    "PLY vertex property is unsupported",
                ));
            }
            let property_name = parts[2];
            vertex_properties.push(property_name.to_owned());
            continue;
        }

        if line == "property list uchar int vertex_indices" && current_element == "face" {
            face_property_found = true;
            continue;
        }

        return Err(PlyHeaderError::new(
            line_number,
            "PLY header line is unsupported",
        ));
    }

    Err(PlyHeaderError::new(
        lines.len(),
        "PLY header must end with end_header",
    ))
}

fn parse_ply_vertices(
    lines: &[&str],
    header: &PlyHeader,
) -> Result<Vec<PlyVertex>, PlyVertexError> {
    let mut vertices = Vec::with_capacity(header.vertex_count);
    for index in 0..header.vertex_count {
        let line_index = header.vertex_start_index + index;
        let line_number = line_index + 1;
        let fields: Vec<&str> = line_at(lines, line_index)
            .map_err(|_| PlyVertexError::new(line_number))?
            .split_whitespace()
            .collect();
        if fields.len() != header.vertex_properties.len() {
            return Err(PlyVertexError::new(line_number));
        }

        vertices.push(PlyVertex {
            position: [
                parse_finite_number(fields.first().copied(), line_number)?,
                parse_finite_number(fields.get(1).copied(), line_number)?,
                parse_finite_number(fields.get(2).copied(), line_number)?,
            ],
        });
    }

    Ok(vertices)
}

fn parse_ply_faces(
    lines: &[&str],
    header: &PlyHeader,
    vertex_count: usize,
) -> Result<Vec<[usize; 3]>, PlyFaceError> {
    let mut faces = Vec::with_capacity(header.face_count);
    for index in 0..header.face_count {
        let line_index = header.face_start_index + index;
        let line_number = line_index + 1;
        let fields: Vec<&str> = line_at(lines, line_index)
            .map_err(|_| PlyFaceError::new(line_number))?
            .split_whitespace()
            .collect();
        if fields.len() != 4 || fields.first() != Some(&"3") {
            return Err(PlyFaceError::new(line_number));
        }

        faces.push([
            parse_face_index(fields.get(1).copied(), vertex_count, line_number)?,
            parse_face_index(fields.get(2).copied(), vertex_count, line_number)?,
            parse_face_index(fields.get(3).copied(), vertex_count, line_number)?,
        ]);
    }

    Ok(faces)
}

fn bounds_from_vertices(vertices: &[PlyVertex]) -> Result<PlyMeshBounds, PlyVertexError> {
    if vertices.is_empty() {
        return Err(PlyVertexError::new(0));
    }

    let mut min = [f64::INFINITY, f64::INFINITY, f64::INFINITY];
    let mut max = [f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for vertex in vertices {
        for axis in 0..3 {
            min[axis] = min[axis].min(vertex.position[axis]);
            max[axis] = max[axis].max(vertex.position[axis]);
        }
    }

    Ok(PlyMeshBounds { min, max })
}

fn assert_vertex_position_properties(
    properties: &[String],
    line_number: usize,
) -> Result<(), PlyHeaderError> {
    let starts_with_position = properties
        .get(0..3)
        .is_some_and(|slice| slice == ["x", "y", "z"]);
    if starts_with_position {
        Ok(())
    } else {
        Err(PlyHeaderError::new(
            line_number,
            "PLY vertex properties must begin x y z",
        ))
    }
}

fn parse_positive_count(value: Option<&str>, line_number: usize) -> Result<usize, PlyHeaderError> {
    let Some(value) = value else {
        return Err(PlyHeaderError::new(
            line_number,
            "PLY element count is missing",
        ));
    };
    let parsed = value
        .parse::<usize>()
        .map_err(|_| PlyHeaderError::new(line_number, "PLY element count is invalid"))?;
    if parsed == 0 {
        Err(PlyHeaderError::new(
            line_number,
            "PLY element count must be positive",
        ))
    } else {
        Ok(parsed)
    }
}

fn parse_finite_number(value: Option<&str>, line_number: usize) -> Result<f64, PlyVertexError> {
    let Some(value) = value else {
        return Err(PlyVertexError::new(line_number));
    };
    let parsed = value
        .parse::<f64>()
        .map_err(|_| PlyVertexError::new(line_number))?;
    if parsed.is_finite() {
        Ok(parsed)
    } else {
        Err(PlyVertexError::new(line_number))
    }
}

fn parse_face_index(
    value: Option<&str>,
    vertex_count: usize,
    line_number: usize,
) -> Result<usize, PlyFaceError> {
    let Some(value) = value else {
        return Err(PlyFaceError::new(line_number));
    };
    let parsed = value
        .parse::<usize>()
        .map_err(|_| PlyFaceError::new(line_number))?;
    if parsed < vertex_count {
        Ok(parsed)
    } else {
        Err(PlyFaceError::new(line_number))
    }
}

fn line_at<'a>(lines: &'a [&str], index: usize) -> Result<&'a str, PlyHeaderError> {
    lines
        .get(index)
        .copied()
        .ok_or_else(|| PlyHeaderError::new(index + 1, "PLY source ended unexpectedly"))
}

#[cfg(test)]
mod tests {
    use super::{
        MeshAssetHashMismatchError, PlyMeshParseError, assert_mesh_asset_sha256,
        mesh_asset_sha256_from_bytes, parse_ascii_ply_triangle_mesh,
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

    #[test]
    fn parses_the_stanford_bunny_ply_into_typed_mesh_data() -> Result<(), Box<dyn Error>> {
        let source = fs::read_to_string(bunny_path())?;
        let mesh = parse_ascii_ply_triangle_mesh(&source)?;

        assert_eq!(
            mesh.vertex_properties,
            ["x", "y", "z", "confidence", "intensity"]
        );
        assert_eq!(mesh.vertices.len(), 1889);
        assert_eq!(mesh.faces.len(), 3851);
        assert_exact_vec3(mesh.bounds.min, [-0.094_364_3, 0.033_414_3, -0.061_672_1]);
        assert_exact_vec3(mesh.bounds.max, [0.060_934_6, 0.184_813, 0.058_465_1]);
        assert_eq!(mesh.faces[0], [4, 132, 80]);
        Ok(())
    }

    #[test]
    fn rejects_unsupported_ply_headers_with_a_custom_error() {
        let result = parse_ascii_ply_triangle_mesh(
            "ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\n",
        );

        assert!(matches!(result, Err(PlyMeshParseError::Header(_))));
    }

    #[test]
    fn rejects_malformed_vertices_with_a_custom_error() {
        let result = parse_ascii_ply_triangle_mesh(
            "ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 NaN 0\n3 0 0 0\n",
        );

        assert!(matches!(result, Err(PlyMeshParseError::Vertex(_))));
    }

    #[test]
    fn rejects_non_triangle_faces_with_a_custom_error() {
        let result = parse_ascii_ply_triangle_mesh(
            "ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n4 0 0 0 0\n",
        );

        assert!(matches!(result, Err(PlyMeshParseError::Face(_))));
    }

    fn bunny_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/render-everywhere/assets/stanford-bunny/bun_zipper_res3.ply")
    }

    fn assert_exact_vec3(actual: [f64; 3], expected: [f64; 3]) {
        assert_eq!(actual.map(f64::to_bits), expected.map(f64::to_bits));
    }
}
