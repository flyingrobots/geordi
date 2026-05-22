import type { CanonicalSceneAst, Diagnostic } from '@flyingrobots/geordi-compiler-core';
import type { GraphqlToCanonicalAst } from '@flyingrobots/geordi-compiler-core';
import { GeordiErrorCode, ParseError } from '@flyingrobots/geordi-compiler-core';
import { parseGraphql } from './parse/parseGraphql.js';
import { extractScene } from './parse/extractScene.js';
import { extractNodes } from './parse/extractNodes.js';
import { toCanonicalAst } from './transform/toCanonicalAst.js';

// Re-export the type so callers can import it from this package
export type { GraphqlToCanonicalAst };

class GraphqlSceneExtractionError extends ParseError {
  constructor(message: string) {
    super(GeordiErrorCode.E_SCENE_MISSING, message);
  }
}

/**
 * Converts a GraphQL SDL string into a CanonicalSceneAst.
 * This is the primary adapter between @geordi/schema-graphql and @flyingrobots/geordi-compiler-core.
 *
 * Throws on parse errors. Pushes semantic diagnostics to the provided array.
 */
export const graphqlToCanonicalAst: GraphqlToCanonicalAst = (args: {
  sdl: string;
  filename?: string;
  diagnostics?: Diagnostic[];
}): CanonicalSceneAst => {
  const { sdl, filename, diagnostics = [] } = args;

  // Step 1: Parse SDL into DocumentNode (throws ParseError on syntax errors)
  const doc = parseGraphql(sdl, filename);

  // Step 2: Extract scene definition
  const scene = extractScene(doc, diagnostics, filename);
  if (!scene) {
    const reason =
      diagnostics.length > 0
        ? diagnostics[diagnostics.length - 1].message
        : 'Scene extraction failed';
    throw new GraphqlSceneExtractionError(reason);
  }

  // Step 3: Extract nodes
  const nodes = extractNodes(scene, diagnostics, filename);

  // Step 4: Transform to canonical AST
  return toCanonicalAst(scene, nodes, filename);
};
