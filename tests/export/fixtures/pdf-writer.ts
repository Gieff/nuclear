/**
 * NuClear P5.7 — reference hybrid vector PDF writer (ADR-015 Track 1, OD-6d).
 *
 * Composition-root-shaped adapter (test infrastructure until `apps/desktop`
 * exists): pdf-lib embeds the medical panel rasters as image XObjects and any
 * supplied text/rect/line primitives as native PDF operators in Figure Sheet
 * millimetres with an embedded Inter subset (OD-6e). Vectors are never
 * rasterized and nothing is resampled.
 *
 * Determinism (OD-6f): `updateMetadata: false`, metadata and the trailer `/ID`
 * derive only from the declared request, and `useObjectStreams: false` fixes
 * object order. `figure-engine` never imports this module.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFHexString, rgb } from 'pdf-lib';

import {
  mmToPoints,
  pdfPointsFromSheetY,
  pdfRectFromSheetRect,
  type EncodedArtifact,
  type EncoderPort,
  type PublicationPdfMetadata,
  type PublicationPdfRequest,
  type PublicationVectorLayer,
} from '../../../packages/figure-engine/src/publication/index.ts';
import { encodePng } from './png-writer.ts';

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

let cachedFontBytes: Uint8Array | undefined;

/** Loads the vendored Inter Regular TTF (SIL OFL 1.1) on first use. */
function vendoredInterBytes(): Uint8Array {
  if (cachedFontBytes === undefined) {
    cachedFontBytes = new Uint8Array(
      readFileSync(new URL('./fonts/Inter-Regular.ttf', import.meta.url)),
    );
  }
  return cachedFontBytes;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toRgb(hex: string): ReturnType<typeof rgb> {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
}

/** Fixed key order so the canonical JSON is independent of input key order. */
function canonicalVector(layer: PublicationVectorLayer): unknown {
  const opacity = layer.opacity === undefined ? {} : { opacity: layer.opacity };
  if (layer.kind === 'text') {
    return {
      kind: 'text',
      text: layer.text,
      originMm: [...layer.originMm],
      fontSizePt: layer.fontSizePt,
      color: layer.color,
      ...opacity,
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
    };
  }
  return {
    kind: 'line',
    fromMm: [...layer.fromMm],
    toMm: [...layer.toMm],
    strokeColor: layer.strokeColor,
    strokeWidthMm: layer.strokeWidthMm,
    ...opacity,
  };
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
 * Emits the hybrid PDF. Panel rasters are embedded as image XObjects at their
 * physical rectangle; vectors are emitted natively after them. `/ID` is the
 * two halves of the deterministic request hash. No wall-clock, no randomness.
 */
export async function encodePdf(
  request: PublicationPdfRequest,
  options: PdfWriterOptions = {},
): Promise<EncodedArtifact> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  applyMetadata(doc, request.metadata);

  const sheetHeightMm = request.sheetSizeMm[1];
  const widthPt = mmToPoints(request.sheetSizeMm[0]);
  const heightPt = mmToPoints(sheetHeightMm);
  const page = doc.addPage([widthPt, heightPt]);
  page.drawRectangle({ x: 0, y: 0, width: widthPt, height: heightPt, color: toRgb(request.backgroundColor) });

  const font = await doc.embedFont(options.fontBytes ?? vendoredInterBytes(), {
    subset: true,
    ...(options.fontName === undefined ? {} : { customName: options.fontName }),
  });

  for (const layer of request.rasterLayers) {
    const png = encodePng({ pixelDimensions: layer.pixelDimensions, rgba: layer.rgba, colorProfile: 'srgb' });
    const image = await doc.embedPng(png.bytes);
    const rect = pdfRectFromSheetRect(layer.rectMm, sheetHeightMm);
    page.drawImage(image, {
      x: rect.xPt,
      y: rect.yPt,
      width: rect.widthPt,
      height: rect.heightPt,
    });
  }

  for (const layer of request.vectorLayers) {
    const opacity = layer.opacity === undefined ? {} : { opacity: layer.opacity };
    if (layer.kind === 'text') {
      page.drawText(layer.text, {
        x: mmToPoints(layer.originMm[0]),
        y: pdfPointsFromSheetY(layer.originMm[1], sheetHeightMm),
        size: layer.fontSizePt,
        font,
        color: toRgb(layer.color),
        ...opacity,
      });
    } else if (layer.kind === 'rect') {
      const rect = pdfRectFromSheetRect(layer.rectMm, sheetHeightMm);
      page.drawRectangle({
        x: rect.xPt,
        y: rect.yPt,
        width: rect.widthPt,
        height: rect.heightPt,
        ...(layer.fillColor === undefined ? {} : { color: toRgb(layer.fillColor) }),
        ...(layer.borderColor === undefined ? {} : { borderColor: toRgb(layer.borderColor) }),
        ...(layer.borderWidthMm === undefined ? {} : { borderWidth: mmToPoints(layer.borderWidthMm) }),
        ...(layer.opacity === undefined ? {} : { opacity: layer.opacity, borderOpacity: layer.opacity }),
      });
    } else {
      page.drawLine({
        start: { x: mmToPoints(layer.fromMm[0]), y: pdfPointsFromSheetY(layer.fromMm[1], sheetHeightMm) },
        end: { x: mmToPoints(layer.toMm[0]), y: pdfPointsFromSheetY(layer.toMm[1], sheetHeightMm) },
        thickness: mmToPoints(layer.strokeWidthMm),
        color: toRgb(layer.strokeColor),
        ...opacity,
      });
    }
  }

  const idHex = computePublicationPdfId(request);
  doc.context.trailerInfo.ID = doc.context.obj([
    PDFHexString.of(idHex.slice(0, 32)),
    PDFHexString.of(idHex.slice(32, 64)),
  ]);

  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
  return { format: 'pdf', pixelDimensions: request.pixelDimensions, colorProfile: 'srgb', bytes, encoder: ENCODER };
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
