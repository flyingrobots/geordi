//! Build and adoption layer tests for flyingrobots/geordi#170.

use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

use crate::{
    ArtifactState, BUNNY_PRIMITIVES, FRAG_ORIGIN_OVERRIDE, GLYPH_TABLE_PATH, MANIFEST_PATH,
    MANIFEST_VERSION, NAGA_VERSION, SCHEMAS, SHADER_DIR, SHADERS, ShadergenError, Stage, check,
    generate, generated_glsl_sha256, glyph_table_wgsl, run, sha256_hex, validate_wgsl, write,
};

type TestResult = Result<(), Box<dyn Error>>;

const ADR_PATH: &str = "docs/design/2026-11-bijou-surface-gpu-abi.md";
const ADR_GLYPH_TABLE_SHA256: &str =
    "7ebc92f74a57ec7744fc7ada20c886d76b4ea96c09b5005efbf0883562d62e46";

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_repo(path: &str) -> Result<String, Box<dyn Error>> {
    Ok(fs::read_to_string(repo_root().join(path))?)
}

fn shader_file(name: &str) -> Result<String, Box<dyn Error>> {
    read_repo(&format!("{SHADER_DIR}/{name}"))
}

fn manifest() -> Result<Value, Box<dyn Error>> {
    Ok(serde_json::from_str(&read_repo(MANIFEST_PATH)?)?)
}

fn text<'a>(value: &'a Value, what: &str) -> Result<&'a str, Box<dyn Error>> {
    value
        .as_str()
        .ok_or_else(|| format!("{what} must be a string").into())
}

fn list<'a>(value: &'a Value, what: &str) -> Result<&'a Vec<Value>, Box<dyn Error>> {
    value
        .as_array()
        .ok_or_else(|| format!("{what} must be an array").into())
}

/// Scratch copy of the generator inputs and checked-in outputs, removed on drop.
struct TempRepo {
    root: PathBuf,
}

impl TempRepo {
    fn new(name: &str) -> Result<Self, Box<dyn Error>> {
        let root = std::env::temp_dir().join(format!(
            "geordi-bijou-shadergen-{}-{name}",
            std::process::id()
        ));
        if root.exists() {
            fs::remove_dir_all(&root)?;
        }
        let repo = Self { root };
        copy_dir(&repo_root().join(SHADER_DIR), &repo.root.join(SHADER_DIR))?;
        copy_dir(
            &repo_root().join("fixtures/bijou-gpu/bunny"),
            &repo.root.join("fixtures/bijou-gpu/bunny"),
        )?;
        let _bytes = fs::copy(
            repo_root().join(GLYPH_TABLE_PATH),
            repo.root.join(GLYPH_TABLE_PATH),
        )?;
        Ok(repo)
    }

    fn path(&self, relative: &str) -> PathBuf {
        self.root.join(relative)
    }

    fn run(&self, args: &[&str]) -> (u8, String, String) {
        run_cli(args, &self.root)
    }
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), Box<dyn Error>> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            let _bytes = fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _unused = fs::remove_dir_all(&self.root);
    }
}

fn run_cli(args: &[&str], root: &Path) -> (u8, String, String) {
    let args: Vec<String> = args.iter().map(|arg| (*arg).to_owned()).collect();
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let code = run(&args, root, &mut stdout, &mut stderr);
    (
        code,
        String::from_utf8_lossy(&stdout).into_owned(),
        String::from_utf8_lossy(&stderr).into_owned(),
    )
}

// ---------------------------------------------------------------------------------------------
// Minimal JSON Schema validator for the keywords the message schemas use.
// ---------------------------------------------------------------------------------------------

fn type_matches(name: &str, value: &Value) -> bool {
    match name {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.is_u64() || value.is_i64(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => false,
    }
}

fn validate(schema: &Value, value: &Value, at: &str) -> Result<(), String> {
    let Some(schema) = schema.as_object() else {
        return Err(format!("{at}: schema must be an object"));
    };
    for (keyword, rule) in schema {
        match keyword.as_str() {
            "$schema" | "$id" | "title" | "description" | "x-schema-id" | "x-schema-version" => {}
            "type" => {
                let name = rule.as_str().unwrap_or_default();
                if !type_matches(name, value) {
                    return Err(format!("{at}: expected {name}, found {value}"));
                }
            }
            "const" => {
                if rule != value {
                    return Err(format!("{at}: expected {rule}, found {value}"));
                }
            }
            "enum" => {
                if !rule
                    .as_array()
                    .is_some_and(|options| options.contains(value))
                {
                    return Err(format!("{at}: {value} is not one of {rule}"));
                }
            }
            "minLength" | "maxLength" => {
                let length = value.as_str().map(|text| text.chars().count() as u64);
                let bound = rule.as_u64();
                let ok = match (keyword.as_str(), length, bound) {
                    ("minLength", Some(length), Some(bound)) => length >= bound,
                    ("maxLength", Some(length), Some(bound)) => length <= bound,
                    _ => false,
                };
                if !ok {
                    return Err(format!("{at}: {keyword} {rule} violated by {value}"));
                }
            }
            "required" => {
                for name in rule.as_array().into_iter().flatten() {
                    let name = name.as_str().unwrap_or_default();
                    if value.get(name).is_none() {
                        return Err(format!("{at}: missing required member {name}"));
                    }
                }
            }
            "properties" => {
                for (name, member_schema) in rule.as_object().into_iter().flatten() {
                    if let Some(member) = value.get(name) {
                        validate(member_schema, member, &format!("{at}.{name}"))?;
                    }
                }
            }
            "additionalProperties" => {
                if rule != &Value::Bool(false) {
                    return Err(format!(
                        "{at}: only additionalProperties false is supported"
                    ));
                }
                let known = schema.get("properties").and_then(Value::as_object);
                for name in value
                    .as_object()
                    .into_iter()
                    .flat_map(|object| object.keys())
                {
                    if !known.is_some_and(|known| known.contains_key(name)) {
                        return Err(format!("{at}: unexpected member {name}"));
                    }
                }
            }
            "items" => {
                for (index, item) in value.as_array().into_iter().flatten().enumerate() {
                    validate(rule, item, &format!("{at}[{index}]"))?;
                }
            }
            other => return Err(format!("{at}: unsupported schema keyword {other}")),
        }
    }
    Ok(())
}

/// Asserts that every line of `stream` is a JSON object that validates against the schema its
/// `_schema` member names, and returns the parsed lines.
fn validated_lines(stream: &str) -> Result<Vec<Value>, Box<dyn Error>> {
    let mut lines = Vec::new();
    for line in stream.lines() {
        let value: Value = serde_json::from_str(line)
            .map_err(|error| format!("not a JSON line ({error}): {line}"))?;
        let id = text(&value["_schema"]["id"], "_schema.id")?.to_owned();
        assert_eq!(value["_schema"]["version"], "1.0.0", "{line}");
        let (_, _, schema_text) = SCHEMAS
            .iter()
            .find(|(kind, _, _)| format!("geordi.bijou_shadergen.{kind}") == id)
            .ok_or_else(|| format!("no schema declared for {id}"))?;
        let schema: Value = serde_json::from_str(schema_text)?;
        assert_eq!(schema["x-schema-id"], id.as_str());
        validate(&schema, &value, &id)?;
        lines.push(value);
    }
    Ok(lines)
}

// ---------------------------------------------------------------------------------------------
// Adoption
// ---------------------------------------------------------------------------------------------

#[test]
fn vendored_bunny_artifacts_have_the_digests_and_commits_the_abi_record_pins() -> TestResult {
    let adr = read_repo(ADR_PATH)?;
    for primitive in &BUNNY_PRIMITIVES {
        for (path, digest, upstream) in [
            (
                primitive.wgsl_path,
                primitive.wgsl_sha256,
                primitive.upstream_wgsl_path,
            ),
            (
                primitive.vectors_path,
                primitive.vectors_sha256,
                primitive.upstream_vectors_path,
            ),
        ] {
            let bytes = fs::read(repo_root().join(path))?;
            assert_eq!(sha256_hex(&bytes), digest, "{path}");
            let row = format!("`{}` | `{upstream}` | `{digest}` |", primitive.bunny_commit);
            assert!(adr.contains(&row), "ABI record must pin {row}");
        }
        assert!(adr.contains(&format!("\"contractId\": \"{}\"", primitive.contract_id)));
    }
    Ok(())
}

#[test]
fn assembled_surface_wgsl_embeds_the_bunny_helpers_verbatim_and_the_procedural_table() -> TestResult
{
    let surface = shader_file("bijou-surface.wgsl")?;
    let kernel = shader_file("bijou-kernel-conformance.wgsl")?;
    for primitive in &BUNNY_PRIMITIVES {
        let helper = read_repo(primitive.wgsl_path)?;
        assert_eq!(
            surface.matches(helper.as_str()).count(),
            1,
            "{}",
            primitive.contract_id
        );
        assert_eq!(
            kernel.matches(helper.as_str()).count(),
            1,
            "{}",
            primitive.contract_id
        );
    }
    // The arithmetic helpers exist once: the shader adopts them and never redefines them.
    for name in [
        "fn bunny_u32_div_round_even(",
        "fn bunny_u32_ellipse_classify(",
    ] {
        assert_eq!(surface.matches(name).count(), 1, "{name}");
    }
    let table = fs::read(repo_root().join(GLYPH_TABLE_PATH))?;
    assert_eq!(sha256_hex(&table), ADR_GLYPH_TABLE_SHA256);
    assert!(surface.contains(&glyph_table_wgsl(&table)?));
    assert!(surface.contains("const BOX_GLYPHS: array<u32, 128>"));
    assert!(surface.contains("const BLOCK_GLYPHS: array<u32, 32>"));
    assert!(!kernel.contains("BOX_GLYPHS"));
    Ok(())
}

#[test]
fn glyph_table_block_carries_every_packed_entry_in_code_point_order() -> TestResult {
    let table: Value = serde_json::from_str(&read_repo(GLYPH_TABLE_PATH)?)?;
    let block = glyph_table_wgsl(read_repo(GLYPH_TABLE_PATH)?.as_bytes())?;
    let literals: Vec<u64> = block
        .split("0x")
        .skip(1)
        .filter_map(|rest| rest.split('u').next())
        .filter_map(|hex| u64::from_str_radix(hex, 16).ok())
        .collect();
    let mut expected = Vec::new();
    for section in ["boxDrawing", "blockElements"] {
        for entry in list(&table[section]["entries"], section)? {
            expected.push(entry["packedU32"].as_u64().ok_or("packedU32")?);
        }
    }
    assert_eq!(expected.len(), 160);
    assert_eq!(literals, expected);
    // U+256D, the rounded down-right corner: right and down light, rounded bit 11.
    assert_eq!(expected.get(109), Some(&0x844));
    Ok(())
}

#[test]
fn malformed_glyph_tables_are_refused() {
    for table in [
        "not json",
        r#"{"schemaVersion":"bijou-procedural-glyphs/2"}"#,
        r#"{"schemaVersion":"bijou-procedural-glyphs/1","boxDrawing":{"entries":[]}}"#,
    ] {
        let result = glyph_table_wgsl(table.as_bytes());
        assert!(
            matches!(result, Err(ShadergenError::GlyphTableInvalid { .. })),
            "{table}"
        );
    }
}

#[test]
fn a_changed_bunny_helper_is_refused_by_digest() -> TestResult {
    let repo = TempRepo::new("bunny-digest")?;
    let helper = repo.path(BUNNY_PRIMITIVES[0].wgsl_path);
    let mut bytes = fs::read(&helper)?;
    bytes.push(b'\n');
    fs::write(&helper, bytes)?;
    let result = generate(&repo.root);
    assert!(
        matches!(result, Err(ShadergenError::BunnyDigestMismatch { .. })),
        "{result:?}"
    );
    let (code, stdout, stderr) = repo.run(&["--check"]);
    assert_eq!(code, 1);
    assert_eq!(stdout, "");
    let lines = validated_lines(&stderr)?;
    assert_eq!(lines.len(), 1);
    assert_eq!(
        lines[0]["code"],
        "GEORDI_E_BIJOU_SHADERGEN_BUNNY_DIGEST_MISMATCH"
    );
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// WGSL
// ---------------------------------------------------------------------------------------------

#[test]
fn checked_in_wgsl_modules_pass_pinned_naga_validation() -> TestResult {
    for spec in &SHADERS {
        validate_wgsl(spec.id, &shader_file(spec.wgsl_file)?)?;
    }
    let broken = validate_wgsl("broken", "fn f() -> u32 { return 1.0; }");
    assert!(
        matches!(
            broken,
            Err(ShadergenError::WgslParse { .. } | ShadergenError::WgslValidation { .. })
        ),
        "{broken:?}"
    );
    Ok(())
}

#[test]
fn surface_wgsl_reads_both_textures_as_integers_and_never_as_rgba8unorm() -> TestResult {
    let surface = shader_file("bijou-surface.wgsl")?;
    assert!(surface.contains("@group(0) @binding(0) var<uniform> surface: BijouSurfaceUniforms;"));
    assert!(surface.contains("@group(0) @binding(1) var cells: texture_2d<u32>;"));
    assert!(surface.contains("@group(0) @binding(2) var glyph_atlas: texture_2d<u32>;"));
    assert_eq!(surface.matches("@binding(").count(), 3);
    for forbidden in [
        "rgba8unorm",
        "texture_2d<f32>",
        "textureSample",
        "sampler",
        "@location(0) vec4<f32>",
    ] {
        assert!(!surface.contains(forbidden), "{forbidden}");
    }
    assert!(surface.contains("textureLoad(cells, vec2<u32>(col, row), 0)"));
    assert!(surface.contains("textureLoad(glyph_atlas, vec2<u32>(sample_x, sample_y), 0)"));
    assert!(surface.contains("@builtin(vertex_index) vertex_index: u32"));
    assert!(
        !surface.contains("@location(0) position"),
        "no vertex buffers"
    );
    Ok(())
}

fn is_float(module: &naga::Module, handle: naga::Handle<naga::Type>) -> bool {
    match module.types[handle].inner {
        naga::TypeInner::Scalar(scalar)
        | naga::TypeInner::Vector { scalar, .. }
        | naga::TypeInner::Matrix { scalar, .. } => scalar.kind == naga::ScalarKind::Float,
        _ => false,
    }
}

#[test]
fn core_rendering_functions_hold_no_floating_point_value() -> TestResult {
    // The rasterizer position is the only float the fragment law may read, once.
    const EDGE: [&str; 2] = ["frag_px", "frag_py"];
    let module = naga::front::wgsl::parse_str(&shader_file("bijou-surface.wgsl")?)?;
    let mut checked = 0;
    for (_, function) in module.functions.iter() {
        let name = function.name.as_deref().unwrap_or_default();
        if EDGE.contains(&name) {
            continue;
        }
        checked += 1;
        for argument in &function.arguments {
            assert!(!is_float(&module, argument.ty), "{name}: float argument");
        }
        if let Some(result) = &function.result {
            assert!(!is_float(&module, result.ty), "{name}: float result");
        }
        for (_, local) in function.local_variables.iter() {
            assert!(!is_float(&module, local.ty), "{name}: float local");
        }
        for (_, expression) in function.expressions.iter() {
            let float = match expression {
                naga::Expression::Literal(literal) => matches!(
                    literal,
                    naga::Literal::F64(_)
                        | naga::Literal::F32(_)
                        | naga::Literal::F16(_)
                        | naga::Literal::AbstractFloat(_)
                ),
                naga::Expression::As { kind, .. } => *kind == naga::ScalarKind::Float,
                naga::Expression::Math { fun, .. } => {
                    !matches!(fun, naga::MathFunction::Min | naga::MathFunction::Max)
                }
                _ => false,
            };
            assert!(!float, "{name}: float expression {expression:?}");
        }
    }
    assert!(
        checked >= 20,
        "expected the whole pixel law, found {checked}"
    );
    assert!(
        module
            .functions
            .iter()
            .any(|(_, function)| { function.name.as_deref() == Some("shade_pixel") })
    );
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// GLSL ES 3.00
// ---------------------------------------------------------------------------------------------

#[test]
fn surface_glsl_is_es_300_with_integer_texel_fetch_and_top_left_normalization() -> TestResult {
    let fragment = shader_file("bijou-surface.frag.glsl")?;
    assert!(fragment.starts_with("#version 300 es\n"));
    assert_eq!(fragment.matches("uniform highp usampler2D ").count(), 2);
    assert_eq!(fragment.matches("sampler2D").count(), 2, "only usampler2D");
    assert!(fragment.contains("texelFetch(_group_0_binding_1_fs, ivec2(uvec2(col, row)), 0)"));
    assert!(
        fragment.contains("texelFetch(_group_0_binding_2_fs, ivec2(uvec2(sample_x, sample_y)), 0)")
    );
    assert_eq!(fragment.matches("texelFetch(").count(), 2);
    assert!(!fragment.contains("texture("));
    assert!(fragment.contains("layout(location = 0) out uvec4 "));

    // py = (canvasPxH - 1u) - uint(gl_FragCoord.y), compiled in for GLSL.
    assert!(fragment.contains(&format!("const bool {FRAG_ORIGIN_OVERRIDE} = true;")));
    let compact: String = fragment.split_whitespace().collect();
    assert!(
        compact.contains("uint_e5=_group_0_binding_0_fs.canvasPx.y;return((_e5-1u)-uint(frag_y));")
    );
    assert!(compact.contains("vec4position=gl_FragCoord;"));
    assert!(compact.contains("frag_py(position.y)"));
    // The WGSL default keeps the WebGPU top-left origin.
    assert!(
        shader_file("bijou-surface.wgsl")?
            .contains(&format!("override {FRAG_ORIGIN_OVERRIDE}: bool = false;"))
    );

    let vertex = shader_file("bijou-surface.vert.glsl")?;
    assert!(vertex.starts_with("#version 300 es\n"));
    assert!(vertex.contains("gl_VertexID"));
    for forbidden in ["uniform", "layout(location", "\nin "] {
        assert!(!vertex.contains(forbidden), "vertex stage: {forbidden}");
    }
    Ok(())
}

#[test]
fn kernel_glsl_keeps_the_branch_first_guards_of_the_bunny_helpers() -> TestResult {
    let div: String = shader_file("bijou-kernel-conformance.div-round-even.frag.glsl")?
        .split_whitespace()
        .collect();
    let guard = div
        .find("if((d==0u)){returnuvec2(0u,1u);}")
        .ok_or("d == 0 guard")?;
    let divide = div.find("(n/d)").ok_or("division")?;
    assert!(guard < divide, "the zero divisor branch must precede `/`");
    assert!(
        div.contains("uints=(d-r);"),
        "complement comparison, never 2 * r"
    );
    assert!(!div.contains("2u*r") && !div.contains("r*2u"));

    let ellipse: String = shader_file("bijou-kernel-conformance.ellipse-classify.frag.glsl")?
        .split_whitespace()
        .collect();
    let degenerate = ellipse.find("(semi_x==0u)").ok_or("semi_x == 0 branch")?;
    let polynomial = ellipse.find("uintterm_x=").ok_or("polynomial")?;
    assert!(
        degenerate < polynomial,
        "the degenerate branch must precede the polynomial"
    );
    assert!(ellipse.contains("(semi_y==0u)"));
    Ok(())
}

#[test]
#[ignore = "needs glslangValidator on PATH; CI runs it with --include-ignored"]
fn generated_glsl_passes_glslang_validator() -> TestResult {
    for spec in &SHADERS {
        for stage in spec.stages {
            let stage_name = match stage.stage {
                Stage::Vertex => "vert",
                Stage::Fragment => "frag",
            };
            let path = repo_root().join(SHADER_DIR).join(stage.glsl_file);
            let output = Command::new("glslangValidator")
                .args(["-S", stage_name])
                .arg(&path)
                .output()?;
            assert!(
                output.status.success(),
                "{}: {}{}",
                stage.glsl_file,
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Determinism, drift and manifest
// ---------------------------------------------------------------------------------------------

#[test]
fn generation_is_deterministic_and_byte_identical_to_the_checked_in_artifacts() -> TestResult {
    let first = generate(&repo_root())?;
    let second = generate(&repo_root())?;
    assert_eq!(first, second);
    assert_eq!(first.len(), 9);
    for artifact in &first {
        let on_disk = fs::read(repo_root().join(&artifact.path))?;
        assert!(on_disk == artifact.bytes, "{} drifted", artifact.path);
    }
    for status in check(&repo_root())? {
        assert_eq!(status.state, ArtifactState::Match, "{}", status.path);
    }
    Ok(())
}

#[test]
fn manifest_digests_are_the_sha256_of_the_bytes_they_name() -> TestResult {
    let manifest = manifest()?;
    assert_eq!(manifest["manifestVersion"], MANIFEST_VERSION);
    assert_eq!(manifest["gpuAbiVersion"], "bijou-surface-gpu/1");
    assert_eq!(manifest["naga"]["version"], NAGA_VERSION);
    assert_eq!(manifest["naga"]["glslOptions"]["version"], "300 es");
    assert_eq!(manifest["naga"]["glslOptions"]["isWebgl"], true);
    assert_eq!(manifest["generator"]["name"], "geordi-bijou-shadergen");
    assert_eq!(manifest["proceduralTableSha256"], ADR_GLYPH_TABLE_SHA256);

    let primitives = list(&manifest["bunnyPrimitives"], "bunnyPrimitives")?;
    assert_eq!(primitives.len(), BUNNY_PRIMITIVES.len());
    for (entry, primitive) in primitives.iter().zip(&BUNNY_PRIMITIVES) {
        assert_eq!(entry["contractId"], primitive.contract_id);
        assert_eq!(entry["bunnyCommit"], primitive.bunny_commit);
        for (path_key, digest_key) in [("wgslPath", "wgslSha256"), ("vectorsPath", "vectorsSha256")]
        {
            let bytes = fs::read(repo_root().join(text(&entry[path_key], path_key)?))?;
            assert_eq!(entry[digest_key], sha256_hex(&bytes), "{path_key}");
        }
    }

    let shaders = list(&manifest["shaders"], "shaders")?;
    assert_eq!(shaders.len(), SHADERS.len());
    for (entry, spec) in shaders.iter().zip(&SHADERS) {
        assert_eq!(entry["id"], spec.id);
        let wgsl = fs::read(repo_root().join(text(&entry["wgslPath"], "wgslPath")?))?;
        assert_eq!(entry["assembledWgslSha256"], sha256_hex(&wgsl));
        let source = &entry["authoredSource"];
        let authored = fs::read(repo_root().join(text(&source["path"], "authoredSource.path")?))?;
        assert_eq!(source["sha256"], sha256_hex(&authored));

        let stages = list(&entry["stages"], "stages")?;
        assert_eq!(stages.len(), spec.stages.len());
        let mut stage_bytes = Vec::new();
        for (stage, stage_spec) in stages.iter().zip(spec.stages) {
            assert_eq!(stage["stage"], stage_spec.stage.name());
            assert_eq!(stage["entryPoint"], stage_spec.entry_point);
            let bytes = fs::read(repo_root().join(text(&stage["path"], "stage.path")?))?;
            assert_eq!(
                stage["sha256"],
                sha256_hex(&bytes),
                "{}",
                stage_spec.glsl_file
            );
            stage_bytes.push(bytes);
        }
        let framed: Vec<(&str, &[u8])> = spec
            .stages
            .iter()
            .zip(&stage_bytes)
            .map(|(stage_spec, bytes)| (stage_spec.glsl_file, bytes.as_slice()))
            .collect();
        assert_eq!(entry["generatedGlslSha256"], generated_glsl_sha256(&framed));
    }
    assert_eq!(
        shaders[0]["pipelineConstants"][FRAG_ORIGIN_OVERRIDE], 1.0,
        "the GLSL build of the surface shader compiles in the bottom-left origin"
    );
    assert_eq!(
        generated_glsl_sha256(&[("a.glsl", b"xy"), ("b.glsl", b"")]),
        sha256_hex(b"a.glsl\n2\nxyb.glsl\n0\n")
    );
    Ok(())
}

#[test]
fn manifest_binding_map_names_the_exact_glsl_uniforms_and_uniform_layout() -> TestResult {
    let manifest = manifest()?;
    let surface = &manifest["shaders"][0];
    let fragment = shader_file("bijou-surface.frag.glsl")?;
    let bindings = list(&surface["bindings"], "bindings")?;
    assert_eq!(bindings.len(), 3, "the bind group stays at three bindings");

    let uniforms = &bindings[0];
    assert_eq!(uniforms["group"], 0);
    assert_eq!(uniforms["binding"], 0);
    assert_eq!(uniforms["kind"], "uniform-buffer");
    assert_eq!(uniforms["byteSize"], 64);
    let block = text(
        &uniforms["glslNames"]["bijou-surface.frag.glsl"],
        "uniform block name",
    )?;
    assert!(fragment.contains(&format!("layout(std140) uniform {block} {{")));
    let layout: Vec<(String, String, u64)> = list(&uniforms["members"], "members")?
        .iter()
        .map(|member| {
            (
                member["name"].as_str().unwrap_or_default().to_owned(),
                member["wgslType"].as_str().unwrap_or_default().to_owned(),
                member["byteOffset"].as_u64().unwrap_or(u64::MAX),
            )
        })
        .collect();
    let expected = [
        ("canvasPx", "vec2<u32>", 0),
        ("cellPx", "vec2<u32>", 8),
        ("gridCells", "vec2<u32>", 16),
        ("atlasCols", "u32", 24),
        ("defaultFg", "vec3<u32>", 32),
        ("defaultBg", "vec3<u32>", 48),
        ("flags", "u32", 60),
    ]
    .map(|(name, ty, offset)| (name.to_owned(), ty.to_owned(), offset));
    assert_eq!(layout, expected);

    for (binding, wgsl_name, format) in [
        (&bindings[1], "cells", "rgba32uint"),
        (&bindings[2], "glyph_atlas", "rgba8uint"),
    ] {
        assert_eq!(binding["kind"], "texture");
        assert_eq!(binding["wgslName"], wgsl_name);
        assert_eq!(binding["textureFormat"], format);
        assert_eq!(binding["glslType"], "usampler2D");
        let name = text(
            &binding["glslNames"]["bijou-surface.frag.glsl"],
            "sampler name",
        )?;
        assert!(fragment.contains(&format!("uniform highp usampler2D {name};")));
    }
    for binding in bindings {
        assert_eq!(binding["glslNames"]["bijou-surface.vert.glsl"], Value::Null);
    }

    let kernel = &manifest["shaders"][1];
    let kernel_bindings = list(&kernel["bindings"], "kernel bindings")?;
    assert_eq!(kernel_bindings.len(), 1);
    for stage in ["transport-canary", "div-round-even", "ellipse-classify"] {
        let file = format!("bijou-kernel-conformance.{stage}.frag.glsl");
        let name = text(&kernel_bindings[0]["glslNames"][&file], "kernel sampler")?;
        assert!(shader_file(&file)?.contains(&format!("uniform highp usampler2D {name};")));
    }
    Ok(())
}

#[test]
fn pinned_naga_version_is_exact_in_the_crate_manifest_and_the_lockfile() -> TestResult {
    let cargo = read_repo("crates/geordi-bijou-shadergen/Cargo.toml")?;
    assert!(cargo.contains(&format!(
        "naga = {{ version = \"={NAGA_VERSION}\", default-features = false, features = [\"wgsl-in\", \"glsl-out\"] }}"
    )));
    let lock = read_repo("Cargo.lock")?;
    assert!(lock.contains(&format!("name = \"naga\"\nversion = \"{NAGA_VERSION}\"\n")));
    assert_eq!(lock.matches("name = \"naga\"\n").count(), 1);
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

#[test]
fn check_passes_on_the_checked_in_artifacts() -> TestResult {
    let (code, stdout, stderr) = run_cli(&["--check"], &repo_root());
    assert_eq!(code, 0, "{stderr}");
    assert_eq!(stderr, "");
    let lines = validated_lines(&stdout)?;
    assert_eq!(lines.len(), 10);
    for line in &lines[..9] {
        assert_eq!(line["kind"], "artifact");
        assert_eq!(line["state"], "match");
    }
    assert_eq!(lines[9]["kind"], "result");
    assert_eq!(lines[9]["artifacts"], 9);
    Ok(())
}

#[test]
fn check_reports_drift_and_missing_files_and_writes_nothing() -> TestResult {
    let repo = TempRepo::new("drift")?;
    let fragment = repo.path(&format!("{SHADER_DIR}/bijou-surface.frag.glsl"));
    let tampered =
        fs::read_to_string(&fragment)?.replace("- 1u) - uint(frag_y)", "- 0u) - uint(frag_y)");
    fs::write(&fragment, &tampered)?;
    fs::remove_file(repo.path(MANIFEST_PATH))?;

    let (code, stdout, stderr) = repo.run(&["--check"]);
    assert_eq!(code, 1);
    let states: Vec<(String, String)> = validated_lines(&stdout)?
        .iter()
        .map(|line| {
            (
                line["path"].as_str().unwrap_or_default().to_owned(),
                line["state"].as_str().unwrap_or_default().to_owned(),
            )
        })
        .collect();
    assert_eq!(states.len(), 9, "no result line on failure");
    let drifted = format!("{SHADER_DIR}/bijou-surface.frag.glsl");
    for (path, state) in &states {
        let expected = if *path == drifted {
            "drift"
        } else if path == MANIFEST_PATH {
            "missing"
        } else {
            "match"
        };
        assert_eq!(state, expected, "{path}");
    }
    let errors = validated_lines(&stderr)?;
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0]["code"], "GEORDI_E_BIJOU_SHADERGEN_DRIFT");
    assert_eq!(
        errors[0]["paths"],
        serde_json::json!([drifted, MANIFEST_PATH])
    );
    assert_eq!(
        fs::read_to_string(&fragment)?,
        tampered,
        "--check must not write"
    );
    assert!(!repo.path(MANIFEST_PATH).exists(), "--check must not write");

    // An authored source edit drifts the assembled WGSL, its GLSL and the manifest.
    let repo = TempRepo::new("source-drift")?;
    let source = repo.path(&format!("{SHADER_DIR}/src/bijou-surface.main.wgsl"));
    let edited = fs::read_to_string(&source)?.replace("(h * 88u) / 100u", "(h * 87u) / 100u");
    fs::write(&source, edited)?;
    let (code, _, stderr) = repo.run(&["--check"]);
    assert_eq!(code, 1);
    assert_eq!(
        validated_lines(&stderr)?[0]["paths"],
        serde_json::json!([
            format!("{SHADER_DIR}/bijou-surface.wgsl"),
            format!("{SHADER_DIR}/bijou-surface.frag.glsl"),
            MANIFEST_PATH
        ])
    );
    Ok(())
}

#[test]
fn write_restores_drifted_artifacts_and_is_idempotent() -> TestResult {
    let repo = TempRepo::new("write")?;
    for spec in &SHADERS {
        fs::remove_file(repo.path(&format!("{SHADER_DIR}/{}", spec.wgsl_file)))?;
    }
    let written: Vec<ArtifactState> = write(&repo.root)?
        .iter()
        .map(|status| status.state)
        .collect();
    assert_eq!(
        written
            .iter()
            .filter(|state| **state == ArtifactState::Written)
            .count(),
        2
    );
    assert!(
        write(&repo.root)?
            .iter()
            .all(|status| status.state == ArtifactState::Unchanged)
    );
    for artifact in generate(&repo_root())? {
        assert!(
            fs::read(repo.path(&artifact.path))? == artifact.bytes,
            "{}",
            artifact.path
        );
    }
    let (code, stdout, stderr) = repo.run(&["--write"]);
    assert_eq!((code, stderr.as_str()), (0, ""));
    assert_eq!(validated_lines(&stdout)?.len(), 10);
    Ok(())
}

#[test]
fn every_help_schema_and_usage_line_validates_against_its_declared_schema() -> TestResult {
    let (code, stdout, stderr) = run_cli(&["--help"], &repo_root());
    assert_eq!((code, stderr.as_str()), (0, ""));
    let help = validated_lines(&stdout)?;
    assert_eq!(help[0]["kind"], "help");
    let described: Vec<&str> = help[1..]
        .iter()
        .filter_map(|line| line["describes"]["id"].as_str())
        .collect();
    assert_eq!(
        described,
        [
            "geordi.bijou_shadergen.artifact",
            "geordi.bijou_shadergen.result",
            "geordi.bijou_shadergen.error"
        ]
    );

    let (code, stdout, stderr) = run_cli(&["--schema"], &repo_root());
    assert_eq!((code, stderr.as_str()), (0, ""));
    let schemas = validated_lines(&stdout)?;
    assert_eq!(schemas.len(), SCHEMAS.len());
    for (line, (kind, stream, schema_text)) in schemas.iter().zip(&SCHEMAS) {
        let schema: Value = serde_json::from_str(schema_text)?;
        assert_eq!(line["schema"], schema, "{kind}");
        assert_eq!(line["stream"], *stream);
        assert_eq!(
            fs::read_to_string(
                repo_root().join(format!("schemas/geordi-bijou-shadergen/{kind}.schema.json"))
            )?,
            *schema_text
        );
    }
    let error_schema: Value = serde_json::from_str(SCHEMAS[2].2)?;
    assert_eq!(
        error_schema["properties"]["code"]["enum"],
        serde_json::json!(ShadergenError::CODES),
        "the error schema lists every error code"
    );

    for args in [
        &[][..],
        &["--frobnicate"],
        &["--check", "--write"],
        &["--check", "--repo-root"],
    ] {
        let (code, stdout, stderr) = run_cli(args, &repo_root());
        assert_eq!(code, 2, "{args:?}");
        assert_eq!(stdout, "");
        let errors = validated_lines(&stderr)?;
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0]["code"], "GEORDI_E_BIJOU_SHADERGEN_USAGE");
    }

    let (code, _, stderr) = run_cli(&["--check", "--repo-root", "does/not/exist"], &repo_root());
    assert_eq!(code, 1);
    assert_eq!(
        validated_lines(&stderr)?[0]["code"],
        "GEORDI_E_BIJOU_SHADERGEN_IO"
    );
    Ok(())
}

#[test]
fn human_flag_switches_every_stream_to_prose() {
    for args in [
        &["--check", "--human"][..],
        &["--humanize", "--help"],
        &["--schema", "--human"],
    ] {
        let (code, stdout, _) = run_cli(args, &repo_root());
        assert_eq!(code, 0, "{args:?}");
        assert_ne!(stdout, "");
        let first = stdout.lines().next().unwrap_or_default();
        assert!(
            serde_json::from_str::<Value>(first).is_err(),
            "{args:?}: {first}"
        );
    }
    let (code, stdout, stderr) = run_cli(&["--human"], &repo_root());
    assert_eq!((code, stdout.as_str()), (2, ""));
    assert!(stderr.starts_with("error [GEORDI_E_BIJOU_SHADERGEN_USAGE]: "));
}
