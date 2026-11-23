#version 300 es

precision highp float;
precision highp int;

const uint BUNNY_U32_ELLIPSE_MAX_COORD = 46340u;
const uint BUNNY_U32_ELLIPSE_CLASS_INSIDE = 0u;
const uint BUNNY_U32_ELLIPSE_CLASS_ON_BOUNDARY = 1u;
const uint BUNNY_U32_ELLIPSE_CLASS_OUTSIDE = 2u;
const uint BUNNY_U32_ELLIPSE_STATUS_OK = 0u;
const uint BUNNY_U32_ELLIPSE_STATUS_OUT_OF_DOMAIN = 1u;


void main() {
    uint vertex_index = uint(gl_VertexID);
    float x = ((float(((vertex_index << 1u) & 2u)) * 2.0) - 1.0);
    float y = ((float((vertex_index & 2u)) * 2.0) - 1.0);
    gl_Position = vec4(x, y, 0.0, 1.0);
    return;
}

