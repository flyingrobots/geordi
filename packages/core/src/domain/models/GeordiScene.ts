/**
 * Geordi Scene Type Definitions
 *
 * Root scene graph structure.
 */

import type { Bounds, GeordiNode } from './GeordiNode.js';

/** Scene version */
export type GeordiVersion = '0.1.0';

/** Coordinate units */
export type Units = 'px' | 'pt' | 'em';

/** Coordinate origin */
export type Origin = 'top-left' | 'center' | 'bottom-left';

/** JSON-compatible value accepted at package boundaries. */
export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** Scene metadata */
export interface GeordiMeta {
  /** Tool that generated this scene */
  readonly generator: string;

  /** Source file/identifier */
  readonly source: string;

  /** Content hash for verification */
  readonly hash: string;

  /** Timestamp */
  readonly timestamp?: string;
}

/** Canvas definition */
export interface GeordiCanvas {
  /** Canvas width */
  readonly width: number;

  /** Canvas height */
  readonly height: number;

  /** Coordinate units */
  readonly units: Units;

  /** Coordinate origin */
  readonly origin: Origin;
}

/** Design token map */
export type GeordiTokens = Readonly<Record<string, string>>;

/** Hit region for interaction */
export interface HitRegion {
  /** Node ID this region maps to */
  readonly id: string;

  /** Hit bounds */
  readonly bounds: Bounds;
}

/** Interaction metadata */
export interface GeordiInteraction {
  /** Hit regions for pointer events */
  readonly hitRegions: readonly HitRegion[];
}

/** Complete Geordi scene */
export interface GeordiScene {
  /** Scene format version */
  readonly version: GeordiVersion;

  /** Scene metadata */
  readonly meta: GeordiMeta;

  /** Canvas definition */
  readonly canvas: GeordiCanvas;

  /** Scene nodes */
  readonly nodes: readonly GeordiNode[];

  /** Design tokens */
  readonly tokens: GeordiTokens;

  /** Interaction metadata (optional) */
  readonly interaction?: GeordiInteraction;

  /** Diagnostics/warnings from compilation (optional) */
  readonly diagnostics?: readonly string[];
}

/** Type guard for Geordi scene */
export function isGeordiScene(value: object | null): value is GeordiScene {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const scene = value as Readonly<Partial<Record<keyof GeordiScene, JsonValue>>>;

  return (
    typeof scene.version === 'string' &&
    typeof scene.meta === 'object' &&
    scene.meta !== null &&
    !Array.isArray(scene.meta) &&
    typeof scene.canvas === 'object' &&
    scene.canvas !== null &&
    !Array.isArray(scene.canvas) &&
    Array.isArray(scene.nodes) &&
    typeof scene.tokens === 'object' &&
    scene.tokens !== null &&
    !Array.isArray(scene.tokens)
  );
}
