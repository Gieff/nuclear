/**
 * @nuclear/view-engine — fail-closed co-reference errors (C3 / P4.0.1).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone, no resource residency. Every
 * message names the offending link / snapshot asset id and the remediation, so
 * a refusal is actionable without reading the implementation.
 */

/** Co-reference eligibility failure discriminators (ADR-010 §7.2). */
export type CoReferenceErrorCode =
  | 'CO_REFERENCE_NOT_VERIFIED'
  | 'CO_REFERENCE_UNKNOWN_ASSET'
  | 'CO_REFERENCE_FRAME_OF_REFERENCE_MISMATCH'
  | 'CO_REFERENCE_STUDY_MISMATCH'
  | 'CO_REFERENCE_SERIES_MISMATCH'
  | 'CO_REFERENCE_FINGERPRINT_MISMATCH'
  | 'CO_REFERENCE_GEOMETRIC_DIGEST_MISMATCH';

/** Optional underlying failure preserved for diagnostics. */
export interface CoReferenceErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised while checking co-reference eligibility. */
export class CoReferenceError extends Error {
  readonly code: CoReferenceErrorCode;

  constructor(
    code: CoReferenceErrorCode,
    message: string,
    options: CoReferenceErrorOptions = {},
  ) {
    super(message);
    this.name = 'CoReferenceError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
