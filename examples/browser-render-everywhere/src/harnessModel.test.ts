import { describe, expect, it } from 'vitest';
import {
  GEORDI_IR_VERSION,
  GEORDI_NUMERIC_PROFILE,
} from '@flyingrobots/geordi-core';
import { RENDER_FIXTURE_VERSION } from '@flyingrobots/geordi-render-fixture';
import { createBrowserHarnessStatus } from './harnessModel.js';

describe('browser render-everywhere harness model', () => {
  it('reports public runtime and fixture contract values', () => {
    expect(createBrowserHarnessStatus()).toEqual({
      fixtureVersion: RENDER_FIXTURE_VERSION,
      irVersion: GEORDI_IR_VERSION,
      numericProfile: GEORDI_NUMERIC_PROFILE,
      rendererName: 'browser-canvas',
      supportedFeatureCount: 12,
    });
  });
});
