/**
 * @nuclear/view-engine — fail-closed PreparedView errors (P4.2).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone, no resource residency. Every
 * message names the offending prepared view / source view / asset / state id
 * and the remediation, so a refusal is actionable without reading the
 * implementation.
 */

/**
 * Fail-closed prepared-view assembly and registry failure discriminators.
 *
 * `PREPARED_VIEW_SOURCE_VIEW_MISMATCH` is **reserved**: assembly derives
 * `sourceViewId` from `MedicalViewState.id`, so it is currently unreachable.
 * It stays in the union for persisted-project round-tripping or a future
 * caller that supplies an explicit, independently-checked source view id.
 */
export type PreparedViewErrorCode =
  | 'PREPARED_VIEW_MISSING_PROVENANCE'
  | 'PREPARED_VIEW_EMPTY_PROVENANCE'
  | 'PREPARED_VIEW_BINDING_NOT_IN_PROVENANCE'
  | 'PREPARED_VIEW_SOURCE_VIEW_MISMATCH'
  | 'PREPARED_VIEW_DUPLICATE_LOCK'
  | 'PREPARED_VIEW_DUPLICATE_ID'
  | 'PREPARED_VIEW_UNKNOWN_ID';

/** Optional underlying failure preserved for diagnostics. */
export interface PreparedViewErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised while assembling or storing a view. */
export class PreparedViewError extends Error {
  readonly code: PreparedViewErrorCode;

  constructor(
    code: PreparedViewErrorCode,
    message: string,
    options: PreparedViewErrorOptions = {},
  ) {
    super(message);
    this.name = 'PreparedViewError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
