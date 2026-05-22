import type { JsonValue } from './GeordiScene.js';

export const GEORDI_NUMERIC_PROFILE = 'geordi-finite-binary64/1' as const;

export type GeordiNumericProfile = typeof GEORDI_NUMERIC_PROFILE;

export class GeordiInvalidGraphicsNumberError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super('Invalid graphics number');
    this.name = new.target.name;
    this.path = path;
  }
}

export function isFiniteGraphicsNumber(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function requireFiniteGraphicsNumber(
  value: JsonValue | undefined,
  path: string,
): number {
  if (isFiniteGraphicsNumber(value)) {
    return value;
  }

  throw new GeordiInvalidGraphicsNumberError(path);
}
