import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAnnotationAnchor,
  isComposerPanel,
  isComposerViewInstance,
  isFigureAnnotation,
  isFigureSheet,
  isMedicalViewBinding,
  isPanelFramingState,
  isPanelLayoutState,
  isPublicationRenderRequest,
  isCachedPreviewRenderTargetSpec,
  isTemporaryRenderTargetSpec,
} from './figure-validators.ts';
import {
  mockAnnotations,
  mockComposerPanel,
  mockComposerViewInstance,
  mockEditorialAnchor,
  mockFigureSheet,
  mockFraming,
  mockLayout,
  mockMedicalViewBinding,
  mockPdfRenderRequest,
  mockPatientAnchor,
} from '../fixtures/figure-contracts.fixture.ts';
import { mockPreparedView } from '../fixtures/view-contracts.fixture.ts';

describe('NuClear Phase 1.3 — Figure contracts', () => {
  it('keeps panel content and sheet coordinates physical and distinct', () => {
    assert.ok(isPanelFramingState(mockFraming));
    assert.ok(isPanelLayoutState(mockLayout));
    assert.ok(isComposerPanel(mockComposerPanel));
    assert.deepEqual(mockFraming.contentSizeMm, [80, 80]);
    assert.deepEqual(mockLayout.positionMm, [20, 20]);
  });

  it('preserves patient anchors while editorial anchors remain panel-fixed', () => {
    assert.ok(isAnnotationAnchor(mockPatientAnchor));
    assert.ok(isAnnotationAnchor(mockEditorialAnchor));
    assert.ok(mockAnnotations.every(isFigureAnnotation));
    assert.equal(mockPatientAnchor.kind, 'patient');
    assert.equal(mockEditorialAnchor.kind, 'panel-content');
    assert.equal(isAnnotationAnchor({ kind: 'patient', screenPixels: [10, 10], planeToleranceMm: 2, outOfPlaneBehavior: 'hide' }), false);
    assert.equal(isAnnotationAnchor({ kind: 'patient', positionLpsMm: [0, 0, 0], planeToleranceMm: -1, outOfPlaneBehavior: 'hide' }), false);
  });

  it('binds a Composer instance to one PreparedView and isolates local overrides', () => {
    assert.ok(isMedicalViewBinding(mockMedicalViewBinding));
    assert.ok(isComposerViewInstance(mockComposerViewInstance));
    assert.equal(mockComposerViewInstance.localOverrides[0].targetComposerViewInstanceId, mockComposerViewInstance.id);
    assert.equal(isComposerViewInstance({ ...mockComposerViewInstance, preparedViewId: 'other-prepared' }), false);
    assert.equal(isComposerViewInstance({ ...mockComposerViewInstance, localOverrides: [{ ...mockComposerViewInstance.localOverrides[0], targetComposerViewInstanceId: 'other-instance' }] }), false);
    assert.equal(mockComposerViewInstance.medicalViewBinding.availability.state, 'online');
  });

  it('validates a complete serializable figure sheet', () => {
    assert.ok(isFigureSheet(mockFigureSheet));
    assert.equal(isFigureSheet({ ...mockFigureSheet, panels: [{ ...mockComposerPanel, layout: { ...mockLayout, sizeMm: [0, 80] } }] }), false);
    assert.equal(isFigureSheet({ ...mockFigureSheet, panels: [mockComposerPanel, { ...mockComposerPanel, id: 'panel-b' }] }), false);
    assert.equal(isFigureSheet({ ...mockFigureSheet, annotations: [mockAnnotations[0], { ...mockAnnotations[0], id: 'annotation-duplicate' }] }), true);
    assert.equal(isFigureSheet({ ...mockFigureSheet, annotations: [mockAnnotations[0], { ...mockAnnotations[1], id: mockAnnotations[0].id }] }), false);
    assert.equal(isMedicalViewBinding({ ...mockMedicalViewBinding, availability: { state: 'mismatch' } }), true);
  });

  it('uses a temporary high-resolution target and preserves PDF vectors', () => {
    assert.ok(isTemporaryRenderTargetSpec(mockPdfRenderRequest.target));
    assert.ok(isPublicationRenderRequest(mockPdfRenderRequest));
    assert.equal(mockPdfRenderRequest.target.liveCanvasPolicy, 'never-resize-live-canvas');
    assert.equal(mockPdfRenderRequest.output.composition, 'hybrid');
    assert.equal(isPublicationRenderRequest({ ...mockPdfRenderRequest, target: { ...mockPdfRenderRequest.target, pixelDimensions: [512, 512] } }), false);
    assert.ok(isPublicationRenderRequest({ ...mockPdfRenderRequest, output: { format: 'png', composition: 'raster', medicalLayer: 'live-high-resolution-raster', editorialLayer: 'raster', medicalContentSource: 'live-medical' } }));
  });

  it('fails closed for unavailable medical sources', () => {
    const missing = { ...mockPdfRenderRequest, panelInputs: [{ ...mockPdfRenderRequest.panelInputs[0], availability: { state: 'missing' as const } }] };
    const mismatch = { ...mockPdfRenderRequest, panelInputs: [{ ...mockPdfRenderRequest.panelInputs[0], availability: { state: 'mismatch' as const } }] };
    const cached = { ...mockPdfRenderRequest, panelInputs: [{ ...mockPdfRenderRequest.panelInputs[0], availability: { state: 'offline-cached' as const } }] };
    assert.equal(isPublicationRenderRequest(missing), false);
    assert.equal(isPublicationRenderRequest(mismatch), false);
    assert.equal(isPublicationRenderRequest(cached), false);
  });

  it('permits an explicitly labelled offline preview only with matching cached provenance', () => {
    const cachedPreview = { ...mockPreparedView.cachedPreviewReference!, renderStateHash: mockPdfRenderRequest.renderStateHash };
    const preparedView = { ...mockPreparedView, cachedPreviewReference: cachedPreview };
    const offlinePanel = {
      ...mockComposerPanel,
      viewInstance: {
        ...mockComposerPanel.viewInstance,
        medicalViewBinding: {
          ...mockComposerPanel.viewInstance.medicalViewBinding,
          availability: { state: 'offline-cached' as const },
          cachedPreviewReference: cachedPreview,
        },
      },
    };
    const offline = {
      ...mockPdfRenderRequest,
      figureSheet: { ...mockPdfRenderRequest.figureSheet, panels: [offlinePanel] },
      target: { kind: 'cached-preview' as const, colorProfile: 'sRGB', resampling: 'forbidden' as const, liveCanvasPolicy: 'never-resize-live-canvas' as const },
      availabilityPolicy: 'allow-offline-preview' as const,
      renderMode: 'offline-cached-preview' as const,
      output: { format: 'pdf' as const, composition: 'hybrid' as const, medicalLayer: 'cached-preview-raster' as const, editorialLayer: 'native-vector' as const, medicalContentSource: 'cached-preview' as const, resampling: 'forbidden' as const, preserveTypography: true as const, preserveAnnotations: true as const },
      panelInputs: [{
        ...mockPdfRenderRequest.panelInputs[0],
        preparedView,
        availability: { state: 'offline-cached' as const },
        renderSource: 'cached-preview' as const,
        cachedPreviewReference: cachedPreview,
      }],
    };
    assert.ok(isPublicationRenderRequest(offline));
    assert.equal(isPublicationRenderRequest({ ...offline, panelInputs: [{ ...offline.panelInputs[0], cachedPreviewReference: { ...cachedPreview, renderStateHash: 'sha256:wrong' } }] }), false);
    assert.equal(isPublicationRenderRequest({ ...offline, renderMode: 'live-medical' as const }), false);
    assert.equal(isPublicationRenderRequest({ ...offline, target: mockPdfRenderRequest.target }), false);
    assert.equal(isPublicationRenderRequest({ ...offline, output: { ...offline.output, medicalLayer: 'live-high-resolution-raster' as const, medicalContentSource: 'live-medical' as const } }), false);
    assert.equal(isPublicationRenderRequest({ ...offline, panelInputs: [{ ...offline.panelInputs[0], availability: { state: 'online' as const } }] }), false);
    const optionalFieldChanged = { ...cachedPreview, sourceFingerprintSet: cachedPreview.sourceFingerprintSet.map((fingerprint) => ({ ...fingerprint, totalBytes: (fingerprint.totalBytes ?? 0) + 1 })) };
    assert.equal(isPublicationRenderRequest({ ...offline, panelInputs: [{ ...offline.panelInputs[0], cachedPreviewReference: optionalFieldChanged }] }), false);
    assert.equal(isCachedPreviewRenderTargetSpec(mockPdfRenderRequest.target), false);
  });
});
