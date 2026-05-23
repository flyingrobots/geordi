import {
  GraphQLEnumType,
  GraphQLDirective,
  GraphQLFloat,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLBoolean,
  DirectiveLocation,
  type GraphQLNamedType,
} from 'graphql';

export const GEORDI_DIRECTIVE_VERSION = '1' as const;

export const GeordiNodeKindEnum = new GraphQLEnumType({
  name: 'GeordiNodeKind',
  values: {
    Rect: { value: 'Rect' },
    Text: { value: 'Text' },
    Image: { value: 'Image' },
    Group: { value: 'Group' },
    Line: { value: 'Line' },
    Ellipse: { value: 'Ellipse' },
    Path: { value: 'Path' },
  },
});

export const geordiSceneDirective = new GraphQLDirective({
  name: 'geordi_scene',
  locations: [DirectiveLocation.OBJECT],
  args: {
    v: { type: new GraphQLNonNull(GraphQLString) },
    width: { type: new GraphQLNonNull(GraphQLInt) },
    height: { type: new GraphQLNonNull(GraphQLInt) },
    name: { type: GraphQLString },
    background: { type: GraphQLString },
  },
});

export const geordiNodeDirective = new GraphQLDirective({
  name: 'geordi_node',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    kind: { type: new GraphQLNonNull(GeordiNodeKindEnum) },
    id: { type: GraphQLString },
    parent: { type: GraphQLString },
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
    width: { type: GraphQLFloat },
    height: { type: GraphQLFloat },
    zIndex: { type: GraphQLInt },
    visible: { type: GraphQLBoolean },
    props: { type: GraphQLString }, // JSON string payload for extensibility
  },
});

export const geordiBindDirective = new GraphQLDirective({
  name: 'geordi_bind',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    targetProp: { type: new GraphQLNonNull(GraphQLString) },
    expr: { type: new GraphQLNonNull(GraphQLString) },
    when: { type: GraphQLString },
  },
});

export const geordiStyleDirective = new GraphQLDirective({
  name: 'geordi_style',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    shadow: { type: GraphQLString }, // JSON string
    blendMode: { type: GraphQLString },
  },
});

export const GEORDI_DIRECTIVES: readonly GraphQLDirective[] = [
  geordiSceneDirective,
  geordiNodeDirective,
  geordiBindDirective,
  geordiStyleDirective,
];

/**
 * Quick runtime guard used by parse/transform steps.
 * You can replace with richer schema-walk validation later.
 */
export function validateGeordiDirectiveVersion(version: string): { ok: boolean; expected: string } {
  return { ok: version === GEORDI_DIRECTIVE_VERSION, expected: GEORDI_DIRECTIVE_VERSION };
}

/**
 * Checks if schema has the directives we rely on.
 * Strict mode should fail if any required directive is missing.
 */
export function hasRequiredGeordiDirectives(schema: GraphQLSchema): {
  ok: boolean;
  missing: string[];
} {
  const names = new Set(schema.getDirectives().map((d) => d.name));
  const required = ['geordi_scene', 'geordi_node'];
  const missing = required.filter((n) => !names.has(n));
  return { ok: missing.length === 0, missing };
}

/**
 * Optional utility for validating node kind values in transforms.
 */
export function isGeordiNodeKind(value: string | number | boolean | undefined): value is
  | 'Rect'
  | 'Text'
  | 'Image'
  | 'Group'
  | 'Line'
  | 'Ellipse'
  | 'Path' {
  return (
    value === 'Rect' ||
    value === 'Text' ||
    value === 'Image' ||
    value === 'Group' ||
    value === 'Line' ||
    value === 'Ellipse' ||
    value === 'Path'
  );
}

/**
 * Convenience helper for plugin/packages that build a schema programmatically.
 * If you parse SDL, you'll usually merge these directives with buildSchema/buildASTSchema.
 */
export function withGeordiDirectives(baseSchemaConfig: {
  query: GraphQLObjectType;
  mutation?: GraphQLObjectType;
  subscription?: GraphQLObjectType;
  types?: readonly GraphQLNamedType[];
}): GraphQLSchema {
  return new GraphQLSchema({
    ...baseSchemaConfig,
    directives: [...GEORDI_DIRECTIVES],
  });
}
