#version 300 es

precision highp float;
precision highp int;

const uint BUNNY_U32_ELLIPSE_MAX_COORD = 46340u;
const uint BUNNY_U32_ELLIPSE_CLASS_INSIDE = 0u;
const uint BUNNY_U32_ELLIPSE_CLASS_ON_BOUNDARY = 1u;
const uint BUNNY_U32_ELLIPSE_CLASS_OUTSIDE = 2u;
const uint BUNNY_U32_ELLIPSE_STATUS_OK = 0u;
const uint BUNNY_U32_ELLIPSE_STATUS_OUT_OF_DOMAIN = 1u;
const uint BOX_GLYPHS[128] = uint[128](5u, 10u, 80u, 160u, 773u, 778u, 848u, 928u, 1029u, 1034u, 1104u, 1184u, 68u, 72u, 132u, 136u, 65u, 66u, 129u, 130u, 20u, 24u, 36u, 40u, 17u, 18u, 33u, 34u, 84u, 88u, 100u, 148u, 164u, 104u, 152u, 168u, 81u, 82u, 97u, 145u, 161u, 98u, 146u, 162u, 69u, 70u, 73u, 74u, 133u, 134u, 137u, 138u, 21u, 22u, 25u, 26u, 37u, 38u, 41u, 42u, 85u, 86u, 89u, 90u, 101u, 149u, 165u, 102u, 105u, 150u, 153u, 106u, 154u, 166u, 169u, 170u, 517u, 522u, 592u, 672u, 15u, 240u, 76u, 196u, 204u, 67u, 193u, 195u, 28u, 52u, 60u, 19u, 49u, 51u, 92u, 244u, 252u, 83u, 241u, 243u, 79u, 197u, 207u, 31u, 53u, 63u, 95u, 245u, 255u, 2116u, 2113u, 2065u, 2068u, 4096u, 8192u, 12288u, 1u, 16u, 4u, 64u, 2u, 32u, 8u, 128u, 9u, 144u, 6u, 96u);
const uint BLOCK_GLYPHS[32] = uint[32](18432u, 34928u, 34912u, 34896u, 34880u, 34864u, 34848u, 34832u, 34816u, 34560u, 34304u, 34048u, 33792u, 33536u, 33280u, 33024u, 34820u, 65537u, 65538u, 65539u, 6144u, 34823u, 131076u, 131080u, 131073u, 131085u, 131081u, 131079u, 131083u, 131074u, 131078u, 131086u);
const uint GLYPH_KIND_ATLAS_MONO = 1u;
const uint GLYPH_KIND_ATLAS_COLOR = 2u;
const uint GLYPH_KIND_BRAILLE = 3u;
const uint GLYPH_KIND_BLOCK = 4u;
const uint GLYPH_KIND_BOX = 5u;
const uint FLAG_DIM = 2u;
const uint FLAG_STRIKETHROUGH = 4u;
const uint FLAG_INVERSE = 8u;
const uint FLAG_DASHED = 64u;
const uint ALPHA_FG_SET = 64u;
const uint ALPHA_BG_SET = 128u;
const uint UNDERLINE_SOLID = 1u;
const uint UNDERLINE_CURLY = 2u;
const uint UNDERLINE_DOTDASH = 3u;
const uint COVERAGE_NONE = 0u;
const uint COVERAGE_FULL = 4u;


void main() {
    uint vertex_index = uint(gl_VertexID);
    float x = ((float(((vertex_index << 1u) & 2u)) * 2.0) - 1.0);
    float y = ((float((vertex_index & 2u)) * 2.0) - 1.0);
    gl_Position = vec4(x, y, 0.0, 1.0);
    return;
}

