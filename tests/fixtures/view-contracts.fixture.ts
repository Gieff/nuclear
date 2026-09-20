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
  PresentationState,
  ProjectionState,
  SpatialState,
  StateLock,
  ViewportSurface,
} from '../../packages/shared-types/src/index.js';
import type {
  AssetId, ComposerViewInstanceId, FrameOfReferenceUID, PreparedViewId, PreviewId, SurfaceId, ViewId, ViewportId,
} from '../../packages/shared-types/src/index.js';
import { mockCtAsset, mockPetAsset, mockRigidFollowupTransform, mockViewProvenance } from './clinical-contracts.fixture.ts';

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
const presentation: PresentationState = {
  voi: [-1000, 1000], colormapId: 'gray', invert: false, opacity: 1, interpolation: 'linear', modalityPresentation: 'ct',
};
const projection: ProjectionState = { mode: 'slice' };
const composition: CompositionState = { mode: 'single', layers: [binding] };

export const mockMedicalView: MedicalViewState = {
  id: id<ViewId>('view-ct'), dataBinding: binding, spatial, camera, presentation, projection, composition,
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

export const mockSurface: ViewportSurface = {
  surfaceId: id<SurfaceId>('surface-0'), viewportId: id<ViewportId>('viewport-0'), boundViewId: mockMedicalView.id,
  lifecycle: 'mounted',
};
