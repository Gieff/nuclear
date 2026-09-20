/**
 * @nuclear/shared-types — Study Reference
 *
 * Primary clinical container for patient examinations. A StudyReference groups
 * multimodal series and carries essential patient metadata required for quantitative analysis.
 */

import type { SeriesInstanceUID, StudyId, StudyInstanceUID } from './identifiers.js';
import type { Modality, PatientReference } from './semantics.js';
import type { SourceLocator } from './source.js';

/**
 * Persistable summary reference for a series contained within a study.
 * Direct clinical descriptions and patient/source identifiers are excluded.
 */
export interface StudySeriesReference {
  /** DICOM Series Instance UID (0020,000E) */
  readonly seriesInstanceUID: SeriesInstanceUID;

  /** Clinical series number (0020,0011) */
  readonly seriesNumber?: number;

  /** Imaging modality for this series */
  readonly modality: Modality;

  /** Total number of instances/slices belonging to the series */
  readonly numberOfInstances?: number;
}

/**
 * Clinical study reference grouping patient data and series summaries.
 * STRICT PRIVACY REQUIREMENT: This object is persisted in .ncp project files.
 * It must be privacy-safe and free from direct Patient Health Information (PHI).
 */
export interface StudyReference {
  /** Internal opaque identifier for this study in the NuClear workspace */
  readonly id: StudyId;

  /** DICOM Study Instance UID (0020,000D) */
  readonly studyInstanceUID: StudyInstanceUID;

  /** Minimal quantitative/demographic metadata; no direct identifiers. */
  readonly patient: PatientReference;

  /** List of modalities present within this study */
  readonly modalities: readonly Modality[];

  /** Summary of series discovered within this study */
  readonly series: readonly StudySeriesReference[];

  /** Primary storage locator for this study */
  readonly sourceLocator?: SourceLocator;
}
