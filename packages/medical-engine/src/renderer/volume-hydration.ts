/**
 * @nuclear/medical-engine — ADR-013 hydrated volume → ingestion orchestration.
 *
 * The single seam that turns a bridge-hydrated worker payload into the existing
 * `VolumeIngestionPlan`. It builds the bridge request from the registered asset
 * and the accepted worker geometry, then hands the **exact** worker geometry and
 * decoded pixels to the unchanged `buildVolumeIngestionPlan`, which remains the
 * only orientation/validation path. No Cornerstone import, no DICOM parsing, no
 * rescaling and no inference live here.
 */

import type { AssetAvailabilityStatus, ImagingAsset } from '@nuclear/shared-types';
import { WorkerContractError } from '../worker/errors.js';
import type { WorkerGeometryComputed } from '../worker/types.js';
import type {
  WorkerHydratedVolume,
  WorkerVolumeHydrationRequest,
} from '../worker/volume-types.js';
import { buildVolumeIngestionPlan } from './volume.js';
import type {
  VolumeIngestionClassification,
  VolumeIngestionPlan,
  VolumePixelPayload,
} from './volume-types.js';

/**
 * Build the caller-declared `nuclear.dicom.volume` request from the registered
 * asset and the accepted worker geometry.
 *
 * The registered asset is authoritative for series and Frame of Reference, and
 * every declared identity is fail-closed against the accepted evidence before
 * a request is issued: a `SourceFingerprint` that already carries a
 * `geometricDigest` must agree with the accepted geometry (it is never silently
 * overwritten), and the accepted `geometricDigest` is added only when the
 * fingerprint omits it. The bridge-only geometry context (dimensions, digest,
 * rescale) is carried so the descriptor is verified fail-closed.
 */
export function volumeHydrationRequest(
  asset: ImagingAsset,
  evidence: WorkerGeometryComputed,
): WorkerVolumeHydrationRequest {
  const fingerprint = asset.sourceFingerprint;

  if (
    asset.seriesInstanceUID !== undefined &&
    asset.seriesInstanceUID !== evidence.seriesInstanceUID
  ) {
    throw new WorkerContractError(
      `Refusing to hydrate asset '${asset.id}': registered SeriesInstanceUID ` +
        `'${asset.seriesInstanceUID}' disagrees with worker evidence ` +
        `'${evidence.seriesInstanceUID}'.`,
    );
  }
  if (fingerprint.seriesInstanceUID !== evidence.seriesInstanceUID) {
    throw new WorkerContractError(
      `Refusing to hydrate asset '${asset.id}': source-fingerprint SeriesInstanceUID ` +
        `'${fingerprint.seriesInstanceUID}' disagrees with worker evidence ` +
        `'${evidence.seriesInstanceUID}'.`,
    );
  }
  if (asset.frameOfReferenceUID !== evidence.assetGeometry.frameOfReferenceUID) {
    throw new WorkerContractError(
      `Refusing to hydrate asset '${asset.id}': registered FrameOfReferenceUID ` +
        `'${asset.frameOfReferenceUID}' disagrees with worker evidence ` +
        `'${evidence.assetGeometry.frameOfReferenceUID}'.`,
    );
  }
  if (
    fingerprint.geometricDigest !== undefined &&
    fingerprint.geometricDigest !== evidence.geometricDigest
  ) {
    throw new WorkerContractError(
      `Refusing to hydrate asset '${asset.id}': declared source-fingerprint ` +
        `geometricDigest '${fingerprint.geometricDigest}' disagrees with the ` +
        `accepted worker geometry '${evidence.geometricDigest}'.`,
    );
  }

  return {
    locator: asset.sourceLocator,
    seriesInstanceUID: asset.seriesInstanceUID ?? fingerprint.seriesInstanceUID,
    expectedFingerprint: {
      ...fingerprint,
      geometricDigest: fingerprint.geometricDigest ?? evidence.geometricDigest,
    },
    expectedFrameOfReferenceUID: asset.frameOfReferenceUID,
    expectedDimensions: evidence.assetGeometry.dimensions,
    expectedGeometricDigest: evidence.geometricDigest,
    expectedRescale: {
      slope: asset.metadata.rescaleSlope,
      intercept: asset.metadata.rescaleIntercept,
    },
  };
}

/** Map a validated descriptor + decoded array into a declared pixel payload. */
export function volumePixelPayload(volume: WorkerHydratedVolume): VolumePixelPayload {
  const { descriptor, scalarData } = volume;
  return {
    dtype: descriptor.dtype,
    signedness: descriptor.signedness,
    samplesPerPixel: descriptor.samplesPerPixel,
    bitsAllocated: descriptor.bitsAllocated,
    bitsStored: descriptor.bitsStored,
    highBit: descriptor.highBit,
    photometricInterpretation: descriptor.photometricInterpretation,
    scalarDataDomain: descriptor.scalarDataDomain,
    ...(descriptor.rescale === undefined ? {} : { rescale: descriptor.rescale }),
    dimensions: [
      descriptor.dimensions[0],
      descriptor.dimensions[1],
      descriptor.dimensions[2],
    ],
    scalarData,
  };
}

/**
 * Build the existing `VolumeIngestionPlan` from a hydrated worker volume.
 *
 * The `asset`/`availability`/`classification`/`geometryEvidence` inputs are
 * forwarded unchanged, so `buildVolumeIngestionPlan` keeps authority over the
 * fail-closed availability, classification, identity, geometry, payload and
 * OD-F `valueSemantics` checks before any renderer/cache interaction.
 */
export function buildHydratedVolumeIngestionPlan(
  asset: ImagingAsset,
  availability: AssetAvailabilityStatus,
  classification: VolumeIngestionClassification,
  geometryEvidence: WorkerGeometryComputed,
  hydrated: WorkerHydratedVolume,
): VolumeIngestionPlan {
  return buildVolumeIngestionPlan({
    asset,
    availability,
    classification,
    geometryEvidence,
    pixels: volumePixelPayload(hydrated),
  });
}
