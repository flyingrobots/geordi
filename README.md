# Geordi

**Deterministic GPU-Native UI Intermediate Representation**

Pronounced: **"Jor-dee"** (/ˈdʒɔːrdi/)

Geordi is the **canonical intermediate representation** for GPU-native vector UI rendering. It is not a replacement for SVG or the browser DOM—it is the universal compile target for high-performance GPU rendering.

**Think LLVM IR, but for UI.**

> Unlike legacy SVG complexities, Geordi uses a sane Euclidean coordinate space:
> - Explicit origin and units
> - Explicit transforms
> - Deterministic layout and draw
> - Powered by the **Wesley** compiler framework

## Status: v0.1.0-dev 🚧

**Geordi-Wesley architecture complete.** Now implementing:
- GraphQL SDL → Geordi IR parser (via Wesley extensions)
- Semantic validation
- GPU-native rendering runtimes

## What is Geordi?

Geordi provides a stable, deterministic bridge between modern UI frameworks and the GPU. It allows developers to define UI using high-level concepts (like GraphQL SDL) and compile them down to a highly optimized, cross-platform representation that can be rendered with perfect fidelity on any GPU backend.

## Why Wesley?

Geordi is built on top of [Wesley](https://github.com/flyingrobots/wesley), a domain-free, GraphQL-to-"anything" compiler framework. 

Wesley provides the abstract "brain" of the compiler—handling the complexities of GraphQL parsing, directive orchestration, and artifact management. Geordi provides the "engineering"—the specific extensions, rules, and logic that transform a general-purpose GraphQL representation into a concrete, performance-tuned UI scene graph.

## What is GPVue?

**GPVue** is the developer-facing Vue SDK that compiles Vue components to Geordi for deterministic GPU rendering.

At runtime: no CSS parser, no cascade—only deterministic subtree relayout and GPU draw.

## Architecture

```
GPVue / GPReact / GPSvelte / Figma
              ↓
    Geordi IR (Universal Format)
    (Compiled via Wesley)
              ↓
    ┌─────────┼─────────┬─────────┬─────────┐
    ↓         ↓         ↓         ↓         ↓
  WebGL    WebGPU     Metal    Vulkan     wgpu
 (browser) (browser)  (Apple)  (native)   (Rust)
```

**Geordi is the compile target. Renderers are swappable.**

## Key Principles

1. **Deterministic** - Same IR in, same pixels out.
2. **Build-time Optimization** - No runtime parsing or cascade; layout is resolved during compilation.
3. **GPU-native** - Direct shader rendering for maximum performance.
4. **Fail Loud** - Unsupported features are caught at compile time, not run time.

## Project Structure

```
Geordi/
  packages/
    # Geordi Core (Universal IR)
    core/              # @flyingrobots/geordi-core - IR types, validation
    compiler-core/     # @flyingrobots/geordi-compiler-core - Compilation engine

    # Wesley Integration
    schema-graphql/    # @flyingrobots/geordi-schema-graphql - GraphQL → Geordi adapter
    wesley-generator/  # @flyingrobots/geordi-wesley-generator - Geordi extension for Wesley

    # Geordi Runtimes (Swappable backends)
    runtime-webgl/     # @flyingrobots/geordi-runtime-webgl - WebGL (browser)
    runtime-webgpu/    # (future) WebGPU
    runtime-metal/     # (future) Metal
    runtime-vulkan/    # (future) Vulkan

    # Front-end SDKs
    gpvue/             # @flyingrobots/gpvue - Vue → Geordi
```

## Development Principles

- **Apache 2.0 License** - Open and permissive.
- **Hexagonal Architecture** - Clean separation of Domain, Application, and Infrastructure layers.
- **Wesley-First** - Leverages the Wesley framework for all compilation tasks.
- **Strict TypeScript** - Maximum type safety and internal consistency.
- **Test-Driven** - Tests define behavior; 90%+ coverage required.

## License

Apache 2.0

## Contributing

Geordi is in early development. Inspired by the engineering prowess of Geordi La Forge and the potential of Wesley Crusher.
