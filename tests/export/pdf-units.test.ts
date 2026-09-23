/**
 * NuClear P5.7 — physical millimetres <-> PDF points (ADR-015).
 *
 * Pure Node. Exact floating-point values are asserted either with an explicit
 * epsilon or as the exact `String(...)` the PDF writer would emit; the
 * fractional arithmetic is never hidden behind a sloppy tolerance.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  PT_PER_INCH,
  mmToPoints,
  pdfPointsFromSheetY,
  pdfRectFromSheetRect,
  pointsToMm,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const EPSILON = 1e-9;

function expectUnitsError(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.ok(!(error instanceof TypeError), 'a non-physical length must not surface as a bare TypeError');
    assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid);
    return true;
  });
}

describe('NuClear P5.7 — PDF physical units', () => {
  it('1. fixes the point constant and the exact 1 in = 72 pt identity', () => {
    assert.equal(PT_PER_INCH, 72);
    assert.equal(mmToPoints(25.4), 72);
    assert.equal(pointsToMm(72), 25.4);
  });

  it('2. converts millimetres to points with the ratified 25.4 mm/in constant', () => {
    assert.equal(String(mmToPoints(20)), '56.69291338582678');
    assert.equal(String(mmToPoints(80)), '226.7716535433071');
    assert.equal(String(mmToPoints(100)), '283.46456692913387');
    assert.ok(Math.abs(pointsToMm(mmToPoints(123.456)) - 123.456) < EPSILON);
  });

  it('3. flips sheet y-down to PDF y-up for a 120 mm sheet', () => {
    // The top edge (y = 0) maps to the top of the page; the bottom edge to 0.
    assert.equal(pdfPointsFromSheetY(0, 120), mmToPoints(120));
    assert.equal(pdfPointsFromSheetY(120, 120), 0);
    assert.equal(String(pdfPointsFromSheetY(100, 120)), '56.69291338582678');
    assert.ok(Math.abs(pdfPointsFromSheetY(0, 120) - 340.15748031496065) < EPSILON);
  });

  it('4. converts a sheet rect to its PDF lower-left anchor', () => {
    const rect = pdfRectFromSheetRect({ xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 }, 120);
    assert.equal(rect.xPt, mmToPoints(20));
    assert.equal(rect.yPt, pdfPointsFromSheetY(100, 120));
    assert.equal(rect.yPt, mmToPoints(20));
    assert.equal(rect.widthPt, mmToPoints(80));
    assert.equal(rect.heightPt, mmToPoints(80));
  });

  it('5. refuses non-finite lengths and non-positive sheet heights/sizes', () => {
    expectUnitsError(() => mmToPoints(Number.NaN));
    expectUnitsError(() => mmToPoints(Number.POSITIVE_INFINITY));
    expectUnitsError(() => pointsToMm(Number.NEGATIVE_INFINITY));
    expectUnitsError(() => pdfPointsFromSheetY(0, 0));
    expectUnitsError(() => pdfPointsFromSheetY(0, -1));
    expectUnitsError(() => pdfPointsFromSheetY(Number.NaN, 120));
    expectUnitsError(() =>
      pdfRectFromSheetRect({ xMm: 0, yMm: 0, widthMm: 0, heightMm: 10 }, 120),
    );
    expectUnitsError(() =>
      pdfRectFromSheetRect({ xMm: 0, yMm: 0, widthMm: 10, heightMm: -1 }, 120),
    );
    expectUnitsError(() =>
      pdfRectFromSheetRect({ xMm: Number.NaN, yMm: 0, widthMm: 10, heightMm: 10 }, 120),
    );
  });
});
