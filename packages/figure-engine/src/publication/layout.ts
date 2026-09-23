/**
 * @nuclear/figure-engine — figure-sheet panel placement in physical millimetres
 * (P5.1, ADR-014 D3 and OD-2).
 *
 * `PanelLayoutState` governs Panel Content Space -> Figure Sheet Space. This
 * module exposes the axis-aligned panel sheet-space rectangle, a fail-closed
 * containment check and a deterministic z-order. Rotation is deliberately not
 * evaluated here: the current contract cannot distinguish an editorial
 * container from a medical panel, so **medical** placement/containment stays
 * fail-closed for `rotationDeg !== 0` (ADR-014 OD-2, ratified 2026-09-23). The
 * ratified pure rotation primitive lives in `sheet-placement.ts`.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone.
 */

import type {
  ComposerPanel,
  PanelLayoutState,
  SheetSizeMm,
} from '@nuclear/shared-types';

import {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  type FigurePublicationErrorCode,
} from './errors.js';

/** Axis-aligned rectangle on the figure sheet, in physical millimetres. */
export interface SheetRectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

function refuse(code: FigurePublicationErrorCode, message: string): never {
  throw new FigurePublicationError(code, message);
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function assertSheetSize(sheetSizeMm: SheetSizeMm): void {
  if (!isPositiveFinite(sheetSizeMm[0]) || !isPositiveFinite(sheetSizeMm[1])) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
      `figure sheet size [${String(sheetSizeMm[0])}, ${String(sheetSizeMm[1])}] mm must be finite and strictly positive; containment cannot be evaluated against a non-physical sheet`,
    );
  }
}

/**
 * Returns the panel's sheet-space rectangle in millimetres. Refuses
 * `FIGURE_ROTATION_UNSUPPORTED` when `rotationDeg` is non-zero and
 * `FIGURE_SHEET_CONTAINMENT_INVALID` for non-finite position or
 * non-finite/non-positive size. Nothing is clamped to the sheet.
 *
 * The rotation refusal is the ratified **medical** policy (ADR-014 OD-2): the
 * origin/sign are now defined, but the current contract cannot distinguish an
 * editorial container from a medical panel, so medical placement/containment
 * stays fail-closed. The ratified pure rotation primitive is
 * `panelContentToSheet`/`sheetToPanelContent`.
 */
export function panelSheetRectMm(layout: PanelLayoutState): SheetRectMm {
  if (layout.rotationDeg !== 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.rotationUnsupported,
      `panel rotation ${String(layout.rotationDeg)} deg is refused for medical panel placement: the current contract cannot distinguish an editorial container from a medical panel (ADR-014 OD-2, ratified 2026-09-23); use the sheet-placement primitive for editorial content`,
    );
  }

  const [xMm, yMm] = layout.positionMm;
  const [widthMm, heightMm] = layout.sizeMm;
  if (!Number.isFinite(xMm) || !Number.isFinite(yMm)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
      `panel position [${String(xMm)}, ${String(yMm)}] mm must be finite`,
    );
  }
  if (!isPositiveFinite(widthMm) || !isPositiveFinite(heightMm)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
      `panel size [${String(widthMm)}, ${String(heightMm)}] mm must be finite and strictly positive`,
    );
  }

  return { xMm, yMm, widthMm, heightMm };
}

/** True when the axis-aligned rectangle lies inside the sheet (edges inclusive). */
function liesWithin(rect: SheetRectMm, sheetSizeMm: SheetSizeMm): boolean {
  return (
    rect.xMm >= 0 &&
    rect.yMm >= 0 &&
    rect.xMm + rect.widthMm <= sheetSizeMm[0] &&
    rect.yMm + rect.heightMm <= sheetSizeMm[1]
  );
}

/**
 * Predicate form of {@link assertPanelWithinSheet}. Propagates the typed
 * rotation/non-finite refusals instead of returning a misleading `false` when
 * containment cannot be evaluated. The sheet boundary is inclusive: a panel
 * whose right/bottom edge lies exactly on the sheet edge is contained.
 */
export function isPanelWithinSheet(
  layout: PanelLayoutState,
  sheetSizeMm: SheetSizeMm,
): boolean {
  assertSheetSize(sheetSizeMm);
  return liesWithin(panelSheetRectMm(layout), sheetSizeMm);
}

/**
 * Fail-closed containment check: returns the panel sheet rectangle when it is
 * fully inside the sheet, otherwise refuses `FIGURE_SHEET_CONTAINMENT_INVALID`
 * with the offending rectangle.
 */
export function assertPanelWithinSheet(
  layout: PanelLayoutState,
  sheetSizeMm: SheetSizeMm,
): SheetRectMm {
  assertSheetSize(sheetSizeMm);
  const rect = panelSheetRectMm(layout);
  if (!liesWithin(rect, sheetSizeMm)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
      `panel rectangle x=${rect.xMm} y=${rect.yMm} w=${rect.widthMm} h=${rect.heightMm} mm is not contained in the ${sheetSizeMm[0]}x${sheetSizeMm[1]} mm sheet`,
    );
  }
  return rect;
}

/**
 * Deterministic painting order: ascending `zIndex`, preserving the caller's
 * input order for equal z-values (stable). Refuses
 * `FIGURE_PANEL_ORDER_INVALID` for a non-integer z-index. The returned array is
 * frozen; the panel objects themselves are shared by reference.
 */
export function orderPanelsByZ(panels: readonly ComposerPanel[]): readonly ComposerPanel[] {
  const indexed = panels.map((panel, index) => {
    const zIndex = panel.layout.zIndex;
    if (!Number.isInteger(zIndex)) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.orderInvalid,
        `panel '${panel.id}' has non-integer zIndex ${String(zIndex)}; a deterministic painting order requires integer z-indices`,
      );
    }
    return { panel, index, zIndex };
  });

  indexed.sort((left, right) => left.zIndex - right.zIndex || left.index - right.index);

  return Object.freeze(indexed.map((entry) => entry.panel));
}
