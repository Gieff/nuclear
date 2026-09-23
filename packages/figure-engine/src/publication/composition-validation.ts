/**
 * @nuclear/figure-engine — shared fail-closed physical validation for the
 * flattened sheet composition and the hybrid PDF request (P5.6/P5.7, ADR-015).
 *
 * Single source of truth for the plan/layer checks so the compositor and the
 * PDF builder cannot diverge: both use `assertValidCompositionPlan` /
 * `validateCompositionLayer`, which validate the plan and every raster layer
 * (shape, RGBA8 length, no-resampling at the plan DPI, sheet containment)
 * **without rasterizing**. Internal module: not re-exported from the barrel.
 * Pure and Node-safe: no DOM, no WebGL, no `node:zlib`.
 */

import type {
  CompositionRasterLayer,
  CompositionRectMm,
  PublicationCompositionPlan,
} from './compose-sheet.js';
import { FIGURE_PUBLICATION_ERROR_CODES } from './errors.js';
import { refuse } from './guards.js';
import { MM_PER_INCH, mmToPixels } from './units.js';

/** Validated pixel placement of a raster layer on the sheet. */
export interface LayerPlacement {
  readonly xPx: number;
  readonly yPx: number;
  readonly width: number;
  readonly height: number;
}

/** Validated physical plan geometry (no rasterization). */
export interface ValidatedPlan {
  readonly width: number;
  readonly height: number;
  readonly background: readonly [number, number, number];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function validatePlanShapes(plan: PublicationCompositionPlan): {
  width: number;
  height: number;
  background: readonly [number, number, number];
} {
  if (!isRecord(plan)) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      'composition plan must be a plain object',
    );
  }
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
 * Validates the plan geometry only (dpi, sheet mm/pixels, opaque background,
 * `layers` is an array). Kept separate so `composeSheetRgba` can obtain the
 * validated dimensions/background before compositing.
 */
export function validatePlan(plan: PublicationCompositionPlan): ValidatedPlan {
  return validatePlanShapes(plan);
}

/**
 * Validates one raster layer against the plan's physical geometry and returns
 * its pixel placement. Refuses `FIGURE_COMPOSITION_INVALID` for a malformed
 * layer/rect, a wrong RGBA8 length, a raster that would require resampling at
 * the plan DPI, or a layer that overflows the sheet. Never rasterizes, never
 * clamps.
 */
export function validateCompositionLayer(
  layer: CompositionRasterLayer,
  index: number,
  dpi: number,
  sheetWidth: number,
  sheetHeight: number,
): LayerPlacement {
  const path = `layers[${index}]`;
  if (!isRecord(layer)) {
    refuse(FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid, `${path} must be an object`);
  }
  const rectMm = validateRect(layer.rectMm, `${path}.rectMm`);
  const dims = (layer as { readonly pixelDimensions?: unknown }).pixelDimensions;
  const layerWidth = Array.isArray(dims) ? dims[0] : undefined;
  const layerHeight = Array.isArray(dims) ? dims[1] : undefined;
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
  const expected = mmToPixels([rectMm.widthMm, rectMm.heightMm], dpi);
  if (expected[0] !== layerWidth || expected[1] !== layerHeight) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} raster ${layerWidth}x${layerHeight} px must equal its ${rectMm.widthMm}x${rectMm.heightMm} mm destination at ${dpi} dpi (${expected[0]}x${expected[1]} px); resampling is refused`,
    );
  }
  const xPx = mmToPx(rectMm.xMm, dpi, `${path}.rectMm.xMm`);
  const yPx = mmToPx(rectMm.yMm, dpi, `${path}.rectMm.yMm`);
  if (xPx + layerWidth > sheetWidth || yPx + layerHeight > sheetHeight) {
    refuse(
      FIGURE_PUBLICATION_ERROR_CODES.compositionInvalid,
      `${path} at (${xPx}, ${yPx}) ${layerWidth}x${layerHeight} px overflows the ${sheetWidth}x${sheetHeight} px sheet`,
    );
  }
  return { xPx, yPx, width: layerWidth, height: layerHeight };
}

/**
 * Full fail-closed validation of a composition plan: the plan geometry plus
 * every raster layer (shape, RGBA8 length, no resampling, containment), with no
 * rasterization. This is the shared entry point the hybrid PDF builder uses so a
 * hand-built/mutated plan cannot smuggle a below-density raster into a
 * different exporter.
 */
export function assertValidCompositionPlan(plan: PublicationCompositionPlan): ValidatedPlan {
  const validated = validatePlan(plan);
  const layers = (plan as { layers: readonly CompositionRasterLayer[] }).layers;
  for (const [index, layer] of layers.entries()) {
    validateCompositionLayer(layer, index, plan.dpi, validated.width, validated.height);
  }
  return validated;
}
