#version 300 es

precision highp float;
precision highp int;

const uint BUNNY_U32_ELLIPSE_MAX_COORD = 46340u;
const uint BUNNY_U32_ELLIPSE_CLASS_INSIDE = 0u;
const uint BUNNY_U32_ELLIPSE_CLASS_ON_BOUNDARY = 1u;
const uint BUNNY_U32_ELLIPSE_CLASS_OUTSIDE = 2u;
const uint BUNNY_U32_ELLIPSE_STATUS_OK = 0u;
const uint BUNNY_U32_ELLIPSE_STATUS_OUT_OF_DOMAIN = 1u;

uniform highp usampler2D _group_0_binding_0_fs;

layout(location = 0) out uvec4 _fs2p_location0;

uvec2 bunny_u32_mul_wide(uint lhs, uint rhs) {
    uint lhs_lo = (lhs & 65535u);
    uint lhs_hi = (lhs >> 16u);
    uint rhs_lo = (rhs & 65535u);
    uint rhs_hi = (rhs >> 16u);
    uint p00_ = (lhs_lo * rhs_lo);
    uint p01_ = (lhs_lo * rhs_hi);
    uint p10_ = (lhs_hi * rhs_lo);
    uint p11_ = (lhs_hi * rhs_hi);
    uint mid = (((p00_ >> 16u) + (p01_ & 65535u)) + (p10_ & 65535u));
    uint lo = ((p00_ & 65535u) | ((mid & 65535u) << 16u));
    uint hi = (((p11_ + (p01_ >> 16u)) + (p10_ >> 16u)) + (mid >> 16u));
    return uvec2(lo, hi);
}

uvec2 bunny_u64_add(uvec2 lhs_1, uvec2 rhs_1) {
    uint lo_1 = (lhs_1.x + rhs_1.x);
    uint carry = ((lo_1 < lhs_1.x) ? 1u : 0u);
    uint hi_1 = ((lhs_1.y + rhs_1.y) + carry);
    return uvec2(lo_1, hi_1);
}

uvec2 bunny_u32_ellipse_classify(uint dx, uint dy, uint semi_x, uint semi_y) {
    bool local = false;
    bool local_1 = false;
    bool local_2 = false;
    bool local_3 = false;
    bool local_4 = false;
    bool local_5 = false;
    bool local_6 = false;
    bool local_7 = false;
    if (!((dx > BUNNY_U32_ELLIPSE_MAX_COORD))) {
        local = (dy > BUNNY_U32_ELLIPSE_MAX_COORD);
    } else {
        local = true;
    }
    bool _e12 = local;
    if (!(_e12)) {
        local_1 = (semi_x > BUNNY_U32_ELLIPSE_MAX_COORD);
    } else {
        local_1 = true;
    }
    bool _e19 = local_1;
    if (!(_e19)) {
        local_2 = (semi_y > BUNNY_U32_ELLIPSE_MAX_COORD);
    } else {
        local_2 = true;
    }
    bool _e26 = local_2;
    if (_e26) {
        return uvec2(0u, 1u);
    }
    if (!((semi_x == 0u))) {
        local_3 = (semi_y == 0u);
    } else {
        local_3 = true;
    }
    bool _e38 = local_3;
    if (_e38) {
        if ((dx == 0u)) {
            local_4 = (dy == 0u);
        } else {
            local_4 = false;
        }
        bool _e46 = local_4;
        if (_e46) {
            return uvec2(1u, 0u);
        }
        return uvec2(2u, 0u);
    }
    uint term_x = (dx * semi_y);
    uint term_y = (dy * semi_x);
    uint radius = (semi_x * semi_y);
    uvec2 _e56 = bunny_u32_mul_wide(term_x, term_x);
    uvec2 _e57 = bunny_u32_mul_wide(term_y, term_y);
    uvec2 _e58 = bunny_u64_add(_e56, _e57);
    uvec2 _e59 = bunny_u32_mul_wide(radius, radius);
    if (!((_e58.y < _e59.y))) {
        if ((_e58.y == _e59.y)) {
            local_6 = (_e58.x < _e59.x);
        } else {
            local_6 = false;
        }
        bool _e75 = local_6;
        local_5 = _e75;
    } else {
        local_5 = true;
    }
    bool _e77 = local_5;
    if (_e77) {
        return uvec2(0u, 0u);
    }
    if ((_e58.y == _e59.y)) {
        local_7 = (_e58.x == _e59.x);
    } else {
        local_7 = false;
    }
    bool _e90 = local_7;
    if (_e90) {
        return uvec2(1u, 0u);
    }
    return uvec2(2u, 0u);
}

uvec4 kernel_input(vec4 position_1) {
    uvec4 _e8 = texelFetch(_group_0_binding_0_fs, ivec2(uvec2(uint(position_1.x), uint(position_1.y))), 0);
    return _e8;
}

void main() {
    vec4 position = gl_FragCoord;
    uvec4 _e1 = kernel_input(position);
    uvec2 _e6 = bunny_u32_ellipse_classify(_e1.x, _e1.y, _e1.z, _e1.w);
    _fs2p_location0 = uvec4(_e6.x, _e6.y, _e1.x, _e1.y);
    return;
}

