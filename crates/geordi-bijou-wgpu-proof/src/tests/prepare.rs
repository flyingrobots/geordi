//! Preparation: the `rgba32uint` cell record.

use super::support::{
    BIJOU_FIXTURE, EMPTY_CELL, ERASE, PAINT, TestResult, cell, pack, parse_fixture, parse_value,
    receipt, suite_frame,
};
use crate::{ErrorCode, GlyphKind, GlyphPack, GlyphSlot, MAX_CELLS, PackedCells, prepare_cells};

/// A pack with the slot numbers the ABI record's canonical vectors use.
fn vector_pack() -> GlyphPack {
    let slot = |grapheme: &str, bold, slot, kind| GlyphSlot {
        grapheme: grapheme.to_owned(),
        bold,
        slot,
        kind,
    };
    GlyphPack {
        cell_px_w: 8,
        cell_px_h: 16,
        atlas_cols: 8,
        atlas_rows: 8,
        rgba: Vec::new(),
        slots: vec![
            slot("A", true, 7, GlyphKind::Mono),
            slot("\u{2665}", false, 42, GlyphKind::Color),
        ],
        font_identity: String::new(),
        atlas_rgba_sha256: String::new(),
    }
}

#[test]
fn canonical_abi_vectors_v0_to_v5_prepare_to_their_exact_words() -> TestResult {
    let cells: [[u8; 10]; 6] = [
        // V0: empty cell, default fg/bg, FLAG_EMPTY, opacity 63.
        [0x20, 0, 0, 0, 0, 0, 0, 0, 0x80, 0x3f],
        // V1: 'A' at mono slot 7, fg #FF8040, bg #102030, BOLD | UNDERLINE_SOLID, opacity 63.
        [0x41, 0, 0xff, 0x80, 0x40, 0x10, 0x20, 0x30, 0x11, 0xff],
        // V2: colour glyph at slot 42, default fg, bg #000000, no flags, opacity 63.
        [0x65, 0x26, 0, 0, 0, 0, 0, 0, 0x00, 0xbf],
        // V3: Braille U+28FF, fg #00FFAA, default bg, DIM | INVERSE, opacity 32.
        [0xff, 0x28, 0x00, 0xff, 0xaa, 0, 0, 0, 0x0a, 0x60],
        // V4: Block U+2580, fg #FFFFFF, bg #223344, UNDERLINE_CURLY, opacity 63.
        [0x80, 0x25, 0xff, 0xff, 0xff, 0x22, 0x33, 0x44, 0x20, 0xff],
        // V5: Box U+256D, fg #AA55CC, default bg, STRIKETHROUGH | DOTDASH | DASHED, opacity 63.
        [0x6d, 0x25, 0xaa, 0x55, 0xcc, 0, 0, 0, 0x74, 0x7f],
    ];
    let packed = PackedCells {
        width_cells: 6,
        height_cells: 1,
        bytes: cells.iter().flatten().copied().collect(),
        side_table: Vec::new(),
        input_receipt_sha256: String::new(),
    };
    let prepared = prepare_cells(&packed, &vector_pack())?;
    let expected: [[u32; 4]; 6] = [
        [0x0000_0000, 0x8000_0000, 0x3f00_0000, 0],
        [0x0001_0007, 0x1140_80ff, 0xff30_2010, 0],
        [0x0002_002a, 0x0000_0000, 0xbf00_0000, 0],
        [0x0003_00ff, 0x0aaa_ff00, 0x6000_0000, 0],
        [0x0004_0000, 0x20ff_ffff, 0xff44_3322, 0],
        [0x0005_006d, 0x74cc_55aa, 0x7f00_0000, 0],
    ];
    assert_eq!(prepared.words, expected.concat());
    // The complete little-endian serialization of V1, as the ABI record prints it.
    assert_eq!(
        prepared.bytes()[16..32],
        [
            0x07, 0x00, 0x01, 0x00, 0xff, 0x80, 0x40, 0x11, 0x10, 0x20, 0x30, 0xff, 0, 0, 0, 0
        ]
    );
    Ok(())
}

#[test]
fn conformance_frames_prepare_to_the_oracle_prepared_buffer_digest() -> TestResult {
    let pack = pack()?;
    for (id, path) in [("paint", PAINT), ("erase", ERASE)] {
        let prepared = prepare_cells(&parse_fixture(path)?, &pack)?;
        assert_eq!(prepared.words.len(), 8 * 7 * 4, "{id}");
        assert_eq!(prepared.bytes().len(), 8 * 7 * 16, "{id}");
        assert_eq!(
            suite_frame(id)?["preparedBufferSha256"],
            prepared.sha256().as_str(),
            "{id}"
        );
    }
    Ok(())
}

#[test]
fn preparation_is_deterministic_and_records_one_entry_per_atlas_slot_in_use() -> TestResult {
    let pack = pack()?;
    let cells = parse_fixture(BIJOU_FIXTURE)?;
    let first = prepare_cells(&cells, &pack)?;
    let second = prepare_cells(&parse_fixture(BIJOU_FIXTURE)?, &pack)?;
    assert_eq!(first, second);
    assert_eq!(first.bytes(), second.bytes());

    // Bold 'A', decomposed e + acute, private-use U+F000, and one empty cell.
    let uses: Vec<(&str, bool, u16, u32)> = first
        .atlas_uses
        .iter()
        .map(|entry| (entry.grapheme.as_str(), entry.bold, entry.slot, entry.cells))
        .collect();
    assert_eq!(
        uses,
        [
            ("A", true, 1, 1),
            ("e\u{301}", false, 2, 1),
            ("\u{f000}", false, 4, 1)
        ]
    );
    assert_eq!(
        first.words[12..16],
        [0, 0x8000_0000, 0, 0],
        "the empty cell"
    );

    let erase = prepare_cells(&parse_fixture(ERASE)?, &pack)?;
    assert_eq!(
        erase.atlas_uses.len(),
        1,
        "only the retained cell draws a glyph"
    );
    Ok(())
}

#[test]
fn a_grapheme_without_a_slot_in_the_requested_weight_is_refused() -> TestResult {
    // The pinned pack draws the heart in both weights but a pack may omit one.
    let mut pack = pack()?;
    pack.slots
        .retain(|slot| !(slot.grapheme == "A" && slot.bold));
    let cells = parse_value(&receipt(2, 1, &[cell(0x41, 0), cell(0x41, 0x01)], &[]))?;
    let error = prepare_cells(&cells, &pack)
        .err()
        .ok_or("drew a missing weight")?;
    assert_eq!(error.code, ErrorCode::MissingGlyphSlot);
    assert_eq!(error.path, "$.bytes[10]");
    Ok(())
}

#[test]
fn modifiers_at_the_supported_limit_are_carried_verbatim() -> TestResult {
    // Bold, dim, strikethrough, inverse, dotted/dashed underline and FLAG_DASHED together, on a
    // cell with explicit colours and full opacity.
    let all = [0x41, 0, 1, 2, 3, 4, 5, 6, 0x7f, 0xff];
    let prepared = prepare_cells(&parse_value(&receipt(1, 1, &[all], &[]))?, &pack()?)?;
    assert_eq!(prepared.words, [0x0001_0001, 0x7f03_0201, 0xff06_0504, 0]);
    Ok(())
}

#[test]
fn the_largest_canonical_grid_prepares_one_record_per_cell() -> TestResult {
    // 400 x 250 = 100,000 cells: the cap of packed-bijou-cells/1.
    let cells = vec![EMPTY_CELL; MAX_CELLS as usize];
    let prepared = prepare_cells(&parse_value(&receipt(400, 250, &cells, &[]))?, &pack()?)?;
    assert_eq!(prepared.words.len(), MAX_CELLS as usize * 4);
    assert!(prepared.atlas_uses.is_empty());
    assert!(
        prepared
            .words
            .chunks_exact(4)
            .all(|words| words == [0, 0x8000_0000, 0, 0])
    );
    Ok(())
}
