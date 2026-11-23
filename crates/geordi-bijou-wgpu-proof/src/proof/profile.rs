//! The endpoint profile `geordi-wgpu-offscreen/1`: what the host accepts and how it is named.

/// Receipt `backendProfile` of this host.
pub const BACKEND_PROFILE: &str = "geordi-wgpu-offscreen/1";

/// Largest physical cell edge the ABI allows.
pub const MAX_CELL_PX: u32 = 256;

/// Largest edge, in texels, of any texture the host creates.
///
/// It bounds the cell grid, the atlas and the offscreen canvas. It is the WebGPU default
/// `maxTextureDimension2D`, so the host never asks an adapter for a raised limit.
pub const MAX_TEXTURE_PX: u32 = 8192;
