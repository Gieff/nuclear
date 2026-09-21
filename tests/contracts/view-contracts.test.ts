import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FusionCompositionState } from '../../packages/shared-types/src/index.js';
import {
  isCoordinateTransformSet, isIntraStudyLink, isInterStudyLink, isLocalViewOverride,
  isMedicalViewState, isPreparedView, isStateLock, isViewGroup, isViewLink, isViewSlot, isViewportSurface,
} from './view-validators.ts';
import {
  mockFusionPreparedView, mockFusionView, mockIntraStudyLink, mockInterStudyLink, mockLocalOverride, mockMedicalView,
  mockPetPreparedView, mockPetView, mockPreparedView, mockSurface,
} from '../fixtures/view-contracts.fixture.ts';

describe('NuClear Phase 1.3 — View contracts', () => {
  it('validates the complete patient → view plane → viewport chain', () => {
    assert.ok(isMedicalViewState(mockMedicalView));
    assert.ok(isCoordinateTransformSet(mockMedicalView.coordinateTransforms));
    assert.deepEqual(mockMedicalView.coordinateTransforms.viewportSizePx, [512, 512]);
  });

  it('accepts single CT/PET views and composed fusion views with per-layer presentation', () => {
    assert.ok(isMedicalViewState(mockPetView));
    assert.ok(isMedicalViewState(mockFusionView));
    assert.ok(isPreparedView(mockPetPreparedView));
    assert.ok(isPreparedView(mockFusionPreparedView));
  });

  it('enforces per-layer fusion completeness, transfer bounds and no presentation fallback', () => {
    const fusion = mockFusionView.composition as FusionCompositionState;
    const baseLayer = fusion.layers[0]; const overlayLayer = fusion.layers[1];
    const fusionView = (layers: unknown[]) => ({ ...mockFusionView, composition: { mode: 'fusion', blend: 'alpha', layers } });
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, fusion: undefined }])), false);
    assert.equal(isMedicalViewState(fusionView([{ ...baseLayer, fusion: { transferMode: 'highlighted', gamma: 1, blendSlider: 50 } }, overlayLayer])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, presentation: { ...overlayLayer.presentation as object, voi: [0, 8] } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, presentation: { ...overlayLayer.presentation as object, colormapId: undefined } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, presentation: { ...overlayLayer.presentation as object, colormapId: '' } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, baseLayer, overlayLayer])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, binding: { ...overlayLayer.binding as object, role: 'base' } }])), false);
    assert.equal(isMedicalViewState(fusionView([{ ...baseLayer, presentation: { ...baseLayer.presentation as object, voi: undefined } }, overlayLayer])), false);
    assert.equal(isMedicalViewState(fusionView([{ ...baseLayer, presentation: { ...baseLayer.presentation as object, opacity: 2 } }, overlayLayer])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, fusion: { ...overlayLayer.fusion as object, transferMode: 'blend' } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, fusion: { ...overlayLayer.fusion as object, gamma: 0 } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, fusion: { ...overlayLayer.fusion as object, gamma: -1 } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, fusion: { ...overlayLayer.fusion as object, blendSlider: 101 } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, fusion: { ...overlayLayer.fusion as object, blendSlider: -1 } }])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer])), false);
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...baseLayer, binding: { ...baseLayer.binding as object, role: 'reference' } }])), false);
    assert.equal(isMedicalViewState({ ...mockFusionView, presentation: { ...baseLayer.presentation as object } }), false);
    assert.equal(isMedicalViewState({ ...mockMedicalView, presentation: undefined }), false);
  });

  it('single-sources PET overlay overall opacity from blendSlider, rejecting presentation.opacity', () => {
    const fusion = mockFusionView.composition as FusionCompositionState;
    const baseLayer = fusion.layers[0]; const overlayLayer = fusion.layers[1];
    const fusionView = (layers: unknown[]) => ({ ...mockFusionView, composition: { mode: 'fusion', blend: 'alpha', layers } });
    assert.equal(isMedicalViewState(fusionView([baseLayer, { ...overlayLayer, presentation: { ...overlayLayer.presentation as object, opacity: 1 } }])), false);
  });

  it('rejects persisted screen-pixel substitutes and invalid camera state', () => {
    assert.equal(isMedicalViewState({ ...mockMedicalView, camera: { ...mockMedicalView.camera, zoom: 0 } }), false);
    assert.equal(isMedicalViewState({ ...mockMedicalView, coordinateTransforms: { ...mockMedicalView.coordinateTransforms, viewportSizePx: [0, 512] } }), false);
  });

  it('distinguishes co-referenced and transformed links', () => {
    assert.ok(isIntraStudyLink(mockIntraStudyLink));
    assert.ok(isInterStudyLink(mockInterStudyLink));
    assert.ok(isViewLink(mockIntraStudyLink));
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, sourceFrameOfReferenceUID: mockInterStudyLink.targetFrameOfReferenceUID }), false);
  });

  it('keeps locks, links, and local overrides as separate contracts', () => {
    assert.ok(mockPreparedView.links.every(isViewLink));
    assert.ok(isLocalViewOverride(mockLocalOverride));
    assert.equal(mockPreparedView.locks[0].locked, true);
    assert.equal(mockLocalOverride.targetComposerViewInstanceId, 'composer-instance');
  });

  it('distinguishes logical View state from stable surface identity', () => {
    assert.ok(isViewportSurface(mockSurface));
    assert.notEqual(mockSurface.viewportId, mockMedicalView.id);
    assert.equal('webglContext' in mockSurface, false);
  });

  it('validates slot, group, lock, prepared view and preview metadata contracts', () => {
    const slots = Array.from({ length: 16 }, (_, index) => ({
      id: `slot-${index}`, groupId: `group-${Math.floor(index / 4)}`, role: ['MIP', 'PET', 'GENERIC', 'FUSION'][index % 4], status: 'bound',
    }));
    const surfaces = Array.from({ length: 16 }, (_, index) => ({ surfaceId: `surface-${index}`, viewportId: `viewport-${index}`, lifecycle: 'available' }));
    assert.ok(slots.every(isViewSlot));
    assert.ok(isViewGroup({ id: 'group-0', slotIds: ['slot-0', 'slot-1', 'slot-2', 'slot-3'] }));
    assert.ok(isStateLock(mockPreparedView.locks[0]));
    assert.ok(isPreparedView(mockPreparedView));
    assert.ok(surfaces.every(isViewportSurface));
    assert.equal(new Set(surfaces.map((surface) => surface.viewportId)).size, 16);
  });

  it('rejects malformed geometry, presentation, payload, identity and residency references', () => {
    assert.equal(isMedicalViewState({ ...mockMedicalView, spatial: { ...mockMedicalView.spatial, viewUp: [0, 0, 1] } }), false);
    assert.equal(isMedicalViewState({ ...mockMedicalView, presentation: { ...mockMedicalView.presentation, suvRange: [10, 2] } }), false);
    const fusion = mockFusionView.composition as FusionCompositionState;
    assert.equal(isMedicalViewState({ ...mockFusionView, composition: { ...mockFusionView.composition, layers: [{ ...fusion.layers[0] }, { ...fusion.layers[1], presentation: { ...(fusion.layers[1].presentation as object), opacity: 2 } }] } }), false);
    assert.equal(isIntraStudyLink({ ...mockIntraStudyLink, geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, snapshots: [] } }), false);
    assert.equal(isIntraStudyLink({ ...mockIntraStudyLink, geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, assetIds: [mockIntraStudyLink.geometryEvidence.assetIds[0], mockIntraStudyLink.geometryEvidence.assetIds[0]] } }), false);
    assert.equal(isIntraStudyLink({ ...mockIntraStudyLink, geometryEvidence: { ...mockIntraStudyLink.geometryEvidence, snapshots: mockIntraStudyLink.geometryEvidence.snapshots.map((snapshot) => ({ ...snapshot, frameOfReferenceUID: 'wrong-frame' })) } }), false);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, spatialTransform: { ...mockInterStudyLink.spatialTransform, units: 'cm' } }), false);
    assert.equal(isInterStudyLink({ ...mockInterStudyLink, spatialTransform: { ...mockInterStudyLink.spatialTransform, validity: { ...mockInterStudyLink.spatialTransform!.validity, isValid: false } } }), false);
    assert.equal(isLocalViewOverride({ ...mockLocalOverride, overrides: [{ state: 'camera', value: { zoom: 0 } }] }), false);
    assert.equal(isViewGroup({ id: 'group-0', slotIds: ['slot-0', 'slot-0', 'slot-2', 'slot-3'] }), false);
    assert.equal(isViewSlot({ id: 'slot-0', groupId: 'group-0', role: 'PET', status: 'bound', resourceDemand: { assetId: 'a', priority: 'bad', requiredTiers: [] } }), false);
    assert.equal(isViewportSurface({ ...mockSurface, lifecycle: 'disposed', boundViewId: mockMedicalView.id }), false);
    assert.equal(isPreparedView({ ...mockPreparedView, provenance: { ...mockPreparedView.provenance, sourceFingerprints: [{}] } }), false);
  });
});
