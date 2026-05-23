import { type DocumentNode, type ObjectTypeDefinitionNode, Kind } from 'graphql';
import { ParseError, GeordiErrorCode } from '@flyingrobots/geordi-compiler-core';
import type { Diagnostic, SourceRef } from '@flyingrobots/geordi-compiler-core';
import { validateGeordiDirectiveVersion } from '../directives/geordiDirectives.js';
import {
  readOptionalStringArg,
  readRequiredIntArg,
  readRequiredStringArg,
  type DirectiveArgReaderContext,
} from './directiveArgs.js';
import { nodeSourceRef } from './sourceRef.js';

export interface ExtractedScene {
  typeName: string;
  v: string;
  width: number;
  height: number;
  name?: string;
  background?: string;
  sourceRef: SourceRef;
  typeNode: ObjectTypeDefinitionNode;
}

/**
 * Extracts the single @geordi_scene type definition from a DocumentNode.
 * Pushes diagnostics and returns undefined on error.
 */
export function extractScene(
  doc: DocumentNode,
  diagnostics: Diagnostic[],
  filename?: string,
): ExtractedScene | undefined {
  const sceneCandidates: ObjectTypeDefinitionNode[] = [];

  for (const def of doc.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    const sceneDir = def.directives?.find((d) => d.name.value === 'geordi_scene');
    if (sceneDir) {
      sceneCandidates.push(def);
    }
  }

  if (sceneCandidates.length === 0) {
    diagnostics.push(
      new ParseError(
        GeordiErrorCode.E_SCENE_MISSING,
        'No type with @geordi_scene directive found. Add @geordi_scene(v: "1", width: N, height: N) to exactly one type.',
        { location: { file: filename ?? '<inline>', line: 1, column: 1 } },
      ).toDiagnostic(),
    );
    return undefined;
  }

  if (sceneCandidates.length > 1) {
    const names = sceneCandidates.map((t) => t.name.value).join(', ');
    diagnostics.push(
      new ParseError(
        GeordiErrorCode.E_SCENE_MULTIPLE,
        `Multiple types with @geordi_scene found: ${names}. Only one scene type is allowed per SDL.`,
        { location: nodeSourceRef(sceneCandidates[1], filename) },
      ).toDiagnostic(),
    );
    return undefined;
  }

  const typeNode = sceneCandidates[0];
  const sourceRef = nodeSourceRef(typeNode, filename);
  const sceneDir = typeNode.directives?.find((d) => d.name.value === 'geordi_scene');
  if (!sceneDir) {
    diagnostics.push(
      new ParseError(
        GeordiErrorCode.E_SCENE_MISSING,
        `Scene candidate "${typeNode.name.value}" is missing @geordi_scene directive`,
        { location: sourceRef },
      ).toDiagnostic(),
    );
    return undefined;
  }

  // Validate version
  const argContext: DirectiveArgReaderContext = {
    directive: sceneDir,
    directiveName: 'geordi_scene',
    diagnostics,
    filename,
    owner: `type "${typeNode.name.value}"`,
  };
  const v = readRequiredStringArg(argContext, 'v');
  if (v === undefined) {
    return undefined;
  }

  const vCheck = validateGeordiDirectiveVersion(v);
  if (!vCheck.ok) {
    diagnostics.push(
      new ParseError(
        GeordiErrorCode.E_VERSION_UNSUPPORTED,
        `Unsupported @geordi_scene version: "${v}" (expected "${vCheck.expected}")`,
        { location: sourceRef },
      ).toDiagnostic(),
    );
    return undefined;
  }

  // Validate required numeric args
  const width = readRequiredIntArg(argContext, 'width');
  const height = readRequiredIntArg(argContext, 'height');

  if (width === undefined || height === undefined) {
    return undefined;
  }

  const name = readOptionalStringArg(argContext, 'name');
  const background = readOptionalStringArg(argContext, 'background');

  return {
    typeName: typeNode.name.value,
    v,
    width,
    height,
    name,
    background,
    sourceRef,
    typeNode,
  };
}
