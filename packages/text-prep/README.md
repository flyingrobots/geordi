# `@flyingrobots/geordi-text-prep`

Pinned strict text preparation tooling for the Geordi render-everywhere proof.

This package is TypeScript-native at the tooling edge. It does not shape text, parse fonts, render
glyphs, or wrap the Rust renderer through WASM. The first slice provides a stable CLI boundary that
validates pinned `geordi-text-prep-input/1` JSON and writes a deterministic
`geordi-text-prep-generation-plan/1` artifact.

## CLI

```bash
geordi-text-prep prepare \
  --input text-prep.input.geordi.json \
  --output fixtures/render-everywhere/strict-text/generated
```

The command writes:

```text
text-prep.generation-plan.geordi.json
```

The generation plan is audit data, not renderer input. It contains source hashes, content-addressed
font identity, shaping fingerprint identity, geometry policy, and output intent. It intentionally
omits the pixel-authoritative source string and declares `mayFeedStrictRenderer: false` until later
slices emit a strict text fixture, evidence pack, receipt, and generated output manifest.

## Current Diagnostics

The first profile rejects unsupported or unstable inputs with stable diagnostic codes:

| Code | Meaning |
| --- | --- |
| `GEORDI_TEXT_PREP_BAD_INPUT` | Required shape, profile, or scalar field is malformed. |
| `GEORDI_TEXT_PREP_BAD_PATH` | A font or fingerprint path is not repository-relative POSIX. |
| `GEORDI_TEXT_PREP_HOST_FONT_LOOKUP` | Input attempted host/system font lookup. |
| `GEORDI_TEXT_PREP_IO_ERROR` | CLI input or output file IO failed. |
| `GEORDI_TEXT_PREP_FALLBACK_REQUIRED` | Input attempted a fallback chain. |
| `GEORDI_TEXT_PREP_MISSING_FINGERPRINT` | Shaping did not use `geordi-text-prep-shaping-fingerprint/1`. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_MULTILINE` | Source text requested multiline/wrapping behavior. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_BIDI` | Input requested bidi or non-Latin first-profile shaping. |
| `GEORDI_TEXT_PREP_UNSUPPORTED_VARIABLE_AXES` | Input requested variable font axes before an axis fingerprint profile exists. |
| `GEORDI_TEXT_PREP_UNSTABLE_INPUT` | Source normalization or source hash is not pinned. |

## Nonclaims

- no generated strict text fixture yet;
- no glyph outline extraction yet;
- no measured line-box generation yet;
- no runtime text shaping;
- no host font lookup;
- no required WASM dependency.
