//! Strict JSON field access shared by the intake and the glyph pack parser.

use serde_json::{Map, Value};

use super::error::{ErrorCode, ProofError};

/// Fails with `code` at a JSON path.
pub(super) fn fail<T>(
    code: ErrorCode,
    path: impl Into<String>,
    detail: impl Into<String>,
) -> Result<T, ProofError> {
    Err(ProofError::new(code, path, detail))
}

/// `value` as an object holding exactly `fields`.
pub(super) fn object_at<'a>(
    value: &'a Value,
    path: &str,
    fields: &[&str],
    code: ErrorCode,
) -> Result<&'a Map<String, Value>, ProofError> {
    let Some(object) = value.as_object() else {
        return fail(code, path, "expected an object");
    };
    if let Some(unknown) = object.keys().find(|key| !fields.contains(&key.as_str())) {
        return fail(code, format!("{path}.{unknown}"), "unknown field");
    }
    if let Some(missing) = fields.iter().find(|field| !object.contains_key(**field)) {
        return fail(code, format!("{path}.{missing}"), "missing required field");
    }
    Ok(object)
}

/// `value` as an array.
pub(super) fn array_at<'a>(
    value: &'a Value,
    path: &str,
    code: ErrorCode,
) -> Result<&'a Vec<Value>, ProofError> {
    value
        .as_array()
        .map_or_else(|| fail(code, path, "expected an array"), Ok)
}

/// `value` as an integer written without a fraction or exponent, in `min..=max`.
pub(super) fn integer_at(
    value: &Value,
    path: &str,
    min: u32,
    max: u32,
    code: ErrorCode,
) -> Result<u32, ProofError> {
    value
        .as_u64()
        .and_then(|number| u32::try_from(number).ok())
        .filter(|number| (min..=max).contains(number))
        .map_or_else(
            || fail(code, path, format!("expected an integer in {min}..{max}")),
            Ok,
        )
}

/// Requires `value` to be exactly the string `expected`.
pub(super) fn literal_at(
    value: &Value,
    expected: &str,
    path: &str,
    code: ErrorCode,
) -> Result<(), ProofError> {
    if value.as_str() == Some(expected) {
        Ok(())
    } else {
        fail(code, path, format!("expected \"{expected}\""))
    }
}

/// Whether `text` is a lowercase 64-digit hexadecimal SHA-256.
pub(super) fn is_sha256_hex(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
