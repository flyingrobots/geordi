//! Typed errors of the offscreen proof.

use std::error::Error;
use std::fmt::{Display, Formatter};

/// Stable code of a [`ProofError`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorCode {
    /// A `packed-bijou-cells/1` receipt violates the canonical contract.
    InvalidPackedCells,
    /// A cell or side-table entry holds a width-2 grapheme.
    UnsupportedWideGlyph,
    /// A grapheme has no slot in the pinned glyph pack and no procedural lowering.
    MissingGlyphSlot,
    /// The glyph pack is malformed or is not the pinned pack.
    InvalidAtlas,
    /// Physical cell metrics are outside `1..=256`.
    InvalidCellMetrics,
    /// The grid or canvas exceeds a limit of the endpoint profile.
    ResourceLimit,
    /// The shader on disk is not the one the implementation manifest names.
    ShaderIdentity,
    /// No `wgpu` adapter or device could be created.
    BackendUnavailable,
    /// A hardware GPU was required and the frame ran on a software adapter.
    HardwareGpuRequired,
    /// An available backend failed while preparing, drawing or reading back.
    RendererFault,
    /// The frame read back does not hash to the expected digest.
    FrameHashMismatch,
    /// A file could not be read or written.
    Io,
    /// The command line is invalid.
    Usage,
}

impl ErrorCode {
    /// Every code, in the order the error schema lists them.
    pub const ALL: [Self; 13] = [
        Self::InvalidPackedCells,
        Self::UnsupportedWideGlyph,
        Self::MissingGlyphSlot,
        Self::InvalidAtlas,
        Self::InvalidCellMetrics,
        Self::ResourceLimit,
        Self::ShaderIdentity,
        Self::BackendUnavailable,
        Self::HardwareGpuRequired,
        Self::RendererFault,
        Self::FrameHashMismatch,
        Self::Io,
        Self::Usage,
    ];

    /// The `GEORDI_E_…` code string.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidPackedCells => "GEORDI_E_BIJOU_INVALID_PACKED_CELLS",
            Self::UnsupportedWideGlyph => "GEORDI_E_BIJOU_UNSUPPORTED_WIDE_GLYPH",
            Self::MissingGlyphSlot => "GEORDI_E_BIJOU_MISSING_GLYPH_SLOT",
            Self::InvalidAtlas => "GEORDI_E_BIJOU_INVALID_ATLAS",
            Self::InvalidCellMetrics => "GEORDI_E_BIJOU_INVALID_CELL_METRICS",
            Self::ResourceLimit => "GEORDI_E_BIJOU_WGPU_RESOURCE_LIMIT",
            Self::ShaderIdentity => "GEORDI_E_BIJOU_WGPU_SHADER_IDENTITY",
            Self::BackendUnavailable => "GEORDI_E_BIJOU_BACKEND_UNAVAILABLE",
            Self::HardwareGpuRequired => "GEORDI_E_BIJOU_WGPU_HARDWARE_GPU_REQUIRED",
            Self::RendererFault => "GEORDI_E_BIJOU_RENDERER_FAULT",
            Self::FrameHashMismatch => "GEORDI_E_BIJOU_FRAME_HASH_MISMATCH",
            Self::Io => "GEORDI_E_BIJOU_WGPU_IO",
            Self::Usage => "GEORDI_E_BIJOU_WGPU_USAGE",
        }
    }
}

/// A typed failure: a stable code, the JSON path or file concerned, and a detail.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofError {
    /// Stable code.
    pub code: ErrorCode,
    /// JSON path (`$.bytes[3]`) or repository-relative file. Empty when neither applies.
    pub path: String,
    /// What was wrong.
    pub detail: String,
}

impl ProofError {
    /// Builds an error.
    #[must_use]
    pub fn new(code: ErrorCode, path: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code,
            path: path.into(),
            detail: detail.into(),
        }
    }
}

impl Display for ProofError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        if self.path.is_empty() {
            write!(formatter, "{}", self.detail)
        } else {
            write!(formatter, "{}: {}", self.path, self.detail)
        }
    }
}

impl Error for ProofError {}
