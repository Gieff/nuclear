/**
 * @nuclear/view-engine — fail-closed viewport-surface errors (P4.6).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone. Every message names the
 * offending id/field **and** a remediation clause, so a refusal is actionable
 * without reading the implementation (mirrors `SharedStateError`/`WorkspaceError`).
 */

/** Fail-closed viewport-surface failure discriminators. */
export type SurfaceErrorCode =
  | 'SURFACE_UNKNOWN_ID'
  | 'SURFACE_DUPLICATE_ID'
  | 'SURFACE_DUPLICATE_VIEWPORT_ID'
  | 'SURFACE_CAPACITY_EXCEEDED'
  | 'SURFACE_ILLEGAL_TRANSITION'
  | 'SURFACE_BINDING_EMPTY'
  | 'SURFACE_MALFORMED'
  | 'SURFACE_LAYOUT_INVALID';

/** Optional underlying failure preserved for diagnostics. */
export interface SurfaceErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised by the surface registry/layout manager. */
export class SurfaceError extends Error {
  readonly code: SurfaceErrorCode;

  constructor(
    code: SurfaceErrorCode,
    message: string,
    options: SurfaceErrorOptions = {},
  ) {
    super(message);
    this.name = 'SurfaceError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
