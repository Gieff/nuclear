/**
 * @nuclear/medical-engine — explicit series-to-volume ingestion planning (P3.2).
 *
 * Pure, fail-closed translation of an accepted `ImagingAsset` plus Phase 2
 * worker evidence and a declared pixel payload into a Cornerstone-shaped volume
 * construction plan. It is Node-safe and browser-safe: it never imports
 * `@cornerstonejs/core`, never parses DICOM and never computes new geometry.
 * `adapter.ts` is the only place that hands the plan to Cornerstone.
 *
 * Geometry is copied verbatim from `WorkerGeometryComputed.assetGeometry` and
 * `sliceNormal`; no cross product, normalization or sign change is performed
 * here (ADR-004).
 */

import type { AssetGeometry, DirectionCosines } from '@nuclear/shared-types';
import type { WorkerGeometryComputed } from '../worker/types.js';
import { VOLUME_INGESTION_ERROR_CODES, VolumeIngestionError } from './volume-errors.js';
import type {
  LoadedVolume,
  RendererVolumeMetadata,
  VolumeDirection,
  VolumeIngestionPlan,
  VolumeIngestionRequest,
  VolumePixelPayload,
} from './volume-types.js';

export * from './volume-errors.js';
export * from './volume-types.js';

/** Cornerstone's default VOI LUT selector; not a clinical window/level value. */
const VOI_LUT_FUNCTION_DEFAULT = 'LINEAR';

function elementsAgree(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

/** Names the first `AssetGeometry` field that disagrees with the worker evidence. */
function findGeometryDisagreement(asset: AssetGeometry, evidence: AssetGeometry): string | null {
  if (asset.frameOfReferenceUID !== evidence.frameOfReferenceUID) {
    return 'frameOfReferenceUID';
  }
  if (!elementsAgree(asset.dimensions, evidence.dimensions)) {
    return 'dimensions';
  }
  if (!elementsAgree(asset.spacing, evidence.spacing)) {
    return 'spacing';
  }
  if (!elementsAgree(asset.origin, evidence.origin)) {
    return 'origin';
  }
  if (!elementsAgree(asset.direction, evidence.direction)) {
    return 'direction';
  }
  return null;
}

/**
 * Assembles Cornerstone's 9-element direction triplets from worker evidence.
 *
 * Layout, verified against `@cornerstonejs/core@5.10.7` and its bundled
 * `@kitware/vtk.js` `Common/DataModel/ImageData`:
 * - `ImageData.computeTransforms` writes `indexToWorld[0..2] = direction[0..2]`,
 *   `[4..6] = direction[3..5]` and `[8..10] = direction[6..8]` of a
 *   column-major gl-matrix `mat4`, so each consecutive flat triplet is the
 *   world direction of the increasing i (column), j (row) and k (slice) index.
 * - Cornerstone's `generateVolumePropsFromImageIds` builds exactly
 *   `[...rowCosineVec, ...colCosineVec, ...cross(row, col)]`, where the DICOM
 *   `ImageOrientationPatient` first triplet is the row (i) direction and the
 *   second triplet is the column (j) direction.
 *
 * The flat order is therefore `[iAxis(3), jAxis(3), kAxis(3)]`, copied verbatim
 * from `assetGeometry.direction` and `sliceNormal`.
 */
export function assembleCornerstoneDirection(
  orientation: DirectionCosines,
  sliceNormal: readonly [number, number, number],
): VolumeDirection {
  return [
    orientation[0],
    orientation[1],
    orientation[2],
    orientation[3],
    orientation[4],
    orientation[5],
    sliceNormal[0],
    sliceNormal[1],
    sliceNormal[2],
  ];
}

/** Builds the Cornerstone-shaped metadata block from declared payload facts. */
function buildMetadata(
  evidence: WorkerGeometryComputed,
  pixels: VolumePixelPayload,
): RendererVolumeMetadata {
  const geometry = evidence.assetGeometry;
  return {
    BitsAllocated: pixels.bitsAllocated,
    BitsStored: pixels.bitsStored,
    HighBit: pixels.highBit,
    SamplesPerPixel: pixels.samplesPerPixel,
    PhotometricInterpretation: pixels.photometricInterpretation,
    // Floats carry no DICOM integer signedness; 0 is the unsigned convention.
    PixelRepresentation: pixels.signedness === 'signed' ? 1 : 0,
    Modality: evidence.modality,
    SeriesInstanceUID: evidence.seriesInstanceUID,
    ImageOrientationPatient: [...geometry.direction],
    // DICOM PixelSpacing is [rowSpacing, columnSpacing]; NuClear spacing is
    // [columnSpacing, rowSpacing, sliceSpacing].
    PixelSpacing: [geometry.spacing[1], geometry.spacing[0]],
    FrameOfReferenceUID: geometry.frameOfReferenceUID,
    Columns: geometry.dimensions[0],
    Rows: geometry.dimensions[1],
    voiLut: [],
    VOILUTFunction: VOI_LUT_FUNCTION_DEFAULT,
  };
}

/** Deterministic volume identity bound to the asset identity and worker digest. */
function buildVolumeId(assetId: string, geometricDigest: string): string {
  return `nuclear-volume:${assetId}:${geometricDigest}`;
}

/** Serializable descriptor for an already loaded plan. */
export function describeLoadedVolume(plan: VolumeIngestionPlan): LoadedVolume {
  return {
    volumeId: plan.volumeId,
    dimensions: plan.dimensions,
    spacing: plan.spacing,
    origin: plan.origin,
    direction: plan.direction,
    scalarDataDomain: plan.scalarDataDomain,
    scalarLength: plan.scalarData.length,
  };
}

/**
 * Builds a fail-closed ingestion plan. Refusals are checked in a fixed order so
 * the reported code names the first blocking condition: availability,
 * classification, asset shape, worker evidence status, asset/evidence identity,
 * deep geometry agreement, then payload/grid agreement.
 */
export function buildVolumeIngestionPlan(request: VolumeIngestionRequest): VolumeIngestionPlan {
  const { asset, availability, classification, geometryEvidence, pixels } = request;

  if (availability.state === 'mismatch') {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.sourceMismatch,
      `Refusing volume '${asset.id}': availability is 'mismatch' — the observed source does not match the expected fingerprint. Relink or re-verify the source first.`,
    );
  }
  if (availability.state !== 'online' && availability.state !== 'loading') {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.sourceUnavailable,
      `Refusing volume '${asset.id}': availability is '${availability.state}' — only 'online' or 'loading' may produce a live volume, and a cached preview is not a volume.`,
    );
  }
  if (classification.supported !== true) {
    const reason = classification.reason ? ` (${classification.reason})` : '';
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.unsupportedClassification,
      `Refusing volume '${asset.id}': the worker classification for modality '${classification.modality}' is unsupported${reason}.`,
    );
  }
  if ((asset.modality !== 'CT' && asset.modality !== 'PT') || asset.kind !== 'volume') {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.unsupportedClassification,
      `Refusing volume '${asset.id}': modality '${asset.modality}' and kind '${asset.kind}' are not a supported CT/PT volume.`,
    );
  }
  if (geometryEvidence.status !== 'computed') {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.evidenceUnavailable,
      `Refusing volume '${asset.id}': worker geometry evidence is '${geometryEvidence.status}', not 'computed'.`,
    );
  }
  const evidence: WorkerGeometryComputed = geometryEvidence;

  if (asset.seriesInstanceUID === undefined || asset.seriesInstanceUID !== evidence.seriesInstanceUID) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.geometryDisagreement,
      `Refusing volume '${asset.id}': asset SeriesInstanceUID '${asset.seriesInstanceUID ?? '(absent)'}' disagrees with worker evidence '${evidence.seriesInstanceUID}'.`,
    );
  }
  if (asset.frameOfReferenceUID !== evidence.assetGeometry.frameOfReferenceUID) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.geometryDisagreement,
      `Refusing volume '${asset.id}': asset FrameOfReferenceUID '${asset.frameOfReferenceUID}' disagrees with worker evidence '${evidence.assetGeometry.frameOfReferenceUID}'.`,
    );
  }
  if (asset.modality !== evidence.modality) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.geometryDisagreement,
      `Refusing volume '${asset.id}': asset modality '${asset.modality}' disagrees with worker evidence '${evidence.modality}'.`,
    );
  }

  const disagreement = findGeometryDisagreement(asset.geometry, evidence.assetGeometry);
  if (disagreement !== null) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.geometryDisagreement,
      `Refusing volume '${asset.id}': asset.geometry.${disagreement} disagrees with the accepted worker geometry.`,
    );
  }

  const [columns, rows, slices] = evidence.assetGeometry.dimensions;
  const expectedLength = columns * rows * slices;
  if (
    !elementsAgree(pixels.dimensions, evidence.assetGeometry.dimensions) ||
    pixels.scalarData.length !== expectedLength
  ) {
    throw new VolumeIngestionError(
      VOLUME_INGESTION_ERROR_CODES.payloadInvalid,
      `Refusing volume '${asset.id}': pixel payload dims [${pixels.dimensions.join(', ')}] / length ${pixels.scalarData.length} do not match the verified grid [${columns}, ${rows}, ${slices}] (${expectedLength} voxels).`,
    );
  }

  const geometry = evidence.assetGeometry;
  return {
    volumeId: buildVolumeId(asset.id, evidence.geometricDigest),
    assetId: asset.id,
    seriesInstanceUID: evidence.seriesInstanceUID,
    frameOfReferenceUID: geometry.frameOfReferenceUID,
    dimensions: geometry.dimensions,
    spacing: geometry.spacing,
    origin: geometry.origin,
    direction: assembleCornerstoneDirection(geometry.direction, evidence.sliceNormal),
    scalarDataDomain: pixels.scalarDataDomain,
    scalarData: pixels.scalarData,
    metadata: buildMetadata(evidence, pixels),
    provenance: {
      geometricDigest: evidence.geometricDigest,
      workerModality: evidence.modality,
    },
  };
}
