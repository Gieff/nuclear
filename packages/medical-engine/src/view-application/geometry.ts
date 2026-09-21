/**
 * @nuclear/medical-engine — pure, Node-safe geometry / Frame-of-Reference
 * validation for a compiled `ViewApplicationPlan` (P3.4-B.2.2.1.1).
 *
 * The compiler carries spatial identity but cannot know which volumes are
 * actually resident in the renderer. This module is the Node-testable half of
 * the browser adapter's mandatory fail-closed checks: a layer may only be
 * composited when its resident volume is co-referenced with the view plane, or
 * when an explicit, valid millimetre `SpatialTransform` bridges the two frames.
 *
 * A co-referenced volume (same Frame of Reference) is the authoritative
 * co-reference signal and is accepted without a transform, including a
 * different native acquisition plane (MPR/reformat is legitimate). For a
 * different frame the bridging transform is mandatory, and the resident volume
 * orientation must be parallel to the view-plane orientation because no oblique
 * transformed reslicing is implemented yet.
 *
 * No floating-point library call is performed (P2.5 integrity gate):
 * parallelism is a one-sided dot-product comparison, never an absolute value.
 */

import type { SpatialTransform } from '@nuclear/shared-types';

import { VIEW_APPLICATION_ERROR_CODES, refuse } from './errors.js';
import type {
  ViewApplicationPlan,
  ViewLayerApplication,
  ViewTransformsApplication,
} from './types.js';

/** Minimal geometry evidence for one volume currently resident in the engine. */
export interface ResidentVolumeGeometry {
  readonly frameOfReferenceUID: string;
  /** DICOM ImageOrientationPatient (IOP), 6 values: row then column cosines. */
  readonly orientation: readonly number[];
}

/** Everything the adapter knows about the currently resident volumes. */
export interface ViewGeometryEvidence {
  /** assetId -> resident volume geometry. */
  readonly volumes: ReadonlyMap<string, ResidentVolumeGeometry>;
  /** assetId -> persisted co-registration transform, when frames differ. */
  readonly spatialTransforms?: ReadonlyMap<string, SpatialTransform>;
}

/** Greatest accepted deviation from a perfectly aligned dot product of 1. */
const PARALLELISM_TOLERANCE = 1e-5;

/** Dot product of the 3-vector starting at `offset` in each array. */
function dot3(a: readonly number[], b: readonly number[], offset: number): number {
  return (
    a[offset] * b[offset] +
    a[offset + 1] * b[offset + 1] +
    a[offset + 2] * b[offset + 2]
  );
}

/**
 * True only when both the IOP row and the IOP column of the resident volume are
 * directionally aligned with the view-plane orientation. Both operands must be
 * complete 6-value DICOM IOPs; anything else is refused by the caller. Only the
 * same direction (`dot >= 1 - tolerance`) is accepted: anti-parallel axes are
 * not silently normalised.
 */
function orientationsAligned(
  viewOrientation: readonly number[],
  volumeOrientation: readonly number[],
): boolean {
  if (viewOrientation.length !== 6 || volumeOrientation.length !== 6) {
    return false;
  }
  const rowDot = dot3(viewOrientation, volumeOrientation, 0);
  const colDot = dot3(viewOrientation, volumeOrientation, 3);
  return rowDot >= 1 - PARALLELISM_TOLERANCE && colDot >= 1 - PARALLELISM_TOLERANCE;
}

/** True when the transform bridges the volume and view frames in either direction. */
function transformBridges(
  transform: SpatialTransform,
  volumeFrame: string,
  viewFrame: string,
): boolean {
  return (
    (transform.sourceFrameOfReferenceUID === volumeFrame &&
      transform.targetFrameOfReferenceUID === viewFrame) ||
    (transform.sourceFrameOfReferenceUID === viewFrame &&
      transform.targetFrameOfReferenceUID === volumeFrame)
  );
}

/** Validates one plan layer against the adapter's resident-volume evidence. */
function validateResidentLayer(
  layer: ViewLayerApplication,
  viewOrientation: readonly number[],
  viewFrame: string,
  evidence: ViewGeometryEvidence,
): void {
  const volume = evidence.volumes.get(layer.assetId);
  if (volume === undefined) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.volumeNotResident,
      `layer '${layer.assetId}' has no resident volume evidence: refusing to composite a non-resident volume`,
    );
  }

  if (volume.frameOfReferenceUID === viewFrame) {
    return;
  }

  const transform = evidence.spatialTransforms?.get(layer.assetId);
  if (transform === undefined) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.forMismatch,
      `layer '${layer.assetId}' is in frame '${volume.frameOfReferenceUID}' but the view plane is in frame '${viewFrame}' and no co-registration transform is available`,
    );
  }

  if (
    transform.validity.isValid !== true ||
    transform.units !== 'mm' ||
    !transformBridges(transform, volume.frameOfReferenceUID, viewFrame)
  ) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.transformInvalid,
      `layer '${layer.assetId}' has an unusable co-registration transform (isValid=${String(transform.validity.isValid)}, units='${transform.units}'): a valid millimetre transform bridging the volume and view frames is required`,
    );
  }

  if (!orientationsAligned(viewOrientation, volume.orientation)) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.geometryIncompatible,
      `layer '${layer.assetId}' orientation is not parallel to the view-plane orientation: oblique transformed reslicing is not implemented`,
    );
  }
}

/**
 * Fail-closed per-layer geometry check. For every layer: the volume must be
 * resident; a volume in the view plane's own Frame of Reference is accepted; a
 * volume in a different frame requires a valid millimetre `SpatialTransform`
 * bridging the frames (either direction) and an orientation parallel to the
 * view plane. The first violation throws a typed `ViewApplicationError`.
 */
export function validateLayerGeometry(
  plan: ViewApplicationPlan,
  evidence: ViewGeometryEvidence,
): void {
  for (const layer of plan.layers) {
    validateResidentLayer(
      layer,
      plan.spatial.orientation,
      plan.spatial.frameOfReferenceUID,
      evidence,
    );
  }
}

/**
 * Refuses when the compiled transforms were computed for a viewport of a
 * different pixel size than the one actually mounted, so the patient/view-plane
 * → pixel mapping is never applied to a stale frame.
 */
export function validateViewportSize(
  transforms: ViewTransformsApplication,
  actualViewportSizePx: readonly [number, number],
): void {
  const declared = transforms.viewportSizePx;
  if (
    declared[0] !== actualViewportSizePx[0] ||
    declared[1] !== actualViewportSizePx[1]
  ) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.viewportSizeMismatch,
      `view transforms declare a ${declared[0]}x${declared[1]} px viewport but the mounted viewport is ${actualViewportSizePx[0]}x${actualViewportSizePx[1]} px: refusing a stale pixel mapping`,
    );
  }
}
