import { afterEach, describe, expect, it } from 'vitest';
import type { GeordiScene } from '@flyingrobots/geordi-core';
import {
  GeordiCanvasContextUnavailableError,
  GeordiWebGLRenderer,
  renderGeordiToCanvas,
} from './index';

interface CanvasCall {
  readonly name: string;
  readonly args: readonly (number | string)[];
}

class FakeCanvasContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  textAlign: CanvasTextAlign = 'start';
  readonly calls: CanvasCall[] = [];

  fillRect(x: number, y: number, width: number, height: number): void {
    this.push('fillRect', x, y, width, height);
  }

  save(): void {
    this.push('save');
  }

  restore(): void {
    this.push('restore');
  }

  beginPath(): void {
    this.push('beginPath');
  }

  closePath(): void {
    this.push('closePath');
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.push('rect', x, y, width, height);
  }

  fill(): void {
    this.push('fill');
  }

  stroke(): void {
    this.push('stroke');
  }

  moveTo(x: number, y: number): void {
    this.push('moveTo', x, y);
  }

  lineTo(x: number, y: number): void {
    this.push('lineTo', x, y);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.push('arcTo', x1, y1, x2, y2, radius);
  }

  fillText(text: string, x: number, y: number): void {
    this.push('fillText', text, x, y);
  }

  private push(name: string, ...args: (number | string)[]): void {
    this.calls.push({ name, args });
  }
}

const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
const originalDocument = hadDocument ? globalThis.document : undefined;

afterEach(() => {
  if (hadDocument && originalDocument) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    return;
  }

  Reflect.deleteProperty(globalThis, 'document');
});

function makeCanvas(context: CanvasRenderingContext2D | null): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: (contextId: string) => (contextId === '2d' ? context : null),
  } as object as HTMLCanvasElement;
}

function installCanvasDocument(canvas: HTMLCanvasElement): void {
  const fakeDocument = {
    createElement: (tagName: string) => {
      expect(tagName).toBe('canvas');
      return canvas;
    },
  } as object as Document;

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  });
}

function makeScene(): GeordiScene {
  return {
    version: '0.1.0',
    meta: {
      generator: 'test',
      source: 'test',
      hash: 'sha256:test',
    },
    canvas: {
      width: 100,
      height: 50,
      units: 'px',
      origin: 'top-left',
    },
    nodes: [
      {
        id: 'rect-1',
        type: 'rect',
        bounds: [1, 2, 10, 20],
        static: true,
        style: {
          paint: {
            fill: {
              type: 'solid',
              color: '#123456',
            },
          },
        },
      },
      {
        id: 'text-1',
        type: 'text',
        bounds: [5, 6, 80, 12],
        static: true,
        content: 'Hello',
        style: {
          text: {
            font: 'Inter',
            size: 12,
            weight: 400,
            color: '#ffffff',
          },
        },
      },
    ],
    tokens: {},
  };
}

describe('runtime-webgl public API', () => {
  it('exports renderer entrypoints', () => {
    expect(GeordiWebGLRenderer).toBeTypeOf('function');
    expect(renderGeordiToCanvas).toBeTypeOf('function');
  });

  it('renders the current scene contract to a canvas context', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    const rendered = renderGeordiToCanvas(makeScene());

    expect(rendered).toBe(canvas);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(context.calls).toEqual([
      { name: 'fillRect', args: [0, 0, 100, 50] },
      { name: 'save', args: [] },
      { name: 'beginPath', args: [] },
      { name: 'rect', args: [1, 2, 10, 20] },
      { name: 'closePath', args: [] },
      { name: 'fill', args: [] },
      { name: 'restore', args: [] },
      { name: 'save', args: [] },
      { name: 'fillText', args: ['Hello', 5, 6] },
      { name: 'restore', args: [] },
    ]);
    expect(context.font).toBe('400 12px Inter');
  });

  it('throws a custom error when a canvas context cannot be created', () => {
    installCanvasDocument(makeCanvas(null));

    expect(() => new GeordiWebGLRenderer(10, 10)).toThrow(
      GeordiCanvasContextUnavailableError,
    );
  });
});
