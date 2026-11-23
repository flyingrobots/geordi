use super::*;
use std::collections::BTreeMap;

type TestResult = Result<(), Box<dyn Error>>;

const ONE: i64 = GEORDI_FIXED_Q32_32_ONE_RAW;

/// Independent oracle: `hashlib.sha256` over the committed reference scene bytes, which are the
/// canonical form (`json.dumps(sort_keys=True, indent=2, ensure_ascii=False)` plus a newline; the
/// reference scene is ASCII, so `ensure_ascii` does not matter here).
const REFERENCE_SCENE_HASH: &str =
    "sha256:5ea6b6085b5178fcda09fc966737e44cd5c731ed311e4fcd601ddf935a480a24";

/// Independent oracle: `shasum -a 256 fixtures/ray-traced-scene/meshes/unit-quad.ply`.
const UNIT_QUAD_HASH: &str =
    "sha256:caca8649845effd4c3512ff53312877856be1733554d4c7b42dc3c2b0cd35230";

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/ray-traced-scene")
}

fn reference_source() -> Result<String, Box<dyn Error>> {
    Ok(fs::read_to_string(
        fixture_root().join("reference.rt-scene.geordi.json"),
    )?)
}

fn reference_scene() -> Result<GeordiRayTracedScene, Box<dyn Error>> {
    Ok(parse_geordi_ray_traced_scene(&reference_source()?)?)
}

fn q(raw: i64) -> Result<GeordiFixedQ32_32, Box<dyn Error>> {
    GeordiFixedQ32_32::from_raw(raw).ok_or_else(|| format!("raw {raw} out of range").into())
}

fn issue_codes(error: &GeordiRayTracedSceneError) -> Vec<(String, String)> {
    error
        .issues()
        .iter()
        .map(|issue| (issue.code.clone(), issue.path.clone()))
        .collect()
}

fn validation_codes(scene: &GeordiRayTracedScene) -> Vec<String> {
    validate_geordi_ray_traced_scene(scene).map_or_else(
        |error| {
            issue_codes(&error)
                .into_iter()
                .map(|(code, _)| code)
                .collect()
        },
        |()| Vec::new(),
    )
}

/// Apply `mutate` to the reference scene and assert the exact validation outcome.
fn check(
    mutate: impl FnOnce(&mut GeordiRayTracedScene) -> TestResult,
    expected: Option<&str>,
) -> TestResult {
    let mut scene = reference_scene()?;
    mutate(&mut scene)?;
    let codes = validation_codes(&scene);
    let expected: Vec<String> = expected.into_iter().map(str::to_owned).collect();
    assert_eq!(codes, expected);
    Ok(())
}

#[test]
fn reference_scene_parses_validates_and_verifies_its_mesh() -> TestResult {
    let scene = reference_scene()?;
    validate_geordi_ray_traced_scene(&scene)?;
    let verified = validate_geordi_ray_traced_scene_mesh_assets(&scene, fixture_root())?;
    assert_eq!(verified.len(), 1);
    assert_eq!(verified[0].sha256, UNIT_QUAD_HASH);
    assert_eq!(scene.instances.len(), 2);
    assert_eq!(scene.camera.tan_half_fov_y.raw(), 1_779_033_704);
    Ok(())
}

#[test]
fn reference_mesh_is_the_binary_little_endian_layout() -> TestResult {
    let bytes = fs::read(fixture_root().join("meshes/unit-quad.ply"))?;
    let header = b"ply\nformat binary_little_endian 1.0\n";
    assert_eq!(bytes.get(..header.len()), Some(header.as_slice()));
    let end = b"end_header\n";
    let body_start = bytes
        .windows(end.len())
        .position(|window| window == end)
        .ok_or("missing end_header")?
        + end.len();
    // 4 vertices of three f32 plus 2 faces of one u8 count and three i32 indices.
    assert_eq!(bytes.len() - body_start, 4 * 12 + 2 * 13);
    Ok(())
}

#[test]
fn reference_fixture_bytes_are_canonical_json() -> TestResult {
    let source = reference_source()?;
    assert_eq!(geordi_ray_traced_scene_canonical_json(&source)?, source);
    Ok(())
}

#[test]
fn scene_hash_matches_the_independent_oracle_and_ignores_formatting() -> TestResult {
    let source = reference_source()?;
    assert_eq!(geordi_ray_traced_scene_hash(&source)?, REFERENCE_SCENE_HASH);
    let compact = serde_json::to_string(&serde_json::from_str::<Value>(&source)?)?;
    assert_ne!(compact, source);
    assert_eq!(
        geordi_ray_traced_scene_hash(&compact)?,
        REFERENCE_SCENE_HASH
    );
    let canonical = geordi_ray_traced_scene_canonical_json(&compact)?;
    assert_eq!(
        geordi_ray_traced_scene_canonical_json(&canonical)?,
        canonical
    );
    Ok(())
}

#[test]
fn scene_hash_changes_when_one_raw_value_changes() -> TestResult {
    let source = reference_source()?;
    let changed = source.replace("\"seed\": 0", "\"seed\": 1");
    assert_ne!(changed, source);
    assert_ne!(
        geordi_ray_traced_scene_hash(&changed)?,
        REFERENCE_SCENE_HASH
    );
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExpectedDiagnostic {
    stage: String,
    code: String,
    path: String,
}

#[test]
fn every_failure_fixture_fails_with_its_recorded_diagnostic() -> TestResult {
    let failures = fixture_root().join("failures");
    let expected: BTreeMap<String, ExpectedDiagnostic> = serde_json::from_str(
        &fs::read_to_string(failures.join("expected-diagnostics.json"))?,
    )?;
    let mut on_disk = Vec::new();
    for entry in fs::read_dir(&failures)? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if name.ends_with(".rt-scene.geordi.json") {
            on_disk.push(name);
        }
    }
    on_disk.sort();
    assert_eq!(on_disk, expected.keys().cloned().collect::<Vec<_>>());
    for (name, diagnostic) in &expected {
        let actual =
            failure_stage_issues(&fs::read_to_string(failures.join(name))?, &diagnostic.stage)?;
        assert_eq!(
            actual,
            vec![(diagnostic.code.clone(), diagnostic.path.clone())],
            "{name}"
        );
    }
    Ok(())
}

/// Run stages in order; earlier stages must pass and the named stage must fail.
fn failure_stage_issues(
    source: &str,
    stage: &str,
) -> Result<Vec<(String, String)>, Box<dyn Error>> {
    let scene = match (parse_geordi_ray_traced_scene(source), stage) {
        (Err(error), "parse") => return Ok(issue_codes(&error)),
        (Ok(scene), "validate" | "assets") => scene,
        (outcome, _) => return Err(format!("unexpected parse outcome {:?}", outcome.err()).into()),
    };
    let validation = validate_geordi_ray_traced_scene(&scene);
    match (validation, stage) {
        (Err(error), "validate") => return Ok(issue_codes(&error)),
        (Ok(()), "assets") => {}
        (outcome, _) => return Err(format!("unexpected validation outcome {outcome:?}").into()),
    }
    match validate_geordi_ray_traced_scene_mesh_assets(&scene, fixture_root()) {
        Err(error) => Ok(issue_codes(&error)),
        Ok(_) => Err("asset stage unexpectedly passed".into()),
    }
}

#[test]
fn fixed_q32_32_accepts_integer_tokens_and_rejects_every_other_spelling() -> TestResult {
    assert_eq!(serde_json::from_str::<GeordiFixedQ32_32>("1")?.raw(), 1);
    assert_eq!(serde_json::from_str::<GeordiFixedQ32_32>("-1")?.raw(), -1);
    assert_eq!(serde_json::from_str::<GeordiFixedQ32_32>("0")?.raw(), 0);
    for rejected in [
        "1.0", "1e0", "1E3", "-0", "-0.0", "0.5", "\"1\"", "null", "true", "[1]",
    ] {
        let error = serde_json::from_str::<GeordiFixedQ32_32>(rejected)
            .err()
            .ok_or_else(|| format!("{rejected} was accepted"))?;
        assert!(
            error.to_string().contains(GEORDI_E_RT_NUMBER_NOT_INTEGER),
            "{rejected}: {error}"
        );
    }
    Ok(())
}

#[test]
fn fixed_q32_32_range_is_exactly_the_safe_integer_range() {
    let max = GEORDI_FIXED_Q32_32_RAW_MAX;
    assert_eq!(max, (1_i64 << 53) - 1);
    assert_eq!(GEORDI_FIXED_Q32_32_RAW_MIN, -max);
    assert_eq!(
        GeordiFixedQ32_32::from_raw(max).map(GeordiFixedQ32_32::raw),
        Some(max)
    );
    assert_eq!(
        GeordiFixedQ32_32::from_raw(-max).map(GeordiFixedQ32_32::raw),
        Some(-max)
    );
    assert_eq!(GeordiFixedQ32_32::from_raw(max + 1), None);
    assert_eq!(GeordiFixedQ32_32::from_raw(-max - 1), None);
    assert_eq!(GeordiFixedQ32_32::from_raw(i64::MAX), None);
    assert_eq!(GeordiFixedQ32_32::from_raw(i64::MIN), None);
    for (token, accepted) in [
        ("9007199254740991", true),
        ("-9007199254740991", true),
        ("9007199254740992", false),
        ("-9007199254740992", false),
        ("18446744073709551615", false),
    ] {
        let parsed = serde_json::from_str::<GeordiFixedQ32_32>(token);
        assert_eq!(parsed.is_ok(), accepted, "{token}");
        if let Err(error) = parsed {
            assert!(
                error.to_string().contains(GEORDI_E_RT_NUMBER_OUT_OF_RANGE),
                "{token}"
            );
        }
    }
}

#[test]
fn scene_number_range_boundaries_carry_json_paths() -> TestResult {
    let source = reference_source()?;
    let field = "\"seed\": 0";
    for (value, expected) in [
        ("9007199254740991", None),
        ("-9007199254740991", None),
        ("9007199254740992", Some(GEORDI_E_RT_NUMBER_OUT_OF_RANGE)),
        ("-9007199254740992", Some(GEORDI_E_RT_NUMBER_OUT_OF_RANGE)),
    ] {
        let changed = source.replace(field, &format!("\"seed\": {value}"));
        let outcome = parse_geordi_ray_traced_scene(&changed)
            .err()
            .map(|error| issue_codes(&error));
        let expected = expected.map(|code| vec![(code.to_owned(), "$.render.seed".to_owned())]);
        assert_eq!(outcome, expected, "{value}");
    }
    Ok(())
}

#[test]
fn tan_half_fov_y_is_in_zero_exclusive_to_four_inclusive() -> TestResult {
    let max = GEORDI_RAY_TRACED_TAN_HALF_FOV_Y_MAX_RAW;
    assert_eq!(max, 4 * ONE);
    let code = Some(GEORDI_E_RT_TAN_HALF_FOV_Y_OUT_OF_RANGE);
    for (raw, expected) in [
        (-1, code),
        (0, code),
        (1, None),
        (max, None),
        (max + 1, code),
    ] {
        check(
            |scene| {
                scene.camera.tan_half_fov_y = q(raw)?;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn albedo_channels_are_in_zero_to_one() -> TestResult {
    let code = Some(GEORDI_E_RT_ALBEDO_OUT_OF_RANGE);
    for channel in 0..3 {
        for (raw, expected) in [(-1, code), (0, None), (ONE, None), (ONE + 1, code)] {
            check(
                |scene| {
                    scene.materials[0].albedo[channel] = q(raw)?;
                    Ok(())
                },
                expected,
            )?;
        }
    }
    Ok(())
}

/// Parse the reference scene with channel 2 of one light's value set to `raw`, then validate it.
/// Light 0 is the sun (`irradiance`); light 1 is the sky (`radiance`).
fn light_value_codes(light: usize, field: &str, raw: i64) -> Result<Vec<String>, Box<dyn Error>> {
    let mut value: Value = serde_json::from_str(&reference_source()?)?;
    value["lights"][light][field][2] = raw.into();
    let scene = parse_geordi_ray_traced_scene(&serde_json::to_string(&value)?)?;
    Ok(validation_codes(&scene))
}

#[test]
fn light_values_are_in_zero_to_65536() -> TestResult {
    let max = GEORDI_RAY_TRACED_RADIANCE_MAX_RAW;
    assert_eq!(max, 65_536 * ONE);
    assert_eq!(GEORDI_RAY_TRACED_IRRADIANCE_MAX_RAW, max);
    assert_eq!(
        GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE,
        "GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE"
    );
    assert_eq!(
        GEORDI_E_RT_RADIANCE_OUT_OF_RANGE,
        "GEORDI_E_RT_RADIANCE_OUT_OF_RANGE"
    );
    // The sun's value is an irradiance and has its own code; the sky keeps radiance and its code.
    for (light, field, code) in [
        (0, "irradiance", GEORDI_E_RT_IRRADIANCE_OUT_OF_RANGE),
        (1, "radiance", GEORDI_E_RT_RADIANCE_OUT_OF_RANGE),
    ] {
        for (raw, expected) in [
            (-1, Some(code)),
            (0, None),
            (max, None),
            (max + 1, Some(code)),
        ] {
            let expected: Vec<String> = expected.into_iter().map(str::to_owned).collect();
            assert_eq!(light_value_codes(light, field, raw)?, expected);
        }
    }
    Ok(())
}

#[test]
fn directional_light_value_is_named_irradiance_and_radiance_is_refused() -> TestResult {
    let source = reference_source()?;
    let reference: Value = serde_json::from_str(&source)?;
    assert!(reference["lights"][0].get("irradiance").is_some());
    assert!(reference["lights"][0].get("radiance").is_none());
    assert!(reference["lights"][1].get("radiance").is_some());
    assert!(reference["lights"][1].get("irradiance").is_none());
    parse_geordi_ray_traced_scene(&source)?;

    let parse_error = |value: &Value| -> Result<GeordiRayTracedSceneError, Box<dyn Error>> {
        match parse_geordi_ray_traced_scene(&serde_json::to_string(value)?) {
            Ok(_) => Err("scene unexpectedly parsed".into()),
            Err(error) => Ok(error),
        }
    };

    // The old name on the sun is an unknown field, and the sun then lacks `irradiance`.
    let mut old_name = reference.clone();
    let sun = old_name["lights"][0]
        .as_object_mut()
        .ok_or("sun is not an object")?;
    let moved = sun.remove("irradiance").ok_or("sun has no irradiance")?;
    sun.insert("radiance".to_owned(), moved);
    let error = parse_error(&old_name)?;
    assert_eq!(
        issue_codes(&error),
        vec![(GEORDI_E_RT_SCENE_SHAPE.to_owned(), "$".to_owned())]
    );
    assert!(error.issues()[0].message.contains("radiance"));

    // The sun with neither name is a missing `irradiance`.
    let mut missing = reference.clone();
    missing["lights"][0]
        .as_object_mut()
        .ok_or("sun is not an object")?
        .remove("irradiance");
    let error = parse_error(&missing)?;
    assert_eq!(
        issue_codes(&error),
        vec![(GEORDI_E_RT_SCENE_SHAPE.to_owned(), "$".to_owned())]
    );
    assert!(error.issues()[0].message.contains("irradiance"));

    // Both names on the sun is also refused.
    let mut both = reference.clone();
    both["lights"][0]["radiance"] = both["lights"][0]["irradiance"].clone();
    assert_eq!(
        issue_codes(&parse_error(&both)?),
        vec![(GEORDI_E_RT_SCENE_SHAPE.to_owned(), "$".to_owned())]
    );

    // The sky keeps `radiance`: `irradiance` on the sky is an unknown field.
    let mut sky = reference;
    let sky_light = sky["lights"][1]
        .as_object_mut()
        .ok_or("sky is not an object")?;
    let moved = sky_light.remove("radiance").ok_or("sky has no radiance")?;
    sky_light.insert("irradiance".to_owned(), moved);
    let error = parse_error(&sky)?;
    assert_eq!(
        issue_codes(&error),
        vec![(GEORDI_E_RT_SCENE_SHAPE.to_owned(), "$".to_owned())]
    );
    assert!(error.issues()[0].message.contains("irradiance"));
    Ok(())
}

#[test]
fn toward_light_largest_magnitude_is_exactly_one() -> TestResult {
    let code = Some(GEORDI_E_RT_TOWARD_LIGHT_NOT_NORMALIZED);
    for (vector, expected) in [
        ([ONE - 1, 0, 0], code),
        ([ONE + 1, 0, 0], code),
        ([-ONE, 0, 0], None),
        ([ONE - 1, -ONE, ONE - 1], None),
        ([ONE, ONE, ONE], None),
        ([ONE, ONE + 1, 0], code),
    ] {
        check(
            |scene| {
                scene.lights[0].toward_light = Some([q(vector[0])?, q(vector[1])?, q(vector[2])?]);
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn film_dimensions_are_in_one_to_16384() -> TestResult {
    let code = Some(GEORDI_E_RT_FILM_SIZE_OUT_OF_RANGE);
    for (value, expected) in [
        (0, code),
        (1, None),
        (16_384, None),
        (16_385, code),
        (-1, code),
    ] {
        check(
            |scene| {
                scene.film.width = value;
                Ok(())
            },
            expected,
        )?;
        check(
            |scene| {
                scene.film.height = value;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn samples_per_pixel_is_a_power_of_two_up_to_1024() -> TestResult {
    let code = Some(GEORDI_E_RT_SAMPLES_PER_PIXEL_INVALID);
    for (value, expected) in [
        (-1, code),
        (0, code),
        (1, None),
        (2, None),
        (3, code),
        (512, None),
        (1023, code),
        (1024, None),
        (1025, code),
        (2048, code),
    ] {
        check(
            |scene| {
                scene.render.samples_per_pixel = value;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn seed_is_in_zero_to_two_to_the_32_minus_one() -> TestResult {
    let code = Some(GEORDI_E_RT_SEED_OUT_OF_RANGE);
    let max = GEORDI_RAY_TRACED_SEED_MAX;
    assert_eq!(max, 4_294_967_295);
    for (value, expected) in [(-1, code), (0, None), (max, None), (max + 1, code)] {
        check(
            |scene| {
                scene.render.seed = value;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn max_bounces_is_zero_or_one() -> TestResult {
    let code = Some(GEORDI_E_RT_MAX_BOUNCES_OUT_OF_RANGE);
    for (value, expected) in [(-1, code), (0, None), (1, None), (2, code)] {
        check(
            |scene| {
                scene.render.max_bounces = value;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn mesh_counts_are_non_negative_and_bounds_are_ordered() -> TestResult {
    let count_code = Some(GEORDI_E_RT_MESH_COUNT_INVALID);
    for (value, expected) in [(-1, count_code), (0, None)] {
        check(
            |scene| {
                scene.meshes[0].counts.vertices = value;
                Ok(())
            },
            expected,
        )?;
    }
    for (min_y, expected) in [(0, None), (1, Some(GEORDI_E_RT_MESH_BOUNDS_INVALID))] {
        check(
            |scene| {
                scene.meshes[0].bounds.min[1] = q(min_y)?;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn total_primitive_count_is_at_most_two_to_the_32_minus_one() -> TestResult {
    let max = GEORDI_RAY_TRACED_PRIMITIVE_COUNT_MAX;
    for (triangles, expected) in [
        (max, None),
        (max + 1, Some(GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED)),
    ] {
        check(
            |scene| {
                scene.instances.truncate(1);
                scene.meshes[0].counts.triangles = triangles;
                Ok(())
            },
            expected,
        )?;
    }
    // Two instances of one mesh count its triangles twice.
    for (triangles, expected) in [
        ((max - 1) / 2, None),
        ((max + 1) / 2, Some(GEORDI_E_RT_PRIMITIVE_COUNT_EXCEEDED)),
    ] {
        check(
            |scene| {
                scene.meshes[0].counts.triangles = triangles;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn transformed_mesh_bounds_must_stay_below_255_units() -> TestResult {
    // The ground instance scales the [-1, 1] quad by 8, so its x corners are translation +- 8.
    let code = Some(GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED);
    let edge = 247 * ONE;
    for (translation_x, expected) in [
        (edge - 1, None),
        (edge, code),
        (-edge + 1, None),
        (-edge, code),
    ] {
        check(
            |scene| {
                scene.instances[0].world_from_mesh.translation[0] = q(translation_x)?;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn trace_domain_check_uses_exact_products_without_rounding() -> TestResult {
    // Scale 0.5 of a bound at 510 units minus one raw unit is 255 units minus half a raw unit:
    // below the limit exactly, although rounding to nearest-even would reach 255 units.
    let code = Some(GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED);
    for (max_x, expected) in [(510 * ONE - 1, None), (510 * ONE, code)] {
        check(
            |scene| {
                scene.instances.truncate(1);
                let transform = &mut scene.instances[0].world_from_mesh;
                transform.linear_column_major[0] = q(ONE / 2)?;
                scene.meshes[0].bounds.max[0] = q(max_x)?;
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn trace_domain_check_reads_the_linear_part_column_major() -> TestResult {
    // Entry 6 is row 0, column 2: world x = 100 + mesh x + k * mesh z. With x and z bounds of
    // +-1 the largest |world x| is 101 + k. Read row-major, entry 6 would instead move world z
    // by k * mesh x, giving at most 1 + k, and k = 154 would be accepted.
    let code = Some(GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED);
    for (k, expected) in [(153, None), (154, code)] {
        check(
            |scene| {
                scene.instances.truncate(1);
                let transform = &mut scene.instances[0].world_from_mesh;
                transform.linear_column_major = [
                    q(ONE)?,
                    q(0)?,
                    q(0)?,
                    q(0)?,
                    q(ONE)?,
                    q(0)?,
                    q(k * ONE)?,
                    q(0)?,
                    q(ONE)?,
                ];
                transform.translation = [q(100 * ONE)?, q(0)?, q(0)?];
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn camera_position_must_lie_inside_the_trace_domain() -> TestResult {
    let limit = GEORDI_RAY_TRACED_TRACE_DOMAIN_UNITS * ONE;
    let code = Some(GEORDI_E_RT_TRACE_DOMAIN_EXCEEDED);
    for axis in 0..3 {
        for (value, expected) in [
            (limit - 1, None),
            (limit, code),
            (-limit + 1, None),
            (-limit, code),
        ] {
            check(
                |scene| {
                    scene.camera.position[axis] = q(value)?;
                    Ok(())
                },
                expected,
            )?;
        }
    }
    Ok(())
}

#[test]
fn camera_up_must_not_be_parallel_to_forward() -> TestResult {
    let code = Some(GEORDI_E_RT_CAMERA_DEGENERATE);
    for (up, expected) in [
        ([0, ONE / 4, ONE], code),
        ([0, -ONE / 2, -2 * ONE], code),
        // One raw unit off parallel: the sine is about 2^-32, below the 2^-15 floor.
        ([0, ONE / 4 + 1, ONE], code),
        ([ONE, 0, 0], None),
    ] {
        check(
            |scene| {
                scene.camera.up = [q(up[0])?, q(up[1])?, q(up[2])?];
                Ok(())
            },
            expected,
        )?;
    }
    Ok(())
}

#[test]
fn declared_but_unused_requirements_are_accepted() -> TestResult {
    check(
        |scene| {
            scene.lights.remove(0);
            Ok(())
        },
        None,
    )
}

#[test]
fn versioned_identity_form() {
    for accepted in ["a/1", "a.b-c/12", "0x/9", "fixture-placeholder-sampler/1"] {
        assert!(is_versioned_identity(accepted), "{accepted}");
    }
    for rejected in [
        "", "a", "/1", "a/", "a/0", "a/01", "A/1", "-a/1", "a/1/2", "a b/1", "a/1a",
    ] {
        assert!(!is_versioned_identity(rejected), "{rejected}");
    }
}

#[test]
fn image_hash_matches_independent_test_vectors() {
    // Oracle: Python hashlib.sha256 over the same bytes.
    assert_eq!(
        geordi_ray_traced_image_hash(&[0, 0, 0, 255]),
        "sha256:e3820096cb82366b860b8a4e668453a7aaaf423af03bdf289fa308ea03a79332"
    );
    assert_eq!(
        geordi_ray_traced_image_hash(&[255, 0, 0, 255, 0, 255, 0, 255]),
        "sha256:8e56467a23ff16f4059b738417081abf48600e4d0d9958217178f2d5d4ca93f8"
    );
}

fn test_runtime() -> GeordiRayTracedReceiptRuntime {
    GeordiRayTracedReceiptRuntime {
        name: "test-runtime".to_owned(),
        version: "0.0.0".to_owned(),
        bunny_revision: "0000000".to_owned(),
    }
}

const TEST_IMAGE_HASH: &str =
    "sha256:e3820096cb82366b860b8a4e668453a7aaaf423af03bdf289fa308ea03a79332";

/// Golden canonical receipt, written by hand from the design's field list.
const GOLDEN_RECEIPT: &str = r#"{
  "assets": [
    {
      "id": "unit-quad",
      "layout": "bunny-ply-binary-le-f32/1",
      "path": "meshes/unit-quad.ply",
      "sha256": "sha256:caca8649845effd4c3512ff53312877856be1733554d4c7b42dc3c2b0cd35230"
    }
  ],
  "hashAlgorithm": "sha256",
  "image": {
    "encoding": "geordi-rgba8-srgb-opaque/1",
    "height": 36,
    "imageHash": "sha256:e3820096cb82366b860b8a4e668453a7aaaf423af03bdf289fa308ea03a79332",
    "pixelFormat": "rgba8",
    "width": 64
  },
  "integrator": "geordi-rt-diffuse-path/1",
  "maxBounces": 1,
  "numericProfile": "geordi-fixed-q32.32/1",
  "output": "geordi-rgba8-srgb-opaque/1",
  "receiptVersion": "geordi-ray-traced-render-receipt/1",
  "reconstruction": "geordi-box-filter/1",
  "runtime": {
    "bunnyRevision": "0000000",
    "name": "test-runtime",
    "version": "0.0.0"
  },
  "sampler": "fixture-placeholder-sampler/1",
  "samplesPerPixel": 16,
  "sceneHash": "sha256:5ea6b6085b5178fcda09fc966737e44cd5c731ed311e4fcd601ddf935a480a24",
  "scenePath": "fixtures/ray-traced-scene/reference.rt-scene.geordi.json",
  "sceneVersion": "geordi-ray-traced-scene/1",
  "seed": 0,
  "toneCurve": "fixture-placeholder-tone-curve/1"
}
"#;

fn reference_receipt() -> Result<GeordiRayTracedRenderReceipt, Box<dyn Error>> {
    Ok(create_geordi_ray_traced_render_receipt(
        &reference_source()?,
        "fixtures/ray-traced-scene/reference.rt-scene.geordi.json",
        test_runtime(),
        64,
        36,
        TEST_IMAGE_HASH,
    )?)
}

#[test]
fn receipt_matches_the_golden_canonical_bytes_and_round_trips() -> TestResult {
    let receipt = reference_receipt()?;
    let canonical = geordi_ray_traced_render_receipt_canonical_json(&receipt)?;
    assert_eq!(canonical, GOLDEN_RECEIPT);
    let parsed = parse_geordi_ray_traced_render_receipt(&canonical)?;
    validate_geordi_ray_traced_render_receipt(&parsed)?;
    assert_eq!(parsed, receipt);
    assert_eq!(
        geordi_ray_traced_render_receipt_hash(&receipt)?,
        geordi_sha256_from_bytes(GOLDEN_RECEIPT.as_bytes())
    );
    Ok(())
}

#[test]
fn receipt_hash_distinguishes_image_shape_with_equal_image_hash() -> TestResult {
    let receipt = reference_receipt()?;
    let mut transposed = receipt.clone();
    transposed.image.width = receipt.image.height;
    transposed.image.height = receipt.image.width;
    assert_eq!(transposed.image.image_hash, receipt.image.image_hash);
    assert_ne!(
        geordi_ray_traced_render_receipt_hash(&transposed)?,
        geordi_ray_traced_render_receipt_hash(&receipt)?
    );
    Ok(())
}

#[test]
fn receipt_requires_the_image_size_to_equal_the_film() -> TestResult {
    let source = reference_source()?;
    for (width, height) in [(36, 64), (63, 36), (64, 37)] {
        let error = create_geordi_ray_traced_render_receipt(
            &source,
            "scene.rt-scene.geordi.json",
            test_runtime(),
            width,
            height,
            TEST_IMAGE_HASH,
        )
        .err()
        .ok_or("mismatched viewport was accepted")?;
        assert_eq!(
            issue_codes(&error),
            vec![(
                GEORDI_E_RT_VIEWPORT_MISMATCH.to_owned(),
                "$.film".to_owned()
            )]
        );
    }
    Ok(())
}

#[test]
fn receipt_validation_rejects_field_and_shape_violations() -> TestResult {
    let mut receipt = reference_receipt()?;
    receipt.image.encoding = "geordi-rgba16-linear/1".to_owned();
    let error = validate_geordi_ray_traced_render_receipt(&receipt)
        .err()
        .ok_or("mismatched encoding was accepted")?;
    assert_eq!(
        issue_codes(&error),
        vec![(
            GEORDI_E_RT_RECEIPT_FIELD_INVALID.to_owned(),
            "$.image.encoding".to_owned()
        )]
    );
    let extra = GOLDEN_RECEIPT.replacen("{\n", "{\n  \"pngHash\": \"sha256:00\",\n", 1);
    let error = parse_geordi_ray_traced_render_receipt(&extra)
        .err()
        .ok_or("unknown receipt field was accepted")?;
    assert_eq!(issue_codes(&error)[0].0, GEORDI_E_RT_RECEIPT_SHAPE);
    Ok(())
}

#[test]
fn camera_up_sine_to_forward_is_at_least_two_to_the_minus_15() -> TestResult {
    // forward = (0, 0, 1) and up = (a, 0, 1) have sine a / sqrt(a^2 + 2^64), so `a = 2^17` is
    // just below 2^-15 (refused) and `a = 2^17 + 1` is just above it (accepted).
    let code = Some(GEORDI_E_RT_CAMERA_DEGENERATE);
    for (a, expected) in [
        (1_i64 << 17, code),
        ((1 << 17) + 1, None),
        (-(1 << 17), code),
        (-((1 << 17) + 1), None),
        (1 << 16, code),
    ] {
        check(
            |scene| {
                scene.camera.forward = [q(0)?, q(0)?, q(ONE)?];
                scene.camera.up = [q(a)?, q(0)?, q(ONE)?];
                Ok(())
            },
            expected,
        )?;
    }
    // The largest components do not overflow the exact comparison.
    let max = (1_i64 << 53) - 1;
    check(
        |scene| {
            scene.camera.forward = [q(max)?, q(max)?, q(max)?];
            scene.camera.up = [q(-max)?, q(-max)?, q(-max)?];
            Ok(())
        },
        code,
    )?;
    check(
        |scene| {
            scene.camera.forward = [q(max)?, q(0)?, q(0)?];
            scene.camera.up = [q(0)?, q(max)?, q(0)?];
            Ok(())
        },
        None,
    )
}

#[test]
fn a_scene_needs_at_least_one_triangle() -> TestResult {
    let code = Some(GEORDI_E_RT_SCENE_EMPTY);
    check(
        |scene| {
            scene.instances.clear();
            Ok(())
        },
        code,
    )?;
    check(
        |scene| {
            scene.meshes[0].counts.triangles = 0;
            Ok(())
        },
        code,
    )?;
    check(
        |scene| {
            scene.meshes[0].counts.triangles = 1;
            Ok(())
        },
        None,
    )
}

#[test]
fn an_integer_token_beyond_u64_or_i64_is_out_of_range_not_a_float() -> TestResult {
    // `serde_json` reads an integer token that fits neither i64 nor u64 as a float, so the
    // validator must read the token itself to say "out of range" rather than "not an integer".
    let source = reference_source()?;
    for token in [
        "18446744073709551615",
        "18446744073709551616",
        "99999999999999999999999999",
        "-9223372036854775808",
        "-9223372036854775809",
        "-99999999999999999999999999",
    ] {
        let changed = source.replace("\"seed\": 0", &format!("\"seed\": {token}"));
        assert_ne!(changed, source);
        let error = parse_geordi_ray_traced_scene(&changed)
            .err()
            .ok_or("an out-of-range integer was accepted")?;
        assert_eq!(
            issue_codes(&error),
            vec![(
                GEORDI_E_RT_NUMBER_OUT_OF_RANGE.to_owned(),
                "$.render.seed".to_owned()
            )],
            "{token}"
        );
    }
    // Tokens that are not integers stay NOT_INTEGER, however large.
    for token in [
        "1e30",
        "1.0",
        "-0",
        "18446744073709551616.0",
        "18446744073709551616e0",
    ] {
        let changed = source.replace("\"seed\": 0", &format!("\"seed\": {token}"));
        let error = parse_geordi_ray_traced_scene(&changed)
            .err()
            .ok_or("a float was accepted")?;
        assert_eq!(
            issue_codes(&error),
            vec![(
                GEORDI_E_RT_NUMBER_NOT_INTEGER.to_owned(),
                "$.render.seed".to_owned()
            )],
            "{token}"
        );
    }
    Ok(())
}

#[test]
fn an_oversized_integer_token_is_found_by_path_among_strings_and_arrays() -> TestResult {
    // The id holds a quote, a backslash and a digit run, which the token scan must not read as
    // numbers or as the end of the string. The oversized token sits in an array inside an array
    // element.
    let source = reference_source()?
        .replacen(
            "\"ground\"",
            r#""g\"1\\\\2\\u0041 99999999999999999999""#,
            1,
        )
        .replacen(
            "          0\n        ]\n      }\n    },",
            "          123456789012345678901234567890\n        ]\n      }\n    },",
            1,
        );
    let error = parse_geordi_ray_traced_scene(&source)
        .err()
        .ok_or("an out-of-range integer was accepted")?;
    assert_eq!(
        issue_codes(&error),
        vec![(
            GEORDI_E_RT_NUMBER_OUT_OF_RANGE.to_owned(),
            "$.instances[0].worldFromMesh.translation[2]".to_owned()
        )]
    );
    Ok(())
}

// Each test below kills a validator mutation that the suite did not catch before
// flyingrobots/geordi#167: the named line of the validator can be removed or neutered and every
// earlier test still passed.

#[test]
fn every_used_feature_must_be_required() -> TestResult {
    // Kills: dropping `mesh.triangle` or `instance.affine3` from `used_features`.
    let code = Some(GEORDI_E_RT_REQUIREMENT_MISSING);
    for feature in [
        GEORDI_RAY_TRACED_3D_PROFILE,
        GEORDI_RAY_TRACED_FEATURE_ASSET_MESH,
        GEORDI_RAY_TRACED_FEATURE_MESH_TRIANGLE,
        GEORDI_RAY_TRACED_FEATURE_INSTANCE_AFFINE3,
        GEORDI_RAY_TRACED_FEATURE_CAMERA_PINHOLE,
        GEORDI_RAY_TRACED_FEATURE_MATERIAL_DIFFUSE,
        GEORDI_RAY_TRACED_FEATURE_LIGHT_DIRECTIONAL,
        GEORDI_RAY_TRACED_FEATURE_LIGHT_UNIFORM_SKY,
    ] {
        check(
            |scene| {
                let before = scene.requires.len();
                scene.requires.retain(|requirement| requirement != feature);
                assert_eq!(
                    scene.requires.len() + 1,
                    before,
                    "{feature} was not required"
                );
                Ok(())
            },
            code,
        )?;
    }
    Ok(())
}

#[test]
fn light_ids_must_be_unique() -> TestResult {
    // Kills: skipping the uniqueness check for lights.
    check(
        |scene| {
            let first = scene.lights[0].id.clone();
            scene.lights[1].id = first;
            Ok(())
        },
        Some(GEORDI_E_RT_ID_DUPLICATE),
    )
}

#[test]
fn instance_ids_must_be_unique() -> TestResult {
    // Kills: skipping the uniqueness check for instances.
    check(
        |scene| {
            let first = scene.instances[0].id.clone();
            scene.instances[1].id = first;
            Ok(())
        },
        Some(GEORDI_E_RT_ID_DUPLICATE),
    )
}

#[test]
fn mesh_ids_must_be_unique() -> TestResult {
    // Kills: skipping the uniqueness check for meshes. With a duplicate id an instance's mesh
    // lookup would silently pick the first declaration.
    check(
        |scene| {
            let copy = scene.meshes[0].clone();
            scene.meshes.push(copy);
            Ok(())
        },
        Some(GEORDI_E_RT_ID_DUPLICATE),
    )
}

#[test]
fn receipt_validation_rejects_an_unsupported_asset_layout() -> TestResult {
    // Kills: removing the receipt's asset-layout check.
    let mut receipt = reference_receipt()?;
    receipt.assets[0].layout = "bunny-ply-binary-le-f64/1".to_owned();
    let error = validate_geordi_ray_traced_render_receipt(&receipt)
        .err()
        .ok_or("an unsupported asset layout was accepted")?;
    assert_eq!(
        issue_codes(&error),
        vec![(
            GEORDI_E_RT_RECEIPT_FIELD_INVALID.to_owned(),
            "$.assets[0].layout".to_owned()
        )]
    );
    Ok(())
}

#[test]
fn receipt_validation_checks_the_seed_range() -> TestResult {
    // Kills: removing the receipt's seed-range check.
    let max = GEORDI_RAY_TRACED_SEED_MAX;
    for (seed, accepted) in [(-1, false), (0, true), (max, true), (max + 1, false)] {
        let mut receipt = reference_receipt()?;
        receipt.seed = seed;
        let result = validate_geordi_ray_traced_render_receipt(&receipt);
        if accepted {
            result?;
        } else {
            let error = result.err().ok_or("an out-of-range seed was accepted")?;
            assert_eq!(
                issue_codes(&error),
                vec![(
                    GEORDI_E_RT_RECEIPT_FIELD_INVALID.to_owned(),
                    "$.seed".to_owned()
                )],
                "{seed}"
            );
        }
    }
    Ok(())
}

/// Independent oracle for non-ASCII text. Python 3:
/// `d["id"] = "geordi:ray-traced-scene:é\u0001\"\\/\x7f 😀😀"` on the reference scene, then
/// `hashlib.sha256((json.dumps(d, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode())`.
/// Python's default `ensure_ascii=True` would escape every non-ASCII character and give a different
/// digest; the profile fixes the raw form.
const NON_ASCII_SCENE_HASH: &str =
    "sha256:f9c1feacc27fe04175e332c7a09afca8158fce446afad45430e9a9e450d42dd7";

#[test]
fn canonical_bytes_write_non_ascii_raw_and_escape_only_quote_backslash_and_controls() -> TestResult
{
    let source = reference_source()?;
    let with_id = |literal: &str| {
        source.replacen(
            "\"geordi:ray-traced-scene:reference\"",
            &format!("\"geordi:ray-traced-scene:{literal}\""),
            1,
        )
    };
    // The same text spelled with raw characters, with `\u` escapes and with a surrogate pair, and
    // with the solidus escaped, must give one canonical form.
    let spellings = [
        with_id("é\\u0001\\\"\\\\/\u{7f}\u{2028}😀😀"),
        with_id("\\u00e9\\u0001\\\"\\\\\\/\\u007f\\u2028\\ud83d\\ude00\\ud83d\\ude00"),
    ];
    for spelling in &spellings {
        let canonical = geordi_ray_traced_scene_canonical_json(spelling)?;
        assert!(
            canonical.contains(
                "\"id\": \"geordi:ray-traced-scene:é\\u0001\\\"\\\\/\u{7f}\u{2028}😀😀\""
            ),
            "{canonical}"
        );
        assert_eq!(
            geordi_ray_traced_scene_hash(spelling)?,
            NON_ASCII_SCENE_HASH
        );
    }
    // Short escapes for the five control characters that have them; lower-case hex otherwise.
    let canonical =
        geordi_ray_traced_scene_canonical_json(&with_id("\\b\\f\\n\\r\\t\\u001f\\u000B"))?;
    assert!(canonical.contains("\"geordi:ray-traced-scene:\\b\\f\\n\\r\\t\\u001f\\u000b\""));
    Ok(())
}

/// Hash of the reference scene after `mutate` edits its JSON value.
fn hash_after(mutate: impl FnOnce(&mut Value)) -> Result<String, Box<dyn Error>> {
    let mut value: Value = serde_json::from_str(&reference_source()?)?;
    mutate(&mut value);
    Ok(geordi_ray_traced_scene_hash(&serde_json::to_string(
        &value,
    )?)?)
}

#[test]
fn scenes_that_render_alike_but_are_written_differently_have_different_hashes() -> TestResult {
    // The profile states that identity is the canonical bytes and nothing is normalized: array
    // order, the order of `requires`, and the spelling of a mesh path all change `sceneHash`.
    let reference = geordi_ray_traced_scene_hash(&reference_source()?)?;
    assert_eq!(hash_after(|_| {})?, reference);
    for (name, hash) in [
        (
            "lights reversed",
            hash_after(|v| {
                if let Some(items) = v["lights"].as_array_mut() {
                    items.reverse();
                }
            })?,
        ),
        (
            "instances reversed",
            hash_after(|v| {
                if let Some(items) = v["instances"].as_array_mut() {
                    items.reverse();
                }
            })?,
        ),
        (
            "requires reversed",
            hash_after(|v| {
                if let Some(items) = v["requires"].as_array_mut() {
                    items.reverse();
                }
            })?,
        ),
        (
            "mesh path spelled with ./",
            hash_after(|v| v["meshes"][0]["path"] = Value::from("./meshes/unit-quad.ply"))?,
        ),
        (
            "mesh path spelled with a doubled slash",
            hash_after(|v| v["meshes"][0]["path"] = Value::from("meshes//unit-quad.ply"))?,
        ),
    ] {
        assert_ne!(hash, reference, "{name}");
    }
    // The spelled-differently scenes are still valid scenes: the validator does not normalize.
    let mut scene = reference_scene()?;
    scene.meshes[0].path = "./meshes//unit-quad.ply".to_owned();
    scene.lights.reverse();
    scene.requires.reverse();
    validate_geordi_ray_traced_scene(&scene)?;
    validate_geordi_ray_traced_scene_mesh_assets(&scene, fixture_root())?;
    Ok(())
}

#[test]
fn a_repeated_object_key_is_a_parse_error() -> TestResult {
    let source = reference_source()?.replacen("\"seed\": 0,", "\"seed\": 0,\n    \"seed\": 1,", 1);
    let error = parse_geordi_ray_traced_scene(&source)
        .err()
        .ok_or("a repeated key was accepted")?;
    assert_eq!(issue_codes(&error)[0].0, GEORDI_E_RT_SCENE_SHAPE);
    Ok(())
}

#[test]
fn a_repeated_key_does_not_leave_a_stale_integer_token_behind() -> TestResult {
    // `serde_json::Value` keeps the last value of a repeated key, so the token scan must too:
    // after `"seed": 0` comes `"seed": 1.5`, which is a fraction, not an out-of-range 0. The same
    // holds when a later value replaces a whole subtree.
    let source = reference_source()?;
    let fraction = source.replace("\"seed\": 0", "\"seed\": 0, \"seed\": 1.5");
    let subtree = source.replace(
        "\"seed\": 0",
        "\"seed\": 0, \"seed\": {\"x\": 18446744073709551616}, \"seed\": 1.5",
    );
    let big_then_small =
        source.replace("\"seed\": 0", "\"seed\": 18446744073709551616, \"seed\": 1");
    for (name, changed, code) in [
        ("fraction", fraction, GEORDI_E_RT_NUMBER_NOT_INTEGER),
        ("subtree", subtree, GEORDI_E_RT_NUMBER_NOT_INTEGER),
        ("big then small", big_then_small, GEORDI_E_RT_SCENE_SHAPE),
    ] {
        let error = parse_geordi_ray_traced_scene(&changed)
            .err()
            .ok_or("a repeated key was accepted")?;
        assert_eq!(issue_codes(&error)[0].0, code, "{name}");
    }
    // A number whose value overflows binary64 is refused by the JSON reader before the scan.
    let huge = source.replace("\"seed\": 0", &format!("\"seed\": {}", "9".repeat(400)));
    let error = parse_geordi_ray_traced_scene(&huge)
        .err()
        .ok_or("a 400-digit integer was accepted")?;
    assert_eq!(issue_codes(&error)[0].0, GEORDI_E_RT_JSON_INVALID);
    Ok(())
}
