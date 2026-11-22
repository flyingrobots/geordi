//! Frame geometry, the uniform block, row-padding removal and probe points.

use super::error::{ErrorCode, ProofError};
use super::glyph_pack::GlyphPack;
use super::prepare::PreparedCells;

/// Default foreground of the conformance kit's reference frames, `#E6EDF3`.
pub const DEFAULT_FG: [u8; 3] = [0xe6, 0xed, 0xf3];

/// Default background of the conformance kit's reference frames, `#0D1117`.
pub const DEFAULT_BG: [u8; 3] = [0x0d, 0x11, 0x17];

/// Largest number of cell probes a receipt carries.
pub const MAX_CELL_PROBES: u32 = 256;

/// Row alignment `wgpu` requires of a texture-to-buffer copy.
pub const COPY_ROW_ALIGNMENT: u32 = 256;

/// Everything that decides a frame besides the prepared cells and the atlas.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FrameSpec {
    /// Grid width in cells.
    pub width_cells: u32,
    /// Grid height in cells.
    pub height_cells: u32,
    /// Cell width in physical pixels.
    pub cell_px_w: u32,
    /// Cell height in physical pixels.
    pub cell_px_h: u32,
    /// Canvas width in physical pixels.
    pub canvas_px_w: u32,
    /// Canvas height in physical pixels.
    pub canvas_px_h: u32,
    /// Slots per atlas row.
    pub atlas_cols: u32,
    /// Default foreground, one sRGB byte per channel.
    pub default_fg: [u8; 3],
    /// Default background, one sRGB byte per channel.
    pub default_bg: [u8; 3],
}

impl FrameSpec {
    /// Builds the frame geometry. `canvas` defaults to the exact size of the grid.
    ///
    /// # Errors
    ///
    /// Returns `GEORDI_E_BIJOU_WGPU_RESOURCE_LIMIT` when the grid, the canvas or the atlas would
    /// need a texture edge above [`super::profile::MAX_TEXTURE_PX`], or when the canvas is
    /// smaller than the grid.
    pub fn new(
        prepared: &PreparedCells,
        pack: &GlyphPack,
        canvas: Option<(u32, u32)>,
        default_fg: [u8; 3],
        default_bg: [u8; 3],
    ) -> Result<Self, ProofError> {
        let _unused = (prepared, pack, canvas, default_fg, default_bg);
        Err(ProofError::new(
            ErrorCode::RendererFault,
            "",
            "not implemented",
        ))
    }

    /// The 64-byte `BijouSurfaceUniforms` block, little-endian.
    #[must_use]
    pub const fn uniform_bytes(&self) -> [u8; 64] {
        [0; 64]
    }

    /// The pixels a receipt probes.
    ///
    /// The centre of up to [`MAX_CELL_PROBES`] cells at an even stride in row-major order, then
    /// the bottom-right canvas pixel.
    #[must_use]
    pub const fn probe_points(&self) -> Vec<(u32, u32)> {
        Vec::new()
    }
}

/// Bytes per row of a texture-to-buffer copy of an RGBA8 texture `width_px` wide.
#[must_use]
pub const fn padded_bytes_per_row(width_px: u32) -> u32 {
    let _unused = width_px;
    0
}

/// Removes the row padding of a texture-to-buffer copy.
///
/// Returns tight top-left row-major RGBA8: exactly `width_px * height_px * 4` bytes.
///
/// # Errors
///
/// Returns `GEORDI_E_BIJOU_RENDERER_FAULT` when `padded` is shorter than the copy must be.
pub fn strip_row_padding(
    padded: &[u8],
    width_px: u32,
    height_px: u32,
) -> Result<Vec<u8>, ProofError> {
    let _unused = (padded, width_px, height_px);
    Err(ProofError::new(
        ErrorCode::RendererFault,
        "",
        "not implemented",
    ))
}

/// Parses a canonical uppercase `#RRGGBB` colour.
#[must_use]
pub const fn parse_hex_color(text: &str) -> Option<[u8; 3]> {
    let _unused = text;
    None
}

/// Formats a colour as canonical uppercase `#RRGGBB`.
#[must_use]
pub fn format_hex_color(color: [u8; 3]) -> String {
    let _unused = color;
    String::new()
}
