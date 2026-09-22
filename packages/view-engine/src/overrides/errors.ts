/**
 * @nuclear/view-engine — fail-closed local-override errors (P4.5, ADR-010 §4).
 *
 * A `LocalViewOverride` is a local, serializable divergence from a source
 * `PreparedView`; it never mutates that source. Every refusal raised here names
 * the offending source view / composer instance and a `Remediation:` clause, so
 * a malformed or inapplicable override is actionable without reading the
 * implementation.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */

/** Local-override resolution failure discriminators. */
export type OverrideErrorCode =
  | 'OVERRIDE_MALFORMED'
  | 'OVERRIDE_SOURCE_MISMATCH'
  | 'OVERRIDE_EMPTY'
  | 'OVERRIDE_DUPLICATE_STATE'
  | 'OVERRIDE_STATE_MALFORMED'
  | 'OVERRIDE_STATE_NOT_APPLICABLE';

/** Optional underlying failure preserved for diagnostics. */
export interface OverrideErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised while resolving a `LocalViewOverride`. */
export class OverrideError extends Error {
  readonly code: OverrideErrorCode;

  constructor(code: OverrideErrorCode, message: string, options: OverrideErrorOptions = {}) {
    super(message);
    this.name = 'OverrideError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
