import { describe, expect, it } from 'vitest';
import { GeordiGeneratorPlugin } from './index';

describe('wesley-generator public API', () => {
  it('exports GeordiGeneratorPlugin', () => {
    expect(GeordiGeneratorPlugin).toBeTypeOf('function');
  });
});
