/**
 * @nuclear/figure-engine — physical millimetres <-> PDF points (P5.7, ADR-015).
 *
 * The PDF page is expressed in PostScript points (1 pt = 1/72 in), while the
 * figure sheet is authored in millimetres. The sheet coordinate system is
 * y-down (origin top-left, the editorial convention); PDF user space is y-up
 * with the origin at the bottom-left, so every vertical position is flipped
 * explicitly by {@link pdfPointsFromSheetY}. Nothing is inferred or clamped.
 *
 * Pure and Node-safe: no DOM, no WebGL, no encoder dependency. Floating-point
 * arithmetic only, so an exact-value test can assert `String(mmToPoints(...))`.
 */

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
// The sheet rectangle type is owned by `layout.ts` (the single source of truth
// for axis-aligned sheet millimetres); it is reused here, never redeclared.
import type { SheetRectMm } from './layout.js';
import { MM_PER_INCH } from './units.js';

/** Exact points-per-inch constant of the PDF/PostScript coordinate system. */
export const PT_PER_INCH = 72;

/** A rectangle in PDF points (y-up, origin bottom-left). */
export interface PdfRectPoints {
  readonly xPt: number;
  readonly yPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
}

function refuseNonFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `${label} must be a finite number in millimetres; received ${String(value)}, and a non-physical length cannot be converted between millimetres and PDF points`,
    );
  }
}

/** Converts millimetres to PDF points: `(mm / 25.4) * 72`. */
export function mmToPoints(mm: number): number {
  refuseNonFinite('pdf length', mm);
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

/** Continuous inverse of {@link mmToPoints}: `(pt / 72) * 25.4`. */
export function pointsToMm(points: number): number {
  refuseNonFinite('pdf length', points);
  return (points / PT_PER_INCH) * MM_PER_INCH;
}

/**
 * Maps a sheet y (y-down millimetres from the top edge) to the PDF y (y-up
 * points from the bottom edge): `mmToPoints(sheetHeightMm - yMm)`. The sheet
 * height must be a finite, strictly positive physical length.
 */
export function pdfPointsFromSheetY(yMm: number, sheetHeightMm: number): number {
  refuseNonFinite('sheet y', yMm);
  if (!Number.isFinite(sheetHeightMm) || sheetHeightMm <= 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `sheet height must be a finite, strictly positive length in millimetres; received ${String(sheetHeightMm)}`,
    );
  }
  return mmToPoints(sheetHeightMm - yMm);
}

/**
 * Converts a sheet rectangle to a PDF rectangle anchored at its **lower-left**
 * corner: `yPt = pdfPointsFromSheetY(yMm + heightMm, sheetHeightMm)`. Refuses
 * `FIGURE_UNITS_INVALID` for non-finite fields or a non-positive width/height.
 */
export function pdfRectFromSheetRect(rect: SheetRectMm, sheetHeightMm: number): PdfRectPoints {
  const fields = [rect.xMm, rect.yMm, rect.widthMm, rect.heightMm];
  if (!fields.every((value) => Number.isFinite(value))) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `pdf rect [${fields.map((value) => String(value)).join(', ')}] must carry finite millimetre fields`,
    );
  }
  if (rect.widthMm <= 0 || rect.heightMm <= 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `pdf rect size ${String(rect.widthMm)}x${String(rect.heightMm)} mm must be strictly positive`,
    );
  }
  return {
    xPt: mmToPoints(rect.xMm),
    yPt: pdfPointsFromSheetY(rect.yMm + rect.heightMm, sheetHeightMm),
    widthPt: mmToPoints(rect.widthMm),
    heightPt: mmToPoints(rect.heightMm),
  };
}
