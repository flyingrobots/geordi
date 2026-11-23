// GENERATED FILE. DO NOT EDIT.
//
// Assembled by geordi-bijou-shadergen, in this order, from:
//   packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_div_round_even.wgsl (bunny-u32-div-round-even/1, flyingrobots/bunny@3b7fbad, sha256 ed93a26df071da13e8d8514c42a8dcfb5cbc5969d6ab4397d26b147fc5dc2e7f)
//   packages/bijou-gpu/shaders/vendor/bunny/bunny_u32_ellipse_classify.wgsl (bunny-u32-ellipse-classify/1, flyingrobots/bunny@292a2c3, sha256 1b11121932031e2f1266087dded59e9c6f921bed7db1e9ed2ba4cf9b9c261e99)
//   fixtures/bijou-gpu/procedural-glyphs.json (sha256 7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46)
//   packages/bijou-gpu/shaders/src/bijou-surface.main.wgsl
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

// =============================================================================================
// Begin procedural glyph table (generated from fixtures/bijou-gpu/procedural-glyphs.json)
// =============================================================================================
// BOX_GLYPHS[codePoint - 0x2500], 14 bits per entry.
const BOX_GLYPHS: array<u32, 128> = array<u32, 128>(
    0x00005u, 0x0000au, 0x00050u, 0x000a0u, 0x00305u, 0x0030au, 0x00350u, 0x003a0u,
    0x00405u, 0x0040au, 0x00450u, 0x004a0u, 0x00044u, 0x00048u, 0x00084u, 0x00088u,
    0x00041u, 0x00042u, 0x00081u, 0x00082u, 0x00014u, 0x00018u, 0x00024u, 0x00028u,
    0x00011u, 0x00012u, 0x00021u, 0x00022u, 0x00054u, 0x00058u, 0x00064u, 0x00094u,
    0x000a4u, 0x00068u, 0x00098u, 0x000a8u, 0x00051u, 0x00052u, 0x00061u, 0x00091u,
    0x000a1u, 0x00062u, 0x00092u, 0x000a2u, 0x00045u, 0x00046u, 0x00049u, 0x0004au,
    0x00085u, 0x00086u, 0x00089u, 0x0008au, 0x00015u, 0x00016u, 0x00019u, 0x0001au,
    0x00025u, 0x00026u, 0x00029u, 0x0002au, 0x00055u, 0x00056u, 0x00059u, 0x0005au,
    0x00065u, 0x00095u, 0x000a5u, 0x00066u, 0x00069u, 0x00096u, 0x00099u, 0x0006au,
    0x0009au, 0x000a6u, 0x000a9u, 0x000aau, 0x00205u, 0x0020au, 0x00250u, 0x002a0u,
    0x0000fu, 0x000f0u, 0x0004cu, 0x000c4u, 0x000ccu, 0x00043u, 0x000c1u, 0x000c3u,
    0x0001cu, 0x00034u, 0x0003cu, 0x00013u, 0x00031u, 0x00033u, 0x0005cu, 0x000f4u,
    0x000fcu, 0x00053u, 0x000f1u, 0x000f3u, 0x0004fu, 0x000c5u, 0x000cfu, 0x0001fu,
    0x00035u, 0x0003fu, 0x0005fu, 0x000f5u, 0x000ffu, 0x00844u, 0x00841u, 0x00811u,
    0x00814u, 0x01000u, 0x02000u, 0x03000u, 0x00001u, 0x00010u, 0x00004u, 0x00040u,
    0x00002u, 0x00020u, 0x00008u, 0x00080u, 0x00009u, 0x00090u, 0x00006u, 0x00060u,
);

// BLOCK_GLYPHS[codePoint - 0x2580], 18 bits per entry.
const BLOCK_GLYPHS: array<u32, 32> = array<u32, 32>(
    0x04800u, 0x08870u, 0x08860u, 0x08850u, 0x08840u, 0x08830u, 0x08820u, 0x08810u,
    0x08800u, 0x08700u, 0x08600u, 0x08500u, 0x08400u, 0x08300u, 0x08200u, 0x08100u,
    0x08804u, 0x10001u, 0x10002u, 0x10003u, 0x01800u, 0x08807u, 0x20004u, 0x20008u,
    0x20001u, 0x2000du, 0x20009u, 0x20007u, 0x2000bu, 0x20002u, 0x20006u, 0x2000eu,
);
// =============================================================================================
// End procedural glyph table
// =============================================================================================

// bijou-surface-gpu/1 screen-space cell shader (authored section).
//
// The law this file implements is docs/design/2026-11-bijou-surface-gpu-abi.md. Every value that
// decides a pixel is a u32. The only floating-point values are the clip-space position written by
// the vertex stage and the rasterizer position read once by `frag_px` / `frag_py`.
//
// This file is not a complete module. `geordi-bijou-shadergen` prepends the pinned Bunny helpers
// (`bunny_u32_div_round_even`, `bunny_u32_ellipse_classify`) and the generated `BOX_GLYPHS` /
// `BLOCK_GLYPHS` table to it, and writes the result to `bijou-surface.wgsl`.

struct BijouSurfaceUniforms {
    // Physical drawing-buffer size in pixels.
    canvasPx: vec2<u32>,
    // Physical cell size in pixels, each in 1..=256.
    cellPx: vec2<u32>,
    // Grid size in cells.
    gridCells: vec2<u32>,
    // Number of cell-sized slots per GlyphAtlas row.
    atlasCols: u32,
    // Default foreground, one sRGB byte per lane.
    defaultFg: vec3<u32>,
    // Default background, one sRGB byte per lane.
    defaultBg: vec3<u32>,
    // Reserved. MUST be 0 in bijou-surface-gpu/1.
    flags: u32,
}

@group(0) @binding(0) var<uniform> surface: BijouSurfaceUniforms;
// rgba32uint prepared cell grid, one texel per cell.
@group(0) @binding(1) var cells: texture_2d<u32>;
// rgba8uint GlyphAtlas, cell-sized slots in row-major order.
@group(0) @binding(2) var glyph_atlas: texture_2d<u32>;

// `false` when the rasterizer position has a top-left origin (WebGPU, native wgpu). The GLSL ES
// 3.00 build sets it to `true`, because `gl_FragCoord.y` has a bottom-left origin.
override BIJOU_FRAG_ORIGIN_BOTTOM_LEFT: bool = false;

const GLYPH_KIND_ATLAS_MONO: u32 = 1u;
const GLYPH_KIND_ATLAS_COLOR: u32 = 2u;
const GLYPH_KIND_BRAILLE: u32 = 3u;
const GLYPH_KIND_BLOCK: u32 = 4u;
const GLYPH_KIND_BOX: u32 = 5u;

const FLAG_DIM: u32 = 0x02u;
const FLAG_STRIKETHROUGH: u32 = 0x04u;
const FLAG_INVERSE: u32 = 0x08u;
const FLAG_DASHED: u32 = 0x40u;

const ALPHA_FG_SET: u32 = 0x40u;
const ALPHA_BG_SET: u32 = 0x80u;

const UNDERLINE_SOLID: u32 = 1u;
const UNDERLINE_CURLY: u32 = 2u;
const UNDERLINE_DOTDASH: u32 = 3u;

// Coverage values returned by `glyph_quarter_coverage`.
const COVERAGE_NONE: u32 = 0u;
const COVERAGE_FULL: u32 = 4u;

// ---------------------------------------------------------------------------------------------
// Unsigned helpers
// ---------------------------------------------------------------------------------------------

// Unsigned saturating subtraction. Never wraps.
fn sat_sub(a: u32, b: u32) -> u32 {
    return max(a, b) - b;
}

// Unsigned absolute difference. Never wraps.
fn abs_diff(a: u32, b: u32) -> u32 {
    return max(a, b) - min(a, b);
}

// Lane-0 quotient of `bunny-u32-div-round-even/1`. Every caller passes a nonzero divisor.
fn div_round_even(n: u32, d: u32) -> u32 {
    return bunny_u32_div_round_even(n, d).x;
}

// lerpU8(a, b, num, den) = divRoundEven(a * (den - num) + b * num, den), with num <= den.
fn lerp_u8(a: u32, b: u32, num: u32, den: u32) -> u32 {
    return div_round_even(a * (den - num) + b * num, den);
}

fn lerp_rgb(a: vec3<u32>, b: vec3<u32>, num: u32, den: u32) -> vec3<u32> {
    return vec3<u32>(
        lerp_u8(a.x, b.x, num, den),
        lerp_u8(a.y, b.y, num, den),
        lerp_u8(a.z, b.z, num, den),
    );
}

fn unpack_rgb(word: u32) -> vec3<u32> {
    return vec3<u32>(word & 0xffu, (word >> 8u) & 0xffu, (word >> 16u) & 0xffu);
}

// `classify(...) <= 0`: Inside or OnBoundary, with status Ok.
fn ellipse_inside_or_on(dx: u32, dy: u32, semi_x: u32, semi_y: u32) -> bool {
    let res = bunny_u32_ellipse_classify(dx, dy, semi_x, semi_y);
    return res.y == 0u && res.x <= 1u;
}

// `classify(...) >= 0`: OnBoundary or Outside, with status Ok.
fn ellipse_on_or_outside(dx: u32, dy: u32, semi_x: u32, semi_y: u32) -> bool {
    let res = bunny_u32_ellipse_classify(dx, dy, semi_x, semi_y);
    return res.y == 0u && res.x >= 1u;
}

// ---------------------------------------------------------------------------------------------
// Section 7.1: Box-Drawing (U+2500..U+257F)
// ---------------------------------------------------------------------------------------------

fn box_light_px(w: u32) -> u32 {
    return max(1u, (w * 10u + 50u) / 100u);
}

// Start of a centered stroke of thickness `stroke` on an axis of length `extent`.
fn stroke_start(extent: u32, stroke: u32) -> u32 {
    return sat_sub(extent, stroke) / 2u;
}

fn in_span(v: u32, start: u32, width: u32) -> bool {
    return v >= start && v < start + width;
}

// Diagonals, U+2571..U+2573.
fn box_diagonal_lit(slash: bool, backslash: bool, lx: u32, ly: u32, w: u32, h: u32) -> bool {
    let light_px = box_light_px(w);
    let thin = light_px == 1u;
    let scale = select(1u, 10u, thin);
    let half_s = select(light_px, 11u, thin);
    let bound = half_s * (w + h);
    let rhs = half_s * half_s * (w * w + h * h);
    let x_term = (2u * lx + 1u) * h;
    let y_term = (2u * ly + 1u) * w;
    if (slash) {
        let d = scale * abs_diff(x_term + y_term, 2u * w * h);
        if (d <= bound && d * d <= rhs) {
            return true;
        }
    }
    if (backslash) {
        let d = scale * abs_diff(x_term, y_term);
        if (d <= bound && d * d <= rhs) {
            return true;
        }
    }
    return false;
}

// Option E4 rounded corners, U+256D..U+2570.
fn box_rounded_lit(has_right: bool, has_down: bool, lx: u32, ly: u32, w: u32, h: u32) -> bool {
    let light_px = box_light_px(w);
    let vx_start = stroke_start(w, light_px);
    let vx_end = min(w, vx_start + light_px);
    let hy_start = stroke_start(h, light_px);
    let hy_end = min(h, hy_start + light_px);

    let edge_x = select(0u, w - 1u, has_right);
    let edge_y = select(0u, h - 1u, has_down);
    let x_in = select(min(1u, w), sat_sub(w, 1u), has_right);
    let y_in = select(min(1u, h), sat_sub(h, 1u), has_down);
    let cx2 = 2u * x_in;
    let cy2 = 2u * y_in;

    let a_out = select(2u * sat_sub(vx_end, x_in), 2u * sat_sub(x_in, vx_start), has_right);
    let a_in = select(2u * sat_sub(vx_start, x_in), 2u * sat_sub(x_in, vx_end), has_right);
    let b_out = select(2u * sat_sub(hy_end, y_in), 2u * sat_sub(y_in, hy_start), has_down);
    let b_in = select(2u * sat_sub(hy_start, y_in), 2u * sat_sub(y_in, hy_end), has_down);
    let a_mid = (a_out + a_in) / 2u;
    let b_mid = (b_out + b_in) / 2u;

    let in_str_x = lx >= vx_start && lx < vx_end;
    let in_str_y = ly >= hy_start && ly < hy_end;

    // Case 1: the straight stroke already meets the outgoing edge.
    if (a_out == 0u || b_out == 0u) {
        let h_arm = in_str_y && select((lx < vx_end), (lx >= vx_start), has_right);
        let v_arm = in_str_x && select((ly < hy_end), (ly >= hy_start), has_down);
        return h_arm || v_arm;
    }

    // Case 2: 1-pixel outgoing edge stubs.
    if (lx == edge_x || ly == edge_y) {
        return (ly == edge_y && in_str_x) || (lx == edge_x && in_str_y);
    }

    // Case 3: strict interior. `dx` and `dy` are odd, so `dx - 1u` and `dy - 1u` never wrap.
    let dx = abs_diff(2u * lx + 1u, cx2);
    let dy = abs_diff(2u * ly + 1u, cy2);
    let in_band = ellipse_inside_or_on(dx, dy, a_out, b_out)
        && ellipse_on_or_outside(dx, dy, a_in, b_in);
    let straddle = ellipse_inside_or_on(dx - 1u, dy - 1u, a_mid, b_mid)
        && ellipse_on_or_outside(dx + 1u, dy + 1u, a_mid, b_mid);
    return in_band || straddle;
}

fn box_lit(entry: u32, lx: u32, ly: u32, w: u32, h: u32) -> bool {
    let left = entry & 3u;
    let right = (entry >> 2u) & 3u;
    let up = (entry >> 4u) & 3u;
    let down = (entry >> 6u) & 3u;
    let dash = (entry >> 8u) & 7u;
    let rounded = ((entry >> 11u) & 1u) != 0u;
    let diag_slash = ((entry >> 12u) & 1u) != 0u;
    let diag_backslash = ((entry >> 13u) & 1u) != 0u;

    if (diag_slash || diag_backslash) {
        return box_diagonal_lit(diag_slash, diag_backslash, lx, ly, w, h);
    }
    if (rounded) {
        return box_rounded_lit(right > 0u, down > 0u, lx, ly, w, h);
    }

    let light_px = box_light_px(w);
    let heavy_px = 2u * light_px;

    if (dash > 0u) {
        if (left > 0u && right > 0u) {
            let stroke = select(light_px, heavy_px, left == 2u);
            return in_span(ly, stroke_start(h, stroke), stroke) && ((lx * 2u * dash) / w) % 2u == 0u;
        }
        if (up > 0u && down > 0u) {
            let stroke = select(light_px, heavy_px, up == 2u);
            return in_span(lx, stroke_start(w, stroke), stroke) && ((ly * 2u * dash) / h) % 2u == 0u;
        }
    }

    let dbl_gap = max(1u, light_px);
    let vx_l0 = sat_sub(stroke_start(w, light_px), dbl_gap);
    let vx_r0 = min(sat_sub(w, light_px), stroke_start(w, light_px) + dbl_gap);
    let hy_t0 = sat_sub(stroke_start(h, light_px), dbl_gap);
    let hy_b0 = min(sat_sub(h, light_px), stroke_start(h, light_px) + dbl_gap);

    let v_double = up == 3u || down == 3u;
    let h_double = left == 3u || right == 3u;
    let v_max = select(light_px, heavy_px, up == 2u || down == 2u);
    let h_max = select(light_px, heavy_px, left == 2u || right == 2u);
    let cx0 = select(stroke_start(w, v_max), vx_l0, v_double);
    let cx1 = select(cx0 + v_max, vx_r0 + light_px, v_double);
    let cy0 = select(stroke_start(h, h_max), hy_t0, h_double);
    let cy1 = select(cy0 + h_max, hy_b0 + light_px, h_double);

    // Single and heavy arms.
    if ((left == 1u || left == 2u) && lx < cx1) {
        let stroke = select(light_px, heavy_px, left == 2u);
        if (in_span(ly, stroke_start(h, stroke), stroke)) {
            return true;
        }
    }
    if ((right == 1u || right == 2u) && lx >= cx0) {
        let stroke = select(light_px, heavy_px, right == 2u);
        if (in_span(ly, stroke_start(h, stroke), stroke)) {
            return true;
        }
    }
    if ((up == 1u || up == 2u) && ly < cy1) {
        let stroke = select(light_px, heavy_px, up == 2u);
        if (in_span(lx, stroke_start(w, stroke), stroke)) {
            return true;
        }
    }
    if ((down == 1u || down == 2u) && ly >= cy0) {
        let stroke = select(light_px, heavy_px, down == 2u);
        if (in_span(lx, stroke_start(w, stroke), stroke)) {
            return true;
        }
    }

    // Double arms: the outer rail meets the outer perpendicular rail, the inner rail stops at the
    // inner perpendicular rail.
    let on_top_rail = in_span(ly, hy_t0, light_px);
    let on_bottom_rail = in_span(ly, hy_b0, light_px);
    let on_left_rail = in_span(lx, vx_l0, light_px);
    let on_right_rail = in_span(lx, vx_r0, light_px);
    if (left == 3u) {
        let x_top_end = select(cx1, vx_l0 + light_px, up == 3u);
        let x_bottom_end = select(cx1, vx_l0 + light_px, down == 3u);
        if ((on_top_rail && lx < x_top_end) || (on_bottom_rail && lx < x_bottom_end)) {
            return true;
        }
    }
    if (right == 3u) {
        let x_top_start = select(cx0, vx_r0, up == 3u);
        let x_bottom_start = select(cx0, vx_r0, down == 3u);
        if ((on_top_rail && lx >= x_top_start) || (on_bottom_rail && lx >= x_bottom_start)) {
            return true;
        }
    }
    if (up == 3u) {
        let y_left_end = select(cy1, hy_t0 + light_px, left == 3u);
        let y_right_end = select(cy1, hy_t0 + light_px, right == 3u);
        if ((on_left_rail && ly < y_left_end) || (on_right_rail && ly < y_right_end)) {
            return true;
        }
    }
    if (down == 3u) {
        let y_left_start = select(cy0, hy_b0, left == 3u);
        let y_right_start = select(cy0, hy_b0, right == 3u);
        if ((on_left_rail && ly >= y_left_start) || (on_right_rail && ly >= y_right_start)) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------------------------
// Section 7.2: Block Elements (U+2580..U+259F). Returns coverage in quarters, 0..=4.
// ---------------------------------------------------------------------------------------------

fn block_quarter_coverage(entry: u32, lx: u32, ly: u32, w: u32, h: u32) -> u32 {
    let kind = (entry >> 16u) & 3u;
    let cx = 2u * lx + 1u;
    let cy = 2u * ly + 1u;
    if (kind == 0u) {
        let x0 = entry & 15u;
        let y0 = (entry >> 4u) & 15u;
        let x1 = (entry >> 8u) & 15u;
        let y1 = (entry >> 12u) & 15u;
        let lit = cx * 4u >= x0 * w && cx * 4u < x1 * w && cy * 4u >= y0 * h && cy * 4u < y1 * h;
        return select(COVERAGE_NONE, COVERAGE_FULL, lit);
    }
    if (kind == 1u) {
        return entry & 3u;
    }
    if (kind == 2u) {
        let mask = entry & 15u;
        let qx = select(0u, 1u, cx >= w);
        let qy = select(0u, 1u, cy >= h);
        let lit = ((mask >> (qx + 2u * qy)) & 1u) != 0u;
        return select(COVERAGE_NONE, COVERAGE_FULL, lit);
    }
    return COVERAGE_NONE;
}

// ---------------------------------------------------------------------------------------------
// Section 7.3: Braille Patterns (U+2800..U+28FF)
// ---------------------------------------------------------------------------------------------

fn braille_lit(mask: u32, lx: u32, ly: u32, w: u32, h: u32) -> bool {
    let sub_col = min(1u, (2u * lx + 1u) / w);
    let sub_row = min(3u, (4u * ly + 2u) / h);
    let bit_idx = select(sub_col * 3u + sub_row, 6u + sub_col, sub_row == 3u);
    let sub_x = (2u * lx + 1u) - sub_col * w;
    let sub_y = (4u * ly + 2u) - sub_row * h;
    let in_x = w < 4u || (4u * sub_x >= w && 4u * sub_x < 3u * w);
    let in_y = h < 8u || (5u * sub_y >= h && 5u * sub_y < 4u * h);
    return in_x && in_y && ((mask >> bit_idx) & 1u) != 0u;
}

// ---------------------------------------------------------------------------------------------
// Section 5: decorations
// ---------------------------------------------------------------------------------------------

fn decoration_lit(flags: u32, lx: u32, ly: u32, w: u32, h: u32) -> bool {
    let deco_px = max(1u, (h * 6u + 50u) / 100u);

    if ((flags & FLAG_STRIKETHROUGH) != 0u) {
        let strike_y0 = (h - deco_px) / 2u;
        if (in_span(ly, strike_y0, deco_px)) {
            return true;
        }
    }

    let underline = (flags >> 4u) & 3u;
    if (underline == UNDERLINE_CURLY) {
        var amp_px = 0u;
        if (h >= 3u) {
            amp_px = max(1u, (h * 3u + 50u) / 100u);
        }
        let base_y = min(h - deco_px, (h * 90u) / 100u);
        let t = ((2u * lx + 1u) * 4u) % (4u * w);
        let q = t / w;
        let r = t % w;
        let rise = select(w - r, r, q == 0u || q == 2u);
        let mag = div_round_even(rise * amp_px, w);
        let cy = select(sat_sub(base_y, mag), min(h - deco_px, base_y + mag), q < 2u);
        return in_span(ly, cy, deco_px);
    }

    let ul_y0 = min(h - deco_px, (h * 88u) / 100u);
    let on_underline = in_span(ly, ul_y0, deco_px);
    if (underline == UNDERLINE_SOLID) {
        return on_underline;
    }
    if (underline == UNDERLINE_DOTDASH) {
        if ((flags & FLAG_DASHED) != 0u) {
            return on_underline && ((lx * 10u) / w) % 5u < 3u;
        }
        return on_underline && ((lx * 8u) / w) % 2u == 0u;
    }
    return false;
}

// ---------------------------------------------------------------------------------------------
// GlyphAtlas
// ---------------------------------------------------------------------------------------------

// Integer texel of atlas slot `slot` at cell-local pixel (lx, ly). A slot outside the atlas
// texture, or a zero `atlasCols`, yields zero coverage instead of an out-of-range `textureLoad`.
fn atlas_texel(slot: u32, lx: u32, ly: u32, w: u32, h: u32) -> vec4<u32> {
    let atlas_cols = surface.atlasCols;
    if (atlas_cols == 0u) {
        return vec4<u32>(0u, 0u, 0u, 0u);
    }
    let sample_x = (slot % atlas_cols) * w + lx;
    let sample_y = (slot / atlas_cols) * h + ly;
    let atlas_px = textureDimensions(glyph_atlas);
    if (sample_x >= atlas_px.x || sample_y >= atlas_px.y) {
        return vec4<u32>(0u, 0u, 0u, 0u);
    }
    let texel = textureLoad(glyph_atlas, vec2<u32>(sample_x, sample_y), 0);
    return texel & vec4<u32>(0xffu, 0xffu, 0xffu, 0xffu);
}

// ---------------------------------------------------------------------------------------------
// Section 5: per-pixel law
// ---------------------------------------------------------------------------------------------

// Exact sRGB bytes of physical pixel (px, py), top-left origin.
fn shade_pixel(px: u32, py: u32) -> vec3<u32> {
    let default_fg = surface.defaultFg & vec3<u32>(0xffu, 0xffu, 0xffu);
    let default_bg = surface.defaultBg & vec3<u32>(0xffu, 0xffu, 0xffu);
    let w = surface.cellPx.x;
    let h = surface.cellPx.y;
    if (w == 0u || h == 0u) {
        return default_bg;
    }

    // Letterboxed remainder: pixels outside the grid never reach `textureLoad`.
    let col = px / w;
    let row = py / h;
    let grid = min(surface.gridCells, textureDimensions(cells));
    if (col >= grid.x || row >= grid.y) {
        return default_bg;
    }

    let cell = textureLoad(cells, vec2<u32>(col, row), 0);
    let lx = px - col * w;
    let ly = py - row * h;

    let payload = cell.x & 0xffffu;
    let kind = (cell.x >> 16u) & 0xfu;
    let flags = cell.y >> 24u;
    let alpha_byte = cell.z >> 24u;

    var fg = default_fg;
    if ((alpha_byte & ALPHA_FG_SET) != 0u) {
        fg = unpack_rgb(cell.y);
    }
    var bg = default_bg;
    if ((alpha_byte & ALPHA_BG_SET) != 0u) {
        bg = unpack_rgb(cell.z);
    }
    if ((flags & FLAG_INVERSE) != 0u) {
        let swapped = fg;
        fg = bg;
        bg = swapped;
    }
    if ((flags & FLAG_DIM) != 0u) {
        fg = lerp_rgb(bg, fg, 1u, 2u);
    }

    let op = alpha_byte & 0x3fu;
    let base_bg = lerp_rgb(default_bg, bg, op, 63u);
    var out = base_bg;

    if (kind == GLYPH_KIND_ATLAS_MONO) {
        let coverage = atlas_texel(payload, lx, ly, w, h).w;
        out = lerp_rgb(base_bg, fg, coverage * op, 16065u);
    } else if (kind == GLYPH_KIND_ATLAS_COLOR) {
        let texel = atlas_texel(payload, lx, ly, w, h);
        let keep = 16065u - texel.w * op;
        out = min(
            vec3<u32>(255u, 255u, 255u),
            vec3<u32>(
                div_round_even(texel.x * op * 255u + base_bg.x * keep, 16065u),
                div_round_even(texel.y * op * 255u + base_bg.y * keep, 16065u),
                div_round_even(texel.z * op * 255u + base_bg.z * keep, 16065u),
            ),
        );
    } else {
        var quarters = COVERAGE_NONE;
        if (kind == GLYPH_KIND_BRAILLE) {
            quarters = select(COVERAGE_NONE, COVERAGE_FULL, braille_lit(payload & 0xffu, lx, ly, w, h));
        } else if (kind == GLYPH_KIND_BLOCK) {
            quarters = block_quarter_coverage(BLOCK_GLYPHS[payload & 31u], lx, ly, w, h);
        } else if (kind == GLYPH_KIND_BOX) {
            quarters = select(COVERAGE_NONE, COVERAGE_FULL, box_lit(BOX_GLYPHS[payload & 127u], lx, ly, w, h));
        }
        // quarters * op / 252 equals op / 63 at full coverage.
        if (quarters != COVERAGE_NONE) {
            out = lerp_rgb(base_bg, fg, quarters * op, 252u);
        }
    }

    if (decoration_lit(flags, lx, ly, w, h)) {
        out = lerp_rgb(out, fg, op, 63u);
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

// Fullscreen triangle from the vertex index alone: (-1, -1), (3, -1), (-1, 3). No vertex buffers.
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    let x = f32((vertex_index << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vertex_index & 2u) * 2.0 - 1.0;
    return vec4<f32>(x, y, 0.0, 1.0);
}

fn frag_px(frag_x: f32) -> u32 {
    return u32(frag_x);
}

// Top-left pixel row. GLSL ES 3.00: py = (canvasPxH - 1u) - uint(gl_FragCoord.y).
fn frag_py(frag_y: f32) -> u32 {
    if (BIJOU_FRAG_ORIGIN_BOTTOM_LEFT) {
        return (surface.canvasPx.y - 1u) - u32(frag_y);
    }
    return u32(frag_y);
}

// Canonical integer output for an rgba8uint / RGBA8UI attachment: exact (r, g, b, 255).
@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<u32> {
    let rgb = shade_pixel(frag_px(position.x), frag_py(position.y));
    return vec4<u32>(rgb, 255u);
}
