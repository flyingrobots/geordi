/**
 * Utility functions for Geordi rendering
 */

import type { GeordiScene } from '@flyingrobots/geordi-core';
import { GeordiWebGLRenderer } from './WebGLRenderer.js';

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
