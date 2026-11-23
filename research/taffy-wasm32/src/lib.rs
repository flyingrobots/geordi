//! Cross-target determinism experiment for Taffy block and flex layout
//! (flyingrobots/geordi#136).
//!
//! [`dump`] builds 50 generated trees, lays each one out twice (with Taffy's
//! rounding and without it), and serialises every output value as raw bits. The
//! native binary and the `wasm32-unknown-unknown` module both return the bytes
//! of [`dump`]; `run.mjs` compares them bit for bit.
//!
//! The byte stream, all integers little-endian:
//!
//! ```text
//! stream  := "TFY1" tree_count:u32 tree*
//! tree    := index:u32 node_count:u32 status:u32 node*
//! node    := depth:u32 rounded:layout unrounded:layout
//! layout  := order:u32 f32_bits:u32 x 22   (see FIELD_NAMES)
//! ```
//!
//! Nodes are written in depth-first pre-order from the root. `status` is 0 when
//! Taffy returned `Ok`, otherwise 1 and the tree has no nodes.

use taffy::prelude::*;
use taffy::{
    AlignContent, AlignItems, AlignSelf, BoxSizing, Float, JustifyContent, Layout, LayoutOutput,
    Overflow, Point, Position, TaffyResult,
};

/// Number of generated trees.
pub const TREE_COUNT: u32 = 50;

/// The 22 `f32` fields of a Taffy `Layout`, in serialisation order.
pub const FIELD_NAMES: [&str; 22] = [
    "location.x",
    "location.y",
    "size.width",
    "size.height",
    "scrollable_overflow_rect.left",
    "scrollable_overflow_rect.right",
    "scrollable_overflow_rect.top",
    "scrollable_overflow_rect.bottom",
    "scrollbar_size.width",
    "scrollbar_size.height",
    "border.left",
    "border.right",
    "border.top",
    "border.bottom",
    "padding.left",
    "padding.right",
    "padding.top",
    "padding.bottom",
    "margin.left",
    "margin.right",
    "margin.top",
    "margin.bottom",
];

/// splitmix64: integer-only, so the generated inputs cannot depend on the target.
#[derive(Debug, Clone)]
struct Rng(u64);

impl Rng {
    const fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n as u64)).unwrap_or(0)
    }

    fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[self.below(items.len())]
    }

    const fn chance(&mut self, per_mille: u64) -> bool {
        self.next() % 1000 < per_mille
    }
}

/// Lengths in pixels, written as bit patterns so that the inputs are exact and
/// identical on every target. They exercise fractional pixels, values on and
/// next to rounding ties, `1/3`, signed zero, a subnormal, and magnitudes where
/// the spacing between `f32` values exceeds one pixel.
const PX: [u32; 24] = [
    0x0000_0000, // 0.0
    0x8000_0000, // -0.0
    0x3DCC_CCCD, // 0.1
    0x3EAA_AAAB, // 1/3
    0x3F00_0000, // 0.5
    0x3F33_3333, // 0.7
    0x3FC0_0000, // 1.5
    0x4020_0000, // 2.5
    0x4049_0FDB, // pi
    0x40E0_0000, // 7.0
    0x4115_5555, // 9.333333
    0x4180_0000, // 16.0
    0x41C8_0000, // 25.0
    0x42C7_FAE1, // 99.99
    0x42F6_E979, // 123.456
    0x4316_8000, // 150.5
    0x4348_0000, // 200.0
    0x43FA_0000, // 500.0
    0x447A_0000, // 1000.0
    0x3F7F_FFFF, // 0.99999994 (largest f32 below 1)
    0x0000_0001, // smallest positive subnormal
    0x0080_0000, // smallest positive normal
    0x4B7F_FFFF, // 16777215.0
    0x4B18_9681, // 10000001.0
];

/// Percentages as fractions (Taffy's `percent(0.5)` is 50%).
const PERCENT: [u32; 10] = [
    0x3EAA_AAAB, // 1/3
    0x3F2A_AAAB, // 2/3
    0x3E00_0000, // 0.125
    0x3DCC_CCCD, // 0.1
    0x3F00_0000, // 0.5
    0x3F80_0000, // 1.0
    0x3A83_126F, // 0.001
    0x3F7F_FFFF, // just under 1
    0x3E4C_CCCD, // 0.2
    0x3F19_999A, // 0.6
];

/// Flex grow and shrink factors.
const FACTOR: [u32; 9] = [
    0x0000_0000, // 0
    0x3DCC_CCCD, // 0.1
    0x3EAA_AAAB, // 1/3
    0x3F80_0000, // 1
    0x4000_0000, // 2
    0x402C_CCCD, // 2.7
    0x3A83_126F, // 0.001
    0x4120_0000, // 10
    0x0000_0001, // subnormal
];

/// Aspect ratios.
const RATIO: [u32; 4] = [
    0x3FE3_8E39, // 16/9
    0x3EAA_AAAB, // 1/3
    0x3FCF_1AA0, // 1.618
    0x3F80_0000, // 1
];

/// Character advances for the simulated text leaves.
const CHAR_WIDTH: [u32; 4] = [
    0x40E9_999A, // 7.3
    0x4105_1EB8, // 8.32
    0x3F80_0000, // 1.0
    0x4125_5555, // 10.333333
];

fn px(rng: &mut Rng) -> f32 {
    f32::from_bits(rng.pick(&PX))
}

fn small_px(rng: &mut Rng) -> f32 {
    // The first 13 entries stay below 30 px, so boxes do not overflow wildly.
    f32::from_bits(PX[rng.below(13)])
}

fn percent_value(rng: &mut Rng) -> f32 {
    f32::from_bits(rng.pick(&PERCENT))
}

fn length_percentage(rng: &mut Rng) -> LengthPercentage {
    if rng.chance(300) {
        LengthPercentage::percent(percent_value(rng) * 0.25)
    } else {
        LengthPercentage::length(small_px(rng))
    }
}

fn length_percentage_auto(rng: &mut Rng) -> LengthPercentageAuto {
    match rng.below(10) {
        0 => LengthPercentageAuto::auto(),
        1 | 2 => LengthPercentageAuto::percent(percent_value(rng) * 0.25),
        _ => LengthPercentageAuto::length(small_px(rng)),
    }
}

fn dimension(rng: &mut Rng) -> Dimension {
    match rng.below(10) {
        0..=3 => Dimension::auto(),
        4..=6 => Dimension::percent(percent_value(rng)),
        _ => Dimension::length(px(rng)),
    }
}

fn rect<T>(mut make: impl FnMut() -> T) -> Rect<T> {
    Rect {
        left: make(),
        right: make(),
        top: make(),
        bottom: make(),
    }
}

/// What a leaf measures as: a run of text that wraps at whole characters.
#[derive(Debug, Clone, Copy)]
struct TextLeaf {
    chars: u32,
    char_width: f32,
    line_height: f32,
}

fn measure_text(
    leaf: TextLeaf,
    known: Size<Option<f32>>,
    available: Size<AvailableSpace>,
) -> Size<f32> {
    #[expect(clippy::cast_precision_loss, reason = "chars is below 2^24")]
    let chars = leaf.chars as f32;
    let max_width = chars * leaf.char_width;
    let width = known.width.unwrap_or_else(|| match available.width {
        AvailableSpace::MinContent => leaf.char_width.min(max_width),
        AvailableSpace::MaxContent => max_width,
        AvailableSpace::Definite(space) => space.min(max_width).max(leaf.char_width.min(max_width)),
    });
    let per_line = (width / leaf.char_width).floor().max(1.0);
    let lines = (chars / per_line).ceil();
    let height = known.height.unwrap_or(lines * leaf.line_height);
    Size { width, height }
}

fn style_for(rng: &mut Rng, is_root: bool, has_children: bool) -> Style {
    let mut style = Style {
        display: if rng.chance(500) {
            Display::Flex
        } else {
            Display::Block
        },
        box_sizing: if rng.chance(500) {
            BoxSizing::BorderBox
        } else {
            BoxSizing::ContentBox
        },
        ..Style::default()
    };
    if style.display == Display::Flex {
        style.flex_direction = rng.pick(&[
            FlexDirection::Row,
            FlexDirection::Column,
            FlexDirection::RowReverse,
            FlexDirection::ColumnReverse,
        ]);
        style.flex_wrap = rng.pick(&[FlexWrap::NoWrap, FlexWrap::Wrap, FlexWrap::WrapReverse]);
        style.justify_content = rng.pick(&[
            JustifyContent::START,
            JustifyContent::END,
            JustifyContent::CENTER,
            JustifyContent::SPACE_BETWEEN,
            JustifyContent::SPACE_AROUND,
            JustifyContent::SPACE_EVENLY,
        ]);
        style.align_items = rng.pick(&[
            AlignItems::START,
            AlignItems::END,
            AlignItems::CENTER,
            AlignItems::BASELINE,
            AlignItems::STRETCH,
        ]);
        style.align_content = rng.pick(&[
            AlignContent::START,
            AlignContent::CENTER,
            AlignContent::SPACE_BETWEEN,
            AlignContent::SPACE_EVENLY,
            AlignContent::STRETCH,
        ]);
        style.gap = Size {
            width: length_percentage(rng),
            height: length_percentage(rng),
        };
    }
    if !is_root {
        style.flex_grow = f32::from_bits(rng.pick(&FACTOR));
        style.flex_shrink = f32::from_bits(rng.pick(&FACTOR));
        style.flex_basis = dimension(rng);
        style.align_self = if rng.chance(300) {
            Some(rng.pick(&[
                AlignSelf::START,
                AlignSelf::END,
                AlignSelf::CENTER,
                AlignSelf::STRETCH,
            ]))
        } else {
            None
        };
        if rng.chance(80) {
            style.position = Position::Absolute;
            style.inset = rect(|| length_percentage_auto(rng));
        }
        if rng.chance(120) {
            style.float = rng.pick(&[Float::Left, Float::Right]);
        }
    }
    style.size = Size {
        width: dimension(rng),
        height: dimension(rng),
    };
    if rng.chance(200) {
        style.min_size = Size {
            width: length_percentage_auto(rng),
            height: length_percentage_auto(rng),
        };
    }
    if rng.chance(200) {
        style.max_size = Size {
            width: length_percentage_auto(rng),
            height: length_percentage_auto(rng),
        };
    }
    if rng.chance(100) {
        style.aspect_ratio = Some(f32::from_bits(rng.pick(&RATIO)));
    }
    style.margin = rect(|| length_percentage_auto(rng));
    style.padding = rect(|| length_percentage(rng));
    style.border = rect(|| LengthPercentage::length(f32::from_bits(PX[rng.below(8)])));
    if has_children && rng.chance(150) {
        style.overflow = Point {
            x: Overflow::Scroll,
            y: Overflow::Scroll,
        };
        style.scrollbar_width = f32::from_bits(rng.pick(&[0x4170_0000, 0x3F33_3333, 0x0000_0000]));
    }
    style
}

struct Builder<'a> {
    tree: &'a mut TaffyTree<TextLeaf>,
    rng: Rng,
    budget: usize,
}

impl Builder<'_> {
    fn node(&mut self, depth: u32, is_root: bool) -> TaffyResult<NodeId> {
        self.budget = self.budget.saturating_sub(1);
        let max_children = if depth >= 7 || self.budget == 0 { 0 } else { 7 };
        let children_count = if is_root {
            3 + self.rng.below(5)
        } else {
            self.rng.below(max_children + 1)
        };
        let children_count = children_count.min(self.budget);
        let style = style_for(&mut self.rng, is_root, children_count > 0);
        if children_count == 0 {
            let leaf = TextLeaf {
                chars: u32::try_from(self.rng.below(120)).unwrap_or(0),
                char_width: f32::from_bits(self.rng.pick(&CHAR_WIDTH)),
                line_height: f32::from_bits(self.rng.pick(&[
                    0x4190_0000,
                    0x4199_999A,
                    0x41A6_6666,
                ])),
            };
            return self.tree.new_leaf_with_context(style, leaf);
        }
        let mut children = Vec::with_capacity(children_count);
        for _ in 0..children_count {
            children.push(self.node(depth + 1, false)?);
        }
        self.tree.new_with_children(style, &children)
    }
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_layout(out: &mut Vec<u8>, layout: &Layout) {
    push_u32(out, layout.order);
    let values = [
        layout.location.x,
        layout.location.y,
        layout.size.width,
        layout.size.height,
        layout.scrollable_overflow_rect.left,
        layout.scrollable_overflow_rect.right,
        layout.scrollable_overflow_rect.top,
        layout.scrollable_overflow_rect.bottom,
        layout.scrollbar_size.width,
        layout.scrollbar_size.height,
        layout.border.left,
        layout.border.right,
        layout.border.top,
        layout.border.bottom,
        layout.padding.left,
        layout.padding.right,
        layout.padding.top,
        layout.padding.bottom,
        layout.margin.left,
        layout.margin.right,
        layout.margin.top,
        layout.margin.bottom,
    ];
    for value in values {
        push_u32(out, value.to_bits());
    }
}

fn walk(
    tree: &TaffyTree<TextLeaf>,
    node: NodeId,
    depth: u32,
    out: &mut Vec<NodeId>,
    depths: &mut Vec<u32>,
) {
    out.push(node);
    depths.push(depth);
    for child in tree.children(node).unwrap_or_default() {
        walk(tree, child, depth + 1, out, depths);
    }
}

/// Available space for the root of tree `index`: definite widths with fractional
/// pixels, and the two intrinsic constraints.
const fn root_space(index: u32) -> Size<AvailableSpace> {
    match index % 5 {
        0 => Size {
            width: AvailableSpace::Definite(800.0),
            height: AvailableSpace::Definite(600.0),
        },
        1 => Size {
            width: AvailableSpace::Definite(f32::from_bits(0x4447_2AAB)), // 796.6667
            height: AvailableSpace::MaxContent,
        },
        2 => Size::MAX_CONTENT,
        3 => Size::MIN_CONTENT,
        _ => Size {
            width: AvailableSpace::Definite(f32::from_bits(0x43A0_8000)), // 321.0
            height: AvailableSpace::Definite(f32::from_bits(0x3F33_3333)), // 0.7
        },
    }
}

fn layout_tree(index: u32, rounding: bool) -> TaffyResult<(Vec<u32>, Vec<Layout>)> {
    let mut tree: TaffyTree<TextLeaf> = TaffyTree::new();
    if !rounding {
        tree.disable_rounding();
    }
    let budget = 5 + (index as usize) * 12;
    let mut builder = Builder {
        tree: &mut tree,
        rng: Rng(0x7AFF_7136 ^ u64::from(index)),
        budget,
    };
    let root = builder.node(0, true)?;
    tree.compute_layout_with_measure(root, root_space(index), |inputs, _, context, style| {
        context.map_or_else(
            || LayoutOutput::HIDDEN,
            |leaf| {
                let leaf = *leaf;
                taffy::compute_leaf_layout(
                    inputs,
                    style,
                    |_, _| 0.0,
                    |known, available| measure_text(leaf, known, available),
                )
            },
        )
    })?;
    let mut nodes = Vec::new();
    let mut depths = Vec::new();
    walk(&tree, root, 0, &mut nodes, &mut depths);
    let mut layouts = Vec::with_capacity(nodes.len());
    for node in nodes {
        layouts.push(*tree.layout(node)?);
    }
    Ok((depths, layouts))
}

fn dump_tree(index: u32, out: &mut Vec<u8>) {
    push_u32(out, index);
    match (layout_tree(index, true), layout_tree(index, false)) {
        (Ok((depths, rounded)), Ok((_, unrounded))) if rounded.len() == unrounded.len() => {
            push_u32(out, u32::try_from(rounded.len()).unwrap_or(u32::MAX));
            push_u32(out, 0);
            for ((depth, r), u) in depths.iter().zip(&rounded).zip(&unrounded) {
                push_u32(out, *depth);
                push_layout(out, r);
                push_layout(out, u);
            }
        }
        _ => {
            push_u32(out, 0);
            push_u32(out, 1);
        }
    }
}

/// The complete byte stream for all [`TREE_COUNT`] trees.
#[must_use]
pub fn dump() -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"TFY1");
    push_u32(&mut out, TREE_COUNT);
    for index in 0..TREE_COUNT {
        dump_tree(index, &mut out);
    }
    out
}

#[cfg(target_arch = "wasm32")]
#[expect(
    unsafe_code,
    reason = "the two exports need stable symbol names for the JavaScript host"
)]
mod wasm {
    use std::sync::OnceLock;

    static DUMP: OnceLock<Vec<u8>> = OnceLock::new();

    /// Runs the experiment (once) and returns the address of the byte stream.
    #[unsafe(no_mangle)]
    pub extern "C" fn dump_ptr() -> *const u8 {
        DUMP.get_or_init(super::dump).as_ptr()
    }

    /// Runs the experiment (once) and returns the length of the byte stream.
    #[unsafe(no_mangle)]
    pub extern "C" fn dump_len() -> usize {
        DUMP.get_or_init(super::dump).len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_has_every_tree_and_no_failures() {
        let bytes = dump();
        assert_eq!(&bytes[..4], b"TFY1");
        let mut offset = 8;
        let mut nodes = 0;
        for index in 0..TREE_COUNT {
            let read = |at: usize| {
                u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
            };
            assert_eq!(read(offset), index);
            let count = read(offset + 4) as usize;
            assert_eq!(read(offset + 8), 0, "tree {index} failed to lay out");
            nodes += count;
            offset += 12 + count * 4 * (1 + 2 * 23);
        }
        assert_eq!(offset, bytes.len());
        assert!(nodes > 5000, "only {nodes} nodes");
    }
}
