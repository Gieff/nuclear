/**
 * NuClear P5.7 — hybrid-PDF request builder (pure, ADR-015 OD-6f/OD-6g).
 *
 * Pure Node: maps the Fase-1 composition plan plus editorial vectors/metadata
 * into a frozen `PublicationPdfRequest`, with fail-closed typed refusals.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { PublicationPanelRaster } from '../../packages/figure-engine/src/publication/index.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  buildPublicationCompositionPlan,
  buildPublicationPdfRequest,
} = await import('../../packages/figure-engine/src/publication/index.ts');

const { mockFigureSheet } = await import('../fixtures/figure-contracts.fixture.ts');

const DPI = 25.4;

const METADATA = {
  title: 'NuClear figure',
  author: 'NuClear',
  subject: 'PET/CT',
  keywords: ['pet', 'ct'],
  creator: 'NuClear Studio',
  producer: 'NuClear figure-engine 0.4.0',
};

const TEXT = {
  kind: 'text' as const,
  text: '18F-FDG PET/CT',
  originMm: [100, 100] as const,
  fontSizePt: 9,
  color: '#111111',
};

const RECT = {
  kind: 'rect' as const,
  rectMm: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 },
  fillColor: '#ffffff',
  borderColor: '#111111',
  borderWidthMm: 0.25,
};

const LINE = {
  kind: 'line' as const,
  fromMm: [100, 108] as const,
  toMm: [120, 108] as const,
  strokeColor: '#ff4b3e',
  strokeWidthMm: 0.5,
};

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

function plan() {
  return buildPublicationCompositionPlan({
    figureSheet: mockFigureSheet,
    panelRasters: [rasterFor('panel-a')],
    dpi: DPI,
    backgroundColor: '#ffffff',
  });
}

function expectError(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FigurePublicationError, `expected FigurePublicationError, got ${String(error)}`);
    assert.ok(!(error instanceof TypeError), 'a malformed input must not surface as a bare TypeError');
    assert.equal(error.code, code);
    return true;
  });
}

describe('NuClear P5.7 — hybrid-PDF request builder', () => {
  it('1. maps the Fase-1 sheet plan and editorial layers into a frozen request', () => {
    const source = plan();
    const request = buildPublicationPdfRequest(source, {
      vectorLayers: [TEXT, RECT, LINE],
      metadata: METADATA,
    });

    assert.equal(request.sheetId, mockFigureSheet.id);
    assert.deepEqual([...request.sheetSizeMm], [180, 120]);
    assert.equal(request.dpi, DPI);
    assert.deepEqual([...request.pixelDimensions], [180, 120]);
    assert.equal(request.backgroundColor, '#ffffff');
    assert.equal(request.rasterLayers.length, 1);
    assert.equal(request.rasterLayers[0].panelId, 'panel-a');
    assert.deepEqual([...request.rasterLayers[0].pixelDimensions], [80, 80]);
    assert.equal(request.vectorLayers.length, 3);
    assert.deepEqual(request.vectorLayers.map((layer) => layer.kind), ['text', 'rect', 'line']);
    assert.equal(request.metadata.producer, 'NuClear figure-engine 0.4.0');

    assert.ok(Object.isFrozen(request));
    assert.ok(Object.isFrozen(request.sheetSizeMm));
    assert.ok(Object.isFrozen(request.pixelDimensions));
    assert.ok(Object.isFrozen(request.rasterLayers));
    assert.ok(Object.isFrozen(request.vectorLayers));
    assert.ok(Object.isFrozen(request.metadata));
    assert.ok(Object.isFrozen(request.metadata.keywords));

    // Inputs are never mutated.
    assert.equal(source.layers.length, 1);
    assert.equal(source.layers[0].rgba.length, 80 * 80 * 4);
  });

  it('2. omits zero-opacity layers and defaults a missing vector list to empty', () => {
    const request = buildPublicationPdfRequest(plan(), {
      vectorLayers: [{ ...TEXT, opacity: 0 }, LINE],
      metadata: METADATA,
    });
    assert.deepEqual(request.vectorLayers.map((layer) => layer.kind), ['line']);

    const empty = buildPublicationPdfRequest(plan(), { metadata: METADATA });
    assert.deepEqual([...empty.vectorLayers], []);
  });

  it('3. refuses malformed metadata fail-closed', () => {
    const base = plan();
    const cases: readonly unknown[] = [
      { ...METADATA, title: undefined },
      { ...METADATA, producer: '' },
      { ...METADATA, creator: 42 },
      { ...METADATA, keywords: 'pet' },
      { ...METADATA, keywords: ['pet', 7] },
      { ...METADATA, creationDate: ' ' },
      { ...METADATA, creationDate: 'not-a-date' },
      { ...METADATA, modificationDate: '2026-13-45T99:99:99Z' },
    ];
    for (const metadata of cases) {
      expectError(
        () => buildPublicationPdfRequest(base, { metadata: metadata as never }),
        FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
      );
    }
    expectError(
      () => buildPublicationPdfRequest(base, { metadata: null as never }),
      FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
    );
  });

  it('4. refuses malformed or out-of-sheet vector layers fail-closed', () => {
    const base = plan();
    const cases: readonly unknown[] = [
      null,
      {},
      { ...TEXT, kind: 'ellipse' },
      { ...TEXT, color: 'red' },
      { ...TEXT, opacity: 1.5 },
      { ...TEXT, opacity: -0.01 },
      { ...TEXT, opacity: Number.NaN },
      { ...TEXT, fontSizePt: 0 },
      { ...TEXT, fontSizePt: Number.POSITIVE_INFINITY },
      { ...TEXT, originMm: [200, 10] },
      { ...TEXT, originMm: [10, -1] },
      { ...TEXT, text: '' },
      { ...RECT, fillColor: undefined, borderColor: undefined },
      { ...RECT, borderWidthMm: 0 },
      { ...RECT, borderColor: undefined, borderWidthMm: undefined, fillColor: '#ffffff' , rectMm: { xMm: 150, yMm: 0, widthMm: 80, heightMm: 80 } },
      { ...LINE, strokeWidthMm: 0 },
      { ...LINE, strokeColor: '#12345' },
      { ...LINE, toMm: [200, 108] },
    ];
    for (const layer of cases) {
      expectError(
        () => buildPublicationPdfRequest(base, { vectorLayers: [layer] as never, metadata: METADATA }),
        FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
      );
    }
    expectError(
      () => buildPublicationPdfRequest(base, { vectorLayers: {} as never, metadata: METADATA }),
      FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
    );
  });

  it('5. refuses a non-object plan/editorial without a bare TypeError', () => {
    expectError(
      () => buildPublicationPdfRequest(null as never, { metadata: METADATA }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
    expectError(
      () => buildPublicationPdfRequest(plan(), null as never),
      FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
    );
    expectError(
      () => buildPublicationPdfRequest(plan(), [] as never),
      FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
    );
  });

  it('6. re-validates every raster layer so a hand-built plan cannot smuggle a resample', () => {
    const source = plan();
    const layer = source.layers[0];

    // 40x40 px at an 80x80 mm rect would be stretched by a viewer: refused.
    const resampled = {
      ...source,
      layers: [{ ...layer, pixelDimensions: [40, 40] as const, rgba: new Uint8Array(40 * 40 * 4) }],
    };
    expectError(
      () => buildPublicationPdfRequest(resampled as never, { metadata: METADATA }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );

    // A layer pushed off the sheet is refused, not silently clipped.
    const overflow = {
      ...source,
      layers: [{ ...layer, rectMm: { ...layer.rectMm, xMm: 150 } }],
    };
    expectError(
      () => buildPublicationPdfRequest(overflow as never, { metadata: METADATA }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );

    // A wrong RGBA8 length is refused even though the dimensions match.
    const wrongLength = {
      ...source,
      layers: [{ ...layer, rgba: new Uint8Array(3) }],
    };
    expectError(
      () => buildPublicationPdfRequest(wrongLength as never, { metadata: METADATA }),
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
    );
  });

  it('7. accepts and validates ellipse/polygon primitives (ADR-016 OD-7g)', () => {
    const base = plan();
    const valid = buildPublicationPdfRequest(base, {
      vectorLayers: [
        { kind: 'ellipse', centerMm: [100, 60], radiiMm: [10, 6], rotationDeg: 45, strokeColor: '#ff0000', strokeWidthMm: 0.5 },
        { kind: 'polygon', pointsMm: [[10, 10], [20, 10], [20, 20]], fillColor: '#00ff00' },
      ],
      metadata: METADATA,
    });
    assert.deepEqual(valid.vectorLayers.map((layer) => layer.kind), ['ellipse', 'polygon']);

    const cases: readonly unknown[] = [
      { kind: 'ellipse', centerMm: [5, 5], radiiMm: [10, 10], rotationDeg: 0, fillColor: '#000000' },
      { kind: 'ellipse', centerMm: [100, 60], radiiMm: [0, 6], rotationDeg: 0, fillColor: '#000000' },
      { kind: 'ellipse', centerMm: [100, 60], radiiMm: [10, 6], rotationDeg: 0 },
      { kind: 'ellipse', centerMm: [100, 60], radiiMm: [10, 6], rotationDeg: 0, strokeColor: '#ff0000' },
      { kind: 'polygon', pointsMm: [[10, 10], [20, 10]], fillColor: '#00ff00' },
      { kind: 'polygon', pointsMm: [[10, 10], [200, 10], [20, 20]], fillColor: '#00ff00' },
      { kind: 'polygon', pointsMm: [[10, 10], [20, 10], [20, 20]], fillColor: '#00ff00', placement: 'middle' },
    ];
    for (const layer of cases) {
      expectError(
        () => buildPublicationPdfRequest(base, { vectorLayers: [layer] as never, metadata: METADATA }),
        FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
      );
    }
  });
});
