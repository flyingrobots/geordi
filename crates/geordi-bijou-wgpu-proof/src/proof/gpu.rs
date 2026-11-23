//! Offscreen `wgpu` rendering and read-back.

use std::borrow::Cow;
use std::sync::mpsc;

use super::error::{ErrorCode, ProofError};
use super::frame::{FrameSpec, padded_bytes_per_row, strip_row_padding};
use super::glyph_pack::GlyphPack;
use super::json::fail;
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
/// Adapters are tried in order of device class: discrete, integrated, virtual, unknown, CPU. The
/// first one that grants a device executes the frame.
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
    if policy == AdapterPolicy::Deny {
        return Ok(RenderOutcome::Unavailable {
            detail: "adapter access was denied by the caller; no wgpu instance was created"
                .to_owned(),
        });
    }
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
    let mut adapters = pollster::block_on(instance.enumerate_adapters(wgpu::Backends::all()));
    if adapters.is_empty() {
        return Ok(RenderOutcome::Unavailable {
            detail: "wgpu enumerated no adapter on this host".to_owned(),
        });
    }
    adapters.sort_by_key(|adapter| class_rank(device_class(adapter.get_info().device_type)));

    let needed = [
        frame.canvas_px_w,
        frame.canvas_px_h,
        frame.width_cells,
        frame.height_cells,
        pack.atlas_cols * pack.cell_px_w,
        pack.atlas_rows * pack.cell_px_h,
    ]
    .into_iter()
    .fold(0, u32::max);
    let mut limits = wgpu::Limits::downlevel_defaults();
    limits.max_texture_dimension_2d = limits.max_texture_dimension_2d.max(needed);

    let mut refusals = Vec::new();
    for adapter in adapters {
        let info = adapter.get_info();
        let descriptor = wgpu::DeviceDescriptor {
            label: Some("geordi-bijou-wgpu-proof"),
            required_limits: limits.clone(),
            ..wgpu::DeviceDescriptor::default()
        };
        match pollster::block_on(adapter.request_device(&descriptor)) {
            Ok((device, queue)) => {
                let rgba = draw_and_read_back(&device, &queue, shader, prepared, pack, frame)?;
                return Ok(RenderOutcome::Rendered {
                    rgba,
                    adapter: identity(&info),
                });
            }
            Err(error) => refusals.push(format!("{} ({}): {error}", info.name, info.backend)),
        }
    }
    Ok(RenderOutcome::Unavailable {
        detail: format!("no adapter granted a device: {}", refusals.join("; ")),
    })
}

const fn device_class(device_type: wgpu::DeviceType) -> DeviceClass {
    match device_type {
        wgpu::DeviceType::DiscreteGpu => DeviceClass::DiscreteGpu,
        wgpu::DeviceType::IntegratedGpu => DeviceClass::IntegratedGpu,
        wgpu::DeviceType::VirtualGpu => DeviceClass::VirtualGpu,
        wgpu::DeviceType::Cpu => DeviceClass::Cpu,
        wgpu::DeviceType::Other => DeviceClass::Other,
    }
}

const fn class_rank(class: DeviceClass) -> u8 {
    match class {
        DeviceClass::DiscreteGpu => 0,
        DeviceClass::IntegratedGpu => 1,
        DeviceClass::VirtualGpu => 2,
        DeviceClass::Other => 3,
        DeviceClass::Cpu => 4,
    }
}

fn identity(info: &wgpu::AdapterInfo) -> AdapterIdentity {
    AdapterIdentity {
        backend: info.backend.to_str().to_owned(),
        name: info.name.clone(),
        driver: info.driver.clone(),
        driver_info: info.driver_info.clone(),
        device_class: device_class(info.device_type),
        vendor: info.vendor,
        device: info.device,
    }
}

fn fault(detail: impl Into<String>) -> ProofError {
    ProofError::new(ErrorCode::RendererFault, "", detail)
}

const fn extent(width: u32, height: u32) -> wgpu::Extent3d {
    wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    }
}

fn texture(
    device: &wgpu::Device,
    label: &str,
    size: (u32, u32),
    format: wgpu::TextureFormat,
    usage: wgpu::TextureUsages,
) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: extent(size.0, size.1),
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage,
        view_formats: &[],
    })
}

/// Uploads tight rows. `Queue::write_texture` has no 256-byte row alignment requirement; only
/// buffer-to-texture and texture-to-buffer copies do.
fn upload(
    queue: &wgpu::Queue,
    target: &wgpu::Texture,
    bytes: &[u8],
    size: (u32, u32),
    bytes_per_texel: u32,
) {
    queue.write_texture(
        target.as_image_copy(),
        bytes,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(size.0 * bytes_per_texel),
            rows_per_image: Some(size.1),
        },
        extent(size.0, size.1),
    );
}

fn draw_and_read_back(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    shader: &ShaderBundle,
    prepared: &PreparedCells,
    pack: &GlyphPack,
    frame: &FrameSpec,
) -> Result<Vec<u8>, ProofError> {
    // Scopes turn wgpu validation, out-of-memory and internal errors into typed faults instead
    // of the default uncaptured-error panic.
    let internal = device.push_error_scope(wgpu::ErrorFilter::Internal);
    let out_of_memory = device.push_error_scope(wgpu::ErrorFilter::OutOfMemory);
    let validation = device.push_error_scope(wgpu::ErrorFilter::Validation);
    let readback = submit_frame(device, queue, shader, prepared, pack, frame);
    for scope in [validation, out_of_memory, internal] {
        if let Some(error) = pollster::block_on(scope.pop()) {
            return Err(fault(format!("wgpu reported an error: {error}")));
        }
    }

    let (sender, receiver) = mpsc::channel();
    readback.map_async(wgpu::MapMode::Read, .., move |result| {
        // The receiver outlives the poll below; a failed send cannot happen.
        let _unused = sender.send(result);
    });
    device
        .poll(wgpu::PollType::wait_indefinitely())
        .map_err(|error| fault(format!("device poll failed: {error}")))?;
    match receiver.try_recv() {
        Ok(Ok(())) => {}
        Ok(Err(error)) => return Err(fault(format!("read-back buffer did not map: {error}"))),
        Err(error) => {
            return Err(fault(format!(
                "read-back map callback did not run: {error}"
            )));
        }
    }
    let rgba = strip_row_padding(
        &readback.get_mapped_range(..),
        frame.canvas_px_w,
        frame.canvas_px_h,
    )?;
    readback.unmap();

    // The fragment stage writes alpha 255 to every pixel. Anything else means the draw did not
    // cover the target or the integer transport was altered.
    if let Some(index) = rgba
        .as_chunks::<4>()
        .0
        .iter()
        .position(|pixel| pixel[3] != 255)
    {
        return fail(
            ErrorCode::RendererFault,
            "",
            format!("pixel {index} was read back with alpha other than 255"),
        );
    }
    Ok(rgba)
}

/// Creates every resource, draws the fullscreen triangle and schedules the copy to a buffer.
fn submit_frame(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    shader: &ShaderBundle,
    prepared: &PreparedCells,
    pack: &GlyphPack,
    frame: &FrameSpec,
) -> wgpu::Buffer {
    let binding = wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST;
    let grid = (frame.width_cells, frame.height_cells);
    let cells = texture(
        device,
        "cells",
        grid,
        wgpu::TextureFormat::Rgba32Uint,
        binding,
    );
    upload(queue, &cells, &prepared.bytes(), grid, 16);

    let atlas_size = (
        pack.atlas_cols * pack.cell_px_w,
        pack.atlas_rows * pack.cell_px_h,
    );
    let atlas = texture(
        device,
        "glyph-atlas",
        atlas_size,
        wgpu::TextureFormat::Rgba8Uint,
        binding,
    );
    upload(queue, &atlas, &pack.rgba, atlas_size, 4);

    let canvas = (frame.canvas_px_w, frame.canvas_px_h);
    let target = texture(
        device,
        "canvas",
        canvas,
        wgpu::TextureFormat::Rgba8Uint,
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
    );

    let uniform_bytes = frame.uniform_bytes();
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("surface-uniforms"),
        size: uniform_bytes.len() as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&uniforms, 0, &uniform_bytes);

    let pipeline = surface_pipeline(device, shader);

    let cells_view = cells.create_view(&wgpu::TextureViewDescriptor::default());
    let atlas_view = atlas.create_view(&wgpu::TextureViewDescriptor::default());
    let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("bijou-surface"),
        layout: &pipeline.get_bind_group_layout(0),
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(&cells_view),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(&atlas_view),
            },
        ],
    });

    let padded_row = padded_bytes_per_row(frame.canvas_px_w);
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("canvas-readback"),
        size: u64::from(padded_row) * u64::from(frame.canvas_px_h),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    encode_frame(
        queue,
        device,
        &pipeline,
        &bind_group,
        &target,
        &target_view,
        &readback,
        frame,
    );
    readback
}

/// Compiles the exact assembled module: no preprocessing, no override, top-left fragment origin.
fn surface_pipeline(device: &wgpu::Device, shader: &ShaderBundle) -> wgpu::RenderPipeline {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("bijou-surface.wgsl"),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(&shader.wgsl)),
    });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("bijou-surface"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: wgpu::TextureFormat::Rgba8Uint,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    })
}

/// Draws the fullscreen triangle into `target` and schedules its copy into `readback`.
#[expect(
    clippy::too_many_arguments,
    reason = "each argument is a distinct wgpu resource of one frame"
)]
fn encode_frame(
    queue: &wgpu::Queue,
    device: &wgpu::Device,
    pipeline: &wgpu::RenderPipeline,
    bind_group: &wgpu::BindGroup,
    target: &wgpu::Texture,
    target_view: &wgpu::TextureView,
    readback: &wgpu::Buffer,
    frame: &FrameSpec,
) {
    let padded_row = padded_bytes_per_row(frame.canvas_px_w);
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("bijou-surface"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target_view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(pipeline);
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..3, 0..1);
    }
    encoder.copy_texture_to_buffer(
        target.as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: readback,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_row),
                rows_per_image: Some(frame.canvas_px_h),
            },
        },
        extent(frame.canvas_px_w, frame.canvas_px_h),
    );
    let _index = queue.submit(Some(encoder.finish()));
}
