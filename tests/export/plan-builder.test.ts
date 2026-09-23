/**
 * NuClear P5.6 — publication composition plan builder.
 *
 * Pure Node: maps the semantic figure sheet + P5.5 panel rasters into the
 * physical composition plan. Uses dpi 25.4 so millimetres map 1:1 to pixels.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  FigurePanelId,
  FigureSheet,
} from '../../packages/shared-types/src/index.js';
import type { PublicationPanelRaster } from '../../packages/figure-engine/src/publication/index.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  buildPublicationCompositionPlan,
  composeSheetRgba,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockComposerPanel, mockFigureSheet, mockFraming, mockLayout } = await import(
  '../fixtures/figure-contracts.fixture.ts'
);

const DPI = 25.4;

function rasterFor(panelId: string, width = 80, height = 80, fill = 200): PublicationPanelRaster {
  const bytes = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    bytes[pixel * 4] = fill;
    bytes[pixel * 4 + 1] = (fill * 2) % 256;
    bytes[pixel * 4 + 2] = (fill * 3) % 256;
    bytes[pixel * 4 + 3] = 255;
  }
  return {
    panelId: panelId as PublicationPanelRaster['panelId'],
    pixelDimensions: [width, height],
    colorProfile: 'srgb',
    rgbaBase64: Buffer.from(bytes).toString('base64'),
    byteLength: bytes.length,
    renderer: { rendererName: 'fake', rendererVersion: '1.0.0' },
  };
}

function expectError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.ok(!(error instanceof TypeError), 'a malformed input must not surface as a bare TypeError');
    assert.equal(error.code, code);
    return true;
  });
}

function panelWith(id: string, positionMm: readonly [number, number], zIndex: number) {
  return {
    ...mockComposerPanel,
    id: id as FigurePanelId,
    layout: { ...mockLayout, positionMm, zIndex },
  };
}

describe('NuClear P5.6 — composition plan builder', () => {
  it('1. maps a figure sheet and its panel raster into a physical plan', () => {
    const plan = buildPublicationCompositionPlan({
      figureSheet: mockFigureSheet,
      panelRasters: [rasterFor('panel-a')],
      dpi: DPI,
      backgroundColor: '#ffffff',
    });

    assert.equal(plan.sheetId, mockFigureSheet.id);
    assert.deepEqual(plan.sheetSizeMm, [180, 120]);
    assert.deepEqual(plan.pixelDimensions, [180, 120]);
    assert.equal(plan.dpi, DPI);
    assert.equal(plan.layers.length, 1);
    assert.equal(plan.layers[0].panelId, 'panel-a');
    assert.deepEqual(plan.layers[0].rectMm, { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 });
    assert.deepEqual(plan.layers[0].pixelDimensions, [80, 80]);
    assert.equal(plan.layers[0].rgba.length, 80 * 80 * 4);
  });

  it('2. composes the built plan without resampling', () => {
    const plan = buildPublicationCompositionPlan({
      figureSheet: mockFigureSheet,
      panelRasters: [rasterFor('panel-a', 80, 80, 10)],
      dpi: DPI,
      backgroundColor: '#ffffff',
    });
    const sheet = composeSheetRgba(plan);
    const offset = (20 * 180 + 20) * 4;
    assert.deepEqual([...sheet.rgba.subarray(offset, offset + 4)], [10, 20, 30, 255]);
    assert.deepEqual([...sheet.rgba.subarray(0, 4)], [255, 255, 255, 255]);
  });

  it('3. orders layers by z-index', () => {
    const sheet: FigureSheet = {
      id: 'sheet-2' as FigureSheet['id'],
      sizeMm: [180, 120],
      panels: [panelWith('panel-a', [20, 0], 1), panelWith('panel-b', [100, 0], 0)],
      annotations: [],
    };
    const plan = buildPublicationCompositionPlan({
      figureSheet: sheet,
      panelRasters: [rasterFor('panel-a'), rasterFor('panel-b')],
      dpi: DPI,
      backgroundColor: '#ffffff',
    });
    assert.deepEqual(
      plan.layers.map((layer) => layer.panelId),
      ['panel-b', 'panel-a'],
    );
  });

  it('4. refuses raster mismatches, missing/extra rasters and malformed input', () => {
    const base = { figureSheet: mockFigureSheet, dpi: DPI, backgroundColor: '#ffffff' };
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [rasterFor('panel-a'), rasterFor('panel-b')] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [rasterFor('panel-a', 40, 40)] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [rasterFor('panel-a')], dpi: 0 }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [rasterFor('panel-a')], backgroundColor: '#fff' }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [rasterFor('panel-a')], figureSheet: null as never }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    // duplicate raster and byteLength mismatch
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [rasterFor('panel-a'), rasterFor('panel-a')] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [{ ...rasterFor('panel-a'), byteLength: 1 }] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    // malformed panel / raster shapes must be typed refusals, never a bare TypeError
    const malformedPanel: FigureSheet = {
      id: mockFigureSheet.id,
      sizeMm: [180, 120],
      panels: [{ id: 'panel-a' } as never],
      annotations: [],
    };
    expectError(
      () => buildPublicationCompositionPlan({ ...base, figureSheet: malformedPanel, panelRasters: [rasterFor('panel-a')] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationCompositionPlan({ ...base, panelRasters: [null as never] }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
  });

  it('5. refuses a non-zero panel rotation and an aperture/panel size mismatch', () => {
    const rotated: FigureSheet = {
      id: mockFigureSheet.id,
      sizeMm: [180, 120],
      panels: [{ ...mockComposerPanel, layout: { ...mockLayout, rotationDeg: 90 } }],
      annotations: [],
    };
    expectError(
      () => buildPublicationCompositionPlan({ figureSheet: rotated, panelRasters: [rasterFor('panel-a')], dpi: DPI, backgroundColor: '#ffffff' }),
      FIGURE_PUBLICATION_ERROR_CODES.rotationUnsupported,
    );

    const mismatched: FigureSheet = {
      id: mockFigureSheet.id,
      sizeMm: [180, 120],
      panels: [{ ...mockComposerPanel, framing: { ...mockFraming, contentSizeMm: [70, 80] } }],
      annotations: [],
    };
    expectError(
      () => buildPublicationCompositionPlan({ figureSheet: mismatched, panelRasters: [rasterFor('panel-a')], dpi: DPI, backgroundColor: '#ffffff' }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );

    const outside: FigureSheet = {
      id: mockFigureSheet.id,
      sizeMm: [180, 120],
      panels: [panelWith('panel-a', [150, 0], 0)],
      annotations: [],
    };
    expectError(
      () => buildPublicationCompositionPlan({ figureSheet: outside, panelRasters: [rasterFor('panel-a')], dpi: DPI, backgroundColor: '#ffffff' }),
      FIGURE_PUBLICATION_ERROR_CODES.containmentInvalid,
    );
  });
});
