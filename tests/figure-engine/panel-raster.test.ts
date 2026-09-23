/**
 * NuClear P5.1 — panel and sheet publication raster dimensioning (ADR-014
 * D2/D3 and OD-3).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. Uses the curated Fase-1
 * editorial fixture `tests/fixtures/figure-contracts.fixture.ts` rather than
 * duplicating its values.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { PanelFramingState } from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  computePanelContentPixels,
  computeSheetPixels,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockFigureSheet, mockFraming } = await import(
  '../fixtures/figure-contracts.fixture.ts'
);

function expectError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

describe('NuClear P5.1 — panel and sheet raster dimensioning', () => {
  it('1. dimensions the panel content aperture from contentSizeMm at the requested DPI', () => {
    assert.deepEqual(computePanelContentPixels(mockFraming, 600), [1890, 1890]);
    assert.deepEqual(computePanelContentPixels(mockFraming, 300), [945, 945]);
  });

  it('2. does not let contentScale change the aperture pixel requirement (ADR-014 OD-3)', () => {
    const scaled: PanelFramingState = { ...mockFraming, contentScale: 2.5, contentOffsetMm: [5, 5] };
    assert.deepEqual(
      computePanelContentPixels(scaled, 600),
      computePanelContentPixels(mockFraming, 600),
    );
  });

  it('3. dimensions the complete figure sheet from its physical size', () => {
    assert.equal(mockFigureSheet.sizeMm[0], 180);
    assert.equal(mockFigureSheet.sizeMm[1], 120);
    assert.deepEqual(computeSheetPixels(mockFigureSheet.sizeMm, 300), [2126, 1417]);
    assert.deepEqual(computeSheetPixels(mockFigureSheet.sizeMm, 600), [4252, 2835]);
  });

  it('4. refuses a non-physical aperture or DPI instead of defaulting it', () => {
    const zeroAperture = { ...mockFraming, contentSizeMm: [0, 80] } as PanelFramingState;
    expectError(
      () => computePanelContentPixels(zeroAperture, 600),
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
    );
    expectError(
      () => computePanelContentPixels(mockFraming, 0),
      FIGURE_PUBLICATION_ERROR_CODES.unitsInvalid,
    );
  });
});
