//! Frame geometry, the uniform block, row-padding removal and probe points.

use super::error::{ErrorCode, ProofError};
use super::glyph_pack::GlyphPack;
use super::json::fail;
use super::prepare::PreparedCells;
use super::profile::MAX_TEXTURE_PX;

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
    /// need a texture edge above [`MAX_TEXTURE_PX`], or when the canvas is smaller than the grid.
    pub fn new(
        prepared: &PreparedCells,
        pack: &GlyphPack,
        canvas: Option<(u32, u32)>,
        default_fg: [u8; 3],
        default_bg: [u8; 3],
    ) -> Result<Self, ProofError> {
        let limit = ErrorCode::ResourceLimit;
        // Cell edges are at most 256 and cell counts at most 9,999, so these cannot overflow.
        let grid_px_w = prepared.width_cells * pack.cell_px_w;
        let grid_px_h = prepared.height_cells * pack.cell_px_h;
        for (label, value) in [
            ("grid width in pixels", grid_px_w),
            ("grid height in pixels", grid_px_h),
            ("atlas width in pixels", pack.atlas_cols * pack.cell_px_w),
            ("atlas height in pixels", pack.atlas_rows * pack.cell_px_h),
        ] {
            if value > MAX_TEXTURE_PX {
                return fail(
                    limit,
                    "",
                    format!("{label} is {value}; the limit is {MAX_TEXTURE_PX}"),
                );
            }
        }
        let (canvas_px_w, canvas_px_h) = canvas.unwrap_or((grid_px_w, grid_px_h));
        if canvas_px_w < grid_px_w || canvas_px_h < grid_px_h {
            return fail(
                limit,
                "",
                format!(
                    "canvas {canvas_px_w}x{canvas_px_h} is smaller than the {grid_px_w}x{grid_px_h} grid"
                ),
            );
        }
        if canvas_px_w > MAX_TEXTURE_PX || canvas_px_h > MAX_TEXTURE_PX {
            return fail(
                limit,
                "",
                format!(
                    "canvas {canvas_px_w}x{canvas_px_h} exceeds {MAX_TEXTURE_PX} pixels on an edge"
                ),
            );
        }
        Ok(Self {
            width_cells: prepared.width_cells,
            height_cells: prepared.height_cells,
            cell_px_w: pack.cell_px_w,
            cell_px_h: pack.cell_px_h,
            canvas_px_w,
            canvas_px_h,
            atlas_cols: pack.atlas_cols,
            default_fg,
            default_bg,
        })
    }

    /// The 64-byte `BijouSurfaceUniforms` block, little-endian.
    ///
    /// The byte offsets are the ones the shader manifest declares: `canvasPx` 0, `cellPx` 8,
    /// `gridCells` 16, `atlasCols` 24, `defaultFg` 32, `defaultBg` 48, `flags` 60.
    #[must_use]
    pub fn uniform_bytes(&self) -> [u8; 64] {
        let [fg_r, fg_g, fg_b] = self.default_fg.map(u32::from);
        let [bg_r, bg_g, bg_b] = self.default_bg.map(u32::from);
        let lanes: [u32; 16] = [
            self.canvas_px_w,
            self.canvas_px_h,
            self.cell_px_w,
            self.cell_px_h,
            self.width_cells,
            self.height_cells,
            self.atlas_cols,
            0,
            fg_r,
            fg_g,
            fg_b,
            0,
            bg_r,
            bg_g,
            bg_b,
            0,
        ];
        let mut bytes = [0_u8; 64];
        for (chunk, lane) in bytes.as_chunks_mut::<4>().0.iter_mut().zip(lanes) {
            *chunk = lane.to_le_bytes();
        }
        bytes
    }

    /// The cells a receipt probes, as `(col, row)`.
    ///
    /// Up to [`MAX_CELL_PROBES`] cells at an even stride in row-major order.
    #[must_use]
    pub fn probe_cells(&self) -> Vec<(u32, u32)> {
        let cell_count = self.width_cells * self.height_cells;
        let stride = cell_count.div_ceil(MAX_CELL_PROBES).max(1);
        (0..cell_count)
            .step_by(stride as usize)
            .map(|cell| (cell % self.width_cells, cell / self.width_cells))
            .collect()
    }

    /// The pixels a receipt probes.
    ///
    /// The centre of each of [`FrameSpec::probe_cells`], then the bottom-right canvas pixel.
    #[must_use]
    pub fn probe_points(&self) -> Vec<(u32, u32)> {
        let mut points: Vec<(u32, u32)> = self
            .probe_cells()
            .into_iter()
            .map(|(col, row)| {
                (
                    col * self.cell_px_w + self.cell_px_w / 2,
                    row * self.cell_px_h + self.cell_px_h / 2,
                )
            })
            .collect();
        points.push((self.canvas_px_w - 1, self.canvas_px_h - 1));
        points
    }
}

/// Bytes per row of a texture-to-buffer copy of an RGBA8 texture `width_px` wide.
#[must_use]
pub const fn padded_bytes_per_row(width_px: u32) -> u32 {
    (width_px * 4).next_multiple_of(COPY_ROW_ALIGNMENT)
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
    let stride = padded_bytes_per_row(width_px) as usize;
    let tight_row = width_px as usize * 4;
    let rows = height_px as usize;
    let mut tight = Vec::with_capacity(tight_row * rows);
    for row in 0..rows {
        let start = row * stride;
        let Some(bytes) = padded.get(start..start + tight_row) else {
            return fail(
                ErrorCode::RendererFault,
                "",
                format!(
                    "read-back holds {} bytes; row {row} is missing",
                    padded.len()
                ),
            );
        };
        tight.extend_from_slice(bytes);
    }
    Ok(tight)
}

/// Parses a canonical uppercase `#RRGGBB` colour.
#[must_use]
pub fn parse_hex_color(text: &str) -> Option<[u8; 3]> {
    let digits = text.strip_prefix('#')?.as_bytes();
    if digits.len() != 6 {
        return None;
    }
    let digit = |byte: u8| match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    };
    let mut color = [0_u8; 3];
    for (channel, pair) in color.iter_mut().zip(digits.as_chunks::<2>().0) {
        *channel = (digit(pair[0])? << 4) | digit(pair[1])?;
    }
    Some(color)
}

/// Formats a colour as canonical uppercase `#RRGGBB`.
#[must_use]
pub fn format_hex_color(color: [u8; 3]) -> String {
    format!("#{:02X}{:02X}{:02X}", color[0], color[1], color[2])
}
