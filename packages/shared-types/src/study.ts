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
 * Summary reference for a series contained within a clinical study.
 */
export interface StudySeriesReference {
  /** DICOM Series Instance UID (0020,000E) */
  readonly seriesInstanceUID: SeriesInstanceUID;

  /** Clinical series number (0020,0011) */
  readonly seriesNumber?: number;

  /** Clinical series description (0008,103E) */
  readonly seriesDescription?: string;

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

  /** Clinical Study ID tag (0020,0010) */
  readonly studyId?: string;

  /** Clinical Accession Number (0008,0050) */
  readonly accessionNumber?: string;

  /** Examination date in DICOM format YYYYMMDD (0008,0020) */
  readonly studyDate?: string;

  /** Examination time in DICOM format HHMMSS (0008,0030) */
  readonly studyTime?: string;

  /** Clinical study description (0008,1030) */
  readonly studyDescription?: string;

  /** Patient demographics and anthropometric parameters */
  readonly patient: PatientReference;

  /** List of modalities present within this study */
  readonly modalities: readonly Modality[];

  /** Summary of series discovered within this study */
  readonly series: readonly StudySeriesReference[];

  /** Primary storage locator for this study */
  readonly sourceLocator?: SourceLocator;
}
