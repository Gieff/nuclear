/**
 * NuClear P5.2 — `PublicationRenderRequest` assembly, positive cases
 * (ADR-014 D3/D4).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. Each assembled request is
 * checked against the Fase-1 contract oracle `isPublicationRenderRequest`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LIVE_INPUT,
  RENDERER,
  assemblePublicationRenderRequest,
  basePreview,
  isPublicationRenderRequest,
  mockComposerPanel,
  mockFigureSheet,
  mockPreparedView,
  offlinePreparedView,
  offlineSheet,
} from './fixtures/publication-request-fixtures.ts';

describe('NuClear P5.2 — publication request assembly (positive)', () => {
  it('1. assembles a live PDF request the Fase-1 oracle accepts', () => {
    const request = assemblePublicationRenderRequest(LIVE_INPUT);

    assert.ok(isPublicationRenderRequest(request), 'assembled request must satisfy the contract oracle');
    assert.equal(request.renderMode, 'live-medical');
    assert.equal(request.sheetId, mockFigureSheet.id);
    assert.deepEqual(request.sheetSizeMm, [180, 120]);
    assert.equal(request.target.kind, 'temporary-high-resolution');
    assert.deepEqual(
      request.target.kind === 'temporary-high-resolution' ? request.target.pixelDimensions : undefined,
      [2126, 1417],
    );
    assert.equal(request.output.composition, 'hybrid');
    assert.equal(request.panelInputs.length, 1);
    assert.equal(request.panelInputs[0].renderSource, 'live-medical');
    assert.ok(Object.isFrozen(request));
    assert.ok(Object.isFrozen(request.panelInputs));
    // The input sheet and prepared view are never mutated.
    assert.equal(mockFigureSheet.panels[0], mockComposerPanel);
    assert.equal(mockPreparedView.cachedPreviewReference, basePreview);
  });

  it('2. assembles a live PNG request as a flattened raster', () => {
    const request = assemblePublicationRenderRequest({ ...LIVE_INPUT, format: 'png' });
    assert.ok(isPublicationRenderRequest(request));
    assert.equal(request.output.format, 'png');
    assert.equal(request.output.composition, 'raster');
  });

  it('3. assembles an explicitly allowed offline preview request', () => {
    const request = assemblePublicationRenderRequest({
      figureSheet: offlineSheet,
      preparedViews: [offlinePreparedView],
      format: 'pdf',
      dpi: 300,
      colorProfile: 'sRGB',
      renderStateHash: 'sha256:offline-state',
      renderer: RENDERER,
      availabilityPolicy: 'allow-offline-preview',
    });

    assert.ok(isPublicationRenderRequest(request), 'offline request must satisfy the contract oracle');
    assert.equal(request.renderMode, 'offline-cached-preview');
    assert.equal(request.target.kind, 'cached-preview');
    assert.equal(request.output.medicalContentSource, 'cached-preview');
    assert.equal(request.output.resampling, 'forbidden');
    assert.equal(request.panelInputs[0].renderSource, 'cached-preview');
    assert.equal(request.renderStateHash, 'sha256:offline-state');
  });

  it('4. derives the offline render-state hash from the cached preview when omitted', () => {
    const request = assemblePublicationRenderRequest({
      figureSheet: offlineSheet,
      preparedViews: [offlinePreparedView],
      format: 'tiff',
      dpi: 300,
      colorProfile: 'sRGB',
      renderer: RENDERER,
      availabilityPolicy: 'allow-offline-preview',
    });
    assert.ok(isPublicationRenderRequest(request));
    assert.equal(request.renderStateHash, 'sha256:offline-state');
  });
});
