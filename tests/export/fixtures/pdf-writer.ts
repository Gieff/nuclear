/**
 * NuClear P5.7 — reference hybrid vector PDF writer (ADR-015 Track 1, OD-6d).
 *
 * Composition-root-shaped adapter (test infrastructure until `apps/desktop`
 * exists): pdf-lib embeds the medical panel rasters as image XObjects and any
 * supplied native primitives (text/rect/line/ellipse/polygon, ADR-016) as PDF
 * operators in Figure Sheet millimetres with an embedded Inter subset (OD-6e).
 * Vectors are never rasterized and nothing is resampled.
 *
 * Determinism (OD-6f): `updateMetadata: false`, metadata and the trailer `/ID`
 * derive only from the declared request, and `useObjectStreams: false` fixes
 * object order. `figure-engine` never imports this module.
 */

import { createHash } from 'node:crypto';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFHexString } from 'pdf-lib';

import {
  mmToPoints,
  type EncodedArtifact,
  type EncoderPort,
  type PublicationPdfMetadata,
  type PublicationPdfRequest,
  type PublicationVectorLayer,
} from '../../../packages/figure-engine/src/publication/index.ts';
import { drawRasterLayer, drawSheetBackground, drawVectorLayer } from './pdf-draw.ts';
import { vendoredInterBytes } from './pdf-font.ts';

export const REFERENCE_PDF_ENCODER_NAME = 'nuclear-reference-pdf';
export const REFERENCE_PDF_ENCODER_VERSION = '0.4.0';
const ENCODER = {
  encoderName: REFERENCE_PDF_ENCODER_NAME,
  encoderVersion: REFERENCE_PDF_ENCODER_VERSION,
} as const;

export interface PdfWriterOptions {
  readonly fontBytes?: Uint8Array;
  readonly fontName?: string;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function placementField(layer: PublicationVectorLayer): { placement?: 'below-medical' | 'above-medical' } {
  return layer.placement === undefined ? {} : { placement: layer.placement };
}

/** Fixed key order so the canonical JSON is independent of input key order. */
function canonicalVector(layer: PublicationVectorLayer): unknown {
  const opacity = layer.opacity === undefined ? {} : { opacity: layer.opacity };
  const placement = placementField(layer);
  if (layer.kind === 'text') {
    return {
      kind: 'text',
      text: layer.text,
      originMm: [...layer.originMm],
      fontSizePt: layer.fontSizePt,
      color: layer.color,
      ...opacity,
      ...placement,
    };
  }
  if (layer.kind === 'rect') {
    const { xMm, yMm, widthMm, heightMm } = layer.rectMm;
    return {
      kind: 'rect',
      rectMm: { xMm, yMm, widthMm, heightMm },
      ...(layer.fillColor === undefined ? {} : { fillColor: layer.fillColor }),
      ...(layer.borderColor === undefined ? {} : { borderColor: layer.borderColor }),
      ...(layer.borderWidthMm === undefined ? {} : { borderWidthMm: layer.borderWidthMm }),
      ...opacity,
      ...placement,
    };
  }
  if (layer.kind === 'line') {
    return {
      kind: 'line',
      fromMm: [...layer.fromMm],
      toMm: [...layer.toMm],
      strokeColor: layer.strokeColor,
      strokeWidthMm: layer.strokeWidthMm,
      ...opacity,
      ...placement,
    };
  }
  if (layer.kind === 'ellipse') {
    return {
      kind: 'ellipse',
      centerMm: [...layer.centerMm],
      radiiMm: [...layer.radiiMm],
      rotationDeg: layer.rotationDeg,
      ...(layer.fillColor === undefined ? {} : { fillColor: layer.fillColor }),
      ...(layer.strokeColor === undefined ? {} : { strokeColor: layer.strokeColor }),
      ...(layer.strokeWidthMm === undefined ? {} : { strokeWidthMm: layer.strokeWidthMm }),
      ...opacity,
      ...placement,
    };
  }
  if (layer.kind === 'polygon') {
    return {
      kind: 'polygon',
      pointsMm: layer.pointsMm.map((point) => [...point]),
      ...(layer.fillColor === undefined ? {} : { fillColor: layer.fillColor }),
      ...(layer.strokeColor === undefined ? {} : { strokeColor: layer.strokeColor }),
      ...(layer.strokeWidthMm === undefined ? {} : { strokeWidthMm: layer.strokeWidthMm }),
      ...opacity,
      ...placement,
    };
  }
  // Exhaustive over the closed `PublicationVectorLayer` union: a future member
  // must be added to the deterministic `/ID` hash explicitly, never silently
  // hashed as a polygon.
  return assertNeverVector(layer);
}

function assertNeverVector(layer: never): never {
  throw new Error(`unhandled publication vector layer ${JSON.stringify(layer)}`);
}

/** Deterministic canonical JSON of the request (ADR-015 OD-6f). */
function canonicalRequest(request: PublicationPdfRequest): string {
  const { title, author, subject, keywords, creator, producer, creationDate, modificationDate } =
    request.metadata;
  const metadata = {
    title,
    author,
    subject,
    keywords: [...keywords],
    creator,
    producer,
    ...(creationDate === undefined ? {} : { creationDate }),
    ...(modificationDate === undefined ? {} : { modificationDate }),
  };
  return JSON.stringify({
    sheetId: request.sheetId,
    sheetSizeMm: [...request.sheetSizeMm],
    dpi: request.dpi,
    pixelDimensions: [...request.pixelDimensions],
    backgroundColor: request.backgroundColor,
    metadata,
    vectorLayers: request.vectorLayers.map(canonicalVector),
    rasters: request.rasterLayers.map((layer) => ({
      panelId: layer.panelId,
      rectMm: {
        xMm: layer.rectMm.xMm,
        yMm: layer.rectMm.yMm,
        widthMm: layer.rectMm.widthMm,
        heightMm: layer.rectMm.heightMm,
      },
      pixelDimensions: [...layer.pixelDimensions],
      digest: sha256Hex(layer.rgba),
    })),
  });
}

/**
 * Deterministic 64-hex `/ID` seed derived from the canonical request (geometry,
 * rasters, vectors, metadata). It does not cover `PdfWriterOptions`; the
 * reference adapter always embeds the vendored Inter, so the font is constant.
 */
export function computePublicationPdfId(request: PublicationPdfRequest): string {
  return sha256Hex(new TextEncoder().encode(canonicalRequest(request)));
}

function applyMetadata(doc: PDFDocument, metadata: PublicationPdfMetadata): void {
  doc.setTitle(metadata.title);
  doc.setAuthor(metadata.author);
  doc.setSubject(metadata.subject);
  doc.setKeywords([...metadata.keywords]);
  doc.setCreator(metadata.creator);
  doc.setProducer(metadata.producer);
  if (metadata.creationDate !== undefined) {
    doc.setCreationDate(new Date(metadata.creationDate));
  }
  if (metadata.modificationDate !== undefined) {
    doc.setModificationDate(new Date(metadata.modificationDate));
  }
}

/**
 * Emits the hybrid PDF honouring the ADR-016 OD-7a paint order: sheet
 * background, `'below-medical'` vectors, panel rasters, `'above-medical'`
 * vectors. `/ID` is the two halves of the deterministic request hash. No
 * wall-clock, no randomness.
 */
export async function encodePdf(
  request: PublicationPdfRequest,
  options: PdfWriterOptions = {},
): Promise<EncodedArtifact> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  applyMetadata(doc, request.metadata);

  const sheetHeightMm = request.sheetSizeMm[1];
  const page = doc.addPage([mmToPoints(request.sheetSizeMm[0]), mmToPoints(sheetHeightMm)]);
  drawSheetBackground(page, request.sheetSizeMm, request.backgroundColor);

  const font = await doc.embedFont(options.fontBytes ?? vendoredInterBytes(), {
    subset: true,
    ...(options.fontName === undefined ? {} : { customName: options.fontName }),
  });

  const below = request.vectorLayers.filter((layer) => layer.placement === 'below-medical');
  const above = request.vectorLayers.filter((layer) => layer.placement !== 'below-medical');

  for (const layer of below) {
    drawVectorLayer(page, layer, sheetHeightMm, font);
  }
  for (const layer of request.rasterLayers) {
    await drawRasterLayer(doc, page, layer, sheetHeightMm);
  }
  for (const layer of above) {
    drawVectorLayer(page, layer, sheetHeightMm, font);
  }

  const idHex = computePublicationPdfId(request);
  doc.context.trailerInfo.ID = doc.context.obj([
    PDFHexString.of(idHex.slice(0, 32)),
    PDFHexString.of(idHex.slice(32, 64)),
  ]);

  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
  return {
    format: 'pdf',
    pixelDimensions: request.pixelDimensions,
    colorProfile: 'srgb',
    bytes,
    encoder: ENCODER,
  };
}

/**
 * Reference composition-root PDF encoder over the `EncoderPort.encodePdf`
 * contract (until `apps/desktop` owns the adapter; ADR-015 OD-6d).
 */
export function createReferencePdfEncoder(
  options: PdfWriterOptions = {},
): Pick<EncoderPort, 'encodePdf'> {
  return {
    encodePdf: (request: PublicationPdfRequest): Promise<EncodedArtifact> =>
      encodePdf(request, options),
  };
}
