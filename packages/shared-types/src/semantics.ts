/**
 * @nuclear/shared-types — Clinical Semantics & Value Interpretation
 *
 * Defines modality classifications, patient metadata, and physical value interpretations
 * (Hounsfield units for CT, SUVbw / activity concentration for PET).
 */

/** Primary medical imaging modalities supported by NuClear */
export type Modality =
  | 'CT'
  | 'PT'
  | 'MR'
  | 'NM'
  | 'CR'
  | 'DX'
  | 'SC'
  | 'OT';

/** Functional category of an imaging asset */
export type AssetKind =
  | 'volume'
  | 'stack'
  | 'derived-volume'
  | 'secondary-capture';

/** DICOM Patient Sex (0010,0040) */
export type PatientSex = 'M' | 'F' | 'O' | 'U';

/**
 * Anonymized or clinical patient demographic reference.
 * STRICT PRIVACY REQUIREMENT: Direct PHI fields (e.g. patientName, patientBirthDate)
 * MUST NOT be part of this persisted clinical reference in .ncp.
 */
export interface PatientReference {
  /** Anonymized or pseudo patient identifier */
  readonly patientId?: string;

  /** Patient administrative sex */
  readonly patientSex?: PatientSex;

  /**
   * Patient body weight in kilograms (0010,1030).
   * Essential clinical parameter for quantitative SUVbw determination.
   */
  readonly patientWeightKg?: number;
}

/**
 * Physical interpretation and quantitative scaling of stored pixel values.
 */
export type ValueSemanticsType =
  | 'hounsfield'
  | 'suv-bw'
  | 'activity-concentration'
  | 'raw-counts'
  | 'optical-density'
  | 'generic-intensity';

/**
 * Declares the clinical physical interpretation, units, and default display ranges.
 */
export interface ValueSemantics {
  /** Physical quantity classification */
  readonly type: ValueSemanticsType;

  /** Display unit symbol (e.g. 'HU', 'g/mL', 'Bq/mL', 'counts') */
  readonly unit: string;

  /** Default window/level or display range [min, max] */
  readonly defaultRange?: readonly [number, number];

  /** Physically plausible bound [min, max] for input validation */
  readonly physicalRange?: readonly [number, number];
}
