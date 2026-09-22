/**
 * @nuclear/view-engine — fail-closed resource-demand projection errors (P4.7).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone. Every message names the
 * offending lease/slot/field **and** a remediation clause, so a refusal is
 * actionable without reading the implementation (mirrors `SurfaceError`).
 */

/** Fail-closed resource-demand projection failure discriminators. */
export type ResidencyProjectionErrorCode =
  | 'RESIDENCY_PROJECTION_BUILDER_MISMATCH'
  | 'RESIDENCY_PROJECTION_MALFORMED';

/** Optional underlying failure preserved for diagnostics. */
export interface ResidencyProjectionErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised by the demand projection/reconcile seam. */
export class ResidencyProjectionError extends Error {
  readonly code: ResidencyProjectionErrorCode;

  constructor(
    code: ResidencyProjectionErrorCode,
    message: string,
    options: ResidencyProjectionErrorOptions = {},
  ) {
    super(message);
    this.name = 'ResidencyProjectionError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
