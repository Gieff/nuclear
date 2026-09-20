/**
 * @nuclear/shared-types — Source Locators and Source Fingerprints
 *
 * SourceLocator defines how to reach source data across filesystems, archives, or networks.
 * SourceFingerprint defines the expected intrinsic identity of the source data,
 * enabling deterministic verification during project re-open and offline caching.
 */

import type { SeriesInstanceUID, StudyInstanceUID } from './identifiers.js';

/** Discriminated kinds of source locators */
export type SourceLocatorKind =
  | 'local-folder'
  | 'local-file-list'
  | 'archive-entry'
  | 'dicomweb'
  | 'managed-cache';

/** Local filesystem directory containing DICOM series files */
export interface LocalFolderLocator {
  readonly kind: 'local-folder';
  readonly path: string;
}

/** Explicit list of local DICOM files */
export interface LocalFileListLocator {
  readonly kind: 'local-file-list';
  readonly files: readonly string[];
  readonly basePath?: string;
}

/** Compressed archive (e.g. .zip) containing DICOM files */
export interface ArchiveEntryLocator {
  readonly kind: 'archive-entry';
  readonly archivePath: string;
  readonly innerEntryPrefix?: string;
}

/** DICOMweb WADO-RS endpoint */
export interface DicomWebLocator {
  readonly kind: 'dicomweb';
  readonly endpoint: string;
  readonly studyInstanceUID: StudyInstanceUID | string;
  readonly seriesInstanceUID?: SeriesInstanceUID | string;
}

/** Managed application cache directory for imported projects */
export interface ManagedCacheLocator {
  readonly kind: 'managed-cache';
  readonly cacheKey: string;
  readonly relativePath: string;
}

/** Discriminated union of all supported source locators */
export type SourceLocator =
  | LocalFolderLocator
  | LocalFileListLocator
  | ArchiveEntryLocator
  | DicomWebLocator
  | ManagedCacheLocator;

/**
 * Intrinsic fingerprint identifying a clinical series independently of file path.
 * Used to detect whether a relinked source matches the exact data originally referenced.
 */
export interface SourceFingerprint {
  /** DICOM Study Instance UID */
  readonly studyInstanceUID: StudyInstanceUID | string;

  /** DICOM Series Instance UID */
  readonly seriesInstanceUID: SeriesInstanceUID | string;

  /** Total number of SOP instances (slices) belonging to the series */
  readonly instanceCount: number;

  /** Cryptographic content digest (e.g. sha256:... of sorted instance hashes or payload) */
  readonly contentDigest: string;

  /** Digest of the sorted list of SOP Instance UIDs */
  readonly sopInstanceUIDsHash?: string;

  /** Aggregate byte size of the raw DICOM payload if available */
  readonly totalBytes?: number;

  /** Geometric digest computed from origin, orientation, spacing and dimensions */
  readonly geometricDigest?: string;
}
