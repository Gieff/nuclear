/**
 * @nuclear/view-engine — fail-closed workspace errors (P4.1).
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone. Every message names the
 * offending id or state and the remediation, so a refusal is actionable
 * without reading the implementation.
 */

/** Fail-closed workspace failure discriminators. */
export type WorkspaceErrorCode =
  | 'WORKSPACE_DUPLICATE_STUDY'
  | 'WORKSPACE_DUPLICATE_ASSET'
  | 'WORKSPACE_UNKNOWN_STUDY'
  | 'WORKSPACE_UNKNOWN_ASSET'
  | 'WORKSPACE_UNKNOWN_SLOT'
  | 'WORKSPACE_UNKNOWN_GROUP'
  | 'WORKSPACE_SLOT_LAYOUT_INVALID'
  | 'WORKSPACE_ILLEGAL_SLOT_TRANSITION'
  | 'WORKSPACE_DEMAND_REQUIRES_BINDING'
  | 'WORKSPACE_NON_FINITE_NUMBER'
  | 'WORKSPACE_UNSUPPORTED_VALUE'
  | 'WORKSPACE_CYCLIC_VALUE';

/** Optional underlying failure preserved for diagnostics. */
export interface WorkspaceErrorOptions {
  readonly cause?: unknown;
}

/** Typed, serializable refusal raised by the workspace model. */
export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;

  constructor(
    code: WorkspaceErrorCode,
    message: string,
    options: WorkspaceErrorOptions = {},
  ) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
