import {
  compile,
  formatDiagnostic,
  type CompilerInput,
  type ParseInputDeps,
} from '@flyingrobots/geordi-compiler-core';
import { graphqlToCanonicalAst } from '@flyingrobots/geordi-schema-graphql';
// import { GeneratorPlugin } from '@wesley/core';

interface WesleyPlanArtifact {
  path: string;
  reason: string;
}

interface WesleyPlanMetadata {
  inputFormat: 'graphql-sdl';
  sdl: string;
}

interface WesleyPlan {
  artifacts: WesleyPlanArtifact[];
  metadata: WesleyPlanMetadata;
}

type WesleyGenerateResult = Record<string, string | Uint8Array>;

interface WesleySchemaLike {
  sdl?: string;
}

interface WesleyContextLike {
  logger?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
  // Add evidence/hooks fields when integrating with real Wesley runtime.
}

export class GeordiGenerationFailedError extends Error {
  public readonly errorCount: number;

  constructor(errorCount: number) {
    super(`Generation failed with ${errorCount} error(s)`);
    this.name = new.target.name;
    this.errorCount = errorCount;
  }
}

// export class GeordiGeneratorPlugin extends GeneratorPlugin {
export class GeordiGeneratorPlugin {
  readonly apiVersion = '1';

  readonly name = 'geordi';

  /**
   * plan() should be cheap and non-compiling where possible.
   * It declares outputs and seeds metadata used by generate().
   */
  plan(schema: WesleySchemaLike, context: WesleyContextLike): WesleyPlan {
    const sdl = schema.sdl ?? '';

    context.logger?.info?.('[geordi] planning artifacts');

    return {
      artifacts: [
        { path: 'scene.geordi.json', reason: 'Geordi IR scene' },
        { path: 'types.ts', reason: 'TypeScript types for scene artifacts' },
      ],
      metadata: {
        inputFormat: 'graphql-sdl',
        sdl,
      },
    };
  }

  /**
   * generate() performs compilation and returns output file map.
   * Throw on compilation failure so Wesley marks generator failed.
   */
  async generate(plan: WesleyPlan, context: WesleyContextLike): Promise<WesleyGenerateResult> {
    context.logger?.info?.('[geordi] generating artifacts');

    const sdl = plan.metadata.sdl;

    const input: CompilerInput = {
      format: 'graphql-sdl',
      source: sdl,
      filename: 'schema.graphql',
      options: {
        target: 'geordi-ir',
        emit: {
          irJson: true,
          tsTypes: true,
          jsonSchema: false,
          binaryPack: false,
        },
        strict: true,
        failOnWarnings: false,
        canonicalize: true,
      },
    };

    const deps: ParseInputDeps = { graphqlToCanonicalAst };
    const result = await compile(input, deps);

    for (const d of result.diagnostics) {
      const msg = formatDiagnostic(d);
      if (d.severity === 'error') context.logger?.error?.(msg);
      else if (d.severity === 'warning') context.logger?.warn?.(msg);
      else context.logger?.info?.(msg);
    }

    if (!result.ok) {
      throw new GeordiGenerationFailedError(result.diagnostics.filter((d) => d.severity === 'error').length);
    }

    // Convert ArtifactMap -> Wesley expected output
    const out: WesleyGenerateResult = {};
    for (const [path, artifact] of Object.entries(result.artifacts)) {
      // Prefer artifact.path if present; fallback to key.
      const outputPath = artifact.path || path;
      out[outputPath] = artifact.content;
    }

    return out;
  }
}
