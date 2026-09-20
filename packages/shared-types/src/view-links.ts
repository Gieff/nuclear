/** Declarative link, lock, and local override contracts. */

import type { AssetId, ComposerViewInstanceId, FrameOfReferenceUID, ViewId } from './identifiers.js';
import type { SpatialState, CameraState, PresentationState, ProjectionState, CompositionState } from './view-state.js';
import type { Vector3D } from './geometry.js';
import type { SpatialTransform } from './spatial-transform.js';
import type { SourceFingerprint } from './source.js';
import type { ScientificWorkerMetadata } from './provenance.js';
import type { BoundingBox3D, DirectionCosines } from './geometry.js';

export type LinkableState = 'spatial' | 'camera' | 'presentation' | 'projection' | 'composition';

export interface IntraStudyLink {
  readonly kind: 'co-referenced';
  readonly sourceViewId: ViewId;
  readonly targetViewId: ViewId;
  readonly frameOfReferenceUID: FrameOfReferenceUID;
  readonly synchronizedState: readonly LinkableState[];
  readonly geometryEvidence: {
    readonly assetIds: readonly AssetId[];
    readonly frameOfReferenceUID: FrameOfReferenceUID;
    readonly snapshots: readonly GeometryVerificationSnapshot[];
    readonly verified: true;
  };
}

export interface GeometryVerificationSnapshot {
  readonly assetId: AssetId;
  readonly frameOfReferenceUID: FrameOfReferenceUID;
  readonly sourceFingerprint: SourceFingerprint;
  readonly geometricDigest: string;
  readonly orientation: DirectionCosines;
  readonly spacingMm: Vector3D;
  readonly originLpsMm: Vector3D;
  readonly boundsLpsMm: BoundingBox3D;
  readonly workerMetadata: ScientificWorkerMetadata;
}

export type InterStudyLinkMode = 'relative' | 'transformed';

export interface InterStudyLink {
  readonly kind: 'inter-study';
  readonly mode: InterStudyLinkMode;
  readonly sourceViewId: ViewId;
  readonly targetViewId: ViewId;
  readonly sourceFrameOfReferenceUID: FrameOfReferenceUID;
  readonly targetFrameOfReferenceUID: FrameOfReferenceUID;
  readonly synchronizedState: readonly LinkableState[];
  readonly direction: 'source-to-target';
  readonly navigationDifferentialMm?: Vector3D;
  readonly spatialTransform?: SpatialTransform;
  readonly toleranceMm: number;
  readonly outOfDomainBehavior: 'clamp' | 'hide' | 'warn';
}

export type RegisteredSpatialTransformReference = SpatialTransform;

export type ViewLink = IntraStudyLink | InterStudyLink;
export type LockableState = LinkableState | 'binding';

export interface StateLock {
  readonly state: LockableState;
  readonly owner: 'user' | 'system';
  readonly locked: true;
}

export type ViewStateOverride =
  | { readonly state: 'spatial'; readonly value: SpatialState }
  | { readonly state: 'camera'; readonly value: CameraState }
  | { readonly state: 'presentation'; readonly value: PresentationState }
  | { readonly state: 'projection'; readonly value: ProjectionState }
  | { readonly state: 'composition'; readonly value: CompositionState };

/** A local, serializable divergence from a source view; it never mutates it. */
export interface LocalViewOverride {
  readonly sourceViewId: ViewId;
  readonly targetComposerViewInstanceId: ComposerViewInstanceId;
  readonly overrides: readonly ViewStateOverride[];
}
