# Strict Text Probe Policy Schema

**Probe policy version**: `geordi-strict-text-probe-policy/1`
**Text profile**: `geordi-strict-positioned-glyph-run/1`
**Slice**: S068

A strict text probe policy is a fixture-local visual smoke contract. It names a small set of
coarse browser/native sample points and explains why each point is stable enough to block a release.
It is not a pixel-parity profile, antialiasing profile, shaping profile, or general text rendering
claim.

## Relationship Model

~~~mermaid
erDiagram
  STRICT_TEXT_FIXTURE ||--|| OUTLINE_EVIDENCE_PACK : rendered-with
  STRICT_TEXT_FIXTURE ||--o| STRICT_TEXT_PROBE_POLICY : sampled-by
  STRICT_TEXT_PROBE_POLICY ||--|{ STRICT_TEXT_PIXEL_PROBE : contains
  STRICT_TEXT_PIXEL_PROBE }o--|| OUTLINE_EVIDENCE_PACK : chosen-from
~~~

~~~mermaid
sequenceDiagram
  participant Gate as Browser or Native Gate
  participant Fixture as Strict Text Fixture
  participant Evidence as Outline Evidence Pack
  participant Policy as Probe Policy
  participant Canvas as Rendered Canvas

  Gate->>Fixture: validate strict text fixture
  Gate->>Evidence: validate outline evidence
  Gate->>Policy: validate fixture/evidence/canvas linkage
  Gate->>Canvas: render evidence
  loop each policy probe
    Gate->>Canvas: sample x,y
    Gate->>Policy: apply expectation and tolerance
  end
  Gate-->>Gate: fail before success if any probe misses
~~~

## Shape

~~~json
{
  "antiAliasEdgePolicy": "edge-probes-are-non-stable-and-must-not-block",
  "canvas": {
    "height": 64,
    "width": 192
  },
  "evidencePackId": "render-everywhere:strict-text:geordi:outline-evidence",
  "evidencePackPath": "fixtures/render-everywhere/strict-text/geordi.outline-evidence.geordi.json",
  "fillRgba": [
    17,
    24,
    39,
    255
  ],
  "fixtureId": "render-everywhere:strict-text:geordi",
  "fixturePath": "fixtures/render-everywhere/strict-text/geordi.strict-text.geordi.json",
  "id": "render-everywhere:strict-text:geordi:probe-policy",
  "nonclaim": "Coarse visibility smoke only. This policy does not claim full antialiasing identity, pixel-identical rasterization, shaping support, or general text rendering.",
  "probePolicyVersion": "geordi-strict-text-probe-policy/1",
  "probes": [
    {
      "coordinateSource": "Manual sample from the canonical GEORDI outline evidence interior, away from the observed contour edge.",
      "expectation": "fill",
      "id": "text-g-fill-top",
      "purpose": "Prove an interior G fill pixel is present near the top of the glyph run.",
      "stability": "interior-fill-away-from-edge",
      "tolerance": "exact-fill-rgba",
      "x": 12,
      "y": 15
    }
  ]
}
~~~

## Field Laws

- `probePolicyVersion` must equal `geordi-strict-text-probe-policy/1`.
- `id` must be a non-empty stable artifact id.
- `fixtureId` must match the strict text fixture `id`.
- `fixturePath` must be a repository-relative POSIX path under
  `fixtures/render-everywhere/strict-text/` and must target the fixture being rendered.
- `evidencePackId` must match the outline evidence pack `id`.
- `evidencePackPath` must be a repository-relative POSIX path under
  `fixtures/render-everywhere/strict-text/` and must target the evidence pack being rendered.
- `canvas.width` and `canvas.height` must match the rendered strict text canvas dimensions.
- `fillRgba` must contain exactly four integer byte channels.
- `antiAliasEdgePolicy` must equal `edge-probes-are-non-stable-and-must-not-block`.
- `nonclaim` must be non-empty and must preserve the claim boundary: coarse smoke only, no full
  antialiasing identity, no pixel-identical rasterization claim, no shaping support claim, and no
  general text rendering claim.
- `probes` must be non-empty.
- `probes[].id` values must be unique.
- `probes[].x` and `probes[].y` must be non-negative integers inside the declared canvas.
- `probes[].purpose` and `probes[].coordinateSource` must be non-empty strings.
- `probes[].expectation` must be `fill` or `transparent`.
- A `fill` probe must use `tolerance: "exact-fill-rgba"` and
  `stability: "interior-fill-away-from-edge"`.
- A `transparent` probe must use `tolerance: "alpha-zero"` and
  `stability: "background-outside-glyph-bounds"`.
- A probe on an antialiasing contour edge is non-stable. It must not be encoded as a blocking
  policy probe.

## Runtime Semantics

For `fill` probes, the sampled RGBA value must exactly equal `fillRgba`. The current canonical
GEORDI policy uses `[17, 24, 39, 255]`.

For `transparent` probes, the sampled alpha channel must equal `0`. RGB channel values are ignored
when alpha is zero.

The policy is intentionally sparse. Passing it proves that the expected glyph evidence produced
visible filled pixels and did not paint the named background regions. It does not prove every glyph
edge, curve, counter, or antialiasing decision is identical across runtimes.
