/**
 * NuClear P5.7 — reference hybrid vector PDF encoder (ADR-015 Track 1).
 *
 * Pure Node: the adapter uses pdf-lib and the vendored Inter subset; the
 * test-only inspector proves vector preservation, exact PDF-point geometry,
 * deterministic metadata/ID and fail-closed no-resampling.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type {
  PublicationPanelRaster,
  PublicationPdfMetadata,
} from '../../packages/figure-engine/src/publication/index.ts';

register(new URL('../medical/fixtures/ts-resolve-hook.mjs', import.meta.url));

const {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  buildPublicationCompositionPlan,
  buildPublicationPdfRequest,
  mmToPoints,
  pdfPointsFromSheetY,
} = await import('../../packages/figure-engine/src/publication/index.ts');
const { createReferenceEncoder } = await import('./fixtures/reference-encoder.ts');
const {
  REFERENCE_PDF_ENCODER_NAME,
  REFERENCE_PDF_ENCODER_VERSION,
  computePublicationPdfId,
} = await import('./fixtures/pdf-writer.ts');
const {
  decodeContentStreams,
  readImagePlacements,
  readImages,
  readPdfId,
  readPdfInfo,
  readTextOrigins,
} = await import('./fixtures/pdf-inspector.ts');
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

const VECTORS = [
  {
    kind: 'text' as const,
    text: '18F-FDG PET/CT',
    originMm: [100, 100] as const,
    fontSizePt: 9,
    color: '#111111',
  },
  {
    kind: 'rect' as const,
    rectMm: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 80 },
    borderColor: '#111111',
    borderWidthMm: 0.25,
  },
  {
    kind: 'line' as const,
    fromMm: [100, 108] as const,
    toMm: [120, 108] as const,
    strokeColor: '#ff4b3e',
    strokeWidthMm: 0.5,
  },
];

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

function buildRequest(metadata: PublicationPdfMetadata = METADATA) {
  const plan = buildPublicationCompositionPlan({
    figureSheet: mockFigureSheet,
    panelRasters: [rasterFor('panel-a')],
    dpi: DPI,
    backgroundColor: '#ffffff',
  });
  return buildPublicationPdfRequest(plan, { vectorLayers: VECTORS, metadata });
}

function rawText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

describe('NuClear P5.7 — reference hybrid PDF encoder', () => {
  it('1. encodes deterministically with the declared provenance and request hash', async () => {
    const encoder = createReferenceEncoder();
    const request = buildRequest();
    const [first, again] = await Promise.all([encoder.encodePdf(request), encoder.encodePdf(request)]);

    assert.equal(first.format, 'pdf');
    assert.equal(first.colorProfile, 'srgb');
    assert.deepEqual([...first.pixelDimensions], [180, 120]);
    assert.equal(first.encoder.encoderName, REFERENCE_PDF_ENCODER_NAME);
    assert.equal(first.encoder.encoderVersion, REFERENCE_PDF_ENCODER_VERSION);
    assert.deepEqual(first.bytes, again.bytes, 'identical inputs must produce identical bytes');

    const id = computePublicationPdfId(request);
    assert.deepEqual(readPdfId(first.bytes), {
      first: id.slice(0, 32),
      second: id.slice(32, 64),
    });
  });

  it('2. keeps the panel as one image XObject at its exact PDF-point rectangle', async () => {
    const encoded = await createReferenceEncoder().encodePdf(buildRequest());
    const content = decodeContentStreams(encoded.bytes).join('\n');

    const images = readImages(encoded.bytes);
    assert.equal(images.length, 1);
    assert.deepEqual(images[0], { width: 80, height: 80 });

    const placements = readImagePlacements(content);
    assert.equal(placements.length, 1);
    assert.equal(placements[0].x, mmToPoints(20));
    assert.equal(placements[0].y, pdfPointsFromSheetY(20 + 80, 120));
    assert.equal(placements[0].width, mmToPoints(80));
    assert.equal(placements[0].height, mmToPoints(80));
  });

  it('3. emits text as native PDF operators with the embedded Inter subset', async () => {
    const encoded = await createReferenceEncoder().encodePdf(buildRequest());
    const content = decodeContentStreams(encoded.bytes).join('\n');
    const raw = rawText(encoded.bytes);

    assert.ok(content.includes('Tj') || content.includes('TJ'), 'expected a text-showing operator');
    assert.ok(raw.includes('/FontFile2'), 'expected the embedded font program');
    assert.ok(!raw.includes('DCTDecode'), 'vectors must not be JPEG-rasterised');
    assert.ok(!raw.includes('JPXDecode'), 'vectors must not be JPEG2000-rasterised');

    const origins = readTextOrigins(content);
    assert.equal(origins.length, 1);
    assert.equal(origins[0].x, mmToPoints(100));
    assert.equal(origins[0].y, pdfPointsFromSheetY(100, 120));
  });

  it('4. writes explicit metadata and no dates when the metadata omits them', async () => {
    const encoded = await createReferenceEncoder().encodePdf(buildRequest());
    const info = readPdfInfo(encoded.bytes);

    assert.equal(info.Title, METADATA.title);
    assert.equal(info.Creator, METADATA.creator);
    assert.equal(info.Producer, METADATA.producer);
    assert.equal(info.CreationDate, undefined);
    assert.equal(info.ModDate, undefined);
    assert.ok(!rawText(encoded.bytes).includes('pdf-lib'), 'pdf-lib must not leak as the producer');
  });

  it('5. records explicitly supplied creation/modification dates', async () => {
    const request = buildRequest({
      ...METADATA,
      creationDate: '2026-09-23T00:00:00Z',
      modificationDate: '2026-09-23T00:00:00Z',
    });
    const encoded = await createReferenceEncoder().encodePdf(request);
    const info = readPdfInfo(encoded.bytes);
    assert.equal(info.CreationDate, 'D:20260923000000Z');
    assert.equal(info.ModDate, 'D:20260923000000Z');
  });

  it('6. refuses a tampered panel raster in the pure builder before encoding', () => {
    assert.throws(
      () =>
        buildPublicationCompositionPlan({
          figureSheet: mockFigureSheet,
          panelRasters: [rasterFor('panel-a', 40, 40)],
          dpi: DPI,
          backgroundColor: '#ffffff',
        }),
      (error: unknown) => {
        assert.ok(error instanceof FigurePublicationError);
        assert.equal(error.code, FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid);
        return true;
      },
    );
  });
});
