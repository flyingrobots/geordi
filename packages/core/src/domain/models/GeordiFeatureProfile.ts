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

export type GeordiFeatureRequirement = (typeof GEORDI_BASELINE_FEATURES)[number];

const GEORDI_BASELINE_FEATURE_SET = new Set<string>(GEORDI_BASELINE_FEATURES);

export function isGeordiFeatureRequirement(
  value: string,
): value is GeordiFeatureRequirement {
  return GEORDI_BASELINE_FEATURE_SET.has(value);
}
