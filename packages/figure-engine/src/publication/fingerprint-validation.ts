/**
 * @nuclear/figure-engine — `SourceFingerprint` field-level validation (P5.2).
 *
 * Mirrors the Fase-1 oracle's `isSourceFingerprint` (mandatory fields present
 * and typed; optional digests non-blank when present; `totalBytes` a
 * non-negative integer when present). This is a deliberate, publication-
 * relevant co-implementation: offline preview validity is claimed over these
 * fingerprints and the oracle is test-side only.
 *
 * Internal module: not re-exported from the package barrel. Pure and Node-safe.
 */

import type { SourceFingerprint } from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { asNonEmptyString, asRecord, isPositiveFinite, refuse } from './guards.js';

export function readFingerprint(value: unknown, path: string): SourceFingerprint {
  const record = asRecord(value, path);
  asNonEmptyString(record.studyInstanceUID, `${path}.studyInstanceUID`);
  asNonEmptyString(record.seriesInstanceUID, `${path}.seriesInstanceUID`);
  if (!isPositiveFinite(record.instanceCount) || !Number.isInteger(record.instanceCount)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
      `${path}.instanceCount must be a positive integer`,
    );
  }
  asNonEmptyString(record.contentDigest, `${path}.contentDigest`);
  for (const optional of ['sopInstanceUIDsHash', 'geometricDigest'] as const) {
    if (Object.prototype.hasOwnProperty.call(record, optional)) {
      asNonEmptyString(record[optional], `${path}.${optional}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'totalBytes')) {
    const totalBytes = record.totalBytes;
    if (
      typeof totalBytes !== 'number' ||
      !Number.isFinite(totalBytes) ||
      !Number.isInteger(totalBytes) ||
      totalBytes < 0
    ) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.requestInvalid,
        `${path}.totalBytes must be a non-negative integer when present`,
      );
    }
  }
  return value as SourceFingerprint;
}
