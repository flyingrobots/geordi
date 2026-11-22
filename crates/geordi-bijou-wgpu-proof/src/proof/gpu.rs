//! Offscreen `wgpu` rendering and read-back.

use super::error::{ErrorCode, ProofError};
use super::frame::FrameSpec;
use super::glyph_pack::GlyphPack;
use super::prepare::PreparedCells;
use super::shader::ShaderBundle;

/// Whether the host may ask the system for a `wgpu` adapter.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterPolicy {
    /// Use the best adapter the system offers.
    Auto,
    /// Create no instance and report the backend as unavailable. The negative capability lane.
    Deny,
}

/// The evidence level of a run, as `geordi-bijou-gpu-receipt/1` names it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvidenceLevel {
    /// A hardware GPU adapter executed the frame and the pixels were read back.
    GpuProbed,
    /// An adapter that is not known to be hardware executed the frame.
    SoftwareProbed,
    /// No adapter or device could be created. Witnesses a refusal; never a pass.
    CapabilityRefused,
}

impl EvidenceLevel {
    /// The receipt spelling.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::GpuProbed => "gpu-probed",
            Self::SoftwareProbed => "software-probed",
            Self::CapabilityRefused => "capability-refused",
        }
    }
}

/// What kind of device an adapter says it is.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeviceClass {
    /// Discrete GPU.
    DiscreteGpu,
    /// Integrated GPU.
    IntegratedGpu,
    /// Virtual or hosted GPU. Not thereby software.
    VirtualGpu,
    /// CPU: software execution.
    Cpu,
    /// Unknown.
    Other,
}

impl DeviceClass {
    /// Kebab-case name.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::DiscreteGpu => "discrete-gpu",
            Self::IntegratedGpu => "integrated-gpu",
            Self::VirtualGpu => "virtual-gpu",
            Self::Cpu => "cpu",
            Self::Other => "other",
        }
    }

    /// The evidence level a frame executed on this class of device may claim.
    ///
    /// Only an adapter that names itself a discrete, integrated or virtual GPU supports a
    /// hardware claim. A CPU adapter is software execution, and an adapter of unknown class is
    /// reported as software too, because it is not proven to be hardware.
    #[must_use]
    pub const fn evidence_level(self) -> EvidenceLevel {
        match self {
            Self::DiscreteGpu | Self::IntegratedGpu | Self::VirtualGpu => EvidenceLevel::GpuProbed,
            Self::Cpu | Self::Other => EvidenceLevel::SoftwareProbed,
        }
    }
}

/// The adapter that executed a frame.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdapterIdentity {
    /// `wgpu` backend, lowercase: `metal`, `vulkan`, `dx12`, `gl`.
    pub backend: String,
    /// Adapter name.
    pub name: String,
    /// Driver name. May be empty.
    pub driver: String,
    /// Driver version or description. May be empty.
    pub driver_info: String,
    /// Device class.
    pub device_class: DeviceClass,
    /// PCI vendor id, or a backend-specific value.
    pub vendor: u32,
    /// PCI device id, or a backend-specific value.
    pub device: u32,
}

/// What happened when the host tried to render.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RenderOutcome {
    /// The frame was drawn and read back.
    Rendered {
        /// Tight top-left row-major RGBA8, `canvas_px_w * canvas_px_h * 4` bytes.
        rgba: Vec<u8>,
        /// The adapter that executed the frame.
        adapter: AdapterIdentity,
    },
    /// No adapter or device could be created. Nothing was drawn.
    Unavailable {
        /// Why.
        detail: String,
    },
}

impl RenderOutcome {
    /// The evidence level this outcome supports.
    #[must_use]
    pub const fn evidence_level(&self) -> EvidenceLevel {
        match self {
            Self::Rendered { adapter, .. } => adapter.device_class.evidence_level(),
            Self::Unavailable { .. } => EvidenceLevel::CapabilityRefused,
        }
    }
}

/// Renders one frame offscreen with `bijou-surface.wgsl` and reads it back.
///
/// # Errors
///
/// Returns `GEORDI_E_BIJOU_RENDERER_FAULT` when an adapter and device exist but shader
/// compilation, drawing or read-back fails. A missing adapter is not an error: it is
/// [`RenderOutcome::Unavailable`].
pub fn render_offscreen(
    shader: &ShaderBundle,
    prepared: &PreparedCells,
    pack: &GlyphPack,
    frame: &FrameSpec,
    policy: AdapterPolicy,
) -> Result<RenderOutcome, ProofError> {
    let _unused = (shader, prepared, pack, frame, policy);
    Err(ProofError::new(
        ErrorCode::RendererFault,
        "",
        "not implemented",
    ))
}
