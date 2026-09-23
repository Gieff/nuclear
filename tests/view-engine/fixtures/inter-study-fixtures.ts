/**
 * NuClear P4.4b — pure inter-study application/propagation fixtures.
 *
 * Builds admissible Procrustes (`manual-alignment`) inter-study links with a
 * translation-only rigid matrix so expected target coordinates are
 * hand-computable, plus a registered baseline/follow-up pair. Chain and
 * convergence builders live in `inter-study-chain-fixtures.ts`. Imports the
 * real TypeScript product sources through the shared `ts-resolve-hook`
 * registered by `workspace-fixtures.ts`. Pure Node: no DOM, no WebGL, no
 * Cornerstone.
 */
import type {
  AssetId,
  FrameOfReferenceUID,
  ImagingAsset,
  InterStudyLink,
  Point3D,
  PreparedView,
  PreparedViewId,
  SpatialTransform,
  StateLock,
  SingleMedicalViewState,
  TransformId,
  TransformMethod,
  TransformType,
  Vector3D,
  ViewId,
  ViewLink,
  ViewProvenance,
} from '../../../packages/shared-types/src/index.js';
import {
  MOCK_CT_SERIES_UID,
  MOCK_FOLLOWUP_FOR_UID,
  MOCK_FOR_UID,
  MOCK_STUDY_UID,
  mockCtAsset,
} from '../../fixtures/clinical-contracts.fixture.ts';
import { mockMedicalView } from '../../fixtures/view-contracts.fixture.ts';
import {
  ImagingWorkspace,
  mockPetAsset,
  mockStudyReference,
} from './workspace-fixtures.ts';

const preparedViewModule = await import('../../../packages/view-engine/src/prepared-view/index.ts');
export const { assemblePreparedView } = preparedViewModule;
export { MOCK_FOLLOWUP_FOR_UID, MOCK_FOR_UID, mockCtAsset };

export type Workspace = InstanceType<typeof ImagingWorkspace>;

export const MOCK_THIRD_FOR_UID = '1.2.840.10008.1.3.20261120.403' as FrameOfReferenceUID;

export const BASELINE_VIEW = 'view-baseline-p4-4b' as ViewId;
export const FOLLOWUP_VIEW = 'view-followup-p4-4b' as ViewId;
export const BASELINE_PREPARED = 'prepared-baseline-p4-4b' as PreparedViewId;
export const FOLLOWUP_PREPARED = 'prepared-followup-p4-4b' as PreparedViewId;

/** Hand-chosen identity-rotation + translation (5, -3, 2) mm. */
export const TRANSLATION_MATRIX: SpatialTransform['matrix4x4'] = [
  1, 0, 0, 5,
  0, 1, 0, -3,
  0, 0, 1, 2,
  0, 0, 0, 1,
];
export const TRANSLATION: Vector3D = [5, -3, 2];
export const DEFAULT_LOCATION: Point3D = [0, 0, -250];

/** Synthetic registered assets with distinct geometries/frames (no real data). */
export const mockFollowupAsset: ImagingAsset = {
  ...mockCtAsset,
  id: 'asset-ct-followup-001' as AssetId,
  geometry: { ...mockCtAsset.geometry, frameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID },
  frameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID,
};
export const mockThirdFrameAsset: ImagingAsset = {
  ...mockCtAsset,
  id: 'asset-ct-third-frame-001' as AssetId,
  geometry: { ...mockCtAsset.geometry, frameOfReferenceUID: MOCK_THIRD_FOR_UID },
  frameOfReferenceUID: MOCK_THIRD_FOR_UID,
};
/** Geometry frame deliberately disagrees with the asset's declared frame (OD-3 negative). */
export const mockMismatchedDomainAsset: ImagingAsset = {
  ...mockCtAsset,
  id: 'asset-ct-mismatched-domain-001' as AssetId,
  geometry: { ...mockCtAsset.geometry, frameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID },
  frameOfReferenceUID: MOCK_FOR_UID,
};

export interface ProcrustesOverrides {
  readonly errorMarginMm?: number;
  readonly method?: TransformMethod;
  readonly transformType?: TransformType;
  readonly matrix4x4?: SpatialTransform['matrix4x4'];
  readonly sourceFrameOfReferenceUID?: FrameOfReferenceUID;
  readonly targetFrameOfReferenceUID?: FrameOfReferenceUID;
  readonly outOfDomainBehavior?: 'clamp' | 'hide' | 'warn';
}

/** Manual-alignment rigid transform; omit `errorMarginMm` by passing it explicitly undefined. */
export function makeProcrustesTransform(overrides: ProcrustesOverrides = {}): SpatialTransform {
  const behavior = overrides.outOfDomainBehavior ?? 'clamp';
  const errorMarginMm = 'errorMarginMm' in overrides ? overrides.errorMarginMm : 0.8;
  return {
    id: 'transform-procrustes-followup' as TransformId,
    sourceFrameOfReferenceUID: overrides.sourceFrameOfReferenceUID ?? MOCK_FOLLOWUP_FOR_UID,
    targetFrameOfReferenceUID: overrides.targetFrameOfReferenceUID ?? MOCK_FOR_UID,
    transformType: overrides.transformType ?? 'rigid',
    matrix4x4: overrides.matrix4x4 ?? TRANSLATION_MATRIX,
    units: 'mm',
    provenance: {
      method: overrides.method ?? 'manual-alignment',
      description: 'Procrustes landmark registration (synthetic P4.4b fixture)',
      workerVersion: '0.1.0',
      timestamp: '2026-09-23T00:00:00Z',
    },
    validity: errorMarginMm === undefined
      ? { isValid: true, outOfDomainBehavior: behavior }
      : { isValid: true, errorMarginMm, outOfDomainBehavior: behavior },
  };
}

export function makeAdmissibleInterStudyLink(overrides: Partial<InterStudyLink> = {}): InterStudyLink {
  return {
    kind: 'inter-study',
    mode: 'transformed',
    sourceViewId: BASELINE_VIEW,
    targetViewId: FOLLOWUP_VIEW,
    sourceFrameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID,
    targetFrameOfReferenceUID: MOCK_FOR_UID,
    synchronizedState: ['spatial'],
    direction: 'source-to-target',
    spatialTransform: makeProcrustesTransform(),
    toleranceMm: 2,
    outOfDomainBehavior: 'clamp',
    ...overrides,
  };
}

/** Eligible relative link (no transform) for deferred-mode refusal paths. */
export function makeRelativeInterStudyLink(overrides: Partial<InterStudyLink> = {}): InterStudyLink {
  return {
    kind: 'inter-study',
    mode: 'relative',
    sourceViewId: BASELINE_VIEW,
    targetViewId: FOLLOWUP_VIEW,
    sourceFrameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID,
    targetFrameOfReferenceUID: MOCK_FOR_UID,
    synchronizedState: ['spatial'],
    direction: 'source-to-target',
    navigationDifferentialMm: [1, 2, 3],
    toleranceMm: 2,
    outOfDomainBehavior: 'warn',
    ...overrides,
  };
}

export interface BetweenOverrides {
  readonly toleranceMm?: number;
  readonly outOfDomainBehavior?: 'clamp' | 'hide' | 'warn';
  readonly spatialTransform?: SpatialTransform;
}

/** Admissible link between arbitrary views/frames with a matching transform. */
export function makeLinkBetween(
  sourceViewId: ViewId,
  targetViewId: ViewId,
  sourceFrame: FrameOfReferenceUID,
  targetFrame: FrameOfReferenceUID,
  overrides: BetweenOverrides = {},
): InterStudyLink {
  const behavior = overrides.outOfDomainBehavior;
  return makeAdmissibleInterStudyLink({
    sourceViewId,
    targetViewId,
    sourceFrameOfReferenceUID: sourceFrame,
    targetFrameOfReferenceUID: targetFrame,
    spatialTransform: overrides.spatialTransform ?? makeProcrustesTransform({
      sourceFrameOfReferenceUID: sourceFrame,
      targetFrameOfReferenceUID: targetFrame,
      ...(behavior === undefined ? {} : { outOfDomainBehavior: behavior }),
    }),
    ...(overrides.toleranceMm === undefined ? {} : { toleranceMm: overrides.toleranceMm }),
    ...(behavior === undefined ? {} : { outOfDomainBehavior: behavior }),
  });
}

function makeViewState(
  viewId: ViewId,
  frameOfReferenceUID: FrameOfReferenceUID,
  assetId: AssetId,
  referenceLocation: Point3D,
): SingleMedicalViewState {
  return {
    ...mockMedicalView,
    id: viewId,
    dataBinding: { assetId, role: 'base' },
    spatial: { ...mockMedicalView.spatial, frameOfReferenceUID, referenceLocation },
    composition: { mode: 'single', layers: [{ assetId, role: 'base' }] },
  };
}

function makeProvenance(asset: ImagingAsset): ViewProvenance {
  return {
    studyInstanceUID: MOCK_STUDY_UID,
    sourceAssetIds: [asset.id],
    sourceSeriesInstanceUIDs: [asset.seriesInstanceUID ?? MOCK_CT_SERIES_UID],
    sourceFingerprints: [asset.sourceFingerprint],
    engineVersion: '0.1.0',
    createdAt: '2026-09-23T00:00:00Z',
    renderStateHash: `sha256:${asset.id}`,
  };
}

export interface PreparedViewSpec {
  readonly preparedViewId: PreparedViewId;
  readonly viewId: ViewId;
  readonly frameOfReferenceUID: FrameOfReferenceUID;
  readonly asset: ImagingAsset;
  readonly referenceLocation?: Point3D;
  readonly links?: readonly ViewLink[];
  readonly locks?: readonly StateLock[];
}

export function makePreparedView(spec: PreparedViewSpec): PreparedView {
  return assemblePreparedView({
    preparedViewId: spec.preparedViewId,
    state: makeViewState(
      spec.viewId,
      spec.frameOfReferenceUID,
      spec.asset.id,
      spec.referenceLocation ?? DEFAULT_LOCATION,
    ),
    provenance: makeProvenance(spec.asset),
    ...(spec.links === undefined ? {} : { links: spec.links }),
    ...(spec.locks === undefined ? {} : { locks: spec.locks }),
  });
}

export function newInterStudyWorkspace(): Workspace {
  const workspace = new ImagingWorkspace();
  workspace.registerStudy(mockStudyReference);
  for (const asset of [mockCtAsset, mockPetAsset, mockFollowupAsset, mockThirdFrameAsset, mockMismatchedDomainAsset]) {
    workspace.registerAsset(asset);
  }
  return workspace;
}

export interface BaselinePairOptions {
  readonly targetAsset?: ImagingAsset;
  readonly sourceLocks?: readonly StateLock[];
  readonly targetLocks?: readonly StateLock[];
  readonly sourceLocation?: Point3D;
  readonly targetLocation?: Point3D;
}

export function registerBaselinePair(
  workspace: Workspace,
  options: BaselinePairOptions = {},
): { source: PreparedView; target: PreparedView } {
  const source = makePreparedView({
    preparedViewId: BASELINE_PREPARED,
    viewId: BASELINE_VIEW,
    frameOfReferenceUID: MOCK_FOLLOWUP_FOR_UID,
    asset: mockFollowupAsset,
    ...(options.sourceLocation === undefined ? {} : { referenceLocation: options.sourceLocation }),
    ...(options.sourceLocks === undefined ? {} : { locks: options.sourceLocks }),
  });
  const target = makePreparedView({
    preparedViewId: FOLLOWUP_PREPARED,
    viewId: FOLLOWUP_VIEW,
    frameOfReferenceUID: MOCK_FOR_UID,
    asset: options.targetAsset ?? mockCtAsset,
    ...(options.targetLocation === undefined ? {} : { referenceLocation: options.targetLocation }),
    ...(options.targetLocks === undefined ? {} : { locks: options.targetLocks }),
  });
  return { source: workspace.registerPreparedView(source), target: workspace.registerPreparedView(target) };
}
