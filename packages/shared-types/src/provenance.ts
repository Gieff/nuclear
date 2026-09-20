/**
 * @nuclear/shared-types — Provenance & Reproducibility
 *
 * Captures full deterministic lineage for views, registrations, and figures.
 * Fulfills Principle P8: "Scientific Reproducibility as a Core Feature".
 */

import type {
  AssetId,
  SeriesInstanceUID,
  StudyInstanceUID,
  TransformId,
} from './identifiers.js';
import type { SourceFingerprint } from './source.js';

/**
 * Execution record of operations performed by the Python scientific worker
 * (e.g. SimpleITK co-registration, SUV scaling, volume resampling).
 */
export interface ScientificWorkerMetadata {
  /** SemVer of the Python scientific worker */
  readonly workerVersion: string;

  /** Operation performed (e.g. 'suv-scaling', 'rigid-registration', 'resample') */
  readonly operation: string;

  /** Execution timestamp (ISO-8601) */
  readonly timestamp: string;

  /** Parameters passed to the worker for the operation */
  readonly parameters?: Readonly<Record<string, unknown>>;
}

/**
 * Deterministic provenance record for a PreparedView or Figure panel.
 * Records the exact sources, fingerprints, transformations, presets, and versions
 * required to reconstruct the rendered medical image reproducibly.
 */
export interface ViewProvenance {
  /** Parent Study Instance UID */
  readonly studyInstanceUID: StudyInstanceUID;

  /** IDs of all ImagingAssets feeding into the view */
  readonly sourceAssetIds: readonly AssetId[];

  /** DICOM Series Instance UIDs of underlying data */
  readonly sourceSeriesInstanceUIDs: readonly SeriesInstanceUID[];

  /** Intrinsic fingerprints of all source series */
  readonly sourceFingerprints: readonly SourceFingerprint[];

  /** IDs of any SpatialTransforms applied to align layers */
  readonly appliedTransforms?: readonly TransformId[];

  /** Python scientific worker operation records if derived or transformed */
  readonly workerMetadata?: ScientificWorkerMetadata;

  /** Presets applied (colormaps, window/levels, fusion curves) */
  readonly appliedPresetIds?: readonly string[];

  /** Version of the NuClear engine that generated this view state */
  readonly engineVersion: string;

  /** Creation timestamp (ISO-8601) */
  readonly createdAt: string;

  /** Deterministic cryptographic hash of the complete semantic render state */
  readonly renderStateHash?: string;
}
