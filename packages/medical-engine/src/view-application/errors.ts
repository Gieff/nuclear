/**
 * @nuclear/medical-engine — typed, fail-closed view-application refusals
 * (P3.4-B.2.1). A missing or ambiguous input must never yield a plausible but
 * wrong renderer application, so every refusal is named and actionable.
 */

export const VIEW_APPLICATION_ERROR_CODES = {
  volumeNotBound: 'VIEW_VOLUME_NOT_BOUND',
  petBindingRequired: 'VIEW_PET_BINDING_REQUIRED',
  colormapUnknown: 'VIEW_COLORMAP_UNKNOWN',
  projectionInvalid: 'VIEW_PROJECTION_INVALID',
  stateInvalid: 'VIEW_STATE_INVALID',
} as const;

export type ViewApplicationErrorCode =
  (typeof VIEW_APPLICATION_ERROR_CODES)[keyof typeof VIEW_APPLICATION_ERROR_CODES];

export class ViewApplicationError extends Error {
  readonly code: ViewApplicationErrorCode;

  constructor(code: ViewApplicationErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ViewApplicationError';
    this.code = code;
  }
}

export function refuse(
  code: ViewApplicationErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new ViewApplicationError(code, message, cause);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
