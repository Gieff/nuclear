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

/** Persistent identity of a prepared, serializable medical view. */
export type PreparedViewId = Brand<string, 'PreparedViewId'>;

/** Local editorial instance identity; not a medical ViewId. */
export type ComposerViewInstanceId = Brand<string, 'ComposerViewInstanceId'>;

/** Persistent identity for an editorial figure sheet. */
export type FigureSheetId = Brand<string, 'FigureSheetId'>;

/** Identity for a panel in a figure sheet. */
export type FigurePanelId = Brand<string, 'FigurePanelId'>;

/** Identity for a structured annotation in a figure sheet. */
export type FigureAnnotationId = Brand<string, 'FigureAnnotationId'>;

/** Identity for a cached medical preview. */
export type PreviewId = Brand<string, 'PreviewId'>;

/** Logical identifier for a workspace slot group. */
export type ViewGroupId = Brand<string, 'ViewGroupId'>;

/** Logical identifier for a workspace slot. */
export type ViewSlotId = Brand<string, 'ViewSlotId'>;

/** Stable identifier for a Cornerstone-independent viewport surface. */
export type ViewportId = Brand<string, 'ViewportId'>;

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
