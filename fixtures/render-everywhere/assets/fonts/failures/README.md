# Font Pack Failure Fixtures

These fixtures intentionally violate the strict font-pack contract. They exist to keep the
font-asset boundary fail-loud before strict positioned glyph-run rendering consumes font evidence.

| Fixture | Expected Failure |
| --- | --- |
| `absolute-path.font-pack.geordi.json` | Repository-local path validation rejects absolute paths. |
| `bad-hash.font-pack.geordi.json` | Hash verification rejects bytes that do not match the manifest. |
| `duplicate-id.font-pack.geordi.json` | Manifest validation rejects duplicate font ids. |
| `unsupported-format.font-pack.geordi.json` | Manifest validation rejects unsupported font formats. |
