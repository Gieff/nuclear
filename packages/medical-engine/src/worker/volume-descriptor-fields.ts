/**
 * @nuclear/medical-engine — ADR-013 descriptor field parsers.
 *
 * Low-level, fail-closed parsers for the worker descriptor's format/enums,
 * dimensions, rescale and correlation blocks. Shared by the descriptor
 * validator; no DICOM interpretation and no path handling live here.
 */

import { WorkerContractError } from './errors.js';
import { asArray, asNumber, asRecord, asString } from './narrowing.js';
import type {
  WorkerVolumeCorrelation,
  WorkerVolumeDescriptor,
  WorkerVolumeRescale,
  WorkerVolumeScalarDataDomain,
  WorkerVolumeScalarDataType,
  WorkerVolumeSignedness,
} from './volume-types.js';

/** Bytes per voxel for each accepted v1 element type (ADR-013 §3). */
export const WORKER_VOLUME_DTYPE_BYTES: Readonly<Record<WorkerVolumeScalarDataType, number>> = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  float32: 4,
};

/** Required signedness for each accepted element type. */
export const WORKER_VOLUME_SIGNEDNESS_BY_DTYPE: Readonly<
  Record<WorkerVolumeScalarDataType, WorkerVolumeSignedness>
> = {
  int8: 'signed',
  uint8: 'unsigned',
  int16: 'signed',
  uint16: 'unsigned',
  float32: 'not-applicable',
};

export const WORKER_VOLUME_DTYPE_SET: Readonly<Record<WorkerVolumeScalarDataType, true>> = {
  int8: true,
  uint8: true,
  int16: true,
  uint16: true,
  float32: true,
};

export const WORKER_VOLUME_DOMAIN_SET: Readonly<Record<WorkerVolumeScalarDataDomain, true>> = {
  'stored-values': true,
  'rescaled-hu': true,
  'rescaled-bqml': true,
};

export const WORKER_VOLUME_SIGNEDNESS_SET: Readonly<Record<WorkerVolumeSignedness, true>> = {
  signed: true,
  unsigned: true,
  'not-applicable': true,
};

export const WORKER_VOLUME_ALLOCATED_BITS: readonly number[] = [8, 16, 32];
export const WORKER_VOLUME_HANDLE_PATTERN = /^[0-9a-f]{32}$/;
export const WORKER_VOLUME_CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Exact shape of the worker-observed SOP Instance UID set digest (ADR-013 §5). */
export const WORKER_VOLUME_SOP_UID_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Strict RFC 3339 UTC publication instant accepted for `publishedAt` (ADR-013 §7). */
export const WORKER_VOLUME_PUBLISHED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$/;

/** Canonical epoch (ms) of an ISO-8601 UTC timestamp, or `null` when invalid. */
function publicationEpochMs(text: string): number | null {
  if (!WORKER_VOLUME_PUBLISHED_AT_PATTERN.test(text)) return null;
  const canonical = text
    .replace(/\.(\d{1,9})/, (_match, fraction: string) => `.${fraction.padEnd(3, '0').slice(0, 3)}`)
    .replace(/\+00:00$/, 'Z');
  const withMillis = canonical.includes('.') ? canonical : canonical.replace(/Z$/, '.000Z');
  const epochMs = Date.parse(withMillis);
  if (!Number.isFinite(epochMs)) return null;
  return new Date(epochMs).toISOString() === withMillis ? epochMs : null;
}

/**
 * Parse and strictly validate the worker publication instant. Only an absolute
 * UTC instant is accepted (`Z` or a zero `+00:00` offset); a non-UTC offset,
 * a missing zone or a rolled-over calendar date is refused (ADR-013 §7).
 */
export function parsePublishedAt(value: unknown): string {
  const text = asString(value, 'volume descriptor.publishedAt');
  if (publicationEpochMs(text) === null) {
    throw new WorkerContractError(
      'volume descriptor.publishedAt must be a valid ISO-8601 UTC instant.',
    );
  }
  return text;
}

/** Absolute expiry instant (ms) of a handle: `publishedAt + ttlSeconds` (ADR-013 §7). */
export function workerVolumeExpiryEpochMs(descriptor: WorkerVolumeDescriptor): number {
  const epochMs = publicationEpochMs(descriptor.publishedAt);
  if (epochMs === null) {
    throw new WorkerContractError(
      'volume descriptor.publishedAt must be a valid ISO-8601 UTC instant.',
    );
  }
  return epochMs + descriptor.ttlSeconds * 1000;
}

/** Fail closed with a descriptor-scoped contract error. */
export function requireContract(condition: boolean, detail: string): void {
  if (!condition) throw new WorkerContractError(`volume descriptor ${detail}.`);
}

/** Parse a strictly positive integer field. */
export function positiveInteger(value: unknown, where: string): number {
  const number = asNumber(value, `volume descriptor.${where}`);
  requireContract(Number.isSafeInteger(number) && number > 0, `${where} must be a positive integer`);
  return number;
}

/** Parse a string that must be a member of a closed vocabulary. */
export function requireEnum<T extends string>(
  value: unknown,
  allowed: Readonly<Record<T, true>>,
  where: string,
): T {
  const text = asString(value, `volume descriptor.${where}`);
  if (!Object.prototype.hasOwnProperty.call(allowed, text)) {
    throw new WorkerContractError(
      `volume descriptor.${where} '${text}' is not an accepted ADR-013 value.`,
    );
  }
  return text as T;
}

/** Parse the three positive volume dimensions in `[nx, ny, nz]` order. */
export function parseDimensions(value: unknown): readonly [number, number, number] {
  const items = asArray(value, 'volume descriptor.dimensions');
  requireContract(items.length === 3, 'dimensions must have length 3');
  return [
    positiveInteger(items[0], 'dimensions[0]'),
    positiveInteger(items[1], 'dimensions[1]'),
    positiveInteger(items[2], 'dimensions[2]'),
  ];
}

/** Parse the optional rescale provenance block. */
export function parseRescale(value: unknown): WorkerVolumeRescale {
  const record = asRecord(value, 'volume descriptor.rescale');
  return {
    slope: asNumber(record.slope, 'volume descriptor.rescale.slope'),
    intercept: asNumber(record.intercept, 'volume descriptor.rescale.intercept'),
  };
}

/** Parse the observed source/series/FoR correlation block. */
export function parseCorrelation(value: unknown): WorkerVolumeCorrelation {
  const record = asRecord(value, 'volume descriptor.correlation');
  const result: {
    studyInstanceUID: string;
    seriesInstanceUID: string;
    instanceCount: number;
    contentDigest: string;
    geometricDigest: string;
    sopInstanceUIDsHash: string;
    frameOfReferenceUID: string;
    totalBytes?: number;
  } = {
    studyInstanceUID: asString(
      record.studyInstanceUID,
      'volume descriptor.correlation.studyInstanceUID',
    ),
    seriesInstanceUID: asString(
      record.seriesInstanceUID,
      'volume descriptor.correlation.seriesInstanceUID',
    ),
    instanceCount: positiveInteger(record.instanceCount, 'correlation.instanceCount'),
    contentDigest: asString(
      record.contentDigest,
      'volume descriptor.correlation.contentDigest',
    ),
    geometricDigest: asString(
      record.geometricDigest,
      'volume descriptor.correlation.geometricDigest',
    ),
    sopInstanceUIDsHash: asString(
      record.sopInstanceUIDsHash,
      'volume descriptor.correlation.sopInstanceUIDsHash',
    ),
    frameOfReferenceUID: asString(
      record.frameOfReferenceUID,
      'volume descriptor.correlation.frameOfReferenceUID',
    ),
  };
  requireContract(
    WORKER_VOLUME_SOP_UID_HASH_PATTERN.test(result.sopInstanceUIDsHash),
    'correlation.sopInstanceUIDsHash must be a sha256:<64 lowercase hex> digest',
  );
  if (record.totalBytes !== undefined) {
    result.totalBytes = positiveInteger(record.totalBytes, 'correlation.totalBytes');
  }
  return result;
}
