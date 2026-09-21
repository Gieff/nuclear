import type { InterStudyLink, IntraStudyLink, LocalViewOverride, MedicalViewState, PreparedView, StateLock, ViewGroup, ViewLink, ViewSlot, ViewportSurface } from '../../packages/shared-types/src/index.js';
import { isSpatialTransform, isSourceFingerprint, isViewProvenance } from './validators.ts';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const tuple = (value: unknown, length: number): value is readonly number[] => Array.isArray(value) && value.length === length && value.every(finite);
const matrix = (value: unknown): value is readonly number[] => tuple(value, 16) && value[12] === 0 && value[13] === 0 && value[14] === 0 && value[15] === 1;
const unit = (value: readonly number[]): boolean => Math.abs(Math.hypot(...value) - 1) < 1e-5;
const direction = (value: unknown): boolean => {
  if (!tuple(value, 6)) return false;
  const row = value.slice(0, 3); const column = value.slice(3, 6);
  return unit(row) && unit(column) && Math.abs(row[0] * column[0] + row[1] * column[1] + row[2] * column[2]) < 1e-5;
};
const stateNames = ['spatial', 'camera', 'presentation', 'projection', 'composition'] as const;
const roleNames = ['base', 'overlay', 'reference'] as const;
const binding = (value: unknown): boolean => record(value) && typeof value.assetId === 'string' && value.assetId.length > 0 && typeof value.role === 'string' && roleNames.includes(value.role as typeof roleNames[number]) && (value.transformId === undefined || typeof value.transformId === 'string');
const vector = (value: unknown): value is readonly number[] => tuple(value, 3);
const spatialState = (value: unknown): boolean => {
  if (!record(value) || typeof value.frameOfReferenceUID !== 'string' || !direction(value.orientation) || !vector(value.viewPlaneNormal) || !unit(value.viewPlaneNormal) || !vector(value.viewUp) || !unit(value.viewUp) || Math.abs(value.viewPlaneNormal[0] * value.viewUp[0] + value.viewPlaneNormal[1] * value.viewUp[1] + value.viewPlaneNormal[2] * value.viewUp[2]) > 1e-5 || !vector(value.referenceLocation) || !finite(value.sliceOffsetMm)) return false;
  const [rx, ry, rz, cx, cy, cz] = value.orientation;
  const normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx];
  return Math.abs(normal[0] * value.viewPlaneNormal[0] + normal[1] * value.viewPlaneNormal[1] + normal[2] * value.viewPlaneNormal[2]) > 1 - 1e-5;
};
const cameraState = (value: unknown): boolean => record(value) && finite(value.zoom) && value.zoom > 0 && tuple(value.panMm, 2) && tuple(value.focalPointMm, 2) && finite(value.rotationDeg) && ['manual', 'fit-width', 'fit-height', 'fit-extent'].includes(String(value.fitMode));
const presentationState = (value: unknown): boolean => record(value) && typeof value.invert === 'boolean' && finite(value.opacity) && value.opacity >= 0 && value.opacity <= 1 && (value.voi === undefined || (tuple(value.voi, 2) && value.voi[0] <= value.voi[1])) && (value.suvRange === undefined || (tuple(value.suvRange, 2) && value.suvRange[0] >= 0 && value.suvRange[0] <= value.suvRange[1]));
const projectionState = (value: unknown): boolean => record(value) && ['slice', 'MIP', 'MinIP', 'Average'].includes(String(value.mode)) && (value.slabThicknessMm === undefined || (finite(value.slabThicknessMm) && value.slabThicknessMm > 0)) && (value.parameters === undefined || (record(value.parameters) && Object.values(value.parameters).every((item) => typeof item === 'string' || typeof item === 'boolean' || finite(item))));
const petFusionTransfer = (value: unknown): boolean => record(value) && ['highlighted', 'alpha'].includes(String(value.transferMode)) && finite(value.gamma) && value.gamma > 0 && finite(value.blendSlider) && value.blendSlider >= 0 && value.blendSlider <= 100;
const petFusionOverlayPresentation = (value: unknown): boolean => {
  if (!record(value) || typeof value.colormapId !== 'string' || value.colormapId.length === 0 || typeof value.invert !== 'boolean' || !['nearest', 'linear'].includes(String(value.interpolation))) return false;
  if (value.modalityPresentation !== undefined && !['ct', 'pet', 'mr', 'generic'].includes(String(value.modalityPresentation))) return false;
  if (value.voi !== undefined && !(tuple(value.voi, 2) && value.voi[0] <= value.voi[1])) return false;
  if (value.suvRange !== undefined && !(tuple(value.suvRange, 2) && value.suvRange[0] >= 0 && value.suvRange[0] <= value.suvRange[1])) return false;
  return (value.voi !== undefined) !== (value.suvRange !== undefined) && value.opacity === undefined;
};
const compositionLayer = (value: unknown): boolean => record(value) && binding(value.binding) && presentationState(value.presentation);
const fusionOverlayLayer = (value: unknown): boolean => {
  if (!record(value) || !binding(value.binding) || !record(value.binding) || value.binding.role !== 'overlay') return false;
  return petFusionOverlayPresentation(value.presentation) && petFusionTransfer(value.fusion);
};
const baseCompositionLayer = (value: unknown): boolean => {
  if (!record(value) || !binding(value.binding) || !record(value.binding) || value.binding.role !== 'base') return false;
  if (!presentationState(value.presentation) || !record(value.presentation) || !tuple(value.presentation.voi, 2)) return false;
  return value.fusion === undefined;
};
const compositionState = (value: unknown): boolean => {
  if (!record(value) || !Array.isArray(value.layers) || value.layers.length === 0 || !['single', 'fusion', 'multi-layer'].includes(String(value.mode))) return false;
  const layers = value.layers as unknown[];
  if (value.mode === 'single') return value.blend === undefined && layers.length === 1 && binding(layers[0]);
  if (value.mode === 'fusion') return value.blend === 'alpha' && layers.length >= 2 && baseCompositionLayer(layers[0]) && layers.slice(1).every(fusionOverlayLayer);
  if (value.mode === 'multi-layer') return layers.every((layer) => compositionLayer(layer)) && (value.blend === undefined || ['alpha', 'additive', 'difference', 'checkerboard'].includes(String(value.blend)));
  return false;
};
const resourceDemand = (value: unknown): boolean => record(value) && typeof value.assetId === 'string' && ['visible-interactive', 'visible-read-only', 'prepared-hidden', 'prefetch-candidate', 'unused'].includes(String(value.priority)) && Array.isArray(value.requiredTiers) && value.requiredTiers.every((tier) => ['metadata-only', 'source-available', 'cpu-cached', 'gpu-ready', 'gpu-resident', 'loading', 'evicted'].includes(String(tier)));
const geometrySnapshot = (value: unknown): boolean => record(value) && typeof value.assetId === 'string' && typeof value.frameOfReferenceUID === 'string' && isSourceFingerprint(value.sourceFingerprint) && typeof value.geometricDigest === 'string' && direction(value.orientation) && vector(value.spacingMm) && value.spacingMm.every((item) => item > 0) && vector(value.originLpsMm) && record(value.boundsLpsMm) && vector(value.boundsLpsMm.min) && vector(value.boundsLpsMm.max) && record(value.workerMetadata) && typeof value.workerMetadata.workerVersion === 'string' && typeof value.workerMetadata.operation === 'string' && typeof value.workerMetadata.timestamp === 'string';

export const isCoordinateTransformSet = (value: unknown): boolean => record(value) && matrix(value.patientToViewPlane) && matrix(value.viewPlaneToViewport) && tuple(value.viewportSizePx, 2) && value.viewportSizePx[0] > 0 && value.viewportSizePx[1] > 0;

export const isMedicalViewState = (value: unknown): value is MedicalViewState => {
  if (!record(value) || typeof value.id !== 'string' || !binding(value.dataBinding)) return false;
  const composition = value.composition;
  if (!spatialState(value.spatial) || !cameraState(value.camera) || !projectionState(value.projection) || !compositionState(composition) || !isCoordinateTransformSet(value.coordinateTransforms)) return false;
  if (!record(composition)) return false;
  const dataBinding = value.dataBinding as Record<string, unknown>;
  if (composition.mode === 'single') {
    if (!presentationState(value.presentation)) return false;
    const layer = composition.layers[0];
    return record(layer) && layer.assetId === dataBinding.assetId && layer.role === dataBinding.role;
  }
  if (composition.mode === 'fusion' || composition.mode === 'multi-layer') {
    if (value.presentation !== undefined) return false;
    const first = composition.layers[0];
    if (!record(first) || !record(first.binding)) return false;
    return first.binding.assetId === dataBinding.assetId && first.binding.role === dataBinding.role;
  }
  return false;
};

export const isIntraStudyLink = (value: unknown): value is IntraStudyLink => {
  if (!record(value) || value.kind !== 'co-referenced' || typeof value.sourceViewId !== 'string' || typeof value.targetViewId !== 'string' || typeof value.frameOfReferenceUID !== 'string' || !Array.isArray(value.synchronizedState) || !value.synchronizedState.every((item) => stateNames.includes(item as typeof stateNames[number])) || !record(value.geometryEvidence) || value.geometryEvidence.verified !== true || value.geometryEvidence.frameOfReferenceUID !== value.frameOfReferenceUID || !Array.isArray(value.geometryEvidence.assetIds) || value.geometryEvidence.assetIds.length === 0 || new Set(value.geometryEvidence.assetIds).size !== value.geometryEvidence.assetIds.length || !Array.isArray(value.geometryEvidence.snapshots) || value.geometryEvidence.snapshots.length !== value.geometryEvidence.assetIds.length || !value.geometryEvidence.snapshots.every(geometrySnapshot)) return false;
  const assetIds = new Set(value.geometryEvidence.assetIds);
  return value.geometryEvidence.snapshots.every((snapshot) => record(snapshot) && assetIds.has(snapshot.assetId) && snapshot.frameOfReferenceUID === value.geometryEvidence.frameOfReferenceUID) && new Set(value.geometryEvidence.snapshots.map((snapshot) => record(snapshot) ? snapshot.assetId : '')).size === assetIds.size;
};

export const isInterStudyLink = (value: unknown): value is InterStudyLink => {
  if (!record(value) || value.kind !== 'inter-study' || value.direction !== 'source-to-target' || value.sourceFrameOfReferenceUID === value.targetFrameOfReferenceUID || !['relative', 'transformed'].includes(String(value.mode)) || typeof value.sourceViewId !== 'string' || typeof value.targetViewId !== 'string' || !Array.isArray(value.synchronizedState) || !value.synchronizedState.every((item) => stateNames.includes(item as typeof stateNames[number])) || !finite(value.toleranceMm) || value.toleranceMm < 0 || !['clamp', 'hide', 'warn'].includes(String(value.outOfDomainBehavior))) return false;
  if (value.mode === 'relative') return tuple(value.navigationDifferentialMm, 3) && value.spatialTransform === undefined;
  const transform = value.spatialTransform;
  return isSpatialTransform(transform) && transform.validity.isValid === true && transform.sourceFrameOfReferenceUID === value.sourceFrameOfReferenceUID && transform.targetFrameOfReferenceUID === value.targetFrameOfReferenceUID && transform.units === 'mm' && transform.validity.outOfDomainBehavior === value.outOfDomainBehavior && value.navigationDifferentialMm === undefined;
};

export const isViewLink = (value: unknown): value is ViewLink => isIntraStudyLink(value) || isInterStudyLink(value);
export const isStateLock = (value: unknown): value is StateLock => record(value) && [...stateNames, 'binding'].includes(value.state as never) && (value.owner === 'user' || value.owner === 'system') && value.locked === true;
export const isLocalViewOverride = (value: unknown): value is LocalViewOverride => record(value) && typeof value.sourceViewId === 'string' && typeof value.targetComposerViewInstanceId === 'string' && Array.isArray(value.overrides) && value.overrides.length > 0 && value.overrides.every((item) => record(item) && ((item.state === 'spatial' && spatialState(item.value)) || (item.state === 'camera' && cameraState(item.value)) || (item.state === 'presentation' && presentationState(item.value)) || (item.state === 'projection' && projectionState(item.value)) || (item.state === 'composition' && compositionState(item.value))));
export const isViewSlot = (value: unknown): value is ViewSlot => record(value) && typeof value.id === 'string' && typeof value.groupId === 'string' && ['MIP', 'PET', 'GENERIC', 'FUSION'].includes(String(value.role)) && ['empty', 'bound', 'prepared', 'unavailable'].includes(String(value.status)) && (value.preparedViewId === undefined || typeof value.preparedViewId === 'string') && (value.resourceDemand === undefined || resourceDemand(value.resourceDemand));
export const isViewGroup = (value: unknown): value is ViewGroup => record(value) && typeof value.id === 'string' && Array.isArray(value.slotIds) && value.slotIds.length === 4 && value.slotIds.every((item) => typeof item === 'string') && new Set(value.slotIds).size === 4;
export const isViewportSurface = (value: unknown): value is ViewportSurface => record(value) && typeof value.surfaceId === 'string' && typeof value.viewportId === 'string' && ['available', 'mounted', 'hidden', 'disposed'].includes(String(value.lifecycle)) && (value.lifecycle !== 'disposed' || (value.boundSlotId === undefined && value.boundViewId === undefined));
export const isPreparedView = (value: unknown): value is PreparedView => record(value) && typeof value.id === 'string' && typeof value.sourceViewId === 'string' && isMedicalViewState(value.state) && Array.isArray(value.links) && value.links.every(isViewLink) && Array.isArray(value.locks) && value.locks.every(isStateLock) && isViewProvenance(value.provenance) && value.provenance.sourceFingerprints.every(isSourceFingerprint) && (value.cachedPreviewReference === undefined || (record(value.cachedPreviewReference) && typeof value.cachedPreviewReference.previewId === 'string' && tuple(value.cachedPreviewReference.pixelDimensions, 2) && value.cachedPreviewReference.pixelDimensions[0] > 0 && value.cachedPreviewReference.pixelDimensions[1] > 0 && typeof value.cachedPreviewReference.colorProfile === 'string' && typeof value.cachedPreviewReference.generatedAt === 'string' && typeof value.cachedPreviewReference.renderStateHash === 'string' && Array.isArray(value.cachedPreviewReference.sourceFingerprintSet) && value.cachedPreviewReference.sourceFingerprintSet.every(isSourceFingerprint) && record(value.cachedPreviewReference.rendererMetadata) && typeof value.cachedPreviewReference.rendererMetadata.rendererName === 'string' && typeof value.cachedPreviewReference.rendererMetadata.rendererVersion === 'string'));
