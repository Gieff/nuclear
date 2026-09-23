/**
 * @nuclear/figure-engine — structural validation for the hybrid-PDF request
 * (P5.7). Internal module: not re-exported from the package barrel.
 *
 * Every rejection is a typed `FIGURE_PDF_DOCUMENT_INVALID`; malformed editorial
 * metadata or vector primitives must never surface as a bare `TypeError`.
 * Out-of-sheet vectors are refused fail-closed because the editorial overflow
 * policy (bleed/crop marks) is not yet ratified — nothing is clamped or moved.
 * Pure and Node-safe.
 */

import type {
  PdfLineLayer,
  PdfRectLayer,
  PdfTextLayer,
  PublicationPdfMetadata,
  PublicationVectorLayer,
} from './pdf-document.js';
import {
  asColor,
  asFinitePair,
  asIsoDate,
  asOpacity,
  asPositiveFinite,
  asRecord,
  asSheetRect,
  asText,
  fail,
  requirePointWithin,
  requireRectWithin,
} from './pdf-validation-primitives.js';

/** Validates the declared publication metadata (explicit, never defaulted). */
export function readPdfMetadata(value: unknown): PublicationPdfMetadata {
  const record = asRecord(value, 'metadata');
  const title = asText(record.title, 'metadata.title');
  const author = asText(record.author, 'metadata.author');
  const subject = asText(record.subject, 'metadata.subject');
  const creator = asText(record.creator, 'metadata.creator');
  const producer = asText(record.producer, 'metadata.producer');

  if (!Array.isArray(record.keywords)) {
    fail('metadata.keywords must be an array of strings (possibly empty)');
  }
  const keywords = record.keywords.map((keyword, index) => {
    if (typeof keyword !== 'string') {
      fail(`metadata.keywords[${index}] must be a string`);
    }
    return keyword;
  });
  const creationDate =
    record.creationDate === undefined
      ? undefined
      : asIsoDate(record.creationDate, 'metadata.creationDate');
  const modificationDate =
    record.modificationDate === undefined
      ? undefined
      : asIsoDate(record.modificationDate, 'metadata.modificationDate');

  return Object.freeze({
    title,
    author,
    subject,
    keywords: Object.freeze(keywords),
    creator,
    producer,
    ...(creationDate === undefined ? {} : { creationDate }),
    ...(modificationDate === undefined ? {} : { modificationDate }),
  });
}

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
  return Object.freeze({
    kind: 'text',
    text,
    originMm: Object.freeze(originMm),
    fontSizePt,
    color,
    ...(opacity === undefined ? {} : { opacity }),
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
  return Object.freeze({
    kind: 'rect',
    rectMm: Object.freeze({ ...rectMm }),
    ...(fillColor === undefined ? {} : { fillColor }),
    ...(borderColor === undefined ? {} : { borderColor }),
    ...(borderWidthMm === undefined ? {} : { borderWidthMm }),
    ...(opacity === undefined ? {} : { opacity }),
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
  return Object.freeze({
    kind: 'line',
    fromMm: Object.freeze(fromMm),
    toMm: Object.freeze(toMm),
    strokeColor,
    strokeWidthMm,
    ...(opacity === undefined ? {} : { opacity }),
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

  const layers: PublicationVectorLayer[] = [];
  for (const [index, item] of value.entries()) {
    const path = `vectorLayers[${index}]`;
    const record = asRecord(item, path);
    if (typeof record.kind !== 'string' || !['text', 'rect', 'line'].includes(record.kind)) {
      fail(`${path}.kind must be 'text' | 'rect' | 'line'`);
    }
    const opacity = asOpacity(record.opacity, `${path}.opacity`);
    // OD-4/P5.6: an annotation whose resolved opacity is exactly 0 is emitted as
    // nothing. Omission happens before geometry validation by design: a faded
    // annotation at the fade endpoint may legitimately resolve to an out-of-sheet
    // (invisible) point and must not block the export.
    if (opacity === 0) {
      continue;
    }
    const kind = record.kind as 'text' | 'rect' | 'line';
    if (kind === 'text') {
      layers.push(readTextLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    } else if (kind === 'rect') {
      layers.push(readRectLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    } else {
      layers.push(readLineLayer(record, path, opacity, sheetWidthMm, sheetHeightMm));
    }
  }
  return Object.freeze(layers);
}
