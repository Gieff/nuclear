/**
 * @nuclear/shared-types — Imaging Asset & Quantitative Metadata
 *
 * An ImagingAsset is the fundamental displayable medical unit in NuClear.
 * It carries strict patient physical geometry, source fingerprints, and clinical metadata
 * required for correct reconstruction and quantitative SUVbw determination.
 */

import type { AssetGeometry } from './geometry.js';
import type {
  AssetId,
  FrameOfReferenceUID,
  SeriesInstanceUID,
  StudyInstanceUID,
} from './identifiers.js';
import type { AssetKind, Modality, ValueSemantics } from './semantics.js';
import type { SourceFingerprint, SourceLocator } from './source.js';

/**
 * Quantitative radiopharmaceutical and decay calibration parameters for PET/SPECT.
 * Defined according to DICOM PS 3.3 C.8.9 and NuClear DICOM skill.
 */
export interface PetAcquisitionMetadata {
  /** DICOM Units (0054,1001), typically 'BQML', 'CNTS', or 'GML' */
  readonly units: 'BQML' | 'CNTS' | 'GML' | string;

  /** DICOM DecayCorrection (0054,1102), must be 'START' or 'ADMIN' for valid SUV */
  readonly decayCorrection: 'START' | 'ADMIN' | 'NONE' | string;

  /** Radionuclide half-life T_1/2 in seconds (0018,1075), e.g. 6586.2 s for 18F */
  readonly radionuclideHalfLifeSeconds: number;

  /** Total injected dose in Becquerels (0018,1074) */
  readonly radionuclideTotalDoseBq: number;

  /** Time of radiopharmaceutical administration HHMMSS (0018,1072) */
  readonly radiopharmaceuticalStartTime: string;

  /** Series acquisition start time HHMMSS (0008,0031) */
  readonly seriesTime: string;

  /**
   * Computed SUV body-weight scaling factor (g/Bq):
   * suvFactor = 1.0 / (DecayedDose_Bq / PatientWeight_g)
   */
  readonly suvFactor?: number;
}

/**
 * Core DICOM acquisition and pixel scaling metadata.
 */
export interface AssetMetadata {
  /** Clinical series description (0008,103E) */
  readonly seriesDescription?: string;

  /** Clinical series number (0020,0011) */
  readonly seriesNumber?: number;

  /** Number of slices / instances in this asset */
  readonly instanceCount: number;

  /** Nominal slice thickness in mm (0018,0050) */
  readonly sliceThicknessMm?: number;

  /** Linear rescale slope (0028,1053) for converting stored pixels to physical units */
  readonly rescaleSlope: number;

  /** Linear rescale intercept (0028,1052) */
  readonly rescaleIntercept: number;

  /** Peak kilovoltage for CT acquisition (0018,0060) */
  readonly kvp?: number;

  /** X-ray tube current in mA (0018,1151) */
  readonly tubeCurrentMa?: number;

  /** PET-specific radionuclide and decay parameters */
  readonly pet?: PetAcquisitionMetadata;
}

/**
 * Visualizable medical imaging unit in NuClear.
 */
export interface ImagingAsset {
  /** Internal opaque identifier for this asset */
  readonly id: AssetId;

  /** Parent Study Instance UID */
  readonly studyInstanceUID: StudyInstanceUID;

  /** Source Series Instance UID if derived directly from a single series */
  readonly seriesInstanceUID?: SeriesInstanceUID;

  /** How to reach the underlying source data */
  readonly sourceLocator: SourceLocator;

  /** Intrinsic content fingerprint of the expected source data */
  readonly sourceFingerprint: SourceFingerprint;

  /** Medical imaging modality */
  readonly modality: Modality;

  /** Asset data kind (volume, stack, derived-volume, secondary-capture) */
  readonly kind: AssetKind;

  /** Strict physical patient geometry in LPS mm coordinates */
  readonly geometry: AssetGeometry;

  /** DICOM Frame of Reference UID (0020,0052) */
  readonly frameOfReferenceUID: FrameOfReferenceUID;

  /** Acquisition, scaling, and quantitative calibration metadata */
  readonly metadata: AssetMetadata;

  /** Clinical physical interpretation of pixel values */
  readonly valueSemantics: ValueSemantics;

  /** Lineage IDs of source assets if this is a derived or resliced volume */
  readonly derivedFrom?: readonly AssetId[];
}
