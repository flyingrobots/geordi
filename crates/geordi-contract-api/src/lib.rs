//! Public-item snapshot of Rust source files, for the Geordi contract gate
//! (`scripts/contract-gate.mjs`, flyingrobots/geordi#217).
//!
//! The gate needs the public Rust API of a crate on two trees, the pull request and its base,
//! computed by the same code on a stable compiler and without network access. `rustdoc` JSON,
//! which `cargo public-api` and `cargo semver-checks` read, is available only on a nightly
//! compiler, so this crate parses source text with `syn` instead.
//!
//! What it sees: every item marked `pub` in the given files (functions, structs and their
//! public fields, enums and their variants, constants with their values, statics, type aliases,
//! traits, inline `pub mod` blocks), public inherent methods, trait implementations (derived or
//! written by hand) for public types declared in the same file, and `pub use` re-exports with
//! their source paths. Items under `#[cfg(test)]` are skipped. Doc comments and attributes other
//! than `#[non_exhaustive]` and `#[derive]` do not affect the snapshot.
//!
//! What it does not see: macro expansion, `cfg` evaluation other than `cfg(test)`, name
//! resolution (a type is compared by how it is written, so `String` and `std::string::String`
//! differ), files reached through `mod name;` (list each file), blanket and auto-trait
//! implementations (`Send`, `Sync`), and whether a public signature names a private type.

use std::collections::BTreeMap;
use std::fmt::{self, Display, Formatter};
use std::io::Write;

use quote::ToTokens;
use serde_json::{Value, json};
use syn::{
    Attribute, Expr, Fields, ImplItem, Item, Lit, Meta, Type, UseTree, Visibility,
    punctuated::Punctuated,
};

#[cfg(test)]
mod tests;

/// Version of every message type this command writes.
const MESSAGE_VERSION: &str = "1.0.0";

/// `(message type, stream, JSON Schema)` of every message this command writes.
pub const SCHEMAS: [(&str, &str, &str); 5] = [
    (
        "item",
        "stdout",
        include_str!("../../../schemas/geordi-contract-api/item.schema.json"),
    ),
    (
        "result",
        "stdout",
        include_str!("../../../schemas/geordi-contract-api/result.schema.json"),
    ),
    (
        "error",
        "stderr",
        include_str!("../../../schemas/geordi-contract-api/error.schema.json"),
    ),
    (
        "help",
        "stdout",
        include_str!("../../../schemas/geordi-contract-api/help.schema.json"),
    ),
    (
        "schema",
        "stdout",
        include_str!("../../../schemas/geordi-contract-api/schema.schema.json"),
    ),
];

const USAGE: &str = "geordi-contract-api (<file.rs>... | --schema | --help) [--human]";

const OPTIONS: [(&str, &str); 4] = [
    (
        "<file.rs>...",
        "Rust source files. Writes one item line per public item of each file, sorted by key, then a result line.",
    ),
    (
        "--schema",
        "Print the JSON Schema of every message type and exit 0.",
    ),
    (
        "--help",
        "Print this description and the schemas of the success and error output.",
    ),
    ("--human, --humanize", "Write prose instead of JSON Lines."),
];

const EXIT_CODES: [(u8, &str); 3] = [
    (0, "Success."),
    (1, "A file could not be read or is not Rust."),
    (2, "Invalid command line."),
];

/// One public item of a source file.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ApiItem {
    /// Stable identity, for example `fn parse`, `field Light.kind` or `use Light`.
    pub key: String,
    /// The item's signature as normalised tokens, without docs or attributes.
    pub signature: String,
    /// The value of a `&str` constant.
    pub string_value: Option<String>,
    /// The path a `pub use` re-exports.
    pub reexport_from: Option<String>,
    /// `#[non_exhaustive]` on a struct, enum or variant.
    pub non_exhaustive: bool,
    /// For a struct: whether every field is public, so that it can be built with a literal.
    pub fields_all_public: Option<bool>,
}

/// Why a snapshot could not be made.
#[derive(Debug)]
pub enum ApiError {
    /// The command line is invalid.
    Usage {
        /// What is wrong.
        detail: String,
    },
    /// A file could not be read.
    Io {
        /// The file.
        path: String,
        /// The operating system's message.
        detail: String,
    },
    /// A file is not Rust that `syn` can parse.
    Parse {
        /// The file, empty when parsing a string.
        path: String,
        /// The parser's message.
        detail: String,
    },
}

impl ApiError {
    /// The stable diagnostic code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Usage { .. } => "GEORDI_E_CONTRACT_API_USAGE",
            Self::Io { .. } => "GEORDI_E_CONTRACT_API_IO",
            Self::Parse { .. } => "GEORDI_E_CONTRACT_API_PARSE",
        }
    }
}

impl Display for ApiError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Usage { detail } => write!(formatter, "{detail}"),
            Self::Io { path, detail } => write!(formatter, "cannot read {path}: {detail}"),
            Self::Parse { path, detail } => write!(formatter, "cannot parse {path}: {detail}"),
        }
    }
}

impl std::error::Error for ApiError {}

/// The public items of one Rust source file, sorted by key.
///
/// # Errors
///
/// Returns [`ApiError::Parse`] when the text is not Rust that `syn` can parse.
pub fn public_items(source: &str) -> Result<Vec<ApiItem>, ApiError> {
    let file = syn::parse_file(source).map_err(|error| ApiError::Parse {
        path: String::new(),
        detail: error.to_string(),
    })?;
    let mut collector = Collector::default();
    collector.items(&file.items, "");
    Ok(collector.finish())
}

#[derive(Default)]
struct Collector {
    items: BTreeMap<String, ApiItem>,
    /// Public types declared in the file, by name, so trait impls for them can be kept.
    public_types: Vec<String>,
    /// `(trait, type)` of every trait impl in the file, kept once the public types are known.
    trait_impls: Vec<(String, String)>,
}

impl Collector {
    fn finish(mut self) -> Vec<ApiItem> {
        for (trait_name, type_name) in std::mem::take(&mut self.trait_impls) {
            if self.public_types.contains(&type_name) {
                self.push(
                    format!("impl {trait_name} for {type_name}"),
                    String::new(),
                    ApiItem::default(),
                );
            }
        }
        self.items.into_values().collect()
    }

    fn push(&mut self, key: String, signature: String, extra: ApiItem) {
        self.items.insert(
            key.clone(),
            ApiItem {
                key,
                signature,
                ..extra
            },
        );
    }

    fn items(&mut self, items: &[Item], prefix: &str) {
        for item in items {
            self.item(item, prefix);
        }
    }

    fn item(&mut self, item: &Item, prefix: &str) {
        if is_test_only(item_attrs(item)) {
            return;
        }
        match item {
            Item::Fn(function) if is_public(&function.vis) => {
                let name = format!("{prefix}{}", function.sig.ident);
                let signature = tokens(&strip_signature(function.sig.clone()));
                self.push(format!("fn {name}"), signature, ApiItem::default());
            }
            Item::Const(constant) if is_public(&constant.vis) => {
                let name = format!("{prefix}{}", constant.ident);
                let signature = format!("{} = {}", tokens(&*constant.ty), tokens(&*constant.expr));
                let string_value = string_literal(&constant.expr);
                self.push(
                    format!("const {name}"),
                    signature,
                    ApiItem {
                        string_value,
                        ..ApiItem::default()
                    },
                );
            }
            Item::Static(item_static) if is_public(&item_static.vis) => {
                let name = format!("{prefix}{}", item_static.ident);
                self.push(
                    format!("static {name}"),
                    tokens(&*item_static.ty),
                    ApiItem::default(),
                );
            }
            Item::Type(alias) if is_public(&alias.vis) => {
                let name = format!("{prefix}{}", alias.ident);
                let signature = format!("{} = {}", tokens(&alias.generics), tokens(&*alias.ty));
                self.push(format!("type {name}"), signature, ApiItem::default());
            }
            Item::Struct(item_struct) if is_public(&item_struct.vis) => {
                self.structure(item_struct, prefix);
            }
            Item::Enum(item_enum) if is_public(&item_enum.vis) => {
                self.enumeration(item_enum, prefix);
            }
            Item::Trait(item_trait) if is_public(&item_trait.vis) => {
                self.trait_definition(item_trait, prefix);
            }
            Item::Mod(module) if is_public(&module.vis) => {
                if let Some((_, content)) = &module.content {
                    let name = format!("{prefix}{}", module.ident);
                    self.push(format!("mod {name}"), String::new(), ApiItem::default());
                    self.items(content, &format!("{name}::"));
                }
            }
            Item::Use(item_use) if is_public(&item_use.vis) => {
                let mut uses = Vec::new();
                flatten_use(&item_use.tree, "", &mut uses);
                for (exported, from) in uses {
                    self.push(
                        format!("use {prefix}{exported}"),
                        String::new(),
                        ApiItem {
                            reexport_from: Some(from),
                            ..ApiItem::default()
                        },
                    );
                }
            }
            Item::Impl(item_impl) => self.implementation(item_impl, prefix),
            _ => {}
        }
    }

    fn structure(&mut self, item_struct: &syn::ItemStruct, prefix: &str) {
        let name = format!("{prefix}{}", item_struct.ident);
        self.public_types.push(name.clone());
        self.derives(&item_struct.attrs, &name);
        let mut all_public = true;
        for (index, field) in item_struct.fields.iter().enumerate() {
            if !is_public(&field.vis) {
                all_public = false;
                continue;
            }
            let field_name = field
                .ident
                .as_ref()
                .map_or_else(|| index.to_string(), ToString::to_string);
            self.push(
                format!("field {name}.{field_name}"),
                tokens(&field.ty),
                ApiItem::default(),
            );
        }
        let shape = match &item_struct.fields {
            Fields::Named(_) => "{}",
            Fields::Unnamed(_) => "()",
            Fields::Unit => ";",
        };
        self.push(
            format!("struct {name}"),
            format!("{}{shape}", tokens(&item_struct.generics)),
            ApiItem {
                non_exhaustive: is_non_exhaustive(&item_struct.attrs),
                fields_all_public: Some(all_public),
                ..ApiItem::default()
            },
        );
    }

    fn enumeration(&mut self, item_enum: &syn::ItemEnum, prefix: &str) {
        let name = format!("{prefix}{}", item_enum.ident);
        self.public_types.push(name.clone());
        self.derives(&item_enum.attrs, &name);
        for variant in &item_enum.variants {
            let mut fields = variant.fields.clone();
            for field in &mut fields {
                field.attrs.clear();
            }
            let discriminant = variant
                .discriminant
                .as_ref()
                .map(|(_, expr)| format!(" = {}", tokens(expr)))
                .unwrap_or_default();
            self.push(
                format!("variant {name}::{}", variant.ident),
                format!("{}{discriminant}", tokens(&fields)),
                ApiItem {
                    non_exhaustive: is_non_exhaustive(&variant.attrs),
                    ..ApiItem::default()
                },
            );
        }
        self.push(
            format!("enum {name}"),
            tokens(&item_enum.generics),
            ApiItem {
                non_exhaustive: is_non_exhaustive(&item_enum.attrs),
                ..ApiItem::default()
            },
        );
    }

    fn trait_definition(&mut self, item_trait: &syn::ItemTrait, prefix: &str) {
        let name = format!("{prefix}{}", item_trait.ident);
        let supertraits = if item_trait.supertraits.is_empty() {
            String::new()
        } else {
            format!(" : {}", tokens(&item_trait.supertraits))
        };
        self.push(
            format!("trait {name}"),
            format!("{}{supertraits}", tokens(&item_trait.generics)),
            ApiItem::default(),
        );
        for member in &item_trait.items {
            match member {
                syn::TraitItem::Fn(function) => {
                    let body = if function.default.is_some() {
                        " { default }"
                    } else {
                        " ;"
                    };
                    self.push(
                        format!("trait-fn {name}::{}", function.sig.ident),
                        format!("{}{body}", tokens(&strip_signature(function.sig.clone()))),
                        ApiItem::default(),
                    );
                }
                syn::TraitItem::Const(constant) => {
                    self.push(
                        format!("trait-const {name}::{}", constant.ident),
                        tokens(&constant.ty),
                        ApiItem::default(),
                    );
                }
                syn::TraitItem::Type(alias) => {
                    self.push(
                        format!("trait-type {name}::{}", alias.ident),
                        tokens(&alias.bounds),
                        ApiItem::default(),
                    );
                }
                _ => {}
            }
        }
    }

    fn derives(&mut self, attrs: &[Attribute], type_name: &str) {
        for attr in attrs {
            if !attr.path().is_ident("derive") {
                continue;
            }
            let Ok(paths) =
                attr.parse_args_with(Punctuated::<syn::Path, syn::Token![,]>::parse_terminated)
            else {
                continue;
            };
            for path in paths {
                if let Some(last) = path.segments.last() {
                    self.trait_impls
                        .push((last.ident.to_string(), type_name.to_owned()));
                }
            }
        }
    }

    fn implementation(&mut self, item_impl: &syn::ItemImpl, prefix: &str) {
        let Some(type_name) = self_type_name(&item_impl.self_ty) else {
            return;
        };
        let type_name = format!("{prefix}{type_name}");
        if let Some((_, trait_path, _)) = &item_impl.trait_ {
            if let Some(last) = trait_path.segments.last() {
                self.trait_impls.push((last.ident.to_string(), type_name));
            }
            return;
        }
        for member in &item_impl.items {
            if let ImplItem::Fn(method) = member
                && is_public(&method.vis)
                && !is_test_only(&method.attrs)
            {
                self.push(
                    format!("method {type_name}::{}", method.sig.ident),
                    tokens(&strip_signature(method.sig.clone())),
                    ApiItem::default(),
                );
            } else if let ImplItem::Const(constant) = member
                && is_public(&constant.vis)
            {
                self.push(
                    format!("const {type_name}::{}", constant.ident),
                    format!("{} = {}", tokens(&constant.ty), tokens(&constant.expr)),
                    ApiItem {
                        string_value: string_literal(&constant.expr),
                        ..ApiItem::default()
                    },
                );
            }
        }
    }
}

fn tokens(value: &impl ToTokens) -> String {
    value.to_token_stream().to_string()
}

const fn is_public(visibility: &Visibility) -> bool {
    matches!(visibility, Visibility::Public(_))
}

fn item_attrs(item: &Item) -> &[Attribute] {
    match item {
        Item::Const(inner) => &inner.attrs,
        Item::Enum(inner) => &inner.attrs,
        Item::Fn(inner) => &inner.attrs,
        Item::Impl(inner) => &inner.attrs,
        Item::Mod(inner) => &inner.attrs,
        Item::Static(inner) => &inner.attrs,
        Item::Struct(inner) => &inner.attrs,
        Item::Trait(inner) => &inner.attrs,
        Item::Type(inner) => &inner.attrs,
        Item::Use(inner) => &inner.attrs,
        _ => &[],
    }
}

fn is_test_only(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|attr| {
        attr.path().is_ident("cfg")
            && matches!(&attr.meta, Meta::List(list) if list.tokens.to_string() == "test")
    })
}

fn is_non_exhaustive(attrs: &[Attribute]) -> bool {
    attrs
        .iter()
        .any(|attr| attr.path().is_ident("non_exhaustive"))
}

fn strip_signature(mut signature: syn::Signature) -> syn::Signature {
    for input in &mut signature.inputs {
        match input {
            syn::FnArg::Receiver(receiver) => receiver.attrs.clear(),
            syn::FnArg::Typed(typed) => typed.attrs.clear(),
        }
    }
    signature
}

fn string_literal(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Lit(literal) => match &literal.lit {
            Lit::Str(text) => Some(text.value()),
            _ => None,
        },
        Expr::Reference(reference) => string_literal(&reference.expr),
        _ => None,
    }
}

fn self_type_name(self_type: &Type) -> Option<String> {
    match self_type {
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string()),
        _ => None,
    }
}

/// `(exported name, source path)` of every leaf of a `use` tree.
fn flatten_use(tree: &UseTree, path: &str, out: &mut Vec<(String, String)>) {
    let join = |name: &str| {
        if path.is_empty() {
            name.to_owned()
        } else {
            format!("{path}::{name}")
        }
    };
    match tree {
        UseTree::Path(segment) => {
            flatten_use(&segment.tree, &join(&segment.ident.to_string()), out);
        }
        UseTree::Name(name) => {
            let exported = name.ident.to_string();
            out.push((exported.clone(), join(&exported)));
        }
        UseTree::Rename(rename) => {
            out.push((rename.rename.to_string(), join(&rename.ident.to_string())));
        }
        UseTree::Glob(_) => {
            let from = join("*");
            out.push((from.clone(), from));
        }
        UseTree::Group(group) => {
            for item in &group.items {
                flatten_use(item, path, out);
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Command line: JSON Lines on stdout and stderr by default, prose with --human
// ---------------------------------------------------------------------------------------------

fn tagged(kind: &str, mut body: Value) -> Value {
    body["_schema"] = json!({
        "id": format!("geordi.contract_api.{kind}"),
        "version": MESSAGE_VERSION,
    });
    body["kind"] = json!(kind);
    body
}

// A closed pipe is the only way these writes fail, and there is nowhere left to report it.
fn emit(stream: &mut dyn Write, line: &Value) {
    let _unused = writeln!(stream, "{line}");
}

fn emit_text(stream: &mut dyn Write, text: &str) {
    let _unused = writeln!(stream, "{text}");
}

fn schema_lines(kinds: &[&str]) -> Vec<Value> {
    SCHEMAS
        .iter()
        .filter(|(kind, _, _)| kinds.contains(kind))
        .map(|(kind, stream, text)| {
            tagged(
                "schema",
                json!({
                    "describes": {
                        "id": format!("geordi.contract_api.{kind}"),
                        "version": MESSAGE_VERSION,
                    },
                    "stream": stream,
                    // The schema files are compiled in and covered by tests; null marks a
                    // corrupted build rather than hiding it.
                    "schema": serde_json::from_str::<Value>(text).unwrap_or(Value::Null),
                }),
            )
        })
        .collect()
}

fn print_help(human: bool, stdout: &mut dyn Write) {
    if human {
        emit_text(stdout, &format!("Usage: {USAGE}\n"));
        for (flag, description) in OPTIONS {
            emit_text(stdout, &format!("  {flag}\n      {description}"));
        }
        emit_text(stdout, "\nExit codes:");
        for (code, meaning) in EXIT_CODES {
            emit_text(stdout, &format!("  {code}  {meaning}"));
        }
        return;
    }
    emit(
        stdout,
        &tagged(
            "help",
            json!({
                "command": "geordi-contract-api",
                "summary": "Writes the public items of Rust source files (functions, types, fields, variants, constants, trait impls, re-exports) as normalised signatures, for the contract gate to compare between a pull request and its base. Parses with syn; needs no nightly compiler and no network.",
                "usage": USAGE,
                "options": OPTIONS
                    .iter()
                    .map(|(flag, description)| json!({ "flag": flag, "description": description }))
                    .collect::<Vec<_>>(),
                "exitCodes": EXIT_CODES
                    .iter()
                    .map(|(code, meaning)| json!({ "code": code, "meaning": meaning }))
                    .collect::<Vec<_>>(),
            }),
        ),
    );
    for line in schema_lines(&["item", "result", "error"]) {
        emit(stdout, &line);
    }
}

fn print_schemas(human: bool, stdout: &mut dyn Write) {
    for line in schema_lines(&["item", "result", "error", "help", "schema"]) {
        if human {
            emit_text(
                stdout,
                &format!(
                    "{} {} ({})\n{:#}\n",
                    line["describes"]["id"].as_str().unwrap_or_default(),
                    MESSAGE_VERSION,
                    line["stream"].as_str().unwrap_or_default(),
                    line["schema"]
                ),
            );
        } else {
            emit(stdout, &line);
        }
    }
}

fn print_error(human: bool, error: &ApiError, stderr: &mut dyn Write) {
    if human {
        emit_text(stderr, &format!("error [{}]: {error}", error.code()));
        return;
    }
    let paths: Vec<&str> = match error {
        ApiError::Io { path, .. } | ApiError::Parse { path, .. } if !path.is_empty() => {
            vec![path.as_str()]
        }
        _ => Vec::new(),
    };
    emit(
        stderr,
        &tagged(
            "error",
            json!({ "code": error.code(), "message": error.to_string(), "paths": paths }),
        ),
    );
}

fn item_line(file: &str, item: &ApiItem) -> Value {
    let mut body = json!({
        "file": file,
        "key": item.key,
        "signature": item.signature,
        "nonExhaustive": item.non_exhaustive,
    });
    if let Some(value) = &item.string_value {
        body["stringValue"] = json!(value);
    }
    if let Some(from) = &item.reexport_from {
        body["reexportFrom"] = json!(from);
    }
    if let Some(all_public) = item.fields_all_public {
        body["fieldsAllPublic"] = json!(all_public);
    }
    tagged("item", body)
}

fn snapshot_files(
    files: &[&String],
    human: bool,
    stdout: &mut dyn Write,
) -> Result<usize, ApiError> {
    let mut count = 0;
    for file in files {
        let text = std::fs::read_to_string(file).map_err(|error| ApiError::Io {
            path: (*file).clone(),
            detail: error.to_string(),
        })?;
        let items = public_items(&text).map_err(|error| match error {
            ApiError::Parse { detail, .. } => ApiError::Parse {
                path: (*file).clone(),
                detail,
            },
            other => other,
        })?;
        for item in &items {
            if human {
                emit_text(stdout, &format!("{file}: {} {}", item.key, item.signature));
            } else {
                emit(stdout, &item_line(file, item));
            }
        }
        count += items.len();
    }
    Ok(count)
}

/// Runs the command line and returns the process exit code.
///
/// `args` excludes the program name. Every line written to `stdout` or `stderr` is one JSON
/// object, unless `--human` is present.
pub fn run(args: &[String], stdout: &mut dyn Write, stderr: &mut dyn Write) -> u8 {
    let human = args
        .iter()
        .any(|arg| arg == "--human" || arg == "--humanize");
    let rest: Vec<&String> = args
        .iter()
        .filter(|arg| *arg != "--human" && *arg != "--humanize")
        .collect();
    match rest.as_slice() {
        [flag] if *flag == "--help" || *flag == "-h" => {
            print_help(human, stdout);
            return 0;
        }
        [flag] if *flag == "--schema" => {
            print_schemas(human, stdout);
            return 0;
        }
        [] => {
            let error = ApiError::Usage {
                detail: "give one or more Rust source files, --schema or --help".to_owned(),
            };
            print_error(human, &error, stderr);
            return 2;
        }
        _ => {}
    }
    if let Some(flag) = rest.iter().find(|arg| arg.starts_with("--")) {
        let error = ApiError::Usage {
            detail: format!("unknown argument: {flag}"),
        };
        print_error(human, &error, stderr);
        return 2;
    }
    match snapshot_files(&rest, human, stdout) {
        Ok(count) => {
            if human {
                emit_text(
                    stdout,
                    &format!("{count} public item(s) in {} file(s)", rest.len()),
                );
            } else {
                emit(
                    stdout,
                    &tagged(
                        "result",
                        json!({ "ok": true, "files": rest.len(), "items": count }),
                    ),
                );
            }
            0
        }
        Err(error) => {
            print_error(human, &error, stderr);
            1
        }
    }
}
