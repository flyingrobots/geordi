import { afterEach, describe, expect, it } from 'vitest';
import {
  GEORDI_BASELINE_FEATURES,
  GEORDI_CORE_PROFILE,
  GEORDI_NUMERIC_PROFILE,
  GEORDI_STRICT_TEXT_FEATURES,
  isGeordiIr,
  type GeordiIr,
  type PreparedGeordiScene,
} from '@flyingrobots/geordi-core';
import {
  compile,
  parseJsonValue,
  stringifyCanonicalJson,
} from '@flyingrobots/geordi-compiler-core';
import {
  GeordiCanvasContextUnavailableError,
  GeordiRuntimeInvalidIrError,
  GeordiRuntimeInvalidNodePropsError,
  GeordiRuntimeUnsupportedProfileError,
  GeordiWebGLRenderer,
  GEORDI_WEBGL_RUNTIME_PROFILE,
  renderGeordiIrToCanvas,
  renderPreparedSceneToCanvas,
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

class RuntimeContractTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
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

function makePreparedScene(): PreparedGeordiScene {
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

function makeIr(): GeordiIr {
  return {
    irVersion: 'geordi-ir/1',
    numericProfile: GEORDI_NUMERIC_PROFILE,
    requires: GEORDI_BASELINE_FEATURES,
    scene: {
      id: 'scene:runtime-ir',
      width: 100,
      height: 50,
      units: 'px',
    },
    nodes: [
      {
        id: 'rect-1',
        kind: 'Rect',
        props: {
          x: 1,
          y: 2,
          width: 10,
          height: 20,
          fill: '#123456',
        },
      },
      {
        id: 'text-1',
        kind: 'Text',
        props: {
          x: 5,
          y: 6,
          width: 80,
          height: 12,
          content: 'Hello',
          color: '#ffffff',
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 400,
        },
      },
    ],
    bindings: [],
    animations: [],
  };
}

describe('runtime-webgl public API', () => {
  it('exports renderer entrypoints', () => {
    expect(GeordiWebGLRenderer).toBeTypeOf('function');
    expect(renderGeordiToCanvas).toBeTypeOf('function');
    expect(renderPreparedSceneToCanvas).toBeTypeOf('function');
  });

  it('exports a runtime capability profile', () => {
    expect(GEORDI_WEBGL_RUNTIME_PROFILE).toEqual({
      irVersion: 'geordi-ir/1',
      numericProfile: GEORDI_NUMERIC_PROFILE,
      supportedFeatureRequirements: GEORDI_BASELINE_FEATURES,
      nodeKinds: ['Rect', 'Text', 'Group', 'Image'],
      visualFeatures: ['solid-fill', 'solid-stroke', 'opacity', 'corner-radius', 'text-fill'],
    });
  });

  it('renders prepared scenes to a canvas context', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    const rendered = renderPreparedSceneToCanvas(makePreparedScene());

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

  it('renders geordi-ir/1 through the primary runtime API', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    const rendered = renderGeordiToCanvas(makeIr());

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

  it('renders IR that requires a supported feature subset', () => {
    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    const rendered = renderGeordiToCanvas({
      ...makeIr(),
      requires: [GEORDI_CORE_PROFILE, 'shape.rect'],
    });

    expect(rendered).toBe(canvas);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
  });

  it('keeps the deprecated IR helper as a compatibility alias', () => {
    expect(renderGeordiIrToCanvas).toBe(renderGeordiToCanvas);
  });

  it('throws a custom error when runtime IR validation fails', () => {
    const invalidIr = {
      ...makeIr(),
      scene: {
        id: 'scene:runtime-ir',
        width: 0,
        height: 50,
      },
    } as object as GeordiIr;

    expect(() => renderGeordiToCanvas(invalidIr)).toThrow(GeordiRuntimeInvalidIrError);
  });

  it('throws a custom error for unsupported runtime profile requirements', () => {
    const unsupportedProfileIr = {
      ...makeIr(),
      numericProfile: 'geordi-fixed-point-px6/1',
    } as object as GeordiIr;

    expect(() => renderGeordiToCanvas(unsupportedProfileIr)).toThrow(
      GeordiRuntimeUnsupportedProfileError,
    );
  });

  it('throws a custom error for unsupported feature requirements', () => {
    const unsupportedFeatureIr = {
      ...makeIr(),
      requires: [...GEORDI_BASELINE_FEATURES, 'effect.blur/1'],
    } as object as GeordiIr;

    expect(() => renderGeordiToCanvas(unsupportedFeatureIr)).toThrow(
      GeordiRuntimeUnsupportedProfileError,
    );
  });

  it('throws a custom error for known strict text requirements until supported', () => {
    const strictTextIr: GeordiIr = {
      ...makeIr(),
      requires: [...GEORDI_BASELINE_FEATURES, ...GEORDI_STRICT_TEXT_FEATURES],
    };

    expect(() => renderGeordiToCanvas(strictTextIr)).toThrow(
      GeordiRuntimeUnsupportedProfileError,
    );
  });

  it('throws a custom error when feature requirements are missing', () => {
    const missingFeatureIr = { ...makeIr() };
    Reflect.deleteProperty(missingFeatureIr, 'requires');

    expect(() => renderGeordiToCanvas(missingFeatureIr)).toThrow(
      GeordiRuntimeUnsupportedProfileError,
    );
  });

  it('throws a custom error when feature requirements are malformed', () => {
    const malformedFeatureIr = {
      ...makeIr(),
      requires: ['geordi/core/1', 7],
    } as object as GeordiIr;

    expect(() => renderGeordiToCanvas(malformedFeatureIr)).toThrow(
      GeordiRuntimeUnsupportedProfileError,
    );
  });

  it('throws a custom error for unsupported IR versions', () => {
    const unsupportedVersionIr = {
      ...makeIr(),
      irVersion: 'geordi-ir/2',
    } as object as GeordiIr;

    expect(() => renderGeordiToCanvas(unsupportedVersionIr)).toThrow(
      GeordiRuntimeUnsupportedProfileError,
    );
  });

  it('throws a custom error when required runtime node props are missing', () => {
    const invalidIr: GeordiIr = {
      ...makeIr(),
      nodes: [
        {
          id: 'rect-1',
          kind: 'Rect',
          props: {
            height: 20,
          },
        },
      ],
    };

    expect(() => renderGeordiToCanvas(invalidIr)).toThrow(
      GeordiRuntimeInvalidNodePropsError,
    );
  });

  it('throws a custom error when required string props are invalid', () => {
    const invalidIr: GeordiIr = {
      ...makeIr(),
      nodes: [
        {
          id: 'image-1',
          kind: 'Image',
          props: {
            src: null,
          },
        },
      ],
    };

    expect(() => renderGeordiToCanvas(invalidIr)).toThrow(
      GeordiRuntimeInvalidNodePropsError,
    );
  });

  it('throws a custom error when a canvas context cannot be created', () => {
    installCanvasDocument(makeCanvas(null));

    expect(() => new GeordiWebGLRenderer(10, 10)).toThrow(
      GeordiCanvasContextUnavailableError,
    );
  });

  it('renders compiler-emitted geordi-ir/1 through the runtime contract', async () => {
    const source = stringifyCanonicalJson({
      kind: 'Scene',
      astVersion: '1',
      scene: {
        id: 'scene:compiler-runtime',
        width: 120,
        height: 80,
        units: 'px',
      },
      nodes: [
        {
          id: 'rect-1',
          kind: 'Rect',
          props: {
            x: 4,
            y: 5,
            width: 20,
            height: 30,
            fill: '#123456',
          },
          visible: true,
        },
        {
          id: 'text-1',
          kind: 'Text',
          props: {
            x: 7,
            y: 8,
            content: 'Compiled',
            color: '#ffffff',
            fontFamily: 'Inter',
            fontSize: 14,
          },
          visible: true,
        },
      ],
      metadata: { sourceFormat: 'canonical-ast-json' },
    });

    const result = await compile({
      format: 'canonical-ast-json',
      source,
      options: {
        target: 'geordi-ir',
        emit: {
          irJson: true,
          tsTypes: false,
        },
        canonicalize: true,
      },
    });

    if (!result.ok) {
      throw new RuntimeContractTestError('Compile failed');
    }

    const artifact = result.artifacts['scene.geordi.json'];
    const ir = parseJsonValue(String(artifact.content));
    if (!isGeordiIr(ir)) {
      throw new RuntimeContractTestError('Invalid IR artifact');
    }

    const context = new FakeCanvasContext2D();
    const canvas = makeCanvas(context as object as CanvasRenderingContext2D);
    installCanvasDocument(canvas);

    const rendered = renderGeordiToCanvas(ir);

    expect(rendered).toBe(canvas);
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(80);
    expect(context.calls).toEqual([
      { name: 'fillRect', args: [0, 0, 120, 80] },
      { name: 'save', args: [] },
      { name: 'beginPath', args: [] },
      { name: 'rect', args: [4, 5, 20, 30] },
      { name: 'closePath', args: [] },
      { name: 'fill', args: [] },
      { name: 'restore', args: [] },
      { name: 'save', args: [] },
      { name: 'fillText', args: ['Compiled', 7, 8] },
      { name: 'restore', args: [] },
    ]);
  });
});
