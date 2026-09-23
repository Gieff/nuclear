/**
 * NuClear P5.3 — OD-1 framing transform: normalized Viewport Space ↔ Panel
 * Content Space (mm), per ADR-014 OD-1 (ratified 2026-09-23, variant A refined).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. Uses the curated Fase-1
 * editorial fixture for the default framing.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PanelFramingState } from '../../packages/shared-types/src/index.js';
import { register } from 'node:module';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  alignmentOffsetMm,
  panelContentToViewport,
  scaledContentSizeMm,
  viewportToPanelContent,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockFraming } = await import('../fixtures/figure-contracts.fixture.ts');

const EPSILON = 1e-9;

function expectFramingError(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.framingInvalid);
    assert.ok(error.message.length > 0);
    return true;
  });
}

function assertNear(actual: readonly [number, number], expected: readonly [number, number]): void {
  assert.ok(Math.abs(actual[0] - expected[0]) <= EPSILON, `x: ${actual[0]} vs ${expected[0]}`);
  assert.ok(Math.abs(actual[1] - expected[1]) <= EPSILON, `y: ${actual[1]} vs ${expected[1]}`);
}

describe('NuClear P5.3 — OD-1 framing transform', () => {
  it('1. maps the unit crop to the aperture for the identity fixture', () => {
    assert.deepEqual(viewportToPanelContent(mockFraming, [0, 0]), [0, 0]);
    assert.deepEqual(viewportToPanelContent(mockFraming, [1, 1]), [80, 80]);
    assert.deepEqual(viewportToPanelContent(mockFraming, [0.5, 0.5]), [40, 40]);
  });

  it('2. applies contentScale and centers the scaled content inside the aperture', () => {
    const scaled: PanelFramingState = { ...mockFraming, contentScale: 0.5 };
    assert.deepEqual(scaledContentSizeMm(scaled), [40, 40]);
    assert.deepEqual(alignmentOffsetMm(scaled), [20, 20]);
    assert.deepEqual(viewportToPanelContent(scaled, [0, 0]), [20, 20]);
    assert.deepEqual(viewportToPanelContent(scaled, [1, 1]), [60, 60]);
  });

  it('3. honors every ratified alignment offset', () => {
    const scaled = (alignment: PanelFramingState['alignment']): PanelFramingState => ({
      ...mockFraming,
      contentScale: 0.5,
      alignment,
    });
    const cases: ReadonlyArray<[PanelFramingState['alignment'], readonly [number, number], readonly [number, number]]> = [
      ['top-left', [0, 0], [40, 40]],
      ['top-right', [40, 0], [80, 40]],
      ['bottom-left', [0, 40], [40, 80]],
      ['bottom-right', [40, 40], [80, 80]],
      ['center', [20, 20], [60, 60]],
    ];
    for (const [alignment, origin, far] of cases) {
      const framing = scaled(alignment);
      assert.deepEqual(alignmentOffsetMm(framing), origin, `origin for ${alignment}`);
      assert.deepEqual(viewportToPanelContent(framing, [0, 0]), origin, `(0,0) for ${alignment}`);
      assert.deepEqual(viewportToPanelContent(framing, [1, 1]), far, `(1,1) for ${alignment}`);
    }
  });

  it('4. adds contentOffsetMm and never clamps crop-external points', () => {
    const offset: PanelFramingState = { ...mockFraming, contentOffsetMm: [5, -3] };
    assert.deepEqual(viewportToPanelContent(offset, [0, 0]), [5, -3]);
    const outside = viewportToPanelContent(offset, [2, 2]);
    assert.deepEqual(outside, [165, 157]);
  });

  it('5. maps a non-unit normalized crop correctly', () => {
    const cropped: PanelFramingState = { ...mockFraming, viewportCrop: [0.25, 0.25, 0.75, 0.75] };
    assert.deepEqual(viewportToPanelContent(cropped, [0.25, 0.25]), [0, 0]);
    assert.deepEqual(viewportToPanelContent(cropped, [0.5, 0.5]), [40, 40]);
    assert.deepEqual(viewportToPanelContent(cropped, [0.75, 0.75]), [80, 80]);
  });

  it('6. inverts the continuous mapping (round trip)', () => {
    const framings: readonly PanelFramingState[] = [
      mockFraming,
      { ...mockFraming, contentScale: 1.75, alignment: 'bottom-right', contentOffsetMm: [3, -4] },
      { ...mockFraming, viewportCrop: [0.1, 0.2, 0.9, 0.8] },
    ];
    const points: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [0.2, 0.8],
      [1.5, -0.5],
    ];
    for (const framing of framings) {
      for (const point of points) {
        const roundTrip = panelContentToViewport(framing, viewportToPanelContent(framing, point));
        assertNear(roundTrip, point);
      }
    }
  });

  it('7. refuses malformed framing input with FIGURE_FRAMING_INVALID', () => {
    const invalid: ReadonlyArray<PanelFramingState> = [
      { ...mockFraming, viewportCrop: [0, 0, 0, 1] as never },
      { ...mockFraming, viewportCrop: [0.5, 0, 0.5, 1] as never },
      { ...mockFraming, viewportCrop: [-0.1, 0, 1, 1] as never },
      { ...mockFraming, viewportCrop: [0, 0, 1.1, 1] as never },
      { ...mockFraming, viewportCrop: [0, 0, 1] as never },
      { ...mockFraming, contentSizeMm: [0, 80] as never },
      { ...mockFraming, contentSizeMm: [80, Number.NaN] as never },
      { ...mockFraming, contentScale: 0 as never },
      { ...mockFraming, contentScale: Number.POSITIVE_INFINITY as never },
      { ...mockFraming, contentOffsetMm: [0, Number.NaN] as never },
      { ...mockFraming, alignment: 'middle' as never },
      { ...mockFraming, overflow: 'scroll' as never },
    ];
    for (const framing of invalid) {
      expectFramingError(() => viewportToPanelContent(framing, [0, 0]));
      expectFramingError(() => alignmentOffsetMm(framing));
    }
    expectFramingError(() => viewportToPanelContent(mockFraming, [Number.NaN, 0]));
  });
});
