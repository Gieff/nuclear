import type {
  CameraState,
  CompositionState,
  CoordinateTransformSet,
  DataBinding,
  InterStudyLink,
  IntraStudyLink,
  LocalViewOverride,
  MedicalViewState,
  PreparedView,
  PetFusionOverlayPresentation,
  PresentationState,
  ProjectionState,
  SingleMedicalViewState,
  SpatialState,
  StateLock,
  ViewProvenance,
  ViewportSurface,
} from '../../packages/shared-types/src/index.js';
import type {
  AssetId, ComposerViewInstanceId, PreparedViewId, PreviewId, SurfaceId, ViewId, ViewportId,
} from '../../packages/shared-types/src/index.js';
import {
  MOCK_CT_SERIES_UID,
  MOCK_PET_SERIES_UID,
  mockCtAsset,
  mockIdentityTransform,
  mockPetAsset,
  mockRigidFollowupTransform,
  mockViewProvenance,
} from './clinical-contracts.fixture.ts';

const id = <T extends string>(value: string): T => value as T;
const identity: CoordinateTransformSet = {
  patientToViewPlane: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  viewPlaneToViewport: [1, 0, 0, 256, 0, 1, 0, 256, 0, 0, 1, 0, 0, 0, 0, 1],
  viewportSizePx: [512, 512],
};

const binding: DataBinding = { assetId: id<AssetId>('asset-ct'), role: 'base' };
const spatial: SpatialState = {
  frameOfReferenceUID: mockCtAsset.geometry.frameOfReferenceUID,
  orientation: [1, 0, 0, 0, 1, 0],
  viewPlaneNormal: [0, 0, 1],
  viewUp: [0, 1, 0],
  referenceLocation: [0, 0, 0],
  sliceOffsetMm: 0,
};
const camera: CameraState = { zoom: 1, panMm: [0, 0], rotationDeg: 0, focalPointMm: [0, 0], fitMode: 'manual' };
// `gray` is a Cornerstone built-in colormap, not a NuClear catalog id. P3.4-B.2
// resolves built-ins through a separate fail-closed path; only the `dicom-*`
// stable ids below are catalog entries.
const presentation: PresentationState = {
  voi: [-1000, 1000], colormapId: 'gray', invert: false, opacity: 1, interpolation: 'linear', modalityPresentation: 'ct',
};
const projection: ProjectionState = { mode: 'slice' };
const composition: CompositionState = { mode: 'single', layers: [binding] };

export const mockMedicalView: SingleMedicalViewState = {
  id: id<ViewId>('view-ct'), dataBinding: binding, spatial, camera, presentation, projection, composition,
  coordinateTransforms: identity,
};

const petSpatial: SpatialState = { ...spatial, frameOfReferenceUID: mockPetAsset.geometry.frameOfReferenceUID };
const petPresentation: PresentationState = {
  suvRange: [0, 8], colormapId: 'dicom-pet', invert: false, opacity: 1, interpolation: 'linear', modalityPresentation: 'pet',
};
const fusionCtPresentation: PresentationState = {
  voi: [-160, 240], colormapId: 'gray', invert: false, opacity: 1, interpolation: 'linear', modalityPresentation: 'ct',
};
const fusionPetPresentation: PetFusionOverlayPresentation = {
  suvRange: [0, 8], colormapId: 'dicom-pet', invert: false, interpolation: 'linear', modalityPresentation: 'pet',
};

export const mockPetView: SingleMedicalViewState = {
  id: id<ViewId>('view-pet'), dataBinding: { assetId: mockPetAsset.id, role: 'base' }, spatial: petSpatial, camera,
  presentation: petPresentation, projection: { mode: 'slice' },
  composition: { mode: 'single', layers: [{ assetId: mockPetAsset.id, role: 'base' }] },
  coordinateTransforms: identity,
};

export const mockFusionView: MedicalViewState = {
  id: id<ViewId>('view-fusion'), dataBinding: { assetId: mockCtAsset.id, role: 'base' }, spatial, camera,
  projection: { mode: 'slice' },
  composition: {
    mode: 'fusion', blend: 'alpha',
    layers: [
      { binding: { assetId: mockCtAsset.id, role: 'base' }, presentation: fusionCtPresentation },
      {
        binding: { assetId: mockPetAsset.id, role: 'overlay' }, presentation: fusionPetPresentation,
        fusion: { transferMode: 'highlighted', gamma: 1, blendSlider: 50 },
      },
    ],
  },
  coordinateTransforms: identity,
};

export const mockIntraStudyLink: IntraStudyLink = {
  kind: 'co-referenced', sourceViewId: id<ViewId>('view-ct'), targetViewId: id<ViewId>('view-pet'),
  frameOfReferenceUID: spatial.frameOfReferenceUID, synchronizedState: ['spatial', 'camera'],
  geometryEvidence: {
    assetIds: [mockCtAsset.id, mockPetAsset.id], frameOfReferenceUID: spatial.frameOfReferenceUID, verified: true,
    snapshots: [mockCtAsset, mockPetAsset].map((asset) => ({
      assetId: asset.id, frameOfReferenceUID: asset.geometry.frameOfReferenceUID, sourceFingerprint: asset.sourceFingerprint, geometricDigest: asset.sourceFingerprint.geometricDigest ?? 'sha256:geometry',
      orientation: asset.geometry.direction, spacingMm: asset.geometry.spacing, originLpsMm: asset.geometry.origin, boundsLpsMm: asset.geometry.bounds,
      workerMetadata: { workerVersion: '0.1.0', operation: 'geometry-verification', timestamp: '2026-09-20T10:00:00Z' },
    })),
  },
};

export const mockInterStudyLink: InterStudyLink = {
  kind: 'inter-study', mode: 'transformed', sourceViewId: id<ViewId>('view-baseline'), targetViewId: id<ViewId>('view-followup'),
  sourceFrameOfReferenceUID: mockRigidFollowupTransform.sourceFrameOfReferenceUID, targetFrameOfReferenceUID: mockRigidFollowupTransform.targetFrameOfReferenceUID,
  synchronizedState: ['spatial'], direction: 'source-to-target', spatialTransform: mockRigidFollowupTransform,
  toleranceMm: 2, outOfDomainBehavior: 'warn',
};

export const mockLocalOverride: LocalViewOverride = {
  sourceViewId: id<ViewId>('view-ct'), targetComposerViewInstanceId: id<ComposerViewInstanceId>('composer-instance'),
  overrides: [{ state: 'camera', value: { ...camera, panMm: [2, 0] } }],
};

export const mockViewLock: StateLock = { state: 'camera', owner: 'user', locked: true };

export const mockPreparedView: PreparedView = {
  id: id<PreparedViewId>('prepared-ct'), sourceViewId: mockMedicalView.id, state: mockMedicalView,
  links: [mockIntraStudyLink], locks: [mockViewLock], provenance: mockViewProvenance,
  cachedPreviewReference: {
    previewId: id<PreviewId>('preview-ct'), renderStateHash: 'sha256:state', sourceFingerprintSet: mockViewProvenance.sourceFingerprints,
    pixelDimensions: [1024, 1024], colorProfile: 'sRGB', generatedAt: '2026-09-20T10:00:00Z',
    rendererMetadata: { rendererName: 'nuclear-medical-renderer', rendererVersion: '0.1.0' },
  },
};

export const mockPetViewProvenance: ViewProvenance = {
  studyInstanceUID: mockPetAsset.studyInstanceUID,
  sourceAssetIds: [mockPetAsset.id],
  sourceSeriesInstanceUIDs: [MOCK_PET_SERIES_UID],
  sourceFingerprints: [mockPetAsset.sourceFingerprint],
  engineVersion: '0.1.0',
  createdAt: '2026-09-20T10:30:00Z',
  renderStateHash: 'sha256:petview0001',
};

export const mockFusionViewProvenance: ViewProvenance = {
  studyInstanceUID: mockCtAsset.studyInstanceUID,
  sourceAssetIds: [mockCtAsset.id, mockPetAsset.id],
  sourceSeriesInstanceUIDs: [MOCK_CT_SERIES_UID, MOCK_PET_SERIES_UID],
  sourceFingerprints: [mockCtAsset.sourceFingerprint, mockPetAsset.sourceFingerprint],
  appliedTransforms: [mockIdentityTransform.id],
  appliedPresetIds: ['ct-soft-tissue'],
  engineVersion: '0.1.0',
  createdAt: '2026-09-20T10:30:00Z',
  renderStateHash: 'sha256:fusionview0001',
};

export const mockPetPreparedView: PreparedView = {
  id: id<PreparedViewId>('prepared-pet'), sourceViewId: mockPetView.id, state: mockPetView,
  links: [], locks: [], provenance: mockPetViewProvenance,
};

export const mockFusionPreparedView: PreparedView = {
  id: id<PreparedViewId>('prepared-fusion'), sourceViewId: mockFusionView.id, state: mockFusionView,
  links: [], locks: [], provenance: mockFusionViewProvenance,
};

export const mockSurface: ViewportSurface = {
  surfaceId: id<SurfaceId>('surface-0'), viewportId: id<ViewportId>('viewport-0'), boundViewId: mockMedicalView.id,
  lifecycle: 'mounted',
};
