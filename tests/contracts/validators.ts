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
  PetQuantitationResult,
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
  const optionalDigestFields = ['sopInstanceUIDsHash', 'geometricDigest'];
  const optionalStringsValid = optionalDigestFields.every((field) => {
    if (!Object.prototype.hasOwnProperty.call(value, field)) return true;
    return typeof value[field] === 'string' && value[field].length > 0;
  });
  const totalBytesValid = !Object.prototype.hasOwnProperty.call(value, 'totalBytes') || (typeof value['totalBytes'] === 'number' && Number.isFinite(value['totalBytes']) && Number.isInteger(value['totalBytes']) && value['totalBytes'] >= 0);
  return (
    typeof value['studyInstanceUID'] === 'string' &&
    typeof value['seriesInstanceUID'] === 'string' &&
    typeof value['instanceCount'] === 'number' &&
    Number.isFinite(value['instanceCount']) &&
    Number.isInteger(value['instanceCount']) &&
    value['instanceCount'] > 0 &&
    typeof value['contentDigest'] === 'string' &&
    value['contentDigest'].length > 0 &&
    optionalStringsValid &&
    totalBytesValid
  );
}

/** Validates DICOM ImageOrientationPatient direction cosines orthogonality */
export function isDirectionCosinesValid(
  cosines: DirectionCosines,
  epsilon = 1e-4,
): boolean {
  if (!Array.isArray(cosines) || cosines.length !== 6) return false;
  const [rx, ry, rz, cx, cy, cz] = cosines;
  if (![rx, ry, rz, cx, cy, cz].every(Number.isFinite)) return false;

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

/**
 * Calculates the LPS AABB of the complete oriented volume, including the
 * outer half-voxel border. `origin` is the centre of voxel [0,0,0].
 */
export function calculatePhysicalBounds(
  dimensions: readonly [number, number, number],
  spacing: readonly [number, number, number],
  origin: readonly [number, number, number],
  direction: DirectionCosines,
): { min: [number, number, number]; max: [number, number, number] } {
  const [rx, ry, rz, cx, cy, cz] = direction;
  const normal: [number, number, number] = [
    ry * cz - rz * cy,
    rz * cx - rx * cz,
    rx * cy - ry * cx,
  ];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const i of [-0.5, dimensions[0] - 0.5]) {
    for (const j of [-0.5, dimensions[1] - 0.5]) {
      for (const k of [-0.5, dimensions[2] - 0.5]) {
        const point = [
          origin[0] + rx * spacing[0] * i + cx * spacing[1] * j + normal[0] * spacing[2] * k,
          origin[1] + ry * spacing[0] * i + cy * spacing[1] * j + normal[1] * spacing[2] * k,
          origin[2] + rz * spacing[0] * i + cz * spacing[1] * j + normal[2] * spacing[2] * k,
        ];
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
      }
    }
  }
  return { min, max };
}

/** Type guard for AssetGeometry with physical patient bounds */
export function isAssetGeometry(value: unknown): value is AssetGeometry {
  if (!isObject(value)) return false;
  const g = value;
  if (typeof g['frameOfReferenceUID'] !== 'string') return false;

  const dims = g['dimensions'];
  if (!Array.isArray(dims) || dims.length !== 3 || dims.some((d) => typeof d !== 'number' || !Number.isInteger(d) || d <= 0)) {
    return false;
  }

  const spacing = g['spacing'];
  if (!Array.isArray(spacing) || spacing.length !== 3 || spacing.some((s) => typeof s !== 'number' || !Number.isFinite(s) || s <= 0)) {
    return false;
  }

  const origin = g['origin'];
  if (!Array.isArray(origin) || origin.length !== 3 || origin.some((o) => typeof o !== 'number' || !Number.isFinite(o))) {
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
  if (bounds.min.length !== 3 || bounds.max.length !== 3) return false;
  if (![...bounds.min, ...bounds.max].every((point) => typeof point === 'number' && Number.isFinite(point))) return false;
  const expected = calculatePhysicalBounds(
    dims as [number, number, number],
    spacing as [number, number, number],
    origin as [number, number, number],
    direction as DirectionCosines,
  );
  const epsilon = 1e-5;
  return expected.min.every((v, index) => Math.abs(v - (bounds.min as number[])[index]) <= epsilon)
    && expected.max.every((v, index) => Math.abs(v - (bounds.max as number[])[index]) <= epsilon);
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

/** Validates the shape of a Python-worker SUVbw result without calculating it. */
export function isPetQuantitationResult(value: unknown): value is PetQuantitationResult {
  if (!isObject(value) || value['method'] !== 'suv-bw') return false;
  const status = value['status'];
  if (status !== 'computed' && status !== 'invalid' && status !== 'unavailable') return false;
  const factor = value['suvFactor'];
  if (status === 'computed' && (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0)) return false;
  if (status !== 'computed' && factor !== undefined) return false;
  return isObject(value['workerMetadata'])
    && typeof value['workerMetadata']['workerVersion'] === 'string'
    && typeof value['workerMetadata']['operation'] === 'string'
    && typeof value['workerMetadata']['timestamp'] === 'string';
}



/** Type guard for ImagingAsset */
export function isImagingAsset(value: unknown): value is ImagingAsset {
  if (!isObject(value)) return false;
  const metadata = value['metadata'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['studyInstanceUID'] === 'string' &&
    isSourceLocator(value['sourceLocator']) &&
    isSourceFingerprint(value['sourceFingerprint']) &&
    typeof value['modality'] === 'string' &&
    typeof value['kind'] === 'string' &&
    isAssetGeometry(value['geometry']) &&
    typeof value['frameOfReferenceUID'] === 'string' &&
    isObject(metadata) &&
    (metadata['petQuantitation'] === undefined || isPetQuantitationResult(metadata['petQuantitation'])) &&
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
  if (!m.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
  const [m30, m31, m32, m33] = [m[12], m[13], m[14], m[15]];
  return m30 === 0 && m31 === 0 && m32 === 0 && m33 === 1;
}

/** Type guard for SpatialTransform */
export function isSpatialTransform(value: unknown): value is SpatialTransform {
  if (!isObject(value)) return false;
  const provenance = value['provenance'];
  const validity = value['validity'];
  const transformType = value['transformType'];
  const methods = ['dicom-registration', 'rigid-coregistration', 'manual-alignment', 'identity'];
  const outOfDomain = ['clamp', 'hide', 'warn'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['sourceFrameOfReferenceUID'] === 'string' &&
    typeof value['targetFrameOfReferenceUID'] === 'string' &&
    (transformType === 'rigid' || transformType === 'affine' || transformType === 'identity') &&
    isHomogeneousAffineMatrix4x4(value['matrix4x4'] as Matrix4x4) &&
    value['units'] === 'mm' &&
    isObject(provenance) && methods.includes(String(provenance['method'])) &&
    (provenance['description'] === undefined || typeof provenance['description'] === 'string') &&
    (provenance['workerVersion'] === undefined || typeof provenance['workerVersion'] === 'string') &&
    (provenance['timestamp'] === undefined || typeof provenance['timestamp'] === 'string') &&
    isObject(validity) && typeof validity['isValid'] === 'boolean' &&
    outOfDomain.includes(String(validity['outOfDomainBehavior'])) &&
    (validity['errorMarginMm'] === undefined || (typeof validity['errorMarginMm'] === 'number' && Number.isFinite(validity['errorMarginMm']) && validity['errorMarginMm'] >= 0))
  );
}

/** Type guard for ViewProvenance */
export function isViewProvenance(value: unknown): value is ViewProvenance {
  if (!isObject(value)) return false;
  const sourceAssetIds = value['sourceAssetIds'];
  const sourceSeriesInstanceUIDs = value['sourceSeriesInstanceUIDs'];
  const sourceFingerprints = value['sourceFingerprints'];
  const appliedTransforms = value['appliedTransforms'];
  return (
    typeof value['studyInstanceUID'] === 'string' &&
    Array.isArray(sourceAssetIds) && sourceAssetIds.length > 0 && sourceAssetIds.every((item) => typeof item === 'string' && item.length > 0) &&
    Array.isArray(sourceSeriesInstanceUIDs) && sourceSeriesInstanceUIDs.length > 0 && sourceSeriesInstanceUIDs.every((item) => typeof item === 'string' && item.length > 0) &&
    Array.isArray(sourceFingerprints) && sourceFingerprints.length > 0 && sourceFingerprints.every(isSourceFingerprint) &&
    (appliedTransforms === undefined || (Array.isArray(appliedTransforms) && appliedTransforms.length > 0 && appliedTransforms.every((item) => typeof item === 'string' && item.length > 0))) &&
    typeof value['engineVersion'] === 'string' &&
    typeof value['createdAt'] === 'string'
  );
}
