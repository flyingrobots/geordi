/**
 * Utility functions for Geordi rendering
 */

import type { GeordiIrV1, PreparedGeordiScene } from '@flyingrobots/geordi-core';
import { GeordiWebGLRenderer } from './WebGLRenderer.js';
import { prepareGeordiIr } from './prepareGeordiIr.js';

/**
 * Render a prepared runtime scene to a canvas element.
 *
 * @param scene - The prepared scene to render
 * @returns Canvas element with the rendered scene
 */
export function renderPreparedSceneToCanvas(scene: PreparedGeordiScene): HTMLCanvasElement {
  const renderer = new GeordiWebGLRenderer(
    scene.canvas.width,
    scene.canvas.height,
  );

  return renderer.renderPreparedScene(scene);
}

/** Render public `geordi-ir/1` to a canvas element. */
export function renderGeordiToCanvas(ir: GeordiIrV1): HTMLCanvasElement {
  return renderPreparedSceneToCanvas(prepareGeordiIr(ir));
}

/**
 * Render public `geordi-ir/1` to a canvas element.
 *
 * Compatibility alias retained during the v0.1 migration. Use `renderGeordiToCanvas`.
 */
export const renderGeordiIrToCanvas = renderGeordiToCanvas;
