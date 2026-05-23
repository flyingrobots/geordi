import { describe, expect, it } from 'vitest';
import {
  GEORDI_BASELINE_FEATURES,
  GEORDI_CORE_PROFILE,
  GEORDI_KNOWN_FEATURES,
  GEORDI_STRICT_TEXT_FEATURES,
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

  it('declares a deterministic strict text feature list', () => {
    expect(GEORDI_STRICT_TEXT_FEATURES).toEqual([
      'text.fontPack',
      'text.shapingProfile',
      'text.lineBreakProfile',
      'text.fallbackChain',
      'text.glyphRuns',
      'text.lineBoxes',
    ]);
  });

  it('keeps baseline and strict text features inside the known feature registry', () => {
    expect(GEORDI_KNOWN_FEATURES).toEqual([
      ...GEORDI_BASELINE_FEATURES,
      ...GEORDI_STRICT_TEXT_FEATURES,
    ]);
    for (const feature of GEORDI_STRICT_TEXT_FEATURES) {
      expect(GEORDI_BASELINE_FEATURES).not.toContain(feature);
    }
  });

  it('classifies known feature requirements', () => {
    expect(isGeordiFeatureRequirement('shape.rect')).toBe(true);
    expect(isGeordiFeatureRequirement('text.glyphRuns')).toBe(true);
    expect(isGeordiFeatureRequirement('effect.blur/1')).toBe(false);
  });
});
