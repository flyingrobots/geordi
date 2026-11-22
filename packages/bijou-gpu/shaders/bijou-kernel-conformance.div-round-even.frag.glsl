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

uvec2 bunny_u32_div_round_even(uint n, uint d) {
    bool local = false;
    bool local_1 = false;
    if ((d == 0u)) {
        return uvec2(0u, 1u);
    }
    uint q = (n / d);
    uint r = (n % d);
    uint s = (d - r);
    if (!((r > s))) {
        if ((r == s)) {
            local_1 = ((q & 1u) != 0u);
        } else {
            local_1 = false;
        }
        bool _e22 = local_1;
        local = _e22;
    } else {
        local = true;
    }
    bool inc = local;
    return uvec2((q + (inc ? 1u : 0u)), 0u);
}

uvec4 kernel_input(vec4 position_1) {
    uvec4 _e8 = texelFetch(_group_0_binding_0_fs, ivec2(uvec2(uint(position_1.x), uint(position_1.y))), 0);
    return _e8;
}

void main() {
    vec4 position = gl_FragCoord;
    uvec4 _e1 = kernel_input(position);
    uvec2 _e4 = bunny_u32_div_round_even(_e1.x, _e1.y);
    _fs2p_location0 = uvec4(_e4.x, _e4.y, _e1.x, _e1.y);
    return;
}

