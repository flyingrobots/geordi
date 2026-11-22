#version 300 es

precision highp float;
precision highp int;

struct BijouSurfaceUniforms {
    uvec2 canvasPx;
    uvec2 cellPx;
    uvec2 gridCells;
    uint atlasCols;
    uvec3 defaultFg;
    uvec3 defaultBg;
    uint flags;
};
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
const bool BIJOU_FRAG_ORIGIN_BOTTOM_LEFT = true;

layout(std140) uniform BijouSurfaceUniforms_block_0Fragment { BijouSurfaceUniforms _group_0_binding_0_fs; };

uniform highp usampler2D _group_0_binding_1_fs;

uniform highp usampler2D _group_0_binding_2_fs;

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
    bool local_2 = false;
    bool local_3 = false;
    bool local_4 = false;
    bool local_5 = false;
    bool local_6 = false;
    bool local_7 = false;
    bool local_8 = false;
    bool local_9 = false;
    if (!((dx > BUNNY_U32_ELLIPSE_MAX_COORD))) {
        local_2 = (dy > BUNNY_U32_ELLIPSE_MAX_COORD);
    } else {
        local_2 = true;
    }
    bool _e12 = local_2;
    if (!(_e12)) {
        local_3 = (semi_x > BUNNY_U32_ELLIPSE_MAX_COORD);
    } else {
        local_3 = true;
    }
    bool _e19 = local_3;
    if (!(_e19)) {
        local_4 = (semi_y > BUNNY_U32_ELLIPSE_MAX_COORD);
    } else {
        local_4 = true;
    }
    bool _e26 = local_4;
    if (_e26) {
        return uvec2(0u, 1u);
    }
    if (!((semi_x == 0u))) {
        local_5 = (semi_y == 0u);
    } else {
        local_5 = true;
    }
    bool _e38 = local_5;
    if (_e38) {
        if ((dx == 0u)) {
            local_6 = (dy == 0u);
        } else {
            local_6 = false;
        }
        bool _e46 = local_6;
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
            local_8 = (_e58.x < _e59.x);
        } else {
            local_8 = false;
        }
        bool _e75 = local_8;
        local_7 = _e75;
    } else {
        local_7 = true;
    }
    bool _e77 = local_7;
    if (_e77) {
        return uvec2(0u, 0u);
    }
    if ((_e58.y == _e59.y)) {
        local_9 = (_e58.x == _e59.x);
    } else {
        local_9 = false;
    }
    bool _e90 = local_9;
    if (_e90) {
        return uvec2(1u, 0u);
    }
    return uvec2(2u, 0u);
}

uint sat_sub(uint a, uint b) {
    return (max(a, b) - b);
}

uint abs_diff(uint a_1, uint b_1) {
    return (max(a_1, b_1) - min(a_1, b_1));
}

uint div_round_even(uint n_1, uint d_1) {
    uvec2 _e2 = bunny_u32_div_round_even(n_1, d_1);
    return _e2.x;
}

uint lerp_u8_(uint a_2, uint b_2, uint num, uint den) {
    uint _e8 = div_round_even(((a_2 * (den - num)) + (b_2 * num)), den);
    return _e8;
}

uvec3 lerp_rgb(uvec3 a_3, uvec3 b_3, uint num_1, uint den_1) {
    uint _e6 = lerp_u8_(a_3.x, b_3.x, num_1, den_1);
    uint _e9 = lerp_u8_(a_3.y, b_3.y, num_1, den_1);
    uint _e12 = lerp_u8_(a_3.z, b_3.z, num_1, den_1);
    return uvec3(_e6, _e9, _e12);
}

uvec3 unpack_rgb(uint word) {
    return uvec3((word & 255u), ((word >> 8u) & 255u), ((word >> 16u) & 255u));
}

bool ellipse_inside_or_on(uint dx_1, uint dy_1, uint semi_x_1, uint semi_y_1) {
    bool local_10 = false;
    uvec2 _e4 = bunny_u32_ellipse_classify(dx_1, dy_1, semi_x_1, semi_y_1);
    if ((_e4.y == 0u)) {
        local_10 = (_e4.x <= 1u);
    } else {
        local_10 = false;
    }
    bool _e14 = local_10;
    return _e14;
}

bool ellipse_on_or_outside(uint dx_2, uint dy_2, uint semi_x_2, uint semi_y_2) {
    bool local_11 = false;
    uvec2 _e4 = bunny_u32_ellipse_classify(dx_2, dy_2, semi_x_2, semi_y_2);
    if ((_e4.y == 0u)) {
        local_11 = (_e4.x >= 1u);
    } else {
        local_11 = false;
    }
    bool _e14 = local_11;
    return _e14;
}

uint box_light_px(uint w) {
    return max(1u, (((w * 10u) + 50u) / 100u));
}

uint stroke_start(uint extent, uint stroke) {
    uint _e2 = sat_sub(extent, stroke);
    return (_e2 / 2u);
}

bool in_span(uint v, uint start, uint width) {
    bool local_12 = false;
    if ((v >= start)) {
        local_12 = (v < (start + width));
    } else {
        local_12 = false;
    }
    bool _e9 = local_12;
    return _e9;
}

bool box_diagonal_lit(bool slash, bool backslash, uint lx, uint ly, uint w_1, uint h) {
    bool local_13 = false;
    bool local_14 = false;
    uint _e6 = box_light_px(w_1);
    bool thin = (_e6 == 1u);
    uint scale = (thin ? 10u : 1u);
    uint half_s = (thin ? 11u : _e6);
    uint bound = (half_s * (w_1 + h));
    uint rhs_2 = ((half_s * half_s) * ((w_1 * w_1) + (h * h)));
    uint x_term = (((2u * lx) + 1u) * h);
    uint y_term = (((2u * ly) + 1u) * w_1);
    if (slash) {
        uint _e35 = abs_diff((x_term + y_term), ((2u * w_1) * h));
        uint d_2 = (scale * _e35);
        if ((d_2 <= bound)) {
            local_13 = ((d_2 * d_2) <= rhs_2);
        } else {
            local_13 = false;
        }
        bool _e43 = local_13;
        if (_e43) {
            return true;
        }
    }
    if (backslash) {
        uint _e45 = abs_diff(x_term, y_term);
        uint d_3 = (scale * _e45);
        if ((d_3 <= bound)) {
            local_14 = ((d_3 * d_3) <= rhs_2);
        } else {
            local_14 = false;
        }
        bool _e53 = local_14;
        if (_e53) {
            return true;
        }
    }
    return false;
}

bool box_rounded_lit(bool has_right, bool has_down, uint lx_1, uint ly_1, uint w_2, uint h_1) {
    bool local_15 = false;
    bool local_16 = false;
    bool local_17 = false;
    bool local_18 = false;
    bool local_19 = false;
    bool local_20 = false;
    bool local_21 = false;
    bool local_22 = false;
    bool local_23 = false;
    bool local_24 = false;
    bool local_25 = false;
    bool local_26 = false;
    bool local_27 = false;
    uint _e6 = box_light_px(w_2);
    uint _e7 = stroke_start(w_2, _e6);
    uint vx_end = min(w_2, (_e7 + _e6));
    uint _e10 = stroke_start(h_1, _e6);
    uint hy_end = min(h_1, (_e10 + _e6));
    uint edge_x = (has_right ? (w_2 - 1u) : 0u);
    uint edge_y = (has_down ? (h_1 - 1u) : 0u);
    uint _e24 = sat_sub(w_2, 1u);
    uint x_in = (has_right ? _e24 : min(1u, w_2));
    uint _e29 = sat_sub(h_1, 1u);
    uint y_in = (has_down ? _e29 : min(1u, h_1));
    uint cx2_ = (2u * x_in);
    uint cy2_ = (2u * y_in);
    uint _e36 = sat_sub(vx_end, x_in);
    uint _e39 = sat_sub(x_in, _e7);
    uint a_out = (has_right ? (2u * _e39) : (2u * _e36));
    uint _e43 = sat_sub(_e7, x_in);
    uint _e46 = sat_sub(x_in, vx_end);
    uint a_in = (has_right ? (2u * _e46) : (2u * _e43));
    uint _e50 = sat_sub(hy_end, y_in);
    uint _e53 = sat_sub(y_in, _e10);
    uint b_out = (has_down ? (2u * _e53) : (2u * _e50));
    uint _e57 = sat_sub(_e10, y_in);
    uint _e60 = sat_sub(y_in, hy_end);
    uint b_in = (has_down ? (2u * _e60) : (2u * _e57));
    uint a_mid = ((a_out + a_in) / 2u);
    uint b_mid = ((b_out + b_in) / 2u);
    if ((lx_1 >= _e7)) {
        local_15 = (lx_1 < vx_end);
    } else {
        local_15 = false;
    }
    bool in_str_x = local_15;
    if ((ly_1 >= _e10)) {
        local_16 = (ly_1 < hy_end);
    } else {
        local_16 = false;
    }
    bool in_str_y = local_16;
    if (!((a_out == 0u))) {
        local_17 = (b_out == 0u);
    } else {
        local_17 = true;
    }
    bool _e89 = local_17;
    if (_e89) {
        if (in_str_y) {
            local_18 = (has_right ? (lx_1 >= _e7) : (lx_1 < vx_end));
        } else {
            local_18 = false;
        }
        bool h_arm = local_18;
        if (in_str_x) {
            local_19 = (has_down ? (ly_1 >= _e10) : (ly_1 < hy_end));
        } else {
            local_19 = false;
        }
        bool v_arm = local_19;
        if (!(h_arm)) {
            local_20 = v_arm;
        } else {
            local_20 = true;
        }
        bool _e108 = local_20;
        return _e108;
    }
    if (!((lx_1 == edge_x))) {
        local_21 = (ly_1 == edge_y);
    } else {
        local_21 = true;
    }
    bool _e115 = local_21;
    if (_e115) {
        if ((ly_1 == edge_y)) {
            local_22 = in_str_x;
        } else {
            local_22 = false;
        }
        bool _e120 = local_22;
        if (!(_e120)) {
            if ((lx_1 == edge_x)) {
                local_24 = in_str_y;
            } else {
                local_24 = false;
            }
            bool _e128 = local_24;
            local_23 = _e128;
        } else {
            local_23 = true;
        }
        bool _e130 = local_23;
        return _e130;
    }
    uint _e135 = abs_diff(((2u * lx_1) + 1u), cx2_);
    uint _e140 = abs_diff(((2u * ly_1) + 1u), cy2_);
    bool _e141 = ellipse_inside_or_on(_e135, _e140, a_out, b_out);
    if (_e141) {
        bool _e144 = ellipse_on_or_outside(_e135, _e140, a_in, b_in);
        local_25 = _e144;
    } else {
        local_25 = false;
    }
    bool in_band = local_25;
    bool _e151 = ellipse_inside_or_on((_e135 - 1u), (_e140 - 1u), a_mid, b_mid);
    if (_e151) {
        bool _e158 = ellipse_on_or_outside((_e135 + 1u), (_e140 + 1u), a_mid, b_mid);
        local_26 = _e158;
    } else {
        local_26 = false;
    }
    bool straddle = local_26;
    if (!(in_band)) {
        local_27 = straddle;
    } else {
        local_27 = true;
    }
    bool _e165 = local_27;
    return _e165;
}

bool box_lit(uint entry, uint lx_2, uint ly_2, uint w_3, uint h_2) {
    bool local_28 = false;
    bool local_29 = false;
    bool local_30 = false;
    bool local_31 = false;
    bool local_32 = false;
    bool local_33 = false;
    bool local_34 = false;
    bool local_35 = false;
    bool local_36 = false;
    bool local_37 = false;
    bool local_38 = false;
    bool local_39 = false;
    bool local_40 = false;
    bool local_41 = false;
    bool local_42 = false;
    bool local_43 = false;
    bool local_44 = false;
    bool local_45 = false;
    bool local_46 = false;
    bool local_47 = false;
    bool local_48 = false;
    bool local_49 = false;
    bool local_50 = false;
    bool local_51 = false;
    bool local_52 = false;
    bool local_53 = false;
    bool local_54 = false;
    bool local_55 = false;
    bool local_56 = false;
    uint left = (entry & 3u);
    uint right = ((entry >> 2u) & 3u);
    uint up = ((entry >> 4u) & 3u);
    uint down = ((entry >> 6u) & 3u);
    uint dash = ((entry >> 8u) & 7u);
    bool rounded = (((entry >> 11u) & 1u) != 0u);
    bool diag_slash = (((entry >> 12u) & 1u) != 0u);
    bool diag_backslash = (((entry >> 13u) & 1u) != 0u);
    if (!(diag_slash)) {
        local_28 = diag_backslash;
    } else {
        local_28 = true;
    }
    bool _e45 = local_28;
    if (_e45) {
        bool _e46 = box_diagonal_lit(diag_slash, diag_backslash, lx_2, ly_2, w_3, h_2);
        return _e46;
    }
    if (rounded) {
        bool _e51 = box_rounded_lit((right > 0u), (down > 0u), lx_2, ly_2, w_3, h_2);
        return _e51;
    }
    uint _e52 = box_light_px(w_3);
    uint heavy_px = (2u * _e52);
    if ((dash > 0u)) {
        if ((left > 0u)) {
            local_29 = (right > 0u);
        } else {
            local_29 = false;
        }
        bool _e64 = local_29;
        if (_e64) {
            uint stroke_1 = ((left == 2u) ? heavy_px : _e52);
            uint _e68 = stroke_start(h_2, stroke_1);
            bool _e69 = in_span(ly_2, _e68, stroke_1);
            if (_e69) {
                local_30 = (((((lx_2 * 2u) * dash) / w_3) % 2u) == 0u);
            } else {
                local_30 = false;
            }
            bool _e81 = local_30;
            return _e81;
        }
        if ((up > 0u)) {
            local_31 = (down > 0u);
        } else {
            local_31 = false;
        }
        bool _e89 = local_31;
        if (_e89) {
            uint stroke_2 = ((up == 2u) ? heavy_px : _e52);
            uint _e93 = stroke_start(w_3, stroke_2);
            bool _e94 = in_span(lx_2, _e93, stroke_2);
            if (_e94) {
                local_32 = (((((ly_2 * 2u) * dash) / h_2) % 2u) == 0u);
            } else {
                local_32 = false;
            }
            bool _e106 = local_32;
            return _e106;
        }
    }
    uint dbl_gap = max(1u, _e52);
    uint _e109 = stroke_start(w_3, _e52);
    uint _e110 = sat_sub(_e109, dbl_gap);
    uint _e111 = sat_sub(w_3, _e52);
    uint _e112 = stroke_start(w_3, _e52);
    uint vx_r0_ = min(_e111, (_e112 + dbl_gap));
    uint _e115 = stroke_start(h_2, _e52);
    uint _e116 = sat_sub(_e115, dbl_gap);
    uint _e117 = sat_sub(h_2, _e52);
    uint _e118 = stroke_start(h_2, _e52);
    uint hy_b0_ = min(_e117, (_e118 + dbl_gap));
    if (!((up == 3u))) {
        local_33 = (down == 3u);
    } else {
        local_33 = true;
    }
    bool v_double = local_33;
    if (!((left == 3u))) {
        local_34 = (right == 3u);
    } else {
        local_34 = true;
    }
    bool h_double = local_34;
    if (!((up == 2u))) {
        local_35 = (down == 2u);
    } else {
        local_35 = true;
    }
    bool _e147 = local_35;
    uint v_max = (_e147 ? heavy_px : _e52);
    if (!((left == 2u))) {
        local_36 = (right == 2u);
    } else {
        local_36 = true;
    }
    bool _e157 = local_36;
    uint h_max = (_e157 ? heavy_px : _e52);
    uint _e159 = stroke_start(w_3, v_max);
    uint cx0_ = (v_double ? _e110 : _e159);
    uint cx1_ = (v_double ? (vx_r0_ + _e52) : (cx0_ + v_max));
    uint _e164 = stroke_start(h_2, h_max);
    uint cy0_ = (h_double ? _e116 : _e164);
    uint cy1_ = (h_double ? (hy_b0_ + _e52) : (cy0_ + h_max));
    if (!((left == 1u))) {
        local_37 = (left == 2u);
    } else {
        local_37 = true;
    }
    bool _e177 = local_37;
    if (_e177) {
        local_38 = (lx_2 < cx1_);
    } else {
        local_38 = false;
    }
    bool _e182 = local_38;
    if (_e182) {
        uint stroke_3 = ((left == 2u) ? heavy_px : _e52);
        uint _e186 = stroke_start(h_2, stroke_3);
        bool _e187 = in_span(ly_2, _e186, stroke_3);
        if (_e187) {
            return true;
        }
    }
    if (!((right == 1u))) {
        local_39 = (right == 2u);
    } else {
        local_39 = true;
    }
    bool _e197 = local_39;
    if (_e197) {
        local_40 = (lx_2 >= cx0_);
    } else {
        local_40 = false;
    }
    bool _e202 = local_40;
    if (_e202) {
        uint stroke_4 = ((right == 2u) ? heavy_px : _e52);
        uint _e206 = stroke_start(h_2, stroke_4);
        bool _e207 = in_span(ly_2, _e206, stroke_4);
        if (_e207) {
            return true;
        }
    }
    if (!((up == 1u))) {
        local_41 = (up == 2u);
    } else {
        local_41 = true;
    }
    bool _e217 = local_41;
    if (_e217) {
        local_42 = (ly_2 < cy1_);
    } else {
        local_42 = false;
    }
    bool _e222 = local_42;
    if (_e222) {
        uint stroke_5 = ((up == 2u) ? heavy_px : _e52);
        uint _e226 = stroke_start(w_3, stroke_5);
        bool _e227 = in_span(lx_2, _e226, stroke_5);
        if (_e227) {
            return true;
        }
    }
    if (!((down == 1u))) {
        local_43 = (down == 2u);
    } else {
        local_43 = true;
    }
    bool _e237 = local_43;
    if (_e237) {
        local_44 = (ly_2 >= cy0_);
    } else {
        local_44 = false;
    }
    bool _e242 = local_44;
    if (_e242) {
        uint stroke_6 = ((down == 2u) ? heavy_px : _e52);
        uint _e246 = stroke_start(w_3, stroke_6);
        bool _e247 = in_span(lx_2, _e246, stroke_6);
        if (_e247) {
            return true;
        }
    }
    bool _e249 = in_span(ly_2, _e116, _e52);
    bool _e250 = in_span(ly_2, hy_b0_, _e52);
    bool _e251 = in_span(lx_2, _e110, _e52);
    bool _e252 = in_span(lx_2, vx_r0_, _e52);
    if ((left == 3u)) {
        uint x_top_end = ((up == 3u) ? (_e110 + _e52) : cx1_);
        uint x_bottom_end = ((down == 3u) ? (_e110 + _e52) : cx1_);
        if (_e249) {
            local_45 = (lx_2 < x_top_end);
        } else {
            local_45 = false;
        }
        bool _e267 = local_45;
        if (!(_e267)) {
            if (_e250) {
                local_47 = (lx_2 < x_bottom_end);
            } else {
                local_47 = false;
            }
            bool _e275 = local_47;
            local_46 = _e275;
        } else {
            local_46 = true;
        }
        bool _e277 = local_46;
        if (_e277) {
            return true;
        }
    }
    if ((right == 3u)) {
        uint x_top_start = ((up == 3u) ? vx_r0_ : cx0_);
        uint x_bottom_start = ((down == 3u) ? vx_r0_ : cx0_);
        if (_e249) {
            local_48 = (lx_2 >= x_top_start);
        } else {
            local_48 = false;
        }
        bool _e291 = local_48;
        if (!(_e291)) {
            if (_e250) {
                local_50 = (lx_2 >= x_bottom_start);
            } else {
                local_50 = false;
            }
            bool _e299 = local_50;
            local_49 = _e299;
        } else {
            local_49 = true;
        }
        bool _e301 = local_49;
        if (_e301) {
            return true;
        }
    }
    if ((up == 3u)) {
        uint y_left_end = ((left == 3u) ? (_e116 + _e52) : cy1_);
        uint y_right_end = ((right == 3u) ? (_e116 + _e52) : cy1_);
        if (_e251) {
            local_51 = (ly_2 < y_left_end);
        } else {
            local_51 = false;
        }
        bool _e317 = local_51;
        if (!(_e317)) {
            if (_e252) {
                local_53 = (ly_2 < y_right_end);
            } else {
                local_53 = false;
            }
            bool _e325 = local_53;
            local_52 = _e325;
        } else {
            local_52 = true;
        }
        bool _e327 = local_52;
        if (_e327) {
            return true;
        }
    }
    if ((down == 3u)) {
        uint y_left_start = ((left == 3u) ? hy_b0_ : cy0_);
        uint y_right_start = ((right == 3u) ? hy_b0_ : cy0_);
        if (_e251) {
            local_54 = (ly_2 >= y_left_start);
        } else {
            local_54 = false;
        }
        bool _e341 = local_54;
        if (!(_e341)) {
            if (_e252) {
                local_56 = (ly_2 >= y_right_start);
            } else {
                local_56 = false;
            }
            bool _e349 = local_56;
            local_55 = _e349;
        } else {
            local_55 = true;
        }
        bool _e351 = local_55;
        if (_e351) {
            return true;
        }
    }
    return false;
}

uint block_quarter_coverage(uint entry_1, uint lx_3, uint ly_3, uint w_4, uint h_3) {
    bool local_57 = false;
    bool local_58 = false;
    bool local_59 = false;
    uint kind = ((entry_1 >> 16u) & 3u);
    uint cx = ((2u * lx_3) + 1u);
    uint cy = ((2u * ly_3) + 1u);
    if ((kind == 0u)) {
        uint x0_ = (entry_1 & 15u);
        uint y0_ = ((entry_1 >> 4u) & 15u);
        uint x1_ = ((entry_1 >> 8u) & 15u);
        uint y1_ = ((entry_1 >> 12u) & 15u);
        if (((cx * 4u) >= (x0_ * w_4))) {
            local_57 = ((cx * 4u) < (x1_ * w_4));
        } else {
            local_57 = false;
        }
        bool _e44 = local_57;
        if (_e44) {
            local_58 = ((cy * 4u) >= (y0_ * h_3));
        } else {
            local_58 = false;
        }
        bool _e52 = local_58;
        if (_e52) {
            local_59 = ((cy * 4u) < (y1_ * h_3));
        } else {
            local_59 = false;
        }
        bool lit = local_59;
        return (lit ? COVERAGE_FULL : COVERAGE_NONE);
    }
    if ((kind == 1u)) {
        return (entry_1 & 3u);
    }
    if ((kind == 2u)) {
        uint mask_1 = (entry_1 & 15u);
        uint qx = ((cx >= w_4) ? 1u : 0u);
        uint qy = ((cy >= h_3) ? 1u : 0u);
        bool lit_1 = (((mask_1 >> (qx + (2u * qy))) & 1u) != 0u);
        return (lit_1 ? COVERAGE_FULL : COVERAGE_NONE);
    }
    return COVERAGE_NONE;
}

bool braille_lit(uint mask, uint lx_4, uint ly_4, uint w_5, uint h_4) {
    bool local_60 = false;
    bool local_61 = false;
    bool local_62 = false;
    bool local_63 = false;
    bool local_64 = false;
    bool local_65 = false;
    uint sub_col = min(1u, (((2u * lx_4) + 1u) / w_5));
    uint sub_row = min(3u, (((4u * ly_4) + 2u) / h_4));
    uint bit_idx = ((sub_row == 3u) ? (6u + sub_col) : ((sub_col * 3u) + sub_row));
    uint sub_x = (((2u * lx_4) + 1u) - (sub_col * w_5));
    uint sub_y = (((4u * ly_4) + 2u) - (sub_row * h_4));
    if (!((w_5 < 4u))) {
        if (((4u * sub_x) >= w_5)) {
            local_61 = ((4u * sub_x) < (3u * w_5));
        } else {
            local_61 = false;
        }
        bool _e55 = local_61;
        local_60 = _e55;
    } else {
        local_60 = true;
    }
    bool in_x = local_60;
    if (!((h_4 < 8u))) {
        if (((5u * sub_y) >= h_4)) {
            local_63 = ((5u * sub_y) < (4u * h_4));
        } else {
            local_63 = false;
        }
        bool _e74 = local_63;
        local_62 = _e74;
    } else {
        local_62 = true;
    }
    bool in_y = local_62;
    if (in_x) {
        local_64 = in_y;
    } else {
        local_64 = false;
    }
    bool _e80 = local_64;
    if (_e80) {
        local_65 = (((mask >> bit_idx) & 1u) != 0u);
    } else {
        local_65 = false;
    }
    bool _e89 = local_65;
    return _e89;
}

bool decoration_lit(uint flags, uint lx_5, uint ly_5, uint w_6, uint h_5) {
    uint amp_px = 0u;
    bool local_66 = false;
    bool local_67 = false;
    bool local_68 = false;
    uint deco_px = max(1u, (((h_5 * 6u) + 50u) / 100u));
    if (((flags & FLAG_STRIKETHROUGH) != 0u)) {
        uint strike_y0_ = ((h_5 - deco_px) / 2u);
        bool _e20 = in_span(ly_5, strike_y0_, deco_px);
        if (_e20) {
            return true;
        }
    }
    uint underline = ((flags >> 4u) & 3u);
    if ((underline == UNDERLINE_CURLY)) {
        if ((h_5 >= 3u)) {
            amp_px = max(1u, (((h_5 * 3u) + 50u) / 100u));
        }
        uint base_y = min((h_5 - deco_px), ((h_5 * 90u) / 100u));
        uint t = ((((2u * lx_5) + 1u) * 4u) % (4u * w_6));
        uint q_1 = (t / w_6);
        uint r_1 = (t % w_6);
        if (!((q_1 == 0u))) {
            local_66 = (q_1 == 2u);
        } else {
            local_66 = true;
        }
        bool _e66 = local_66;
        uint rise = (_e66 ? r_1 : (w_6 - r_1));
        uint _e68 = amp_px;
        uint _e70 = div_round_even((rise * _e68), w_6);
        uint _e71 = sat_sub(base_y, _e70);
        uint cy_1 = ((q_1 < 2u) ? min((h_5 - deco_px), (base_y + _e70)) : _e71);
        bool _e78 = in_span(ly_5, cy_1, deco_px);
        return _e78;
    }
    uint ul_y0_ = min((h_5 - deco_px), ((h_5 * 88u) / 100u));
    bool _e85 = in_span(ly_5, ul_y0_, deco_px);
    if ((underline == UNDERLINE_SOLID)) {
        return _e85;
    }
    if ((underline == UNDERLINE_DOTDASH)) {
        if (((flags & FLAG_DASHED) != 0u)) {
            if (_e85) {
                local_67 = ((((lx_5 * 10u) / w_6) % 5u) < 3u);
            } else {
                local_67 = false;
            }
            bool _e104 = local_67;
            return _e104;
        }
        if (_e85) {
            local_68 = ((((lx_5 * 8u) / w_6) % 2u) == 0u);
        } else {
            local_68 = false;
        }
        bool _e115 = local_68;
        return _e115;
    }
    return false;
}

uvec4 atlas_texel(uint slot, uint lx_6, uint ly_6, uint w_7, uint h_6) {
    bool local_69 = false;
    uint atlas_cols = _group_0_binding_0_fs.atlasCols;
    if ((atlas_cols == 0u)) {
        return uvec4(0u, 0u, 0u, 0u);
    }
    uint sample_x = (((slot % atlas_cols) * w_7) + lx_6);
    uint sample_y = (((slot / atlas_cols) * h_6) + ly_6);
    uvec2 atlas_px = uvec2(textureSize(_group_0_binding_2_fs, 0).xy);
    if (!((sample_x >= atlas_px.x))) {
        local_69 = (sample_y >= atlas_px.y);
    } else {
        local_69 = true;
    }
    bool _e31 = local_69;
    if (_e31) {
        return uvec4(0u, 0u, 0u, 0u);
    }
    uvec4 texel = texelFetch(_group_0_binding_2_fs, ivec2(uvec2(sample_x, sample_y)), 0);
    return (texel & uvec4(255u, 255u, 255u, 255u));
}

uvec3 shade_pixel(uint px, uint py) {
    bool local_70 = false;
    bool local_71 = false;
    uvec3 fg = uvec3(0u);
    uvec3 bg = uvec3(0u);
    uvec3 out_ = uvec3(0u);
    uint quarters = COVERAGE_NONE;
    uvec3 _e4 = _group_0_binding_0_fs.defaultFg;
    uvec3 default_fg = (_e4 & uvec3(255u, 255u, 255u));
    uvec3 _e12 = _group_0_binding_0_fs.defaultBg;
    uvec3 default_bg = (_e12 & uvec3(255u, 255u, 255u));
    uint w_8 = _group_0_binding_0_fs.cellPx.x;
    uint h_7 = _group_0_binding_0_fs.cellPx.y;
    if (!((w_8 == 0u))) {
        local_70 = (h_7 == 0u);
    } else {
        local_70 = true;
    }
    bool _e34 = local_70;
    if (_e34) {
        return default_bg;
    }
    uint col = (px / w_8);
    uint row = (py / h_7);
    uvec2 _e39 = _group_0_binding_0_fs.gridCells;
    uvec2 grid = min(_e39, uvec2(textureSize(_group_0_binding_1_fs, 0).xy));
    if (!((col >= grid.x))) {
        local_71 = (row >= grid.y);
    } else {
        local_71 = true;
    }
    bool _e51 = local_71;
    if (_e51) {
        return default_bg;
    }
    uvec4 cell = texelFetch(_group_0_binding_1_fs, ivec2(uvec2(col, row)), 0);
    uint lx_7 = (px - (col * w_8));
    uint ly_7 = (py - (row * h_7));
    uint payload = (cell.x & 65535u);
    uint kind_1 = ((cell.x >> 16u) & 15u);
    uint flags_1 = (cell.y >> 24u);
    uint alpha_byte = (cell.z >> 24u);
    fg = default_fg;
    if (((alpha_byte & ALPHA_FG_SET) != 0u)) {
        uvec3 _e80 = unpack_rgb(cell.y);
        fg = _e80;
    }
    bg = default_bg;
    if (((alpha_byte & ALPHA_BG_SET) != 0u)) {
        uvec3 _e87 = unpack_rgb(cell.z);
        bg = _e87;
    }
    if (((flags_1 & FLAG_INVERSE) != 0u)) {
        uvec3 swapped = fg;
        uvec3 _e93 = bg;
        fg = _e93;
        bg = swapped;
    }
    if (((flags_1 & FLAG_DIM) != 0u)) {
        uvec3 _e98 = bg;
        uvec3 _e99 = fg;
        uvec3 _e102 = lerp_rgb(_e98, _e99, 1u, 2u);
        fg = _e102;
    }
    uint op = (alpha_byte & 63u);
    uvec3 _e105 = bg;
    uvec3 _e107 = lerp_rgb(default_bg, _e105, op, 63u);
    out_ = _e107;
    if ((kind_1 == GLYPH_KIND_ATLAS_MONO)) {
        uvec4 _e111 = atlas_texel(payload, lx_7, ly_7, w_8, h_7);
        uint coverage = _e111.w;
        uvec3 _e113 = fg;
        uvec3 _e116 = lerp_rgb(_e107, _e113, (coverage * op), 16065u);
        out_ = _e116;
    } else {
        if ((kind_1 == GLYPH_KIND_ATLAS_COLOR)) {
            uvec4 _e119 = atlas_texel(payload, lx_7, ly_7, w_8, h_7);
            uint keep = (16065u - (_e119.w * op));
            uint _e136 = div_round_even((((_e119.x * op) * 255u) + (_e107.x * keep)), 16065u);
            uint _e145 = div_round_even((((_e119.y * op) * 255u) + (_e107.y * keep)), 16065u);
            uint _e154 = div_round_even((((_e119.z * op) * 255u) + (_e107.z * keep)), 16065u);
            out_ = min(uvec3(255u, 255u, 255u), uvec3(_e136, _e145, _e154));
        } else {
            if ((kind_1 == GLYPH_KIND_BRAILLE)) {
                bool _e165 = braille_lit((payload & 255u), lx_7, ly_7, w_8, h_7);
                quarters = (_e165 ? COVERAGE_FULL : COVERAGE_NONE);
            } else {
                if ((kind_1 == GLYPH_KIND_BLOCK)) {
                    uint _e173 = block_quarter_coverage(BLOCK_GLYPHS[(payload & 31u)], lx_7, ly_7, w_8, h_7);
                    quarters = _e173;
                } else {
                    if ((kind_1 == GLYPH_KIND_BOX)) {
                        bool _e182 = box_lit(BOX_GLYPHS[(payload & 127u)], lx_7, ly_7, w_8, h_7);
                        quarters = (_e182 ? COVERAGE_FULL : COVERAGE_NONE);
                    }
                }
            }
            uint _e184 = quarters;
            if ((_e184 != COVERAGE_NONE)) {
                uvec3 _e187 = fg;
                uint _e188 = quarters;
                uvec3 _e191 = lerp_rgb(_e107, _e187, (_e188 * op), 252u);
                out_ = _e191;
            }
        }
    }
    bool _e192 = decoration_lit(flags_1, lx_7, ly_7, w_8, h_7);
    if (_e192) {
        uvec3 _e193 = out_;
        uvec3 _e194 = fg;
        uvec3 _e196 = lerp_rgb(_e193, _e194, op, 63u);
        out_ = _e196;
    }
    uvec3 _e197 = out_;
    return _e197;
}

uint frag_px(float frag_x) {
    return uint(frag_x);
}

uint frag_py(float frag_y) {
    if (BIJOU_FRAG_ORIGIN_BOTTOM_LEFT) {
        uint _e5 = _group_0_binding_0_fs.canvasPx.y;
        return ((_e5 - 1u) - uint(frag_y));
    }
    return uint(frag_y);
}

void main() {
    vec4 position = gl_FragCoord;
    uint _e2 = frag_px(position.x);
    uint _e4 = frag_py(position.y);
    uvec3 _e5 = shade_pixel(_e2, _e4);
    _fs2p_location0 = uvec4(_e5, 255u);
    return;
}

