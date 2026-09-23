/**
 * NuClear P5.1 — figure-sheet placement: containment, rotation refusal and
 * deterministic z-order (ADR-014 D3/OD-2).
 *
 * Pure Node: no DOM, no WebGL and no Cornerstone. Uses the curated Fase-1
 * editorial fixture `tests/fixtures/figure-contracts.fixture.ts`.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  ComposerPanel,
  ComposerViewInstanceId,
  FigurePanelId,
  PanelLayoutState,
} from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  assertPanelWithinSheet,
  isPanelWithinSheet,
  orderPanelsByZ,
  panelSheetRectMm,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockComposerPanel, mockFigureSheet, mockFraming, mockLayout } = await import(
  '../fixtures/figure-contracts.fixture.ts'
);

const SHEET = mockFigureSheet.sizeMm;

function expectError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0, 'expected an actionable message');
    return true;
  });
}

function panel(suffix: string, zIndex: number): ComposerPanel {
  return {
    id: `panel-${suffix}` as FigurePanelId,
    viewInstance: { ...mockComposerPanel.viewInstance, id: `instance-${suffix}` as ComposerViewInstanceId },
    framing: mockFraming,
    layout: { ...mockLayout, zIndex },
    decoration: {},
  };
}

describe('NuClear P5.1 — figure-sheet panel placement', () => {
  it('1. returns the panel sheet rectangle in millimetres', () => {
    assert.deepEqual(panelSheetRectMm(mockLayout), { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 });
  });

  it('2. accepts a contained panel, edges inclusive, and reports it', () => {
    assert.equal(isPanelWithinSheet(mockLayout, SHEET), true);
    assert.deepEqual(assertPanelWithinSheet(mockLayout, SHEET), panelSheetRectMm(mockLayout));

    const flushLayout: PanelLayoutState = { ...mockLayout, positionMm: [100, 40] };
    assert.equal(isPanelWithinSheet(flushLayout, SHEET), true);
  });

  it('3. refuses a panel that leaves the sheet with FIGURE_SHEET_CONTAINMENT_INVALID', () => {
    const outside: PanelLayoutState = { ...mockLayout, positionMm: [120, 20] };
    assert.equal(isPanelWithinSheet(outside, SHEET), false);
    expectError(
      () => assertPanelWithinSheet(outside, SHEET),
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
    );

    const negative: PanelLayoutState = { ...mockLayout, positionMm: [-1, 20] };
    assert.equal(isPanelWithinSheet(negative, SHEET), false);
  });

  it('4. refuses a non-physical sheet or panel size instead of evaluating it', () => {
    expectError(
      () => isPanelWithinSheet(mockLayout, [0, 120]),
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
    );
    expectError(
      () => panelSheetRectMm({ ...mockLayout, sizeMm: [0, 80] }),
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
    );
    expectError(
      () => panelSheetRectMm({ ...mockLayout, positionMm: [Number.NaN, 20] }),
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
    );
  });

  it('5. refuses an unratified non-zero rotation rather than guessing its origin (ADR-014 OD-2)', () => {
    const rotated: PanelLayoutState = { ...mockLayout, rotationDeg: 90 };
    expectError(
      () => panelSheetRectMm(rotated),
      FIGURE_PUBLICATION_ERROR_CODES.rotationUnsupported,
    );
    expectError(
      () => isPanelWithinSheet(rotated, SHEET),
      FIGURE_PUBLICATION_ERROR_CODES.rotationUnsupported,
    );
    expectError(
      () => assertPanelWithinSheet(rotated, SHEET),
      FIGURE_PUBLICATION_ERROR_CODES.rotationUnsupported,
    );
  });

  it('6. orders panels by ascending z-index with stable ties and a frozen result', () => {
    const ordered = orderPanelsByZ([panel('a', 1), panel('b', 1), panel('c', 0)]);
    assert.deepEqual(
      ordered.map((entry) => entry.id),
      ['panel-c', 'panel-a', 'panel-b'],
    );
    assert.ok(Object.isFrozen(ordered));

    // The input array is not reordered.
    const input = [panel('a', 2), panel('b', 0)];
    orderPanelsByZ(input);
    assert.deepEqual(input.map((entry) => entry.id), ['panel-a', 'panel-b']);
  });

  it('7. refuses a non-integer z-index with FIGURE_PANEL_ORDER_INVALID', () => {
    expectError(
      () => orderPanelsByZ([panel('a', 1.5)]),
      FIGURE_PUBLICATION_ERROR_CODES.orderInvalid,
    );
  });
});
