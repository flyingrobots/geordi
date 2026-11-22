// Thin kernel conformance wrappers around the pinned Bunny helpers (authored section).
//
// Each fragment entry point reads one rgba32uint texel of operands at its own pixel and writes one
// rgba32uint texel of results. `geordi-bijou-shadergen` prepends the pinned Bunny helpers and
// writes the result to `bijou-kernel-conformance.wgsl`. None of this is part of a presenter.

// rgba32uint operands, one vector per texel.
@group(0) @binding(0) var kernel_inputs: texture_2d<u32>;

fn kernel_input(position: vec4<f32>) -> vec4<u32> {
    return textureLoad(kernel_inputs, vec2<u32>(u32(position.x), u32(position.y)), 0);
}

// Fullscreen triangle from the vertex index alone: (-1, -1), (3, -1), (-1, 3). No vertex buffers.
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    let x = f32((vertex_index << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertex_index & 2u) * 2.0 - 1.0;
    return vec4<f32>(x, y, 0.0, 1.0);
}

// Integer transport canary. Row 0 echoes the uploaded texel, which proves upload, `textureLoad`
// and readback together. Every other row writes constants that never passed through an upload,
// which proves the output path alone.
@fragment
fn fs_transport_canary(@builtin(position) position: vec4<f32>) -> @location(0) vec4<u32> {
    if (u32(position.y) == 0u) {
        return kernel_input(position);
    }
    return vec4<u32>(0xffffffffu, 0x80000000u, 0x7fffffffu, 0x01020304u);
}

// (n, d, _, _) -> (value, status, n, d).
@fragment
fn fs_div_round_even(@builtin(position) position: vec4<f32>) -> @location(0) vec4<u32> {
    let operands = kernel_input(position);
    let result = bunny_u32_div_round_even(operands.x, operands.y);
    return vec4<u32>(result.x, result.y, operands.x, operands.y);
}

// (dx, dy, semi_x, semi_y) -> (class, status, dx, dy).
@fragment
fn fs_ellipse_classify(@builtin(position) position: vec4<f32>) -> @location(0) vec4<u32> {
    let operands = kernel_input(position);
    let result = bunny_u32_ellipse_classify(operands.x, operands.y, operands.z, operands.w);
    return vec4<u32>(result.x, result.y, operands.x, operands.y);
}
