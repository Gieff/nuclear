/**
 * NuClear P5.7 follow-up (c) — hybrid encoder for the ADR-016 primitives.
 *
 * Pure Node: proves the ellipse/polygon layers are emitted as native PDF
 * operators (never rasterized), that the OD-7a paint order places the panel
 * background below the medical raster and the border/label above it, and that a
 * text overflow is refused by the adapter (the only place with the font).
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { ComposerPanel, FigureAnnotation, FigureSheet } from '../../packages/shared-types/src/index.js';
import type { PublicationPanelRaster } from '../../packages/figure-engine/src/publication/index.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  buildEditorialVectorLayers,
  buildPublicationCompositionPlan,
  buildPublicationPdfRequest,
} = await import('../../packages/figure-engine/src/publication/index.ts');
const { createReferenceEncoder } = await import('./fixtures/reference-encoder.ts');
const { vendoredInterFontMetrics } = await import('./fixtures/pdf-font.ts');
const { decodeContentStreams, readImages } = await import('./fixtures/pdf-inspector.ts');
const { mockComposerPanel, mockSheetAnchor } = await import('../fixtures/figure-contracts.fixture.ts');

const FONT = vendoredInterFontMetrics();
const DPI = 25.4;
const METADATA = {
  title: 'Editorial', author: 'NuClear', subject: 'figure', keywords: [] as string[],
  creator: 'NuClear', producer: 'NuClear figure-engine 0.4.0',
};

const DECORATION = {
  background: '#f0f0f0',
  border: { color: '#111111', widthMm: 0.25, style: 'solid' as const },
  label: { text: 'A', position: [2, 2] as const, fontFamily: 'Inter', fontSizePt: 10, color: '#111111' },
};

const ANNOTATIONS: readonly FigureAnnotation[] = [
  { id: 'roi-1' as FigureAnnotation['id'], kind: 'ellipse', anchor: mockSheetAnchor, geometry: { coordinateSpace: 'sheet', center: [100, 60], radiiMm: [10, 6], rotationDeg: 0 }, strokeColor: '#ff0000', strokeWidthMm: 0.5 },
  { id: 'roi-2' as FigureAnnotation['id'], kind: 'rectangle', anchor: mockSheetAnchor, geometry: { coordinateSpace: 'sheet', origin: [100, 80], sizeMm: [12, 6], rotationDeg: 0 }, fillColor: '#00ff00' },
];

function sheetWith(decoration: ComposerPanel['decoration'], annotations: readonly FigureAnnotation[]): FigureSheet {
  const panel: ComposerPanel = { ...mockComposerPanel, id: 'panel-a' as ComposerPanel['id'], decoration };
  return { id: 'sheet-editorial' as FigureSheet['id'], sizeMm: [180, 120], panels: [panel], annotations };
}

function rasterForPanelA(): PublicationPanelRaster {
  const width = 80;
  const height = 80;
  const bytes = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    bytes[pixel * 4] = 10; bytes[pixel * 4 + 1] = 20; bytes[pixel * 4 + 2] = 30; bytes[pixel * 4 + 3] = 255;
  }
  return {
    panelId: 'panel-a' as PublicationPanelRaster['panelId'],
    pixelDimensions: [width, height],
    colorProfile: 'srgb',
    rgbaBase64: Buffer.from(bytes).toString('base64'),
    byteLength: bytes.length,
    renderer: { rendererName: 'fake', rendererVersion: '1.0.0' },
  };
}

async function encodeEditorial(figureSheet: FigureSheet) {
  const plan = buildPublicationCompositionPlan({ figureSheet, panelRasters: [rasterForPanelA()], dpi: DPI, backgroundColor: '#ffffff' });
  const vectorLayers = buildEditorialVectorLayers({ figureSheet, font: FONT });
  const request = buildPublicationPdfRequest(plan, { vectorLayers, metadata: METADATA });
  return createReferenceEncoder().encodePdf(request);
}

describe('NuClear P5.7(c) — editorial primitives in the hybrid PDF', () => {
  it('1. emits ellipse/polygon as native operators and one panel image XObject', async () => {
    const encoded = await encodeEditorial(sheetWith(DECORATION, ANNOTATIONS));
    const content = decodeContentStreams(encoded.bytes).join('\n');
    const raw = Buffer.from(encoded.bytes).toString('latin1');

    assert.equal(readImages(encoded.bytes).length, 1, 'only the medical panel may be a raster');
    assert.ok(!raw.includes('DCTDecode') && !raw.includes('JPXDecode'), 'vectors must not be rasterized');
    assert.ok(content.includes('Do'), 'expected the panel image XObject');
    assert.ok(content.includes('Tj'), 'expected native text');
    // Ellipse is four Bézier curves; the rotated rectangle is an m/l/h path.
    assert.ok(/\bc\b/.test(content), 'expected ellipse Bézier curves');
    assert.ok(/\bm\b/.test(content) && /\bl\b/.test(content), 'expected polygon path segments');
  });

  it('2. honours the OD-7a paint order (background < raster < border/label)', async () => {
    const encoded = await encodeEditorial(sheetWith(DECORATION, ANNOTATIONS));
    const content = decodeContentStreams(encoded.bytes).join('\n');
    const backgroundFill = `${String(240 / 255)} ${String(240 / 255)} ${String(240 / 255)} rg`;
    const borderStroke = `${String(17 / 255)} ${String(17 / 255)} ${String(17 / 255)} RG`;
    const image = content.indexOf('Do');

    assert.ok(image > 0, 'expected the raster image invocation');
    assert.ok(content.indexOf(backgroundFill) >= 0, 'expected the panel background fill');
    assert.ok(content.indexOf(backgroundFill) < image, 'the panel background must be painted below the raster');
    assert.ok(content.indexOf(borderStroke) > image, 'the panel border must be painted above the raster');
    assert.ok(content.indexOf('Tj') > image, 'the label must be painted above the raster');
  });

  it('3. refuses text that overflows its editorial box (OD-7e, font-owner check)', async () => {
    const text = {
      id: 'text-1' as FigureAnnotation['id'], kind: 'text' as const, anchor: mockSheetAnchor, coordinateSpace: 'sheet' as const,
      position: [100, 100] as const, text: '16F-FDG PET/CT', box: { sizeMm: [1, 1] as const, paddingMm: 0 },
      typography: { fontFamily: 'Inter', fontSizePt: 9, color: '#111111', weight: 'normal' as const },
    };
    await assert.rejects(
      () => encodeEditorial(sheetWith({}, [text])),
      (error: unknown) => {
        assert.ok(error instanceof FigurePublicationError);
        assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid);
        return true;
      },
    );
  });
});
