/**
 * @nuclear/figure-engine — pure flattened sheet compositor (P5.6, ADR-015).
 *
 * Places raster panel layers at their physical sheet rectangles and produces one
 * flattened RGBA8 sheet raster, ready for the `EncoderPort` (PNG/TIFF). Pure and
 * Node-safe: no DOM, no WebGL, no `node:zlib`. The compositor **never resamples**
 * a layer: a raster whose pixel dimensions differ from its physical destination
 * at the plan DPI is refused (ADR-015, no upscale).
 *
 * Editorial vector/text rasterization into this raster is a follow-up sub-slice;
 * this v1 composites raster layers over a background.
 */

import type { FigurePanelId, FigureSheetId } from '@nuclear/shared-types';

import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import { MM_PER_INCH, mmToPixels, type PixelDimensions } from './units.js';

export interface CompositionRectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** One raster panel placed on the sheet at a physical rectangle. */
export interface CompositionRasterLayer {
  readonly panelId: FigurePanelId;
  readonly rectMm: CompositionRectMm;
  readonly pixelDimensions: PixelDimensions;
  /** Row-major RGBA8 bytes; length must equal `width * height * 4`. */
  readonly rgba: Uint8Array;
}

export interface PublicationCompositionPlan {
  readonly sheetId: FigureSheetId;
  readonly sheetSizeMm: readonly [number, number];
  readonly dpi: number;
  /** Sheet raster dimensions; must equal `sheetSizeMm` at `dpi`. */
  readonly pixelDimensions: PixelDimensions;
  /** Opaque background, `#rrggbb`. */
  readonly backgroundColor: string;
  readonly layers: readonly CompositionRasterLayer[];
}

export interface PublicationSheetRaster {
  readonly pixelDimensions: PixelDimensions;
  readonly rgba: Uint8Array;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Scalar millimetres to pixels, half-up, accepting a non-negative position. */
function mmToPx(mm: number, dpi: number, path: string): number {
  if (!isFiniteNumber(mm) || mm < 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} ${String(mm)} mm must be finite and ≥ 0`,
    );
  }
  const value = (mm / MM_PER_INCH) * dpi;
  if (!Number.isFinite(value)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} ${String(mm)} mm at ${dpi} dpi overflows the pixel range; refusing instead of silently dropping the layer`,
    );
  }
  const base = value - (value % 1);
  const rounded = value % 1 >= 0.5 ? base + 1 : base;
  if (!Number.isSafeInteger(rounded) || rounded < 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} ${String(mm)} mm at ${dpi} dpi does not map to a safe pixel coordinate`,
    );
  }
  return rounded;
}

function validateRect(rect: unknown, path: string): CompositionRectMm {
  if (typeof rect !== 'object' || rect === null || Array.isArray(rect)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, `${path} must be an object`);
  }
  const record = rect as Record<string, unknown>;
  const values = [record.xMm, record.yMm, record.widthMm, record.heightMm];
  if (!values.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} must carry finite millimetre numbers (xMm, yMm, widthMm, heightMm)`,
    );
  }
  const [xMm, yMm, widthMm, heightMm] = values as number[];
  if (xMm < 0 || yMm < 0) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, `${path} origin must be ≥ 0 mm`);
  }
  if (widthMm <= 0 || heightMm <= 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} size must be strictly positive millimetres`,
    );
  }
  return { xMm, yMm, widthMm, heightMm };
}

function parseBackground(color: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match === null) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `backgroundColor '${color}' must be an opaque #rrggbb hex colour`,
    );
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function validatePlan(plan: PublicationCompositionPlan): {
  width: number;
  height: number;
  background: readonly [number, number, number];
} {
  if (!isFiniteNumber(plan.dpi) || plan.dpi <= 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `composition dpi ${String(plan.dpi)} must be finite and strictly positive`,
    );
  }
  if (!Array.isArray(plan.sheetSizeMm) || plan.sheetSizeMm.length !== 2) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      'sheetSizeMm must be a pair of millimetres [width, height]',
    );
  }
  const [widthMm, heightMm] = plan.sheetSizeMm as readonly [number, number];
  if (!isFiniteNumber(widthMm) || !isFiniteNumber(heightMm) || widthMm <= 0 || heightMm <= 0) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `sheet size [${String(widthMm)}, ${String(heightMm)}] mm must be finite and strictly positive`,
    );
  }
  const expected = mmToPixels([widthMm, heightMm], plan.dpi);
  if (!Array.isArray(plan.pixelDimensions) || plan.pixelDimensions.length !== 2) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, 'sheet raster dimensions must be a pair');
  }
  const [width, height] = plan.pixelDimensions as readonly [number, number];
  if (!isPositiveInteger(width) || !isPositiveInteger(height) || width !== expected[0] || height !== expected[1]) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `sheet raster ${String(width)}x${String(height)} px must equal the physical sheet at ${plan.dpi} dpi (${expected[0]}x${expected[1]} px)`,
    );
  }
  if (!Array.isArray(plan.layers)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, 'composition layers must be an array');
  }
  return { width, height, background: parseBackground(plan.backgroundColor) };
}

/**
 * Flattens the plan into one RGBA8 sheet raster. Refuses
 * `FIGURE_COMPOSITION_INVALID` for an inconsistent plan or a layer that does not
 * fit, is not a valid RGBA buffer, or would require resampling.
 */
export function composeSheetRgba(plan: PublicationCompositionPlan): PublicationSheetRaster {
  const { width, height, background } = validatePlan(plan);
  const sheet = new Uint8Array(width * height * 4);
  const [backgroundR, backgroundG, backgroundB] = background;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    sheet[offset] = backgroundR;
    sheet[offset + 1] = backgroundG;
    sheet[offset + 2] = backgroundB;
    sheet[offset + 3] = 255;
  }

  for (const [layerIndex, layer] of plan.layers.entries()) {
    const path = `layers[${layerIndex}]`;
    const rectMm = validateRect(layer.rectMm, `${path}.rectMm`);
    const [layerWidth, layerHeight] = layer.pixelDimensions;
    if (
      !isPositiveInteger(layerWidth) ||
      !isPositiveInteger(layerHeight) ||
      !(layer.rgba instanceof Uint8Array) ||
      layer.rgba.length !== layerWidth * layerHeight * 4
    ) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
        `${path} must carry ${String(layerWidth)}x${String(layerHeight)} RGBA8 bytes (${layerWidth * layerHeight * 4})`,
      );
    }
    const expected = mmToPixels([rectMm.widthMm, rectMm.heightMm], plan.dpi);
    if (expected[0] !== layerWidth || expected[1] !== layerHeight) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
        `${path} raster ${layerWidth}x${layerHeight} px must equal its ${rectMm.widthMm}x${rectMm.heightMm} mm destination at ${plan.dpi} dpi (${expected[0]}x${expected[1]} px); resampling is refused`,
      );
    }
    const xPx = mmToPx(rectMm.xMm, plan.dpi, `${path}.rectMm.xMm`);
    const yPx = mmToPx(rectMm.yMm, plan.dpi, `${path}.rectMm.yMm`);
    if (xPx + layerWidth > width || yPx + layerHeight > height) {
      refuse(
        FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
        `${path} at (${xPx}, ${yPx}) ${layerWidth}x${layerHeight} px overflows the ${width}x${height} px sheet`,
      );
    }

    for (let row = 0; row < layerHeight; row += 1) {
      for (let column = 0; column < layerWidth; column += 1) {
        const source = (row * layerWidth + column) * 4;
        const destination = ((yPx + row) * width + (xPx + column)) * 4;
        const alpha = layer.rgba[source + 3];
        if (alpha === 0) {
          continue;
        }
        if (alpha === 255) {
          sheet[destination] = layer.rgba[source];
          sheet[destination + 1] = layer.rgba[source + 1];
          sheet[destination + 2] = layer.rgba[source + 2];
          sheet[destination + 3] = 255;
          continue;
        }
        const inverse = 255 - alpha;
        sheet[destination] = Math.round((layer.rgba[source] * alpha + sheet[destination] * inverse) / 255);
        sheet[destination + 1] = Math.round((layer.rgba[source + 1] * alpha + sheet[destination + 1] * inverse) / 255);
        sheet[destination + 2] = Math.round((layer.rgba[source + 2] * alpha + sheet[destination + 2] * inverse) / 255);
        sheet[destination + 3] = 255;
      }
    }
  }

  return { pixelDimensions: [width, height], rgba: sheet };
}
