/**
 * @nuclear/medical-engine — fail-closed residency errors (P3.3-A).
 *
 * Node-safe and separate from `VolumeIngestionError`: these name demand,
 * budget and source-precondition refusals raised before any physical mutation.
 * Every message names the blocking condition and the remediation.
 */

/** Fail-closed residency failure discriminators. */
export const RESIDENCY_ERROR_CODES = {
  leaseAssetMismatch: 'RESIDENCY_LEASE_ASSET_MISMATCH',
  leaseVolumeConflict: 'RESIDENCY_LEASE_VOLUME_CONFLICT',
  sourceUnavailable: 'RESIDENCY_SOURCE_UNAVAILABLE',
  invalidDemand: 'RESIDENCY_INVALID_DEMAND',
  invalidBudget: 'RESIDENCY_INVALID_BUDGET',
} as const;

/** String-union mirror of `RESIDENCY_ERROR_CODES` values. */
export type ResidencyErrorCode =
  (typeof RESIDENCY_ERROR_CODES)[keyof typeof RESIDENCY_ERROR_CODES];

/** Optional underlying failure preserved for diagnostics. */
export interface ResidencyErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised by the residency state machine. */
export class ResidencyError extends Error {
  readonly code: ResidencyErrorCode;

  constructor(code: ResidencyErrorCode, message: string, options: ResidencyErrorOptions = {}) {
    super(message);
    this.name = 'ResidencyError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
