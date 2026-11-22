import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  BackendUnavailableError,
  cellFromPoint,
  createGpuSurfacePresenter,
  RendererFaultError,
  type EndpointReceipt,
  type GpuGridGeometry,
  type GpuPackedSurface,
  type GpuSurfacePresenter,
  type GpuSurfacePresenterFactory,
} from './index.js';

interface FakeOptions {
  readonly label: string;
}

class FakePresenter implements GpuSurfacePresenter {
  public readonly calls: string[] = [];

  constructor(public readonly label: string) {}

  present(current: GpuPackedSurface, target: GpuPackedSurface): void {
    this.calls.push(`present:${String(current.width)}x${String(target.height)}`);
  }

  resize(): void {
    this.calls.push('resize');
  }

  cellFromPoint(): null {
    return null;
  }

  getLastReceipt(): EndpointReceipt | null {
    return null;
  }

  dispose(): void {
    this.calls.push('dispose');
  }
}

const surface: GpuPackedSurface = {
  width: 2,
  height: 3,
  buffer: new Uint8Array(60),
  sideTable: [],
  renderDirtyWords: new Uint32Array(1),
};

describe('GpuSurfacePresenterFactory', () => {
  const syncFactory: GpuSurfacePresenterFactory<FakeOptions> = (options) =>
    new FakePresenter(options.label);
  const asyncFactory: GpuSurfacePresenterFactory<FakeOptions> = async (options) => {
    await Promise.resolve();
    return new FakePresenter(options.label);
  };

  it('returns GpuSurfacePresenter | Promise<GpuSurfacePresenter>', () => {
    expectTypeOf<ReturnType<GpuSurfacePresenterFactory<FakeOptions>>>().toEqualTypeOf<
      GpuSurfacePresenter | Promise<GpuSurfacePresenter>
    >();
    expectTypeOf<(options: FakeOptions) => GpuSurfacePresenter>().toExtend<
      GpuSurfacePresenterFactory<FakeOptions>
    >();
    expectTypeOf<(options: FakeOptions) => Promise<GpuSurfacePresenter>>().toExtend<
      GpuSurfacePresenterFactory<FakeOptions>
    >();
    expect(syncFactory({ label: 'webgl2' })).toBeInstanceOf(FakePresenter);
    expect(asyncFactory({ label: 'webgpu' })).toBeInstanceOf(Promise);
  });

  it('lets one caller await synchronous and asynchronous backends alike', async () => {
    for (const factory of [syncFactory, asyncFactory]) {
      const presenter = await createGpuSurfacePresenter(factory, { label: 'any' });
      presenter.present(surface, surface, { forceFullRefresh: true });
      presenter.resize({ cssWidth: 640, cssHeight: 384, dpr: 2 });
      expect(presenter.cellFromPoint(0, 0)).toBeNull();
      expect(presenter.getLastReceipt()).toBeNull();
      presenter.dispose();
      expect(presenter).toBeInstanceOf(FakePresenter);
      expect((presenter as FakePresenter).calls).toEqual(['present:2x3', 'resize', 'dispose']);
    }
  });

  it('surfaces an unavailable backend as a typed refusal from either factory shape', async () => {
    const syncRefusal: GpuSurfacePresenterFactory<FakeOptions> = () => {
      throw new BackendUnavailableError('webgl2', 'no WebGL2 context');
    };
    const asyncRefusal: GpuSurfacePresenterFactory<FakeOptions> = () =>
      Promise.reject(new BackendUnavailableError('webgpu', 'navigator.gpu is undefined'));
    await expect(createGpuSurfacePresenter(syncRefusal, { label: 'x' })).rejects.toBeInstanceOf(
      BackendUnavailableError,
    );
    await expect(createGpuSurfacePresenter(asyncRefusal, { label: 'x' })).rejects.toMatchObject({
      code: 'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE',
      backend: 'webgpu',
      reason: 'navigator.gpu is undefined',
    });
  });
});

describe('BackendUnavailableError versus RendererFaultError', () => {
  it('are distinct typed errors with distinct stable codes', () => {
    const unavailable = new BackendUnavailableError('webgpu', 'no adapter');
    const fault = new RendererFaultError('webgpu', 'device lost');
    expect(unavailable).toBeInstanceOf(Error);
    expect(fault).toBeInstanceOf(Error);
    expect(unavailable).not.toBeInstanceOf(RendererFaultError);
    expect(fault).not.toBeInstanceOf(BackendUnavailableError);
    expect(unavailable.code).toBe('GEORDI_E_BIJOU_BACKEND_UNAVAILABLE');
    expect(fault.code).toBe('GEORDI_E_BIJOU_RENDERER_FAULT');
    expect(unavailable.name).toBe('BackendUnavailableError');
    expect(fault.name).toBe('RendererFaultError');
    expect(unavailable.message).toBe(
      'GEORDI_E_BIJOU_BACKEND_UNAVAILABLE: webgpu is unavailable: no adapter',
    );
    expect(fault.message).toBe('GEORDI_E_BIJOU_RENDERER_FAULT: webgpu renderer fault: device lost');
  });
});

describe('cellFromPoint host-boundary law', () => {
  const geometry: GpuGridGeometry = {
    cols: 80,
    rows: 24,
    cellPxW: 16,
    cellPxH: 32,
    canvasPxW: 1295,
    canvasPxH: 768,
  };
  const rect = { left: 10, top: 20, width: 647.5, height: 384 };

  it('maps client coordinates to zero-based cells with start-inclusive, end-exclusive spans', () => {
    expect(cellFromPoint(geometry, rect, 10, 20)).toEqual({ col: 0, row: 0 });
    expect(cellFromPoint(geometry, rect, 10 + 7.99, 20 + 15.99)).toEqual({ col: 0, row: 0 });
    expect(cellFromPoint(geometry, rect, 10 + 8, 20 + 16)).toEqual({ col: 1, row: 1 });
    expect(cellFromPoint(geometry, rect, 10 + 8 * 79, 20 + 16 * 23)).toEqual({ col: 79, row: 23 });
  });

  it('clamps the letterboxed remainder and points outside the canvas into the grid', () => {
    expect(cellFromPoint(geometry, rect, 10 + 647, 20 + 383)).toEqual({ col: 79, row: 23 });
    expect(cellFromPoint(geometry, rect, -500, -500)).toEqual({ col: 0, row: 0 });
    expect(cellFromPoint(geometry, rect, 5000, 5000)).toEqual({ col: 79, row: 23 });
  });

  it('returns null for an empty grid or non-finite or non-positive host geometry', () => {
    expect(cellFromPoint({ ...geometry, cols: 0 }, rect, 10, 20)).toBeNull();
    expect(cellFromPoint({ ...geometry, rows: 0 }, rect, 10, 20)).toBeNull();
    expect(cellFromPoint(geometry, { ...rect, width: 0 }, 10, 20)).toBeNull();
    expect(cellFromPoint(geometry, { ...rect, height: -1 }, 10, 20)).toBeNull();
    expect(cellFromPoint(geometry, { ...rect, left: Number.NaN }, 10, 20)).toBeNull();
    expect(cellFromPoint(geometry, rect, Number.POSITIVE_INFINITY, 20)).toBeNull();
    expect(cellFromPoint(geometry, rect, 10, Number.NaN)).toBeNull();
  });
});
