/**
 * NuClear — Clinical Data Contract Validators
 *
 * Provides runtime validation, clinical geometry checks, and type guards
 * asserting conformance with NuClear v3 data contracts.
 */

import type {
  AssetGeometry,
  DirectionCosines,
  ImagingAsset,
  Matrix4x4,
  PetAcquisitionMetadata,
  SourceFingerprint,
  SourceLocator,
  SpatialTransform,
  StudyReference,
  ViewProvenance,
} from '../../packages/shared-types/src/index.js';

/** Validates that an unknown value is an object */
function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Type guard for SourceLocator variants */
export function isSourceLocator(value: unknown): value is SourceLocator {
  if (!isObject(value) || typeof value['kind'] !== 'string') return false;
  switch (value['kind']) {
    case 'local-folder':
      return typeof value['path'] === 'string';
    case 'local-file-list':
      return Array.isArray(value['files']) && value['files'].every((f) => typeof f === 'string');
    case 'archive-entry':
      return typeof value['archivePath'] === 'string';
    default:
      return false;
  }
}

/** Type guard for SourceFingerprint */
export function isSourceFingerprint(value: unknown): value is SourceFingerprint {
  if (!isObject(value)) return false;
  return (
    typeof value['studyInstanceUID'] === 'string' &&
    typeof value['seriesInstanceUID'] === 'string' &&
    typeof value['instanceCount'] === 'number' &&
    value['instanceCount'] > 0 &&
    typeof value['contentDigest'] === 'string' &&
    value['contentDigest'].length > 0
  );
}

/** Validates DICOM ImageOrientationPatient direction cosines orthogonality */
export function isDirectionCosinesValid(
  cosines: DirectionCosines,
  epsilon = 1e-4,
): boolean {
  if (!Array.isArray(cosines) || cosines.length !== 6) return false;
  const [rx, ry, rz, cx, cy, cz] = cosines;

  // Row vector norm ≈ 1
  const rowNormSq = rx * rx + ry * ry + rz * rz;
  if (Math.abs(rowNormSq - 1.0) > epsilon) return false;

  // Col vector norm ≈ 1
  const colNormSq = cx * cx + cy * cy + cz * cz;
  if (Math.abs(colNormSq - 1.0) > epsilon) return false;

  // Dot product row · col ≈ 0 (orthogonal)
  const dotProduct = rx * cx + ry * cy + rz * cz;
  return Math.abs(dotProduct) <= epsilon;
}

/** Type guard for AssetGeometry with physical patient bounds */
export function isAssetGeometry(value: unknown): value is AssetGeometry {
  if (!isObject(value)) return false;
  const g = value;
  if (typeof g['frameOfReferenceUID'] !== 'string') return false;

  const dims = g['dimensions'];
  if (!Array.isArray(dims) || dims.length !== 3 || dims.some((d) => typeof d !== 'number' || d <= 0)) {
    return false;
  }

  const spacing = g['spacing'];
  if (!Array.isArray(spacing) || spacing.length !== 3 || spacing.some((s) => typeof s !== 'number' || s <= 0)) {
    return false;
  }

  const origin = g['origin'];
  if (!Array.isArray(origin) || origin.length !== 3 || origin.some((o) => typeof o !== 'number')) {
    return false;
  }

  const direction = g['direction'];
  if (!isDirectionCosinesValid(direction as DirectionCosines)) {
    return false;
  }

  const bounds = g['bounds'] as { min?: unknown[]; max?: unknown[] } | undefined;
  if (!isObject(bounds) || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    return false;
  }

  return true;
}

/** Type guard for PET quantitative acquisition metadata */
export function isPetAcquisitionMetadata(value: unknown): value is PetAcquisitionMetadata {
  if (!isObject(value)) return false;
  return (
    typeof value['units'] === 'string' &&
    (value['decayCorrection'] === 'START' || value['decayCorrection'] === 'ADMIN') &&
    typeof value['radionuclideHalfLifeSeconds'] === 'number' &&
    value['radionuclideHalfLifeSeconds'] > 0 &&
    typeof value['radionuclideTotalDoseBq'] === 'number' &&
    value['radionuclideTotalDoseBq'] > 0 &&
    typeof value['radiopharmaceuticalStartTime'] === 'string' &&
    typeof value['seriesTime'] === 'string'
  );
}



/** Type guard for ImagingAsset */
export function isImagingAsset(value: unknown): value is ImagingAsset {
  if (!isObject(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['studyInstanceUID'] === 'string' &&
    isSourceLocator(value['sourceLocator']) &&
    isSourceFingerprint(value['sourceFingerprint']) &&
    typeof value['modality'] === 'string' &&
    typeof value['kind'] === 'string' &&
    isAssetGeometry(value['geometry']) &&
    typeof value['frameOfReferenceUID'] === 'string' &&
    isObject(value['metadata']) &&
    isObject(value['valueSemantics'])
  );
}

/** Type guard for StudyReference */
export function isStudyReference(value: unknown): value is StudyReference {
  if (!isObject(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['studyInstanceUID'] === 'string' &&
    isObject(value['patient']) &&
    Array.isArray(value['modalities']) &&
    Array.isArray(value['series'])
  );
}

/**
 * Type guard structurally asserting homogeneous affine coordinates [0,0,0,1].
 * Note: True rigid/numerical validation belongs to the Python worker.
 */
export function isHomogeneousAffineMatrix4x4(m: Matrix4x4): boolean {
  if (!Array.isArray(m) || m.length !== 16) return false;
  const [m30, m31, m32, m33] = [m[12], m[13], m[14], m[15]];
  return m30 === 0 && m31 === 0 && m32 === 0 && m33 === 1;
}

/** Type guard for SpatialTransform */
export function isSpatialTransform(value: unknown): value is SpatialTransform {
  if (!isObject(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['sourceFrameOfReferenceUID'] === 'string' &&
    typeof value['targetFrameOfReferenceUID'] === 'string' &&
    isHomogeneousAffineMatrix4x4(value['matrix4x4'] as Matrix4x4) &&
    value['units'] === 'mm' &&
    isObject(value['provenance']) &&
    isObject(value['validity'])
  );
}

/** Type guard for ViewProvenance */
export function isViewProvenance(value: unknown): value is ViewProvenance {
  if (!isObject(value)) return false;
  return (
    typeof value['studyInstanceUID'] === 'string' &&
    Array.isArray(value['sourceAssetIds']) &&
    Array.isArray(value['sourceSeriesInstanceUIDs']) &&
    Array.isArray(value['sourceFingerprints']) &&
    typeof value['engineVersion'] === 'string' &&
    typeof value['createdAt'] === 'string'
  );
}
