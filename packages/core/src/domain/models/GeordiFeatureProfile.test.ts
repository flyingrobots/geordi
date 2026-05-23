import { describe, expect, it } from 'vitest';
import {
  GEORDI_BASELINE_FEATURES,
  GEORDI_CORE_PROFILE,
  isGeordiFeatureRequirement,
} from './GeordiFeatureProfile';

describe('Geordi feature profile', () => {
  it('pins the baseline core profile identifier', () => {
    expect(GEORDI_CORE_PROFILE).toBe('geordi/core/1');
  });

  it('declares a deterministic baseline feature list', () => {
    expect(GEORDI_BASELINE_FEATURES).toEqual([
      'geordi/core/1',
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
    ]);
  });

  it('classifies supported feature requirements', () => {
    expect(isGeordiFeatureRequirement('shape.rect')).toBe(true);
    expect(isGeordiFeatureRequirement('effect.blur/1')).toBe(false);
  });
});
