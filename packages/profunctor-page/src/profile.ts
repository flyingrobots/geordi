import type { GeordiFeatureRequirement } from '@flyingrobots/geordi-core';

export const PROFUNCTOR_PAGE_CANVAS = {
  height: 1120,
  width: 1440,
} as const;

export const PROFUNCTOR_PAGE_FEATURES = [
  'geordi/core/1',
  'layout.resolved',
  'shape.rect',
  'paint.solid',
] as const satisfies readonly GeordiFeatureRequirement[];

export const PROFUNCTOR_PAGE_TARGET_CLAIMS = [
  'resolved-rectangle-geometry',
  'semantic-node-to-render-node-identity',
  'structural-preview',
] as const;

export const PROFUNCTOR_PAGE_TARGET_NONCLAIMS = [
  'accessibility-tree',
  'browser-landmarks',
  'general-text',
  'native-link-activation',
  'semantic-html',
  'website-pixel-parity',
] as const;

export const PROFUNCTOR_PAGE_TOKEN_VALUES = {
  'semantic.focus': '#d84b1c',
  'semantic.interactive': '#1259c3',
  'semantic.inverse-line': '#87a0c8',
  'semantic.inverse-surface-alt': '#10244d',
  'semantic.inverse-text': '#ffffff',
  'semantic.inverse-text-muted': '#c8d8f2',
  'semantic.line-strong': '#647084',
  'semantic.surface': '#f3f0e7',
  'semantic.surface-tint': '#1d64bd',
  'semantic.text': '#0b1220',
  'semantic.text-muted': '#465167',
} as const satisfies Readonly<Record<string, string>>;

export type ProfunctorPageTokenReference =
  keyof typeof PROFUNCTOR_PAGE_TOKEN_VALUES;

export interface ProfunctorPageBlockGeometry {
  readonly fillTokenRole:
    | 'inverseSurfaceAlt'
    | 'surface'
    | 'surfaceTint';
  readonly height: number;
  readonly label: string;
  readonly textFill: '#0b1220' | '#ffffff';
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export const PROFUNCTOR_PAGE_BLOCK_GEOMETRY = {
  'block:page': {
    fillTokenRole: 'surface',
    height: 1120,
    label: 'Page',
    textFill: '#0b1220',
    width: 1440,
    x: 0,
    y: 0,
  },
  'block:project-documentation': {
    fillTokenRole: 'surfaceTint',
    height: 320,
    label: 'Documentation',
    textFill: '#ffffff',
    width: 648,
    x: 728,
    y: 352,
  },
  'block:project-facts': {
    fillTokenRole: 'surface',
    height: 320,
    label: 'Project facts',
    textFill: '#0b1220',
    width: 632,
    x: 64,
    y: 352,
  },
  'block:project-hero': {
    fillTokenRole: 'surfaceTint',
    height: 256,
    label: 'Project hero',
    textFill: '#ffffff',
    width: 1312,
    x: 64,
    y: 64,
  },
  'block:project-related': {
    fillTokenRole: 'inverseSurfaceAlt',
    height: 352,
    label: 'Related projects',
    textFill: '#ffffff',
    width: 1312,
    x: 64,
    y: 704,
  },
} as const satisfies Readonly<Record<string, ProfunctorPageBlockGeometry>>;

export function profunctorPageBlockGeometry(
  blockDefinitionId: string,
): ProfunctorPageBlockGeometry | undefined {
  if (!Object.hasOwn(PROFUNCTOR_PAGE_BLOCK_GEOMETRY, blockDefinitionId)) {
    return undefined;
  }
  const geometryByBlock: Readonly<
    Record<string, ProfunctorPageBlockGeometry | undefined>
  > = PROFUNCTOR_PAGE_BLOCK_GEOMETRY;
  return geometryByBlock[blockDefinitionId];
}
