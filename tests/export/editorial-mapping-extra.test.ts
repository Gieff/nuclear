/**
 * NuClear P5.7 follow-up (c) — patient-annotation mapping and OD-7j fail-closed
 * edges (ADR-016). Pure Node.
 *
 * Covers the review findings: malformed mapping structures must be typed
 * refusals (not `TypeError`), embedded line separators are refused as
 * unratified multi-line, the anchor/coordinate-space pairing must match, and
 * the patient `line` path projects through the ratified OD-5 chain with OD-4
 * visibility.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { ComposerPanel, FigureAnnotation, FigureSheet, PatientAnnotationAnchor } from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  buildEditorialVectorLayers,
} = await import('../../packages/figure-engine/src/publication/index.ts');
const { vendoredInterFontMetrics } = await import('./fixtures/pdf-font.ts');
const {
  mockComposerPanel,
  mockSheetAnchor,
  mockEditorialAnchor,
  mockPatientAnchor,
  mockFraming,
  mockLayout,
} = await import('../fixtures/figure-contracts.fixture.ts');
const { mockPreparedView } = await import('../fixtures/view-contracts.fixture.ts');

const FONT = vendoredInterFontMetrics();
const EPSILON = 1e-9;

function sheetWith(panels: readonly ComposerPanel[], annotations: readonly FigureAnnotation[]): FigureSheet {
  return { id: 'sheet-edge' as FigureSheet['id'], sizeMm: [180, 120], panels, annotations };
}

function defaultPanel(): ComposerPanel {
  return { ...mockComposerPanel, id: 'panel-a' as ComposerPanel['id'], decoration: {} };
}

function expectRefusal(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.ok(!(error instanceof TypeError), 'malformed input must not surface as a bare TypeError');
    assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid);
    return true;
  });
}

const patientResolutions = [
  { panelId: 'panel-a' as never, availability: 'online' as const, state: mockPreparedView.state },
];

describe('NuClear P5.7(c) — patient line + fail-closed edges', () => {
  it('1. projects patient line endpoints through the ratified OD-5 chain with OD-4 opacity', () => {
    const line = {
      id: 'line-patient' as FigureAnnotation['id'],
      kind: 'line' as const,
      anchor: mockPatientAnchor,
      coordinateSpace: 'patient' as const,
      endpoints: [[0, 0, 0], [10, 0, 0]] as const,
      strokeColor: '#ff0000',
      strokeWidthMm: 0.5,
    };
    const layers = buildEditorialVectorLayers({
      figureSheet: sheetWith([defaultPanel()], [line]),
      font: FONT,
      resolutions: patientResolutions,
    });
    assert.equal(layers.length, 1);
    const mapped = layers[0];
    assert.equal(mapped.kind, 'line');
    if (mapped.kind === 'line') {
      assert.ok(Math.abs(mapped.fromMm[0] - 60) < EPSILON && Math.abs(mapped.fromMm[1] - 60) < EPSILON);
      assert.ok(Math.abs(mapped.toMm[0] - 61.5625) < EPSILON && Math.abs(mapped.toMm[1] - 60) < EPSILON);
      assert.equal(mapped.opacity, 1);
    }

    // OD-4 fade band: anchor at +3 mm with tolerance 2 => opacity 0.5.
    const fadedAnchor: PatientAnnotationAnchor = { ...(mockPatientAnchor as PatientAnnotationAnchor), positionLpsMm: [0, 0, 3], planeToleranceMm: 2, outOfPlaneBehavior: 'fade' };
    const faded = buildEditorialVectorLayers({
      figureSheet: sheetWith([defaultPanel()], [{ ...line, anchor: fadedAnchor }]),
      font: FONT,
      resolutions: patientResolutions,
    });
    assert.equal(faded[0].kind === 'line' ? faded[0].opacity : undefined, 0.5);

    // Non-online availability hides the line: emit nothing (no layer at all).
    const hidden = buildEditorialVectorLayers({
      figureSheet: sheetWith([defaultPanel()], [line]),
      font: FONT,
      resolutions: [{ panelId: 'panel-a' as never, availability: 'missing' as const, state: mockPreparedView.state }],
    });
    assert.deepEqual([...hidden], []);
  });

  it('2. refuses structurally malformed panels/annotations with a typed error', () => {
    const text = {
      id: 't' as FigureAnnotation['id'], kind: 'text' as const, anchor: mockSheetAnchor, coordinateSpace: 'sheet' as const,
      position: [100, 100] as const, text: 'ok', box: { sizeMm: [40, 6] as const, paddingMm: 0 },
      typography: { fontFamily: 'Inter', fontSizePt: 9, color: '#111111', weight: 'normal' as const },
    };
    // malformed figure sheet / panel structures
    expectRefusal(() => buildEditorialVectorLayers({ figureSheet: null as never, font: FONT }));
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: { panels: [null], annotations: [] } as never, font: FONT }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: { panels: [{ id: 'panel-a', decoration: {} }], annotations: [] } as never, font: FONT }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: { panels: [{ id: 'panel-a', layout: mockLayout }], annotations: [] } as never, font: FONT }),
    );
    // a panel missing `framing` (consumed by the patient path) must be typed
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: { panels: [{ id: 'panel-a', layout: mockLayout, decoration: {} }], annotations: [] } as never, font: FONT }),
    );
    // a null annotation entry must be typed, not a `.kind` TypeError
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: { panels: [defaultPanel()], annotations: [null] } as never, font: FONT }),
    );
    // a malformed layout (missing / non-iterable position/size pairs) must be typed
    for (const layout of [{ rotationDeg: 0, zIndex: 0 }, { rotationDeg: 0, zIndex: 0, positionMm: 5, sizeMm: [80, 80] }]) {
      expectRefusal(() =>
        buildEditorialVectorLayers({
          figureSheet: { panels: [{ id: 'panel-a', layout, decoration: {}, framing: mockFraming }], annotations: [] } as never,
          font: FONT,
        }),
      );
    }
    // malformed annotation structures
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [{ ...text, box: undefined } as never]), font: FONT }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [{ ...text, typography: undefined } as never]), font: FONT }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [{ id: 'r', kind: 'ellipse', anchor: mockSheetAnchor } as never]), font: FONT }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [{ ...text, anchor: null } as never]), font: FONT }),
    );
  });

  it('3. refuses embedded line separators as unratified multi-line (OD-7e)', () => {
    const multi = {
      id: 't' as FigureAnnotation['id'], kind: 'text' as const, anchor: mockSheetAnchor, coordinateSpace: 'sheet' as const,
      position: [100, 100] as const, text: 'line 1\nline 2', box: { sizeMm: [40, 12] as const, paddingMm: 0 },
      typography: { fontFamily: 'Inter', fontSizePt: 9, color: '#111111', weight: 'normal' as const },
    };
    expectRefusal(() => buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [multi]), font: FONT }));

    const panel = { ...defaultPanel(), decoration: { label: { text: 'A\nB', position: [2, 2] as const, fontFamily: 'Inter', fontSizePt: 10, color: '#111111' } } };
    expectRefusal(() => buildEditorialVectorLayers({ figureSheet: sheetWith([panel], []), font: FONT }));
  });

  it('4. refuses an anchor/coordinate-space mismatch (OD-7j)', () => {
    const sheetLineWithPanelAnchor = {
      id: 'l1' as FigureAnnotation['id'], kind: 'line' as const, anchor: mockEditorialAnchor, coordinateSpace: 'sheet' as const,
      endpoints: [[10, 10], [30, 10]] as const, strokeColor: '#ff0000', strokeWidthMm: 0.5,
    };
    expectRefusal(() => buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [sheetLineWithPanelAnchor]), font: FONT }));

    const panelLineWithSheetAnchor = {
      id: 'l2' as FigureAnnotation['id'], kind: 'line' as const, anchor: mockSheetAnchor, coordinateSpace: 'panel-content' as const,
      endpoints: [[10, 10], [30, 10]] as const, strokeColor: '#ff0000', strokeWidthMm: 0.5,
    };
    expectRefusal(() => buildEditorialVectorLayers({ figureSheet: sheetWith([defaultPanel()], [panelLineWithSheetAnchor]), font: FONT }));
  });
});
