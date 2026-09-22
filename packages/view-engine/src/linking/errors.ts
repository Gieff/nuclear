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

/**
 * Fail-closed `ViewLink` eligibility and application discriminators (P4.4,
 * ADR-010 §3/§7.2). `CO_REFERENCE_*` refusals keep their own code and class
 * (`CoReferenceError`) and are intentionally propagated, not re-wrapped.
 */
export type LinkErrorCode =
  | 'LINK_MALFORMED'
  | 'LINK_INTRA_STUDY_EVIDENCE_FRAME_MISMATCH'
  | 'LINK_INTRA_STUDY_EVIDENCE_MISMATCH'
  | 'LINK_INTER_STUDY_SAME_FRAME'
  | 'LINK_INTER_STUDY_TOLERANCE_INVALID'
  | 'LINK_INTER_STUDY_MISSING_DIFFERENTIAL'
  | 'LINK_INTER_STUDY_DIFFERENTIAL_INVALID'
  | 'LINK_INTER_STUDY_MISSING_TRANSFORM'
  | 'LINK_INTER_STUDY_TRANSFORM_INVALID'
  | 'LINK_INTER_STUDY_TRANSFORM_FRAME_MISMATCH'
  | 'LINK_INTER_STUDY_OUT_OF_DOMAIN_MISMATCH'
  | 'LINK_INTER_STUDY_MODE_INCONSISTENT'
  | 'LINK_APPLICATION_REQUIRES_CO_REFERENCE'
  | 'LINK_APPLICATION_UNSUPPORTED_SYNCHRONIZED_STATE'
  | 'LINK_VIEW_MISMATCH'
  | 'LINK_SELF_REFERENCE'
  | 'LINK_SHARED_STATE_CONFLICT';

/** Optional underlying failure preserved for diagnostics. */
export interface LinkErrorOptions {
  readonly cause?: unknown;
}

/**
 * Typed, serializable refusal raised while validating or applying a
 * `ViewLink`. Every message names the offending view/asset/frame ids and
 * carries a `Remediation:` clause.
 */
export class LinkError extends Error {
  readonly code: LinkErrorCode;

  constructor(code: LinkErrorCode, message: string, options: LinkErrorOptions = {}) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
