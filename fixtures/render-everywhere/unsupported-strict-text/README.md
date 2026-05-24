# Unsupported Strict Text Fixture

This fixture is intentionally not renderable by the browser canvas MVP profile.

It contains only rectangle nodes, but its runtime profile requires `text.fontPack`. The feature is
known to `geordi-ir/1`, so IR and manifest validation should pass. Runtime profile negotiation must
fail before any canvas is drawn.

Its fixture manifest declares `"source": { "kind": "none" }` because this negative fixture is about
runtime capability failure, not GPVue authoring.
