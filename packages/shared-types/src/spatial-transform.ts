/**
 * @nuclear/shared-types — Spatial Registration & Transform Contracts
 *
 * Defines inter-volume coordinate transformations between different FrameOfReferenceUIDs.
 * Used for longitudinal tracking, multimodal registration, or oblique reorientations.
 */

import type { Matrix4x4 } from './geometry.js';
import type { FrameOfReferenceUID, TransformId } from './identifiers.js';

/** Mathematical nature of the spatial transformation */
export type TransformType = 'rigid' | 'affine' | 'identity';

/** Strategy for rendering voxels mapped outside the target volume boundary */
export type OutOfDomainBehavior = 'clamp' | 'hide' | 'warn';

/** Algorithm or provenance source that generated the registration matrix */
export type TransformMethod =
  | 'dicom-registration'
  | 'rigid-coregistration'
  | 'manual-alignment'
  | 'identity';

/** Provenance and audit trail of how the transform was established */
export interface TransformProvenance {
  /** Method used to derive the matrix */
  readonly method: TransformMethod;

  /** Human-readable rationale or description */
  readonly description?: string;

  /** Version of the Python scientific worker or algorithm */
  readonly workerVersion?: string;

  /** Timestamp of registration computation (ISO-8601) */
  readonly timestamp?: string;
}

/** Quality and domain bounds validity of the transformation */
export interface TransformValidity {
  /** True if the transformation is valid and non-singular */
  readonly isValid: boolean;

  /** Estimated registration error / residual margin in millimeters */
  readonly errorMarginMm?: number;

  /** Specified display behavior when reslicing exceeds valid spatial bounds */
  readonly outOfDomainBehavior: OutOfDomainBehavior;
}

/**
 * 4x4 spatial transformation mapping physical coordinates in source Frame of Reference
 * to target Frame of Reference: P_target = M * P_source.
 */
export interface SpatialTransform {
  /** Unique opaque transform identifier */
  readonly id: TransformId;

  /** Source Frame of Reference UID */
  readonly sourceFrameOfReferenceUID: FrameOfReferenceUID;

  /** Target Frame of Reference UID */
  readonly targetFrameOfReferenceUID: FrameOfReferenceUID;

  /** Classification of transformation matrix */
  readonly transformType: TransformType;

  /** 4x4 homogeneous transformation matrix in LPS physical coordinates (mm) */
  readonly matrix4x4: Matrix4x4;

  /** Coordinate units for translations, strictly 'mm' */
  readonly units: 'mm';

  /** Provenance and algorithm information */
  readonly provenance: TransformProvenance;

  /** Validity and domain enforcement settings */
  readonly validity: TransformValidity;
}
