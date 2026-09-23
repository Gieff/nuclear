/**
 * @nuclear/medical-engine — Phase 2B.1 `nuclear.registration` bridge types.
 *
 * Typed request and success-evidence contracts for the worker-owned inter-study
 * registration operation. This module carries no algorithm, no arithmetic and
 * no fabricated transform: it only describes the caller-declared request and
 * the evidence the worker must eventually produce (2B.2/2B.3).
 */

import type {
  FrameOfReferenceUID,
  OutOfDomainBehavior,
  Point3D,
  ScientificWorkerMetadata,
  SourceFingerprint,
  SourceLocator,
  SpatialTransform,
  TransformId,
} from '@nuclear/shared-types';

/**
 * Per-side source-fingerprint expectation for the voxel-registration mode.
 *
 * The registered asset's `SourceFingerprint` with its accepted
 * `geometricDigest` made mandatory, so a caller cannot omit the geometry
 * evidence the worker correlates. Optional fingerprint fields
 * (`sopInstanceUIDsHash`, `totalBytes`) are preserved verbatim: the worker
 * observes the SOP Instance UID digest itself and compares it only when the
 * caller supplies an expected value (ADR-013 §5, owner-ratified 2026-09-23).
 */
export type WorkerRegistrationExpectedFingerprint = SourceFingerprint & {
  readonly geometricDigest: string;
};

/**
 * One fixed/moving asset reference for the voxel-registration mode.
 *
 * Phase 2B.3b requires each side to carry the registered asset's expected
 * `SourceFingerprint` (with its accepted `geometricDigest`) and its expected
 * Frame of Reference. The worker correlates both through the shared hydration
 * service and fails closed on any mismatch.
 */
export interface WorkerRegistrationAssetRef {
  readonly locator: SourceLocator;
  readonly seriesInstanceUID: string;
  readonly expectedFingerprint: WorkerRegistrationExpectedFingerprint;
  readonly expectedFrameOfReferenceUID: FrameOfReferenceUID;
}

/** One ordered source -> target landmark correspondence (LPS mm). */
export interface WorkerLandmarkPair {
  readonly source: Point3D;
  readonly target: Point3D;
}

/** Fields common to both registration modes, owned by the caller. */
interface WorkerRegistrationBase {
  readonly transformId: TransformId;
  readonly outOfDomainBehavior: OutOfDomainBehavior;
}

/** `rigid` mode: the worker is asked to align two registered assets. */
export interface WorkerRigidRegistrationRequest extends WorkerRegistrationBase {
  readonly mode: 'rigid';
  readonly fixed: WorkerRegistrationAssetRef;
  readonly moving: WorkerRegistrationAssetRef;
}

/** `landmarks` mode: >= 3 ordered correspondences between two Frame of References. */
export interface WorkerLandmarkRegistrationRequest extends WorkerRegistrationBase {
  readonly mode: 'landmarks';
  readonly sourceFrameOfReferenceUID: FrameOfReferenceUID;
  readonly targetFrameOfReferenceUID: FrameOfReferenceUID;
  readonly landmarks: readonly WorkerLandmarkPair[];
}

/** Caller-declared registration request discriminated by `mode`. */
export type WorkerRegistrationRequest =
  | WorkerRigidRegistrationRequest
  | WorkerLandmarkRegistrationRequest;

/** Mapped success evidence from `nuclear.registration` (produced by later slices). */
export interface WorkerRegistrationResult {
  readonly transform: SpatialTransform;
  readonly workerMetadata: ScientificWorkerMetadata;
}
