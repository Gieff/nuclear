/**
 * @nuclear/view-engine — fail-closed shared-state errors (P4.3).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone. Every message names the
 * offending group/view id **and** a remediation clause, so a refusal is
 * actionable without reading the implementation. A refusal raised by the
 * value-integrity walk (`assertSerializableValue`) is intentionally propagated
 * as the existing typed `WorkspaceError`; it is never wrapped in a
 * `SharedStateError`, so callers keep the precise diagnostic.
 */

/** Fail-closed shared-state failure discriminators. */
export type SharedStateErrorCode =
  | 'SHARED_STATE_DUPLICATE_GROUP'
  | 'SHARED_STATE_UNKNOWN_GROUP'
  | 'SHARED_STATE_VIEW_ALREADY_ATTACHED'
  | 'SHARED_STATE_VIEW_NOT_ATTACHED';

/** Optional underlying failure preserved for diagnostics. */
export interface SharedStateErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised by the shared-state registry/holder. */
export class SharedStateError extends Error {
  readonly code: SharedStateErrorCode;

  constructor(
    code: SharedStateErrorCode,
    message: string,
    options: SharedStateErrorOptions = {},
  ) {
    super(message);
    this.name = 'SharedStateError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
