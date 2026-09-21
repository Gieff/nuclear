/**
 * @nuclear/medical-engine — typed, fail-closed renderer lifecycle errors.
 *
 * Every adapter refusal is explicit and actionable: the message states both
 * the failure and the remediation. Nothing is swallowed and no plausible
 * fallback renderer is ever produced.
 *
 * This module is Node-safe: it has no DOM or `@cornerstonejs/core` import.
 */

/** Discriminator shared by every renderer adapter failure. */
export const RENDERER_ERROR_CODES = {
  unavailable: 'RENDERER_UNAVAILABLE',
  initialization: 'RENDERER_INITIALIZATION_FAILED',
  lifecycle: 'RENDERER_LIFECYCLE_VIOLATION',
} as const;

/** String-union mirror of `RENDERER_ERROR_CODES` values (no runtime type syntax). */
export type RendererErrorCode =
  (typeof RENDERER_ERROR_CODES)[keyof typeof RENDERER_ERROR_CODES];

/** Optional underlying failure preserved for diagnostics. */
export interface RendererErrorOptions {
  readonly cause?: unknown;
}

/** A discrete teardown step that failed while releasing renderer resources. */
export type RendererTeardownOperation = 'engine-destroy' | 'container-removal';

/** Typed record of one failed teardown operation and its underlying cause. */
export interface RendererTeardownFailure {
  readonly operation: RendererTeardownOperation;
  readonly cause: unknown;
}

/** Lifecycle-error options add the structured teardown failure record. */
export interface RendererLifecycleErrorOptions extends RendererErrorOptions {
  readonly failures?: readonly RendererTeardownFailure[];
}

/** Base class for every `CornerstoneRendererAdapter` failure. */
export class RendererError extends Error {
  readonly code: RendererErrorCode;

  constructor(code: RendererErrorCode, message: string, options: RendererErrorOptions = {}) {
    super(message);
    this.name = 'RendererError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** The runtime host cannot provide a WebGL 2-capable context. */
export class RendererUnavailableError extends RendererError {
  constructor(message: string, options?: RendererErrorOptions) {
    super(RENDERER_ERROR_CODES.unavailable, message, options);
    this.name = 'RendererUnavailableError';
  }
}

/** Cornerstone initialization, container creation or engine creation failed. */
export class RendererInitializationError extends RendererError {
  constructor(message: string, options?: RendererErrorOptions) {
    super(RENDERER_ERROR_CODES.initialization, message, options);
    this.name = 'RendererInitializationError';
  }
}

/** The adapter was moved through an invalid lifecycle transition. */
export class RendererLifecycleError extends RendererError {
  /** Failed teardown operations, when this error reports an incomplete stop. */
  readonly failures?: readonly RendererTeardownFailure[];

  constructor(message: string, options: RendererLifecycleErrorOptions = {}) {
    super(RENDERER_ERROR_CODES.lifecycle, message, options);
    this.name = 'RendererLifecycleError';
    if (options.failures !== undefined) {
      this.failures = options.failures;
    }
  }
}
