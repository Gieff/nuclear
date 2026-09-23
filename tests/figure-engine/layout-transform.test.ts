/**
 * NuClear P5.3 — OD-2 layout transform: Panel Content Space ↔ Figure Sheet
 * Space with rotation about the panel centre (clockwise in y-down sheet
 * coordinates), per ADR-014 OD-2 (ratified 2026-09-23).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { PanelLayoutState } from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  panelContentToSheet,
  panelLocalCenterMm,
  panelSheetRectMm,
  sheetToPanelContent,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockLayout } = await import('../fixtures/figure-contracts.fixture.ts');

const EPSILON = 1e-9;

function expectError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

function assertNear(actual: readonly [number, number], expected: readonly [number, number]): void {
  assert.ok(Math.abs(actual[0] - expected[0]) <= EPSILON, `x: ${actual[0]} vs ${expected[0]}`);
  assert.ok(Math.abs(actual[1] - expected[1]) <= EPSILON, `y: ${actual[1]} vs ${expected[1]}`);
}

describe('NuClear P5.3 — OD-2 layout transform', () => {
  it('1. translates without rotation', () => {
    assert.deepEqual(panelLocalCenterMm(mockLayout), [40, 40]);
    assert.deepEqual(panelContentToSheet(mockLayout, [0, 0]), [20, 20]);
    assert.deepEqual(panelContentToSheet(mockLayout, [80, 80]), [100, 100]);
    assert.deepEqual(panelContentToSheet(mockLayout, [40, 40]), [60, 60]);
  });

  it('2. rotates clockwise about the panel centre in y-down coordinates', () => {
    const rotated: PanelLayoutState = { ...mockLayout, rotationDeg: 90 };
    // Top-left content corner -> sheet top-right; bottom-right -> bottom-left.
    assertNear(panelContentToSheet(rotated, [0, 0]), [100, 20]);
    assertNear(panelContentToSheet(rotated, [80, 80]), [20, 100]);
    // The rotation origin is invariant.
    assertNear(panelContentToSheet(rotated, [40, 40]), [60, 60]);
  });

  it('3. rotates counter-clockwise for a negative angle', () => {
    const rotated: PanelLayoutState = { ...mockLayout, rotationDeg: -90 };
    assertNear(panelContentToSheet(rotated, [0, 0]), [20, 100]);
    assertNear(panelContentToSheet(rotated, [80, 80]), [100, 20]);
  });

  it('4. inverts the transform for several rotations (round trip)', () => {
    const rotations = [0, 90, -90, 37.5, 180];
    const points: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [80, 80],
      [40, 40],
      [10, 70],
      [-5, 90],
    ];
    for (const rotationDeg of rotations) {
      const layout: PanelLayoutState = { ...mockLayout, rotationDeg };
      for (const point of points) {
        const roundTrip = sheetToPanelContent(layout, panelContentToSheet(layout, point));
        assertNear(roundTrip, point);
      }
    }
  });

  it('5. keeps medical panel placement fail-closed for non-zero rotation (ADR-014 OD-2)', () => {
    const rotated: PanelLayoutState = { ...mockLayout, rotationDeg: 90 };
    // The pure primitive accepts the ratified rotation…
    assert.doesNotThrow(() => panelContentToSheet(rotated, [0, 0]));
    // …while the medical placement path still refuses it.
    expectError(
      () => panelSheetRectMm(rotated),
      FIGURE_PUBLICATION_ERROR_CODES.rotationUnsupported,
    );
  });

  it('6. refuses malformed layout input with FIGURE_LAYOUT_INVALID', () => {
    const invalid: ReadonlyArray<PanelLayoutState> = [
      { ...mockLayout, positionMm: [Number.NaN, 20] as never },
      { ...mockLayout, sizeMm: [0, 80] as never },
      { ...mockLayout, sizeMm: [80, Number.POSITIVE_INFINITY] as never },
      { ...mockLayout, rotationDeg: Number.NaN as never },
    ];
    for (const layout of invalid) {
      expectError(() => panelContentToSheet(layout, [0, 0]), FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid);
      expectError(() => sheetToPanelContent(layout, [0, 0]), FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid);
    }
    expectError(
      () => panelContentToSheet(mockLayout, [Number.NaN, 0]),
      FIGURE_PUBLICATION_ERROR_CODES.layoutInvalid,
    );
  });
});
