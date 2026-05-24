export const GEORDI_CORE_PROFILE = 'geordi/core/1' as const;

export const GEORDI_BASELINE_FEATURES = [
  GEORDI_CORE_PROFILE,
  'layout.resolved',
  'shape.group',
  'shape.image',
  'shape.rect',
  'shape.text',
  'paint.solid',
  'stroke.solid',
  'paint.opacity',
  'shape.cornerRadius',
  'text.fill',
  'text.raw-runtime-shaping',
] as const;

export const GEORDI_STRICT_TEXT_FEATURES = [
  'text.fontPack',
  'text.shapingProfile',
  'text.lineBreakProfile',
  'text.fallbackChain',
  'text.glyphRuns',
  'text.lineBoxes',
] as const;

export const GEORDI_MESH_FEATURES = [
  'asset.mesh',
  'mesh.triangle',
  'transform.matrix4',
  'camera.perspective',
  'projection.perspective',
  'depth.z-buffer',
  'material.solid',
  'playback.fixed-rate-rotation',
] as const;

export const GEORDI_KNOWN_FEATURES = [
  ...GEORDI_BASELINE_FEATURES,
  ...GEORDI_STRICT_TEXT_FEATURES,
  ...GEORDI_MESH_FEATURES,
] as const;

export type GeordiFeatureRequirement = (typeof GEORDI_KNOWN_FEATURES)[number];

const GEORDI_KNOWN_FEATURE_SET = new Set<string>(GEORDI_KNOWN_FEATURES);

export function isGeordiFeatureRequirement(
  value: string,
): value is GeordiFeatureRequirement {
  return GEORDI_KNOWN_FEATURE_SET.has(value);
}
