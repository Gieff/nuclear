/**
 * @nuclear/view-engine — fail-closed lock errors (P4.5, ADR-010 §4).
 *
 * A `StateLock` means "this canonical state must not change" — it is not
 * "disable the mouse" (ADR-010 §4). Every refusal raised here names the locked
 * state, the lock owner, the offending prepared view, the attempted operation
 * and a `Remediation:` clause, so a caller can act without reading the
 * implementation.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */

/** Lock enforcement failure discriminators. */
export type LockErrorCode = 'LOCK_STATE_PROTECTED';

/** Optional underlying failure preserved for diagnostics. */
export interface LockErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised when locked state is mutated. */
export class LockError extends Error {
  readonly code: LockErrorCode;

  constructor(code: LockErrorCode, message: string, options: LockErrorOptions = {}) {
    super(message);
    this.name = 'LockError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
