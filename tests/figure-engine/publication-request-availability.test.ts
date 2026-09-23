/**
 * NuClear P5.2 — `PublicationRenderRequest` assembly, fail-closed availability
 * and offline-provenance cases (ADR-014 D3/D4).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone.
 */
import { describe, it } from 'node:test';

import type {
  CachedPreviewReference,
  ComposerPanel,
  ComposerViewInstanceId,
  FigurePanelId,
  FigureSheet,
  PreparedView,
  PreparedViewId,
} from '../../packages/shared-types/src/index.js';
import {
  FIGURE_PUBLICATION_ERROR_CODES,
  LIVE_INPUT,
  RENDERER,
  assemblePublicationRenderRequest,
  binding,
  expectError,
  mockComposerPanel,
  mockPreparedView,
  offlinePreparedView,
  offlinePreview,
  offlineSheet,
  panelWith,
  sheetWith,
} from './fixtures/publication-request-fixtures.ts';

describe('NuClear P5.2 — publication request availability', () => {
  it('5. fails closed on missing, mismatch and loading availability', () => {
    for (const state of ['missing', 'mismatch', 'loading'] as const) {
      expectError(
        () =>
          assemblePublicationRenderRequest({
            ...LIVE_INPUT,
            figureSheet: sheetWith([panelWith('panel-a', 'composer-instance', 'prepared-ct', binding({ state }))]),
          }),
        FIGURE_PUBLICATION_ERROR_CODES.availabilityRefused,
      );
    }
  });

  it('6. refuses an offline preview unless the policy explicitly allows it', () => {
    expectError(
      () =>
        assemblePublicationRenderRequest({
          figureSheet: offlineSheet,
          preparedViews: [offlinePreparedView],
          format: 'pdf',
          dpi: 300,
          colorProfile: 'sRGB',
          renderStateHash: 'sha256:offline-state',
          renderer: RENDERER,
          availabilityPolicy: 'require-online',
        }),
      FIGURE_PUBLICATION_ERROR_CODES.availabilityRefused,
    );
  });

  it('7. refuses a request that mixes online and offline-cached panels', () => {
    const panelB: ComposerPanel = {
      ...mockComposerPanel,
      id: 'panel-b' as FigurePanelId,
      viewInstance: {
        ...mockComposerPanel.viewInstance,
        id: 'instance-b' as ComposerViewInstanceId,
        preparedViewId: 'prepared-ct-b' as PreparedViewId,
        medicalViewBinding: {
          preparedViewId: 'prepared-ct-b' as PreparedViewId,
          availability: { state: 'offline-cached' },
          cachedPreviewReference: offlinePreview,
        },
      },
    };
    const preparedViewB: PreparedView = { ...offlinePreparedView, id: 'prepared-ct-b' as PreparedViewId };
    expectError(
      () =>
        assemblePublicationRenderRequest({
          figureSheet: sheetWith([mockComposerPanel, panelB]),
          preparedViews: [mockPreparedView, preparedViewB],
          format: 'pdf',
          dpi: 300,
          colorProfile: 'sRGB',
          renderer: RENDERER,
          availabilityPolicy: 'allow-offline-preview',
        }),
      FIGURE_PUBLICATION_ERROR_CODES.mixedAvailability,
    );
  });

  it('8. refuses an offline panel without a verifiable cached preview', () => {
    const cases: ReadonlyArray<{ preparedViews: readonly PreparedView[]; sheet: FigureSheet }> = [
      // Binding has no cached preview at all.
      {
        sheet: sheetWith([panelWith('panel-a', 'composer-instance', 'prepared-ct', binding({ state: 'offline-cached' }))]),
        preparedViews: [offlinePreparedView],
      },
      // Prepared view has no cached preview.
      {
        sheet: offlineSheet,
        preparedViews: [{ ...mockPreparedView, cachedPreviewReference: undefined }],
      },
      // Prepared preview render-state hash differs from the binding preview.
      {
        sheet: offlineSheet,
        preparedViews: [{ ...offlinePreparedView, cachedPreviewReference: { ...offlinePreview, renderStateHash: 'sha256:other' } }],
      },
    ];
    for (const testCase of cases) {
      expectError(
        () =>
          assemblePublicationRenderRequest({
            figureSheet: testCase.sheet,
            preparedViews: testCase.preparedViews,
            format: 'pdf',
            dpi: 300,
            colorProfile: 'sRGB',
            renderStateHash: 'sha256:offline-state',
            renderer: RENDERER,
            availabilityPolicy: 'allow-offline-preview',
          }),
        FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
      );
    }
  });

  it('9. refuses an offline fingerprint-set or render-state-hash mismatch', () => {
    const tamperedPreview: CachedPreviewReference = {
      ...offlinePreview,
      sourceFingerprintSet: [...offlinePreview.sourceFingerprintSet, offlinePreview.sourceFingerprintSet[0]],
    };
    const tamperedSheet = sheetWith([
      panelWith('panel-a', 'composer-instance', 'prepared-ct', binding({ state: 'offline-cached' }, tamperedPreview)),
    ]);
    expectError(
      () =>
        assemblePublicationRenderRequest({
          figureSheet: tamperedSheet,
          preparedViews: [{ ...offlinePreparedView, cachedPreviewReference: tamperedPreview }],
          format: 'pdf',
          dpi: 300,
          colorProfile: 'sRGB',
          renderer: RENDERER,
          availabilityPolicy: 'allow-offline-preview',
        }),
      FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
    );

    expectError(
      () =>
        assemblePublicationRenderRequest({
          figureSheet: offlineSheet,
          preparedViews: [offlinePreparedView],
          format: 'pdf',
          dpi: 300,
          colorProfile: 'sRGB',
          renderStateHash: 'sha256:not-the-preview',
          renderer: RENDERER,
          availabilityPolicy: 'allow-offline-preview',
        }),
      FIGURE_PUBLICATION_ERROR_CODES.offlineProvenanceInvalid,
    );
  });
});
