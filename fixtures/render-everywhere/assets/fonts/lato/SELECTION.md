# Lato Regular Selection

**Slice**: S018
**Selected asset**: Lato Regular
**Upstream font path**: `google/fonts/ofl/lato/Lato-Regular.ttf`
**Upstream license path**: `google/fonts/ofl/lato/OFL.txt`
**Format**: static TrueType font (`ttf`)
**Face index**: `0`
**License**: SIL Open Font License 1.1
**Reserved Font Name**: `Lato`

Lato Regular is the first strict text fixture font candidate because it is a static, redistributable
TrueType font with normal UI/body proportions and enough coverage for the initial fixture strings:
`GEORDI`, `HELLO`, and `text 0123`.

The first asset landing must preserve the upstream bytes exactly. Geordi must not modify, subset,
rename, or derive from this file as part of the source font asset. Any future subset, outline pack,
bitmap atlas, or SDF atlas belongs in a separately hashed glyph evidence pack.

Planned landing paths:

~~~text
fixtures/render-everywhere/assets/fonts/lato/Lato-Regular.ttf
fixtures/render-everywhere/assets/fonts/lato/OFL.txt
~~~

S020 landed the selected upstream font bytes and vendored OFL license text at those paths. The font
bytes are exact upstream bytes; the license text is whitespace-normalized for repository hygiene.

| File | Verification |
| --- | --- |
| `Lato-Regular.ttf` | TrueType font data, 656568 bytes |
| `OFL.txt` | ASCII license text, 4406 bytes |

The final `sha256:<hex>` identity is intentionally deferred to S021, after S020 lands the actual
bytes.
