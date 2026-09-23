/**
 * NuClear P5.7 follow-up (c) — hybrid PDF drawing primitives (test
 * infrastructure, composition-root shape per ADR-015 OD-6d).
 *
 * Renders one `PublicationVectorLayer` / raster layer to a pdf-lib page. Panel
 * rasters are image XObjects at their exact physical rect; text/rect/line/
 * ellipse/polygon are native PDF operators in sheet mm. Nothing is rasterized
 * and nothing is resampled. Test infrastructure only; `figure-engine` never
 * imports this module.
 */

import { degrees, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

import {
  FIGURE_PUBLICATION_ERROR_CODES,
  FigurePublicationError,
  mmToPoints,
  pdfPointsFromSheetY,
  pdfRectFromSheetRect,
  type CompositionRasterLayer,
  type PublicationVectorLayer,
} from '../../../packages/figure-engine/src/publication/index.ts';
import { encodePng } from './png-writer.ts';

/** Exact points per millimetre, reused as the SVG-path scale for mm polygons. */
const PT_PER_MM = mmToPoints(1);

export function toRgb(hex: string): ReturnType<typeof rgb> {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
}

/** Full-page opaque sheet background (painted under everything). */
export function drawSheetBackground(
  page: PDFPage,
  sheetSizeMm: readonly [number, number],
  backgroundColor: string,
): void {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mmToPoints(sheetSizeMm[0]),
    height: mmToPoints(sheetSizeMm[1]),
    color: toRgb(backgroundColor),
  });
}

/** Embeds one medical panel raster as an image XObject at its physical rect. */
export async function drawRasterLayer(
  doc: PDFDocument,
  page: PDFPage,
  layer: CompositionRasterLayer,
  sheetHeightMm: number,
): Promise<void> {
  const png = encodePng({
    pixelDimensions: layer.pixelDimensions,
    rgba: layer.rgba,
    colorProfile: 'srgb',
  });
  const image = await doc.embedPng(png.bytes);
  const rect = pdfRectFromSheetRect(layer.rectMm, sheetHeightMm);
  page.drawImage(image, { x: rect.xPt, y: rect.yPt, width: rect.widthPt, height: rect.heightPt });
}

function drawEllipse(page: PDFPage, layer: Extract<PublicationVectorLayer, { kind: 'ellipse' }>, sheetHeightMm: number): void {
  page.drawEllipse({
    x: mmToPoints(layer.centerMm[0]),
    y: pdfPointsFromSheetY(layer.centerMm[1], sheetHeightMm),
    xScale: mmToPoints(layer.radiiMm[0]),
    yScale: mmToPoints(layer.radiiMm[1]),
    // OD-2 rotation is clockwise in y-down sheet space; PDF user space is y-up,
    // so the equivalent PDF rotation is its negation.
    rotate: degrees(-layer.rotationDeg),
    ...(layer.fillColor === undefined ? {} : { color: toRgb(layer.fillColor) }),
    ...(layer.strokeColor === undefined
      ? {}
      : {
          borderColor: toRgb(layer.strokeColor),
          borderWidth: mmToPoints(layer.strokeWidthMm ?? 0),
        }),
    ...(layer.opacity === undefined ? {} : { opacity: layer.opacity, borderOpacity: layer.opacity }),
  });
}

function drawPolygon(page: PDFPage, layer: Extract<PublicationVectorLayer, { kind: 'polygon' }>, sheetHeightMm: number): void {
  // `drawSvgPath` interprets the path in y-down SVG coordinates and applies
  // `scale(s, -s)`; passing sheet-mm points with x=0, y=heightPt, scale=PT_PER_MM
  // therefore lands exactly at `mmToPoints`/`pdfPointsFromSheetY`.
  const path = layer.pointsMm
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${String(point[0])} ${String(point[1])}`)
    .join(' ');
  page.drawSvgPath(`${path} Z`, {
    x: 0,
    y: mmToPoints(sheetHeightMm),
    scale: PT_PER_MM,
    ...(layer.fillColor === undefined ? {} : { color: toRgb(layer.fillColor) }),
    // `borderWidth` is emitted *inside* the translate/scale CTM (1 user unit =
    // 1 mm here), so the raw millimetre value is physically correct; converting
    // it with `mmToPoints` would scale it twice.
    ...(layer.strokeColor === undefined
      ? {}
      : { borderColor: toRgb(layer.strokeColor), borderWidth: layer.strokeWidthMm ?? 0 }),
    ...(layer.opacity === undefined ? {} : { opacity: layer.opacity, borderOpacity: layer.opacity }),
  });
}

/** Draws one native vector layer (never rasterizes it). */
export function drawVectorLayer(
  page: PDFPage,
  layer: PublicationVectorLayer,
  sheetHeightMm: number,
  font: PDFFont,
): void {
  const opacity = layer.opacity === undefined ? {} : { opacity: layer.opacity };
  if (layer.kind === 'text') {
    // OD-7e: the editor owns the box; the adapter (the only place with the
    // embedded font's metrics) refuses text that overflows it.
    if (layer.maxWidthMm !== undefined && font.widthOfTextAtSize(layer.text, layer.fontSizePt) > mmToPoints(layer.maxWidthMm)) {
      throw new FigurePublicationError(
        FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
        `text '${layer.text}' exceeds its ${layer.maxWidthMm} mm editorial box width`,
      );
    }
    if (layer.maxHeightMm !== undefined && font.heightAtSize(layer.fontSizePt) > mmToPoints(layer.maxHeightMm)) {
      throw new FigurePublicationError(
        FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
        `text '${layer.text}' exceeds its ${layer.maxHeightMm} mm editorial box height`,
      );
    }
    page.drawText(layer.text, {
      x: mmToPoints(layer.originMm[0]),
      y: pdfPointsFromSheetY(layer.originMm[1], sheetHeightMm),
      size: layer.fontSizePt,
      font,
      color: toRgb(layer.color),
      ...opacity,
    });
    return;
  }
  if (layer.kind === 'rect') {
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
    return;
  }
  if (layer.kind === 'line') {
    page.drawLine({
      start: { x: mmToPoints(layer.fromMm[0]), y: pdfPointsFromSheetY(layer.fromMm[1], sheetHeightMm) },
      end: { x: mmToPoints(layer.toMm[0]), y: pdfPointsFromSheetY(layer.toMm[1], sheetHeightMm) },
      thickness: mmToPoints(layer.strokeWidthMm),
      color: toRgb(layer.strokeColor),
      ...opacity,
    });
    return;
  }
  if (layer.kind === 'ellipse') {
    drawEllipse(page, layer, sheetHeightMm);
    return;
  }
  drawPolygon(page, layer, sheetHeightMm);
}
