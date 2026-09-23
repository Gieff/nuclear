/**
 * @nuclear/figure-engine — structural validation for the hybrid-PDF vector
 * layers (P5.7, ADR-016). Internal module: not re-exported from the barrel.
 *
 * Every rejection is a typed `FIGURE_PDF_DOCUMENT_INVALID`; malformed vector
 * primitives must never surface as a bare `TypeError`. Out-of-sheet geometry is
 * refused fail-closed (the editorial overflow policy is not yet ratified).
 * Pure and Node-safe.
 */

import type {
  PdfEllipseLayer,
  PdfLineLayer,
  PdfPolygonLayer,
  PdfRectLayer,
  PdfTextLayer,
  PublicationVectorLayer,
} from './pdf-document.js';
import {
  asColor,
  asFinitePair,
  asOpacity,
  asPlacement,
  asPolygonPoints,
  asPositiveFinite,
  asPositivePair,
  asRecord,
  asRotationDeg,
  asSheetRect,
  asText,
  fail,
  requireEllipseWithin,
  requirePointWithin,
  requireRectWithin,
} from './pdf-validation-primitives.js';

function readTextLayer(
  record: Record<string, unknown>,
  path: string,
  opacity: number | undefined,
  sheetWidthMm: number,
  sheetHeightMm: number,
): PdfTextLayer {
  const text = asText(record.text, `${path}.text`);
  const originMm = asFinitePair(record.originMm, `${path}.originMm`);
  requirePointWithin(originMm[0], originMm[1], sheetWidthMm, sheetHeightMm, `${path}.originMm`);
  const fontSizePt = asPositiveFinite(record.fontSizePt, `${path}.fontSizePt`);
  const color = asColor(record.color, `${path}.color`);
  const placement = asPlacement(record.placement, `${path}.placement`);
  const maxWidthMm =
    record.maxWidthMm === undefined
      ? undefined
      : asPositiveFinite(record.maxWidthMm, `${path}.maxWidthMm`);
  const maxHeightMm =
    record.maxHeightMm === undefined
      ? undefined
      : asPositiveFinite(record.maxHeightMm, `${path}.maxHeightMm`);
  return Object.freeze({
    kind: 'text',
    text,
    originMm: Object.freeze(originMm),
    fontSizePt,
    color,
    ...(maxWidthMm === undefined ? {} : { maxWidthMm }),
    ...(maxHeightMm === undefined ? {} : { maxHeightMm }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(placement === undefined ? {} : { placement }),
  });
}

function readRectLayer(
  record: Record<string, unknown>,
  path: string,
  opacity: number | undefined,
  sheetWidthMm: number,
  sheetHeightMm: number,
): PdfRectLayer {
  const rectMm = asSheetRect(record.rectMm, `${path}.rectMm`);
  requireRectWithin(rectMm, sheetWidthMm, sheetHeightMm, `${path}.rectMm`);
  const fillColor =
    record.fillColor === undefined ? undefined : asColor(record.fillColor, `${path}.fillColor`);
  const borderColor =
    record.borderColor === undefined ? undefined : asColor(record.borderColor, `${path}.borderColor`);
  if (fillColor === undefined && borderColor === undefined) {
    fail(`${path} requires at least one of fillColor or borderColor`);
  }
  const borderWidthMm =
    record.borderWidthMm === undefined
      ? undefined
      : asPositiveFinite(record.borderWidthMm, `${path}.borderWidthMm`);
  if (borderColor !== undefined && borderWidthMm === undefined) {
    fail(`${path}.borderWidthMm must be a finite, strictly positive number when borderColor is set`);
  }
  const placement = asPlacement(record.placement, `${path}.placement`);
  return Object.freeze({
    kind: 'rect',
    rectMm: Object.freeze({ ...rectMm }),
    ...(fillColor === undefined ? {} : { fillColor }),
    ...(borderColor === undefined ? {} : { borderColor }),
    ...(borderWidthMm === undefined ? {} : { borderWidthMm }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(placement === undefined ? {} : { placement }),
  });
}

function readLineLayer(
  record: Record<string, unknown>,
  path: string,
  opacity: number | undefined,
  sheetWidthMm: number,
  sheetHeightMm: number,
): PdfLineLayer {
  const fromMm = asFinitePair(record.fromMm, `${path}.fromMm`);
  const toMm = asFinitePair(record.toMm, `${path}.toMm`);
  requirePointWithin(fromMm[0], fromMm[1], sheetWidthMm, sheetHeightMm, `${path}.fromMm`);
  requirePointWithin(toMm[0], toMm[1], sheetWidthMm, sheetHeightMm, `${path}.toMm`);
  const strokeColor = asColor(record.strokeColor, `${path}.strokeColor`);
  const strokeWidthMm = asPositiveFinite(record.strokeWidthMm, `${path}.strokeWidthMm`);
  const placement = asPlacement(record.placement, `${path}.placement`);
  return Object.freeze({
    kind: 'line',
    fromMm: Object.freeze(fromMm),
    toMm: Object.freeze(toMm),
    strokeColor,
    strokeWidthMm,
    ...(opacity === undefined ? {} : { opacity }),
    ...(placement === undefined ? {} : { placement }),
  });
}

function readShapeStyle(
  record: Record<string, unknown>,
  path: string,
): { fillColor?: string; strokeColor?: string; strokeWidthMm?: number } {
  const fillColor =
    record.fillColor === undefined ? undefined : asColor(record.fillColor, `${path}.fillColor`);
  const strokeColor =
    record.strokeColor === undefined ? undefined : asColor(record.strokeColor, `${path}.strokeColor`);
  if (fillColor === undefined && strokeColor === undefined) {
    fail(`${path} requires at least one of fillColor or strokeColor`);
  }
  const strokeWidthMm =
    record.strokeWidthMm === undefined
      ? undefined
      : asPositiveFinite(record.strokeWidthMm, `${path}.strokeWidthMm`);
  if (strokeColor !== undefined && strokeWidthMm === undefined) {
    fail(`${path}.strokeWidthMm must be a finite, strictly positive number when strokeColor is set`);
  }
  return {
    ...(fillColor === undefined ? {} : { fillColor }),
    ...(strokeColor === undefined ? {} : { strokeColor }),
    ...(strokeWidthMm === undefined ? {} : { strokeWidthMm }),
  };
}

function readEllipseLayer(
  record: Record<string, unknown>,
  path: string,
  opacity: number | undefined,
  sheetWidthMm: number,
  sheetHeightMm: number,
): PdfEllipseLayer {
  const centerMm = asFinitePair(record.centerMm, `${path}.centerMm`);
  const radiiMm = asPositivePair(record.radiiMm, `${path}.radiiMm`);
  const rotationDeg = asRotationDeg(record.rotationDeg, `${path}.rotationDeg`);
  requireEllipseWithin(centerMm, radiiMm, rotationDeg, sheetWidthMm, sheetHeightMm, `${path}.centerMm`);
  const style = readShapeStyle(record, path);
  const placement = asPlacement(record.placement, `${path}.placement`);
  return Object.freeze({
    kind: 'ellipse',
    centerMm: Object.freeze(centerMm),
    radiiMm: Object.freeze(radiiMm),
    rotationDeg,
    ...style,
    ...(opacity === undefined ? {} : { opacity }),
    ...(placement === undefined ? {} : { placement }),
  });
}

function readPolygonLayer(
  record: Record<string, unknown>,
  path: string,
  opacity: number | undefined,
  sheetWidthMm: number,
  sheetHeightMm: number,
): PdfPolygonLayer {
  const pointsMm = asPolygonPoints(record.pointsMm, `${path}.pointsMm`);
  for (const [index, point] of pointsMm.entries()) {
    requirePointWithin(point[0], point[1], sheetWidthMm, sheetHeightMm, `${path}.pointsMm[${index}]`);
  }
  const style = readShapeStyle(record, path);
  const placement = asPlacement(record.placement, `${path}.placement`);
  return Object.freeze({
    kind: 'polygon',
    pointsMm,
    ...style,
    ...(opacity === undefined ? {} : { opacity }),
    ...(placement === undefined ? {} : { placement }),
  });
}

/**
 * Validates and normalises the editorial vector layers. Layers with a resolved
 * opacity of exactly `0` are omitted (OD-4/P5.6: never a zero-opacity
 * primitive). Refuses `FIGURE_PDF_DOCUMENT_INVALID` for a malformed shape,
 * colour, opacity, size or out-of-sheet geometry. Accepts an empty array.
 */
export function readVectorLayers(
  value: unknown,
  sheetSizeMm: readonly [number, number],
): readonly PublicationVectorLayer[] {
  if (!Array.isArray(value)) {
    fail('vectorLayers must be an array');
  }
  const [sheetWidthMm, sheetHeightMm] = asFinitePair(sheetSizeMm, 'sheetSizeMm');
  if (sheetWidthMm <= 0 || sheetHeightMm <= 0) {
    fail('sheetSizeMm must be a pair of strictly positive millimetres');
  }

  const KINDS = ['text', 'rect', 'line', 'ellipse', 'polygon'] as const;
  const layers: PublicationVectorLayer[] = [];
  for (const [index, item] of value.entries()) {
    const path = `vectorLayers[${index}]`;
    const record = asRecord(item, path);
    if (typeof record.kind !== 'string' || !KINDS.includes(record.kind as (typeof KINDS)[number])) {
      fail(`${path}.kind must be one of ${KINDS.join(' | ')}`);
    }
    const opacity = asOpacity(record.opacity, `${path}.opacity`);
    // OD-4/P5.6: an annotation whose resolved opacity is exactly 0 is emitted as
    // nothing. Omission happens before geometry validation by design: a faded
    // annotation at the fade endpoint may legitimately resolve to an out-of-sheet
    // (invisible) point and must not block the export.
    if (opacity === 0) {
      continue;
    }
    const kind = record.kind as (typeof KINDS)[number];
    if (kind === 'text') {
      layers.push(readTextLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    } else if (kind === 'rect') {
      layers.push(readRectLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    } else if (kind === 'line') {
      layers.push(readLineLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    } else if (kind === 'ellipse') {
      layers.push(readEllipseLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    } else {
      layers.push(readPolygonLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    }
  }
  return Object.freeze(layers);
}
