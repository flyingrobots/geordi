import { describe, expect, it } from 'vitest';
import {
  GEORDI_BASELINE_FEATURES,
  GEORDI_CORE_PROFILE,
  GEORDI_KNOWN_FEATURES,
  GEORDI_MESH_FEATURES,
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

  it('declares deterministic mesh feature requirements outside the baseline profile', () => {
    expect(GEORDI_MESH_FEATURES).toEqual([
      'asset.mesh',
      'mesh.triangle',
      'transform.matrix4',
      'camera.perspective',
      'projection.perspective',
      'depth.z-buffer',
      'material.solid',
      'playback.fixed-rate-rotation',
    ]);
  });

  it('keeps baseline, strict text, and mesh features inside the known feature registry', () => {
    expect(GEORDI_KNOWN_FEATURES).toEqual([
      ...GEORDI_BASELINE_FEATURES,
      ...GEORDI_STRICT_TEXT_FEATURES,
      ...GEORDI_MESH_FEATURES,
    ]);
    for (const feature of GEORDI_STRICT_TEXT_FEATURES) {
      expect(GEORDI_BASELINE_FEATURES).not.toContain(feature);
    }
    for (const feature of GEORDI_MESH_FEATURES) {
      expect(GEORDI_BASELINE_FEATURES).not.toContain(feature);
    }
  });

  it('classifies known feature requirements', () => {
    expect(isGeordiFeatureRequirement('shape.rect')).toBe(true);
    expect(isGeordiFeatureRequirement('text.glyphRuns')).toBe(true);
    expect(isGeordiFeatureRequirement('mesh.triangle')).toBe(true);
    expect(isGeordiFeatureRequirement('effect.blur/1')).toBe(false);
  });
});
