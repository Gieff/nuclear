/**
 * @nuclear/figure-engine — hybrid vector PDF publication request (P5.7,
 * ADR-015 OD-6e/OD-6g, ADR-014 D5).
 *
 * `figure-engine` composes the portable request for a hybrid PDF: the medical
 * panel rasters stay rasters (image XObjects), while supplied text/vector
 * primitives stay native PDF primitives in Figure Sheet millimetres. It never
 * imports `pdf-lib`, never rasterizes the whole page and never owns a font.
 * The concrete writer is a composition-root adapter (OD-6d).
 *
 * Pure and Node-safe: no DOM, no WebGL, no encoder dependency.
 */

import type { FigureSheetId } from '@nuclear/shared-types';

import {
  assertPublicationCompositionPlan,
  type CompositionRasterLayer,
  type PublicationCompositionPlan,
} from './compose-sheet.js';
import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import { readPdfMetadata, readVectorLayers } from './pdf-document-validation.js';
import { isRecord } from './pdf-validation-primitives.js';
import type { SheetRectMm } from './layout.js';
import type { PixelDimensions } from './units.js';

export interface PdfTextLayer {
  readonly kind: 'text';
  readonly text: string;
  readonly originMm: readonly [number, number];
  readonly fontSizePt: number;
  readonly color: string;
  readonly opacity?: number;
}

export interface PdfRectLayer {
  readonly kind: 'rect';
  readonly rectMm: SheetRectMm;
  readonly fillColor?: string;
  readonly borderColor?: string;
  readonly borderWidthMm?: number;
  readonly opacity?: number;
}

export interface PdfLineLayer {
  readonly kind: 'line';
  readonly fromMm: readonly [number, number];
  readonly toMm: readonly [number, number];
  readonly strokeColor: string;
  readonly strokeWidthMm: number;
  readonly opacity?: number;
}

export type PublicationVectorLayer = PdfTextLayer | PdfRectLayer | PdfLineLayer;

export interface PublicationPdfMetadata {
  readonly title: string;
  readonly author: string;
  readonly subject: string;
  readonly keywords: readonly string[];
  readonly creator: string;
  readonly producer: string;
  readonly creationDate?: string;
  readonly modificationDate?: string;
}

/** The declarative hybrid-PDF request handed to the `EncoderPort`. */
export interface PublicationPdfRequest {
  readonly sheetId: FigureSheetId;
  readonly sheetSizeMm: readonly [number, number];
  readonly dpi: number;
  readonly pixelDimensions: PixelDimensions;
  readonly backgroundColor: string;
  readonly rasterLayers: readonly CompositionRasterLayer[];
  readonly vectorLayers: readonly PublicationVectorLayer[];
  readonly metadata: PublicationPdfMetadata;
}

/** Editorial inputs layered on top of the physical composition plan. */
export interface PublicationPdfEditorialInput {
  readonly vectorLayers?: readonly PublicationVectorLayer[];
  /** Fixed, declared provenance (no `Date.now()`; ADR-015 OD-6f). */
  readonly metadata: PublicationPdfMetadata;
}

/** Provenance marker: PDF user space is points at 72 pt/in, y-up. */
export const PDF_COORDINATE_SYSTEM = 'pdf-pt-72dpi-y-up';

function freezePair(value: readonly [number, number]): readonly [number, number] {
  return Object.freeze([value[0], value[1]] as [number, number]);
}

/**
 * Re-validates the composition plan fail-closed (no rasterization), validates
 * the editorial vectors and metadata, and returns a frozen hybrid-PDF request.
 * Never mutates its inputs; never invents editorial content.
 */
export function buildPublicationPdfRequest(
  plan: PublicationCompositionPlan,
  editorial: PublicationPdfEditorialInput,
): PublicationPdfRequest {
  if (!isRecord(plan)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      'publication composition plan must be a plain object',
    );
  }
  assertPublicationCompositionPlan(plan);

  if (!isRecord(editorial)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.pdfDocumentInvalid,
      'pdf editorial input must be a plain object',
    );
  }
  const rawVectors = (editorial as { vectorLayers?: unknown }).vectorLayers;
  const vectorLayers = readVectorLayers(rawVectors === undefined ? [] : rawVectors, plan.sheetSizeMm);
  const metadata = readPdfMetadata((editorial as { metadata?: unknown }).metadata);

  // `rasterLayers` is a frozen shallow copy of the plan's layers: the layer
  // containers and their RGBA `Uint8Array` buffers stay shared with the
  // immutably-produced plan (typed arrays with elements cannot be frozen, and
  // deep-copying megabyte rasters would double memory for no safety gain).
  return Object.freeze({
    sheetId: plan.sheetId,
    sheetSizeMm: freezePair(plan.sheetSizeMm),
    dpi: plan.dpi,
    pixelDimensions: freezePair(plan.pixelDimensions),
    backgroundColor: plan.backgroundColor,
    rasterLayers: Object.freeze([...plan.layers]),
    vectorLayers,
    metadata,
  });
}
