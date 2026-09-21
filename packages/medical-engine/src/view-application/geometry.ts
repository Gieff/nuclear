/**
 * @nuclear/medical-engine — pure, Node-safe geometry / Frame-of-Reference
 * validation for a compiled `ViewApplicationPlan` (P3.4-B.2.2.1.1, corrected by
 * P3.4-B.2.2.4).
 *
 * The compiler carries spatial identity but cannot know which volumes are
 * actually resident in the renderer. This module is the Node-testable half of
 * the browser adapter's mandatory fail-closed checks: a layer may only be
 * composited when its resident volume is co-referenced with the view plane.
 *
 * A co-referenced volume (same Frame of Reference) is the authoritative
 * co-reference signal and is accepted without a transform, including a
 * different native acquisition plane (MPR/reformat is legitimate). A volume in
 * a different Frame of Reference is ALWAYS refused (P3.4-B.2.2.4): a valid
 * `SpatialTransform` proves the frames could be bridged, but neither
 * Cornerstone nor the worker applies that matrix yet, so compositing the
 * volumes would render a misaligned fusion (`VIEW_TRANSFORM_UNSUPPORTED`).
 *
 * Every resident volume must still carry a complete 6-value finite DICOM
 * ImageOrientationPatient; an unreadable orientation is refused rather than
 * assumed. No floating-point library call is performed (P2.5 integrity gate).
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

/**
 * True only for a complete DICOM ImageOrientationPatient: exactly 6 finite
 * numbers. Any other shape is an unreadable frame orientation and is refused by
 * the caller rather than assumed.
 */
function isCompleteOrientation(orientation: readonly number[]): boolean {
  if (orientation.length !== 6) {
    return false;
  }
  for (const value of orientation) {
    if (!Number.isFinite(value)) {
      return false;
    }
  }
  return true;
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

  if (!isCompleteOrientation(volume.orientation)) {
    refuse(
      VIEW_APPLICATION_ERROR_CODES.geometryIncompatible,
      `layer '${layer.assetId}' has no complete 6-value finite DICOM ImageOrientationPatient: refusing to composite a volume whose frame orientation cannot be verified`,
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

  refuse(
    VIEW_APPLICATION_ERROR_CODES.transformUnsupported,
    `layer '${layer.assetId}' has a valid millimetre co-registration transform from frame '${volume.frameOfReferenceUID}' to '${viewFrame}', but spatial transform application is not implemented: applying both volumes without it would render a misaligned fusion, so the layer is refused`,
  );
}

/**
 * Fail-closed per-layer geometry check. For every layer: the volume must be
 * resident and carry a complete finite IOP; a volume in the view plane's own
 * Frame of Reference is accepted; a volume in a different frame is refused,
 * whether or not a valid bridging `SpatialTransform` exists, because spatial
 * transform application is not implemented and the fusion would be misaligned.
 * The first violation throws a typed `ViewApplicationError`.
 */
export function validateLayerGeometry(
  plan: ViewApplicationPlan,
  evidence: ViewGeometryEvidence,
): void {
  for (const layer of plan.layers) {
    validateResidentLayer(layer, plan.spatial.frameOfReferenceUID, evidence);
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
