/**
 * NuClear P5.1 — publication physical units (ADR-014 D2).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. Asserts the ratified
 * `pixels = round-half-up(mm / 25.4 * dpi)` conversion, its fail-closed
 * refusals, and its exact equivalence with the ADR-009
 * `computeRenderTargetPixelDimensions` implementation.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  MM_PER_INCH,
  mmToPixels,
  pixelsToMm,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { computeRenderTargetPixelDimensions } = await import(
  '../../packages/medical-engine/src/view-application/index.ts'
);

const { expectedPixels } = await import('../contracts/figure-validators.ts');

type UnitsFailure = InstanceType<typeof FigurePublicationError>;

function expectError(run: () => unknown, code: string): UnitsFailure {
  let caught: UnitsFailure | undefined;
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof FigurePublicationError,
      `expected FigurePublicationError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    caught = error;
    return true;
  });
  return caught as UnitsFailure;
}

const SIZES: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [10, 15],
  [80, 80],
  [180, 120],
  [210, 297],
  [297, 420],
];
const DPIS: readonly number[] = [72, 96, 150, 300, 600, 1200];

describe('NuClear P5.1 — publication physical units', () => {
  it('1. computes the exact ratified pixel dimensions at 300 and 600 DPI', () => {
    assert.equal(MM_PER_INCH, 25.4);
    assert.deepEqual(mmToPixels([80, 80], 600), [1890, 1890]);
    assert.deepEqual(mmToPixels([80, 80], 300), [945, 945]);
    assert.deepEqual(mmToPixels([180, 120], 300), [2126, 1417]);
    assert.deepEqual(mmToPixels([180, 120], 600), [4252, 2835]);
  });

  it('2. agrees exactly with the ADR-009 formula and the Fase-1 oracle over a curated matrix', () => {
    for (const size of SIZES) {
      for (const dpi of DPIS) {
        const figure = mmToPixels(size, dpi);
        const medical = computeRenderTargetPixelDimensions(size, dpi);
        const oracle: readonly [number, number] = [expectedPixels(size[0], dpi), expectedPixels(size[1], dpi)];
        assert.deepEqual(
          figure,
          medical,
          `figure/medical divergence at size ${size.join('x')} mm and ${dpi} dpi`,
        );
        assert.deepEqual(
          figure,
          oracle,
          `figure/oracle divergence at size ${size.join('x')} mm and ${dpi} dpi`,
        );
      }
    }
  });

  it('3. refuses non-finite / non-positive size or DPI with FIGURE_UNITS_INVALID', () => {
    const invalidSizes: ReadonlyArray<readonly [number, number]> = [
      [0, 80],
      [-1, 80],
      [Number.NaN, 80],
      [Number.POSITIVE_INFINITY, 80],
      [80, 0],
      [80, Number.NEGATIVE_INFINITY],
    ];
    for (const size of invalidSizes) {
      expectError(() => mmToPixels(size, 600), FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid);
    }
    for (const dpi of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expectError(() => mmToPixels([80, 80], dpi), FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid);
    }
  });

  it('4. refuses an overflowing conversion rather than rounding it', () => {
    expectError(
      () => mmToPixels([1e308, 80], 600),
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
    );
  });

  it('5. inverts the continuous mm -> px mapping within half a target pixel', () => {
    for (const dpi of DPIS) {
      const pixels = mmToPixels([80, 80], dpi);
      const millimetres = pixelsToMm(pixels, dpi);
      const halfPixelMm = MM_PER_INCH / dpi / 2;
      assert.ok(Math.abs(millimetres[0] - 80) <= halfPixelMm + 1e-9);
      assert.ok(Math.abs(millimetres[1] - 80) <= halfPixelMm + 1e-9);
    }
    assert.deepEqual(pixelsToMm([600, 300], 300), [50.8, 25.4]);
  });

  it('6. pixelsToMm refuses malformed pixel dimensions and DPI', () => {
    const invalidPixels: ReadonlyArray<readonly [number, number]> = [
      [0, 10],
      [10, -1],
      [10.5, 10],
      [Number.NaN, 10],
      [Number.POSITIVE_INFINITY, 10],
    ];
    for (const pixels of invalidPixels) {
      expectError(() => pixelsToMm(pixels, 300), FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid);
    }
    for (const dpi of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectError(() => pixelsToMm([10, 10], dpi), FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid);
    }
  });

  it('7. FigurePublicationError carries the typed code, name and message', () => {
    const error = new FigurePublicationError(FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid, 'invalid');
    assert.ok(error instanceof Error);
    assert.ok(error instanceof FigurePublicationError);
    assert.equal(error.name, 'FigurePublicationError');
    assert.equal(error.code, 'FIGURE_UNITS_INVALID');
    assert.equal(error.message, 'invalid');
  });
});
