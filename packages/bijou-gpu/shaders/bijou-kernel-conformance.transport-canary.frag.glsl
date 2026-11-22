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

uvec4 kernel_input(vec4 position_1) {
    uvec4 _e8 = texelFetch(_group_0_binding_0_fs, ivec2(uvec2(uint(position_1.x), uint(position_1.y))), 0);
    return _e8;
}

void main() {
    vec4 position = gl_FragCoord;
    if ((uint(position.y) == 0u)) {
        uvec4 _e5 = kernel_input(position);
        _fs2p_location0 = _e5;
        return;
    }
    _fs2p_location0 = uvec4(4294967295u, 2147483648u, 2147483647u, 16909060u);
    return;
}

