/**
 * NuClear P5.5a — live publication render orchestration (ADR-014 D1/D3).
 *
 * Pure Node: the renderer is a fake `PublicationRendererPort`; no DOM, WebGL or
 * Cornerstone is involved. The real-harness adapter is a separate slice.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

import type { PreparedViewId } from '../../packages/shared-types/src/index.js';
import type {
  PublicationPanelRaster,
  PublicationPanelRenderRequest,
  PublicationRendererPort,
} from '../../packages/figure-engine/src/publication/index.ts';

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  assemblePublicationRenderRequest,
  renderLivePublication,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockComposerPanel, mockFigureSheet, mockPdfRenderRequest } = await import(
  '../fixtures/figure-contracts.fixture.ts'
);
const { mockPreparedView } = await import('../fixtures/view-contracts.fixture.ts');

interface FakePort {
  readonly port: PublicationRendererPort;
  readonly calls: PublicationPanelRenderRequest[];
}

function defaultRaster(request: PublicationPanelRenderRequest): PublicationPanelRaster {
  const [width, height] = request.target.pixelDimensions;
  return {
    panelId: request.panelId,
    pixelDimensions: [width, height],
    colorProfile: request.target.colorProfile,
    rgbaBase64: 'AAAA',
    byteLength: width * height * 4,
    renderer: { rendererName: 'fake-renderer', rendererVersion: '1.0.0' },
  };
}

function fakePort(
  responder: (request: PublicationPanelRenderRequest) => PublicationPanelRaster = defaultRaster,
): FakePort {
  const calls: PublicationPanelRenderRequest[] = [];
  const port: PublicationRendererPort = {
    async renderPanel(request) {
      calls.push(request);
      return responder(request);
    },
  };
  return { port, calls };
}

function expectError(run: () => Promise<unknown>, code: string): Promise<void> {
  return assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    return true;
  });
}

function twoPanelRequest() {
  const panelB = {
    ...mockComposerPanel,
    id: 'panel-b',
    viewInstance: {
      ...mockComposerPanel.viewInstance,
      id: 'instance-b',
      preparedViewId: 'prepared-ct-b',
      medicalViewBinding: {
        ...mockComposerPanel.viewInstance.medicalViewBinding,
        preparedViewId: 'prepared-ct-b',
      },
    },
  } as unknown as typeof mockComposerPanel;
  const preparedViewB = { ...mockPreparedView, id: 'prepared-ct-b' as PreparedViewId };
  return assemblePublicationRenderRequest({
    figureSheet: { ...mockFigureSheet, panels: [mockComposerPanel, panelB] },
    preparedViews: [mockPreparedView, preparedViewB],
    format: 'pdf',
    dpi: 300,
    colorProfile: 'sRGB',
    renderStateHash: 'sha256:live',
    renderer: { rendererName: 'fake-renderer', rendererVersion: '1.0.0' },
    availabilityPolicy: 'require-online',
  });
}

describe('NuClear P5.5a — live publication render orchestration', () => {
  it('1. renders one panel at its physical aperture and returns a frozen result', async () => {
    const { port, calls } = fakePort();
    const result = await renderLivePublication(mockPdfRenderRequest, port);

    assert.equal(result.sheetId, mockFigureSheet.id);
    assert.equal(result.renderMode, 'live-medical');
    assert.equal(result.renderStateHash, mockPdfRenderRequest.renderStateHash);
    assert.equal(result.panels.length, 1);
    assert.deepEqual(result.panels[0].pixelDimensions, [945, 945]);
    assert.equal(result.panels[0].byteLength, 945 * 945 * 4);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.panels));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].panelId, mockComposerPanel.id);
    assert.equal(calls[0].target.kind, 'temporary-high-resolution');
    assert.deepEqual(
      calls[0].target.kind === 'temporary-high-resolution' ? calls[0].target.pixelDimensions : undefined,
      [945, 945],
    );
    assert.equal(calls[0].target.liveCanvasPolicy, 'never-resize-live-canvas');
    if (calls[0].target.kind === 'temporary-high-resolution') {
      assert.equal(calls[0].target.dpi, 300);
    }
    assert.equal(calls[0].medicalViewState, mockPreparedView.state);
    assert.equal(calls[0].renderStateHash, mockPdfRenderRequest.renderStateHash);
  });

  it('2. renders every panel in request order', async () => {
    const { port, calls } = fakePort();
    const result = await renderLivePublication(twoPanelRequest(), port);
    assert.deepEqual(
      result.panels.map((raster) => raster.panelId),
      [mockComposerPanel.id, 'panel-b'],
    );
    assert.deepEqual(
      calls.map((call) => call.panelId),
      [mockComposerPanel.id, 'panel-b'],
    );
  });

  it('3. refuses a non-live request or a non-temporary target', async () => {
    await expectError(
      () => renderLivePublication({ ...mockPdfRenderRequest, renderMode: 'offline-cached-preview' }, fakePort().port),
      FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
    );
    await expectError(
      () =>
        renderLivePublication(
          {
            ...mockPdfRenderRequest,
            target: { kind: 'cached-preview', colorProfile: 'sRGB', resampling: 'forbidden', liveCanvasPolicy: 'never-resize-live-canvas' },
          },
          fakePort().port,
        ),
      FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
    );
  });

  it('4. fails closed on unavailable, loading or non-live panel sources', async () => {
    for (const state of ['loading', 'offline-cached', 'missing', 'mismatch'] as const) {
      await expectError(
        () =>
          renderLivePublication(
            {
              ...mockPdfRenderRequest,
              panelInputs: [{ ...mockPdfRenderRequest.panelInputs[0], availability: { state } }],
            },
            fakePort().port,
          ),
        FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
      );
    }
    await expectError(
      () =>
        renderLivePublication(
          { ...mockPdfRenderRequest, panelInputs: [{ ...mockPdfRenderRequest.panelInputs[0], renderSource: 'cached-preview' }] } as unknown as typeof mockPdfRenderRequest,
          fakePort().port,
        ),
      FIGURE_PUBLICATION_ERROR_CODES.renderUnavailable,
    );
  });

  it('5. refuses a malformed renderer result (panel, size, byte length, identity)', async () => {
    const malformed: ReadonlyArray<Partial<PublicationPanelRaster>> = [
      { panelId: 'panel-other' as PublicationPanelRaster['panelId'] },
      { pixelDimensions: [512, 512] },
      { byteLength: 1 },
      { colorProfile: '' },
      { renderer: { rendererName: '', rendererVersion: '1' } },
    ];
    for (const override of malformed) {
      const { port } = fakePort((request) => ({ ...defaultRaster(request), ...override }));
      await expectError(
        () => renderLivePublication(mockPdfRenderRequest, port),
        FIGURE_PUBLICATION_ERROR_CODES.rasterInvalid,
      );
    }
  });

  it('6. wraps a port failure as FIGURE_PUBLICATION_RENDER_FAILED preserving the cause', async () => {
    const cause = new Error('renderer exploded');
    const port: PublicationRendererPort = {
      async renderPanel() {
        throw cause;
      },
    };
    await assert.rejects(
      () => renderLivePublication(mockPdfRenderRequest, port),
      (error: unknown) => {
        assert.ok(error instanceof FigurePublicationError);
        assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.renderFailed);
        assert.equal(error.cause, cause);
        return true;
      },
    );
  });

  it('7. refuses a malformed request, port or sheet binding', async () => {
    await expectError(
      () => renderLivePublication(null as never, fakePort().port),
      FIGURE_PUBLICATION_ERROR_CODES.renderFailed,
    );
    await expectError(
      () => renderLivePublication(mockPdfRenderRequest, {} as unknown as PublicationRendererPort),
      FIGURE_PUBLICATION_ERROR_CODES.renderFailed,
    );

    const input = mockPdfRenderRequest.panelInputs[0];
    const withInput = (patch: Record<string, unknown>): typeof mockPdfRenderRequest =>
      ({ ...mockPdfRenderRequest, panelInputs: [{ ...input, ...patch }] }) as unknown as typeof mockPdfRenderRequest;
    const cases: ReadonlyArray<Record<string, unknown>> = [
      // preparedView.id disagrees with the declared preparedViewId.
      { preparedView: { ...input.preparedView, id: 'prepared-other' } },
      // The panel is not present in the figure sheet.
      { panelId: 'panel-ghost' },
      // The sheet binding's composer view-instance id disagrees with the input.
      { composerViewInstanceId: 'instance-other' },
      // The sheet binding's preparedViewId disagrees with the input.
      { preparedViewId: 'prepared-other', preparedView: { ...input.preparedView, id: 'prepared-other' } },
    ];
    for (const patch of cases) {
      await expectError(
        () => renderLivePublication(withInput(patch), fakePort().port),
        FIGURE_PUBLICATION_ERROR_CODES.renderFailed,
      );
    }
  });
});
