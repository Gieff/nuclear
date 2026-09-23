/**
 * Shared fixtures and support for the Phase 5 P5.2 publication-request tests.
 *
 * This is NOT a test file (no `.test.ts` suffix): it is typechecked but not run
 * as a suite. It registers the repository `.js`→`.ts` resolve hook once and
 * exposes the real fixtures plus small request builders.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

import type {
  AssetAvailabilityStatus,
  CachedPreviewReference,
  ComposerPanel,
  ComposerViewInstanceId,
  FigurePanelId,
  FigureSheet,
  MedicalViewBinding,
  PreparedView,
  PreparedViewId,
} from '../../../packages/shared-types/src/index.js';

register(new URL('../../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

export const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  assemblePublicationRenderRequest,
} = await import('../../../packages/figure-engine/src/publication/index.ts');

export const { isPublicationRenderRequest } = await import('../../contracts/figure-validators.ts');
export const { mockComposerPanel, mockFigureSheet } = await import(
  '../../fixtures/figure-contracts.fixture.ts'
);
export const { mockPreparedView } = await import('../../fixtures/view-contracts.fixture.ts');

export const RENDERER = { rendererName: 'nuclear-medical-renderer', rendererVersion: '0.1.0' };

export function expectError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof FigurePublicationError,
      `expected FigurePublicationError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}

const baseBinding = mockComposerPanel.viewInstance.medicalViewBinding;

export function binding(availability: unknown, cachedPreviewReference?: unknown): MedicalViewBinding {
  return {
    preparedViewId: baseBinding.preparedViewId,
    availability: availability as AssetAvailabilityStatus,
    ...(cachedPreviewReference === undefined
      ? {}
      : { cachedPreviewReference: cachedPreviewReference as CachedPreviewReference }),
  };
}

export function panelWith(
  id: string,
  viewId: string,
  preparedViewId: string,
  viewBinding: MedicalViewBinding,
): ComposerPanel {
  return {
    ...mockComposerPanel,
    id: id as FigurePanelId,
    viewInstance: {
      ...mockComposerPanel.viewInstance,
      id: viewId as ComposerViewInstanceId,
      preparedViewId: preparedViewId as PreparedViewId,
      medicalViewBinding: viewBinding,
    },
  };
}

export function sheetWith(panels: readonly ComposerPanel[]): FigureSheet {
  return { ...mockFigureSheet, panels };
}

export const basePreview = mockPreparedView.cachedPreviewReference as CachedPreviewReference;
export const offlinePreview: CachedPreviewReference = {
  ...basePreview,
  renderStateHash: 'sha256:offline-state',
};
export const offlinePreparedView: PreparedView = {
  ...mockPreparedView,
  cachedPreviewReference: offlinePreview,
};
export const offlinePanel = panelWith(
  'panel-a',
  'composer-instance',
  'prepared-ct',
  binding({ state: 'offline-cached' }, offlinePreview),
);
export const offlineSheet = sheetWith([offlinePanel]);

export const LIVE_INPUT = {
  figureSheet: mockFigureSheet,
  preparedViews: [mockPreparedView],
  format: 'pdf' as const,
  dpi: 300,
  colorProfile: 'sRGB',
  renderStateHash: 'sha256:medical-render-state',
  renderer: RENDERER,
  availabilityPolicy: 'require-online' as const,
};
