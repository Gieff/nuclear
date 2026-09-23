/**
 * @nuclear/figure-engine — publication physical units (P5.1, ADR-014 D2).
 *
 * The ratified publication conversion is `pixels = round-half-up(mm / 25.4 *
 * dpi)`, with `MM_PER_INCH = 25.4`. The acyclic package graph forbids a
 * `figure-engine` -> `medical-engine` import, so this is a deliberate
 * co-implementation of the ADR-009 formula; the cross-package equivalence test
 * `tests/figure-engine/publication-units.test.ts` asserts that this function,
 * `medical-engine`'s `computeRenderTargetPixelDimensions` and the Fase-1
 * contract oracle agree exactly over a curated matrix.
 *
 * Pure and Node-safe: no DOM, no WebGL, no Cornerstone and no floating-point
 * library call.
 */

import {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  type FigurePublicationErrorCode,
} from './errors.js';

/** Exact millimetres-per-inch constant of the ratified publication formula. */
export const MM_PER_INCH = 25.4;

export type PhysicalSizeMm = readonly [number, number];
export type PixelDimensions = readonly [number, number];

function refuse(code: FigurePublicationErrorCode, message: string): never {
  throw new FigurePublicationError(code, message);
}

/** True only for a finite, strictly positive number. */
function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** True only for a finite, strictly positive integer. */
function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

/**
 * Rounds half-up for positive inputs without a floating-point library call.
 * `value - (value % 1)` is the floor for a finite positive value. Kept
 * byte-identical in behaviour to `medical-engine`'s `roundHalfUp` (ADR-009) so
 * the two implementations cannot diverge on rounding.
 */
function roundHalfUp(value: number): number {
  const base = value - (value % 1);
  return value % 1 >= 0.5 ? base + 1 : base;
}

/**
 * Computes the publication pixel dimensions as `round-half-up(mm / 25.4 * dpi)`
 * per axis. Refuses `FIGURE_UNITS_INVALID` when either millimetre value or the
 * DPI is non-finite/non-positive, or when the computed result is not a positive
 * finite integer (for example an overflow to `Infinity`).
 */
export function mmToPixels(sizeMm: PhysicalSizeMm, dpi: number): PixelDimensions {
  if (!isPositiveFinite(sizeMm[0]) || !isPositiveFinite(sizeMm[1])) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `publication size [${String(sizeMm[0])}, ${String(sizeMm[1])}] mm must be finite and strictly positive; a non-physical size cannot be converted to pixels`,
    );
  }
  if (!isPositiveFinite(dpi)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `publication dpi ${String(dpi)} must be finite and strictly positive; a non-physical density cannot be converted to pixels`,
    );
  }

  const width = roundHalfUp((sizeMm[0] / MM_PER_INCH) * dpi);
  const height = roundHalfUp((sizeMm[1] / MM_PER_INCH) * dpi);
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `publication size ${String(sizeMm[0])}x${String(sizeMm[1])} mm at ${String(dpi)} dpi computed ${String(width)}x${String(height)} px; the result must be a positive finite integer, so the request is refused rather than rounded or clamped`,
    );
  }

  return [width, height];
}

/**
 * Inverse of the **continuous** mm -> px mapping: `px / dpi * 25.4`, without
 * rounding. This is used for hit-testing and inverse editorial placement. It is
 * not the inverse of the rounded {@link mmToPixels} output, so a
 * `mm -> px -> mm` round trip may differ by up to half a target pixel; callers
 * that need an exact inverse must account for that rounding.
 *
 * Refuses `FIGURE_UNITS_INVALID` for non-integer/non-positive pixel dimensions
 * or a non-finite/non-positive DPI.
 */
export function pixelsToMm(pixelDimensions: PixelDimensions, dpi: number): PhysicalSizeMm {
  if (!isPositiveInteger(pixelDimensions[0]) || !isPositiveInteger(pixelDimensions[1])) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `publication pixel dimensions [${String(pixelDimensions[0])}, ${String(pixelDimensions[1])}] must be positive finite integers`,
    );
  }
  if (!isPositiveFinite(dpi)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
      `publication dpi ${String(dpi)} must be finite and strictly positive; a non-physical density cannot be converted to millimetres`,
    );
  }

  return [
    (pixelDimensions[0] / dpi) * MM_PER_INCH,
    (pixelDimensions[1] / dpi) * MM_PER_INCH,
  ];
}
