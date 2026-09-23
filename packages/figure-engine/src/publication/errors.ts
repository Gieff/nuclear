/**
 * @nuclear/figure-engine — typed, fail-closed publication errors (P5.1).
 *
 * Every refusal is explicit, typed and actionable. Nothing is clamped,
 * defaulted or inferred: a non-physical input never produces a physical
 * publication dimension. See `docs/decisions/ADR-014-…md` (D2, D4).
 */

export const FIGURE_PUBLICATION_ERROR_CODES = {
  unitsInvalid: 'FIGURE_UNITS_INVALID',
  rotationUnsupported: 'FIGURE_ROTATION_UNSUPPORTED',
  containmentInvalid: 'FIGURE_SHEET_CONTAINMENT_INVALID',
  orderInvalid: 'FIGURE_PANEL_ORDER_INVALID',
} as const;

export type FigurePublicationErrorCode =
  (typeof FIGURE_PUBLICATION_ERROR_CODES)[keyof typeof FIGURE_PUBLICATION_ERROR_CODES];

export class FigurePublicationError extends Error {
  readonly code: FigurePublicationErrorCode;

  constructor(code: FigurePublicationErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FigurePublicationError';
    this.code = code;
  }
}
