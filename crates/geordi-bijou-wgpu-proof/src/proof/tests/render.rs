//! Shader identity, frame geometry, read-back, receipts, and the `wgpu` frames themselves.
//!
//! Tests that need a `wgpu` adapter are `#[ignore]`d: on a host without one they fail instead of
//! passing, and a plain `cargo test` reports them as ignored. Run them with `--include-ignored`.

use std::fs;

use geordi_bijou_shadergen::{BUNNY_PRIMITIVES, MANIFEST_PATH, sha256_hex};
use serde_json::{Value, json};

use super::support::{
    EMPTY_CELL, PAINT, PROVEN_FRAMES, RECEIPT_DIR, SUITE_CANVAS, Scene, TempDir, TestResult, pack,
    parse_value, read_json, read_repo, receipt, repo_root, suite_frame,
};
use crate::{
    AdapterPolicy, BACKEND_PROFILE, DEFAULT_BG, DEFAULT_FG, DeviceClass, ErrorCode, EvidenceLevel,
    FrameSpec, RenderOutcome, SURFACE_WGSL_PATH, ShaderBundle, format_hex_color,
    padded_bytes_per_row, parse_hex_color, prepare_cells, probe_bindings, serialize_receipt,
    strip_row_padding,
};

fn checked_in(stem: &str, evidence: &str) -> Result<(String, Value), Box<dyn std::error::Error>> {
    let path = format!("{RECEIPT_DIR}/{stem}.{evidence}.receipt.json");
    let text = String::from_utf8(read_repo(&path)?)?;
    let value = serde_json::from_str(&text)?;
    Ok((text, value))
}

/// Renders with a real adapter. A host without one fails the calling test.
fn rendered(scene: &Scene) -> Result<RenderOutcome, Box<dyn std::error::Error>> {
    match scene.render(AdapterPolicy::Auto)? {
        RenderOutcome::Unavailable { detail } => {
            Err(format!("no wgpu adapter, so no pixel evidence: {detail}").into())
        }
        outcome @ RenderOutcome::Rendered { .. } => Ok(outcome),
    }
}

// ---------------------------------------------------------------------------------------------
// Shader identity
// ---------------------------------------------------------------------------------------------

#[test]
fn the_host_executes_the_assembled_wgsl_the_manifest_pins_byte_for_byte() -> TestResult {
    let bundle = ShaderBundle::load(&repo_root())?;
    let on_disk = read_repo(SURFACE_WGSL_PATH)?;
    assert_eq!(bundle.wgsl.as_bytes(), on_disk);
    assert_eq!(bundle.assembled_wgsl_sha256, sha256_hex(&on_disk));
    assert_eq!(
        bundle.manifest_sha256,
        sha256_hex(&read_repo(MANIFEST_PATH)?)
    );

    let manifest = read_json(MANIFEST_PATH)?;
    let surface = manifest["shaders"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|shader| shader["id"] == "bijou-surface")
        .ok_or("manifest has no bijou-surface shader")?;
    assert_eq!(
        surface["assembledWgslSha256"],
        bundle.assembled_wgsl_sha256.as_str()
    );
    assert_eq!(
        manifest["proceduralTableSha256"],
        bundle.procedural_table_sha256.as_str()
    );

    // The same bytes a fresh assembly by the generator produces: no fork, no hand edit.
    let generated = geordi_bijou_shadergen::generate(&repo_root())?;
    let fresh = generated
        .iter()
        .find(|artifact| artifact.path == SURFACE_WGSL_PATH)
        .ok_or("generator did not produce bijou-surface.wgsl")?;
    assert_eq!(fresh.bytes, bundle.wgsl.as_bytes());
    Ok(())
}

#[test]
fn a_shader_that_is_not_the_manifest_shader_is_refused_before_it_can_run() -> TestResult {
    let inputs = [
        "packages/bijou-gpu/shaders",
        "fixtures/bijou-gpu/procedural-glyphs.json",
    ];
    let temp = TempDir::new("shader-identity")?.with_repo_paths(&inputs)?;
    assert!(ShaderBundle::load(&temp.root).is_ok());

    let wgsl = temp.root.join(SURFACE_WGSL_PATH);
    let mut edited = fs::read_to_string(&wgsl)?;
    edited.push_str("\n// local edit\n");
    fs::write(&wgsl, edited)?;
    let error = ShaderBundle::load(&temp.root)
        .err()
        .ok_or("accepted an edited shader")?;
    assert_eq!(error.code, ErrorCode::ShaderIdentity);
    assert_eq!(error.path, SURFACE_WGSL_PATH);

    let temp = TempDir::new("shader-table")?.with_repo_paths(&inputs)?;
    let table = temp.root.join("fixtures/bijou-gpu/procedural-glyphs.json");
    let mut edited = fs::read_to_string(&table)?;
    edited.push('\n');
    fs::write(&table, edited)?;
    let error = ShaderBundle::load(&temp.root)
        .err()
        .ok_or("accepted an edited glyph table")?;
    assert_eq!(error.code, ErrorCode::ShaderIdentity);

    let temp = TempDir::new("shader-missing")?;
    let error = ShaderBundle::load(&temp.root)
        .err()
        .ok_or("loaded from an empty directory")?;
    assert_eq!(error.code, ErrorCode::Io);
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Frame geometry, uniforms, probes
// ---------------------------------------------------------------------------------------------

fn spec(
    width: u32,
    height: u32,
    canvas: Option<(u32, u32)>,
) -> Result<FrameSpec, crate::ProofError> {
    let pack =
        pack().map_err(|error| crate::ProofError::new(ErrorCode::Io, "", error.to_string()))?;
    let cells = vec![EMPTY_CELL; (width * height) as usize];
    let prepared = prepare_cells(&parse_value(&receipt(width, height, &cells, &[]))?, &pack)?;
    FrameSpec::new(&prepared, &pack, canvas, DEFAULT_FG, DEFAULT_BG)
}

#[test]
fn canvas_defaults_to_the_grid_and_may_only_grow() -> TestResult {
    let exact = spec(8, 7, None)?;
    assert_eq!((exact.canvas_px_w, exact.canvas_px_h), (64, 112));
    assert_eq!(
        (exact.cell_px_w, exact.cell_px_h, exact.atlas_cols),
        (8, 16, 4)
    );
    let letterboxed = spec(8, 7, Some(SUITE_CANVAS))?;
    assert_eq!(
        (letterboxed.canvas_px_w, letterboxed.canvas_px_h),
        SUITE_CANVAS
    );

    for canvas in [(63, 112), (64, 111), (0, 0)] {
        let error = spec(8, 7, Some(canvas))
            .err()
            .ok_or("accepted a canvas smaller than the grid")?;
        assert_eq!(error.code, ErrorCode::ResourceLimit, "{canvas:?}");
    }
    Ok(())
}

#[test]
fn grids_and_canvases_beyond_the_profile_limits_are_refused_before_gpu_allocation() -> TestResult {
    // 1024 x 97 cells of 8 x 16 pixels is 8192 x 1552: the widest canvas the profile allows.
    let widest = spec(1024, 97, None)?;
    assert_eq!(
        (widest.canvas_px_w, widest.canvas_px_h),
        (crate::MAX_TEXTURE_PX, 1552)
    );
    // 512 rows is 8192 pixels tall.
    assert_eq!(spec(1, 512, None)?.canvas_px_h, crate::MAX_TEXTURE_PX);

    for (width, height, canvas) in [
        (1025, 1, None),
        (1, 513, None),
        (9_999, 1, None),
        (1, 9_999, None),
        (1, 1, Some((8193, 16))),
        (1, 1, Some((8, 8193))),
    ] {
        let error = spec(width, height, canvas)
            .err()
            .ok_or_else(|| format!("accepted {width} x {height} on {canvas:?}"))?;
        assert_eq!(
            error.code,
            ErrorCode::ResourceLimit,
            "{width} x {height} on {canvas:?}"
        );
    }
    Ok(())
}

#[test]
fn uniform_block_follows_the_byte_offsets_the_manifest_declares() -> TestResult {
    let mut frame = spec(8, 7, Some(SUITE_CANVAS))?;
    frame.default_fg = [1, 2, 3];
    frame.default_bg = [4, 5, 6];
    let bytes = frame.uniform_bytes();
    let lane = |offset: usize| -> u32 {
        u32::from_le_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ])
    };

    let manifest = read_json(MANIFEST_PATH)?;
    let binding = &manifest["shaders"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|shader| shader["id"] == "bijou-surface")
        .ok_or("no bijou-surface shader")?["bindings"][0];
    assert_eq!(binding["byteSize"], bytes.len());
    let expected: [(&str, &[u32]); 7] = [
        ("canvasPx", &[67, 117]),
        ("cellPx", &[8, 16]),
        ("gridCells", &[8, 7]),
        ("atlasCols", &[4]),
        ("defaultFg", &[1, 2, 3]),
        ("defaultBg", &[4, 5, 6]),
        ("flags", &[0]),
    ];
    let members = binding["members"].as_array().ok_or("no members")?;
    assert_eq!(members.len(), expected.len());
    for (member, (name, lanes)) in members.iter().zip(expected) {
        assert_eq!(member["name"], name);
        let offset = usize::try_from(member["byteOffset"].as_u64().ok_or("no offset")?)?;
        for (index, value) in lanes.iter().enumerate() {
            assert_eq!(lane(offset + index * 4), *value, "{name}[{index}]");
        }
    }
    // Padding stays zero.
    assert_eq!((lane(28), lane(44)), (0, 0));
    Ok(())
}

#[test]
fn probes_are_cell_centres_at_an_even_stride_plus_the_last_canvas_pixel() -> TestResult {
    let points = spec(8, 7, Some(SUITE_CANVAS))?.probe_points();
    assert_eq!(points.len(), 57);
    assert_eq!(points[0], (4, 8));
    assert_eq!(points[1], (12, 8));
    assert_eq!(points[8], (4, 24));
    assert_eq!(points[55], (60, 104));
    assert_eq!(points[56], (66, 116), "the letterboxed corner");

    // 1024 x 97 = 99,328 cells: capped at 256 cell probes plus the corner.
    let large = spec(1024, 97, None)?;
    let points = large.probe_points();
    assert_eq!(points.len(), 257);
    assert!(
        points
            .iter()
            .all(|(px, py)| *px < large.canvas_px_w && *py < large.canvas_px_h)
    );
    assert_eq!(points[256], (8191, 1551));
    Ok(())
}

#[test]
fn hex_colours_round_trip_and_reject_non_canonical_spellings() {
    assert_eq!(parse_hex_color("#E6EDF3"), Some(DEFAULT_FG));
    assert_eq!(format_hex_color(DEFAULT_BG), "#0D1117");
    for text in ["#e6edf3", "E6EDF3", "#E6EDF", "#E6EDF3A", "#GGGGGG", ""] {
        assert_eq!(parse_hex_color(text), None, "{text}");
    }
}

// ---------------------------------------------------------------------------------------------
// Read-back padding
// ---------------------------------------------------------------------------------------------

#[test]
fn readback_rows_are_padded_to_256_bytes_and_stripped_to_tight_rgba8() -> TestResult {
    assert_eq!(padded_bytes_per_row(1), 256);
    assert_eq!(padded_bytes_per_row(64), 256);
    assert_eq!(padded_bytes_per_row(65), 512);
    assert_eq!(
        padded_bytes_per_row(67),
        512,
        "the conformance canvas: 268 tight bytes per row"
    );
    assert_eq!(padded_bytes_per_row(8192), 32_768);

    // A 67 x 3 copy whose padding holds a sentinel that must not survive.
    let (width, height) = (67_u32, 3_u32);
    let stride = padded_bytes_per_row(width) as usize;
    let tight_row = width as usize * 4;
    let mut padded = vec![0xee_u8; stride * height as usize];
    let mut expected = Vec::new();
    for row in 0..height as usize {
        for index in 0..tight_row {
            let value = u8::try_from((row * 7 + index) % 251)?;
            padded[row * stride + index] = value;
            expected.push(value);
        }
    }
    let tight = strip_row_padding(&padded, width, height)?;
    assert_eq!(tight.len(), 67 * 3 * 4);
    assert_eq!(tight, expected);

    // The last row of a copy may omit its padding.
    let short = &padded[..stride * 2 + tight_row];
    assert_eq!(strip_row_padding(short, width, height)?, expected);

    let error = strip_row_padding(&padded[..stride * 2], width, height)
        .err()
        .ok_or("accepted a truncated copy")?;
    assert_eq!(error.code, ErrorCode::RendererFault);
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Evidence levels and receipts that need no adapter
// ---------------------------------------------------------------------------------------------

#[test]
fn only_a_named_gpu_class_supports_a_hardware_claim() {
    assert_eq!(
        DeviceClass::DiscreteGpu.evidence_level(),
        EvidenceLevel::GpuProbed
    );
    assert_eq!(
        DeviceClass::IntegratedGpu.evidence_level(),
        EvidenceLevel::GpuProbed
    );
    // A virtual adapter is not thereby software.
    assert_eq!(
        DeviceClass::VirtualGpu.evidence_level(),
        EvidenceLevel::GpuProbed
    );
    // A CPU adapter is software execution; an unknown class is not proven hardware.
    assert_eq!(
        DeviceClass::Cpu.evidence_level(),
        EvidenceLevel::SoftwareProbed
    );
    assert_eq!(
        DeviceClass::Other.evidence_level(),
        EvidenceLevel::SoftwareProbed
    );
    let refused = RenderOutcome::Unavailable {
        detail: String::new(),
    };
    assert_eq!(refused.evidence_level(), EvidenceLevel::CapabilityRefused);
}

#[test]
fn a_denied_adapter_gives_a_capability_refused_receipt_with_no_pixels() -> TestResult {
    let scene = Scene::load(PAINT, Some(SUITE_CANVAS))?;
    let outcome = scene.render(AdapterPolicy::Deny)?;
    let RenderOutcome::Unavailable { detail } = &outcome else {
        return Err("a denied adapter rendered".into());
    };
    assert!(detail.contains("denied"), "{detail}");

    let receipt = scene.receipt(&outcome);
    assert_eq!(receipt["evidenceLevel"], "capability-refused");
    assert_eq!(receipt["frameRgbaSha256"], Value::Null);
    assert_eq!(receipt["probes"], json!([]));
    assert_eq!(
        receipt["adapter"],
        json!({ "backend": "wgpu", "name": "", "driver": "" })
    );
    assert_eq!(probe_bindings(&scene.parts(&outcome)), Vec::<Value>::new());
    // The refusal still identifies the input, the prepared buffer and the shader it would run.
    let paint = suite_frame("paint")?;
    assert_eq!(receipt["inputReceiptSha256"], paint["inputReceiptSha256"]);
    assert_eq!(
        receipt["preparedBufferSha256"],
        paint["preparedBufferSha256"]
    );
    assert_eq!(
        receipt["shaderSha256"],
        scene.shader.assembled_wgsl_sha256.as_str()
    );

    // Nothing in a refusal depends on the host, so the checked-in receipt is its exact bytes.
    let (text, _) = checked_in("width1-paint", "capability-refused")?;
    assert_eq!(serialize_receipt(&receipt), text);
    Ok(())
}

/// The paint scene with a synthetic frame from a `Cpu` adapter: the receipt code is under test,
/// not the pixels.
fn synthetic_cpu_frame() -> Result<(Scene, RenderOutcome, Vec<u8>), Box<dyn std::error::Error>> {
    let scene = Scene::load(PAINT, Some(SUITE_CANVAS))?;
    let adapter = crate::AdapterIdentity {
        backend: "metal".to_owned(),
        name: "Test Adapter".to_owned(),
        driver: "driver".to_owned(),
        driver_info: "1.2".to_owned(),
        device_class: DeviceClass::Cpu,
        vendor: 0,
        device: 0,
    };
    let rgba: Vec<u8> = (0..67 * 117).flat_map(|_| [10, 20, 30, 255]).collect();
    let outcome = RenderOutcome::Rendered {
        rgba: rgba.clone(),
        adapter,
    };
    Ok((scene, outcome, rgba))
}

#[test]
fn receipts_pin_every_identity() -> TestResult {
    let (scene, outcome, rgba) = synthetic_cpu_frame()?;
    let receipt = scene.receipt(&outcome);

    let fields: Vec<&str> = receipt
        .as_object()
        .ok_or("not an object")?
        .keys()
        .map(String::as_str)
        .collect();
    let mut sorted = fields.clone();
    sorted.sort_unstable();
    assert_eq!(fields, sorted, "keys are emitted in sorted order");
    assert_eq!(
        fields.len(),
        28,
        "exactly the fields of geordi-bijou-gpu-receipt/1"
    );

    assert_eq!(receipt["receiptVersion"], "geordi-bijou-gpu-receipt/1");
    assert_eq!(receipt["gpuAbiVersion"], "bijou-surface-gpu/1");
    assert_eq!(receipt["cellFormatId"], "bijou-packed-cell-u8x10-le/1");
    assert_eq!(receipt["backendProfile"], BACKEND_PROFILE);
    assert_eq!(
        receipt["evidenceLevel"], "software-probed",
        "a CPU adapter never claims a GPU"
    );
    assert_eq!(
        receipt["adapter"],
        json!({ "backend": "wgpu", "name": "Test Adapter", "driver": "metal; driver; 1.2" })
    );
    assert_eq!(receipt["frameRgbaSha256"], sha256_hex(&rgba).as_str());
    assert_eq!(
        receipt["assembledWgslSha256"],
        scene.shader.assembled_wgsl_sha256.as_str()
    );
    assert_eq!(receipt["shaderSha256"], receipt["assembledWgslSha256"]);
    assert_eq!(
        receipt["executedArtifactSha256"],
        receipt["assembledWgslSha256"]
    );
    assert_eq!(receipt["generatedGlslSha256"], Value::Null);
    assert_eq!(
        receipt["proceduralTableSha256"],
        scene.shader.procedural_table_sha256.as_str()
    );
    for (pin, primitive) in receipt["bunnyPrimitives"]
        .as_array()
        .ok_or("no pins")?
        .iter()
        .zip(BUNNY_PRIMITIVES)
    {
        assert_eq!(
            *pin,
            json!({
                "contractId": primitive.contract_id,
                "bunnyCommit": primitive.bunny_commit,
                "wgslSha256": primitive.wgsl_sha256,
                "vectorsSha256": primitive.vectors_sha256,
            })
        );
    }
    assert_eq!(receipt["fontIdentity"], scene.pack.font_identity.as_str());
    Ok(())
}

#[test]
fn receipts_record_the_frame_geometry_bind_probes_to_cells_and_serialize_canonically() -> TestResult
{
    let (scene, outcome, _) = synthetic_cpu_frame()?;
    let receipt = scene.receipt(&outcome);
    assert_eq!(
        receipt["atlasStats"],
        json!({ "usedSlots": 8, "capacity": 8, "monoCount": 6, "colorEmojiCount": 2 })
    );
    assert_eq!(
        (&receipt["widthCells"], &receipt["heightCells"]),
        (&json!(8), &json!(7))
    );
    assert_eq!(receipt["cellPx"], json!({ "width": 8, "height": 16 }));
    assert_eq!(
        (&receipt["canvasPxW"], &receipt["canvasPxH"]),
        (&json!(67), &json!(117))
    );
    assert_eq!(
        (&receipt["dpr"], &receipt["atlasGeneration"]),
        (&json!(1), &json!(1))
    );
    assert_eq!(
        (&receipt["defaultFg"], &receipt["defaultBg"]),
        (&json!("#E6EDF3"), &json!("#0D1117"))
    );
    assert_eq!(receipt["probePolicy"], "integer-canonical-exact");
    let probes = receipt["probes"].as_array().ok_or("no probes")?;
    assert_eq!(probes.len(), 57);
    assert_eq!(
        probes[0],
        json!({ "px": 4, "py": 8, "rgba": [10, 20, 30, 255] })
    );

    // Each probe is bound to the ten source bytes and the sixteen prepared bytes of its cell.
    let bindings = probe_bindings(&scene.parts(&outcome));
    assert_eq!(bindings.len(), 57);
    assert_eq!(
        bindings[0],
        json!({
            "px": 4,
            "py": 8,
            "rgba": [10, 20, 30, 255],
            "cell": { "col": 0, "row": 0 },
            "sourceCellHex": "4100ff804010203000ff",
            "preparedCellHex": "00000100ff804000102030ff00000000",
        })
    );
    assert_eq!(
        bindings[56]["cell"],
        Value::Null,
        "the letterbox belongs to no cell"
    );
    assert_eq!(bindings[56]["sourceCellHex"], Value::Null);

    let text = serialize_receipt(&receipt);
    assert!(
        text.starts_with("{\n  \"adapter\": {\n    \"backend\": \"wgpu\","),
        "{text}"
    );
    assert!(text.ends_with("}\n") && !text.ends_with("\n\n"));
    assert_eq!(serde_json::from_str::<Value>(&text)?, receipt);
    assert_eq!(
        text,
        serialize_receipt(&scene.receipt(&outcome)),
        "deterministic"
    );
    Ok(())
}

#[test]
fn checked_in_gpu_probed_receipts_claim_exactly_the_oracle_digests_of_the_current_inputs()
-> TestResult {
    for (stem, input, canvas) in PROVEN_FRAMES {
        let (text, receipt) = checked_in(stem, "gpu-probed")?;
        assert_eq!(serialize_receipt(&receipt), text, "{stem}: canonical bytes");
        assert_eq!(receipt["evidenceLevel"], "gpu-probed", "{stem}");
        assert_ne!(receipt["adapter"]["name"], "", "{stem}: a named adapter");

        // Everything but the adapter and the pixels is recomputed here without a GPU.
        let scene = Scene::load(input, canvas)?;
        let refusal = scene.receipt(&scene.render(AdapterPolicy::Deny)?);
        for field in refusal.as_object().ok_or("not an object")?.keys() {
            if !["adapter", "evidenceLevel", "frameRgbaSha256", "probes"].contains(&field.as_str())
            {
                assert_eq!(receipt[field], refusal[field], "{stem}: {field}");
            }
        }
        assert_eq!(
            receipt["probes"].as_array().map(Vec::len),
            Some(scene.frame.probe_points().len()),
            "{stem}"
        );
    }
    // The conformance frames carry the frame digests the CPU oracle recorded in the suite.
    for (stem, id) in [("width1-paint", "paint"), ("width1-erase", "erase")] {
        let (_, receipt) = checked_in(stem, "gpu-probed")?;
        assert_eq!(
            receipt["frameRgbaSha256"],
            suite_frame(id)?["frameRgbaSha256"],
            "{stem}"
        );
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Frames executed by wgpu
// ---------------------------------------------------------------------------------------------

#[test]
#[ignore = "needs a wgpu adapter"]
fn wgpu_frames_hash_to_the_cpu_oracle_goldens_with_zero_tolerance() -> TestResult {
    for (id, path) in [("paint", PAINT), ("erase", super::support::ERASE)] {
        let scene = Scene::load(path, Some(SUITE_CANVAS))?;
        let outcome = rendered(&scene)?;
        let RenderOutcome::Rendered { rgba, adapter } = &outcome else {
            return Err("unreachable: rendered() returned no frame".into());
        };
        assert_eq!(rgba.len(), 67 * 117 * 4, "{id}: tight rows, no padding");
        assert!(
            rgba.as_chunks::<4>().0.iter().all(|pixel| pixel[3] == 255),
            "{id}: opaque"
        );
        assert_eq!(
            suite_frame(id)?["frameRgbaSha256"],
            sha256_hex(rgba).as_str(),
            "{id} on {} ({})",
            adapter.name,
            adapter.device_class.name()
        );
        let receipt = scene.receipt(&outcome);
        assert_eq!(
            receipt["frameRgbaSha256"],
            suite_frame(id)?["frameRgbaSha256"]
        );
        assert_eq!(
            receipt["preparedBufferSha256"],
            suite_frame(id)?["preparedBufferSha256"]
        );
        assert_eq!(receipt["evidenceLevel"], outcome.evidence_level().name());
    }
    Ok(())
}

#[test]
#[ignore = "needs a wgpu adapter"]
fn wgpu_runs_reproduce_the_checked_in_receipts_and_are_repeatable() -> TestResult {
    for (stem, input, canvas) in PROVEN_FRAMES {
        let scene = Scene::load(input, canvas)?;
        let first = rendered(&scene)?;
        let second = rendered(&scene)?;
        assert_eq!(first, second, "{stem}: identical frames on repeated runs");
        let receipt = scene.receipt(&first);
        assert_eq!(
            serialize_receipt(&receipt),
            serialize_receipt(&scene.receipt(&second)),
            "{stem}: identical receipts on repeated runs"
        );

        // Another host has another adapter, and a software adapter another evidence level; the
        // pixels and every identity must still be the checked-in ones.
        let (_, recorded) = checked_in(stem, "gpu-probed")?;
        for field in recorded.as_object().ok_or("not an object")?.keys() {
            if !["adapter", "evidenceLevel"].contains(&field.as_str()) {
                assert_eq!(receipt[field], recorded[field], "{stem}: {field}");
            }
        }
    }
    Ok(())
}
