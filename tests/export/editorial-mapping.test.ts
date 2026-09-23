/**
 * NuClear P5.7 follow-up (c) — ADR-016 editorial FigureSheet → vector mapping.
 *
 * Pure Node: no DOM, no encoder. Uses the real embedded Inter metrics for the
 * OD-7e baseline and asserts the OD-7a paint order plus the OD-7j fail-closed
 * refusals (arrow, bold, dashed, scale-bar, measurement, patient-space shapes).
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  ComposerPanel,
  FigureAnnotation,
  FigureSheet,
} from '../../packages/shared-types/src/index.js';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  buildEditorialVectorLayers,
  panelContentToSheet,
  panelSheetRectMm,
  pointsToMm,
} = await import('../../packages/figure-engine/src/publication/index.ts');
const { vendoredInterFontMetrics } = await import('./fixtures/pdf-font.ts');
const {
  mockComposerPanel,
  mockLayout,
  mockSheetAnchor,
  mockEditorialAnchor,
  mockPatientAnchor,
} = await import('../fixtures/figure-contracts.fixture.ts');

const FONT = vendoredInterFontMetrics();
const PANEL_ID = 'panel-a';

const DECORATION = {
  background: '#f0f0f0',
  border: { color: '#111111', widthMm: 0.25, style: 'solid' as const },
  label: { text: 'A', position: [2, 2] as const, fontFamily: 'Inter', fontSizePt: 10, color: '#111111' },
};

function sheetWith(panels: readonly ComposerPanel[], annotations: readonly FigureAnnotation[]): FigureSheet {
  return {
    id: 'sheet-editorial' as FigureSheet['id'],
    sizeMm: [180, 120],
    panels,
    annotations,
  };
}

function panelWith(decoration: ComposerPanel['decoration']): ComposerPanel {
  return { ...mockComposerPanel, id: PANEL_ID as ComposerPanel['id'], decoration };
}

function expectRefusal(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.ok(!(error instanceof TypeError), 'an unsupported mapping must not surface as a bare TypeError');
    assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid);
    return true;
  });
}

function annotation(kind: Record<string, unknown>): FigureAnnotation {
  return { id: `a-${String(kind.kind)}` as FigureAnnotation['id'], ...kind } as FigureAnnotation;
}

describe('NuClear P5.7(c) — editorial vector mapping', () => {
  it('1. maps background/border/label in the OD-7a paint order', () => {
    const layers = buildEditorialVectorLayers({
      figureSheet: sheetWith([panelWith(DECORATION)], []),
      font: FONT,
    });
    assert.deepEqual(layers.map((layer) => layer.kind), ['rect', 'rect', 'text']);
    const [background, border, label] = layers;
    assert.equal(background.kind, 'rect');
    if (background.kind === 'rect') {
      assert.equal(background.placement, 'below-medical');
      assert.deepEqual(background.rectMm, { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 });
      assert.equal(background.fillColor, '#f0f0f0');
    }
    assert.equal(border.kind, 'rect');
    if (border.kind === 'rect') {
      assert.equal(border.placement, 'above-medical');
      assert.equal(border.borderColor, '#111111');
      assert.equal(border.borderWidthMm, 0.25);
    }
    assert.equal(label.kind, 'text');
    if (label.kind === 'text') {
      // OD-7d: label `position` is the baseline-left origin in Panel Content Space.
      assert.equal(label.text, 'A');
      assert.deepEqual([...label.originMm], [...panelContentToSheet(mockLayout, [2, 2])]);
      assert.deepEqual([...label.originMm], [22, 22]);
      assert.equal(label.fontSizePt, 10);
    }
  });

  it('2. skips style "none" and refuses dashed/dotted borders (OD-7c)', () => {
    const none = buildEditorialVectorLayers({
      figureSheet: sheetWith([panelWith({ border: { color: '#111111', widthMm: 0.25, style: 'none' } })], []),
      font: FONT,
    });
    assert.deepEqual([...none], []);
    for (const style of ['dashed', 'dotted'] as const) {
      expectRefusal(() =>
        buildEditorialVectorLayers({
          figureSheet: sheetWith([panelWith({ border: { color: '#111111', widthMm: 0.25, style } })], []),
          font: FONT,
        }),
      );
    }
  });

  it('3. maps sheet and panel-content line annotations', () => {
    const sheets = buildEditorialVectorLayers({
      figureSheet: sheetWith(
        [panelWith({})],
        [
          annotation({ kind: 'line', anchor: mockSheetAnchor, coordinateSpace: 'sheet', endpoints: [[10, 10], [30, 10]], strokeColor: '#ff0000', strokeWidthMm: 0.5 }),
          annotation({ kind: 'line', anchor: mockEditorialAnchor, coordinateSpace: 'panel-content', endpoints: [[10, 10], [20, 10]], strokeColor: '#00ff00', strokeWidthMm: 0.5 }),
        ],
      ),
      font: FONT,
    });
    assert.deepEqual(sheets.map((layer) => layer.kind), ['line', 'line']);
    const [first, second] = sheets;
    assert.equal(first.kind, 'line');
    if (first.kind === 'line') {
      assert.deepEqual([...first.fromMm], [10, 10]);
      assert.deepEqual([...first.toMm], [30, 10]);
    }
    if (second.kind === 'line') {
      assert.deepEqual([...second.fromMm], [30, 30]);
      assert.deepEqual([...second.toMm], [40, 30]);
    }
  });

  it('4. maps ellipse/circle/rectangle ROIs to ellipses and polygons (OD-7g)', () => {
    const layers = buildEditorialVectorLayers({
      figureSheet: sheetWith(
        [panelWith({})],
        [
          annotation({ kind: 'ellipse', anchor: mockEditorialAnchor, geometry: { coordinateSpace: 'panel-content', center: [10, 10], radiiMm: [4, 3], rotationDeg: 0 }, strokeColor: '#ff0000', strokeWidthMm: 0.5 }),
          annotation({ kind: 'circle', anchor: mockSheetAnchor, geometry: { coordinateSpace: 'sheet', center: [100, 60], radiusMm: 5 }, fillColor: '#0000ff' }),
          annotation({ kind: 'rectangle', anchor: mockSheetAnchor, geometry: { coordinateSpace: 'sheet', origin: [10, 10], sizeMm: [8, 4], rotationDeg: 0 }, strokeColor: '#111111', strokeWidthMm: 0.25 }),
        ],
      ),
      font: FONT,
    });
    assert.deepEqual(layers.map((layer) => layer.kind), ['ellipse', 'ellipse', 'polygon']);
    const [ellipse, circle, rectangle] = layers;
    if (ellipse.kind === 'ellipse') {
      assert.deepEqual([...ellipse.centerMm], [30, 30]);
      assert.deepEqual([...ellipse.radiiMm], [4, 3]);
      assert.equal(ellipse.rotationDeg, 0);
    }
    if (circle.kind === 'ellipse') {
      assert.deepEqual([...circle.radiiMm], [5, 5]);
    }
    if (rectangle.kind === 'polygon') {
      assert.deepEqual(rectangle.pointsMm.map((point) => [...point]), [[10, 10], [18, 10], [18, 14], [10, 14]]);
    }
  });

  it('4b. rotates a rectangle ROI clockwise in y-down sheet space (OD-2/OD-7g)', () => {
    const layers = buildEditorialVectorLayers({
      figureSheet: sheetWith(
        [panelWith({})],
        [annotation({ kind: 'rectangle', anchor: mockSheetAnchor, geometry: { coordinateSpace: 'sheet', origin: [10, 10], sizeMm: [8, 4], rotationDeg: 90 }, strokeColor: '#111111', strokeWidthMm: 0.25 })],
      ),
      font: FONT,
    });
    const polygon = layers[0];
    assert.equal(polygon.kind, 'polygon');
    if (polygon.kind === 'polygon') {
      assert.deepEqual(polygon.pointsMm.map((point) => [...point]), [[16, 8], [16, 16], [12, 16], [12, 8]]);
    }
  });

  it('5. applies contentOffset-free box padding and the real Inter ascent (OD-7e)', () => {
    const fontSizePt = 9;
    const layers = buildEditorialVectorLayers({
      figureSheet: sheetWith(
        [panelWith({})],
        [
          annotation({
            kind: 'panel-letter',
            anchor: mockEditorialAnchor,
            coordinateSpace: 'panel-content',
            position: [10, 10],
            text: 'B',
            box: { sizeMm: [8, 8], paddingMm: 1 },
            typography: { fontFamily: 'Inter', fontSizePt, color: '#111111', weight: 'normal' },
          }),
        ],
      ),
      font: FONT,
    });
    const letter = layers[0];
    assert.equal(letter.kind, 'text');
    if (letter.kind === 'text') {
      const ascentMm = pointsToMm(FONT.ascentRatio * fontSizePt);
      assert.deepEqual([...letter.originMm], [30 + 1, 30 + 1 + ascentMm]);
      assert.equal(letter.maxWidthMm, 6);
      assert.equal(letter.maxHeightMm, 6);
    }
  });

  it('6. refuses arrow, scale-bar and measurement (OD-7f/7h)', () => {
    const refusals: readonly FigureAnnotation[] = [
      annotation({ kind: 'arrow', anchor: mockSheetAnchor, coordinateSpace: 'sheet', endpoints: [[10, 10], [30, 10]], strokeColor: '#ff0000', strokeWidthMm: 0.5 }),
      annotation({ kind: 'scale-bar', anchor: mockSheetAnchor, coordinateSpace: 'sheet', position: [10, 10], lengthMm: 20, orientation: 'horizontal' }),
      annotation({ kind: 'measurement', anchor: mockSheetAnchor, coordinateSpace: 'sheet', geometry: { endpoints: [[10, 10], [30, 10]] }, value: 20, unit: 'mm' }),
    ];
    for (const item of refusals) {
      expectRefusal(() => buildEditorialVectorLayers({ figureSheet: sheetWith([panelWith({})], [item]), font: FONT }));
    }
  });

  it('7. refuses bold, unsupported fonts, dashed borders and patient-space shapes (OD-7e/7j)', () => {
    const withText = (typography: Record<string, unknown>) =>
      annotation({
        kind: 'text',
        anchor: mockSheetAnchor,
        coordinateSpace: 'sheet',
        position: [100, 100],
        text: 'label',
        box: { sizeMm: [40, 6], paddingMm: 0 },
        typography,
      });
    expectRefusal(() =>
      buildEditorialVectorLayers({
        figureSheet: sheetWith([panelWith({})], [withText({ fontFamily: 'Inter', fontSizePt: 9, color: '#111111', weight: 'bold' })]),
        font: FONT,
      }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({
        figureSheet: sheetWith([panelWith({})], [withText({ fontFamily: 'Jost', fontSizePt: 9, color: '#111111', weight: 'normal' })]),
        font: FONT,
      }),
    );
    expectRefusal(() =>
      buildEditorialVectorLayers({
        figureSheet: sheetWith(
          [panelWith({})],
          [annotation({ kind: 'ellipse', anchor: mockPatientAnchor, geometry: { coordinateSpace: 'patient', center: [0, 0, 0], radiiMm: [4, 3], rotationDeg: 0 }, strokeColor: '#ff0000', strokeWidthMm: 0.5 })],
        ),
        font: FONT,
      }),
    );
  });

  it('8. is deterministic and does not mutate the figure sheet', () => {
    const sheet = sheetWith([panelWith(DECORATION)], []);
    const panelsBefore = JSON.stringify(sheet.panels);
    const first = buildEditorialVectorLayers({ figureSheet: sheet, font: FONT });
    const second = buildEditorialVectorLayers({ figureSheet: sheet, font: FONT });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(JSON.stringify(sheet.panels), panelsBefore);
    assert.ok(Object.isFrozen(first));
    assert.deepEqual(panelSheetRectMm(mockLayout), { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 });
  });
});
