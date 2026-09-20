/**
 * @nuclear/shared-types — Identifiers
 *
 * Nominal branded types for clinical entities, DICOM UIDs, and view surfaces.
 * Prevents accidental mixing of raw strings across domain boundaries.
 */

declare const BrandSymbol: unique symbol;

export type Brand<T, B extends string> = T & { readonly [BrandSymbol]: B };

/** Logical identifier for a clinical study */
export type StudyId = Brand<string, 'StudyId'>;

/** Logical identifier for an imaging asset */
export type AssetId = Brand<string, 'AssetId'>;

/** Logical identifier for a view in the imaging workspace */
export type ViewId = Brand<string, 'ViewId'>;

/** Persistent identifier for an interactive viewport surface */
export type SurfaceId = Brand<string, 'SurfaceId'>;

/** Layout row identifier */
export type RowId = Brand<string, 'RowId'>;

/** Layout cell identifier */
export type CellId = Brand<string, 'CellId'>;

/** Unique identifier for a spatial registration transform */
export type TransformId = Brand<string, 'TransformId'>;

/** DICOM Study Instance UID (0020,000D) */
export type StudyInstanceUID = Brand<string, 'StudyInstanceUID'>;

/** DICOM Series Instance UID (0020,000E) */
export type SeriesInstanceUID = Brand<string, 'SeriesInstanceUID'>;

/** DICOM SOP Instance UID (0008,0018) */
export type SOPInstanceUID = Brand<string, 'SOPInstanceUID'>;

/** DICOM Frame of Reference UID (0020,0052) */
export type FrameOfReferenceUID = Brand<string, 'FrameOfReferenceUID'>;
