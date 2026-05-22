import { describe, expect, it } from 'vitest';
import { GeordiWebGLRenderer, renderGeordiToCanvas } from './index';

describe('runtime-webgl public API', () => {
  it('exports renderer entrypoints', () => {
    expect(GeordiWebGLRenderer).toBeTypeOf('function');
    expect(renderGeordiToCanvas).toBeTypeOf('function');
  });
});
