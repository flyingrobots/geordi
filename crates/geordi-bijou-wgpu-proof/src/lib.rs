//! Bounded offscreen `wgpu` proof for the `bijou-surface-gpu/1` ABI.
//!
//! The crate validates one `packed-bijou-cells/1` receipt, prepares the `rgba32uint` cell record
//! of the ABI on the CPU, and (in later modules) renders it offscreen with the canonical
//! `bijou-surface.wgsl`. It opens no window and produces no cells on the GPU.
//!
//! The ABI is frozen in `docs/design/2026-11-bijou-surface-gpu-abi.md`.

mod proof;

pub use proof::*;

/// Version of the ABI this host presents.
pub const GPU_ABI_VERSION: &str = geordi_bijou_shadergen::GPU_ABI_VERSION;

/// Identifier of Bijou's ten-byte interchange cell.
pub const CELL_FORMAT_ID: &str = "bijou-packed-cell-u8x10-le/1";
