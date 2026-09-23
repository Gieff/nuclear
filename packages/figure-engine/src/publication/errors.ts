/**
 * @nuclear/figure-engine — typed, fail-closed publication errors (P5.1).
 *
 * Every refusal is explicit, typed and actionable. Nothing is clamped or
 * inferred, and no non-physical input produces a physical publication
 * dimension. The only sanctioned default in this subsystem is
 * `alpha: 'opaque'` for a live publication target (`readAlpha`, P5.2). See
 * `docs/decisions/ADR-014-…md` (D2, D4).
 */

export const FIGURE_PUBLICATION_ERROR_CODES = {
  unitsInvalid: 'FIGURE_UNITS_INVALID',
  rotationUnsupported: 'FIGURE_ROTATION_UNSUPPORTED',
  containmentInvalid: 'FIGURE_SHEET_CONTAINMENT_INVALID',
  orderInvalid: 'FIGURE_PANEL_ORDER_INVALID',
  framingInvalid: 'FIGURE_FRAMING_INVALID',
  layoutInvalid: 'FIGURE_LAYOUT_INVALID',
  requestInvalid: 'FIGURE_PUBLICATION_REQUEST_INVALID',
  panelSourceInvalid: 'FIGURE_PUBLICATION_PANEL_SOURCE_INVALID',
  availabilityRefused: 'FIGURE_PUBLICATION_AVAILABILITY_REFUSED',
  mixedAvailability: 'FIGURE_PUBLICATION_MIXED_AVAILABILITY',
  offlineProvenanceInvalid: 'FIGURE_PUBLICATION_OFFLINE_PROVENANCE_INVALID',
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
