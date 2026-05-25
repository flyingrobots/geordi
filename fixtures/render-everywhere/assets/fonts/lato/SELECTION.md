# Lato Regular Selection

**Slice**: S018
**Selected asset**: Lato Regular
**Upstream font path**: `google/fonts/ofl/lato/Lato-Regular.ttf`
**Upstream license path**: `google/fonts/ofl/lato/OFL.txt`
**Upstream commit**: `c5b52261e8fde2d3b2592fa9d26ac525939c5e4c`
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
bytes are exact upstream bytes from commit `c5b52261e8fde2d3b2592fa9d26ac525939c5e4c`; the license
text is whitespace-normalized for repository hygiene by trimming trailing ASCII whitespace.

| File | Verification |
| --- | --- |
| `Lato-Regular.ttf` | TrueType font data, 656568 bytes, upstream and vendored hash `sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251` |
| upstream `OFL.txt` | ASCII license text, 4407 bytes, hash `sha256:74ba064d03f1f1c4a952da936c3eb71866c34404916734de3cae73b34357e59e` |
| vendored `OFL.txt` | ASCII license text, 4406 bytes, hash `sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423` |

S021 records the final manifest identity:

| Manifest field | Value |
| --- | --- |
| Font hash | `sha256:d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251` |
| License hash | `sha256:19e7e97ffc31e58fa0e54919b8189b2ddcc6fd75539f387e2822b107b6a51423` |
