//! Intake: the pinned glyph pack and the strict `packed-bijou-cells/1` validator.

use serde_json::{Value, json};

use super::support::{
    BIJOU_FIXTURE, BIJOU_PROVENANCE, EMPTY_CELL, ERASE, NEGATIVE_WIDE, PAINT, SUITE, TestResult,
    assert_refused, cell, pack, parse_fixture, parse_value, read_json, read_repo, receipt,
    suite_frame,
};
use crate::{
    ErrorCode, GLYPH_PACK_PATH, GLYPH_PACK_VERSION, GlyphKind, GlyphPack, MAX_CELLS, MAX_DIMENSION,
    PINNED_GLYPH_PACK_SHA256,
};

#[test]
fn pinned_glyph_pack_is_the_conformance_suite_pack_and_hashes_to_its_declared_atlas() -> TestResult
{
    let bytes = read_repo(GLYPH_PACK_PATH)?;
    let suite = read_json(SUITE)?;
    assert_eq!(suite["glyphPack"]["path"], "test-glyph-pack.json");
    assert_eq!(suite["glyphPack"]["sha256"], PINNED_GLYPH_PACK_SHA256);
    assert_eq!(
        geordi_bijou_shadergen::sha256_hex(&bytes),
        PINNED_GLYPH_PACK_SHA256
    );

    let pack = GlyphPack::parse(&bytes)?;
    let declared: Value = serde_json::from_slice(&bytes)?;
    assert_eq!((pack.cell_px_w, pack.cell_px_h), (8, 16));
    assert_eq!((pack.atlas_cols, pack.atlas_rows), (4, 2));
    assert_eq!(pack.rgba.len(), 4 * 8 * 2 * 16 * 4);
    assert_eq!(
        geordi_bijou_shadergen::sha256_hex(&pack.rgba),
        pack.atlas_rgba_sha256
    );
    assert_eq!(declared["atlasRgbaSha256"], pack.atlas_rgba_sha256.as_str());
    assert_eq!(
        pack.font_identity,
        format!("{GLYPH_PACK_VERSION} sha256:{}", pack.atlas_rgba_sha256)
    );
    assert_eq!(pack.slots.len(), 8);
    let bold_a = pack.lookup("A", true).ok_or("no bold A")?;
    assert_eq!((bold_a.slot, bold_a.kind), (1, GlyphKind::Mono));
    let heart = pack.lookup("\u{2665}", false).ok_or("no heart")?;
    assert_eq!(heart.kind, GlyphKind::Color);
    assert!(pack.lookup("B", false).is_none());
    Ok(())
}

#[test]
fn a_glyph_pack_that_is_not_the_pinned_file_is_refused() -> TestResult {
    let mut bytes = read_repo(GLYPH_PACK_PATH)?;
    bytes.push(b'\n');
    let error = GlyphPack::parse(&bytes)
        .err()
        .ok_or("accepted an unpinned pack")?;
    assert_eq!(error.code, ErrorCode::InvalidAtlas);
    assert!(error.detail.contains(PINNED_GLYPH_PACK_SHA256), "{error}");
    Ok(())
}

type Edit<'a> = &'a dyn Fn(&mut Value);

#[test]
fn malformed_glyph_packs_are_refused() -> TestResult {
    let good: Value = serde_json::from_slice(&read_repo(GLYPH_PACK_PATH)?)?;
    let mutate = |edit: &dyn Fn(&mut Value)| {
        let mut pack = good.clone();
        edit(&mut pack);
        GlyphPack::parse_unpinned(pack.to_string().as_bytes())
    };
    assert_eq!(
        GlyphPack::parse_unpinned(good.to_string().as_bytes())?
            .slots
            .len(),
        8
    );

    let cases: [(&str, Edit<'_>, ErrorCode); 9] = [
        (
            "version",
            &|pack| pack["packVersion"] = json!("geordi-bijou-gpu-test-glyph-pack/2"),
            ErrorCode::InvalidAtlas,
        ),
        (
            "cell width",
            &|pack| pack["cellPx"]["width"] = json!(257),
            ErrorCode::InvalidCellMetrics,
        ),
        (
            "cell height",
            &|pack| pack["cellPx"]["height"] = json!(0),
            ErrorCode::InvalidCellMetrics,
        ),
        (
            "row count",
            &|pack| {
                if let Some(rows) = pack["atlasRgbaHexRows"].as_array_mut() {
                    rows.pop();
                }
            },
            ErrorCode::InvalidAtlas,
        ),
        (
            "row hex",
            &|pack| pack["atlasRgbaHexRows"][0] = json!("zz"),
            ErrorCode::InvalidAtlas,
        ),
        (
            "atlas digest",
            &|pack| pack["atlasRgbaSha256"] = json!("0".repeat(64)),
            ErrorCode::InvalidAtlas,
        ),
        (
            "slot range",
            &|pack| pack["slots"][0]["slot"] = json!(8),
            ErrorCode::InvalidAtlas,
        ),
        (
            "duplicate key",
            &|pack| pack["slots"][1]["bold"] = json!(false),
            ErrorCode::InvalidAtlas,
        ),
        (
            "unknown field",
            &|pack| pack["extra"] = json!(1),
            ErrorCode::InvalidAtlas,
        ),
    ];
    for (label, edit, code) in cases {
        let error = mutate(edit)
            .err()
            .ok_or_else(|| format!("accepted a pack with a bad {label}"))?;
        assert_eq!(error.code, code, "{label}: {error}");
    }
    Ok(())
}

#[test]
fn conformance_frames_are_accepted_and_bound_to_their_exact_file_bytes() -> TestResult {
    for (id, path, side_table_len) in [("paint", PAINT, 2), ("erase", ERASE, 0)] {
        let cells = parse_fixture(path)?;
        assert_eq!((cells.width_cells, cells.height_cells), (8, 7), "{id}");
        assert_eq!(cells.bytes.len(), 560, "{id}");
        assert_eq!(cells.side_table.len(), side_table_len, "{id}");
        assert_eq!(
            suite_frame(id)?["inputReceiptSha256"],
            cells.input_receipt_sha256.as_str(),
            "{id}"
        );
        assert_eq!(
            geordi_bijou_shadergen::sha256_hex(&read_repo(path)?),
            cells.input_receipt_sha256
        );
    }
    Ok(())
}

#[test]
fn imported_bijou_fixture_is_byte_identical_to_its_recorded_provenance_and_is_accepted()
-> TestResult {
    let bytes = read_repo(BIJOU_FIXTURE)?;
    let provenance = read_json(BIJOU_PROVENANCE)?;
    assert_eq!(provenance["sourceRepository"], "flyingrobots/bijou");
    assert_eq!(
        provenance["sourcePath"],
        "tests/fixtures/RE-036/packed-bijou-cells.v1.json"
    );
    assert_eq!(provenance["path"], BIJOU_FIXTURE);
    assert_eq!(
        provenance["sourceCommit"].as_str().map(str::len),
        Some(40),
        "a full commit id"
    );
    assert_eq!(provenance["byteLength"], bytes.len());
    assert_eq!(
        provenance["sha256"],
        geordi_bijou_shadergen::sha256_hex(&bytes).as_str()
    );

    let cells = parse_fixture(BIJOU_FIXTURE)?;
    assert_eq!((cells.width_cells, cells.height_cells), (2, 2));
    assert_eq!(cells.side_table, ["e\u{301}", "\u{f000}"]);
    assert_eq!(provenance["sha256"], cells.input_receipt_sha256.as_str());
    Ok(())
}

#[test]
fn the_width_2_negative_fixture_is_refused_with_the_code_the_suite_declares() -> TestResult {
    let negative = &read_json(SUITE)?["negatives"][0];
    assert_eq!(negative["path"], "negative-width2.packed-bijou-cells.json");
    let error = parse_fixture(NEGATIVE_WIDE)
        .err()
        .ok_or("accepted a width-2 grapheme")?;
    let error = error
        .downcast_ref::<crate::ProofError>()
        .ok_or("untyped error")?;
    assert_eq!(negative["expectedErrorCode"], error.code.as_str());
    assert_eq!(error.path, "$.bytes[0]");
    Ok(())
}

#[test]
fn unknown_versions_formats_and_fields_are_refused() {
    let base = receipt(1, 1, &[EMPTY_CELL], &[]);
    let with = |pointer: &[&str], value: Value| {
        let mut document = base.clone();
        let mut target = &mut document;
        for key in pointer {
            target = &mut target[*key];
        }
        *target = value;
        document
    };
    assert!(parse_value(&base).is_ok());
    let invalid = ErrorCode::InvalidPackedCells;
    assert_refused(
        &with(&["receiptVersion"], json!("packed-bijou-cells/2")),
        invalid,
        "$.receiptVersion",
    );
    assert_refused(
        &with(&["cellFormatId"], json!("bijou-packed-cell-u8x12-le/1")),
        invalid,
        "$.cellFormatId",
    );
    assert_refused(
        &with(&["glyphPolicyId"], json!("unicode-grapheme-side-table/2")),
        invalid,
        "$.glyphPolicyId",
    );
    assert_refused(&with(&["extra"], json!(true)), invalid, "$.extra");
    assert_refused(
        &with(&["scene", "sceneVersion"], json!("ui-scene-ir/2")),
        invalid,
        "$.scene.sceneVersion",
    );
    assert_refused(
        &with(&["scene", "sceneHash"], json!("ABC")),
        invalid,
        "$.scene.sceneHash",
    );
    assert_refused(
        &with(&["scene", "cellNodeIds"], json!(["scene.other"])),
        invalid,
        "$.scene.cellNodeIds[0]",
    );
    assert_refused(
        &with(&["scene", "cellNodeIds"], json!([])),
        invalid,
        "$.scene.cellNodeIds",
    );
    assert_refused(
        &with(&["scene", "nodeIds"], json!([" scene.root"])),
        invalid,
        "$.scene.nodeIds[0]",
    );
    assert_refused(
        &with(&["focus", "focusedNodeId"], json!("scene.root")),
        invalid,
        "$.focus.focusedNodeId",
    );
    assert_refused(
        &with(&["focus", "focusableNodeIds"], json!(["scene.other"])),
        invalid,
        "$.focus.focusableNodeIds[0]",
    );
    assert_refused(&json!([]), invalid, "$");
    let mut missing = base.clone();
    if let Some(object) = missing.as_object_mut() {
        object.remove("chroma");
    }
    assert_refused(&missing, invalid, "$.chroma");
}

#[test]
fn unsupported_chroma_is_refused() {
    for (field, value) in [
        ("colorSpace", "display-p3"),
        ("channelEncoding", "uint16"),
        ("alphaEncoding", "uint8"),
        ("terminalDefaultEncoding", "sentinel-rgb"),
    ] {
        let mut document = receipt(1, 1, &[EMPTY_CELL], &[]);
        document["chroma"][field] = json!(value);
        assert_refused(
            &document,
            ErrorCode::InvalidPackedCells,
            &format!("$.chroma.{field}"),
        );
    }
    // A terminal-default colour must leave its channels zero.
    let mut fg = cell(0x41, 0);
    fg[3] = 1;
    assert_refused(
        &receipt(1, 1, &[fg], &[]),
        ErrorCode::InvalidPackedCells,
        "$.bytes[3]",
    );
    let mut bg = cell(0x41, 0);
    bg[7] = 9;
    assert_refused(
        &receipt(1, 1, &[bg], &[]),
        ErrorCode::InvalidPackedCells,
        "$.bytes[7]",
    );
}

#[test]
fn unsupported_modifier_combinations_are_refused_and_the_full_set_is_accepted() {
    // FLAG_DASHED without the dotted/dashed underline bits is not a canonical modifier set.
    for flags in [0x40, 0x50, 0x60] {
        assert_refused(
            &receipt(1, 1, &[cell(0x41, flags)], &[]),
            ErrorCode::InvalidPackedCells,
            "$.bytes[8]",
        );
    }
    // Every modifier bit the ABI defines, at once: bold, dim, strikethrough, inverse, dashed.
    assert!(parse_value(&receipt(1, 1, &[cell(0x41, 0x7f)], &[])).is_ok());
}

#[test]
fn malformed_side_table_relationships_are_refused() {
    let invalid = ErrorCode::InvalidPackedCells;
    let e_acute = "e\u{301}";
    // A cell indexes past the side table.
    assert_refused(
        &receipt(1, 1, &[cell(0xf000, 0)], &[]),
        invalid,
        "$.bytes[0]",
    );
    assert_refused(
        &receipt(1, 1, &[cell(0xf001, 0)], &[e_acute]),
        invalid,
        "$.bytes[0]",
    );
    // An entry no cell references.
    assert_refused(
        &receipt(1, 1, &[EMPTY_CELL], &[e_acute]),
        invalid,
        "$.sideTable[0]",
    );
    // A duplicate entry.
    assert_refused(
        &receipt(
            2,
            1,
            &[cell(0xf000, 0), cell(0xf001, 0)],
            &[e_acute, e_acute],
        ),
        invalid,
        "$.sideTable[1]",
    );
    // A grapheme that must be encoded directly in the cell.
    assert_refused(
        &receipt(1, 1, &[cell(0xf000, 0)], &["A"]),
        invalid,
        "$.sideTable[0]",
    );
    // Not a string.
    let mut document = receipt(1, 1, &[cell(0xf000, 0)], &[e_acute]);
    document["sideTable"] = json!([7]);
    assert_refused(&document, invalid, "$.sideTable[0]");
    // Too many entries.
    let mut document = receipt(1, 1, &[EMPTY_CELL], &[]);
    document["sideTable"] = json!(vec![e_acute; 0x1001]);
    assert_refused(&document, invalid, "$.sideTable");
}

#[test]
fn unsupported_glyphs_are_refused_before_any_preparation() {
    // Width 2, directly and through the side table.
    assert_refused(
        &receipt(1, 1, &[cell(0x6f22, 0)], &[]),
        ErrorCode::UnsupportedWideGlyph,
        "$.bytes[0]",
    );
    assert_refused(
        &receipt(1, 1, &[cell(0xf000, 0)], &["\u{1f600}"]),
        ErrorCode::UnsupportedWideGlyph,
        "$.sideTable[0]",
    );
    assert_refused(
        &receipt(1, 1, &[cell(0xf000, 0)], &["\u{2665}\u{fe0f}"]),
        ErrorCode::UnsupportedWideGlyph,
        "$.sideTable[0]",
    );
    // Width 1 and canonical, but not in the pinned pack and not procedural.
    assert_refused(
        &receipt(1, 1, &[cell(0x42, 0)], &[]),
        ErrorCode::MissingGlyphSlot,
        "$.bytes[0]",
    );
    assert_refused(
        &receipt(1, 1, &[cell(0xf000, 0)], &["o\u{308}"]),
        ErrorCode::MissingGlyphSlot,
        "$.sideTable[0]",
    );
    // Never canonical: NUL, C0, DEL, C1 and UTF-16 surrogates as direct codes.
    for code in [0x00, 0x1b, 0x7f, 0x9b, 0xd800, 0xdfff] {
        assert_refused(
            &receipt(1, 1, &[cell(code, 0)], &[]),
            ErrorCode::InvalidPackedCells,
            "$.bytes[0]",
        );
    }
    // Procedural ranges need no slot.
    for code in [0x2500, 0x257f, 0x2580, 0x259f, 0x2800, 0x28ff] {
        assert!(
            parse_value(&receipt(1, 1, &[cell(code, 0)], &[])).is_ok(),
            "U+{code:04X}"
        );
    }
}

#[test]
fn excessive_and_empty_dimensions_are_refused() {
    let invalid = ErrorCode::InvalidPackedCells;
    for (field, value) in [
        ("widthCells", json!(0)),
        ("heightCells", json!(0)),
        ("widthCells", json!(MAX_DIMENSION + 1)),
        ("heightCells", json!(-1)),
        ("widthCells", json!(1.5)),
        ("widthCells", json!("1")),
    ] {
        let mut document = receipt(1, 1, &[EMPTY_CELL], &[]);
        document[field] = value;
        assert_refused(&document, invalid, &format!("$.{field}"));
    }
    // 317 * 316 = 100,172 cells: each side is legal, the product is not. The byte array is left
    // short on purpose: the cell cap is checked before the bytes are read.
    let mut document = receipt(1, 1, &[EMPTY_CELL], &[]);
    document["widthCells"] = json!(317);
    document["heightCells"] = json!(316);
    const { assert!(317 * 316 > MAX_CELLS) };
    assert_refused(&document, invalid, "$");
}

#[test]
fn malformed_byte_arrays_are_refused() {
    let invalid = ErrorCode::InvalidPackedCells;
    let base = receipt(1, 1, &[EMPTY_CELL], &[]);
    let mut short = base.clone();
    short["bytes"] = json!([32, 0, 0]);
    assert_refused(&short, invalid, "$.bytes");
    for value in [json!(256), json!(-1), json!(1.5), json!("1"), json!(null)] {
        let mut document = base.clone();
        document["bytes"][2] = value;
        assert_refused(&document, invalid, "$.bytes[2]");
    }
    let error = crate::parse_packed_cells(
        b"{\"receiptVersion\":",
        &match pack() {
            Ok(pack) => pack,
            Err(error) => {
                assert!(error.to_string().is_empty(), "{error}");
                return;
            }
        },
    );
    assert_eq!(
        error.map_err(|error| (error.code, error.path)),
        Err((invalid, "$".to_owned()))
    );
}
