/**
 * Utility functions for Geordi rendering
 */

import type { GeordiIrV1, GeordiScene } from '@flyingrobots/geordi-core';
import { GeordiWebGLRenderer } from './WebGLRenderer.js';
import { prepareGeordiIr } from './prepareGeordiIr.js';

/**
 * Render a Geordi scene to a canvas element
 *
 * @param scene - The Geordi scene to render
 * @returns Canvas element with the rendered scene
 */
export function renderGeordiToCanvas(scene: GeordiScene): HTMLCanvasElement {
  const renderer = new GeordiWebGLRenderer(
    scene.canvas.width,
    scene.canvas.height,
  );

  return renderer.render(scene);
}

export function renderGeordiIrToCanvas(ir: GeordiIrV1): HTMLCanvasElement {
  return renderGeordiToCanvas(prepareGeordiIr(ir));
}
