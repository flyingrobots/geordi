//! Tests for the public-item snapshot of flyingrobots/geordi#217.

use std::collections::BTreeMap;
use std::error::Error;

use serde_json::Value;

use crate::{ApiError, ApiItem, SCHEMAS, public_items, run};

type TestResult = Result<(), Box<dyn Error>>;

fn items(source: &str) -> Result<BTreeMap<String, ApiItem>, Box<dyn Error>> {
    Ok(public_items(source)?
        .into_iter()
        .map(|item| (item.key.clone(), item))
        .collect())
}

fn item<'a>(map: &'a BTreeMap<String, ApiItem>, key: &str) -> Result<&'a ApiItem, Box<dyn Error>> {
    map.get(key)
        .ok_or_else(|| format!("missing {key}; have {:?}", map.keys().collect::<Vec<_>>()).into())
}

#[test]
fn public_functions_are_captured_and_private_ones_are_not() -> TestResult {
    let map = items(
        "pub fn parse(source: &str) -> Result<u8, String> { Ok(0) }\n\
         fn helper() {}\n\
         pub(crate) fn internal() {}\n",
    )?;
    let parse = item(&map, "fn parse")?;
    assert!(
        parse.signature.contains("source : & str"),
        "{}",
        parse.signature
    );
    assert!(
        parse.signature.contains("Result < u8 , String >"),
        "{}",
        parse.signature
    );
    assert!(!map.contains_key("fn helper"));
    assert!(!map.contains_key("fn internal"));
    Ok(())
}

#[test]
fn a_renamed_function_is_a_removed_key_and_an_added_key() -> TestResult {
    let before = items("pub fn demo_parse() {}\n")?;
    let after = items("pub fn demo_decode() {}\n")?;
    assert!(before.contains_key("fn demo_parse") && !after.contains_key("fn demo_parse"));
    assert!(after.contains_key("fn demo_decode"));
    Ok(())
}

#[test]
fn struct_fields_carry_their_types_but_not_their_docs_or_attributes() -> TestResult {
    let documented = items(
        "/// A light.\n\
         #[derive(Clone, Debug)]\n\
         pub struct Light {\n\
             /// The kind.\n\
             pub kind: String,\n\
             #[serde(default)]\n\
             pub radiance: [i64; 3],\n\
         }\n",
    )?;
    let bare = items(
        "#[derive(Clone, Debug)] pub struct Light { pub kind: String, pub radiance: [i64; 3] }",
    )?;
    assert_eq!(documented, bare);
    assert_eq!(
        item(&documented, "field Light.radiance")?.signature,
        "[i64 ; 3]"
    );
    let light = item(&documented, "struct Light")?;
    assert!(!light.non_exhaustive);
    assert_eq!(light.fields_all_public, Some(true));
    Ok(())
}

#[test]
fn a_private_field_and_non_exhaustive_are_recorded() -> TestResult {
    let map = items(
        "#[non_exhaustive] pub struct Open { pub a: u8 }\n\
         pub struct Sealed { pub a: u8, b: u8 }\n",
    )?;
    assert!(item(&map, "struct Open")?.non_exhaustive);
    assert_eq!(item(&map, "struct Sealed")?.fields_all_public, Some(false));
    assert!(!map.contains_key("field Sealed.b"));
    Ok(())
}

#[test]
fn enum_variants_carry_their_fields_without_docs() -> TestResult {
    let map = items(
        "pub enum Value {\n\
             /// Irradiance.\n\
             Irradiance([i64; 3]),\n\
             Named { /// doc\n x: u8 },\n\
         }\n",
    )?;
    assert_eq!(
        item(&map, "variant Value::Irradiance")?.signature,
        "([i64 ; 3])"
    );
    assert_eq!(item(&map, "variant Value::Named")?.signature, "{ x : u8 }");
    assert!(!item(&map, "enum Value")?.non_exhaustive);
    Ok(())
}

#[test]
fn string_constants_expose_their_value() -> TestResult {
    let map = items(
        "/// Diagnostic.\n\
         pub const GEORDI_E_DEMO: &str = \"GEORDI_E_DEMO\";\n\
         pub const LIMIT: i64 = 65_536 << 32;\n",
    )?;
    let code = item(&map, "const GEORDI_E_DEMO")?;
    assert_eq!(code.string_value.as_deref(), Some("GEORDI_E_DEMO"));
    assert_eq!(code.signature, "& str = \"GEORDI_E_DEMO\"");
    let limit = item(&map, "const LIMIT")?;
    assert_eq!(limit.string_value, None);
    assert_eq!(limit.signature, "i64 = 65_536 << 32");
    Ok(())
}

#[test]
fn a_derived_and_a_hand_written_trait_impl_have_the_same_key() -> TestResult {
    let derived = items("#[derive(Deserialize)] pub struct Light { pub id: String }")?;
    let manual = items(
        "pub struct Light { pub id: String }\n\
         impl<'de> Deserialize<'de> for Light {\n\
             fn deserialize<D>(d: D) -> Result<Self, D::Error> where D: Deserializer<'de> { todo!() }\n\
         }\n",
    )?;
    assert!(derived.contains_key("impl Deserialize for Light"));
    assert_eq!(derived, manual);
    Ok(())
}

#[test]
fn trait_impls_for_private_types_are_ignored() -> TestResult {
    let map = items("#[derive(Debug)] struct Raw { a: u8 }\nimpl Display for Raw {}\n")?;
    assert!(map.is_empty(), "{map:?}");
    Ok(())
}

#[test]
fn public_inherent_methods_are_captured() -> TestResult {
    let map = items(
        "pub struct Error { issues: Vec<u8> }\n\
         impl Error {\n\
             /// Issues.\n\
             #[must_use]\n\
             pub fn issues(&self) -> &[u8] { &self.issues }\n\
             fn single() -> Self { todo!() }\n\
         }\n",
    )?;
    assert_eq!(
        item(&map, "method Error::issues")?.signature,
        "fn issues (& self) -> & [u8]"
    );
    assert!(!map.contains_key("method Error::single"));
    Ok(())
}

#[test]
fn reexports_name_their_source_path() -> TestResult {
    let map = items(
        "pub use ray_traced_scene::{GeordiRayTracedLight, inner::Thing as Renamed};\n\
         pub use other::*;\n\
         use private::Hidden;\n",
    )?;
    let light = item(&map, "use GeordiRayTracedLight")?;
    assert_eq!(
        light.reexport_from.as_deref(),
        Some("ray_traced_scene::GeordiRayTracedLight")
    );
    assert_eq!(
        item(&map, "use Renamed")?.reexport_from.as_deref(),
        Some("ray_traced_scene::inner::Thing")
    );
    assert_eq!(
        item(&map, "use other::*")?.reexport_from.as_deref(),
        Some("other::*")
    );
    assert!(!map.contains_key("use Hidden"));
    Ok(())
}

#[test]
fn test_only_items_are_skipped_and_inline_modules_are_prefixed() -> TestResult {
    let map = items(
        "#[cfg(test)] mod tests { pub fn helper() {} }\n\
         #[cfg(test)] pub fn only_in_tests() {}\n\
         pub mod nested { pub fn inner() {} fn hidden() {} }\n\
         mod external;\n",
    )?;
    assert!(map.contains_key("fn nested::inner"));
    assert!(map.contains_key("mod nested"));
    assert!(!map.contains_key("fn nested::hidden"));
    assert!(!map.contains_key("fn only_in_tests"));
    assert!(!map.keys().any(|key| key.contains("helper")));
    Ok(())
}

#[test]
fn line_endings_do_not_change_the_snapshot() -> TestResult {
    let unix = "/// Doc.\npub struct A {\n    pub b: u8,\n}\n\npub fn f() {}\n";
    assert_eq!(items(unix)?, items(&unix.replace('\n', "\r\n"))?);
    Ok(())
}

#[test]
fn items_are_sorted_by_key() -> TestResult {
    let keys: Vec<String> = public_items("pub fn z() {}\npub fn a() {}\npub const M: u8 = 1;\n")?
        .into_iter()
        .map(|item| item.key)
        .collect();
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(keys, sorted);
    Ok(())
}

#[test]
fn invalid_rust_is_a_parse_error() {
    let error = public_items("pub fn (").err();
    assert!(matches!(error, Some(ApiError::Parse { .. })), "{error:?}");
}

fn lines(bytes: &[u8]) -> Result<Vec<Value>, Box<dyn Error>> {
    std::str::from_utf8(bytes)?
        .lines()
        .map(|line| Ok(serde_json::from_str::<Value>(line)?))
        .collect()
}

fn tagged_with(line: &Value, kind: &str) -> bool {
    line["kind"] == kind
        && line["_schema"]["id"] == format!("geordi.contract_api.{kind}")
        && line["_schema"]["version"] == "1.0.0"
}

#[test]
fn run_writes_one_item_line_per_item_and_a_result() -> TestResult {
    let dir = std::env::temp_dir().join(format!("geordi-contract-api-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    let file = dir.join("demo.rs");
    std::fs::write(&file, "pub fn demo() {}\npub const C: &str = \"C\";\n")?;
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = run(&[file.display().to_string()], &mut out, &mut err);
    std::fs::remove_dir_all(&dir)?;
    assert_eq!(code, 0, "{}", String::from_utf8_lossy(&err));
    assert_eq!(String::from_utf8_lossy(&err), "");
    let out = lines(&out)?;
    assert_eq!(out.len(), 3);
    assert!(out[..2].iter().all(|line| tagged_with(line, "item")));
    assert_eq!(out[0]["key"], "const C");
    assert_eq!(out[0]["stringValue"], "C");
    assert!(tagged_with(&out[2], "result"));
    assert_eq!(out[2]["items"], 2);
    Ok(())
}

#[test]
fn run_reports_a_missing_file_as_a_schema_tagged_error() -> TestResult {
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = run(
        &["/nonexistent/geordi/demo.rs".to_owned()],
        &mut out,
        &mut err,
    );
    assert_eq!(code, 1);
    let err = lines(&err)?;
    assert_eq!(err.len(), 1);
    assert!(tagged_with(&err[0], "error"));
    assert_eq!(err[0]["code"], "GEORDI_E_CONTRACT_API_IO");
    Ok(())
}

#[test]
fn run_without_files_is_a_usage_error() -> TestResult {
    let (mut out, mut err) = (Vec::new(), Vec::new());
    assert_eq!(run(&[], &mut out, &mut err), 2);
    assert_eq!(lines(&err)?[0]["code"], "GEORDI_E_CONTRACT_API_USAGE");
    Ok(())
}

#[test]
fn help_and_schema_are_json_lines_and_exit_zero() -> TestResult {
    let (mut out, mut err) = (Vec::new(), Vec::new());
    assert_eq!(run(&["--help".to_owned()], &mut out, &mut err), 0);
    let help = lines(&out)?;
    assert!(tagged_with(&help[0], "help"));
    let described: Vec<&Value> = help[1..]
        .iter()
        .map(|line| &line["describes"]["id"])
        .collect();
    assert_eq!(
        described,
        [
            "geordi.contract_api.item",
            "geordi.contract_api.result",
            "geordi.contract_api.error"
        ]
    );
    let (mut out, mut err) = (Vec::new(), Vec::new());
    assert_eq!(run(&["--schema".to_owned()], &mut out, &mut err), 0);
    let schemas = lines(&out)?;
    assert_eq!(schemas.len(), SCHEMAS.len());
    assert!(
        schemas
            .iter()
            .all(|line| tagged_with(line, "schema") && line["schema"].is_object())
    );
    Ok(())
}

#[test]
fn human_output_is_prose() -> TestResult {
    let (mut out, mut err) = (Vec::new(), Vec::new());
    assert_eq!(
        run(
            &["--help".to_owned(), "--human".to_owned()],
            &mut out,
            &mut err
        ),
        0
    );
    let text = String::from_utf8(out)?;
    assert!(text.starts_with("Usage: geordi-contract-api"), "{text}");
    assert!(serde_json::from_str::<Value>(text.lines().next().unwrap_or_default()).is_err());
    Ok(())
}
