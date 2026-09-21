/**
 * @nuclear/medical-engine — fail-closed volume ingestion errors (P3.2).
 *
 * Node-safe. This error family is deliberately separate from `RendererError`:
 * ingestion refusals are data/provenance dispositions, not renderer lifecycle
 * or WebGL failures. Every refusal names the blocking condition and the
 * remediation.
 */

/** Fail-closed ingestion failure discriminators. */
export const VOLUME_INGESTION_ERROR_CODES = {
  sourceUnavailable: 'VOLUME_SOURCE_UNAVAILABLE',
  sourceMismatch: 'VOLUME_SOURCE_MISMATCH',
  unsupportedClassification: 'VOLUME_UNSUPPORTED_CLASSIFICATION',
  evidenceUnavailable: 'VOLUME_EVIDENCE_UNAVAILABLE',
  geometryDisagreement: 'VOLUME_GEOMETRY_DISAGREEMENT',
  payloadInvalid: 'VOLUME_PAYLOAD_INVALID',
  constructionFailed: 'VOLUME_CONSTRUCTION_FAILED',
  scalarSemanticsDisagreement: 'VOLUME_SCALAR_SEMANTICS_DISAGREEMENT',
} as const;

/** String-union mirror of `VOLUME_INGESTION_ERROR_CODES` values. */
export type VolumeIngestionErrorCode =
  (typeof VOLUME_INGESTION_ERROR_CODES)[keyof typeof VOLUME_INGESTION_ERROR_CODES];

/** Optional underlying failure preserved for diagnostics. */
export interface VolumeIngestionErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised by ingestion planning or cache binding. */
export class VolumeIngestionError extends Error {
  readonly code: VolumeIngestionErrorCode;

  constructor(
    code: VolumeIngestionErrorCode,
    message: string,
    options: VolumeIngestionErrorOptions = {},
  ) {
    super(message);
    this.name = 'VolumeIngestionError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
