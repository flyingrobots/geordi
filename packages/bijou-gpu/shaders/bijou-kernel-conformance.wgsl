// GENERATED FILE. DO NOT EDIT.
//
// Assembled by geordi-bijou-shadergen, in this order, from:
//   packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_div_round_even.wgsl (bunny-u32-div-round-even/1, flyingrobots/bunny@3b7fbad, sha256 ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f)
//   packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_ellipse_classify.wgsl (bunny-u32-ellipse-classify/1, flyingrobots/bunny@292a2c3, sha256 1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99)
//   packages/bijou-gpu/shaders/src/bijou-kernel-conformance.main.wgsl
//
// Regenerate with: cargo run -p geordi-bijou-shadergen -- --write

// =============================================================================================
// Begin bunny-u32-div-round-even/1 (verbatim bytes of packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_div_round_even.wgsl)
// =============================================================================================
// Contract: bunny-u32-div-round-even/1
// Portable WGSL helper (zero entry points; adoptable directly by downstream shaders).
//
// Inputs:
//   n, d: u32 in 0..=4,294,967,295
// Output:
//   vec2<u32>(value, status)
//     status == 0u -> Success (value is ties-to-even rounded quotient of n / d)
//     status == 1u -> DivisionByZero (value is always 0u)
//
// Overflow-safe over the full u32 domain:
//   - Real control-flow branch checks d == 0u before `/` or `%`.
//   - s = d - r lies in 1..=d; comparing r with s avoids 2 * r overflow.
//   - When d == 1u, r == 0u so inc is false; when d >= 2u, q <= 2^31 - 1 so q + 1 fits in u32.
fn bunny_u32_div_round_even(n: u32, d: u32) -> vec2<u32> {
    if (d == 0u) {
        return vec2<u32>(0u, 1u);
    }
    let q: u32 = n / d;
    let r: u32 = n % d;
    let s: u32 = d - r;
    let inc: bool = (r > s) || ((r == s) && ((q & 1u) != 0u));
    return vec2<u32>(q + select(0u, 1u, inc), 0u);
}
// =============================================================================================
// End bunny-u32-div-round-even/1
// =============================================================================================

// =============================================================================================
// Begin bunny-u32-ellipse-classify/1 (verbatim bytes of packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_ellipse_classify.wgsl)
// =============================================================================================
// Bunny deterministic GPU math primitive: bunny-u32-ellipse-classify/1
//
// Portable WGSL helper (zero entry points) implementing exact unsigned 64-bit
// ellipse trichotomy via 2-limb u32 arithmetic over 0..=46,340:
//
//   (dx * semi_y)^2 + (dy * semi_x)^2  <=>  (semi_x * semi_y)^2
//
// Returns vec2<u32>(class, status):
//   - status == 0u (Ok): class is 0u (Inside), 1u (OnBoundary), or 2u (Outside)
//   - status == 1u (OutOfDomain): any operand > 46340u; class is 0u
//
// Explicit degenerate rule precedes the raw polynomial:
//   - if semi_x == 0u || semi_y == 0u:
//       (0u, 0u) -> OnBoundary (1u), all other points -> Outside (2u).
//
// Zero floats, zero 64-bit extensions, zero divisions, zero subtractions.
// Makes no claim of Q32.32 GPU conformance.

const BUNNY_U32_ELLIPSE_MAX_COORD: u32 = 46340u;

const BUNNY_U32_ELLIPSE_CLASS_INSIDE: u32 = 0u;
const BUNNY_U32_ELLIPSE_CLASS_ON_BOUNDARY: u32 = 1u;
const BUNNY_U32_ELLIPSE_CLASS_OUTSIDE: u32 = 2u;

const BUNNY_U32_ELLIPSE_STATUS_OK: u32 = 0u;
const BUNNY_U32_ELLIPSE_STATUS_OUT_OF_DOMAIN: u32 = 1u;

fn bunny_u32_mul_wide(lhs: u32, rhs: u32) -> vec2<u32> {
    let lhs_lo = lhs & 0xffffu;
    let lhs_hi = lhs >> 16u;
    let rhs_lo = rhs & 0xffffu;
    let rhs_hi = rhs >> 16u;

    let p00 = lhs_lo * rhs_lo;
    let p01 = lhs_lo * rhs_hi;
    let p10 = lhs_hi * rhs_lo;
    let p11 = lhs_hi * rhs_hi;

    let mid = (p00 >> 16u) + (p01 & 0xffffu) + (p10 & 0xffffu);
    let lo = (p00 & 0xffffu) | ((mid & 0xffffu) << 16u);
    let hi = p11 + (p01 >> 16u) + (p10 >> 16u) + (mid >> 16u);
    return vec2<u32>(lo, hi);
}

fn bunny_u64_add(lhs: vec2<u32>, rhs: vec2<u32>) -> vec2<u32> {
    let lo = lhs.x + rhs.x;
    let carry = select(0u, 1u, lo < lhs.x);
    let hi = lhs.y + rhs.y + carry;
    return vec2<u32>(lo, hi);
}

fn bunny_u32_ellipse_classify(dx: u32, dy: u32, semi_x: u32, semi_y: u32) -> vec2<u32> {
    if (dx > BUNNY_U32_ELLIPSE_MAX_COORD
        || dy > BUNNY_U32_ELLIPSE_MAX_COORD
        || semi_x > BUNNY_U32_ELLIPSE_MAX_COORD
        || semi_y > BUNNY_U32_ELLIPSE_MAX_COORD) {
        return vec2<u32>(0u, BUNNY_U32_ELLIPSE_STATUS_OUT_OF_DOMAIN);
    }

    if (semi_x == 0u || semi_y == 0u) {
        if (dx == 0u && dy == 0u) {
            return vec2<u32>(BUNNY_U32_ELLIPSE_CLASS_ON_BOUNDARY, BUNNY_U32_ELLIPSE_STATUS_OK);
        }
        return vec2<u32>(BUNNY_U32_ELLIPSE_CLASS_OUTSIDE, BUNNY_U32_ELLIPSE_STATUS_OK);
    }

    let term_x = dx * semi_y;
    let term_y = dy * semi_x;
    let radius = semi_x * semi_y;

    let lhs = bunny_u64_add(
        bunny_u32_mul_wide(term_x, term_x),
        bunny_u32_mul_wide(term_y, term_y),
    );
    let rhs = bunny_u32_mul_wide(radius, radius);

    if (lhs.y < rhs.y || (lhs.y == rhs.y && lhs.x < rhs.x)) {
        return vec2<u32>(BUNNY_U32_ELLIPSE_CLASS_INSIDE, BUNNY_U32_ELLIPSE_STATUS_OK);
    }
    if (lhs.y == rhs.y && lhs.x == rhs.x) {
        return vec2<u32>(BUNNY_U32_ELLIPSE_CLASS_ON_BOUNDARY, BUNNY_U32_ELLIPSE_STATUS_OK);
    }
    return vec2<u32>(BUNNY_U32_ELLIPSE_CLASS_OUTSIDE, BUNNY_U32_ELLIPSE_STATUS_OK);
}
// =============================================================================================
// End bunny-u32-ellipse-classify/1
// =============================================================================================

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
