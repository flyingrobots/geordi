//! The parts of Bijou's width-1 glyph policy the host evaluates itself.
//!
//! The host does not port Bijou's grapheme segmentation or its Unicode property tests. Its
//! policy is closed instead: beyond the checks here, a grapheme is accepted only when it is a
//! key of the pinned glyph pack or lowers to a procedural glyph.

/// First code a cell uses to index the side table.
pub(super) const SIDE_TABLE_THRESHOLD: u16 = 0xf000;

/// Bijou's East Asian Wide and emoji table (`core/text/grapheme.part01.ts` at
/// `flyingrobots/bijou@906666f9`), as the conformance kit mirrors it.
const WIDE_RANGES: [(u32, u32); 17] = [
    (0xff01, 0xff60),
    (0xffe0, 0xffe6),
    (0x2e80, 0x2fdf),
    (0x3000, 0x33ff),
    (0x3400, 0x4dbf),
    (0x4e00, 0x9fff),
    (0xac00, 0xd7a3),
    (0xf900, 0xfaff),
    (0xfe30, 0xfe4f),
    (0x20000, 0x3ffff),
    (0x1f300, 0x1f9ff),
    (0x1fa00, 0x1fa6f),
    (0x1fa70, 0x1faff),
    (0x1f600, 0x1f64f),
    (0x1f680, 0x1f6ff),
    (0x1f1e0, 0x1f1ff),
    (0x1f000, 0x1f02f),
];

/// Whether Bijou measures `text` as two columns: it holds a wide code point or the emoji
/// presentation selector `U+FE0F`.
pub(super) fn is_wide(text: &str) -> bool {
    text.chars().map(u32::from).any(|code_point| {
        code_point == 0xfe0f
            || WIDE_RANGES
                .iter()
                .any(|(first, last)| (*first..=*last).contains(&code_point))
    })
}

/// Whether `text` holds a C0, DEL or C1 terminal control character.
pub(super) fn has_terminal_control(text: &str) -> bool {
    text.chars()
        .map(u32::from)
        .any(|code_point| code_point <= 0x1f || (0x7f..=0x9f).contains(&code_point))
}

/// Whether `text` is one UTF-16 code unit below the side-table threshold, which Bijou encodes
/// directly in the cell and never in the side table.
pub(super) fn is_directly_encodable(text: &str) -> bool {
    let mut units = text.encode_utf16();
    matches!((units.next(), units.next()), (Some(unit), None) if unit < SIDE_TABLE_THRESHOLD)
}

/// The procedural glyph kind and payload of a direct cell code, if it has one.
pub(super) fn procedural_word0(code: u16) -> Option<u32> {
    let code = u32::from(code);
    match code {
        0x2800..=0x28ff => Some((3 << 16) | (code - 0x2800)),
        0x2580..=0x259f => Some((4 << 16) | (code - 0x2580)),
        0x2500..=0x257f => Some((5 << 16) | (code - 0x2500)),
        _ => None,
    }
}
